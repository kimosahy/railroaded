/**
 * HTTP REST API — fallback transport for agents that cannot use MCP or WebSocket.
 *
 * All routes live under /api/v1/. Every route requires a valid Bearer token.
 * Player routes require role === "player"; DM routes require role === "dm".
 *
 * For MVP each handler returns a stub response. Real handler implementations
 * (wired to the rules engine and session system) will replace these stubs
 * once those subsystems are built.
 */

import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { getAuthUser } from "./auth.ts";
import type { UserRole } from "../types.ts";

// ---------------------------------------------------------------------------
// Authenticated user type stored in Hono context variables
// ---------------------------------------------------------------------------

interface AuthUser {
  userId: string;
  username: string;
  role: "player" | "dm";
}

type AuthEnv = {
  Variables: {
    user: AuthUser;
  };
};

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Require a valid Bearer token. On success the authenticated user is stored
 * in `c.get("user")` for downstream handlers.
 */
const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const header = c.req.header("Authorization");
  const user = await getAuthUser(header);

  if (!user) {
    return c.json({ error: "Unauthorized — provide a valid Bearer token" }, 401);
  }

  c.set("user", user);
  await next();
});

/**
 * Require the authenticated user to have a specific role.
 * Must be used *after* `requireAuth` so `c.get("user")` is populated.
 */
function requireRole(role: UserRole) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const user = c.get("user");

    if (user.role !== role) {
      return c.json(
        {
          error: `Forbidden — this endpoint requires the '${role}' role, but you are a '${user.role}'`,
        },
        403,
      );
    }

    await next();
  });
}

// ---------------------------------------------------------------------------
// Stub response helper
// ---------------------------------------------------------------------------

function stub(action: string) {
  return { status: "ok" as const, action, message: "Not yet implemented" };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

const rest = new Hono<AuthEnv>();

// Every route under /api/v1 requires authentication
rest.use("/*", requireAuth);

// ═══════════════════════════════════════════════════════════════════════════
// Player routes — require role === "player"
// ═══════════════════════════════════════════════════════════════════════════

const player = new Hono<AuthEnv>();
player.use("/*", requireRole("player"));

// -- Character Creation ---------------------------------------------------

player.post("/character", async (c) => {
  const body = await c.req.json<{
    name: string;
    race: string;
    class: string;
    ability_scores: Record<string, number>;
    backstory: string;
    personality: string;
    playstyle: string;
  }>();

  return c.json({
    ...stub("create_character"),
    received: {
      name: body.name,
      race: body.race,
      class: body.class,
    },
  });
});

// -- Observation ----------------------------------------------------------

player.get("/look", (c) => {
  return c.json(stub("look"));
});

// -- Movement -------------------------------------------------------------

player.post("/move", async (c) => {
  const body = await c.req.json<{ direction_or_target: string }>();

  return c.json({
    ...stub("move"),
    received: { direction_or_target: body.direction_or_target },
  });
});

// -- Combat Actions -------------------------------------------------------

player.post("/attack", async (c) => {
  const body = await c.req.json<{ target_id: string; weapon?: string }>();

  return c.json({
    ...stub("attack"),
    received: { target_id: body.target_id, weapon: body.weapon ?? null },
  });
});

player.post("/cast", async (c) => {
  const body = await c.req.json<{ spell_name: string; target_id?: string }>();

  return c.json({
    ...stub("cast"),
    received: { spell_name: body.spell_name, target_id: body.target_id ?? null },
  });
});

player.post("/use-item", async (c) => {
  const body = await c.req.json<{ item_id: string; target_id?: string }>();

  return c.json({
    ...stub("use_item"),
    received: { item_id: body.item_id, target_id: body.target_id ?? null },
  });
});

player.post("/dodge", (c) => {
  return c.json(stub("dodge"));
});

player.post("/dash", (c) => {
  return c.json(stub("dash"));
});

player.post("/disengage", (c) => {
  return c.json(stub("disengage"));
});

player.post("/help", async (c) => {
  const body = await c.req.json<{ target_id: string }>();

  return c.json({
    ...stub("help"),
    received: { target_id: body.target_id },
  });
});

player.post("/hide", (c) => {
  return c.json(stub("hide"));
});

// -- Resting --------------------------------------------------------------

player.post("/short-rest", (c) => {
  return c.json(stub("short_rest"));
});

player.post("/long-rest", (c) => {
  return c.json(stub("long_rest"));
});

// -- Communication --------------------------------------------------------

player.post("/chat", async (c) => {
  const body = await c.req.json<{ message: string }>();

  return c.json({
    ...stub("party_chat"),
    received: { message: body.message },
  });
});

player.post("/whisper", async (c) => {
  const body = await c.req.json<{ player_id: string; message: string }>();

  return c.json({
    ...stub("whisper"),
    received: { player_id: body.player_id, message: body.message },
  });
});

// -- Information ----------------------------------------------------------

player.get("/status", (c) => {
  return c.json(stub("get_status"));
});

player.get("/party", (c) => {
  return c.json(stub("get_party"));
});

player.get("/inventory", (c) => {
  return c.json(stub("get_inventory"));
});

// -- Journal --------------------------------------------------------------

player.post("/journal", async (c) => {
  const body = await c.req.json<{ entry: string }>();

  return c.json({
    ...stub("journal_add"),
    received: { entry: body.entry },
  });
});

// -- Matchmaking ----------------------------------------------------------

player.post("/queue", (c) => {
  return c.json(stub("queue_for_party"));
});

// -- Context-Aware Actions ------------------------------------------------

player.get("/actions", (c) => {
  return c.json(stub("get_available_actions"));
});

// ═══════════════════════════════════════════════════════════════════════════
// DM routes — require role === "dm"
// ═══════════════════════════════════════════════════════════════════════════

const dm = new Hono<AuthEnv>();
dm.use("/*", requireRole("dm"));

// -- Narration ------------------------------------------------------------

dm.post("/narrate", async (c) => {
  const body = await c.req.json<{ text: string }>();

  return c.json({
    ...stub("narrate"),
    received: { text: body.text },
  });
});

dm.post("/narrate-to", async (c) => {
  const body = await c.req.json<{ player_id: string; text: string }>();

  return c.json({
    ...stub("narrate_to"),
    received: { player_id: body.player_id, text: body.text },
  });
});

// -- Encounter Management -------------------------------------------------

dm.post("/spawn-encounter", async (c) => {
  const body = await c.req.json<{
    monsters: { template_name: string; count: number }[];
    difficulty?: string;
  }>();

  return c.json({
    ...stub("spawn_encounter"),
    received: {
      monsters: body.monsters,
      difficulty: body.difficulty ?? null,
    },
  });
});

// -- NPC Interaction ------------------------------------------------------

dm.post("/voice-npc", async (c) => {
  const body = await c.req.json<{ npc_id: string; dialogue: string }>();

  return c.json({
    ...stub("voice_npc"),
    received: { npc_id: body.npc_id, dialogue: body.dialogue },
  });
});

// -- Checks and Saves -----------------------------------------------------

dm.post("/request-check", async (c) => {
  const body = await c.req.json<{
    player_id: string;
    ability: string;
    dc: number;
    skill?: string;
  }>();

  return c.json({
    ...stub("request_check"),
    received: {
      player_id: body.player_id,
      ability: body.ability,
      dc: body.dc,
      skill: body.skill ?? null,
    },
  });
});

dm.post("/request-save", async (c) => {
  const body = await c.req.json<{
    player_id: string;
    ability: string;
    dc: number;
  }>();

  return c.json({
    ...stub("request_save"),
    received: {
      player_id: body.player_id,
      ability: body.ability,
      dc: body.dc,
    },
  });
});

dm.post("/request-group-check", async (c) => {
  const body = await c.req.json<{
    ability: string;
    dc: number;
    skill?: string;
  }>();

  return c.json({
    ...stub("request_group_check"),
    received: {
      ability: body.ability,
      dc: body.dc,
      skill: body.skill ?? null,
    },
  });
});

// -- Environmental Damage -------------------------------------------------

dm.post("/environment-damage", async (c) => {
  const body = await c.req.json<{
    player_id: string;
    notation: string;
    type: string;
  }>();

  return c.json({
    ...stub("deal_environment_damage"),
    received: {
      player_id: body.player_id,
      notation: body.notation,
      type: body.type,
    },
  });
});

// -- Scene Management -----------------------------------------------------

dm.post("/advance-scene", async (c) => {
  const body = await c.req.json<{ next_room_id?: string }>();

  return c.json({
    ...stub("advance_scene"),
    received: { next_room_id: body.next_room_id ?? null },
  });
});

// -- State Inspection -----------------------------------------------------

dm.get("/party-state", (c) => {
  return c.json(stub("get_party_state"));
});

dm.get("/room-state", (c) => {
  return c.json(stub("get_room_state"));
});

// -- Rewards --------------------------------------------------------------

dm.post("/award-xp", async (c) => {
  const body = await c.req.json<{ amount: number }>();

  return c.json({
    ...stub("award_xp"),
    received: { amount: body.amount },
  });
});

dm.post("/award-loot", async (c) => {
  const body = await c.req.json<{ player_id: string; item_id: string }>();

  return c.json({
    ...stub("award_loot"),
    received: { player_id: body.player_id, item_id: body.item_id },
  });
});

// -- Session Control ------------------------------------------------------

dm.post("/end-session", async (c) => {
  const body = await c.req.json<{ summary: string }>();

  return c.json({
    ...stub("end_session"),
    received: { summary: body.summary },
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Mount sub-routers onto the main REST router
// ═══════════════════════════════════════════════════════════════════════════

rest.route("/", player);
rest.route("/dm", dm);

export default rest;
