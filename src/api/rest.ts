/**
 * HTTP REST API — wired to the game manager for real gameplay.
 */

import { Hono, type Context } from "hono";
import { createMiddleware } from "hono/factory";
import { getAuthUser, persistModelIdentity } from "./auth.ts";
import type { UserRole, Race, CharacterClass, AbilityScores } from "../types.ts";
import * as gm from "../game/game-manager.ts";

interface AuthUser {
  userId: string;
  username: string;
  role: "player" | "dm";
  modelIdentity: { provider: string; name: string } | null;
}

type AuthEnv = { Variables: { user: AuthUser } };

const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  // CC-260428 Task 3: admin endpoints authenticate via ADMIN_SECRET in their
  // own sub-router middleware, not the user-token flow. Let those paths through
  // so the admin router can run its own auth check. Without this skip, the
  // admin Bearer token would be rejected here as a non-user token.
  if (c.req.path.startsWith("/api/v1/admin/") || c.req.path === "/api/v1/admin") {
    await next();
    return;
  }

  const header = c.req.header("Authorization");
  const user = await getAuthUser(header);
  if (!user) return c.json({ error: "Unauthorized — provide a valid Bearer token", code: "UNAUTHORIZED", reason_code: "UNAUTHORIZED" }, 401);

  // X-Model-Identity header overrides stored model identity for this request and persists to DB
  const modelHeader = c.req.header("X-Model-Identity");
  if (modelHeader && modelHeader.includes("/")) {
    const [provider, ...rest] = modelHeader.split("/");
    user.modelIdentity = { provider: provider!, name: rest.join("/") };
    persistModelIdentity(user.userId, provider!, rest.join("/"));
  }

  // Store model identity in game manager for event tagging
  if (user.modelIdentity) {
    gm.setRequestModelIdentity(user.userId, user.modelIdentity);
  }

  c.set("user", user);
  await next();
});

function requireRole(role: UserRole) {
  return createMiddleware<AuthEnv>(async (c, next) => {
    const user = c.get("user");
    if (user.role !== role) {
      return c.json({ error: `Forbidden — requires '${role}' role, you are '${user.role}'`, code: "FORBIDDEN", reason_code: "FORBIDDEN_ROLE" }, 403);
    }
    await next();
  });
}

/**
 * Respond to client. On success, spreads result.data into JSON body.
 * On failure, spreads result.data into the 4xx body for structured error context
 * (e.g., queue_status on 409). Do NOT include sensitive or large data in result.data
 * on failure paths — it will appear in the error response.
 */
function respond(c: Context<AuthEnv>, result: { success: boolean; data?: Record<string, unknown>; error?: string; reason_code?: string }, statusCode?: number) {
  if (!result.success) {
    const reason = result.reason_code ?? "BAD_REQUEST";
    const status = (statusCode ?? 400) as 400 | 409;
    console.log(`[${status}] ${c.req.method} ${new URL(c.req.url).pathname} reason=${reason} user=${c.get("user")?.userId ?? "unknown"}`);
    return c.json({ error: result.error, code: "BAD_REQUEST", reason_code: reason, ...(result.data ?? {}) }, status);
  }
  return c.json({ success: true, ...result.data });
}

const rest = new Hono<AuthEnv>();
rest.use("/*", requireAuth);

// === Player routes ===
const player = new Hono<AuthEnv>();
// Guard: when player sub-router is mounted at "/" via rest.route("/", player),
// this middleware leaks to /dm/* paths. Skip role check for DM routes.
player.use("/*", createMiddleware<AuthEnv>(async (c, next) => {
  if (c.req.path.includes("/dm/") || c.req.path.endsWith("/dm")) {
    await next();
    return;
  }
  // CC-260428 Task 3: same exception for admin paths — admin sub-router has
  // its own ADMIN_SECRET auth and no `user` is set in context for admin
  // requests, so the role check below would crash on c.get("user").
  if (c.req.path.includes("/admin/") || c.req.path.endsWith("/admin")) {
    await next();
    return;
  }
  const user = c.get("user");
  if (user.role !== "player") {
    return c.json({ error: `Forbidden — requires 'player' role, you are '${user.role}'`, code: "FORBIDDEN", reason_code: "FORBIDDEN_ROLE" }, 403);
  }
  await next();
}));

player.post("/character", async (c) => {
  const body = await c.req.json<{
    name: string; race: Race; class: CharacterClass;
    ability_scores: AbilityScores;
    backstory?: string; personality?: string; playstyle?: string;
    avatar_url?: string; description?: string;
    flaw?: string; bond?: string; ideal?: string; fear?: string;
    decisionTimeMs?: number;
  }>();
  const result = await gm.handleCreateCharacter(c.get("user").userId, body);
  if (!result.success) return c.json({ error: result.error, code: "BAD_REQUEST", reason_code: result.reason_code ?? "BAD_REQUEST" }, 400);
  const ch = result.character!;
  return c.json({
    character: {
      id: ch.id,
      name: ch.name,
      class: ch.class,
      race: ch.race,
      level: ch.level,
      hpCurrent: ch.hpCurrent,
      hpMax: ch.hpMax,
      ac: ch.ac,
      avatarUrl: ch.avatarUrl,
      description: ch.description,
      abilityScores: ch.abilityScores,
      inventory: ch.inventory,
      equipment: ch.equipment,
      features: ch.features,
      proficiencies: ch.proficiencies,
    }
  }, 201);
});

player.patch("/character", async (c) => {
  const body = await c.req.json<{ avatar_url?: string; description?: string }>();
  return respond(c, await gm.handleUpdateCharacter(c.get("user").userId, body));
});

player.delete("/character", (c) => respond(c, gm.handleDeleteCharacter(c.get("user").userId)));

player.get("/look", (c) => respond(c, gm.handleLook(c.get("user").userId)));
player.get("/status", (c) => respond(c, gm.handleGetStatus(c.get("user").userId)));
player.get("/party", (c) => respond(c, gm.handleGetParty(c.get("user").userId)));
player.get("/inventory", (c) => respond(c, gm.handleGetInventory(c.get("user").userId)));
player.get("/actions", (c) => respond(c, gm.handleGetAvailableActions(c.get("user").userId)));
player.get("/available-actions", (c) => respond(c, gm.handleGetAvailableActions(c.get("user").userId)));

player.post("/move", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const direction_or_target = (body.direction_or_target ?? body.room_id ?? body.direction) as string;
  if (!direction_or_target) return respond(c, { success: false, error: "Missing direction_or_target, room_id, or direction." });
  return respond(c, gm.handleMove(c.get("user").userId, { direction_or_target }));
});

player.post("/attack", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const target_id = (body.target_id ?? body.target) as string | undefined;
  if (!target_id) return respond(c, { success: false, error: "Missing required field: target_id", reason_code: "MISSING_FIELD" });
  return respond(c, gm.handleAttack(c.get("user").userId, { target_id, weapon: body.weapon as string | undefined }));
});

player.post("/cast", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const spell_name = (body.spell_name ?? body.spell) as string | undefined;
  if (!spell_name) return respond(c, { success: false, error: "Missing required field: spell_name", reason_code: "MISSING_FIELD" });
  const target_id = (body.target_id ?? body.target) as string | undefined;
  return respond(c, gm.handleCast(c.get("user").userId, { spell_name, target_id }));
});

player.post("/use-item", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const item_name = (body.item_name ?? body.item ?? body.item_id) as string | undefined;
  if (!item_name) return respond(c, { success: false, error: "Missing required field: item_name", reason_code: "MISSING_FIELD" });
  return respond(c, gm.handleUseItem(c.get("user").userId, { item_name, target_id: body.target_id as string | undefined }));
});

player.post("/dodge", (c) => respond(c, gm.handleDodge(c.get("user").userId)));
player.post("/dash", (c) => respond(c, gm.handleDash(c.get("user").userId)));
player.post("/disengage", (c) => respond(c, gm.handleDisengage(c.get("user").userId)));

player.post("/help", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const target_id = (body.target_id ?? body.target) as string | undefined;
  if (!target_id) return respond(c, { success: false, error: "Missing required field: target_id", reason_code: "MISSING_FIELD" });
  return respond(c, gm.handleHelp(c.get("user").userId, { target_id }));
});

player.post("/hide", (c) => respond(c, gm.handleHide(c.get("user").userId)));

player.post("/skill-check", async (c) => {
  const body = await c.req.json<{ skill?: string; target_id?: string; tool_proficiency?: string; dc?: number }>();
  if (!body?.skill) return respond(c, { success: false, error: "Missing required field: skill", reason_code: "MISSING_FIELD" });
  return respond(c, gm.handleSkillCheck(c.get("user").userId, { skill: body.skill, target_id: body.target_id, tool_proficiency: body.tool_proficiency, dc: body.dc }));
});

player.post("/bonus-action", async (c) => {
  const body = await c.req.json<{ action?: string; spell_name?: string; target_id?: string }>();
  const action = body.action ?? (body.spell_name ? "cast" : "");
  return respond(c, gm.handleBonusAction(c.get("user").userId, { ...body, action }));
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
  const body = await c.req.json<Record<string, string>>();
  const player_id = body.player_id ?? body.target_id ?? body.targetId ?? body.target;
  return respond(c, gm.handleWhisper(c.get("user").userId, { player_id, message: body.message }));
});

player.post("/journal", async (c) => {
  const body = await c.req.json<{ entry: string }>();
  return respond(c, gm.handleJournalAdd(c.get("user").userId, body));
});

player.post("/pickup", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const item_name = (body.item_name ?? body.item) as string | undefined;
  if (!item_name) return respond(c, { success: false, error: "Missing required field: item_name", reason_code: "MISSING_FIELD" });
  return respond(c, gm.handlePickupItem(c.get("user").userId, { item_name }));
});

player.post("/equip", async (c) => {
  const body = await c.req.json<{ item_name: string }>();
  return respond(c, gm.handleEquipItem(c.get("user").userId, body));
});

player.post("/unequip", async (c) => {
  const body = await c.req.json<{ slot: string }>();
  return respond(c, gm.handleUnequipItem(c.get("user").userId, body));
});

player.post("/queue", (c) => {
  const result = gm.handleQueueForParty(c.get("user").userId);
  return respond(c, result, result.reason_code === "ALREADY_QUEUED" ? 409 : undefined);
});
player.delete("/queue", (c) => respond(c, gm.handleLeaveQueue(c.get("user").userId)));

// === DM routes ===
const dm = new Hono<AuthEnv>();
dm.use("/*", requireRole("dm"));

dm.get("/actions", (c) => respond(c, gm.handleGetDmActions(c.get("user").userId)));

dm.post("/narrate", async (c) => {
  const body = await c.req.json<{
    text?: string; message?: string; style?: string;
    type?: "scene" | "npc_dialogue" | "atmosphere" | "transition" | "intercut" | "ruling";
    npcId?: string; npc_id?: string; metadata?: Record<string, unknown>;
    meta?: { intent?: string; reasoning?: string; references?: string[] };
  }>();
  const text = body.text ?? body.message;
  if (!text) return respond(c, { success: false, error: "Missing 'text' (or 'message') field in narration body." });
  return respond(c, gm.handleNarrate(c.get("user").userId, { text, style: body.style, type: body.type, npcId: body.npcId ?? body.npc_id, metadata: body.metadata, meta: body.meta }));
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
  const body = await c.req.json<{ npc_id?: string; name?: string; dialogue?: string; message?: string }>();
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

dm.post("/deal-environment-damage", async (c) => {
  const body = await c.req.json<{ player_id?: string; target_id?: string; notation?: string; damage?: number | string; type?: string; damage_type?: string; description?: string }>();
  return respond(c, gm.handleDealEnvironmentDamage(c.get("user").userId, body));
});

dm.post("/advance-scene", async (c) => {
  let body: { next_room_id?: string; exit_id?: string; room_id?: string } = {};
  try { body = await c.req.json(); } catch { /* empty body is fine — all params optional */ }
  return respond(c, gm.handleAdvanceScene(c.get("user").userId, body));
});

dm.get("/party-state", (c) => respond(c, gm.handleGetPartyState(c.get("user").userId)));
dm.get("/room-state", (c) => respond(c, gm.handleGetRoomState(c.get("user").userId)));

dm.post("/award-xp", async (c) => {
  const body = await c.req.json<{ amount: number }>();
  return respond(c, gm.handleAwardXp(c.get("user").userId, body));
});

dm.post("/award-gold", async (c) => {
  const body = await c.req.json<{ amount: number; player_id?: string }>();
  return respond(c, gm.handleAwardGold(c.get("user").userId, body));
});

dm.get("/items", (c) => {
  const category = c.req.query("category");
  return respond(c, gm.handleListItems(c.get("user").userId, { category }));
});

dm.post("/award-loot", async (c) => {
  const body = await c.req.json<Record<string, unknown>>();
  const player_id = (body.player_id ?? body.recipient) as string;
  const rawItemName = body.item_name ?? body.item_id ?? body.name;
  const item_name = rawItemName ? (rawItemName as string) : undefined;
  const gold = body.gold as number | undefined;
  return respond(c, gm.handleAwardLoot(c.get("user").userId, { player_id, item_name, gold }));
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

dm.post("/set-session-metadata", async (c) => {
  const body = await c.req.json<{ worldDescription?: string; style?: string; tone?: string; setting?: string; decisionTimeMs?: number; title?: string; description?: string }>();
  return respond(c, gm.handleSetSessionMetadata(c.get("user").userId, body));
});

dm.post("/end-session", async (c) => {
  const body = await c.req.json<{ summary: string; completed_dungeon?: string }>();
  return respond(c, gm.handleEndSession(c.get("user").userId, body));
});

dm.post("/start-campaign-session", (c) => respond(c, gm.handleStartCampaignSession(c.get("user").userId)));

dm.post("/unlock-exit", async (c) => {
  const body = await c.req.json<{ target_room_id: string }>();
  return respond(c, gm.handleUnlockExit(c.get("user").userId, body));
});

// Monster attack — DM executes a monster's turn
dm.post("/monster-attack", async (c) => {
  const body = await c.req.json<{ monster_id: string; target_id?: string; target?: string; target_name?: string; attack_name?: string }>();
  return respond(c, gm.handleMonsterAttack(c.get("user").userId, body));
});

// Monster non-attack action (dodge, dash, disengage, flee, hold) — advances initiative
dm.post("/monster-action", async (c) => {
  const body = await c.req.json<{ monster_id: string; action: string }>();
  return respond(c, gm.handleMonsterAction(c.get("user").userId, body));
});

// Force-skip current combatant's turn (AFK/disconnect recovery)
dm.post("/skip-turn", async (c) => {
  const body = await c.req.json<{ reason?: string }>().catch(() => ({}));
  return respond(c, gm.handleForceSkipTurn(c.get("user").userId, body));
});

// Convenience aliases for combat flow
dm.post("/next-turn", (c) => {
  return c.json({ error: "Use monster-attack to resolve the current monster's turn (it auto-advances). Player turns advance when players act.", code: "BAD_REQUEST", reason_code: "WRONG_TURN_TYPE" }, 400);
});

// NPC management
dm.post("/npc", async (c) => {
  const body = await c.req.json<{ name: string; description: string; personality?: string; location?: string; disposition?: number; tags?: string[]; knowledge?: string[]; goals?: string[]; relationships?: Record<string, string>; standingOrders?: string }>();
  return respond(c, gm.handleCreateNpc(c.get("user").userId, body));
});

dm.get("/npc/:npc_id", (c) => respond(c, gm.handleGetNpc(c.get("user").userId, { npc_id: c.req.param("npc_id") })));

dm.get("/npcs", (c) => {
  const tag = c.req.query("tag");
  const location = c.req.query("location");
  return respond(c, gm.handleListNpcs(c.get("user").userId, { tag, location }));
});

dm.patch("/npc/:npc_id", async (c) => {
  const body = await c.req.json<{ description?: string; personality?: string; location?: string; tags?: string[]; is_alive?: boolean; knowledge?: string[]; goals?: string[]; relationships?: Record<string, string>; standingOrders?: string }>();
  return respond(c, gm.handleUpdateNpc(c.get("user").userId, { npc_id: c.req.param("npc_id"), ...body }));
});

dm.post("/npc/:npc_id/disposition", async (c) => {
  const body = await c.req.json<{ change: number; reason: string }>();
  return respond(c, gm.handleUpdateNpcDisposition(c.get("user").userId, { npc_id: c.req.param("npc_id"), ...body }));
});

// Quest tracking
dm.post("/quest", async (c) => {
  const body = await c.req.json<{ title: string; description: string; giver_npc_id?: string }>();
  return respond(c, gm.handleAddQuest(c.get("user").userId, body));
});

dm.patch("/quest/:quest_id", async (c) => {
  const body = await c.req.json<{ status?: "active" | "completed" | "failed"; description?: string }>();
  return respond(c, gm.handleUpdateQuest(c.get("user").userId, { quest_id: c.req.param("quest_id"), ...body }));
});

dm.get("/quests", (c) => {
  const status = c.req.query("status");
  return respond(c, gm.handleListQuests(c.get("user").userId, { status }));
});

// Also allow DM to queue
dm.post("/queue", (c) => {
  const result = gm.handleDMQueueForParty(c.get("user").userId);
  return respond(c, result, result.reason_code === "ALREADY_QUEUED" ? 409 : undefined);
});
dm.delete("/queue", (c) => respond(c, gm.handleDMLeaveQueue(c.get("user").userId)));

// DM journal — session notes
dm.post("/journal", async (c) => {
  const body = await c.req.json<{ entry: string }>();
  return respond(c, gm.handleDMJournal(c.get("user").userId, body));
});

// --- Sprint J: Conversation lifecycle ---
dm.post("/start-conversation", async (c) => {
  const body = await c.req.json<{
    participants: { type: "player" | "npc"; id: string; name: string }[];
    context: string;
    geometry?: string;
  }>();
  return respond(c, gm.handleStartConversation(c.get("user").userId, body));
});

dm.post("/end-conversation", async (c) => {
  const body = await c.req.json<{
    conversationId: string;
    outcome: string;
    relationshipDelta?: Record<string, number>;
  }>();
  return respond(c, gm.handleEndConversation(c.get("user").userId, body));
});

// --- Sprint J: Information items ---
dm.post("/info", async (c) => {
  const body = await c.req.json();
  return respond(c, gm.handleCreateInfoItem(c.get("user").userId, body));
});

dm.post("/reveal-info", async (c) => {
  const body = await c.req.json();
  return respond(c, gm.handleRevealInfo(c.get("user").userId, body));
});

dm.patch("/info/:infoId", async (c) => {
  const body = await c.req.json();
  return respond(c, gm.handleUpdateInfoItem(c.get("user").userId, { infoId: c.req.param("infoId"), ...body }));
});

dm.get("/info", (c) => respond(c, gm.handleListInfoItems(c.get("user").userId)));

// --- Sprint J: Session clocks ---
dm.post("/clock", async (c) => {
  const body = await c.req.json();
  return respond(c, gm.handleCreateClock(c.get("user").userId, body));
});

dm.post("/clock/:clockId/advance", async (c) => {
  const body = await c.req.json<{ turns?: number }>().catch(() => ({}));
  return respond(c, gm.handleAdvanceClock(c.get("user").userId, { clockId: c.req.param("clockId"), ...body }));
});

dm.post("/clock/:clockId/resolve", async (c) => {
  const body = await c.req.json<{ outcome: string }>();
  return respond(c, gm.handleResolveClock(c.get("user").userId, { clockId: c.req.param("clockId"), ...body }));
});

dm.get("/clocks", (c) => respond(c, gm.handleListClocks(c.get("user").userId)));

// --- Sprint J: Time passage ---
dm.post("/advance-time", async (c) => {
  const body = await c.req.json<{ amount: number; unit: "minutes" | "hours" | "days" | "weeks"; narrative: string }>();
  return respond(c, gm.handleAdvanceTime(c.get("user").userId, body));
});

// === Admin routes (ADMIN_SECRET auth) ===
// CC-260428 Task 3: diagnostic snapshot of queue + active sessions for operators.
// Reuses the existing ADMIN_SECRET pattern from /admin/login-as in src/api/auth.ts.
const admin = new Hono<AuthEnv>();
admin.use("/*", async (c, next) => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) return c.json({ error: "Admin endpoint not configured" }, 503);
  const authHeader = c.req.header("Authorization");
  if (!authHeader || authHeader !== `Bearer ${adminSecret}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

admin.get("/queue-state", (c) => c.json(gm.getQueueState()));

rest.route("/admin", admin);

rest.route("/dm", dm);
rest.route("/", player);

export default rest;
