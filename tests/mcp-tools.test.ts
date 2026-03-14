/**
 * FT011: MCP tools/list returns all player and DM tools with JSON schemas.
 *
 * Verifies that:
 *   - tools/list returns the full player tool set for player-role users
 *   - tools/list returns the full DM tool set for DM-role users
 *   - Every tool has name, description, and inputSchema
 *   - tools/list requires authentication
 *   - tools/call routes to handlers correctly
 *   - tools/call rejects unknown tools
 *   - tools/call enforces role-based access
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import auth from "../src/api/auth.ts";
import mcp from "../src/api/mcp.ts";
import { playerTools } from "../src/tools/player-tools.ts";
import { dmTools } from "../src/tools/dm-tools.ts";

// ---------------------------------------------------------------------------
// Test app setup
// ---------------------------------------------------------------------------

function buildApp(): Hono {
  const app = new Hono();
  app.route("/api/v1", auth);
  app.route("/", mcp);
  return app;
}

const app = buildApp();

// Unique prefix to avoid collisions with other test runs
const PREFIX = `mcp-tools-${Date.now()}`;

let playerToken: string;
let dmToken: string;

beforeAll(async () => {
  // Register + login a player
  const pReg = await app.request("/api/v1/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: `${PREFIX}-player`, role: "player" }),
  });
  const pRegBody = await pReg.json();

  const pLogin = await app.request("/api/v1/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: `${PREFIX}-player`, password: pRegBody.password }),
  });
  const pLoginBody = await pLogin.json();
  playerToken = pLoginBody.token;

  // Register + login a DM
  const dReg = await app.request("/api/v1/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: `${PREFIX}-dm`, role: "dm" }),
  });
  const dRegBody = await dReg.json();

  const dLogin = await app.request("/api/v1/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: `${PREFIX}-dm`, password: dRegBody.password }),
  });
  const dLoginBody = await dLogin.json();
  dmToken = dLoginBody.token;
});

// ---------------------------------------------------------------------------
// Helper: send a JSON-RPC request to POST /mcp
// ---------------------------------------------------------------------------

function rpc(
  method: string,
  params: Record<string, unknown> = {},
  token?: string
): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  return app.request("/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

// ---------------------------------------------------------------------------
// tools/list — authentication
// ---------------------------------------------------------------------------

describe("FT011: MCP tools/list — authentication", () => {
  test("tools/list without auth returns error", async () => {
    const res = await rpc("tools/list");
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe(-32600); // INVALID_REQUEST
    expect(body.error.message).toContain("Authentication required");
  });

  test("tools/list with invalid token returns error", async () => {
    const res = await rpc("tools/list", {}, "invalid-token-xyz");
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe(-32600);
  });
});

// ---------------------------------------------------------------------------
// tools/list — player role
// ---------------------------------------------------------------------------

describe("FT011: MCP tools/list — player role", () => {
  test("returns non-empty tools array for player", async () => {
    const res = await rpc("tools/list", {}, playerToken);
    const body = await res.json();
    expect(body.result).toBeDefined();
    expect(body.result.tools).toBeDefined();
    expect(Array.isArray(body.result.tools)).toBe(true);
    expect(body.result.tools.length).toBeGreaterThan(0);
  });

  test("returns exactly the same count as playerTools", async () => {
    const res = await rpc("tools/list", {}, playerToken);
    const body = await res.json();
    expect(body.result.tools.length).toBe(playerTools.length);
  });

  test("every player tool has name, description, and inputSchema", async () => {
    const res = await rpc("tools/list", {}, playerToken);
    const body = await res.json();
    for (const tool of body.result.tools) {
      expect(typeof tool.name).toBe("string");
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe("string");
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.properties).toBeDefined();
    }
  });

  test("includes known player tools by name", async () => {
    const res = await rpc("tools/list", {}, playerToken);
    const body = await res.json();
    const names = body.result.tools.map((t: { name: string }) => t.name);

    // Spot-check key player tools
    expect(names).toContain("create_character");
    expect(names).toContain("look");
    expect(names).toContain("attack");
    expect(names).toContain("cast");
    expect(names).toContain("get_status");
    expect(names).toContain("party_chat");
    expect(names).toContain("move");
    expect(names).toContain("end_turn");
    expect(names).toContain("death_save");
    expect(names).toContain("pickup_item");
    expect(names).toContain("equip_item");
    expect(names).toContain("queue_for_party");
  });

  test("does NOT include DM-only tools for player role", async () => {
    const res = await rpc("tools/list", {}, playerToken);
    const body = await res.json();
    const names = body.result.tools.map((t: { name: string }) => t.name);

    expect(names).not.toContain("narrate");
    expect(names).not.toContain("spawn_encounter");
    expect(names).not.toContain("monster_attack");
    expect(names).not.toContain("award_xp");
    expect(names).not.toContain("end_session");
  });

  test("create_character tool has correct required fields in schema", async () => {
    const res = await rpc("tools/list", {}, playerToken);
    const body = await res.json();
    const createChar = body.result.tools.find(
      (t: { name: string }) => t.name === "create_character"
    );
    expect(createChar).toBeDefined();
    expect(createChar.inputSchema.required).toContain("name");
    expect(createChar.inputSchema.required).toContain("race");
    expect(createChar.inputSchema.required).toContain("class");
    expect(createChar.inputSchema.required).toContain("ability_scores");
  });
});

// ---------------------------------------------------------------------------
// tools/list — DM role
// ---------------------------------------------------------------------------

describe("FT011: MCP tools/list — DM role", () => {
  test("returns non-empty tools array for DM", async () => {
    const res = await rpc("tools/list", {}, dmToken);
    const body = await res.json();
    expect(body.result).toBeDefined();
    expect(body.result.tools).toBeDefined();
    expect(Array.isArray(body.result.tools)).toBe(true);
    expect(body.result.tools.length).toBeGreaterThan(0);
  });

  test("returns exactly the same count as dmTools", async () => {
    const res = await rpc("tools/list", {}, dmToken);
    const body = await res.json();
    expect(body.result.tools.length).toBe(dmTools.length);
  });

  test("every DM tool has name, description, and inputSchema", async () => {
    const res = await rpc("tools/list", {}, dmToken);
    const body = await res.json();
    for (const tool of body.result.tools) {
      expect(typeof tool.name).toBe("string");
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe("string");
      expect(tool.description.length).toBeGreaterThan(0);
      expect(tool.inputSchema).toBeDefined();
      expect(tool.inputSchema.type).toBe("object");
      expect(tool.inputSchema.properties).toBeDefined();
    }
  });

  test("includes known DM tools by name", async () => {
    const res = await rpc("tools/list", {}, dmToken);
    const body = await res.json();
    const names = body.result.tools.map((t: { name: string }) => t.name);

    expect(names).toContain("narrate");
    expect(names).toContain("spawn_encounter");
    expect(names).toContain("monster_attack");
    expect(names).toContain("request_check");
    expect(names).toContain("advance_scene");
    expect(names).toContain("award_xp");
    expect(names).toContain("end_session");
    expect(names).toContain("create_custom_monster");
    expect(names).toContain("create_campaign");
    expect(names).toContain("create_npc");
    expect(names).toContain("add_quest");
  });

  test("does NOT include player-only tools for DM role", async () => {
    const res = await rpc("tools/list", {}, dmToken);
    const body = await res.json();
    const names = body.result.tools.map((t: { name: string }) => t.name);

    expect(names).not.toContain("create_character");
    expect(names).not.toContain("attack");
    expect(names).not.toContain("cast");
    expect(names).not.toContain("dodge");
    expect(names).not.toContain("queue_for_party");
  });

  test("spawn_encounter tool has monsters as required array", async () => {
    const res = await rpc("tools/list", {}, dmToken);
    const body = await res.json();
    const spawn = body.result.tools.find(
      (t: { name: string }) => t.name === "spawn_encounter"
    );
    expect(spawn).toBeDefined();
    expect(spawn.inputSchema.required).toContain("monsters");
    expect(spawn.inputSchema.properties.monsters.type).toBe("array");
  });
});

// ---------------------------------------------------------------------------
// tools/call — error cases
// ---------------------------------------------------------------------------

describe("FT011: MCP tools/call — error handling", () => {
  test("tools/call without auth returns error", async () => {
    const res = await rpc("tools/call", { name: "look", arguments: {} });
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe(-32600);
  });

  test("tools/call with unknown tool name returns error", async () => {
    const res = await rpc("tools/call", { name: "nonexistent_tool", arguments: {} }, playerToken);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.message).toContain("Unknown tool");
  });

  test("tools/call without tool name returns error", async () => {
    const res = await rpc("tools/call", { arguments: {} }, playerToken);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.message).toContain("params.name");
  });

  test("player cannot call DM-only tool", async () => {
    const res = await rpc("tools/call", { name: "narrate", arguments: { text: "hello" } }, playerToken);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.message).toContain("only available to DM");
  });

  test("DM cannot call player-only tool", async () => {
    const res = await rpc("tools/call", { name: "attack", arguments: { target_id: "monster-1" } }, dmToken);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.message).toContain("only available to player");
  });
});

// ---------------------------------------------------------------------------
// tools/list — schema completeness (all tools from source are represented)
// ---------------------------------------------------------------------------

describe("FT011: MCP tools/list — schema completeness", () => {
  test("all playerTools names appear in MCP tools/list", async () => {
    const res = await rpc("tools/list", {}, playerToken);
    const body = await res.json();
    const mcpNames = new Set(body.result.tools.map((t: { name: string }) => t.name));

    for (const tool of playerTools) {
      expect(mcpNames.has(tool.name)).toBe(true);
    }
  });

  test("all dmTools names appear in MCP tools/list", async () => {
    const res = await rpc("tools/list", {}, dmToken);
    const body = await res.json();
    const mcpNames = new Set(body.result.tools.map((t: { name: string }) => t.name));

    for (const tool of dmTools) {
      expect(mcpNames.has(tool.name)).toBe(true);
    }
  });

  test("no tool has handler field leaked into MCP response", async () => {
    const res = await rpc("tools/list", {}, playerToken);
    const body = await res.json();
    for (const tool of body.result.tools) {
      expect(tool.handler).toBeUndefined();
    }
  });

  test("MCP response follows JSON-RPC 2.0 format", async () => {
    const res = await rpc("tools/list", {}, playerToken);
    const body = await res.json();
    expect(body.jsonrpc).toBe("2.0");
    expect(body.id).toBe(1);
    expect(body.result).toBeDefined();
    expect(body.error).toBeUndefined();
  });
});
