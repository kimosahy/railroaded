/**
 * Public profile endpoints — agent and owner profiles.
 * No auth required — these are public-facing.
 */

import { Hono } from "hono";
import { db } from "../db/connection.ts";
import { agents, accounts, characters as charactersTable, gameSessions as gameSessionsTable, sessionEvents as sessionEventsTable } from "../db/schema.ts";
import { eq, sql, and } from "drizzle-orm";
import { getKarmaTier } from "./karma.ts";

const profiles = new Hono();

// GET /api/v1/profile/agent/:name — Public agent profile
profiles.get("/agent/:name", async (c) => {
  const name = c.req.param("name");

  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.name, name))
    .limit(1);

  if (!agent) {
    return c.json({ error: "agent not found", code: "NOT_FOUND" }, 404);
  }

  // Get owner info
  let ownerDisplayName: string | null = null;
  if (agent.accountId) {
    const [owner] = await db
      .select({ displayName: accounts.displayName })
      .from(accounts)
      .where(eq(accounts.id, agent.accountId))
      .limit(1);
    if (owner) ownerDisplayName = owner.displayName;
  }

  // Get character roster — all characters that share the agent's name pattern
  // Since agents don't directly link to game users yet, we return an empty roster
  // This will be populated when agent<->user linking is implemented
  const characterRoster: any[] = [];

  const tier = getKarmaTier(agent.karma);

  return c.json({
    agent: {
      name: agent.name,
      avatar_url: agent.avatarUrl,
      model_provider: agent.modelProvider,
      model_name: agent.modelName,
      personality: agent.personality,
      x_handle: agent.xHandle,
      karma: agent.karma,
      karma_tier: tier,
      is_active: agent.isActive,
      created_at: agent.createdAt,
      last_active_at: agent.lastActiveAt,
      owner_display_name: ownerDisplayName,
    },
    stats: {
      sessions_played: 0,
      characters_created: characterRoster.length,
      total_kills: 0,
      total_deaths: 0,
      damage_dealt: 0,
      damage_taken: 0,
    },
    character_roster: characterRoster,
    session_history: [],
    benchmarks: {
      flaw_activation_rate: null,
      sanitization_rate: null,
    },
  });
});

// GET /api/v1/profile/player/:username — Public owner profile
profiles.get("/player/:username", async (c) => {
  const username = c.req.param("username");

  // Look up by display_name
  const [account] = await db
    .select({
      id: accounts.id,
      displayName: accounts.displayName,
      avatarUrl: accounts.avatarUrl,
      bio: accounts.bio,
      xHandle: accounts.xHandle,
      githubHandle: accounts.githubHandle,
      karma: accounts.karma,
      createdAt: accounts.createdAt,
    })
    .from(accounts)
    .where(eq(accounts.displayName, username))
    .limit(1);

  if (!account) {
    return c.json({ error: "player not found", code: "NOT_FOUND" }, 404);
  }

  // Get all agents owned by this account
  const ownedAgents = await db
    .select({
      name: agents.name,
      avatarUrl: agents.avatarUrl,
      modelProvider: agents.modelProvider,
      modelName: agents.modelName,
      karma: agents.karma,
      isActive: agents.isActive,
    })
    .from(agents)
    .where(eq(agents.accountId, account.id));

  const totalKarma = ownedAgents.reduce((sum, a) => sum + a.karma, 0);
  const tier = getKarmaTier(totalKarma);

  return c.json({
    player: {
      display_name: account.displayName,
      avatar_url: account.avatarUrl,
      bio: account.bio,
      x_handle: account.xHandle,
      github_handle: account.githubHandle,
      karma: totalKarma,
      karma_tier: tier,
      join_date: account.createdAt,
    },
    agents: ownedAgents.map((a) => ({
      name: a.name,
      avatar_url: a.avatarUrl,
      model_provider: a.modelProvider,
      model_name: a.modelName,
      karma: a.karma,
      karma_tier: getKarmaTier(a.karma),
      is_active: a.isActive,
    })),
    stats: {
      total_agents: ownedAgents.length,
      total_karma: totalKarma,
      total_sessions: 0,
      total_characters: 0,
    },
  });
});

export default profiles;
