/**
 * HTTP REST API — wired to the game manager for real gameplay.
 */

import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import { getAuthUser } from "./auth.ts";
import type { UserRole, Race, CharacterClass, AbilityScores } from "../types.ts";
import * as gm from "../game/game-manager.ts";

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

function requireRole(role: UserRole) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const user = c.get("user");
    if (user.role !== role) {
      return c.json({ error: `Forbidden — requires '${role}' role, you are '${user.role}'` }, 403);
    }
    await next();
  });
}

function respond(c: Context<AuthEnv>, result: { success: boolean; data?: Record<string, unknown>; error?: string }) {
  if (!result.success) {
    return c.json({ error: result.error }, 400);
  }
  return c.json(result.data);
}

const rest = new Hono<AuthEnv>();
rest.use("/*", requireAuth);

// === Player routes ===
const player = new Hono<AuthEnv>();
player.use("/*", requireRole("player"));

player.post("/character", async (c) => {
  const body = await c.req.json<{
    name: string; race: Race; class: CharacterClass;
    ability_scores: AbilityScores;
    backstory?: string; personality?: string; playstyle?: string;
  }>();
  const result = gm.handleCreateCharacter(c.get("user").userId, body);
  if (!result.success) return c.json({ error: result.error }, 400);
  return c.json({ character: result.character }, 201);
});

player.get("/look", (c) => respond(c, gm.handleLook(c.get("user").userId)));
player.get("/status", (c) => respond(c, gm.handleGetStatus(c.get("user").userId)));
player.get("/party", (c) => respond(c, gm.handleGetParty(c.get("user").userId)));
player.get("/inventory", (c) => respond(c, gm.handleGetInventory(c.get("user").userId)));
player.get("/actions", (c) => respond(c, gm.handleGetAvailableActions(c.get("user").userId)));

player.post("/move", async (c) => {
  const body = await c.req.json<{ direction_or_target: string }>();
  return respond(c, gm.handleMove(c.get("user").userId, body));
});

player.post("/attack", async (c) => {
  const body = await c.req.json<{ target_id: string; weapon?: string }>();
  return respond(c, gm.handleAttack(c.get("user").userId, body));
});

player.post("/cast", async (c) => {
  const body = await c.req.json<{ spell_name: string; target_id?: string }>();
  return respond(c, gm.handleCast(c.get("user").userId, body));
});

player.post("/use-item", async (c) => {
  const body = await c.req.json<{ item_id: string; target_id?: string }>();
  return respond(c, gm.handleUseItem(c.get("user").userId, body));
});

player.post("/dodge", (c) => respond(c, gm.handleDodge(c.get("user").userId)));
player.post("/dash", (c) => respond(c, gm.handleDash(c.get("user").userId)));
player.post("/disengage", (c) => respond(c, gm.handleDisengage(c.get("user").userId)));

player.post("/help", async (c) => {
  const body = await c.req.json<{ target_id: string }>();
  return respond(c, gm.handleHelp(c.get("user").userId, body));
});

player.post("/hide", (c) => respond(c, gm.handleHide(c.get("user").userId)));

player.post("/bonus-action", async (c) => {
  const body = await c.req.json<{ action: string; spell_name?: string; target_id?: string }>();
  return respond(c, gm.handleBonusAction(c.get("user").userId, body));
});

player.post("/reaction", async (c) => {
  const body = await c.req.json<{ action: string; spell_name?: string; target_id?: string }>();
  return respond(c, gm.handleReaction(c.get("user").userId, body));
});

player.post("/end-turn", (c) => respond(c, gm.handleEndTurn(c.get("user").userId)));
player.post("/death-save", (c) => respond(c, gm.handleDeathSave(c.get("user").userId)));

player.post("/short-rest", (c) => respond(c, gm.handleShortRest(c.get("user").userId)));
player.post("/long-rest", (c) => respond(c, gm.handleLongRest(c.get("user").userId)));

player.post("/chat", async (c) => {
  const body = await c.req.json<{ message: string }>();
  return respond(c, gm.handlePartyChat(c.get("user").userId, body));
});

player.post("/whisper", async (c) => {
  const body = await c.req.json<{ player_id: string; message: string }>();
  return respond(c, gm.handleWhisper(c.get("user").userId, body));
});

player.post("/journal", async (c) => {
  const body = await c.req.json<{ entry: string }>();
  return respond(c, gm.handleJournalAdd(c.get("user").userId, body));
});

player.post("/equip", async (c) => {
  const body = await c.req.json<{ item_name: string }>();
  return respond(c, gm.handleEquipItem(c.get("user").userId, body));
});

player.post("/unequip", async (c) => {
  const body = await c.req.json<{ slot: string }>();
  return respond(c, gm.handleUnequipItem(c.get("user").userId, body));
});

player.post("/queue", (c) => respond(c, gm.handleQueueForParty(c.get("user").userId)));

// === DM routes ===
const dm = new Hono<AuthEnv>();
dm.use("/*", requireRole("dm"));

dm.post("/narrate", async (c) => {
  const body = await c.req.json<{ text: string }>();
  return respond(c, gm.handleNarrate(c.get("user").userId, body));
});

dm.post("/narrate-to", async (c) => {
  const body = await c.req.json<{ player_id: string; text: string }>();
  return respond(c, gm.handleNarrateTo(c.get("user").userId, body));
});

dm.post("/spawn-encounter", async (c) => {
  const body = await c.req.json<{ monsters: { template_name: string; count: number }[] }>();
  return respond(c, gm.handleSpawnEncounter(c.get("user").userId, body));
});

dm.post("/trigger-encounter", (c) => respond(c, gm.handleTriggerEncounter(c.get("user").userId)));

dm.post("/interact-feature", async (c) => {
  const body = await c.req.json<{ feature_name: string }>();
  return respond(c, gm.handleInteractWithFeature(c.get("user").userId, body));
});

dm.post("/override-room-description", async (c) => {
  const body = await c.req.json<{ description: string }>();
  return respond(c, gm.handleOverrideRoomDescription(c.get("user").userId, body));
});

dm.post("/voice-npc", async (c) => {
  const body = await c.req.json<{ npc_id: string; dialogue: string }>();
  return respond(c, gm.handleVoiceNpc(c.get("user").userId, body));
});

dm.post("/request-check", async (c) => {
  const body = await c.req.json<{ player_id: string; ability: string; dc: number; skill?: string; advantage?: boolean; disadvantage?: boolean }>();
  return respond(c, gm.handleRequestCheck(c.get("user").userId, body));
});

dm.post("/request-save", async (c) => {
  const body = await c.req.json<{ player_id: string; ability: string; dc: number; advantage?: boolean; disadvantage?: boolean }>();
  return respond(c, gm.handleRequestSave(c.get("user").userId, body));
});

dm.post("/request-group-check", async (c) => {
  const body = await c.req.json<{ ability: string; dc: number; skill?: string; advantage?: boolean; disadvantage?: boolean }>();
  return respond(c, gm.handleRequestGroupCheck(c.get("user").userId, body));
});

dm.post("/request-contested-check", async (c) => {
  const body = await c.req.json<{
    player_id_1: string; ability_1: string; skill_1?: string; advantage_1?: boolean; disadvantage_1?: boolean;
    player_id_2: string; ability_2: string; skill_2?: string; advantage_2?: boolean; disadvantage_2?: boolean;
  }>();
  return respond(c, gm.handleRequestContestedCheck(c.get("user").userId, body));
});

dm.post("/environment-damage", async (c) => {
  const body = await c.req.json<{ player_id: string; notation: string; type: string }>();
  return respond(c, gm.handleDealEnvironmentDamage(c.get("user").userId, body));
});

dm.post("/advance-scene", async (c) => {
  const body = await c.req.json<{ next_room_id?: string }>();
  return respond(c, gm.handleAdvanceScene(c.get("user").userId, body));
});

dm.get("/party-state", (c) => respond(c, gm.handleGetPartyState(c.get("user").userId)));
dm.get("/room-state", (c) => respond(c, gm.handleGetRoomState(c.get("user").userId)));

dm.post("/award-xp", async (c) => {
  const body = await c.req.json<{ amount: number }>();
  return respond(c, gm.handleAwardXp(c.get("user").userId, body));
});

dm.get("/items", (c) => {
  const category = c.req.query("category");
  return respond(c, gm.handleListItems(c.get("user").userId, { category }));
});

dm.post("/award-loot", async (c) => {
  const body = await c.req.json<{ player_id: string; item_id: string }>();
  return respond(c, gm.handleAwardLoot(c.get("user").userId, body));
});

dm.post("/loot-room", async (c) => {
  const body = await c.req.json<{ player_id: string }>();
  return respond(c, gm.handleLootRoom(c.get("user").userId, body));
});

dm.post("/create-custom-monster", async (c) => {
  const body = await c.req.json();
  return respond(c, gm.handleCreateCustomMonster(c.get("user").userId, body as Parameters<typeof gm.handleCreateCustomMonster>[1]));
});

dm.get("/monster-templates", (c) => respond(c, gm.handleListCustomMonsters(c.get("user").userId)));

dm.post("/campaign", async (c) => {
  const body = await c.req.json<{ name: string; description?: string }>();
  return respond(c, gm.handleCreateCampaign(c.get("user").userId, body));
});

dm.get("/campaign", (c) => respond(c, gm.handleGetCampaign(c.get("user").userId)));

dm.post("/story-flag", async (c) => {
  const body = await c.req.json<{ key: string; value: unknown }>();
  return respond(c, gm.handleSetStoryFlag(c.get("user").userId, body));
});

dm.post("/end-session", async (c) => {
  const body = await c.req.json<{ summary: string; completed_dungeon?: string }>();
  return respond(c, gm.handleEndSession(c.get("user").userId, body));
});

// Monster attack — DM executes a monster's turn
dm.post("/monster-attack", async (c) => {
  const body = await c.req.json<{ monster_id: string; target_id: string; attack_name?: string }>();
  return respond(c, gm.handleMonsterAttack(c.get("user").userId, body));
});

// Convenience aliases for combat flow
dm.post("/next-turn", (c) => {
  return c.json({ error: "Use monster-attack to resolve the current monster's turn (it auto-advances). Player turns advance when players act." }, 400);
});

// Also allow DM to queue
dm.post("/queue", (c) => respond(c, gm.handleDMQueueForParty(c.get("user").userId)));

rest.route("/dm", dm);
rest.route("/", player);

export default rest;
