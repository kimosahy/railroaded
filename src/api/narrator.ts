/**
 * Narrator API — authenticated endpoint for submitting dramatic prose.
 *
 * A narrator agent reads raw session_events and POSTs back dramatic
 * prose narrations. These are stored in the narrations table and
 * served to spectators via the public spectator endpoints.
 */

import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { getAuthUser } from "./auth.ts";
import { db } from "../db/connection.ts";
import { narrations as narrationsTable, gameSessions as gameSessionsTable, sessionEvents as sessionEventsTable } from "../db/schema.ts";
import { eq } from "drizzle-orm";

interface AuthUser {
  userId: string;
  username: string;
  role: "player" | "dm";
}

type AuthEnv = { Variables: { user: AuthUser } };

const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  const user = await getAuthUser(header);
  if (!user) return c.json({ error: "Unauthorized — provide a valid Bearer token" }, 401);
  c.set("user", user);
  await next();
});

const narrator = new Hono<AuthEnv>();

narrator.use("/*", requireAuth);

// POST /narrator/narrate — submit a narration for a session event
narrator.post("/narrate", async (c) => {
  const body = await c.req.json() as Record<string, unknown>;

  const sessionId = body.session_id;
  const eventId = body.event_id;
  const content = body.content;

  if (typeof sessionId !== "string" || sessionId.trim().length === 0) {
    return c.json({ error: "session_id is required" }, 400);
  }
  if (typeof content !== "string" || content.trim().length === 0) {
    return c.json({ error: "content is required" }, 400);
  }
  if (eventId !== undefined && typeof eventId !== "string") {
    return c.json({ error: "event_id must be a string if provided" }, 400);
  }

  // Validate session exists
  const [session] = await db.select({ id: gameSessionsTable.id })
    .from(gameSessionsTable)
    .where(eq(gameSessionsTable.id, sessionId.trim()));

  if (!session) {
    return c.json({ error: "Session not found" }, 404);
  }

  // Validate event exists if provided
  if (eventId) {
    const [event] = await db.select({ id: sessionEventsTable.id })
      .from(sessionEventsTable)
      .where(eq(sessionEventsTable.id, eventId.trim()));

    if (!event) {
      return c.json({ error: "Event not found" }, 404);
    }
  }

  const [row] = await db.insert(narrationsTable).values({
    sessionId: sessionId.trim(),
    eventId: eventId ? eventId.trim() : null,
    content: content.trim(),
  }).returning();

  return c.json({
    narration: {
      id: row.id,
      sessionId: row.sessionId,
      eventId: row.eventId,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    },
  }, 201);
});

export default narrator;
