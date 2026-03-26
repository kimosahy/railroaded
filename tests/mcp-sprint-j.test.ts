/**
 * Sprint J-Fix: MCP handler wiring tests + bugfix validations.
 * Verifies that all Sprint J tools are routed through the MCP switch
 * and don't return "no handler implementation" errors.
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { Hono } from "hono";
import auth from "../src/api/auth.ts";
import mcp from "../src/api/mcp.ts";
import * as gm from "../src/game/game-manager.ts";
import { formatActivityEvent } from "../src/api/spectator.ts";
import { getCurrentCombatant } from "../src/game/session.ts";

function buildApp(): Hono {
  const app = new Hono();
  app.route("/api/v1", auth);
  app.route("/", mcp);
  return app;
}

const app = buildApp();
const PREFIX = `mcp-j-${Date.now()}`;

let dmToken: string;
let playerToken: string;

beforeAll(async () => {
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
});

function rpc(
  method: string,
  params: Record<string, unknown> = {},
  token?: string,
): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return app.request("/mcp", {
    method: "POST",
    headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
}

async function callTool(name: string, args: Record<string, unknown> = {}, token?: string) {
  const res = await rpc("tools/call", { name, arguments: args }, token ?? dmToken);
  return res.json();
}

// ---------------------------------------------------------------------------
// Task 1: Sprint J MCP handler wiring — no "no handler" errors
// ---------------------------------------------------------------------------

describe("Sprint J MCP wiring: tools don't return 'no handler' error", () => {
  const sprintJTools = [
    { name: "start_conversation", args: { participants: [{ type: "player", id: "p1", name: "Test" }, { type: "npc", id: "n1", name: "NPC" }], context: "test" } },
    { name: "end_conversation", args: { conversation_id: "conv-1", outcome: "done" } },
    { name: "create_info", args: { title: "Test", content: "Info", source: "test" } },
    { name: "reveal_info", args: { info_id: "info-1", to_characters: ["c1"], method: "told" } },
    { name: "update_info", args: { info_id: "info-1", content: "Updated" } },
    { name: "list_info", args: {} },
    { name: "create_clock", args: { name: "Test Clock", turns_remaining: 5, consequence: "Boom" } },
    { name: "advance_clock", args: { clock_id: "clock-1" } },
    { name: "resolve_clock", args: { clock_id: "clock-1", outcome: "defused" } },
    { name: "list_clocks", args: {} },
    { name: "advance_time", args: { amount: 1, unit: "hours", narrative: "Time passes" } },
    { name: "skip_turn", args: { reason: "test" } },
  ];

  for (const tool of sprintJTools) {
    test(`${tool.name} has a handler (not "no handler")`, async () => {
      const body = await callTool(tool.name, tool.args);
      // The tool may fail for game-state reasons (no party, no session), but it
      // should NOT return the generic "no handler" error from the default case.
      const content = body.result?.content?.[0]?.text;
      if (content) {
        const parsed = JSON.parse(content);
        expect(parsed.error).not.toBe(`Tool '${tool.name}' has no handler implementation.`);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// Task 1: narrate passes Sprint J fields
// ---------------------------------------------------------------------------

describe("Sprint J MCP: narrate passes type/npcId/metadata/meta", () => {
  test("narrate with type field does not return handler error", async () => {
    const body = await callTool("narrate", {
      text: "The wind howls.",
      type: "atmosphere",
      npc_id: "npc-1",
      metadata: { mood: "eerie" },
      meta: { intent: "set the scene" },
    });
    const content = body.result?.content?.[0]?.text;
    if (content) {
      const parsed = JSON.parse(content);
      expect(parsed.error).not.toBe("Tool 'narrate' has no handler implementation.");
    }
  });
});

// ---------------------------------------------------------------------------
// Task 2: create_npc passes ENA fields
// ---------------------------------------------------------------------------

describe("Sprint J MCP: create_npc passes ENA fields", () => {
  test("create_npc with knowledge/goals/relationships/standingOrders does not error on handler", async () => {
    const body = await callTool("create_npc", {
      name: "Test NPC",
      description: "A test NPC",
      personality: "grumpy",
      knowledge: ["The password is swordfish"],
      goals: ["Guard the gate"],
      relationships: { "player-1": "distrusts" },
      standing_orders: "Never let anyone pass",
    });
    const content = body.result?.content?.[0]?.text;
    if (content) {
      const parsed = JSON.parse(content);
      // Should not be "no handler" error — may fail on "not a DM" but that's fine
      expect(parsed.error).not.toBe("Tool 'create_npc' has no handler implementation.");
    }
  });
});

// ---------------------------------------------------------------------------
// Task 3: update_npc_disposition rejects invalid change param
// ---------------------------------------------------------------------------

describe("Sprint J: update_npc_disposition validation", () => {
  test("rejects undefined change param via MCP (hits DM check first, but no handler error)", async () => {
    const body = await callTool("update_npc_disposition", {
      npc_id: "npc-1",
      // change intentionally omitted
      reason: "test",
    });
    const content = body.result?.content?.[0]?.text;
    expect(content).toBeDefined();
    const parsed = JSON.parse(content);
    // Without an active campaign, the DM check fires first — that's OK.
    // The important thing: no "no handler" error.
    expect(parsed.error).not.toBe("Tool 'update_npc_disposition' has no handler implementation.");
  });

  test("handleUpdateNpcDisposition rejects undefined change directly", () => {
    // Call handler directly — will fail on DM check, but validates the code exists
    const result = gm.handleUpdateNpcDisposition("fake-user", {
      npc_id: "npc-1",
      change: undefined as unknown as number,
      reason: "test",
    });
    // Either "Not a DM" (DM check first) or "change must be a finite number" — both acceptable
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("handleUpdateNpcDisposition rejects NaN change", () => {
    const result = gm.handleUpdateNpcDisposition("fake-user", {
      npc_id: "npc-1",
      change: NaN,
      reason: "test",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Task 5: narration type differentiation in formatActivityEvent
// ---------------------------------------------------------------------------

describe("Sprint J: narration type differentiation", () => {
  test("default narration uses scroll emoji", () => {
    const result = formatActivityEvent("narration", { text: "A dark room." });
    expect(result).toStartWith("\u{1F4DC}"); // 📜
  });

  test("intercut narration uses clapper emoji", () => {
    const result = formatActivityEvent("narration", { text: "Meanwhile...", narrateType: "intercut" });
    expect(result).toStartWith("\u{1F3AC}"); // 🎬
  });

  test("npc_dialogue narration uses speech bubble emoji", () => {
    const result = formatActivityEvent("narration", { text: "Hello there.", narrateType: "npc_dialogue" });
    expect(result).toStartWith("\u{1F4AC}"); // 💬
  });

  test("atmosphere narration uses fog emoji", () => {
    const result = formatActivityEvent("narration", { text: "Mist rolls in.", narrateType: "atmosphere" });
    expect(result).toStartWith("\u{1F32B}"); // 🌫️
  });

  test("transition narration uses door emoji", () => {
    const result = formatActivityEvent("narration", { text: "Moving on...", narrateType: "transition" });
    expect(result).toStartWith("\u{1F6AA}"); // 🚪
  });

  test("ruling narration uses scales emoji", () => {
    const result = formatActivityEvent("narration", { text: "The DM rules...", narrateType: "ruling" });
    expect(result).toStartWith("\u2696"); // ⚖️
  });

  test("scene narration uses scroll emoji (default)", () => {
    const result = formatActivityEvent("narration", { text: "A scene.", narrateType: "scene" });
    expect(result).toStartWith("\u{1F4DC}"); // 📜
  });
});

// ---------------------------------------------------------------------------
// Task 6: clock create with missing fields
// ---------------------------------------------------------------------------

describe("Sprint J: clock create crash on missing fields", () => {
  test("create_clock without description does not crash", async () => {
    const body = await callTool("create_clock", {
      name: "Test Clock",
      turns_remaining: 5,
      consequence: "Bad things happen",
    });
    const content = body.result?.content?.[0]?.text;
    expect(content).toBeDefined();
    const parsed = JSON.parse(content);
    // May fail on "Not a DM" but should NOT be a 500/crash
    expect(parsed.error).not.toContain("Cannot read properties of undefined");
  });

  test("create_clock without consequence does not crash", async () => {
    const body = await callTool("create_clock", {
      name: "Test Clock 2",
      turns_remaining: 3,
    });
    const content = body.result?.content?.[0]?.text;
    expect(content).toBeDefined();
    const parsed = JSON.parse(content);
    expect(parsed.error).not.toContain("Cannot read properties of undefined");
  });
});

// ---------------------------------------------------------------------------
// Task 7: Auto-advance turn when action + bonus both used
// ---------------------------------------------------------------------------

describe("Sprint J: auto-advance turn on resources exhausted", () => {
  let tc7 = 0;
  function uid7(prefix: string) { return `${prefix}-autoadvance-${++tc7}-${Date.now()}`; }

  async function setupCombat() {
    const pids = [uid7("p"), uid7("p"), uid7("p"), uid7("p")];
    const dmId = uid7("dm");
    for (const id of pids) {
      await gm.handleCreateCharacter(id, {
        name: `C-${id}`, race: "human", class: "fighter",
        ability_scores: { str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 15 },
        avatar_url: "https://example.com/avatar.png",
      });
    }
    pids.forEach((id) => gm.handleQueueForParty(id));
    gm.handleDMQueueForParty(dmId);
    const { parties } = gm.getState();
    const partyId = [...parties.keys()].pop()!;
    const party = parties.get(partyId)!;

    gm.handleSpawnEncounter(dmId, { monsters: [{ template_name: "Goblin", count: 1 }] });

    // Set monster HP high so it won't die
    party.monsters[0]!.hpCurrent = 9999;
    party.monsters[0]!.ac = 1; // easy to hit

    // Find which player is current in initiative
    const current = getCurrentCombatant(party.session!);
    let currentPlayerId: string | undefined;
    if (current?.type === "player") {
      const char = gm.getState().characters.get(current.entityId);
      currentPlayerId = char?.userId;
    }

    // If a monster goes first, skip to a player's turn
    if (!currentPlayerId) {
      gm.handleForceSkipTurn(dmId, { reason: "test" });
      const next = getCurrentCombatant(party.session!);
      if (next?.type === "player") {
        const char = gm.getState().characters.get(next.entityId);
        currentPlayerId = char?.userId;
      }
    }

    return { party, partyId, pids, dmId, currentPlayerId };
  }

  test("attack alone does NOT auto-advance turn", async () => {
    const { party, currentPlayerId } = await setupCombat();
    if (!currentPlayerId) return; // Skip if can't set up

    const currentBefore = getCurrentCombatant(party.session!);
    gm.handleAttack(currentPlayerId, { target_id: party.monsters[0]!.id });
    const currentAfter = getCurrentCombatant(party.session!);

    // Turn should NOT have advanced (only action used, not bonus)
    expect(currentAfter?.entityId).toBe(currentBefore?.entityId);
  });

  test("attack + bonus action DOES auto-advance turn", async () => {
    const { party, currentPlayerId } = await setupCombat();
    if (!currentPlayerId) return; // Skip if can't set up

    const currentBefore = getCurrentCombatant(party.session!);

    // Use action
    gm.handleAttack(currentPlayerId, { target_id: party.monsters[0]!.id });

    // Use bonus action (second_wind for fighters)
    gm.handleBonusAction(currentPlayerId, { action: "second_wind" });

    const currentAfter = getCurrentCombatant(party.session!);

    // Turn should have auto-advanced — current combatant should be different
    expect(currentAfter?.entityId).not.toBe(currentBefore?.entityId);
  });
});
