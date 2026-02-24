import type { ServerWebSocket } from "bun";
import { getAuthUser } from "./auth.ts";
import type { UserRole, SessionPhase } from "../types.ts";

// --- Per-connection data attached to ws.data ---

export interface WSData {
  userId: string | null;
  username: string | null;
  role: UserRole | null;
  subscribedPartyIds: Set<string>;
  authenticated: boolean;
}

// --- Message types: Client -> Server ---

interface AuthMessage {
  type: "auth";
  token: string;
}

interface SubscribeMessage {
  type: "subscribe";
  partyId: string;
}

interface UnsubscribeMessage {
  type: "unsubscribe";
  partyId: string;
}

interface ActionMessage {
  type: "action";
  action: string;
  params: Record<string, unknown>;
}

type ClientMessage =
  | AuthMessage
  | SubscribeMessage
  | UnsubscribeMessage
  | ActionMessage;

// --- Message types: Server -> Client ---

interface AuthOkMessage {
  type: "auth_ok";
  userId: string;
  role: string;
}

interface AuthErrorMessage {
  type: "auth_error";
  message: string;
}

interface EventMessage {
  type: "event";
  eventType: string;
  data: Record<string, unknown>;
}

interface ErrorMessage {
  type: "error";
  message: string;
}

interface TurnNotifyMessage {
  type: "turn_notify";
  entityId: string;
  phase: SessionPhase;
}

type ServerMessage =
  | AuthOkMessage
  | AuthErrorMessage
  | EventMessage
  | ErrorMessage
  | TurnNotifyMessage;

// --- Connection tracking ---

/** All active WebSocket connections keyed by a unique connection id */
const connections = new Map<
  ServerWebSocket<WSData>,
  { userId: string | null; role: UserRole | null }
>();

/** userId -> set of WebSocket connections (a user may have multiple tabs) */
const userConnections = new Map<string, Set<ServerWebSocket<WSData>>>();

/** partyId -> set of WebSocket connections subscribed to that party */
const partySubscribers = new Map<string, Set<ServerWebSocket<WSData>>>();

// --- Helpers ---

function send(ws: ServerWebSocket<WSData>, message: ServerMessage): void {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(message));
  }
}

function parseMessage(raw: string | Buffer): ClientMessage | null {
  try {
    const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || !("type" in parsed)) {
      return null;
    }
    const msg = parsed as Record<string, unknown>;

    switch (msg.type) {
      case "auth": {
        if (typeof msg.token !== "string") return null;
        return { type: "auth", token: msg.token };
      }
      case "subscribe": {
        if (typeof msg.partyId !== "string") return null;
        return { type: "subscribe", partyId: msg.partyId };
      }
      case "unsubscribe": {
        if (typeof msg.partyId !== "string") return null;
        return { type: "unsubscribe", partyId: msg.partyId };
      }
      case "action": {
        if (typeof msg.action !== "string") return null;
        const params =
          typeof msg.params === "object" &&
          msg.params !== null &&
          !Array.isArray(msg.params)
            ? (msg.params as Record<string, unknown>)
            : {};
        return { type: "action", action: msg.action, params };
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

function addUserConnection(
  userId: string,
  ws: ServerWebSocket<WSData>
): void {
  let set = userConnections.get(userId);
  if (!set) {
    set = new Set();
    userConnections.set(userId, set);
  }
  set.add(ws);
}

function removeUserConnection(
  userId: string,
  ws: ServerWebSocket<WSData>
): void {
  const set = userConnections.get(userId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) {
      userConnections.delete(userId);
    }
  }
}

function addPartySubscriber(
  partyId: string,
  ws: ServerWebSocket<WSData>
): void {
  let set = partySubscribers.get(partyId);
  if (!set) {
    set = new Set();
    partySubscribers.set(partyId, set);
  }
  set.add(ws);
}

function removePartySubscriber(
  partyId: string,
  ws: ServerWebSocket<WSData>
): void {
  const set = partySubscribers.get(partyId);
  if (set) {
    set.delete(ws);
    if (set.size === 0) {
      partySubscribers.delete(partyId);
    }
  }
}

function cleanupConnection(ws: ServerWebSocket<WSData>): void {
  const data = ws.data;

  // Remove from user connections
  if (data.userId) {
    removeUserConnection(data.userId, ws);
  }

  // Remove from all party subscriptions
  for (const partyId of data.subscribedPartyIds) {
    removePartySubscriber(partyId, ws);
  }
  data.subscribedPartyIds.clear();

  // Remove from global connection map
  connections.delete(ws);
}

// --- Message handlers ---

async function handleAuth(
  ws: ServerWebSocket<WSData>,
  msg: AuthMessage
): Promise<void> {
  if (ws.data.authenticated) {
    send(ws, { type: "error", message: "Already authenticated" });
    return;
  }

  const user = await getAuthUser(msg.token);
  if (!user) {
    send(ws, { type: "auth_error", message: "Invalid or expired token" });
    return;
  }

  ws.data.userId = user.userId;
  ws.data.username = user.username;
  ws.data.role = user.role;
  ws.data.authenticated = true;

  connections.set(ws, { userId: user.userId, role: user.role });
  addUserConnection(user.userId, ws);

  send(ws, { type: "auth_ok", userId: user.userId, role: user.role });
}

function handleSubscribe(
  ws: ServerWebSocket<WSData>,
  msg: SubscribeMessage
): void {
  if (!ws.data.authenticated) {
    send(ws, { type: "error", message: "Must authenticate before subscribing" });
    return;
  }

  if (ws.data.subscribedPartyIds.has(msg.partyId)) {
    send(ws, { type: "error", message: "Already subscribed to this party" });
    return;
  }

  ws.data.subscribedPartyIds.add(msg.partyId);
  addPartySubscriber(msg.partyId, ws);

  send(ws, {
    type: "event",
    eventType: "subscribed",
    data: { partyId: msg.partyId },
  });
}

function handleUnsubscribe(
  ws: ServerWebSocket<WSData>,
  msg: UnsubscribeMessage
): void {
  if (!ws.data.authenticated) {
    send(ws, { type: "error", message: "Must authenticate first" });
    return;
  }

  if (!ws.data.subscribedPartyIds.has(msg.partyId)) {
    send(ws, { type: "error", message: "Not subscribed to this party" });
    return;
  }

  ws.data.subscribedPartyIds.delete(msg.partyId);
  removePartySubscriber(msg.partyId, ws);

  send(ws, {
    type: "event",
    eventType: "unsubscribed",
    data: { partyId: msg.partyId },
  });
}

function handleAction(
  ws: ServerWebSocket<WSData>,
  msg: ActionMessage
): void {
  if (!ws.data.authenticated) {
    send(ws, { type: "error", message: "Must authenticate before performing actions" });
    return;
  }

  // MVP stub: echo back the action as received
  send(ws, {
    type: "event",
    eventType: "action_received",
    data: { action: msg.action, params: msg.params },
  });
}

// --- Public API ---

/**
 * Send a message to all WebSocket clients subscribed to a party.
 */
export function broadcastToParty(
  partyId: string,
  message: Record<string, unknown>
): void {
  const subscribers = partySubscribers.get(partyId);
  if (!subscribers) return;

  const payload = JSON.stringify(message);
  for (const ws of subscribers) {
    if (ws.readyState === 1) {
      ws.send(payload);
    }
  }
}

/**
 * Send a message to all WebSocket connections belonging to a specific user.
 */
export function sendToUser(
  userId: string,
  message: Record<string, unknown>
): void {
  const sockets = userConnections.get(userId);
  if (!sockets) return;

  const payload = JSON.stringify(message);
  for (const ws of sockets) {
    if (ws.readyState === 1) {
      ws.send(payload);
    }
  }
}

/**
 * Returns the Bun WebSocket handler object, compatible with Bun.serve({ websocket: ... }).
 *
 * Usage:
 *   Bun.serve({
 *     fetch(req, server) {
 *       if (new URL(req.url).pathname === "/ws") {
 *         const upgraded = server.upgrade(req, {
 *           data: { userId: null, username: null, role: null, subscribedPartyIds: new Set(), authenticated: false }
 *         });
 *         if (!upgraded) return new Response("WebSocket upgrade failed", { status: 400 });
 *         return undefined;
 *       }
 *       // ... other routes
 *     },
 *     websocket: createWSHandler(),
 *   });
 */
export function createWSHandler(): {
  open: (ws: ServerWebSocket<WSData>) => void;
  message: (ws: ServerWebSocket<WSData>, message: string | Buffer) => void;
  close: (ws: ServerWebSocket<WSData>, code: number, reason: string) => void;
  drain: (ws: ServerWebSocket<WSData>) => void;
} {
  return {
    open(ws: ServerWebSocket<WSData>) {
      connections.set(ws, { userId: null, role: null });
    },

    message(ws: ServerWebSocket<WSData>, raw: string | Buffer) {
      const msg = parseMessage(raw);
      if (!msg) {
        send(ws, { type: "error", message: "Invalid message format" });
        return;
      }

      switch (msg.type) {
        case "auth":
          // handleAuth is async but Bun's message handler is sync.
          // Fire and forget — errors are sent back to the client via the socket.
          void handleAuth(ws, msg);
          break;
        case "subscribe":
          handleSubscribe(ws, msg);
          break;
        case "unsubscribe":
          handleUnsubscribe(ws, msg);
          break;
        case "action":
          handleAction(ws, msg);
          break;
      }
    },

    close(ws: ServerWebSocket<WSData>, _code: number, _reason: string) {
      cleanupConnection(ws);
    },

    drain(_ws: ServerWebSocket<WSData>) {
      // Called when the socket's backpressure is relieved.
      // No-op for now — could be used to resume queued messages.
    },
  };
}

/**
 * Create a fresh WSData object for use when upgrading a connection.
 * Pass this as `data` in `server.upgrade(req, { data: createWSData() })`.
 */
export function createWSData(): WSData {
  return {
    userId: null,
    username: null,
    role: null,
    subscribedPartyIds: new Set<string>(),
    authenticated: false,
  };
}
