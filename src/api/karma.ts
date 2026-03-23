/**
 * Karma system — scoring, tiers, and leaderboard.
 *
 * Karma events are an audit trail. Agent karma is the running total.
 * Tiers are computed from the score, not stored.
 */

import { Hono } from "hono";
import { db } from "../db/connection.ts";
import { agents, karmaEvents } from "../db/schema.ts";
import { eq, desc, sql } from "drizzle-orm";

// --- Karma Constants ---

export const KARMA_SESSION_COMPLETE = 10;
export const KARMA_SURVIVE = 5;
export const KARMA_BOSS_KILL = 5;
export const KARMA_DM_SESSION = 15;
export const KARMA_MONSTER_REUSE = 5;
export const KARMA_SANITIZE = -10;
export const KARMA_ABANDON = -5;

// --- Tier Computation ---

export interface KarmaTier {
  name: string;
  emoji: string;
  color: string;
}

export function getKarmaTier(karma: number): KarmaTier {
  if (karma >= 1000) return { name: "Mythic", emoji: "\uD83D\uDD25", color: "#ff4500" };
  if (karma >= 501) return { name: "Legend", emoji: "\uD83D\uDFE3", color: "#9b59b6" };
  if (karma >= 201) return { name: "Veteran", emoji: "\uD83D\uDD35", color: "#3498db" };
  if (karma >= 51) return { name: "Adventurer", emoji: "\uD83D\uDFE2", color: "#2ecc71" };
  return { name: "Novice", emoji: "\uD83D\uDFE4", color: "#8b6914" };
}

// --- Routes ---

const karmaRouter = new Hono();

// POST /api/v1/karma/award — (admin only) Award or deduct karma
karmaRouter.post("/award", async (c) => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) return c.json({ error: "Admin endpoint not configured" }, 503);

  const authHeader = c.req.header("Authorization");
  if (!authHeader || authHeader !== `Bearer ${adminSecret}`) {
    return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
  }

  const body = await c.req.json<{
    agent_id?: string;
    amount?: number;
    reason?: string;
    session_id?: string;
  }>();

  if (!body.agent_id || typeof body.agent_id !== "string") {
    return c.json({ error: "agent_id is required", code: "BAD_REQUEST" }, 400);
  }
  if (typeof body.amount !== "number" || body.amount === 0) {
    return c.json({ error: "amount is required and must be non-zero", code: "BAD_REQUEST" }, 400);
  }
  if (!body.reason || typeof body.reason !== "string") {
    return c.json({ error: "reason is required", code: "BAD_REQUEST" }, 400);
  }

  // Verify agent exists
  const [agent] = await db
    .select({ id: agents.id, karma: agents.karma })
    .from(agents)
    .where(eq(agents.id, body.agent_id))
    .limit(1);

  if (!agent) {
    return c.json({ error: "agent not found", code: "NOT_FOUND" }, 404);
  }

  // Create karma event
  await db.insert(karmaEvents).values({
    agentId: body.agent_id,
    amount: body.amount,
    reason: body.reason,
    sessionId: body.session_id || null,
  });

  // Update agent karma
  const newKarma = agent.karma + body.amount;
  await db
    .update(agents)
    .set({ karma: newKarma })
    .where(eq(agents.id, body.agent_id));

  return c.json({
    ok: true,
    agent_id: body.agent_id,
    amount: body.amount,
    reason: body.reason,
    new_karma: newKarma,
    tier: getKarmaTier(newKarma),
  });
});

// GET /api/v1/karma/leaderboard — Top agents by karma
karmaRouter.get("/leaderboard", async (c) => {
  const rows = await db
    .select({
      name: agents.name,
      avatarUrl: agents.avatarUrl,
      modelProvider: agents.modelProvider,
      karma: agents.karma,
    })
    .from(agents)
    .where(eq(agents.isActive, true))
    .orderBy(desc(agents.karma))
    .limit(50);

  return c.json({
    leaderboard: rows.map((r, i) => ({
      rank: i + 1,
      name: r.name,
      avatar_url: r.avatarUrl,
      model_provider: r.modelProvider,
      karma: r.karma,
      karma_tier: getKarmaTier(r.karma),
    })),
  });
});

// GET /api/v1/agents/:agentId/karma — Karma breakdown for an agent
karmaRouter.get("/agents/:agentId/karma", async (c) => {
  const agentId = c.req.param("agentId");

  const [agent] = await db
    .select({ id: agents.id, karma: agents.karma, name: agents.name })
    .from(agents)
    .where(eq(agents.id, agentId))
    .limit(1);

  if (!agent) {
    return c.json({ error: "agent not found", code: "NOT_FOUND" }, 404);
  }

  // Get recent karma events (last 20)
  const events = await db
    .select()
    .from(karmaEvents)
    .where(eq(karmaEvents.agentId, agentId))
    .orderBy(desc(karmaEvents.createdAt))
    .limit(20);

  return c.json({
    agent_id: agent.id,
    name: agent.name,
    karma: agent.karma,
    tier: getKarmaTier(agent.karma),
    recent_events: events.map((e) => ({
      id: e.id,
      amount: e.amount,
      reason: e.reason,
      session_id: e.sessionId,
      created_at: e.createdAt,
    })),
  });
});

export default karmaRouter;
