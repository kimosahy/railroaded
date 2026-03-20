/**
 * Reference CLI client for Railroaded.
 *
 * Supports all three transports: REST, MCP, and WebSocket.
 * Primarily used for testing and as a reference for agent builders.
 *
 * Usage:
 *   bun run src/client.ts --server http://localhost:3000
 */

const SERVER = process.env.QUEST_SERVER || "http://localhost:3000";

interface ClientState {
  token: string | null;
  userId: string | null;
  role: string | null;
}

const state: ClientState = {
  token: null,
  userId: null,
  role: null,
};

// --- HTTP helpers ---

async function post(path: string, body: Record<string, unknown>): Promise<unknown> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (state.token) headers["Authorization"] = `Bearer ${state.token}`;

  const res = await fetch(`${SERVER}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  return res.json();
}

async function get(path: string): Promise<unknown> {
  const headers: Record<string, string> = {};
  if (state.token) headers["Authorization"] = `Bearer ${state.token}`;

  const res = await fetch(`${SERVER}${path}`, { headers });
  return res.json();
}

// --- MCP transport ---

async function mcpCall(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (state.token) headers["Authorization"] = `Bearer ${state.token}`;

  const res = await fetch(`${SERVER}/mcp`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
  });

  const data = (await res.json()) as { result?: unknown; error?: { message: string } };
  if (data.error) {
    throw new Error(`MCP error: ${data.error.message}`);
  }
  return data.result;
}

// --- Auth ---

async function register(username: string, role: "player" | "dm"): Promise<string> {
  const result = (await post("/register", { username, role })) as {
    id?: string;
    password?: string;
    error?: string;
  };
  if (result.error) throw new Error(result.error);
  console.log(`Registered as ${username} (${role}). Password: ${result.password}`);
  return result.password!;
}

async function login(username: string, password: string): Promise<void> {
  const result = (await post("/login", { username, password })) as {
    token?: string;
    userId?: string;
    role?: string;
    error?: string;
  };
  if (result.error) throw new Error(result.error);
  state.token = result.token!;
  state.userId = result.userId!;
  state.role = result.role!;
  console.log(`Logged in as ${username} (${result.role}). Token: ${result.token!.slice(0, 8)}...`);
}

// --- Player actions (REST) ---

async function createCharacter(params: {
  name: string;
  race: string;
  class: string;
  ability_scores: Record<string, number>;
  backstory?: string;
  personality?: string;
  playstyle?: string;
}): Promise<unknown> {
  return post("/api/v1/character", params);
}

async function look(): Promise<unknown> {
  return get("/api/v1/look");
}

async function attack(targetId: string, weapon?: string): Promise<unknown> {
  return post("/api/v1/attack", { target_id: targetId, weapon });
}

async function cast(spellName: string, targetId?: string): Promise<unknown> {
  return post("/api/v1/cast", { spell_name: spellName, target_id: targetId });
}

async function getStatus(): Promise<unknown> {
  return get("/api/v1/status");
}

async function getParty(): Promise<unknown> {
  return get("/api/v1/party");
}

async function getActions(): Promise<unknown> {
  return get("/api/v1/actions");
}

async function queueForParty(): Promise<unknown> {
  return post("/api/v1/queue", {});
}

async function partyChat(message: string): Promise<unknown> {
  return post("/api/v1/chat", { message });
}

async function shortRest(): Promise<unknown> {
  return post("/api/v1/short-rest", {});
}

// --- DM actions (REST) ---

async function narrate(text: string): Promise<unknown> {
  return post("/api/v1/dm/narrate", { text });
}

async function spawnEncounter(
  monsters: { template_name: string; count: number }[]
): Promise<unknown> {
  return post("/api/v1/dm/spawn-encounter", { monsters });
}

async function getPartyState(): Promise<unknown> {
  return get("/api/v1/dm/party-state");
}

async function getRoomState(): Promise<unknown> {
  return get("/api/v1/dm/room-state");
}

async function awardXp(amount: number): Promise<unknown> {
  return post("/api/v1/dm/award-xp", { amount });
}

async function endSession(summary: string): Promise<unknown> {
  return post("/api/v1/dm/end-session", { summary });
}

// --- MCP tool calling ---

async function mcpListTools(): Promise<unknown> {
  return mcpCall("tools/list");
}

async function mcpCallTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  return mcpCall("tools/call", { name, arguments: args });
}

// --- CLI ---

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case "health":
        console.log(await get("/health"));
        break;

      case "register": {
        const username = args[1] || "test-player";
        const role = (args[2] || "player") as "player" | "dm";
        await register(username, role);
        break;
      }

      case "login": {
        const username = args[1]!;
        const password = args[2]!;
        await login(username, password);
        break;
      }

      case "mcp-init":
        console.log(JSON.stringify(await mcpCall("initialize"), null, 2));
        break;

      case "mcp-tools":
        console.log(JSON.stringify(await mcpListTools(), null, 2));
        break;

      case "mcp-call": {
        const toolName = args[1]!;
        const toolArgs = args[2] ? JSON.parse(args[2]) as Record<string, unknown> : {};
        console.log(JSON.stringify(await mcpCallTool(toolName, toolArgs), null, 2));
        break;
      }

      default:
        console.log(`Railroaded Reference Client

Usage:
  bun run src/client.ts <command> [args]

Commands:
  health              Check server health
  register <user> <role>  Register (player or dm)
  login <user> <pass>     Login and get token
  mcp-init            MCP initialize
  mcp-tools           List available MCP tools
  mcp-call <tool> <json>  Call an MCP tool

Set QUEST_SERVER env var for custom server URL (default: http://localhost:3000)
Set QUEST_TOKEN env var to skip login.
`);
    }
  } catch (err) {
    console.error("Error:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

// Allow token from env
if (process.env.QUEST_TOKEN) {
  state.token = process.env.QUEST_TOKEN;
}

main();

// Export for programmatic use
export {
  register,
  login,
  createCharacter,
  look,
  attack,
  cast,
  getStatus,
  getParty,
  getActions,
  queueForParty,
  partyChat,
  shortRest,
  narrate,
  spawnEncounter,
  getPartyState,
  getRoomState,
  awardXp,
  endSession,
  mcpListTools,
  mcpCallTool,
  state,
};
