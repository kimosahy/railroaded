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

  // Stub response — actual tool execution will be wired up later
  return success(id, {
    content: [
      {
        type: "text",
        text: `Tool called: ${toolName}. Not yet implemented.`,
      },
    ],
  });
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
        handleToolsCall(request.id, user.role, request.params ?? {}),
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
