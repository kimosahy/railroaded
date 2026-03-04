/**
 * MCP (Model Context Protocol) server for Quest Engine.
 *
 * Implements a JSON-RPC 2.0 handler at POST /mcp that supports:
 *   - initialize   — server capabilities and info
 *   - tools/list   — available tools (player or DM set, based on auth)
 *   - tools/call   — execute a tool by name (stub responses for now)
 *
 * This is the primary interface for AI agents. Player agents and DM agents
 * connect here to discover and invoke game tools. The tool set exposed
 * depends on the authenticated user's role.
 */

import { Hono } from "hono";
import { getAuthUser } from "./auth.ts";
import { playerTools } from "../tools/player-tools.ts";
import type { PlayerToolDefinition } from "../tools/player-tools.ts";
import { dmTools } from "../tools/dm-tools.ts";
import type { ToolDefinition } from "../tools/dm-tools.ts";
import * as gm from "../game/game-manager.ts";

// ---------------------------------------------------------------------------
// JSON-RPC types
// ---------------------------------------------------------------------------

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcSuccess {
  jsonrpc: "2.0";
  id: string | number | null;
  result: unknown;
}

interface JsonRpcError {
  jsonrpc: "2.0";
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

type JsonRpcResponse = JsonRpcSuccess | JsonRpcError;

// ---------------------------------------------------------------------------
// MCP standard error codes
// ---------------------------------------------------------------------------

const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function success(id: string | number | null, result: unknown): JsonRpcSuccess {
  return { jsonrpc: "2.0", id, result };
}

function error(
  id: string | number | null,
  code: number,
  message: string,
  data?: unknown
): JsonRpcError {
  const err: JsonRpcError = { jsonrpc: "2.0", id, error: { code, message } };
  if (data !== undefined) {
    err.error.data = data;
  }
  return err;
}

/**
 * Validate that a parsed JSON body looks like a JSON-RPC 2.0 request.
 * Returns a typed request on success or a descriptive error string on failure.
 */
function validateJsonRpc(
  body: unknown
): { ok: true; request: JsonRpcRequest } | { ok: false; message: string } {
  if (
    body === null ||
    typeof body !== "object" ||
    Array.isArray(body)
  ) {
    return { ok: false, message: "Request body must be a JSON object." };
  }

  const obj = body as Record<string, unknown>;

  if (obj.jsonrpc !== "2.0") {
    return { ok: false, message: "jsonrpc field must be '2.0'." };
  }

  if (
    obj.id === undefined ||
    (typeof obj.id !== "string" &&
      typeof obj.id !== "number" &&
      obj.id !== null)
  ) {
    return { ok: false, message: "id field must be a string, number, or null." };
  }

  if (typeof obj.method !== "string" || obj.method.length === 0) {
    return { ok: false, message: "method field must be a non-empty string." };
  }

  if (
    obj.params !== undefined &&
    (typeof obj.params !== "object" || obj.params === null || Array.isArray(obj.params))
  ) {
    return { ok: false, message: "params field, if present, must be a JSON object." };
  }

  return {
    ok: true,
    request: {
      jsonrpc: "2.0",
      id: obj.id as string | number | null,
      method: obj.method as string,
      params: (obj.params as Record<string, unknown> | undefined) ?? {},
    },
  };
}

// ---------------------------------------------------------------------------
// Tool list formatting
// ---------------------------------------------------------------------------

interface McpToolEntry {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: readonly string[];
    additionalProperties?: boolean;
  };
}

function playerToolToMcp(tool: PlayerToolDefinition): McpToolEntry {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  };
}

function dmToolToMcp(tool: ToolDefinition): McpToolEntry {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  };
}

// ---------------------------------------------------------------------------
// Build lookup maps for fast tool resolution
// ---------------------------------------------------------------------------

const playerToolMap = new Map<string, PlayerToolDefinition>();
for (const tool of playerTools) {
  playerToolMap.set(tool.name, tool);
}

const dmToolMap = new Map<string, ToolDefinition>();
for (const tool of dmTools) {
  dmToolMap.set(tool.name, tool);
}

// ---------------------------------------------------------------------------
// MCP method handlers
// ---------------------------------------------------------------------------

function handleInitialize(
  id: string | number | null
): JsonRpcResponse {
  return success(id, {
    protocolVersion: "2024-11-05",
    serverInfo: {
      name: "quest-engine",
      version: "0.1.0",
    },
    capabilities: {
      tools: {
        listChanged: false,
      },
    },
  });
}

function handleToolsList(
  id: string | number | null,
  role: "player" | "dm"
): JsonRpcResponse {
  const tools: McpToolEntry[] =
    role === "dm"
      ? dmTools.map(dmToolToMcp)
      : playerTools.map(playerToolToMcp);

  return success(id, { tools });
}

function handleToolsCall(
  id: string | number | null,
  role: "player" | "dm",
  userId: string,
  params: Record<string, unknown>
): JsonRpcResponse {
  const toolName = params.name;
  if (typeof toolName !== "string" || toolName.length === 0) {
    return error(id, INVALID_PARAMS, "params.name must be a non-empty string identifying the tool to call.");
  }

  // Verify tool exists and is accessible to this role
  const isPlayerTool = playerToolMap.has(toolName);
  const isDmTool = dmToolMap.has(toolName);

  if (!isPlayerTool && !isDmTool) {
    return error(
      id,
      INVALID_PARAMS,
      `Unknown tool: '${toolName}'. Use tools/list to see available tools.`
    );
  }

  if (role === "player" && !isPlayerTool) {
    return error(
      id,
      INVALID_PARAMS,
      `Tool '${toolName}' is only available to DM agents. Your role is 'player'.`
    );
  }

  if (role === "dm" && !isDmTool) {
    return error(
      id,
      INVALID_PARAMS,
      `Tool '${toolName}' is only available to player agents. Your role is 'dm'.`
    );
  }

  const args = (params.arguments ?? {}) as Record<string, unknown>;
  const result = executeToolCall(toolName, userId, args);

  if (!result.success) {
    return success(id, {
      content: [{ type: "text", text: JSON.stringify({ error: result.error }) }],
      isError: true,
    });
  }

  return success(id, {
    content: [{ type: "text", text: JSON.stringify(result.data ?? { ok: true }) }],
  });
}

function executeToolCall(
  toolName: string,
  userId: string,
  args: Record<string, unknown>
): { success: boolean; data?: Record<string, unknown>; error?: string; character?: unknown } {
  switch (toolName) {
    // --- Player tools ---
    case "create_character":
      return gm.handleCreateCharacter(userId, {
        name: args.name as string,
        race: args.race as "human" | "elf" | "dwarf" | "halfling" | "half-orc",
        class: args.class as "fighter" | "rogue" | "cleric" | "wizard",
        ability_scores: args.ability_scores as { str: number; dex: number; con: number; int: number; wis: number; cha: number },
        backstory: args.backstory as string | undefined,
        personality: args.personality as string | undefined,
        playstyle: args.playstyle as string | undefined,
      });
    case "look":
      return gm.handleLook(userId);
    case "get_status":
      return gm.handleGetStatus(userId);
    case "get_party":
      return gm.handleGetParty(userId);
    case "get_inventory":
      return gm.handleGetInventory(userId);
    case "get_available_actions":
      return gm.handleGetAvailableActions(userId);
    case "move":
      return gm.handleMove(userId, { direction_or_target: args.direction_or_target as string });
    case "attack":
      return gm.handleAttack(userId, { target_id: args.target_id as string, weapon: args.weapon as string | undefined });
    case "cast":
      return gm.handleCast(userId, { spell_name: args.spell_name as string, target_id: args.target_id as string | undefined });
    case "use_item":
      return gm.handleUseItem(userId, { item_id: args.item_id as string, target_id: args.target_id as string | undefined });
    case "dodge":
      return gm.handleDodge(userId);
    case "dash":
      return gm.handleDash(userId);
    case "disengage":
      return gm.handleDisengage(userId);
    case "help":
      return gm.handleHelp(userId, { target_id: args.target_id as string });
    case "hide":
      return gm.handleHide(userId);
    case "bonus_action":
      return gm.handleBonusAction(userId, {
        action: args.action as string,
        spell_name: args.spell_name as string | undefined,
        target_id: args.target_id as string | undefined,
      });
    case "reaction":
      return gm.handleReaction(userId, {
        action: args.action as string,
        spell_name: args.spell_name as string | undefined,
        target_id: args.target_id as string | undefined,
      });
    case "end_turn":
      return gm.handleEndTurn(userId);
    case "death_save":
      return gm.handleDeathSave(userId);
    case "short_rest":
      return gm.handleShortRest(userId);
    case "long_rest":
      return gm.handleLongRest(userId);
    case "party_chat":
      return gm.handlePartyChat(userId, { message: args.message as string });
    case "whisper":
      return gm.handleWhisper(userId, { player_id: args.player_id as string, message: args.message as string });
    case "journal_add":
      return gm.handleJournalAdd(userId, { entry: args.entry as string });
    case "equip_item":
      return gm.handleEquipItem(userId, { item_name: args.item_name as string });
    case "unequip_item":
      return gm.handleUnequipItem(userId, { slot: args.slot as string });
    case "queue_for_party":
      return gm.handleQueueForParty(userId);

    // --- DM tools ---
    case "narrate":
      return gm.handleNarrate(userId, { text: args.text as string });
    case "narrate_to":
      return gm.handleNarrateTo(userId, { player_id: args.player_id as string, text: args.text as string });
    case "spawn_encounter":
      return gm.handleSpawnEncounter(userId, { monsters: args.monsters as { template_name: string; count: number }[] });
    case "trigger_encounter":
      return gm.handleTriggerEncounter(userId);
    case "monster_attack":
      return gm.handleMonsterAttack(userId, { monster_id: args.monster_id as string, target_id: args.target_id as string, attack_name: args.attack_name as string | undefined });
    case "voice_npc":
      return gm.handleVoiceNpc(userId, { npc_id: args.npc_id as string, dialogue: args.dialogue as string });
    case "request_check":
      return gm.handleRequestCheck(userId, {
        player_id: args.player_id as string, ability: args.ability as string,
        dc: args.dc as number, skill: args.skill as string | undefined,
        advantage: args.advantage as boolean | undefined, disadvantage: args.disadvantage as boolean | undefined,
      });
    case "request_save":
      return gm.handleRequestSave(userId, {
        player_id: args.player_id as string, ability: args.ability as string, dc: args.dc as number,
        advantage: args.advantage as boolean | undefined, disadvantage: args.disadvantage as boolean | undefined,
      });
    case "request_group_check":
      return gm.handleRequestGroupCheck(userId, {
        ability: args.ability as string, dc: args.dc as number, skill: args.skill as string | undefined,
        advantage: args.advantage as boolean | undefined, disadvantage: args.disadvantage as boolean | undefined,
      });
    case "request_contested_check":
      return gm.handleRequestContestedCheck(userId, {
        player_id_1: args.player_id_1 as string, ability_1: args.ability_1 as string,
        skill_1: args.skill_1 as string | undefined,
        advantage_1: args.advantage_1 as boolean | undefined, disadvantage_1: args.disadvantage_1 as boolean | undefined,
        player_id_2: args.player_id_2 as string, ability_2: args.ability_2 as string,
        skill_2: args.skill_2 as string | undefined,
        advantage_2: args.advantage_2 as boolean | undefined, disadvantage_2: args.disadvantage_2 as boolean | undefined,
      });
    case "deal_environment_damage":
      return gm.handleDealEnvironmentDamage(userId, { player_id: args.player_id as string, notation: args.notation as string, type: args.type as string });
    case "advance_scene":
      return gm.handleAdvanceScene(userId, { next_room_id: args.next_room_id as string | undefined });
    case "get_party_state":
      return gm.handleGetPartyState(userId);
    case "get_room_state":
      return gm.handleGetRoomState(userId);
    case "award_xp":
      return gm.handleAwardXp(userId, { amount: args.amount as number });
    case "list_items":
      return gm.handleListItems(userId, { category: args.category as string | undefined });
    case "award_loot":
      return gm.handleAwardLoot(userId, { player_id: args.player_id as string, item_id: args.item_id as string });
    case "loot_room":
      return gm.handleLootRoom(userId, { player_id: args.player_id as string });
    case "end_session":
      return gm.handleEndSession(userId, { summary: args.summary as string });
    case "dm_queue_for_party":
      return gm.handleDMQueueForParty(userId);

    default:
      return { success: false, error: `Tool '${toolName}' has no handler implementation.` };
  }
}

// ---------------------------------------------------------------------------
// Hono router
// ---------------------------------------------------------------------------

const mcp = new Hono();

mcp.post("/mcp", async (c) => {
  // Parse the JSON body
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json(
      error(null, PARSE_ERROR, "Failed to parse JSON request body."),
      200
    );
  }

  // Validate JSON-RPC structure
  const validation = validateJsonRpc(body);
  if (!validation.ok) {
    return c.json(
      error(null, INVALID_REQUEST, validation.message),
      200
    );
  }

  const request = validation.request;

  // The `initialize` method does not require authentication — MCP clients
  // call it before they have a session token to learn about capabilities.
  if (request.method === "initialize") {
    return c.json(handleInitialize(request.id), 200);
  }

  // All other methods require authentication
  const authHeader = c.req.header("Authorization");
  const user = await getAuthUser(authHeader);

  if (!user) {
    return c.json(
      error(
        request.id,
        INVALID_REQUEST,
        "Authentication required. Provide a valid Bearer token in the Authorization header."
      ),
      200
    );
  }

  // Dispatch to method handlers
  switch (request.method) {
    case "tools/list":
      return c.json(handleToolsList(request.id, user.role), 200);

    case "tools/call":
      return c.json(
        handleToolsCall(request.id, user.role, user.userId, request.params ?? {}),
        200
      );

    default:
      return c.json(
        error(
          request.id,
          METHOD_NOT_FOUND,
          `Unknown method: '${request.method}'. Supported methods: initialize, tools/list, tools/call.`
        ),
        200
      );
  }
});

export default mcp;
