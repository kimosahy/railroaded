/**
 * In-memory game state manager.
 *
 * Bridges the API layer to the engine. Manages characters, parties,
 * sessions, and routes tool calls to the correct engine functions.
 *
 * For MVP, this runs entirely in-memory. Database persistence comes later.
 */

import {
  createCharacter as buildCharacter,
  validateAbilityScores,
  classFeatures,
  type CharacterSheet,
} from "./character-creation.ts";
import {
  createDungeonState,
  getCurrentRoom,
  getAvailableExits,
  moveToRoom,
  unlockConnection,
  discoverConnection,
  type DungeonState,
} from "./dungeon.ts";
import {
  spawnMonsters,
  rollEncounterInitiative,
  damageMonster,
  calculateEncounterXP,
  isEncounterOver,
  getAliveMonsters,
  type MonsterInstance,
  type MonsterAttack,
} from "./encounters.ts";
import {
  createSession,
  enterCombat,
  exitCombat,
  nextTurn,
  getCurrentCombatant,
  removeCombatant,
  endSession as endSessionState,
  shouldCombatEnd,
  freshTurnResources,
  type SessionState,
  type InitiativeSlot,
  type TurnResources,
} from "./session.ts";
import { getAllowedActions, getAllowedDMActions } from "./turns.ts";
import { tryMatchParty, SYSTEM_DM_ID, PARTY_SIZE, type QueueEntry, type MatchResult } from "./matchmaker.ts";
import { resolveAttack, meleeAttackParams, rangedAttackParams } from "../engine/combat.ts";
import { abilityCheck, savingThrow, groupCheck, proficiencyBonus } from "../engine/checks.ts";
import { applyDamage, applyHealing, handleDropToZero, handleRegainFromZero, addCondition, removeCondition, hasCondition, calculateAC, calculateMaxHP } from "../engine/hp.ts";
import { castSpell, spellSaveDC, spellAttackBonus, getMaxSpellSlots, type SpellDefinition } from "../engine/spells.ts";
import { deathSave, applyDeathSaveConditions, resetDeathSaves, damageAtZeroHP } from "../engine/death.ts";
import { shortRest as doShortRest, longRest as doLongRest, hitDieForClass, hitDieSidesForClass } from "../engine/rest.ts";
import { roll, abilityModifier } from "../engine/dice.ts";
import { rollLootTable, type LootTableEntry } from "../engine/loot.ts";
import { getRandomTemplate, type DungeonTemplate, type TemplateEncounter, type TemplateLootTable } from "./templates.ts";
import { summarizeSession, filterEventsForCharacter, type SessionEvent } from "./journal.ts";
import { VALID_RACES, VALID_CLASSES } from "../types.ts";
import type { Race, CharacterClass, AbilityScores, Condition, SessionPhase, DeathSaves } from "../types.ts";
import { parse as parseYAML } from "yaml";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { db } from "../db/connection.ts";
import { sessionEvents as sessionEventsTable, parties as partiesTable, gameSessions as gameSessionsTable, characters as charactersTable, customMonsterTemplates as customMonsterTemplatesTable, campaigns as campaignsTable, npcs as npcsTable, npcInteractions as npcInteractionsTable, dmStats as dmStatsTable, users as usersTable, campaignTemplates as campaignTemplatesTable } from "../db/schema.ts";
import { getDbUserId, findUserIdByDbId } from "../api/auth.ts";
import { eq, asc, desc } from "drizzle-orm";
import { broadcastToParty, sendToUser } from "../api/ws.ts";
import type { AbilityName } from "../types.ts";

const ABILITY_ALIASES: Record<string, AbilityName> = {
  str: "str", strength: "str",
  dex: "dex", dexterity: "dex",
  con: "con", constitution: "con",
  int: "int", intelligence: "int",
  wis: "wis", wisdom: "wis",
  cha: "cha", charisma: "cha",
};

function normalizeAbility(raw: string): AbilityName | null {
  return ABILITY_ALIASES[raw.toLowerCase()] ?? null;
}

// --- In-memory state ---

interface GameCharacter extends CharacterSheet {
  id: string;
  userId: string;
  partyId: string | null;
  conditions: Condition[];
  deathSaves: DeathSaves;
  dbCharId: string | null; // UUID from characters table
  // Lifetime stats
  monstersKilled: number;
  dungeonsCleared: number;
  sessionsPlayed: number;
  totalDamageDealt: number;
  criticalHits: number;
  timesKnockedOut: number;
  goldEarned: number;
  relentlessEnduranceUsed: boolean;
}

interface GameParty {
  id: string;
  name: string;
  members: string[]; // character IDs
  dmUserId: string | null;
  dungeonState: DungeonState | null;
  session: SessionState | null;
  monsters: MonsterInstance[];
  events: SessionEvent[];
  templateEncounters: Map<string, TemplateEncounter>; // roomId → encounter
  triggeredEncounters: Set<string>;                   // roomIds already triggered
  templateLootTables: Map<string, TemplateLootTable>; // roomId → loot table
  lootedRooms: Set<string>;                           // roomIds already looted
  groundItems: { itemName: string; quantity: number }[]; // items on the ground from monster drops
  campaignId: string | null;    // in-memory campaign ID
  dbPartyId: string | null;     // UUID from parties table
  dbSessionId: string | null;   // UUID from game_sessions table
  dbReady: Promise<void> | null; // resolves when DB session row exists
}

interface CampaignQuest {
  id: string;
  title: string;
  description: string;
  status: "active" | "completed" | "failed";
  giver_npc_id?: string;
}

interface SessionHistoryEntry {
  session_number: number;
  summary: string;
  completed_dungeon?: string;
}

interface GameCampaign {
  id: string;
  name: string;
  description: string;
  createdByUserId: string | null;
  partyId: string | null;          // in-memory party ID once assigned
  storyFlags: Record<string, unknown>;
  completedDungeons: string[];
  quests: CampaignQuest[];
  sessionHistory: SessionHistoryEntry[];
  sessionCount: number;
  status: "active" | "completed" | "abandoned";
  dbCampaignId: string | null;     // UUID from campaigns table
}

interface NpcMemoryEntry {
  sessionId: string;
  event: string;
  summary: string;
  dispositionAtTime: number;
}

interface GameNPC {
  id: string;
  campaignId: string;             // in-memory campaign ID
  name: string;
  description: string;
  personality: string;
  location: string | null;
  disposition: number;            // -100 to +100
  dispositionLabel: string;
  isAlive: boolean;
  tags: string[];
  memory: NpcMemoryEntry[];       // last 20 interactions
  dbNpcId: string | null;         // UUID from npcs table
}

const characters = new Map<string, GameCharacter>();
const charactersByUser = new Map<string, string>(); // userId → characterId
const parties = new Map<string, GameParty>();
const campaignsMap = new Map<string, GameCampaign>();
const npcsMap = new Map<string, GameNPC>();           // npcId → GameNPC
const playerQueue: QueueEntry[] = [];
const dmQueue: QueueEntry[] = [];

// XP thresholds per level (from game-mechanics.md)
const XP_THRESHOLDS: Record<number, number> = { 1: 0, 2: 300, 3: 900, 4: 2700, 5: 6500 };
const MAX_LEVEL = 5;

/**
 * Check if a character qualifies for a level up and apply it.
 * Handles multi-level jumps (e.g. large XP awards).
 * Returns level-up details if leveled, null otherwise.
 */
function checkLevelUp(char: GameCharacter): { newLevel: number; hpGain: number; newFeatures: string[] } | null {
  // Guard against NaN XP — if XP is somehow corrupted, don't level up
  if (!Number.isFinite(char.xp)) return null;

  const startLevel = char.level;
  let totalHpGain = 0;
  const allNewFeatures: string[] = [];

  while (char.level < MAX_LEVEL) {
    const nextLevel = char.level + 1;
    const threshold = XP_THRESHOLDS[nextLevel];
    if (threshold === undefined || char.xp < threshold) break;

    char.level = nextLevel;

    // HP increase: recalculate from scratch for accuracy
    const conMod = abilityModifier(char.abilityScores.con);
    const newMaxHP = calculateMaxHP(hitDieSidesForClass(char.class), conMod, nextLevel);
    const hpGain = newMaxHP - char.hpMax;
    totalHpGain += hpGain;
    char.hpMax = newMaxHP;
    char.hpCurrent += hpGain;

    // Hit dice: max = level
    char.hitDice = { ...char.hitDice, max: nextLevel };

    // Spell slots: recalculate for new level
    const newSlots = getMaxSpellSlots(nextLevel, char.class);
    const l1Gain = newSlots.level_1.max - char.spellSlots.level_1.max;
    const l2Gain = newSlots.level_2.max - char.spellSlots.level_2.max;
    char.spellSlots = {
      level_1: { current: char.spellSlots.level_1.current + Math.max(0, l1Gain), max: newSlots.level_1.max },
      level_2: { current: char.spellSlots.level_2.current + Math.max(0, l2Gain), max: newSlots.level_2.max },
    };

    // Class features at new level
    const levelFeatures = classFeatures(char.class, nextLevel);
    const newFeatures = levelFeatures.filter((f) => !char.features.includes(f));
    char.features.push(...newFeatures);
    allNewFeatures.push(...newFeatures);
  }

  if (char.level === startLevel) return null;
  return { newLevel: char.level, hpGain: totalHpGain, newFeatures: allNewFeatures };
}

// Spell definitions loaded from YAML (simplified for in-memory)
const spellDefs = new Map<string, SpellDefinition>();

/** Look up a spell by name, tolerating snake_case and case differences. */
function findSpell(name: string): SpellDefinition | undefined {
  // Try exact match first
  const exact = spellDefs.get(name);
  if (exact) return exact;
  // Normalize: replace underscores with spaces, lowercase compare
  const normalized = name.replace(/_/g, " ").toLowerCase();
  for (const [key, spell] of spellDefs) {
    if (key.toLowerCase() === normalized) return spell;
  }
  return undefined;
}

// Item definitions loaded from items.yaml
export interface ItemDef {
  name: string;
  category: "weapon" | "armor" | "potion" | "scroll" | "magic_item" | "misc";
  description: string;
  damage?: string;
  damageType?: string;
  properties?: string[];
  acBase?: number;
  acDexCap?: number | null;
  armorType?: string;
  healAmount?: string;
  spellName?: string;
  baseWeapon?: string;
  magicBonus?: number;
  magicType?: string;
}

const itemDefs = new Map<string, ItemDef>();

export function getItemDef(name: string): ItemDef | undefined {
  return itemDefs.get(name);
}

export function getAllItems(): ItemDef[] {
  return [...itemDefs.values()];
}

export function getItemsByCategory(category: string): ItemDef[] {
  return [...itemDefs.values()].filter((i) => i.category === category);
}

// Monster templates
const monsterTemplates = new Map<string, {
  hpMax: number;
  ac: number;
  abilityScores: AbilityScores;
  attacks: MonsterAttack[];
  specialAbilities: string[];
  xpValue: number;
  lootTable?: LootTableEntry[];
  vulnerabilities?: string[];
  immunities?: string[];
  resistances?: string[];
}>();

let idCounter = 1;
function nextId(prefix: string): string {
  return `${prefix}-${idCounter++}`;
}

/** Push WebSocket notifications when the current combatant changes. */
function notifyTurnChange(party: GameParty): void {
  if (!party.session || party.session.phase !== "combat") return;
  const current = getCurrentCombatant(party.session);
  if (!current) return;

  broadcastToParty(party.id, {
    type: "turn_notify",
    entityId: current.entityId,
    entityType: current.type,
    phase: party.session.phase,
  });

  if (current.type === "player") {
    const char = characters.get(current.entityId);
    if (char) {
      sendToUser(char.userId, {
        type: "your_turn",
        characterId: current.entityId,
        phase: party.session.phase,
      });
    }
  }

  if (current.type === "monster" && party.dmUserId) {
    sendToUser(party.dmUserId, {
      type: "your_turn",
      monsterId: current.entityId,
      phase: party.session.phase,
    });
  }
}

// --- Turn Resource Helpers ---

function getTurnResources(party: GameParty, entityId: string): TurnResources {
  return party.session?.turnResources[entityId] ?? freshTurnResources();
}

function setTurnResources(party: GameParty, entityId: string, resources: TurnResources): void {
  if (party.session) {
    party.session.turnResources[entityId] = resources;
  }
}

function resetTurnResources(party: GameParty, entityId: string): void {
  if (party.session) {
    party.session.turnResources[entityId] = freshTurnResources();
  }
}

// --- Unconscious / Incapacitated Guard ---

const UNCONSCIOUS_ERROR = "You are unconscious and cannot take that action.";

function requireConscious(char: GameCharacter): string | null {
  if (char.conditions.includes("unconscious") || char.conditions.includes("dead")) {
    return UNCONSCIOUS_ERROR;
  }
  return null;
}

/**
 * Check if Relentless Endurance should trigger after dropping to 0 HP.
 * Half-orc racial: once per long rest, drop to 1 HP instead of 0.
 * Returns true if the feature triggered (caller should skip unconscious handling).
 */
function checkRelentlessEndurance(char: GameCharacter): boolean {
  if (
    char.features.includes("Relentless Endurance") &&
    !char.relentlessEnduranceUsed
  ) {
    char.hpCurrent = 1;
    char.relentlessEnduranceUsed = true;
    return true;
  }
  return false;
}

// --- Avatar URL Validation ---

export async function validateAvatarUrl(url: string): Promise<{ valid: boolean; error?: string }> {
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { valid: false, error: "Avatar URL must use http or https protocol." };
    }
    // Reject known-ephemeral hosts (DALL-E URLs expire in ~2 hours)
    const ephemeralHosts = ["oaidalleapiprodscus.blob.core.windows.net", "dalleprodsec.blob.core.windows.net"];
    if (ephemeralHosts.some((h) => parsed.hostname.includes(h))) {
      return { valid: false, error: "DALL-E image URLs expire after ~2 hours. Upload to a permanent host (catbox.moe, imgur, etc.) and use that URL instead." };
    }
  } catch {
    return { valid: false, error: "Avatar URL is not a valid URL." };
  }

  // Skip network validation in test/dev (no DATABASE_URL = in-memory mode)
  if (!process.env.DATABASE_URL) return { valid: true };

  try {
    const resp = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(5000) });
    if (!resp.ok) {
      return { valid: false, error: `Avatar URL returned HTTP ${resp.status}. Provide a direct link to an image.` };
    }
    const contentType = resp.headers.get("content-type") ?? "";
    if (!contentType.startsWith("image/")) {
      return { valid: false, error: `Avatar URL content-type is "${contentType}", expected an image. Provide a direct link to a PNG/JPG/WebP image.` };
    }
    return { valid: true };
  } catch (err) {
    return { valid: false, error: `Avatar URL is not reachable: ${err instanceof Error ? err.message : "unknown error"}. Provide a direct link to an image.` };
  }
}

// --- Character Management ---

export async function handleCreateCharacter(userId: string, params: {
  name: string;
  race: Race;
  class: CharacterClass;
  ability_scores: AbilityScores;
  backstory?: string;
  personality?: string;
  playstyle?: string;
  avatar_url?: string;
  description?: string;
}): Promise<{ success: boolean; character?: GameCharacter; error?: string }> {
  // Check if user already has a character
  if (charactersByUser.has(userId)) {
    return { success: false, error: "You already have a character. One character per account." };
  }

  // Validate all required fields at once
  const requiredFields = ["name", "race", "class", "ability_scores"] as const;
  const missing = requiredFields.filter((f) => {
    const val = (params as Record<string, unknown>)[f];
    return val === undefined || val === null || val === "";
  });
  if (missing.length > 0) {
    return { success: false, error: `Missing required fields: ${missing.join(", ")}` };
  }

  // Validate race and class
  if (!VALID_RACES.includes(params.race as Race)) {
    return { success: false, error: `Invalid race. Must be one of: ${VALID_RACES.join(", ")}` };
  }
  if (!VALID_CLASSES.includes(params.class as CharacterClass)) {
    return { success: false, error: `Invalid class. Must be one of: ${VALID_CLASSES.join(", ")}` };
  }

  // Validate avatar URL if provided
  if (params.avatar_url) {
    const avatarCheck = await validateAvatarUrl(params.avatar_url);
    if (!avatarCheck.valid) {
      return { success: false, error: avatarCheck.error };
    }
  }

  const validation = validateAbilityScores(params.ability_scores);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const sheet = buildCharacter({
    name: params.name,
    race: params.race,
    class: params.class,
    abilityScores: params.ability_scores,
    backstory: params.backstory,
    personality: params.personality,
    playstyle: params.playstyle,
    avatarUrl: params.avatar_url,
    description: params.description,
  });

  const id = nextId("char");
  const character: GameCharacter = {
    ...sheet,
    id,
    userId,
    partyId: null,
    conditions: [],
    deathSaves: { successes: 0, failures: 0 },
    dbCharId: null,
    monstersKilled: 0,
    dungeonsCleared: 0,
    sessionsPlayed: 0,
    totalDamageDealt: 0,
    criticalHits: 0,
    timesKnockedOut: 0,
    goldEarned: 0,
    relentlessEnduranceUsed: false,
  };

  characters.set(id, character);
  charactersByUser.set(userId, id);

  // Persist to DB (fire-and-forget)
  const dbUserId = getDbUserId(userId);
  if (dbUserId) {
    db.insert(charactersTable).values({
      userId: dbUserId,
      name: sheet.name,
      race: sheet.race,
      class: sheet.class,
      level: sheet.level,
      xp: sheet.xp,
      gold: sheet.gold,
      abilityScores: sheet.abilityScores,
      hpCurrent: sheet.hpCurrent,
      hpMax: sheet.hpMax,
      ac: sheet.ac,
      spellSlots: sheet.spellSlots,
      hitDice: sheet.hitDice,
      inventory: sheet.inventory,
      equipment: sheet.equipment,
      proficiencies: sheet.proficiencies,
      features: sheet.features,
      conditions: [],
      backstory: sheet.backstory,
      personality: sheet.personality,
      playstyle: sheet.playstyle,
      avatarUrl: sheet.avatarUrl,
      description: sheet.description,
    }).returning({ id: charactersTable.id })
      .then(([row]) => { character.dbCharId = row.id; })
      .catch((err) => console.error("[DB] Failed to persist character:", err));
  }

  return { success: true, character };
}

// --- Character Update ---

export async function handleUpdateCharacter(userId: string, params: {
  avatar_url?: string;
  description?: string;
}): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found. Create one first." };

  // Validate avatar URL if provided
  if (params.avatar_url) {
    const avatarCheck = await validateAvatarUrl(params.avatar_url);
    if (!avatarCheck.valid) {
      return { success: false, error: avatarCheck.error };
    }
  }

  if (params.avatar_url !== undefined) char.avatarUrl = params.avatar_url;
  if (params.description !== undefined) char.description = params.description;

  // Persist to DB (fire-and-forget)
  if (char.dbCharId) {
    const updates: Record<string, unknown> = {};
    if (params.avatar_url !== undefined) updates.avatarUrl = params.avatar_url;
    if (params.description !== undefined) updates.description = params.description;
    if (Object.keys(updates).length > 0) {
      db.update(charactersTable)
        .set(updates)
        .where(eq(charactersTable.id, char.dbCharId))
        .catch((err) => console.error("[DB] Failed to update character:", err));
    }
  }

  return {
    success: true,
    data: {
      character: {
        id: char.id, name: char.name, race: char.race, class: char.class,
        level: char.level, xp: char.xp, hpCurrent: char.hpCurrent, hpMax: char.hpMax,
        ac: char.ac, avatarUrl: char.avatarUrl, description: char.description,
        equipment: char.equipment, inventory: char.inventory,
      },
    },
  };
}

// --- Query helpers ---

export function getCharacterForUser(userId: string): GameCharacter | null {
  const charId = charactersByUser.get(userId);
  if (!charId) return null;
  return characters.get(charId) ?? null;
}

export function getPartyForCharacter(characterId: string): GameParty | null {
  const char = characters.get(characterId);
  if (!char?.partyId) return null;
  return parties.get(char.partyId) ?? null;
}

export function getPartyForUser(userId: string): GameParty | null {
  const char = getCharacterForUser(userId);
  if (!char) return null;
  return getPartyForCharacter(char.id);
}

/**
 * Resolve a player_id parameter — accepts char-X (character ID), user-X (user ID), or character name.
 */
function resolveCharacter(playerId: string): GameCharacter | null {
  // Try by character ID or user ID first
  const byId = characters.get(playerId) ?? characters.get(charactersByUser.get(playerId) ?? "");
  if (byId) return byId;

  // Fallback: match by character name (case-insensitive)
  const lower = playerId.toLowerCase();
  for (const char of characters.values()) {
    if (char.name.toLowerCase() === lower) return char;
  }
  return null;
}

// --- Player Tool Handlers ---

export function handleLook(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found. Create one first." };

  const party = char.partyId ? parties.get(char.partyId) : null;
  if (!party?.dungeonState) {
    return { success: true, data: { description: "You are not in a dungeon. Queue for a party to begin adventuring.", location: "tavern" } };
  }

  const room = getCurrentRoom(party.dungeonState);
  if (!room) return { success: false, error: "Unable to determine current room." };

  const exits = getAvailableExits(party.dungeonState);
  const aliveMonsters = getAliveMonsters(party.monsters);

  return {
    success: true,
    data: {
      room: room.name,
      description: room.description,
      type: room.type,
      features: room.features,
      exits: exits.map((e) => ({ name: e.roomName, type: e.connectionType, id: e.roomId })),
      monsters: aliveMonsters.map((m) => ({ id: m.id, name: m.name, hp: m.isAlive ? "alive" : "dead", conditions: m.conditions })),
      partyMembers: party.members
        .map((mid) => characters.get(mid))
        .filter(Boolean)
        .map((c) => ({ name: c!.name, class: c!.class, condition: c!.conditions.length > 0 ? c!.conditions.join(", ") : "healthy" })),
      ...(party.groundItems.length > 0 ? { groundItems: party.groundItems.map((i) => ({ itemName: i.itemName, quantity: i.quantity })) } : {}),
    },
  };
}

export function handleGetStatus(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };

  // Build available spells list for spellcasters, grouped by level
  const availableSpells: Record<string, { name: string; castingTime: string; effect: string; isConcentration: boolean; range: string }[]> = {};
  if (char.class === "cleric" || char.class === "wizard") {
    for (const spell of spellDefs.values()) {
      if (!spell.classes.includes(char.class)) continue;
      const key = spell.level === 0 ? "cantrips" : `level_${spell.level}`;
      if (!availableSpells[key]) availableSpells[key] = [];
      availableSpells[key].push({
        name: spell.name,
        castingTime: spell.castingTime,
        effect: spell.effect,
        isConcentration: spell.isConcentration,
        range: spell.range,
      });
    }
  }

  return {
    success: true,
    data: {
      name: char.name,
      race: char.race,
      class: char.class,
      level: char.level,
      xp: char.xp,
      gold: char.gold,
      hp: { current: char.hpCurrent, max: char.hpMax },
      ac: char.ac,
      abilityScores: char.abilityScores,
      spellSlots: char.spellSlots,
      spells: Object.keys(availableSpells).length > 0 ? availableSpells : null,
      conditions: char.conditions,
      deathSaves: char.deathSaves,
      equipment: char.equipment,
      features: char.features,
    },
  };
}

export function handleGetParty(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };

  const party = char.partyId ? parties.get(char.partyId) : null;
  if (!party) return { success: true, data: { party: null, message: "Not in a party." } };

  const members = party.members
    .map((mid) => characters.get(mid))
    .filter(Boolean)
    .map((c) => ({
      id: c!.id,
      name: c!.name,
      class: c!.class,
      race: c!.race,
      level: c!.level,
      condition: c!.hpCurrent > c!.hpMax / 2 ? "healthy" : c!.hpCurrent > 0 ? "wounded" : "unconscious",
    }));

  return {
    success: true,
    data: { members, phase: party.session?.phase ?? "none" },
  };
}

export function handleGetInventory(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };

  const inventoryDetails = char.inventory.map((itemName) => {
    const def = itemDefs.get(itemName);
    if (!def) return { name: itemName };
    const entry: Record<string, unknown> = { name: def.name, category: def.category, description: def.description };
    if (def.damage) entry.damage = def.damage;
    if (def.damageType) entry.damageType = def.damageType;
    if (def.properties && def.properties.length > 0) entry.properties = def.properties;
    if (def.healAmount) entry.healAmount = def.healAmount;
    if (def.spellName) entry.spellName = def.spellName;
    if (def.acBase !== undefined) entry.acBase = def.acBase;
    if (def.magicBonus !== undefined) entry.magicBonus = def.magicBonus;
    return entry;
  });

  return {
    success: true,
    data: {
      equipment: char.equipment,
      inventory: inventoryDetails,
      gold: char.gold,
    },
  };
}

// Mapping from action (tool) name → REST route info.
// Action names use underscores (MCP tool convention) but REST routes use hyphens or shorter names.
const playerActionRoutes: Record<string, { method: string; path: string }> = {
  create_character:      { method: "POST", path: "/api/v1/character" },
  look:                  { method: "GET",  path: "/api/v1/look" },
  get_status:            { method: "GET",  path: "/api/v1/status" },
  get_party:             { method: "GET",  path: "/api/v1/party" },
  get_inventory:         { method: "GET",  path: "/api/v1/inventory" },
  get_available_actions: { method: "GET",  path: "/api/v1/actions" },
  move:                  { method: "POST", path: "/api/v1/move" },
  attack:                { method: "POST", path: "/api/v1/attack" },
  cast:                  { method: "POST", path: "/api/v1/cast" },
  use_item:              { method: "POST", path: "/api/v1/use-item" },
  dodge:                 { method: "POST", path: "/api/v1/dodge" },
  dash:                  { method: "POST", path: "/api/v1/dash" },
  disengage:             { method: "POST", path: "/api/v1/disengage" },
  help:                  { method: "POST", path: "/api/v1/help" },
  hide:                  { method: "POST", path: "/api/v1/hide" },
  bonus_action:          { method: "POST", path: "/api/v1/bonus-action" },
  reaction:              { method: "POST", path: "/api/v1/reaction" },
  end_turn:              { method: "POST", path: "/api/v1/end-turn" },
  death_save:            { method: "POST", path: "/api/v1/death-save" },
  short_rest:            { method: "POST", path: "/api/v1/short-rest" },
  long_rest:             { method: "POST", path: "/api/v1/long-rest" },
  party_chat:            { method: "POST", path: "/api/v1/chat" },
  whisper:               { method: "POST", path: "/api/v1/whisper" },
  journal_add:           { method: "POST", path: "/api/v1/journal" },
  pickup_item:           { method: "POST", path: "/api/v1/pickup" },
  equip_item:            { method: "POST", path: "/api/v1/equip" },
  unequip_item:          { method: "POST", path: "/api/v1/unequip" },
  queue:                 { method: "POST", path: "/api/v1/queue" },
  queue_for_party:       { method: "POST", path: "/api/v1/queue" },
};

const dmActionRoutes: Record<string, { method: string; path: string }> = {
  narrate:                    { method: "POST", path: "/api/v1/dm/narrate" },
  narrate_to:                 { method: "POST", path: "/api/v1/dm/narrate-to" },
  spawn_encounter:            { method: "POST", path: "/api/v1/dm/spawn-encounter" },
  trigger_encounter:          { method: "POST", path: "/api/v1/dm/trigger-encounter" },
  voice_npc:                  { method: "POST", path: "/api/v1/dm/voice-npc" },
  request_check:              { method: "POST", path: "/api/v1/dm/request-check" },
  request_save:               { method: "POST", path: "/api/v1/dm/request-save" },
  request_group_check:        { method: "POST", path: "/api/v1/dm/request-group-check" },
  request_contested_check:    { method: "POST", path: "/api/v1/dm/request-contested-check" },
  deal_environment_damage:    { method: "POST", path: "/api/v1/dm/deal-environment-damage" },
  advance_scene:              { method: "POST", path: "/api/v1/dm/advance-scene" },
  get_party_state:            { method: "GET",  path: "/api/v1/dm/party-state" },
  get_room_state:             { method: "GET",  path: "/api/v1/dm/room-state" },
  monster_attack:             { method: "POST", path: "/api/v1/dm/monster-attack" },
  award_xp:                   { method: "POST", path: "/api/v1/dm/award-xp" },
  award_loot:                 { method: "POST", path: "/api/v1/dm/award-loot" },
  award_gold:                 { method: "POST", path: "/api/v1/dm/award-gold" },
  end_session:                { method: "POST", path: "/api/v1/dm/end-session" },
};

function buildActionRoutes(actions: string[], routeMap: Record<string, { method: string; path: string }>): Record<string, { method: string; path: string }> {
  const routes: Record<string, { method: string; path: string }> = {};
  for (const action of actions) {
    if (routeMap[action]) routes[action] = routeMap[action];
  }
  return routes;
}

export function handleGetAvailableActions(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) {
    const actions = ["create_character"];
    return {
      success: true,
      data: {
        phase: "idle",
        isYourTurn: false,
        availableActions: actions,
        actionRoutes: buildActionRoutes(actions, playerActionRoutes),
      },
    };
  }

  const party = char.partyId ? parties.get(char.partyId) : null;

  if (!party?.session) {
    const actions = ["queue", "get_status", "get_inventory"];
    return {
      success: true,
      data: {
        phase: "idle",
        isYourTurn: false,
        availableActions: actions,
        actionRoutes: buildActionRoutes(actions, playerActionRoutes),
      },
    };
  }

  const phase = party.session.phase;

  const isCurrentTurn =
    party?.session
      ? getCurrentCombatant(party.session)?.entityId === char.id
      : false;

  const actions = getAllowedActions(phase, isCurrentTurn, char.conditions, char.hp);

  const turnResourceState = party?.session && phase === "combat"
    ? getTurnResources(party, char.id)
    : undefined;

  return {
    success: true,
    data: {
      phase, isYourTurn: isCurrentTurn, availableActions: actions,
      actionRoutes: buildActionRoutes(actions, playerActionRoutes),
      ...(turnResourceState ? { turnResources: turnResourceState } : {}),
    },
  };
}

export function handleAttack(userId: string, params: { target_id: string; weapon?: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };
  if (requireConscious(char)) return { success: false, error: UNCONSCIOUS_ERROR };

  const party = getPartyForCharacter(char.id);
  if (!party?.session || party.session.phase !== "combat") {
    return { success: false, error: "You can only attack during combat." };
  }

  // Check turn order
  const current = getCurrentCombatant(party.session);
  if (!current || current.entityId !== char.id) {
    return { success: false, error: "It's not your turn." };
  }

  // Check action resource
  const resources = getTurnResources(party, char.id);
  if (resources.actionUsed) {
    return { success: false, error: "You've already used your action this turn." };
  }

  // Find target monster
  const target = party.monsters.find((m) => m.id === params.target_id && m.isAlive);
  if (!target) return { success: false, error: `Target ${params.target_id} not found or already dead.` };

  // Consume action resource
  setTurnResources(party, char.id, { ...resources, actionUsed: true });

  // Determine weapon type from properties
  const weaponDamage = getWeaponDamage(char.equipment.weapon);
  const isRanged = weaponDamage.properties.includes("ranged");
  const profBonus = proficiencyBonus(char.level);

  const attackParams = isRanged
    ? rangedAttackParams(char.abilityScores, profBonus, weaponDamage)
    : meleeAttackParams(char.abilityScores, profBonus, weaponDamage);

  const result = resolveAttack({ ...attackParams, targetAC: target.ac });

  if (result.hit) {
    const { monster, killed } = damageMonster(target, result.totalDamage);
    // Update monster in party
    const idx = party.monsters.findIndex((m) => m.id === target.id);
    if (idx !== -1) party.monsters[idx] = monster;

    // Track lifetime stats
    char.totalDamageDealt += result.totalDamage;
    if (result.critical) char.criticalHits++;

    logEvent(party, "attack", char.id, {
      attackerName: char.name, targetName: target.name,
      hit: true, damage: result.totalDamage, damageType: result.damageType,
      critical: result.critical,
    });

    if (killed) {
      char.monstersKilled++;
      rollMonsterLoot(party, monster);

      // Remove from initiative
      if (party.session) {
        party.session = removeCombatant(party.session, target.id);
      }

      // Check if combat should end
      if (party.session && shouldCombatEnd(party.session)) {
        const xp = calculateEncounterXP(party.monsters);
        const xpEach = Math.floor(xp / party.members.length);
        const levelUps: { name: string; newLevel: number; hpGain: number; newFeatures: string[] }[] = [];
        for (const mid of party.members) {
          const m = characters.get(mid);
          if (m) {
            m.xp += xpEach;
            const lu = checkLevelUp(m);
            if (lu) levelUps.push({ name: m.name, ...lu });
          }
        }
        party.session = exitCombat(party.session);
        logEvent(party, "combat_end", null, { xpAwarded: xp });
        for (const lu of levelUps) {
          logEvent(party, "level_up", null, lu);
          broadcastToParty(party.id, { type: "level_up", ...lu });
        }
        snapshotCharacters(party);
      }
    }

    return {
      success: true,
      data: {
        hit: true, critical: result.critical, damage: result.totalDamage,
        damageType: result.damageType, targetHP: monster.hpCurrent,
        killed, naturalRoll: result.naturalRoll,
      },
    };
  }

  logEvent(party, "attack", char.id, {
    attackerName: char.name, targetName: target.name,
    hit: false, fumble: result.fumble,
  });

  return {
    success: true,
    data: {
      hit: false, fumble: result.fumble, naturalRoll: result.naturalRoll,
    },
  };
}

export function handleMonsterAttack(userId: string, params: { monster_id: string; target_id?: string; target?: string; target_name?: string; attack_name?: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  // Resolve target from target_id, target, or target_name (supports IDs and character names)
  const targetIdentifier = params.target_id ?? params.target ?? params.target_name;
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };
  if (!party.session || party.session.phase !== "combat") {
    return { success: false, error: "Not in combat." };
  }

  // Verify it's this monster's turn
  const current = getCurrentCombatant(party.session);
  if (!current || current.entityId !== params.monster_id || current.type !== "monster") {
    return { success: false, error: `It is not ${params.monster_id}'s turn. Current turn: ${current?.entityId ?? "none"}` };
  }

  const monster = party.monsters.find((m) => m.id === params.monster_id && m.isAlive);
  if (!monster) return { success: false, error: `Monster ${params.monster_id} not found or dead.` };

  // Sleeping monsters cannot attack (unconscious from Sleep spell)
  if (monster.conditions.includes("asleep")) {
    return { success: false, error: `${monster.name} is asleep and cannot attack. End its turn.` };
  }

  // Recharge check at start of monster's turn — roll d6 for each spent ability
  const rechargeResults: { name: string; rolled: number; recharged: boolean }[] = [];
  for (const atk of monster.attacks) {
    if (atk.recharge && monster.rechargeTracker[atk.name] === false) {
      const rechargeRoll = roll("1d6");
      const recharged = rechargeRoll.total >= atk.recharge;
      if (recharged) monster.rechargeTracker[atk.name] = true;
      rechargeResults.push({ name: atk.name, rolled: rechargeRoll.total, recharged });
    }
  }

  // Pick attack (first matching or first available)
  const attack = params.attack_name
    ? monster.attacks.find((a) => a.name.toLowerCase() === params.attack_name!.toLowerCase())
    : monster.attacks[0];
  if (!attack) return { success: false, error: "No valid attack found for this monster." };

  // Check recharge availability
  if (attack.recharge && monster.rechargeTracker[attack.name] === false) {
    return { success: false, error: `${attack.name} has not recharged yet. Use a different attack.`, data: { rechargeResults } as Record<string, unknown> };
  }

  // Mark rechargeable attack as spent
  if (attack.recharge) {
    monster.rechargeTracker[attack.name] = false;
  }

  // --- AoE / save-based attack path ---
  if (attack.aoe && attack.save_dc && attack.save_ability) {
    const targets = party.members
      .map((mid) => characters.get(mid))
      .filter((c): c is GameCharacter => !!c && c.hpCurrent > 0);

    const damageRoll = roll(attack.damage);
    const ability = attack.save_ability as "str" | "dex" | "con" | "int" | "wis" | "cha";
    const results: { name: string; saved: boolean; saveRoll: number; damage: number; droppedToZero: boolean }[] = [];

    for (const t of targets) {
      const save = savingThrow({
        abilityScores: t.abilityScores,
        ability,
        dc: attack.save_dc,
        profBonus: 0,
      });
      const dmg = save.success ? Math.floor(damageRoll.total / 2) : damageRoll.total;
      const { hp, droppedToZero } = applyDamage({ current: t.hpCurrent, max: t.hpMax, temp: 0 }, dmg);
      t.hpCurrent = hp.current;

      let actuallyDropped = droppedToZero;
      if (droppedToZero && checkRelentlessEndurance(t)) {
        actuallyDropped = false;
      }
      if (actuallyDropped) {
        t.timesKnockedOut++;
        t.conditions = handleDropToZero(t.conditions);
        t.deathSaves = resetDeathSaves();
        broadcastToParty(party.id, {
          type: "character_down",
          characterId: t.id, characterName: t.name,
          attackerName: monster.name,
          message: `${t.name} has fallen unconscious!`,
        });
      }
      results.push({ name: t.name, saved: save.success, saveRoll: save.roll.total, damage: dmg, droppedToZero: actuallyDropped });
    }

    logEvent(party, "monster_attack", monster.id, {
      monsterName: monster.name, attackName: attack.name, aoe: true,
      saveDC: attack.save_dc, saveAbility: attack.save_ability,
      totalDamage: damageRoll.total, results,
    });

    party.session = nextTurn(party.session);
    const nextAoeCombatant = getCurrentCombatant(party.session);
    resetTurnResources(party, nextAoeCombatant?.entityId ?? "");
    notifyTurnChange(party);

    return {
      success: true,
      data: {
        aoe: true, attackName: attack.name, monsterName: monster.name,
        saveDC: attack.save_dc, saveAbility: attack.save_ability,
        damageRoll: damageRoll.total, results, rechargeResults,
        nextTurn: nextAoeCombatant?.entityId ?? null,
      },
    };
  }

  // --- Save-based single-target attack (not AoE) ---
  if (attack.save_dc && attack.save_ability) {
    if (!targetIdentifier) return { success: false, error: "target_id is required for single-target attacks." };
    const target = resolveCharacter(targetIdentifier);
    if (!target || !party.members.includes(target.id)) return { success: false, error: `Target ${targetIdentifier} not found in party.` };

    const ability = attack.save_ability as "str" | "dex" | "con" | "int" | "wis" | "cha";
    const save = savingThrow({
      abilityScores: target.abilityScores,
      ability,
      dc: attack.save_dc,
      profBonus: 0,
    });
    const damageRoll = roll(attack.damage);
    const dmg = save.success ? Math.floor(damageRoll.total / 2) : damageRoll.total;
    const { hp, droppedToZero } = applyDamage({ current: target.hpCurrent, max: target.hpMax, temp: 0 }, dmg);
    target.hpCurrent = hp.current;

    let saveActuallyDropped = droppedToZero;
    if (droppedToZero && checkRelentlessEndurance(target)) {
      saveActuallyDropped = false;
    }
    if (saveActuallyDropped) {
      target.timesKnockedOut++;
      target.conditions = handleDropToZero(target.conditions);
      target.deathSaves = resetDeathSaves();
      broadcastToParty(party.id, {
        type: "character_down",
        characterId: target.id, characterName: target.name,
        attackerName: monster.name,
        message: `${target.name} has fallen unconscious!`,
      });
    }

    logEvent(party, "monster_attack", monster.id, {
      monsterName: monster.name, targetName: target.name, attackName: attack.name,
      saveBased: true, saveDC: attack.save_dc, saveAbility: attack.save_ability,
      saved: save.success, damage: dmg, droppedToZero: saveActuallyDropped,
    });

    party.session = nextTurn(party.session);
    const nextSaveCombatant = getCurrentCombatant(party.session);
    resetTurnResources(party, nextSaveCombatant?.entityId ?? "");
    notifyTurnChange(party);

    return {
      success: true,
      data: {
        saveBased: true, saved: save.success, saveRoll: save.roll.total,
        saveDC: attack.save_dc, saveAbility: attack.save_ability,
        damage: dmg, damageType: attack.type, targetHP: target.hpCurrent,
        droppedToZero: saveActuallyDropped, attackName: attack.name, monsterName: monster.name,
        targetName: target.name, rechargeResults,
        nextTurn: nextSaveCombatant?.entityId ?? null,
      },
    };
  }

  // --- Standard attack roll path ---
  if (!targetIdentifier) return { success: false, error: "target_id is required for single-target attacks." };
  const target = resolveCharacter(targetIdentifier);
  if (!target || !party.members.includes(target.id)) return { success: false, error: `Target ${targetIdentifier} not found in party.` };

  // D&D 5e: attacks against unconscious targets have advantage, and melee hits auto-crit
  const targetIsUnconscious = target.conditions.includes("unconscious");

  const result = resolveAttack({
    attackerAbilityMod: attack.to_hit - proficiencyBonus(1),
    proficiencyBonus: 0,
    targetAC: target.ac,
    damageDice: attack.damage.replace(/[+-]\d+$/, ""),
    damageType: attack.type,
    damageAbilityMod: parseInt(attack.damage.match(/[+-]\d+$/)?.[0] ?? "0", 10),
    bonusToHit: attack.to_hit,
    advantage: targetIsUnconscious,
    autoCrit: targetIsUnconscious, // melee attack within 5ft of unconscious = auto-crit
  });

  if (result.hit) {
    // D&D 5e: damage at 0 HP causes death save failures instead of HP loss
    if (target.hpCurrent === 0 && target.conditions.includes("unconscious")) {
      const deathResult = damageAtZeroHP(target.deathSaves, result.totalDamage, target.hpMax, result.critical);
      target.deathSaves = deathResult.deathSaves;

      if (deathResult.instantDeath) {
        target.conditions = addCondition(target.conditions, "dead");
        target.conditions = removeCondition(target.conditions, "unconscious");
        target.isAlive = false;

        broadcastToParty(party.id, {
          type: "character_death",
          characterId: target.id,
          characterName: target.name,
          attackerName: monster.name,
          message: `${target.name} has died from ${monster.name}'s ${attack.name}!`,
        });
      } else if (deathResult.deathSaves.failures >= 3) {
        target.conditions = addCondition(target.conditions, "dead");
        target.conditions = removeCondition(target.conditions, "unconscious");
        target.isAlive = false;

        broadcastToParty(party.id, {
          type: "character_death",
          characterId: target.id,
          characterName: target.name,
          attackerName: monster.name,
          message: `${target.name} has died from ${monster.name}'s ${attack.name}!`,
        });
      } else {
        broadcastToParty(party.id, {
          type: "death_save_failure",
          characterId: target.id,
          characterName: target.name,
          attackerName: monster.name,
          failures: deathResult.deathSaves.failures,
          message: `${target.name} suffers ${result.critical ? 2 : 1} death save failure(s) from ${monster.name}'s ${attack.name}!`,
        });
      }

      // Remove dead character from initiative to prevent softlock
      const isDead = deathResult.instantDeath || deathResult.deathSaves.failures >= 3;
      if (isDead && party.session) {
        party.session = removeCombatant(party.session, target.id);
        if (shouldCombatEnd(party.session)) {
          party.session = exitCombat(party.session);
          logEvent(party, "combat_end", null, { reason: "all_players_dead" });
        }
      }

      logEvent(party, "monster_attack", monster.id, {
        monsterName: monster.name, targetName: target.name, attackName: attack.name,
        hit: true, damage: result.totalDamage, damageType: result.damageType,
        critical: result.critical, targetAtZeroHP: true,
        deathSaveFailures: deathResult.deathSaves.failures,
        instantDeath: deathResult.instantDeath,
        dead: isDead,
      });

      party.session = nextTurn(party.session);
      const nextZeroCombatant = getCurrentCombatant(party.session);
      resetTurnResources(party, nextZeroCombatant?.entityId ?? "");
      notifyTurnChange(party);

      return {
        success: true,
        data: {
          hit: true, critical: result.critical, damage: result.totalDamage,
          damageType: result.damageType, targetHP: 0,
          targetAtZeroHP: true, deathSaveFailures: deathResult.deathSaves.failures,
          instantDeath: deathResult.instantDeath,
          dead: deathResult.instantDeath || deathResult.deathSaves.failures >= 3,
          naturalRoll: result.naturalRoll,
          attackName: attack.name, monsterName: monster.name, targetName: target.name,
          rechargeResults,
          nextTurn: nextZeroCombatant?.entityId ?? null,
        },
      };
    }

    const { hp, droppedToZero } = applyDamage(
      { current: target.hpCurrent, max: target.hpMax, temp: 0 },
      result.totalDamage
    );
    target.hpCurrent = hp.current;

    let hitActuallyDropped = droppedToZero;
    if (droppedToZero && checkRelentlessEndurance(target)) {
      hitActuallyDropped = false;
    }
    if (hitActuallyDropped) {
      target.timesKnockedOut++;
      target.conditions = handleDropToZero(target.conditions);
      target.deathSaves = resetDeathSaves();

      broadcastToParty(party.id, {
        type: "character_down",
        characterId: target.id,
        characterName: target.name,
        attackerName: monster.name,
        message: `${target.name} has fallen unconscious!`,
      });

      if (party.dmUserId) {
        sendToUser(party.dmUserId, {
          type: "character_down",
          characterId: target.id,
          characterName: target.name,
          attackerName: monster.name,
          hpMax: target.hpMax,
          message: `${target.name} has dropped to 0 HP from ${monster.name}'s ${attack.name}!`,
        });
      }
    }

    logEvent(party, "monster_attack", monster.id, {
      monsterName: monster.name, targetName: target.name, attackName: attack.name,
      hit: true, damage: result.totalDamage, damageType: result.damageType,
      critical: result.critical, droppedToZero: hitActuallyDropped,
    });

    party.session = nextTurn(party.session);
    const nextHitCombatant = getCurrentCombatant(party.session);
    resetTurnResources(party, nextHitCombatant?.entityId ?? "");
    notifyTurnChange(party);

    return {
      success: true,
      data: {
        hit: true, critical: result.critical, damage: result.totalDamage,
        damageType: result.damageType, targetHP: target.hpCurrent,
        droppedToZero: hitActuallyDropped, naturalRoll: result.naturalRoll,
        attackName: attack.name, monsterName: monster.name, targetName: target.name,
        rechargeResults,
        nextTurn: nextHitCombatant?.entityId ?? null,
      },
    };
  }

  logEvent(party, "monster_attack", monster.id, {
    monsterName: monster.name, targetName: target.name, attackName: attack.name,
    hit: false, fumble: result.fumble,
  });

  party.session = nextTurn(party.session);
  const nextMissCombatant = getCurrentCombatant(party.session);
  resetTurnResources(party, nextMissCombatant?.entityId ?? "");
  notifyTurnChange(party);

  return {
    success: true,
    data: {
      hit: false, fumble: result.fumble, naturalRoll: result.naturalRoll,
      attackName: attack.name, monsterName: monster.name, targetName: target.name,
      rechargeResults,
      nextTurn: nextMissCombatant?.entityId ?? null,
    },
  };
}

export function handleCast(userId: string, params: { spell_name: string; target_id?: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };
  if (requireConscious(char)) return { success: false, error: UNCONSCIOUS_ERROR };

  const spell = findSpell(params.spell_name);
  if (!spell) return { success: false, error: `Unknown spell: ${params.spell_name}` };

  // Validate casting time — bonus_action/reaction spells must use those tools
  if (spell.castingTime === "bonus_action") {
    return { success: false, error: `${spell.name} is a bonus action spell. Use the bonus_action tool instead.` };
  }
  if (spell.castingTime === "reaction") {
    return { success: false, error: `${spell.name} is a reaction spell. Use the reaction tool instead.` };
  }

  // Healing spells require a target
  if (spell.isHealing && !params.target_id) {
    return { success: false, error: `${spell.name} requires a target. Specify target_id.` };
  }

  // Check turn order and action resource in combat
  const party = getPartyForCharacter(char.id);
  if (party?.session?.phase === "combat") {
    const current = getCurrentCombatant(party.session);
    if (!current || current.entityId !== char.id) {
      return { success: false, error: "It's not your turn." };
    }
    const resources = getTurnResources(party, char.id);
    if (resources.actionUsed) {
      return { success: false, error: "You've already used your action this turn." };
    }
  }

  const result = castSpell({
    spell,
    casterAbilityScores: char.abilityScores,
    casterClass: char.class,
    spellSlots: char.spellSlots,
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  // Consume action resource after successful cast
  if (party?.session?.phase === "combat") {
    const resources = getTurnResources(party, char.id);
    setTurnResources(party, char.id, { ...resources, actionUsed: true });
  }

  // Update spell slots
  char.spellSlots = result.remainingSlots;

  // --- Sleep spell: HP-pool mechanic, does NOT deal damage ---
  if (spell.name === "Sleep" && result.totalEffect && party) {
    let hpPool = result.totalEffect;
    const eligible = party.monsters
      .filter((m) => m.isAlive && !m.conditions.includes("asleep"))
      .sort((a, b) => a.hpCurrent - b.hpCurrent);

    const affectedMonsters: string[] = [];
    for (const monster of eligible) {
      if (hpPool >= monster.hpCurrent) {
        hpPool -= monster.hpCurrent;
        monster.conditions.push("asleep");
        affectedMonsters.push(monster.name);
      }
    }

    logEvent(party, "spell_cast", char.id, {
      casterName: char.name, spellName: "Sleep",
      hpPool: result.totalEffect, affectedMonsters,
    });

    return {
      success: true,
      data: {
        spell: "Sleep",
        hpPool: result.totalEffect,
        affectedMonsters,
        remainingSlots: result.remainingSlots,
      },
    };
  }

  // Track saving throw result for save-based spells
  let targetSaved: boolean | undefined;
  let saveRoll: number | undefined;
  let saveDC: number | undefined;

  // Track target state for response
  let targetKilled: boolean | undefined;
  let targetCurrentHP: number | undefined;
  let spellHit: boolean | undefined;
  let spellAttackNaturalRoll: number | undefined;

  // Apply effect to target if applicable
  if (spell.isHealing && params.target_id && result.totalEffect) {
    // Find target character
    const target = characters.get(params.target_id);
    if (target) {
      const wasDying = target.hpCurrent === 0;
      const hp = applyHealing(
        { current: target.hpCurrent, max: target.hpMax, temp: 0 },
        result.totalEffect
      );
      target.hpCurrent = hp.current;
      if (wasDying && target.hpCurrent > 0) {
        target.conditions = handleRegainFromZero(target.conditions, true);
        target.deathSaves = resetDeathSaves();
      }

      logEvent(party, "heal", char.id, {
        healerName: char.name, targetName: target.name, amount: result.totalEffect,
      });
    }
  } else if (!spell.isHealing && params.target_id && result.totalEffect) {
    // Damage a monster
    if (party) {
      const target = party.monsters.find((m) => m.id === params.target_id && m.isAlive);
      if (target) {
        let actualDamage = result.totalEffect;

        // Roll spell attack for spells with spellAttackType (e.g. Fire Bolt, Ray of Frost)
        if (spell.spellAttackType) {
          const profBonus = proficiencyBonus(char.level);
          const attackBonus = spellAttackBonus(char.abilityScores, char.class, profBonus);
          const attackRoll = roll("1d20");
          spellAttackNaturalRoll = attackRoll.total;
          const totalRoll = attackRoll.total + attackBonus;
          spellHit = attackRoll.total === 20 || (attackRoll.total !== 1 && totalRoll >= target.ac);
          if (!spellHit) {
            actualDamage = 0;
          }
        }

        // Roll saving throw for save-based spells
        if (spell.savingThrow) {
          const dc = spellSaveDC(char.abilityScores, char.class, proficiencyBonus(char.level));
          const save = savingThrow({
            abilityScores: target.abilityScores,
            ability: spell.savingThrow,
            dc,
          });
          targetSaved = save.success;
          saveRoll = save.roll.total;
          saveDC = dc;
          if (save.success) {
            // Cantrips: 0 damage on save; leveled spells: half damage
            actualDamage = spell.level === 0 ? 0 : Math.floor(result.totalEffect / 2);
          }
        }

        if (actualDamage > 0) {
          const { monster, killed } = damageMonster(target, actualDamage);
          const idx = party.monsters.findIndex((m) => m.id === target.id);
          if (idx !== -1) party.monsters[idx] = monster;

          targetKilled = killed;
          targetCurrentHP = monster.hpCurrent;

          // Track lifetime stats
          char.totalDamageDealt += actualDamage;

          if (killed) {
            char.monstersKilled++;
            rollMonsterLoot(party, monster);

            // Remove from initiative
            if (party.session) {
              party.session = removeCombatant(party.session, target.id);
            }

            // Check if combat should end
            if (party.session && shouldCombatEnd(party.session)) {
              const xp = calculateEncounterXP(party.monsters);
              const xpEach = Math.floor(xp / party.members.length);
              const levelUps: { name: string; newLevel: number; hpGain: number; newFeatures: string[] }[] = [];
              for (const mid of party.members) {
                const m = characters.get(mid);
                if (m) {
                  m.xp += xpEach;
                  const lu = checkLevelUp(m);
                  if (lu) levelUps.push({ name: m.name, ...lu });
                }
              }
              party.session = exitCombat(party.session);
              logEvent(party, "combat_end", null, { xpAwarded: xp });
              for (const lu of levelUps) {
                logEvent(party, "level_up", null, lu);
                broadcastToParty(party.id, { type: "level_up", ...lu });
              }
              snapshotCharacters(party);
            }
          }
        } else {
          // Spell missed or target saved fully — report target HP without damage
          targetKilled = false;
          targetCurrentHP = target.hpCurrent;
        }
      }
    }
  }

  const effectAfterSave = targetSaved !== undefined
    ? (targetSaved ? (spell.level === 0 ? 0 : Math.floor(result.totalEffect! / 2)) : result.totalEffect)
    : result.totalEffect;

  // For spell attacks that miss, the effective damage is 0
  const effectForResponse = spellHit === false ? 0 : effectAfterSave;

  // Extract damage type from spell effect description (e.g. "1d10 fire damage" → "fire")
  const dtMatch = spell.effect.toLowerCase().match(/(\w+)\s+damage/) || spell.effect.toLowerCase().match(/(\w+)\s+each/);
  const spellDamageType = dtMatch ? dtMatch[1] : null;

  logEvent(party, "spell_cast", char.id, {
    casterName: char.name, spellName: params.spell_name,
    targetName: params.target_id, effect: effectForResponse,
    ...(spellDamageType && { damageType: spellDamageType }),
    ...(spell.isHealing && { isHealing: true }),
    ...(spellHit !== undefined && { hit: spellHit, naturalRoll: spellAttackNaturalRoll }),
    ...(targetSaved !== undefined && { targetSaved, saveRoll, saveDC, saveAbility: spell.savingThrow?.toUpperCase() }),
    ...(targetKilled !== undefined && { targetKilled, targetHP: targetCurrentHP }),
  });

  const responseData: Record<string, unknown> = {
    spell: params.spell_name,
    effect: effectForResponse,
    remainingSlots: result.remainingSlots,
  };
  if (spellHit !== undefined) {
    responseData.hit = spellHit;
    responseData.naturalRoll = spellAttackNaturalRoll;
  }
  if (targetSaved !== undefined) {
    responseData.targetSaved = targetSaved;
    responseData.saveDC = saveDC;
    responseData.saveRoll = saveRoll;
    responseData.fullDamage = result.totalEffect;
    responseData.damageHalved = targetSaved && spell.level > 0;
  }
  if (targetKilled !== undefined) {
    responseData.targetHP = targetCurrentHP;
    responseData.killed = targetKilled;
  }

  return {
    success: true,
    data: responseData,
  };
}

export function handleDodge(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };
  if (requireConscious(char)) return { success: false, error: UNCONSCIOUS_ERROR };
  const party = getPartyForCharacter(char.id);
  if (party?.session?.phase === "combat") {
    const current = getCurrentCombatant(party.session);
    if (!current || current.entityId !== char.id) return { success: false, error: "It's not your turn." };
    const resources = getTurnResources(party, char.id);
    if (resources.actionUsed) return { success: false, error: "You've already used your action this turn." };
    setTurnResources(party, char.id, { ...resources, actionUsed: true });
  }
  return { success: true, data: { action: "dodge", message: `${char.name} takes the Dodge action.` } };
}

export function handleDash(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };
  if (requireConscious(char)) return { success: false, error: UNCONSCIOUS_ERROR };
  const party = getPartyForCharacter(char.id);
  if (party?.session?.phase === "combat") {
    const current = getCurrentCombatant(party.session);
    if (!current || current.entityId !== char.id) return { success: false, error: "It's not your turn." };
    const resources = getTurnResources(party, char.id);
    if (resources.actionUsed) return { success: false, error: "You've already used your action this turn." };
    setTurnResources(party, char.id, { ...resources, actionUsed: true });
  }
  return { success: true, data: { action: "dash", message: `${char.name} dashes.` } };
}

export function handleDisengage(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };
  if (requireConscious(char)) return { success: false, error: UNCONSCIOUS_ERROR };
  const party = getPartyForCharacter(char.id);
  if (party?.session?.phase === "combat") {
    const current = getCurrentCombatant(party.session);
    if (!current || current.entityId !== char.id) return { success: false, error: "It's not your turn." };
    const resources = getTurnResources(party, char.id);
    if (resources.actionUsed) return { success: false, error: "You've already used your action this turn." };
    setTurnResources(party, char.id, { ...resources, actionUsed: true });
  }
  return { success: true, data: { action: "disengage", message: `${char.name} disengages.` } };
}

export function handleHelp(userId: string, params: { target_id: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };
  if (requireConscious(char)) return { success: false, error: UNCONSCIOUS_ERROR };
  const party = getPartyForCharacter(char.id);
  if (party?.session?.phase === "combat") {
    const current = getCurrentCombatant(party.session);
    if (!current || current.entityId !== char.id) return { success: false, error: "It's not your turn." };
    const resources = getTurnResources(party, char.id);
    if (resources.actionUsed) return { success: false, error: "You've already used your action this turn." };
    setTurnResources(party, char.id, { ...resources, actionUsed: true });
  }
  return { success: true, data: { action: "help", target: params.target_id, message: `${char.name} helps an ally.` } };
}

export function handleHide(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };
  if (requireConscious(char)) return { success: false, error: UNCONSCIOUS_ERROR };
  const party = getPartyForCharacter(char.id);
  if (party?.session?.phase === "combat") {
    const current = getCurrentCombatant(party.session);
    if (!current || current.entityId !== char.id) return { success: false, error: "It's not your turn." };
    const resources = getTurnResources(party, char.id);
    if (resources.actionUsed) return { success: false, error: "You've already used your action this turn." };
    setTurnResources(party, char.id, { ...resources, actionUsed: true });
  }
  const result = abilityCheck({
    abilityScores: char.abilityScores,
    ability: "dex",
    dc: 10,
    proficiencyBonus: char.proficiencies.includes("Stealth") ? proficiencyBonus(char.level) : 0,
  });
  return {
    success: true,
    data: { action: "hide", roll: result.roll.total, hidden: result.success },
  };
}

export function handleMove(userId: string, params: { direction_or_target: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  if (!params.direction_or_target) return { success: false, error: "Missing direction_or_target." };
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };
  if (requireConscious(char)) return { success: false, error: UNCONSCIOUS_ERROR };

  const party = getPartyForCharacter(char.id);
  if (!party?.dungeonState) {
    return { success: false, error: "Not in a dungeon." };
  }

  // Check if already in the target room
  const currentRoom = getCurrentRoom(party.dungeonState);
  if (currentRoom) {
    const input = params.direction_or_target.toLowerCase();
    if (currentRoom.id === params.direction_or_target || currentRoom.name.toLowerCase().includes(input)) {
      return { success: true, data: { moved: false, room: currentRoom.name, description: currentRoom.description, type: currentRoom.type, message: `You're already in ${currentRoom.name}.` } };
    }
  }

  // Try to move to a room by ID or name
  const exits = getAvailableExits(party.dungeonState);
  const target = exits.find(
    (e) => e.roomId === params.direction_or_target || e.roomName.toLowerCase().includes(params.direction_or_target.toLowerCase())
  );

  if (!target) {
    return { success: false, error: `Cannot move to "${params.direction_or_target}". Available exits: ${exits.map((e) => e.roomName).join(", ")}` };
  }

  const moveResult = moveToRoom(party.dungeonState, target.roomId);
  if (!moveResult.ok) {
    return { success: false, error: moveResult.reason };
  }

  party.dungeonState = moveResult.state;
  const room = getCurrentRoom(moveResult.state);

  logEvent(party, "room_enter", char.id, { roomName: room?.name });

  return {
    success: true,
    data: {
      moved: true,
      room: room?.name,
      description: room?.description,
      type: room?.type,
    },
  };
}

export function handlePartyChat(userId: string, params: { message: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };

  const party = getPartyForCharacter(char.id);
  if (!party) return { success: false, error: "Not in a party." };
  logEvent(party, "chat", char.id, { speakerName: char.name, avatarUrl: char.avatarUrl, message: params.message });

  return { success: true, data: { speaker: char.name, avatarUrl: char.avatarUrl, message: params.message } };
}

export function handleWhisper(userId: string, params: { player_id: string; message: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  if (!params.player_id) return { success: false, error: "Missing player_id — specify the target character." };
  if (!params.message) return { success: false, error: "Missing message." };

  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };

  const party = getPartyForCharacter(char.id);
  if (!party) return { success: false, error: "Not in a party." };

  const target = resolveCharacter(params.player_id);
  if (!target || target.partyId !== party.id) return { success: false, error: "Target not in your party." };

  if (target.id === char.id) return { success: false, error: "You cannot whisper to yourself." };

  logEvent(party, "whisper", char.id, { from: char.name, to: target.name, message: params.message });
  return { success: true, data: { from: char.name, to: target.name, message: params.message } };
}

export function handleShortRest(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };
  if (requireConscious(char)) return { success: false, error: UNCONSCIOUS_ERROR };

  const party = getPartyForCharacter(char.id);
  if (!party?.session) return { success: false, error: "Not in an active session." };
  if (party.session.phase === "combat") return { success: false, error: "Cannot rest during combat." };

  const conMod = abilityModifier(char.abilityScores.con);
  const result = doShortRest({
    hp: { current: char.hpCurrent, max: char.hpMax, temp: 0 },
    hitDice: char.hitDice,
    conModifier: conMod,
    hitDiceToSpend: Math.min(char.hitDice.current, 1), // spend 1 hit die
    characterClass: char.class,
    characterLevel: char.level,
    spellSlots: char.spellSlots,
  });

  char.hpCurrent = result.hpAfter;
  char.hitDice = { ...char.hitDice, current: result.hitDiceRemaining };
  char.spellSlots = result.newSpellSlots;

  return {
    success: true,
    data: {
      healed: result.totalHealing,
      hpBefore: result.hpBefore,
      hpAfter: result.hpAfter,
      hitDiceRemaining: result.hitDiceRemaining,
      spellSlotsRecovered: result.spellSlotsRecovered,
    },
  };
}

export function handleLongRest(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };
  if (requireConscious(char)) return { success: false, error: UNCONSCIOUS_ERROR };

  const party = getPartyForCharacter(char.id);
  if (!party?.session) return { success: false, error: "Not in an active session." };
  if (party.session.phase === "combat") return { success: false, error: "Cannot rest during combat." };

  const result = doLongRest({
    hp: { current: char.hpCurrent, max: char.hpMax, temp: 0 },
    hitDice: char.hitDice,
    characterClass: char.class,
    characterLevel: char.level,
    spellSlots: char.spellSlots,
  });

  char.hpCurrent = result.hpAfter;
  char.hitDice = { ...char.hitDice, current: result.hitDiceTotal };
  char.spellSlots = result.newSpellSlots;
  char.relentlessEnduranceUsed = false;
  // Clear conditions (unconscious, stable, etc.) but preserve "dead" — though we already block dead above
  char.conditions = char.conditions.filter((c) => c === "dead");

  return {
    success: true,
    data: {
      hpBefore: result.hpBefore,
      hpAfter: result.hpAfter,
      hitDiceRecovered: result.hitDiceRecovered,
      spellSlots: result.newSpellSlots,
    },
  };
}

export function handleUseItem(userId: string, params: { item_name: string; target_id?: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };
  if (requireConscious(char)) return { success: false, error: UNCONSCIOUS_ERROR };

  const party = getPartyForCharacter(char.id);
  if (party?.session?.phase === "combat") {
    const resources = getTurnResources(party, char.id);
    if (resources.actionUsed) return { success: false, error: "You've already used your action this turn." };
    setTurnResources(party, char.id, { ...resources, actionUsed: true });
  }

  const itemIdx = char.inventory.indexOf(params.item_name);
  if (itemIdx === -1) {
    return { success: false, error: `Item "${params.item_name}" not found in inventory.` };
  }

  const itemDef = itemDefs.get(params.item_name);

  // Data-driven potion handling
  if (itemDef?.category === "potion" && itemDef.healAmount) {
    const healRoll = roll(itemDef.healAmount);
    const target = params.target_id ? characters.get(params.target_id) : char;
    if (target) {
      const wasDying = target.hpCurrent === 0;
      const hp = applyHealing({ current: target.hpCurrent, max: target.hpMax, temp: 0 }, healRoll.total);
      target.hpCurrent = hp.current;
      if (wasDying && target.hpCurrent > 0) {
        target.conditions = handleRegainFromZero(target.conditions, true);
        target.deathSaves = resetDeathSaves();
      }
    }
    char.inventory.splice(itemIdx, 1);
    return { success: true, data: { item: params.item_name, healed: healRoll.total, targetHP: (params.target_id ? characters.get(params.target_id) : char)?.hpCurrent } };
  }

  // Data-driven scroll handling
  if (itemDef?.category === "scroll" && itemDef.spellName) {
    const spell = findSpell(itemDef.spellName);
    if (!spell) return { success: false, error: `Scroll references unknown spell: ${itemDef.spellName}` };

    // Cast the spell without consuming spell slots
    const result = castSpell({
      spell,
      casterAbilityScores: char.abilityScores,
      casterClass: char.class,
      spellSlots: char.spellSlots,
      freecast: true,
    });
    if (!result.success) return { success: false, error: result.error };

    // Track saving throw result for save-based scroll spells
    let scrollSaved: boolean | undefined;
    let scrollSaveRoll: number | undefined;
    let scrollSaveDC: number | undefined;

    // Apply spell effect to target
    if (spell.isHealing && params.target_id && result.totalEffect) {
      const target = characters.get(params.target_id);
      if (target) {
        const wasDying = target.hpCurrent === 0;
        const hp = applyHealing({ current: target.hpCurrent, max: target.hpMax, temp: 0 }, result.totalEffect);
        target.hpCurrent = hp.current;
        if (wasDying && target.hpCurrent > 0) {
          target.conditions = handleRegainFromZero(target.conditions, true);
          target.deathSaves = resetDeathSaves();
        }
      }
    } else if (!spell.isHealing && params.target_id && result.totalEffect && party) {
      const target = party.monsters.find((m) => m.id === params.target_id && m.isAlive);
      if (target) {
        let actualDamage = result.totalEffect;

        if (spell.savingThrow) {
          const dc = spellSaveDC(char.abilityScores, char.class, proficiencyBonus(char.level));
          const save = savingThrow({
            abilityScores: target.abilityScores,
            ability: spell.savingThrow,
            dc,
          });
          scrollSaved = save.success;
          scrollSaveRoll = save.roll.total;
          scrollSaveDC = dc;
          if (save.success) {
            actualDamage = spell.level === 0 ? 0 : Math.floor(result.totalEffect / 2);
          }
        }

        if (actualDamage > 0) {
          const { monster } = damageMonster(target, actualDamage);
          const idx = party.monsters.findIndex((m) => m.id === target.id);
          if (idx !== -1) party.monsters[idx] = monster;
        }
      }
    }

    const scrollEffect = scrollSaved !== undefined
      ? (scrollSaved ? (spell.level === 0 ? 0 : Math.floor(result.totalEffect! / 2)) : result.totalEffect)
      : result.totalEffect;

    char.inventory.splice(itemIdx, 1);
    logEvent(party, "scroll_used", char.id, {
      scrollName: params.item_name, spellName: itemDef.spellName, effect: scrollEffect,
      ...(scrollSaved !== undefined && { targetSaved: scrollSaved, saveRoll: scrollSaveRoll, saveDC: scrollSaveDC }),
    });
    const scrollData: Record<string, unknown> = { item: params.item_name, spell: itemDef.spellName, effect: scrollEffect };
    if (scrollSaved !== undefined) {
      scrollData.targetSaved = scrollSaved;
      scrollData.saveDC = scrollSaveDC;
      scrollData.saveRoll = scrollSaveRoll;
      scrollData.fullDamage = result.totalEffect;
      scrollData.damageHalved = scrollSaved && spell.level > 0;
    }
    return { success: true, data: scrollData };
  }

  return { success: true, data: { item: params.item_name, message: "Item used." } };
}

// --- End Turn / Bonus Action / Reaction ---

export function handleEndTurn(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);

  // DM path: DMs can end monster turns (they control monsters in combat)
  if (!char) {
    const dmParty = findDMParty(userId);
    if (!dmParty) return { success: false, error: "No character found." };
    if (!dmParty.session || dmParty.session.phase !== "combat") {
      return { success: false, error: "Not in combat." };
    }
    const current = getCurrentCombatant(dmParty.session);
    if (!current || current.type !== "monster") {
      return { success: false, error: "It's not a monster's turn." };
    }
    dmParty.session = nextTurn(dmParty.session);
    const nextCombatant = getCurrentCombatant(dmParty.session);
    resetTurnResources(dmParty, nextCombatant?.entityId ?? "");
    notifyTurnChange(dmParty);
    return {
      success: true,
      data: {
        ended: true,
        nextTurn: nextCombatant?.entityId ?? null,
        nextType: nextCombatant?.type ?? null,
      },
    };
  }

  // Player path: players can end their own turn
  // Note: unconscious characters must be able to end turn (after death saves)
  // to avoid soft-locking initiative. Only dead characters are blocked.
  if (char.conditions.includes("dead")) return { success: false, error: "Dead characters cannot act." };

  const party = getPartyForCharacter(char.id);
  if (!party?.session || party.session.phase !== "combat") {
    return { success: false, error: "Not in combat." };
  }

  const current = getCurrentCombatant(party.session);
  if (!current || current.entityId !== char.id) {
    return { success: false, error: "It's not your turn." };
  }

  party.session = nextTurn(party.session);
  const nextCombatant = getCurrentCombatant(party.session);
  resetTurnResources(party, nextCombatant?.entityId ?? "");
  notifyTurnChange(party);

  return {
    success: true,
    data: {
      ended: true,
      nextTurn: nextCombatant?.entityId ?? null,
      nextType: nextCombatant?.type ?? null,
    },
  };
}

export function handleBonusAction(userId: string, params: { action: string; spell_name?: string; target_id?: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };
  if (requireConscious(char)) return { success: false, error: UNCONSCIOUS_ERROR };

  const party = getPartyForCharacter(char.id);
  if (!party?.session || party.session.phase !== "combat") {
    return { success: false, error: "Not in combat." };
  }

  const current = getCurrentCombatant(party.session);
  if (!current || current.entityId !== char.id) {
    return { success: false, error: "It's not your turn." };
  }

  const resources = getTurnResources(party, char.id);
  if (resources.bonusUsed) {
    return { success: false, error: "You've already used your bonus action this turn." };
  }

  switch (params.action) {
    case "cast": {
      if (!params.spell_name) return { success: false, error: "spell_name is required for casting." };
      const spell = findSpell(params.spell_name);
      if (!spell) return { success: false, error: `Unknown spell: ${params.spell_name}` };
      if (spell.castingTime !== "bonus_action") {
        return { success: false, error: `${spell.name} is not a bonus action spell.` };
      }

      const result = castSpell({
        spell,
        casterAbilityScores: char.abilityScores,
        casterClass: char.class,
        spellSlots: char.spellSlots,
      });
      if (!result.success) return { success: false, error: result.error };

      char.spellSlots = result.remainingSlots;
      setTurnResources(party, char.id, { ...resources, bonusUsed: true });

      // Apply healing/damage effects
      let bonusSaved: boolean | undefined;
      let bonusSaveRoll: number | undefined;
      let bonusSaveDC: number | undefined;

      if (spell.isHealing && params.target_id && result.totalEffect) {
        const target = characters.get(params.target_id);
        if (target) {
          const wasDying = target.hpCurrent === 0;
          const hp = applyHealing({ current: target.hpCurrent, max: target.hpMax, temp: 0 }, result.totalEffect);
          target.hpCurrent = hp.current;
          if (wasDying && target.hpCurrent > 0) {
            target.conditions = handleRegainFromZero(target.conditions, true);
            target.deathSaves = resetDeathSaves();
          }
          logEvent(party, "heal", char.id, {
            healerName: char.name, targetName: target.name, amount: result.totalEffect, bonusAction: true,
          });
        }
      } else if (!spell.isHealing && params.target_id && result.totalEffect) {
        const target = party.monsters.find((m) => m.id === params.target_id && m.isAlive);
        if (target) {
          let actualDamage = result.totalEffect;

          if (spell.savingThrow) {
            const dc = spellSaveDC(char.abilityScores, char.class, proficiencyBonus(char.level));
            const save = savingThrow({
              abilityScores: target.abilityScores,
              ability: spell.savingThrow,
              dc,
            });
            bonusSaved = save.success;
            bonusSaveRoll = save.roll.total;
            bonusSaveDC = dc;
            if (save.success) {
              actualDamage = spell.level === 0 ? 0 : Math.floor(result.totalEffect / 2);
            }
          }

          if (actualDamage > 0) {
            const { monster } = damageMonster(target, actualDamage);
            const idx = party.monsters.findIndex((m) => m.id === target.id);
            if (idx !== -1) party.monsters[idx] = monster;
          }
        }
      }

      const bonusEffect = bonusSaved !== undefined
        ? (bonusSaved ? (spell.level === 0 ? 0 : Math.floor(result.totalEffect! / 2)) : result.totalEffect)
        : result.totalEffect;

      logEvent(party, "bonus_action", char.id, {
        action: "cast", spellName: params.spell_name, effect: bonusEffect,
        ...(bonusSaved !== undefined && { targetSaved: bonusSaved, saveRoll: bonusSaveRoll, saveDC: bonusSaveDC }),
      });

      const bonusData: Record<string, unknown> = {
        action: "cast", spell: params.spell_name, effect: bonusEffect, remainingSlots: result.remainingSlots,
      };
      if (bonusSaved !== undefined) {
        bonusData.targetSaved = bonusSaved;
        bonusData.saveDC = bonusSaveDC;
        bonusData.saveRoll = bonusSaveRoll;
        bonusData.fullDamage = result.totalEffect;
        bonusData.damageHalved = bonusSaved && spell.level > 0;
      }

      return { success: true, data: bonusData };
    }

    case "dash":
    case "disengage": {
      if (!char.features.includes("Cunning Action")) {
        return { success: false, error: `Only Rogues with Cunning Action can ${params.action} as a bonus action.` };
      }
      setTurnResources(party, char.id, { ...resources, bonusUsed: true });
      logEvent(party, "bonus_action", char.id, { action: params.action, cunningAction: true });
      return {
        success: true,
        data: { action: params.action, message: `${char.name} uses Cunning Action to ${params.action}.` },
      };
    }

    case "hide": {
      if (!char.features.includes("Cunning Action")) {
        return { success: false, error: `Only Rogues with Cunning Action can hide as a bonus action.` };
      }
      const hideResult = abilityCheck({
        abilityScores: char.abilityScores,
        ability: "dex",
        dc: 10,
        proficiencyBonus: char.proficiencies.includes("Stealth") ? proficiencyBonus(char.level) : 0,
      });
      setTurnResources(party, char.id, { ...resources, bonusUsed: true });
      logEvent(party, "bonus_action", char.id, { action: "hide", cunningAction: true, roll: hideResult.roll.total, hidden: hideResult.success });
      return {
        success: true,
        data: { action: "hide", hidden: hideResult.success, stealthRoll: hideResult.roll.total, dc: 10 },
      };
    }

    case "second_wind": {
      if (!char.features.includes("Second Wind")) {
        return { success: false, error: "Only Fighters with Second Wind can use this ability." };
      }
      const wasDying = char.hpCurrent === 0;
      const healRoll = roll(`1d10+${char.level}`);
      const hp = applyHealing({ current: char.hpCurrent, max: char.hpMax, temp: 0 }, healRoll.total);
      char.hpCurrent = hp.current;
      if (wasDying && char.hpCurrent > 0) {
        char.conditions = handleRegainFromZero(char.conditions, true);
        char.deathSaves = resetDeathSaves();
      }
      setTurnResources(party, char.id, { ...resources, bonusUsed: true });
      logEvent(party, "bonus_action", char.id, { action: "second_wind", healed: healRoll.total });
      return {
        success: true,
        data: { action: "second_wind", healed: healRoll.total, hpCurrent: char.hpCurrent, hpMax: char.hpMax },
      };
    }

    default:
      return { success: false, error: `Unknown bonus action: ${params.action}. Use cast, dash, disengage, hide, or second_wind.` };
  }
}

export function handleReaction(userId: string, params: { action: string; spell_name?: string; target_id?: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };
  if (requireConscious(char)) return { success: false, error: UNCONSCIOUS_ERROR };

  const party = getPartyForCharacter(char.id);
  if (!party?.session || party.session.phase !== "combat") {
    return { success: false, error: "Not in combat." };
  }

  const current = getCurrentCombatant(party.session);
  if (current?.entityId === char.id) {
    return { success: false, error: "You can't use a reaction on your own turn. Reactions are for other combatants' turns." };
  }

  const resources = getTurnResources(party, char.id);
  if (resources.reactionUsed) {
    return { success: false, error: "You've already used your reaction this round." };
  }

  switch (params.action) {
    case "cast": {
      if (!params.spell_name) return { success: false, error: "spell_name is required for casting." };
      const spell = findSpell(params.spell_name);
      if (!spell) return { success: false, error: `Unknown spell: ${params.spell_name}` };
      if (spell.castingTime !== "reaction") {
        return { success: false, error: `${spell.name} is not a reaction spell.` };
      }

      const result = castSpell({
        spell,
        casterAbilityScores: char.abilityScores,
        casterClass: char.class,
        spellSlots: char.spellSlots,
      });
      if (!result.success) return { success: false, error: result.error };

      char.spellSlots = result.remainingSlots;
      setTurnResources(party, char.id, { ...resources, reactionUsed: true });

      // Apply save-based damage effects for reaction spells targeting monsters
      let reactionSaved: boolean | undefined;
      let reactionSaveRoll: number | undefined;
      let reactionSaveDC: number | undefined;

      if (!spell.isHealing && params.target_id && result.totalEffect) {
        const target = party.monsters.find((m) => m.id === params.target_id && m.isAlive);
        if (target) {
          let actualDamage = result.totalEffect;

          if (spell.savingThrow) {
            const dc = spellSaveDC(char.abilityScores, char.class, proficiencyBonus(char.level));
            const save = savingThrow({
              abilityScores: target.abilityScores,
              ability: spell.savingThrow,
              dc,
            });
            reactionSaved = save.success;
            reactionSaveRoll = save.roll.total;
            reactionSaveDC = dc;
            if (save.success) {
              actualDamage = spell.level === 0 ? 0 : Math.floor(result.totalEffect / 2);
            }
          }

          if (actualDamage > 0) {
            const { monster, killed } = damageMonster(target, actualDamage);
            const idx = party.monsters.findIndex((m) => m.id === target.id);
            if (idx !== -1) party.monsters[idx] = monster;
            char.totalDamageDealt += actualDamage;
            if (killed) {
              char.monstersKilled++;
              rollMonsterLoot(party, monster);
              if (party.session) {
                party.session = removeCombatant(party.session, target.id);
              }
            }
          }
        }
      }

      const reactionEffect = reactionSaved !== undefined
        ? (reactionSaved ? (spell.level === 0 ? 0 : Math.floor(result.totalEffect! / 2)) : result.totalEffect)
        : result.totalEffect;

      logEvent(party, "reaction", char.id, {
        action: "cast", spellName: params.spell_name, effect: reactionEffect,
        ...(reactionSaved !== undefined && { targetSaved: reactionSaved, saveRoll: reactionSaveRoll, saveDC: reactionSaveDC }),
      });

      const reactionData: Record<string, unknown> = {
        action: "cast", spell: params.spell_name, effect: reactionEffect, remainingSlots: result.remainingSlots,
      };
      if (reactionSaved !== undefined) {
        reactionData.targetSaved = reactionSaved;
        reactionData.saveDC = reactionSaveDC;
        reactionData.saveRoll = reactionSaveRoll;
        reactionData.fullDamage = result.totalEffect;
        reactionData.damageHalved = reactionSaved && spell.level > 0;
      }

      return { success: true, data: reactionData };
    }

    case "opportunity_attack": {
      if (!params.target_id) return { success: false, error: "target_id is required for opportunity attacks." };

      const target = party.monsters.find((m) => m.id === params.target_id && m.isAlive);
      if (!target) return { success: false, error: `Target ${params.target_id} not found or already dead.` };

      const weaponDamage = getWeaponDamage(char.equipment.weapon);
      const profBonus = proficiencyBonus(char.level);
      const attackParams = meleeAttackParams(char.abilityScores, profBonus, weaponDamage);
      const result = resolveAttack({ ...attackParams, targetAC: target.ac });

      setTurnResources(party, char.id, { ...resources, reactionUsed: true });

      if (result.hit) {
        const { monster, killed } = damageMonster(target, result.totalDamage);
        const idx = party.monsters.findIndex((m) => m.id === target.id);
        if (idx !== -1) party.monsters[idx] = monster;

        // Track lifetime stats
        char.totalDamageDealt += result.totalDamage;
        if (result.critical) char.criticalHits++;

        logEvent(party, "reaction", char.id, {
          action: "opportunity_attack", targetName: target.name,
          hit: true, damage: result.totalDamage, killed,
        });

        if (killed) {
          char.monstersKilled++;
          rollMonsterLoot(party, monster);

          if (party.session) {
            party.session = removeCombatant(party.session, target.id);
            if (shouldCombatEnd(party.session)) {
              const xp = calculateEncounterXP(party.monsters);
              const xpEach = Math.floor(xp / party.members.length);
              const levelUps: { name: string; newLevel: number; hpGain: number; newFeatures: string[] }[] = [];
              for (const mid of party.members) {
                const m = characters.get(mid);
                if (m) {
                  m.xp += xpEach;
                  const lu = checkLevelUp(m);
                  if (lu) levelUps.push({ name: m.name, ...lu });
                }
              }
              party.session = exitCombat(party.session);
              logEvent(party, "combat_end", null, { xpAwarded: xp });
              for (const lu of levelUps) {
                logEvent(party, "level_up", null, lu);
                broadcastToParty(party.id, { type: "level_up", ...lu });
              }
              snapshotCharacters(party);
            }
          }
        }

        return {
          success: true,
          data: {
            action: "opportunity_attack", hit: true,
            damage: result.totalDamage, damageType: result.damageType,
            killed, naturalRoll: result.naturalRoll,
          },
        };
      }

      logEvent(party, "reaction", char.id, {
        action: "opportunity_attack", targetName: target.name, hit: false,
      });

      return {
        success: true,
        data: { action: "opportunity_attack", hit: false, naturalRoll: result.naturalRoll },
      };
    }

    default:
      return { success: false, error: `Unknown reaction: ${params.action}. Use cast or opportunity_attack.` };
  }
}

// --- Death Saves ---

export function handleDeathSave(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };

  if (!char.conditions.includes("unconscious")) {
    return { success: false, error: "You are not unconscious. Death saves are only made when at 0 HP." };
  }
  if (char.conditions.includes("stable")) {
    return { success: false, error: "You are already stabilized." };
  }
  if (char.conditions.includes("dead")) {
    return { success: false, error: "You are dead." };
  }

  const party = getPartyForCharacter(char.id);
  if (!party?.session || party.session.phase !== "combat") {
    return { success: false, error: "Death saves are only made during combat." };
  }

  const current = getCurrentCombatant(party.session);
  if (!current || current.entityId !== char.id) {
    return { success: false, error: "It's not your turn." };
  }

  const result = deathSave(char.deathSaves);
  char.deathSaves = result.deathSaves;
  char.conditions = applyDeathSaveConditions(char.conditions, result);

  if (result.revivedWith1HP) {
    char.hpCurrent = 1;
    char.deathSaves = resetDeathSaves();
  }

  logEvent(party, "death_save", char.id, {
    characterName: char.name,
    naturalRoll: result.naturalRoll,
    success: result.success,
    deathSaves: result.deathSaves,
    stabilized: result.stabilized,
    dead: result.dead,
    revivedWith1HP: result.revivedWith1HP,
  });

  // Broadcast death save result to entire party
  broadcastToParty(party.id, {
    type: "death_save",
    characterId: char.id,
    characterName: char.name,
    naturalRoll: result.naturalRoll,
    success: result.success,
    deathSaves: result.deathSaves,
    stabilized: result.stabilized,
    dead: result.dead,
    revivedWith1HP: result.revivedWith1HP,
  });

  // Notify DM explicitly on stabilize or death
  if (party.dmUserId) {
    if (result.dead) {
      sendToUser(party.dmUserId, {
        type: "character_death",
        characterId: char.id,
        characterName: char.name,
        message: `${char.name} has died! Three failed death saves.`,
      });
    } else if (result.stabilized) {
      sendToUser(party.dmUserId, {
        type: "character_stabilized",
        characterId: char.id,
        characterName: char.name,
        message: `${char.name} has stabilized with three successful death saves.`,
      });
    } else if (result.revivedWith1HP) {
      sendToUser(party.dmUserId, {
        type: "character_revived",
        characterId: char.id,
        characterName: char.name,
        message: `${char.name} rolled a natural 20 and is back on their feet with 1 HP!`,
      });
    }
  }

  // If dead, remove from initiative
  if (result.dead && party.session) {
    party.session = removeCombatant(party.session, char.id);
    if (shouldCombatEnd(party.session)) {
      party.session = exitCombat(party.session);
      logEvent(party, "combat_end", null, { reason: "all_players_dead" });
    }
  }

  return {
    success: true,
    data: {
      naturalRoll: result.naturalRoll,
      success: result.success,
      deathSaves: result.deathSaves,
      stabilized: result.stabilized,
      dead: result.dead,
      revivedWith1HP: result.revivedWith1HP,
    },
  };
}

export function handleJournalAdd(userId: string, params: { entry: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };
  return { success: true, data: { entry: params.entry, character: char.name } };
}

export function handleQueueForParty(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found. Create one first." };
  if (char.partyId) return { success: false, error: "Already in a party." };

  const entry: QueueEntry = {
    userId,
    characterId: char.id,
    characterClass: char.class,
    characterName: char.name,
    personality: char.personality,
    playstyle: char.playstyle,
    role: "player",
  };

  playerQueue.push(entry);

  // Try to match
  const match = tryMatchParty([...playerQueue, ...dmQueue]);
  if (match) {
    formParty(match);
    return { success: true, data: { queued: false, matched: true, message: "Party formed!" } };
  }

  const playersInQueue = playerQueue.length;
  const playersNeeded = PARTY_SIZE - playersInQueue;
  const message = playersNeeded > 0
    ? `You've joined the matchmaking queue. ${playersNeeded} more player${playersNeeded === 1 ? "" : "s"} needed to form a party.`
    : "You've joined the matchmaking queue. Waiting for party...";
  return { success: true, data: { queued: true, matched: false, position: playersInQueue, playersInQueue, playersNeeded, message } };
}

// --- DM Tool Handlers ---

export function handleDMQueueForParty(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  // Check if any existing party has a system-dm placeholder and claim it
  for (const party of parties.values()) {
    if (party.dmUserId === SYSTEM_DM_ID) {
      party.dmUserId = userId;
      return { success: true, data: { queued: false, matched: true, message: "Party formed! You are the DM." } };
    }
  }

  const entry: QueueEntry = {
    userId,
    characterId: "",
    characterClass: "fighter", // placeholder
    characterName: "DM",
    personality: "",
    playstyle: "",
    role: "dm",
  };

  dmQueue.push(entry);

  const match = tryMatchParty([...playerQueue, ...dmQueue]);
  if (match) {
    formParty(match);
    return { success: true, data: { queued: false, matched: true, message: "Party formed! You are the DM." } };
  }

  const playersWaiting = playerQueue.length;
  const playersNeeded = PARTY_SIZE - playersWaiting;
  const message = playersNeeded > 0
    ? `Queued as DM. Waiting for ${playersNeeded} more player${playersNeeded === 1 ? "" : "s"}.`
    : "Queued as DM. Enough players waiting — match should form soon.";
  return { success: true, data: { queued: true, matched: false, playersWaiting, playersNeeded, message } };
}

export function handleGetDmActions(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "You are not a DM for any active party." };

  const phase = party.session?.phase ?? "exploration";
  const availableTools = getAllowedDMActions(phase);

  const data: Record<string, unknown> = {
    phase, availableTools,
    actionRoutes: buildActionRoutes(availableTools, dmActionRoutes),
  };

  if (party.session && phase === "combat") {
    const current = getCurrentCombatant(party.session);
    if (current) {
      const name = current.type === "monster"
        ? party.monsters.find((m) => m.id === current.entityId)?.name ?? current.entityId
        : characters.get(current.entityId)?.name ?? current.entityId;
      data.currentTurn = { name, type: current.type, entityId: current.entityId };
    }
  }

  return { success: true, data };
}

export function handleNarrate(userId: string, params: { text: string; style?: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "You are not a DM for any active party." };

  const eventData: Record<string, unknown> = { text: params.text };
  if (params.style) eventData.style = params.style;
  logEvent(party, "narration", null, eventData);
  return { success: true, data: { narrated: true, text: params.text, style: params.style ?? null } };
}

export function handleNarrateTo(userId: string, params: { player_id: string; text: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };
  return { success: true, data: { narrated: true, to: params.player_id, text: params.text } };
}

export function handleDMJournal(userId: string, params: { entry: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };
  if (!params.entry || params.entry.trim().length === 0) return { success: false, error: "Journal entry cannot be empty." };

  logEvent(party, "dm_journal", null, { entry: params.entry.trim() });
  return { success: true, data: { entry: params.entry.trim() } };
}

export function handleSpawnEncounter(userId: string, params: { monsters: { template_name: string; count: number }[] }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  try {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };
  if (!party.session) return { success: false, error: "No active session." };

  // Normalize flat format to array format
  let monsterList = params.monsters;
  if (!monsterList && (params as any).monster_type) {
    monsterList = [{ template_name: (params as any).monster_type, count: (params as any).count ?? 1 }];
  }
  if (!monsterList || !Array.isArray(monsterList) || monsterList.length === 0) {
    return { success: false, error: "Expected 'monsters' array (e.g., [{template_name: 'goblin', count: 2}]) or flat format {monster_type: 'goblin', count: 2}" };
  }

  // Look up monster templates (case-insensitive, fall back to "name" field from agents)
  const toSpawn = monsterList.map((m) => {
    const rawName = m.template_name ?? (m as any).type ?? (m as Record<string, unknown>).name as string ?? "unknown";
    // Try exact match first, then case-insensitive
    let template = monsterTemplates.get(rawName);
    let resolvedName = rawName;
    if (!template) {
      const normalize = (s: string) => s.toLowerCase().replace(/-/g, " ");
      const normalizedRaw = normalize(rawName);
      for (const [key, val] of monsterTemplates) {
        if (normalize(key) === normalizedRaw) {
          template = val;
          resolvedName = key; // use the canonical capitalized name
          break;
        }
      }
    }
    if (!template) {
      // Create a default monster if template not loaded
      return {
        templateName: resolvedName,
        count: m.count ?? 1,
        template: {
          hpMax: 10, ac: 12,
          abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
          attacks: [{ name: "Attack", to_hit: 3, damage: "1d6+1", type: "slashing" }],
          specialAbilities: [],
          xpValue: 50,
        },
      };
    }
    return { templateName: resolvedName, count: m.count ?? 1, template };
  });

  // Compute everything first
  const monsters = spawnMonsters(toSpawn);
  const players = party.members
    .map((mid) => characters.get(mid))
    .filter(Boolean)
    .map((c) => ({ id: c!.id, name: c!.name, dexScore: c!.abilityScores.dex }));

  const initiative = rollEncounterInitiative(players, monsters);
  const slots: InitiativeSlot[] = initiative.map((e) => ({
    entityId: e.entityId,
    initiative: e.initiative,
    type: e.type,
  }));
  const newSession = enterCombat(party.session, slots);

  // Then commit all state atomically
  party.monsters = monsters;
  party.session = newSession;

  logEvent(party, "combat_start", null, {
    monsters: monsters.map((m) => ({ name: m.name, templateName: m.templateName, hp: m.hpMax, ac: m.ac })),
    initiative: initiative.map((e) => ({ name: e.name, initiative: e.initiative })),
  });
  notifyTurnChange(party);

  // Track DM stats
  persistDmStats(userId, { totalEncountersRun: 1, totalMonsterSpawns: monsters.length });

  return {
    success: true,
    data: {
      monsters: monsters.map((m) => ({ id: m.id, name: m.name, hp: m.hpMax, ac: m.ac })),
      initiative: initiative.map((e) => ({ name: e.name, initiative: e.initiative, type: e.type })),
      phase: "combat",
    },
  };
  } catch (err) {
    console.error("[spawn-encounter] Unexpected error:", err);
    return { success: false, error: `Internal error spawning encounter: ${(err as Error).message}` };
  }
}

export function handleTriggerEncounter(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };
  if (!party.session) return { success: false, error: "No active session." };
  if (!party.dungeonState) return { success: false, error: "No dungeon loaded." };

  const room = getCurrentRoom(party.dungeonState);
  if (!room) return { success: false, error: "No current room." };

  const enc = party.templateEncounters.get(room.id);
  if (!enc) return { success: false, error: `No pre-placed encounter in room "${room.name}". Use spawn_encounter to create a custom one.` };
  if (party.triggeredEncounters.has(room.id)) return { success: false, error: `Encounter "${enc.name}" in room "${room.name}" has already been triggered.` };

  // Mark as triggered before spawning
  party.triggeredEncounters.add(room.id);

  // Delegate to handleSpawnEncounter with the template's monster list
  const monsters = enc.monsters.map((m) => ({ template_name: m.templateName, count: m.count }));
  return handleSpawnEncounter(userId, { monsters });
}

export function handleInteractWithFeature(userId: string, params: { feature_name: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  if (!params.feature_name || typeof params.feature_name !== "string") {
    return { success: false, error: "Missing required parameter: feature_name" };
  }

  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };
  if (!party.dungeonState) return { success: false, error: "No dungeon loaded." };

  const room = getCurrentRoom(party.dungeonState);
  if (!room) return { success: false, error: "No current room." };

  const features = room.features ?? [];
  const feature = features.find((f) => f.toLowerCase().includes(params.feature_name.toLowerCase()));
  if (!feature) {
    return {
      success: false,
      error: `Feature "${params.feature_name}" not found in ${room.name}. Available features: ${features.join(", ") || "none"}`,
    };
  }

  logEvent(party, "feature_interaction", null, { room: room.name, feature });

  return { success: true, data: { room: room.name, feature } };
}

export function handleOverrideRoomDescription(userId: string, params: { description: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };
  if (!party.dungeonState) return { success: false, error: "No dungeon loaded." };

  const room = getCurrentRoom(party.dungeonState);
  if (!room) return { success: false, error: "No current room." };

  const oldDescription = room.description;
  room.description = params.description;

  logEvent(party, "room_override", null, { room: room.name, oldDescription, newDescription: params.description });

  return { success: true, data: { room: room.name, description: params.description } };
}

export function handleVoiceNpc(userId: string, params: { npc_id: string; dialogue: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  if (!params.npc_id) return { success: false, error: "npc_id is required." };
  if (!params.dialogue) return { success: false, error: "dialogue is required." };

  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  // Check if this references a persistent NPC
  const npc = npcsMap.get(params.npc_id);
  const npcName = npc ? npc.name : params.npc_id;

  logEvent(party, "npc_dialogue", null, { npcId: npc?.id, npcName, dialogue: params.dialogue });

  // Log interaction for persistent NPCs
  if (npc?.dbNpcId && party.dbSessionId) {
    const memEntry: NpcMemoryEntry = {
      sessionId: party.session?.id ?? "unknown",
      event: "dialogue",
      summary: params.dialogue.slice(0, 200),
      dispositionAtTime: npc.disposition,
    };
    npc.memory.push(memEntry);
    if (npc.memory.length > 20) npc.memory = npc.memory.slice(-20);

    db.insert(npcInteractionsTable).values({
      npcId: npc.dbNpcId,
      sessionId: party.dbSessionId,
      interactionType: "dialogue",
      description: params.dialogue.slice(0, 500),
    }).catch((err) => console.error("[DB] Failed to log NPC dialogue interaction:", err));

    db.update(npcsTable).set({ memory: npc.memory, updatedAt: new Date() })
      .where(eq(npcsTable.id, npc.dbNpcId))
      .catch((err) => console.error("[DB] Failed to update NPC memory:", err));
  }

  return { success: true, data: { npc: npcName, npc_id: npc?.id, dialogue: params.dialogue } };
}

export function handleRequestCheck(userId: string, params: { player_id: string; ability: string; dc: number; skill?: string; advantage?: boolean; disadvantage?: boolean }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  const char = resolveCharacter(params.player_id);
  if (!char) return { success: false, error: `Player ${params.player_id} not found. Use character IDs from get_party_state (e.g. char-1).` };

  if (char.partyId !== party.id) return { success: false, error: `Character ${params.player_id} is not in your party.` };

  const ability = normalizeAbility(params.ability);
  if (!ability) return { success: false, error: `Invalid ability '${params.ability}'. Use: str, dex, con, int, wis, cha.` };
  const profBonus = params.skill && char.proficiencies.some((p) => p.toLowerCase().includes(params.skill!.toLowerCase()))
    ? proficiencyBonus(char.level) : 0;

  const result = abilityCheck({
    abilityScores: char.abilityScores,
    ability,
    dc: params.dc,
    proficiencyBonus: profBonus,
    advantage: params.advantage,
    disadvantage: params.disadvantage,
  });
  logEvent(party, "ability_check", char.id, {
    playerName: char.name, ability, skill: params.skill,
    dc: params.dc, roll: result.roll.total, success: result.success, margin: result.margin,
  });

  return {
    success: true,
    data: {
      player: char.name,
      ability: params.ability,
      skill: params.skill,
      dc: params.dc,
      roll: result.roll.total,
      success: result.success,
      margin: result.margin,
      natural20: result.natural20,
      natural1: result.natural1,
    },
  };
}

export function handleRequestSave(userId: string, params: { player_id: string; ability: string; dc: number; advantage?: boolean; disadvantage?: boolean }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  const char = resolveCharacter(params.player_id);
  if (!char) return { success: false, error: `Player ${params.player_id} not found. Use character IDs from get_party_state (e.g. char-1).` };

  if (char.partyId !== party.id) return { success: false, error: `Character ${params.player_id} is not in your party.` };

  const ability = normalizeAbility(params.ability);
  if (!ability) return { success: false, error: `Invalid ability '${params.ability}'. Use: str, dex, con, int, wis, cha.` };
  const result = savingThrow({
    abilityScores: char.abilityScores,
    ability,
    dc: params.dc,
    advantage: params.advantage,
    disadvantage: params.disadvantage,
  });
  logEvent(party, "saving_throw", char.id, {
    playerName: char.name, ability,
    dc: params.dc, roll: result.roll.total, success: result.success, margin: result.margin,
  });

  return {
    success: true,
    data: {
      player: char.name, ability: params.ability, dc: params.dc,
      roll: result.roll.total, success: result.success, margin: result.margin,
    },
  };
}

export function handleRequestGroupCheck(userId: string, params: { ability: string; dc: number; skill?: string; advantage?: boolean; disadvantage?: boolean }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  const charList = party.members.map((mid) => characters.get(mid)).filter(Boolean) as GameCharacter[];
  const ability = normalizeAbility(params.ability);
  if (!ability) return { success: false, error: `Invalid ability '${params.ability}'. Use: str, dex, con, int, wis, cha.` };

  // Roll individually so we can pass advantage/disadvantage per character
  const results = charList.map((c) => {
    const profBonus = params.skill && c.proficiencies.some((p) => p.toLowerCase().includes(params.skill!.toLowerCase()))
      ? proficiencyBonus(c.level) : 0;
    return {
      id: c.id,
      check: abilityCheck({
        abilityScores: c.abilityScores,
        ability,
        dc: params.dc,
        proficiencyBonus: profBonus,
        advantage: params.advantage,
        disadvantage: params.disadvantage,
      }),
    };
  });

  const successes = results.filter((r) => r.check.success).length;
  const overallSuccess = successes >= Math.ceil(results.length / 2);

  logEvent(party, "group_check", null, {
    ability: params.ability, skill: params.skill, dc: params.dc,
    overallSuccess,
    results: results.map((r) => ({
      id: r.id, name: characters.get(r.id)?.name,
      roll: r.check.roll.total, success: r.check.success, margin: r.check.margin,
    })),
  });

  return {
    success: true,
    data: {
      ability: params.ability, skill: params.skill, dc: params.dc,
      overallSuccess,
      results: results.map((r) => ({
        id: r.id,
        name: characters.get(r.id)?.name,
        roll: r.check.roll.total,
        success: r.check.success,
        margin: r.check.margin,
      })),
    },
  };
}

export function handleRequestContestedCheck(userId: string, params: {
  player_id_1: string; ability_1: string; skill_1?: string; advantage_1?: boolean; disadvantage_1?: boolean;
  player_id_2: string; ability_2: string; skill_2?: string; advantage_2?: boolean; disadvantage_2?: boolean;
}): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  const char1 = resolveCharacter(params.player_id_1);
  if (!char1) return { success: false, error: `Player ${params.player_id_1} not found. Use character IDs from get_party_state (e.g. char-1).` };
  if (char1.partyId !== party.id) return { success: false, error: `Character ${params.player_id_1} is not in your party.` };

  const char2 = resolveCharacter(params.player_id_2);
  if (!char2) return { success: false, error: `Player ${params.player_id_2} not found. Use character IDs from get_party_state (e.g. char-1).` };
  if (char2.partyId !== party.id) return { success: false, error: `Character ${params.player_id_2} is not in your party.` };

  const ability1 = normalizeAbility(params.ability_1);
  if (!ability1) return { success: false, error: `Invalid ability '${params.ability_1}'. Use: str, dex, con, int, wis, cha.` };
  const ability2 = normalizeAbility(params.ability_2);
  if (!ability2) return { success: false, error: `Invalid ability '${params.ability_2}'. Use: str, dex, con, int, wis, cha.` };

  const profBonus1 = params.skill_1 && char1.proficiencies.some((p) => p.toLowerCase().includes(params.skill_1!.toLowerCase()))
    ? proficiencyBonus(char1.level) : 0;
  const profBonus2 = params.skill_2 && char2.proficiencies.some((p) => p.toLowerCase().includes(params.skill_2!.toLowerCase()))
    ? proficiencyBonus(char2.level) : 0;

  const result1 = abilityCheck({
    abilityScores: char1.abilityScores,
    ability: ability1,
    dc: 0,
    proficiencyBonus: profBonus1,
    advantage: params.advantage_1,
    disadvantage: params.disadvantage_1,
  });

  const result2 = abilityCheck({
    abilityScores: char2.abilityScores,
    ability: ability2,
    dc: 0,
    proficiencyBonus: profBonus2,
    advantage: params.advantage_2,
    disadvantage: params.disadvantage_2,
  });

  // Higher total wins; ties go to the initiator (player 1)
  const winner = result1.roll.total >= result2.roll.total ? 1 : 2;
  const margin = result1.roll.total - result2.roll.total;

  logEvent(party, "contested_check", null, {
    player1: { id: char1.id, name: char1.name, ability: params.ability_1, skill: params.skill_1, roll: result1.roll.total },
    player2: { id: char2.id, name: char2.name, ability: params.ability_2, skill: params.skill_2, roll: result2.roll.total },
    winner, margin,
  });

  return {
    success: true,
    data: {
      player1: {
        id: char1.id, name: char1.name, ability: params.ability_1, skill: params.skill_1,
        roll: result1.roll.total, natural20: result1.natural20, natural1: result1.natural1,
      },
      player2: {
        id: char2.id, name: char2.name, ability: params.ability_2, skill: params.skill_2,
        roll: result2.roll.total, natural20: result2.natural20, natural1: result2.natural1,
      },
      winner,
      winnerName: winner === 1 ? char1.name : char2.name,
      margin,
    },
  };
}

export function handleDealEnvironmentDamage(userId: string, params: { player_id?: string; target_id?: string; notation?: string; damage?: number | string; type?: string; damage_type?: string; description?: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  // Accept both param styles: {player_id, notation, type} and {target_id, damage, damage_type}
  const playerId = params.player_id ?? params.target_id;
  const damageNotation = params.notation ?? (typeof params.damage === "number" ? `${params.damage}d1` : params.damage) ?? "1d6";
  const damageType = params.type ?? params.damage_type ?? "untyped";

  if (!playerId) return { success: false, error: "player_id or target_id is required." };

  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  const char = resolveCharacter(playerId);
  if (!char) return { success: false, error: `Player ${playerId} not found. Use character IDs from get_party_state (e.g. char-1).` };

  if (char.partyId !== party.id) return { success: false, error: `Character ${playerId} is not in your party.` };

  const dmgRoll = roll(damageNotation);

  // D&D 5e: damage at 0 HP causes death save failures instead of HP loss
  if (char.hpCurrent === 0 && char.conditions.includes("unconscious")) {
    const deathResult = damageAtZeroHP(char.deathSaves, dmgRoll.total, char.hpMax, false);
    char.deathSaves = deathResult.deathSaves;

    if (deathResult.instantDeath || deathResult.deathSaves.failures >= 3) {
      char.conditions = addCondition(char.conditions, "dead");
      char.conditions = removeCondition(char.conditions, "unconscious");
      char.isAlive = false;

      broadcastToParty(party.id, {
        type: "character_death",
        characterId: char.id,
        characterName: char.name,
        cause: `environment (${damageType})`,
        message: `${char.name} has died from ${damageType} damage!`,
      });

      // Remove dead character from initiative to prevent softlock
      if (party.session) {
        party.session = removeCombatant(party.session, char.id);
        if (shouldCombatEnd(party.session)) {
          party.session = exitCombat(party.session);
          logEvent(party, "combat_end", null, { reason: "all_players_dead" });
        }
      }
    } else {
      broadcastToParty(party.id, {
        type: "death_save_failure",
        characterId: char.id,
        characterName: char.name,
        cause: `environment (${damageType})`,
        failures: deathResult.deathSaves.failures,
        message: `${char.name} suffers 1 death save failure from ${damageType} damage!`,
      });
    }

    return {
      success: true,
      data: {
        player: char.name, damage: dmgRoll.total, type: damageType,
        hpRemaining: 0, droppedToZero: false,
        deathSaves: char.deathSaves,
        dead: deathResult.instantDeath || deathResult.deathSaves.failures >= 3,
      },
    };
  }

  const { hp, droppedToZero } = applyDamage(
    { current: char.hpCurrent, max: char.hpMax, temp: 0 },
    dmgRoll.total
  );
  char.hpCurrent = hp.current;

  let envActuallyDropped = droppedToZero;
  if (droppedToZero && checkRelentlessEndurance(char)) {
    envActuallyDropped = false;
  }
  if (envActuallyDropped) {
    char.timesKnockedOut++;
    char.conditions = handleDropToZero(char.conditions);
    char.deathSaves = resetDeathSaves();

    const party = getPartyForCharacter(char.id);
    if (party) {
      broadcastToParty(party.id, {
        type: "character_down",
        characterId: char.id,
        characterName: char.name,
        cause: `environment (${damageType})`,
        message: `${char.name} has fallen unconscious from ${damageType} damage!`,
      });

      if (party.dmUserId) {
        sendToUser(party.dmUserId, {
          type: "character_down",
          characterId: char.id,
          characterName: char.name,
          cause: `environment (${damageType})`,
          hpMax: char.hpMax,
          message: `${char.name} has dropped to 0 HP from ${damageType} damage!`,
        });
      }
    }
  }

  return {
    success: true,
    data: {
      player: char.name, damage: dmgRoll.total, type: damageType,
      hpRemaining: char.hpCurrent, droppedToZero: envActuallyDropped,
    },
  };
}

export function handleAdvanceScene(userId: string, params: { next_room_id?: string; exit_id?: string; room_id?: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  // Accept next_room_id, exit_id, or room_id (agents send any of these)
  const nextRoom = params.next_room_id ?? params.exit_id ?? params.room_id;

  // Exit combat if currently in combat
  if (party.session && party.session.phase === "combat") {
    party.session = exitCombat(party.session);
    party.monsters = []; // clear encounter
    logEvent(party, "combat_end", null, { reason: "scene_advanced" });
    snapshotCharacters(party);
  }

  if (nextRoom && party.dungeonState) {
    const moveResult = moveToRoom(party.dungeonState, nextRoom);
    if (moveResult.ok) {
      party.dungeonState = moveResult.state;
      const room = getCurrentRoom(moveResult.state);
      logEvent(party, "room_enter", null, { roomName: room?.name });
      const newExits = getAvailableExits(moveResult.state).map((e) => ({ name: e.roomName, type: e.connectionType, id: e.roomId }));
      return { success: true, data: { advanced: true, room: room?.name, description: room?.description, phase: party.session?.phase, exits: newExits } };
    }
    if (moveResult.reason === "no_exit") {
      const validExits = getAvailableExits(party.dungeonState).map((e) => `${e.roomName} (${e.roomId})`);
      return { success: false, error: `Cannot move to room ${nextRoom} — not connected or not found. Available exits: ${validExits.join(", ") || "none"}` };
    }
    return { success: false, error: moveResult.reason };
  }

  // No room specified — return available exits so DM can choose
  const exits = party.dungeonState ? getAvailableExits(party.dungeonState).map((e) => ({ name: e.roomName, type: e.connectionType, id: e.roomId })) : [];
  const currentRoom = party.dungeonState ? getCurrentRoom(party.dungeonState) : null;
  return { success: true, data: { advanced: false, room: currentRoom?.name, phase: party.session?.phase, exits, message: "No next_room_id provided. Call advance_scene with a next_room_id from the exits list to move the party." } };
}

export function handleGetPartyState(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  const members = party.members.map((mid) => {
    const c = characters.get(mid);
    if (!c) return null;
    return {
      id: c.id, name: c.name, class: c.class, race: c.race, level: c.level,
      hp: { current: c.hpCurrent, max: c.hpMax },
      ac: c.ac, conditions: c.conditions,
      spellSlots: c.spellSlots,
      equipment: c.equipment,
      inventory: c.inventory,
    };
  }).filter(Boolean);

  const data: Record<string, unknown> = { members, phase: party.session?.phase };

  if (party.session && party.session.phase === "combat") {
    const current = getCurrentCombatant(party.session);
    if (current) {
      const name = current.type === "monster"
        ? party.monsters.find((m) => m.id === current.entityId)?.name ?? current.entityId
        : characters.get(current.entityId)?.name ?? current.entityId;
      data.currentTurn = { name, type: current.type, entityId: current.entityId };
    }
    data.initiative = party.session.initiativeOrder.map((slot) => {
      const slotName = slot.type === "monster"
        ? party.monsters.find((m) => m.id === slot.entityId)?.name ?? slot.entityId
        : characters.get(slot.entityId)?.name ?? slot.entityId;
      return { entityId: slot.entityId, name: slotName, type: slot.type, initiative: slot.initiative };
    });
  }

  return { success: true, data };
}

export function handleGetRoomState(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  if (!party.dungeonState) {
    return { success: true, data: { room: null, message: "No dungeon loaded." } };
  }

  const room = getCurrentRoom(party.dungeonState);
  const exits = getAvailableExits(party.dungeonState);
  const aliveMonsters = getAliveMonsters(party.monsters);

  // Check for pre-placed encounter in this room
  let suggestedEncounter: Record<string, unknown> | null = null;
  let lootTable: Record<string, unknown> | null = null;
  if (room) {
    const enc = party.templateEncounters.get(room.id);
    if (enc && !party.triggeredEncounters.has(room.id)) {
      suggestedEncounter = {
        id: enc.id,
        name: enc.name,
        difficulty: enc.difficulty,
        monsters: enc.monsters.map((m) => ({ templateName: m.templateName, count: m.count })),
      };
    }
    const lt = party.templateLootTables.get(room.id);
    if (lt && !party.lootedRooms.has(room.id)) {
      lootTable = {
        id: lt.id,
        name: lt.name,
        entries: lt.entries.map((e) => ({ itemName: e.itemName, weight: e.weight, quantity: e.quantity })),
      };
    }
  }

  return {
    success: true,
    data: {
      room: room ? { name: room.name, description: room.description, type: room.type, features: room.features } : null,
      exits: exits.map((e) => ({ name: e.roomName, type: e.connectionType, id: e.roomId })),
      monsters: aliveMonsters.map((m) => ({ id: m.id, name: m.name, hp: m.hpCurrent, hpMax: m.hpMax, ac: m.ac, conditions: m.conditions })),
      suggestedEncounter,
      lootTable,
    },
  };
}

export function handleAwardXp(userId: string, params: { amount: number }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };
  if (!Number.isFinite(params.amount) || params.amount < 0) return { success: false, error: "XP amount must be a non-negative number." };

  const xpEach = Math.floor(params.amount / party.members.length);
  const levelUps: { name: string; newLevel: number; hpGain: number; newFeatures: string[] }[] = [];
  for (const mid of party.members) {
    const c = characters.get(mid);
    if (c) {
      c.xp += xpEach;
      const lu = checkLevelUp(c);
      if (lu) levelUps.push({ name: c.name, ...lu });
    }
  }

  for (const lu of levelUps) {
    logEvent(party, "level_up", null, lu);
    broadcastToParty(party.id, { type: "level_up", ...lu });
  }

  return { success: true, data: { totalXP: params.amount, xpEach, members: party.members.length, levelUps: levelUps.length > 0 ? levelUps : undefined } };
}

export function handleAwardGold(userId: string, params: { player_id?: string; amount: number }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  if (params.amount === 0) return { success: false, error: "Amount must be non-zero." };

  if (params.player_id) {
    // Award to specific player
    const char = resolveCharacter(params.player_id);
    if (!char) return { success: false, error: `Player ${params.player_id} not found.` };
    char.gold = Math.max(0, char.gold + params.amount);
    if (params.amount > 0) char.goldEarned += params.amount;
    logEvent(party, "gold_award", null, { characterName: char.name, amount: params.amount, newTotal: char.gold });
    return { success: true, data: { player: char.name, amount: params.amount, new_total: char.gold } };
  }

  // Split evenly among party
  const goldEach = Math.floor(params.amount / party.members.length);
  const results: { name: string; received: number; new_total: number }[] = [];
  for (const mid of party.members) {
    const c = characters.get(mid);
    if (c) {
      c.gold = Math.max(0, c.gold + goldEach);
      if (goldEach > 0) c.goldEarned += goldEach;
      results.push({ name: c.name, received: goldEach, new_total: c.gold });
    }
  }
  logEvent(party, "gold_award", null, { totalAmount: params.amount, goldEach, results });
  return { success: true, data: { total_amount: params.amount, gold_each: goldEach, results } };
}

export function handleAwardLoot(userId: string, params: { player_id?: string; item_name?: string; gold?: number }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  if (!params.item_name && !params.gold) {
    return { success: false, error: "Must provide item_name, gold, or both." };
  }

  // Items require a specific player_id
  if (params.item_name && !params.player_id) {
    return { success: false, error: "player_id is required when awarding items. Use character IDs from get_party_state (e.g. char-1)." };
  }

  // Gold-only without player_id: split among party
  if (!params.player_id && params.gold) {
    return handleAwardGold(userId, { amount: params.gold });
  }

  const char = resolveCharacter(params.player_id!);
  if (!char) return { success: false, error: `Player ${params.player_id} not found. Use character IDs from get_party_state (e.g. char-1).` };

  const result: Record<string, unknown> = { player: char.name };

  // Award item if specified
  if (params.item_name) {
    if (!itemDefs.has(params.item_name)) {
      const categories = ["weapon", "armor", "potion", "scroll", "magic_item", "misc"];
      const suggestions = categories.map((cat) => {
        const items = getItemsByCategory(cat);
        return items.length > 0 ? `${cat}: ${items.map((i) => i.name).join(", ")}` : null;
      }).filter(Boolean).join("; ");
      return { success: false, error: `Unknown item: "${params.item_name}". Available items — ${suggestions}` };
    }
    char.inventory.push(params.item_name);
    result.item = params.item_name;
  }

  // Award gold if specified
  if (params.gold) {
    char.gold = Math.max(0, char.gold + params.gold);
    if (params.gold > 0) char.goldEarned += params.gold;
    result.gold = params.gold;
    result.new_gold_total = char.gold;
  }

  const party = findDMParty(userId);
  logEvent(party, "loot", null, { characterId: params.player_id, characterName: char.name, itemName: params.item_name, gold: params.gold });

  return { success: true, data: result };
}

export function handleLootRoom(userId: string, params: { player_id: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };
  if (!party.dungeonState) return { success: false, error: "No dungeon loaded." };

  const room = getCurrentRoom(party.dungeonState);
  if (!room) return { success: false, error: "No current room." };

  const lt = party.templateLootTables.get(room.id);
  if (!lt) return { success: false, error: `No loot table in room "${room.name}". Use award_loot to give items manually.` };
  if (party.lootedRooms.has(room.id)) return { success: false, error: `Room "${room.name}" has already been looted.` };

  const char = resolveCharacter(params.player_id);
  if (!char) return { success: false, error: `Player ${params.player_id} not found. Use character IDs from get_party_state (e.g. char-1).` };

  // Mark as looted
  party.lootedRooms.add(room.id);

  // Roll the loot table
  const lootResult = rollLootTable(lt.entries);
  const awarded: { itemName: string; quantity: number }[] = [];
  for (const drop of lootResult.items) {
    for (let i = 0; i < drop.quantity; i++) {
      char.inventory.push(drop.itemName);
    }
    awarded.push(drop);
  }

  logEvent(party, "room_loot", null, {
    room: room.name,
    lootTable: lt.name,
    characterId: params.player_id,
    characterName: char.name,
    items: awarded,
    roll: lootResult.roll.total,
  });

  broadcastToParty(party.id, {
    type: "room_loot",
    room: room.name,
    player: char.name,
    items: awarded,
  });

  return {
    success: true,
    data: {
      room: room.name,
      player: char.name,
      items: awarded,
      roll: lootResult.roll.total,
    },
  };
}

export function handlePickupItem(userId: string, params: { item_name: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };
  if (requireConscious(char)) return { success: false, error: UNCONSCIOUS_ERROR };

  const party = getPartyForCharacter(char.id);
  if (!party) return { success: false, error: "Not in a party." };

  const groundIdx = party.groundItems.findIndex((g) => g.itemName.toLowerCase() === params.item_name.toLowerCase());
  if (groundIdx === -1) {
    const available = party.groundItems.map((g) => `${g.itemName}${g.quantity > 1 ? ` x${g.quantity}` : ""}`).join(", ");
    return { success: false, error: `Item "${params.item_name}" not found on the ground.${available ? ` Available: ${available}` : " Nothing on the ground to pick up."}` };
  }

  const ground = party.groundItems[groundIdx]!;
  const pickedName = ground.itemName; // preserve original case
  const isGold = pickedName.toLowerCase() === "gold coins";

  if (isGold) {
    // Gold Coins are currency — pick up entire stack and add to gold counter
    const amount = ground.quantity;
    char.gold += amount;
    char.goldEarned += amount;
    party.groundItems.splice(groundIdx, 1);

    logEvent(party, "pickup", char.id, {
      characterName: char.name,
      itemName: pickedName,
      goldAmount: amount,
    });

    broadcastToParty(party.id, {
      type: "pickup",
      characterName: char.name,
      itemName: pickedName,
      message: `${char.name} picked up ${amount} Gold Coins.`,
    });

    return {
      success: true,
      data: {
        picked_up: pickedName,
        gold_gained: amount,
        gold_total: char.gold,
        remaining_on_ground: party.groundItems.map((g) => ({ itemName: g.itemName, quantity: g.quantity })),
      },
    };
  }

  char.inventory.push(pickedName);

  if (ground.quantity <= 1) {
    party.groundItems.splice(groundIdx, 1);
  } else {
    ground.quantity--;
  }

  logEvent(party, "pickup", char.id, {
    characterName: char.name,
    itemName: pickedName,
  });

  broadcastToParty(party.id, {
    type: "pickup",
    characterName: char.name,
    itemName: pickedName,
    message: `${char.name} picked up ${pickedName}.`,
  });

  return {
    success: true,
    data: {
      picked_up: pickedName,
      remaining_on_ground: party.groundItems.map((g) => ({ itemName: g.itemName, quantity: g.quantity })),
    },
  };
}

export function handleEquipItem(userId: string, params: { item_name: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };

  const itemIdx = char.inventory.indexOf(params.item_name);
  if (itemIdx === -1) {
    return { success: false, error: `Item "${params.item_name}" not found in inventory.` };
  }

  const itemDef = itemDefs.get(params.item_name);
  if (!itemDef) {
    return { success: false, error: `Unknown item: "${params.item_name}".` };
  }

  const dexMod = abilityModifier(char.abilityScores.dex);

  if (itemDef.category === "weapon" || (itemDef.category === "magic_item" && itemDef.baseWeapon)) {
    // Equip weapon — old weapon goes to inventory
    if (char.equipment.weapon) {
      char.inventory.push(char.equipment.weapon);
    }
    char.equipment.weapon = params.item_name;
    char.inventory.splice(itemIdx, 1);
    return { success: true, data: { equipped: params.item_name, slot: "weapon", equipment: char.equipment } };
  }

  if (itemDef.category === "armor") {
    if (itemDef.armorType === "shield") {
      // Equip shield
      if (char.equipment.shield) {
        char.inventory.push(char.equipment.shield);
      }
      char.equipment.shield = params.item_name;
      char.inventory.splice(itemIdx, 1);
      // Recalculate AC
      const armorDef = char.equipment.armor ? itemDefs.get(char.equipment.armor) : null;
      const armorParams = armorDef && armorDef.acBase !== undefined
        ? { acBase: armorDef.acBase, acDexCap: armorDef.acDexCap ?? null }
        : null;
      char.ac = calculateAC(dexMod, armorParams, true);
      return { success: true, data: { equipped: params.item_name, slot: "shield", ac: char.ac, equipment: char.equipment } };
    }

    // Equip body armor
    if (char.equipment.armor) {
      char.inventory.push(char.equipment.armor);
    }
    char.equipment.armor = params.item_name;
    char.inventory.splice(itemIdx, 1);
    // Recalculate AC
    const armorParams = itemDef.acBase !== undefined
      ? { acBase: itemDef.acBase, acDexCap: itemDef.acDexCap ?? null }
      : null;
    char.ac = calculateAC(dexMod, armorParams, !!char.equipment.shield);
    return { success: true, data: { equipped: params.item_name, slot: "armor", ac: char.ac, equipment: char.equipment } };
  }

  if (itemDef.category === "magic_item" && itemDef.magicType === "ring") {
    // Ring of Protection — equip as misc, add AC bonus
    char.inventory.splice(itemIdx, 1);
    // For simplicity, just add magic bonus to AC
    char.ac += itemDef.magicBonus ?? 0;
    return { success: true, data: { equipped: params.item_name, ac: char.ac } };
  }

  return { success: false, error: `"${params.item_name}" cannot be equipped (category: ${itemDef.category}).` };
}

export function handleUnequipItem(userId: string, params: { slot: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };

  const slot = params.slot as "weapon" | "armor" | "shield";
  if (!["weapon", "armor", "shield"].includes(slot)) {
    return { success: false, error: `Invalid slot: "${params.slot}". Use weapon, armor, or shield.` };
  }

  const currentItem = char.equipment[slot];
  if (!currentItem) {
    return { success: false, error: `Nothing equipped in ${slot} slot.` };
  }

  // Move item to inventory
  char.inventory.push(currentItem);
  char.equipment[slot] = null;

  // Recalculate AC if armor or shield changed
  if (slot === "armor" || slot === "shield") {
    const dexMod = abilityModifier(char.abilityScores.dex);
    const armorDef = char.equipment.armor ? itemDefs.get(char.equipment.armor) : null;
    const armorParams = armorDef && armorDef.acBase !== undefined
      ? { acBase: armorDef.acBase, acDexCap: armorDef.acDexCap ?? null }
      : null;
    char.ac = calculateAC(dexMod, armorParams, !!char.equipment.shield);
  }

  return { success: true, data: { unequipped: currentItem, slot, ac: char.ac, equipment: char.equipment } };
}

export function handleListItems(_userId: string, params: { category?: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const items = params.category ? getItemsByCategory(params.category) : getAllItems();
  return {
    success: true,
    data: {
      items: items.map((i) => {
        const entry: Record<string, unknown> = { name: i.name, category: i.category, description: i.description };
        if (i.damage) entry.damage = i.damage;
        if (i.damageType) entry.damageType = i.damageType;
        if (i.healAmount) entry.healAmount = i.healAmount;
        if (i.spellName) entry.spellName = i.spellName;
        if (i.acBase !== undefined) entry.acBase = i.acBase;
        if (i.magicBonus !== undefined) entry.magicBonus = i.magicBonus;
        return entry;
      }),
      count: items.length,
    },
  };
}

// Patterns that indicate internal QA/debug text that should not appear in public summaries.
const DEBUG_PATTERNS: RegExp[] = [
  /\bB\d{3,4}\b/i,               // Bug references: B036, B047, B048
  /VERIFIED\s+FIXED/i,
  /STILL\s+BROKEN/i,
  /\[ie-[^\]]*\]/i,              // Internal issue tags: [ie-B048], [ie-ux-016]
  /\bQA\b/,
  /\bREGRESSION\b/i,
  /\bPLAYTEST\b/i,
  /\bDEBUG\b/i,
  /Quick\s+test/i,               // Ad-hoc test session descriptions
  /endpoint\s+test/i,
  /skeleton\s+test/i,
  /\btest\s+session\b/i,
  /\bAPI\b/,                      // Technical acronym never in game narrative
  /works?\s+fine\b/i,            // QA validation language ("works fine", "work fine")
  /works?\s+(correctly|properly)\b/i, // QA validation language
  /\bfield\s+alias/i,            // Developer jargon
  /\bcorrect\s+IDs?\b/i,         // Developer identifier language
  /\bmonster[_-]attack\b/i,      // Internal tool/function name reference
  /permanently\s+stuck\b/i,      // Bug description language
  /\btest\s+(narration|combat|run|scenario)\b/i, // Test run descriptions
  /\b\d+\s+rooms?,\s/i,          // Clinical room enumeration ("7 rooms, wolf den, ...")
];

/**
 * Returns true if the summary contains internal QA/debug text that should
 * not be shown to public spectators.
 */
export function summaryContainsDebugText(summary: string): boolean {
  return DEBUG_PATTERNS.some((re) => re.test(summary));
}

/**
 * Strips debug/QA markers from a summary, returning spectator-safe prose.
 * Removes parenthetical debug notes, issue tags, and standalone markers.
 */
export function filterSummary(summary: string): string {
  let filtered = summary;

  // Remove [ie-*] tags
  filtered = filtered.replace(/\[ie-[^\]]*\]/gi, "");

  // Remove parenthetical debug notes like "(2nd confirmation)" or "(half-orc RE)"
  // that immediately follow a debug keyword phrase
  filtered = filtered.replace(/\s*\([^)]*\)\s*/g, (match, offset, str) => {
    // Only strip if preceded by a debug pattern word in the same sentence fragment
    const before = str.slice(Math.max(0, offset - 60), offset);
    if (/VERIFIED\s+FIXED|STILL\s+BROKEN|B\d{3,4}/i.test(before)) {
      return " ";
    }
    return match;
  });

  // Remove whole sentences / clauses containing debug patterns
  // Split on '. ' or '.' at end, filter, rejoin
  const sentences = filtered.split(/(?<=\.)\s+/);
  const clean = sentences.filter((s) => !DEBUG_PATTERNS.some((re) => re.test(s)));
  filtered = clean.join(" ").trim();

  // Final pass: strip any residual debug tokens
  for (const re of DEBUG_PATTERNS) {
    filtered = filtered.replace(new RegExp(re.source, re.flags + (re.flags.includes("g") ? "" : "g")), "");
  }

  // Collapse multiple spaces / trailing punctuation artifacts
  filtered = filtered.replace(/\s{2,}/g, " ").trim();

  return filtered;
}

export function handleEndSession(userId: string, params: { summary: string; completed_dungeon?: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  if (!params.summary || typeof params.summary !== "string" || params.summary.trim() === "") {
    return { success: false, error: "Missing required field: summary. Provide a summary of what happened this session." };
  }

  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  // Strip any QA/debug markers before storing or surfacing the summary
  const cleanSummary = filterSummary(params.summary);

  if (party.session) {
    party.session = endSessionState(party.session);
  }

  logEvent(party, "session_end", null, { summary: cleanSummary });

  // Track lifetime stats for all party members
  for (const mid of party.members) {
    const m = characters.get(mid);
    if (m) {
      m.sessionsPlayed++;
      if (params.completed_dungeon) m.dungeonsCleared++;
    }
  }

  snapshotCharacters(party);

  // Persist DM stats
  persistDmStats(userId, { sessionsAsDM: 1, dungeonsCompletedAsDM: params.completed_dungeon ? 1 : 0 });

  // Mark session as ended in DB
  if (party.dbReady) {
    party.dbReady.then(() => {
      if (!party.dbSessionId) return;
      db.update(gameSessionsTable)
        .set({ isActive: false, endedAt: new Date(), summary: cleanSummary })
        .where(eq(gameSessionsTable.id, party.dbSessionId))
        .catch((err) => console.error("[DB] Failed to end session:", err));
    });
  }

  // Update campaign state if this party has one
  let campaignUpdate: Record<string, unknown> | null = null;
  if (party.campaignId) {
    const campaign = campaignsMap.get(party.campaignId);
    if (campaign) {
      campaign.sessionCount++;
      if (params.completed_dungeon && !campaign.completedDungeons.includes(params.completed_dungeon)) {
        campaign.completedDungeons.push(params.completed_dungeon);
      }

      // Record session history
      campaign.sessionHistory.push({
        session_number: campaign.sessionCount,
        summary: cleanSummary,
        completed_dungeon: params.completed_dungeon,
      });

      campaignUpdate = {
        campaign_name: campaign.name,
        campaign_session_count: campaign.sessionCount,
        completed_dungeons: campaign.completedDungeons,
      };

      // Persist campaign updates to DB (quests + sessionHistory stored in storyFlags)
      persistCampaignState(campaign);
    }
  }

  const eventSummary = summarizeSession(party.events);

  return {
    success: true,
    data: {
      ended: true,
      summary: params.summary,
      eventLog: eventSummary,
      ...(campaignUpdate ?? {}),
    },
  };
}

// --- Campaign Management ---

export function handleCreateCampaign(userId: string, params: {
  name: string;
  description?: string;
}): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  if (!params.name || params.name.trim().length === 0) {
    return { success: false, error: "Campaign name is required." };
  }

  if (party.campaignId) {
    return { success: false, error: "This party already has an active campaign. End it before creating a new one." };
  }

  const campaignId = nextId("campaign");
  const campaign: GameCampaign = {
    id: campaignId,
    name: params.name.trim(),
    description: params.description?.trim() ?? "",
    createdByUserId: userId,
    partyId: party.id,
    storyFlags: {},
    completedDungeons: [],
    quests: [],
    sessionHistory: [],
    sessionCount: party.session ? 1 : 0,
    status: "active",
    dbCampaignId: null,
  };

  campaignsMap.set(campaignId, campaign);
  party.campaignId = campaignId;

  // Persist to DB (fire-and-forget)
  const dbUserId = getDbUserId(userId);
  db.insert(campaignsTable).values({
    name: campaign.name,
    description: campaign.description,
    createdByUserId: dbUserId ?? undefined,
    partyId: party.dbPartyId ?? undefined,
  }).returning({ id: campaignsTable.id }).then(([row]) => {
    campaign.dbCampaignId = row.id;
    // Also update party's campaign FK
    if (party.dbPartyId) {
      db.update(partiesTable)
        .set({ campaignId: row.id })
        .where(eq(partiesTable.id, party.dbPartyId))
        .catch((err) => console.error("[DB] Failed to update party campaignId:", err));
    }
  }).catch((err) => console.error("[DB] Failed to persist campaign:", err));

  logEvent(party, "campaign_created", null, {
    campaignId, name: campaign.name, description: campaign.description,
  });

  return {
    success: true,
    data: {
      campaign_id: campaignId,
      name: campaign.name,
      description: campaign.description,
      status: campaign.status,
      session_count: campaign.sessionCount,
    },
  };
}

export function handleGetCampaign(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  if (!party.campaignId) {
    return { success: false, error: "No active campaign for this party." };
  }

  const campaign = campaignsMap.get(party.campaignId);
  if (!campaign) {
    return { success: false, error: "Campaign not found." };
  }

  // Gather full party member info for briefing
  const members = party.members.map((mid) => {
    const c = characters.get(mid);
    if (!c) return null;
    const nextLevelXp = c.level < MAX_LEVEL ? XP_THRESHOLDS[c.level + 1] : null;
    return {
      id: c.id,
      name: c.name,
      race: c.race,
      class: c.class,
      level: c.level,
      xp: c.xp,
      xp_next_level: nextLevelXp,
      hp: c.hpCurrent,
      hpMax: c.hpMax,
      ac: c.ac,
      gold: c.gold,
      conditions: c.conditions,
      equipment: c.equipment,
      inventory: c.inventory,
      spell_slots: c.spellSlots,
      features: c.features,
    };
  }).filter(Boolean);

  // Gather campaign NPCs with personality and recent memory
  const campaignNpcs = [...npcsMap.values()]
    .filter((n) => n.campaignId === campaign.id)
    .map((n) => ({
      npc_id: n.id,
      name: n.name,
      description: n.description,
      personality: n.personality,
      location: n.location,
      disposition: n.disposition,
      disposition_label: n.dispositionLabel,
      is_alive: n.isAlive,
      tags: n.tags,
      recent_memory: n.memory.slice(-5),
    }));

  return {
    success: true,
    data: {
      campaign_id: campaign.id,
      name: campaign.name,
      description: campaign.description,
      status: campaign.status,
      session_count: campaign.sessionCount,
      completed_dungeons: campaign.completedDungeons,
      story_flags: Object.fromEntries(Object.entries(campaign.storyFlags).filter(([k]) => !k.startsWith("__"))),
      quests: campaign.quests,
      previous_sessions: campaign.sessionHistory,
      party_name: party.name,
      party_members: members,
      npcs: campaignNpcs,
    },
  };
}

export function handleStartCampaignSession(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  if (!party.campaignId) {
    return { success: false, error: "No active campaign for this party. Use create_campaign first." };
  }

  // Check session state — must not have an active session
  if (party.session && !party.session.endedAt) {
    return { success: false, error: "Session already active. End the current session before starting a new one." };
  }

  const campaign = campaignsMap.get(party.campaignId);
  if (!campaign) return { success: false, error: "Campaign not found." };

  // Reset party state for new session
  party.monsters = [];
  party.events = [];
  party.triggeredEncounters = new Set();
  party.lootedRooms = new Set();

  // Load a new dungeon
  const template = getRandomTemplate();
  party.templateEncounters = template ? encountersFromTemplate(template) : new Map();
  party.templateLootTables = template ? lootTablesFromTemplate(template) : new Map();
  party.dungeonState = template
    ? dungeonStateFromTemplate(template)
    : createDungeonState(fallbackRooms(), fallbackConnections(), "room-1");

  // Create new session
  party.session = {
    id: nextId("session"),
    ...createSession({ partyId: party.id }),
  };

  // Persist new session to DB (fire-and-forget)
  party.dbReady = (async () => {
    try {
      if (!party.dbPartyId) return;
      const [sessionRow] = await db.insert(gameSessionsTable).values({
        partyId: party.dbPartyId,
        campaignId: campaign.dbCampaignId ?? undefined,
      }).returning({ id: gameSessionsTable.id });
      party.dbSessionId = sessionRow.id;

      // Update party's campaign_template_id for dungeon stats
      if (template) {
        const [tplRow] = await db.select({ id: campaignTemplatesTable.id }).from(campaignTemplatesTable).where(eq(campaignTemplatesTable.name, template.name));
        if (tplRow) {
          await db.update(partiesTable).set({ campaignTemplateId: tplRow.id }).where(eq(partiesTable.id, party.dbPartyId));
        }
      }
    } catch (err) {
      console.error("[DB] Failed to persist campaign session:", err);
    }
  })();

  logEvent(party, "session_start", null, {
    campaignName: campaign.name,
    sessionNumber: campaign.sessionCount + 1,
  });

  // Return the full campaign briefing so the DM has everything
  const briefing = handleGetCampaign(userId);
  if (!briefing.success) return briefing;

  return {
    success: true,
    data: {
      ...briefing.data!,
      session_number: campaign.sessionCount + 1,
      message: "New campaign session started! The party reconvenes for another adventure.",
    },
  };
}

export function handleSetStoryFlag(userId: string, params: {
  key: string;
  value: unknown;
}): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  if (!party.campaignId) {
    return { success: false, error: "No active campaign for this party." };
  }

  const campaign = campaignsMap.get(party.campaignId);
  if (!campaign) return { success: false, error: "Campaign not found." };

  if (!params.key || params.key.trim().length === 0) {
    return { success: false, error: "Story flag key is required." };
  }

  // Reject reserved keys
  const trimmedKey = params.key.trim();
  if (trimmedKey.startsWith("__")) {
    return { success: false, error: "Keys starting with '__' are reserved." };
  }

  campaign.storyFlags[trimmedKey] = params.value;
  persistCampaignState(campaign);

  logEvent(party, "story_flag_set", null, { key: trimmedKey, value: params.value });

  return {
    success: true,
    data: { story_flags: Object.fromEntries(Object.entries(campaign.storyFlags).filter(([k]) => !k.startsWith("__"))) },
  };
}

// --- Quest Tracking ---

export function handleAddQuest(userId: string, params: {
  title: string;
  description: string;
  giver_npc_id?: string;
}): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const ctx = findCampaignForDM(userId);
  if (!ctx) return { success: false, error: "Not a DM with an active campaign." };

  if (!params.title || params.title.trim().length === 0) {
    return { success: false, error: "Quest title is required." };
  }

  const quest: CampaignQuest = {
    id: nextId("quest"),
    title: params.title.trim(),
    description: params.description?.trim() ?? "",
    status: "active",
    giver_npc_id: params.giver_npc_id,
  };

  ctx.campaign.quests.push(quest);
  persistCampaignState(ctx.campaign);

  logEvent(ctx.party, "quest_added", null, { questId: quest.id, title: quest.title });

  return {
    success: true,
    data: {
      quest_id: quest.id,
      title: quest.title,
      description: quest.description,
      status: quest.status,
      giver_npc_id: quest.giver_npc_id,
    },
  };
}

export function handleUpdateQuest(userId: string, params: {
  quest_id: string;
  status?: "active" | "completed" | "failed";
  description?: string;
}): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const ctx = findCampaignForDM(userId);
  if (!ctx) return { success: false, error: "Not a DM with an active campaign." };

  const quest = ctx.campaign.quests.find((q) => q.id === params.quest_id);
  if (!quest) return { success: false, error: `Quest "${params.quest_id}" not found.` };

  if (params.status) quest.status = params.status;
  if (params.description !== undefined) quest.description = params.description.trim();

  persistCampaignState(ctx.campaign);

  logEvent(ctx.party, "quest_updated", null, { questId: quest.id, title: quest.title, status: quest.status });

  return {
    success: true,
    data: {
      quest_id: quest.id,
      title: quest.title,
      description: quest.description,
      status: quest.status,
      giver_npc_id: quest.giver_npc_id,
    },
  };
}

export function handleListQuests(userId: string, params: { status?: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const ctx = findCampaignForDM(userId);
  if (!ctx) return { success: false, error: "Not a DM with an active campaign." };

  let quests = ctx.campaign.quests;
  if (params.status) quests = quests.filter((q) => q.status === params.status);

  return {
    success: true,
    data: {
      quests: quests.map((q) => ({
        quest_id: q.id,
        title: q.title,
        description: q.description,
        status: q.status,
        giver_npc_id: q.giver_npc_id,
      })),
    },
  };
}

function persistCampaignState(campaign: GameCampaign): void {
  if (!campaign.dbCampaignId) return;
  // Store quests + sessionHistory in storyFlags under reserved keys
  const flagsWithMeta = {
    ...campaign.storyFlags,
    __quests: campaign.quests,
    __sessionHistory: campaign.sessionHistory,
  };
  db.update(campaignsTable)
    .set({
      sessionCount: campaign.sessionCount,
      completedDungeons: campaign.completedDungeons,
      storyFlags: flagsWithMeta,
    })
    .where(eq(campaignsTable.id, campaign.dbCampaignId))
    .catch((err) => console.error("[DB] Failed to update campaign:", err));
}

// --- NPC Management ---

function dispositionLabel(value: number): string {
  if (value <= -50) return "hostile";
  if (value <= -25) return "unfriendly";
  if (value < 0) return "wary";
  if (value === 0) return "neutral";
  if (value <= 25) return "friendly";
  if (value <= 50) return "allied";
  return "devoted";
}

function findCampaignForDM(userId: string): { party: GameParty; campaign: GameCampaign } | null {
  const party = findDMParty(userId);
  if (!party || !party.campaignId) return null;
  const campaign = campaignsMap.get(party.campaignId);
  if (!campaign) return null;
  return { party, campaign };
}

export function handleCreateNpc(userId: string, params: {
  name: string;
  description: string;
  personality?: string;
  location?: string;
  disposition?: number;
  tags?: string[];
}): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const ctx = findCampaignForDM(userId);
  if (!ctx) return { success: false, error: "Not a DM with an active campaign. Create a campaign first." };

  if (!params.name || params.name.trim().length === 0) {
    return { success: false, error: "NPC name is required." };
  }

  const disp = Math.max(-100, Math.min(100, params.disposition ?? 0));
  const npcId = nextId("npc");
  const npc: GameNPC = {
    id: npcId,
    campaignId: ctx.campaign.id,
    name: params.name.trim(),
    description: params.description?.trim() ?? "",
    personality: params.personality?.trim() ?? "",
    location: params.location?.trim() ?? null,
    disposition: disp,
    dispositionLabel: dispositionLabel(disp),
    isAlive: true,
    tags: params.tags ?? [],
    memory: [],
    dbNpcId: null,
  };

  npcsMap.set(npcId, npc);

  // Persist to DB (fire-and-forget)
  if (ctx.campaign.dbCampaignId) {
    db.insert(npcsTable).values({
      campaignId: ctx.campaign.dbCampaignId,
      name: npc.name,
      description: npc.description,
      personality: npc.personality,
      location: npc.location,
      disposition: npc.disposition,
      dispositionLabel: npc.dispositionLabel,
      tags: npc.tags,
    }).returning({ id: npcsTable.id }).then(([row]) => {
      npc.dbNpcId = row.id;
    }).catch((err) => console.error("[DB] Failed to persist NPC:", err));
  }

  logEvent(ctx.party, "npc_created", null, { npcId, name: npc.name, disposition: npc.disposition });

  return {
    success: true,
    data: {
      npc_id: npcId,
      name: npc.name,
      description: npc.description,
      personality: npc.personality,
      location: npc.location,
      disposition: npc.disposition,
      disposition_label: npc.dispositionLabel,
      tags: npc.tags,
    },
  };
}

export function handleGetNpc(userId: string, params: { npc_id: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  const npc = npcsMap.get(params.npc_id);
  if (!npc) return { success: false, error: `NPC "${params.npc_id}" not found. Use list_npcs to see available NPCs.` };

  return {
    success: true,
    data: {
      npc_id: npc.id,
      name: npc.name,
      description: npc.description,
      personality: npc.personality,
      location: npc.location,
      disposition: npc.disposition,
      disposition_label: npc.dispositionLabel,
      is_alive: npc.isAlive,
      tags: npc.tags,
      memory: npc.memory.slice(-5), // last 5 memories for quick reference
    },
  };
}

export function handleListNpcs(userId: string, params: { tag?: string; location?: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const ctx = findCampaignForDM(userId);
  if (!ctx) return { success: false, error: "Not a DM with an active campaign." };

  let npcs = [...npcsMap.values()].filter((n) => n.campaignId === ctx.campaign.id);

  if (params.tag) npcs = npcs.filter((n) => n.tags.includes(params.tag!));
  if (params.location) npcs = npcs.filter((n) => n.location === params.location);

  return {
    success: true,
    data: {
      npcs: npcs.map((n) => ({
        npc_id: n.id,
        name: n.name,
        location: n.location,
        disposition: n.disposition,
        disposition_label: n.dispositionLabel,
        is_alive: n.isAlive,
        tags: n.tags,
      })),
    },
  };
}

export function handleUpdateNpc(userId: string, params: {
  npc_id: string;
  description?: string;
  personality?: string;
  location?: string;
  tags?: string[];
  is_alive?: boolean;
}): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  const npc = npcsMap.get(params.npc_id);
  if (!npc) return { success: false, error: `NPC "${params.npc_id}" not found.` };

  if (params.description !== undefined) npc.description = params.description.trim();
  if (params.personality !== undefined) npc.personality = params.personality.trim();
  if (params.location !== undefined) npc.location = params.location.trim() || null;
  if (params.tags !== undefined) npc.tags = params.tags;
  if (params.is_alive !== undefined) npc.isAlive = params.is_alive;

  // Persist to DB
  if (npc.dbNpcId) {
    db.update(npcsTable).set({
      description: npc.description,
      personality: npc.personality,
      location: npc.location,
      tags: npc.tags,
      isAlive: npc.isAlive,
      updatedAt: new Date(),
    }).where(eq(npcsTable.id, npc.dbNpcId))
      .catch((err) => console.error("[DB] Failed to update NPC:", err));
  }

  return {
    success: true,
    data: {
      npc_id: npc.id,
      name: npc.name,
      description: npc.description,
      personality: npc.personality,
      location: npc.location,
      disposition: npc.disposition,
      disposition_label: npc.dispositionLabel,
      is_alive: npc.isAlive,
      tags: npc.tags,
    },
  };
}

export function handleUpdateNpcDisposition(userId: string, params: {
  npc_id: string;
  change: number;
  reason: string;
}): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const ctx = findCampaignForDM(userId);
  if (!ctx) return { success: false, error: "Not a DM with an active campaign." };

  const npc = npcsMap.get(params.npc_id);
  if (!npc) return { success: false, error: `NPC "${params.npc_id}" not found.` };

  const oldDisp = npc.disposition;
  npc.disposition = Math.max(-100, Math.min(100, npc.disposition + params.change));
  npc.dispositionLabel = dispositionLabel(npc.disposition);

  // Add to NPC memory (keep last 20)
  const memoryEntry: NpcMemoryEntry = {
    sessionId: ctx.party.session?.id ?? "unknown",
    event: "disposition_change",
    summary: params.reason,
    dispositionAtTime: npc.disposition,
  };
  npc.memory.push(memoryEntry);
  if (npc.memory.length > 20) npc.memory = npc.memory.slice(-20);

  // Persist to DB
  if (npc.dbNpcId) {
    db.update(npcsTable).set({
      disposition: npc.disposition,
      dispositionLabel: npc.dispositionLabel,
      memory: npc.memory,
      updatedAt: new Date(),
    }).where(eq(npcsTable.id, npc.dbNpcId))
      .catch((err) => console.error("[DB] Failed to update NPC disposition:", err));

    // Log interaction
    if (ctx.party.dbSessionId) {
      db.insert(npcInteractionsTable).values({
        npcId: npc.dbNpcId,
        sessionId: ctx.party.dbSessionId,
        interactionType: "disposition_change",
        description: params.reason,
        dispositionChange: params.change,
      }).catch((err) => console.error("[DB] Failed to log NPC interaction:", err));
    }
  }

  logEvent(ctx.party, "npc_disposition", null, {
    npcId: npc.id,
    npcName: npc.name,
    oldDisposition: oldDisp,
    newDisposition: npc.disposition,
    label: npc.dispositionLabel,
    reason: params.reason,
  });

  return {
    success: true,
    data: {
      npc_id: npc.id,
      name: npc.name,
      old_disposition: oldDisp,
      new_disposition: npc.disposition,
      disposition_label: npc.dispositionLabel,
      reason: params.reason,
    },
  };
}

export function handleCreateCustomMonster(userId: string, params: {
  name: string;
  hp_max: number;
  ac: number;
  attacks: { name: string; damage: string; to_hit: number; type?: string; recharge?: number; aoe?: boolean; save_dc?: number; save_ability?: string }[];
  ability_scores?: AbilityScores;
  vulnerabilities?: string[];
  immunities?: string[];
  resistances?: string[];
  special_abilities?: { name: string; description: string }[];
  xp_value?: number;
  loot_table?: { item_name: string; weight: number; quantity: number }[];
}): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  if (!params.name || params.name.trim().length === 0) {
    return { success: false, error: "Monster name is required." };
  }
  if (!params.hp_max || params.hp_max < 1) return { success: false, error: "hp_max must be at least 1." };
  if (!params.ac || params.ac < 1) return { success: false, error: "ac must be at least 1." };
  if (!params.attacks || params.attacks.length === 0) {
    return { success: false, error: "At least one attack is required." };
  }

  const template = {
    hpMax: params.hp_max,
    ac: params.ac,
    abilityScores: params.ability_scores ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
    attacks: params.attacks.map((a) => ({
      name: a.name,
      to_hit: a.to_hit,
      damage: a.damage,
      type: a.type ?? "slashing",
      ...(a.recharge ? { recharge: a.recharge } : {}),
      ...(a.aoe ? { aoe: true } : {}),
      ...(a.save_dc ? { save_dc: a.save_dc, save_ability: a.save_ability ?? "dex" } : {}),
    })),
    specialAbilities: (params.special_abilities ?? []).map((sa) => `${sa.name}: ${sa.description}`),
    xpValue: params.xp_value ?? Math.floor(params.hp_max * params.ac / 4),
    lootTable: params.loot_table?.map((e) => ({ itemName: e.item_name, weight: e.weight, quantity: e.quantity })),
    vulnerabilities: params.vulnerabilities ?? [],
    immunities: params.immunities ?? [],
    resistances: params.resistances ?? [],
  };

  monsterTemplates.set(params.name, template);

  // Persist to DB (fire-and-forget)
  const dbUserId = getDbUserId(userId);
  db.insert(customMonsterTemplatesTable).values({
    name: params.name,
    createdByUserId: dbUserId ?? undefined,
    statBlock: template,
  }).catch((err) => console.error("[DB] Failed to persist custom monster:", err));

  logEvent(party, "custom_monster_created", null, {
    name: params.name,
    hpMax: template.hpMax,
    ac: template.ac,
    attacks: template.attacks.map((a) => a.name),
  });

  return {
    success: true,
    data: {
      name: params.name,
      hp_max: template.hpMax,
      ac: template.ac,
      attacks: template.attacks,
      xp_value: template.xpValue,
    },
  };
}

/**
 * List custom (non-YAML) monster templates. DM-only.
 */
export function handleListCustomMonsters(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  // Custom monsters are those NOT in the YAML seed set.
  // We track this by checking if they were loaded from YAML during initGameData.
  // Since we can't easily distinguish, we'll return ALL monster templates —
  // the DM needs visibility into what's available for spawn_encounter.
  const templates: { name: string; hp_max: number; ac: number; xp_value: number; attacks: string[] }[] = [];
  for (const [name, t] of monsterTemplates) {
    templates.push({
      name,
      hp_max: t.hpMax,
      ac: t.ac,
      xp_value: t.xpValue,
      attacks: t.attacks.map((a) => a.name),
    });
  }

  return { success: true, data: { templates } };
}

// --- Internal helpers ---

function rollMonsterLoot(party: GameParty, monster: MonsterInstance): void {
  if (!monster.lootTable || monster.lootTable.length === 0) return;

  const lootResult = rollLootTable(monster.lootTable);
  if (lootResult.items.length === 0) return;

  // Add items to ground for pickup
  for (const drop of lootResult.items) {
    const existing = party.groundItems.find((g) => g.itemName === drop.itemName);
    if (existing) {
      existing.quantity += drop.quantity;
    } else {
      party.groundItems.push({ itemName: drop.itemName, quantity: drop.quantity });
    }
  }

  logEvent(party, "loot_drop", null, {
    monsterName: monster.name,
    items: lootResult.items,
  });

  broadcastToParty(party.id, {
    type: "loot_drop",
    monsterName: monster.name,
    items: lootResult.items,
    message: `${monster.name} dropped: ${lootResult.items.map((i) => `${i.itemName}${i.quantity > 1 ? ` x${i.quantity}` : ""}`).join(", ")}`,
  });
}

function findDMParty(dmUserId: string): GameParty | null {
  for (const party of parties.values()) {
    if (party.dmUserId === dmUserId) return party;
  }
  return null;
}

function generatePartyName(memberIds: string[]): string {
  const members = memberIds.map((id) => characters.get(id)).filter(Boolean) as GameCharacter[];

  // Adjective pools based on party composition
  const raceAdjectives: Record<string, string[]> = {
    dwarf: ["Ironwall", "Stoneborn", "Deepforge"],
    elf: ["Starweave", "Moonlit", "Sylvan"],
    halfling: ["Lucky", "Wandering", "Hearth"],
    human: ["Valiant", "Unbroken", "Stalwart"],
    "half-orc": ["Bloodforged", "Savage", "Thunderborn"],
  };

  const classNouns: Record<string, string[]> = {
    fighter: ["Shields", "Blades", "Vanguard"],
    rogue: ["Shadows", "Daggers", "Whispers"],
    cleric: ["Covenant", "Faithful", "Lanterns"],
    wizard: ["Circle", "Arcanum", "Spellweavers"],
  };

  // Pick adjective from most common race
  const raceCounts = new Map<string, number>();
  for (const m of members) {
    raceCounts.set(m.race, (raceCounts.get(m.race) ?? 0) + 1);
  }
  const topRace = [...raceCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "human";
  const adjectives = raceAdjectives[topRace] ?? raceAdjectives.human;

  // Pick noun from most common class
  const classCounts = new Map<string, number>();
  for (const m of members) {
    classCounts.set(m.class, (classCounts.get(m.class) ?? 0) + 1);
  }
  const topClass = [...classCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "fighter";
  const nouns = classNouns[topClass] ?? classNouns.fighter;

  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];

  return `The ${adj} ${noun}`;
}

function encountersFromTemplate(template: DungeonTemplate): Map<string, TemplateEncounter> {
  const map = new Map<string, TemplateEncounter>();
  const encounterById = new Map(template.encounters.map((e) => [e.id, e]));
  for (const room of template.rooms) {
    if (room.suggestedEncounter) {
      const enc = encounterById.get(room.suggestedEncounter);
      if (enc) map.set(room.id, enc);
    }
  }
  return map;
}

function lootTablesFromTemplate(template: DungeonTemplate): Map<string, TemplateLootTable> {
  const map = new Map<string, TemplateLootTable>();
  const tableById = new Map(template.lootTables.map((lt) => [lt.id, lt]));
  for (const room of template.rooms) {
    if (room.lootTable) {
      const lt = tableById.get(room.lootTable);
      if (lt) map.set(room.id, lt);
    }
  }
  return map;
}

function dungeonStateFromTemplate(template: DungeonTemplate): DungeonState {
  const rooms = template.rooms.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    type: r.type,
    features: r.features,
  }));
  const connections = template.connections.map((c) => ({
    fromRoomId: c.fromRoomId,
    toRoomId: c.toRoomId,
    type: c.type,
  }));
  return createDungeonState(rooms, connections, template.entryRoomId);
}

function fallbackRooms() {
  return [
    { id: "room-1", name: "Entrance Hall", description: "A dark stone entrance with torches flickering on the walls.", type: "entry" as const, features: ["Torches", "Stone archway"] },
    { id: "room-2", name: "Guard Room", description: "A room with overturned furniture. Signs of a struggle.", type: "chamber" as const, features: ["Overturned table", "Weapon rack"] },
    { id: "room-3", name: "Boss Chamber", description: "A large chamber with a throne at the far end.", type: "boss" as const, features: ["Throne", "Treasure chest"] },
  ];
}

function fallbackConnections() {
  return [
    { fromRoomId: "room-1", toRoomId: "room-2", type: "passage" as const },
    { fromRoomId: "room-2", toRoomId: "room-3", type: "door" as const },
  ];
}

function formParty(match: MatchResult): void {
  const partyId = nextId("party");

  const memberIds = match.players.map((p) => p.characterId);
  const partyName = generatePartyName(memberIds);

  const party: GameParty = {
    id: partyId,
    name: partyName,
    members: memberIds,
    dmUserId: match.dm.userId,
    dungeonState: null,
    session: null,
    monsters: [],
    events: [],
    templateEncounters: new Map(),
    triggeredEncounters: new Set(),
    templateLootTables: new Map(),
    lootedRooms: new Set(),
    groundItems: [],
    campaignId: null,
    dbPartyId: null,
    dbSessionId: null,
    dbReady: null,
  };

  // Assign characters to party
  for (const player of match.players) {
    const char = characters.get(player.characterId);
    if (char) char.partyId = partyId;

    // Remove from queue
    const qIdx = playerQueue.findIndex((q) => q.userId === player.userId);
    if (qIdx !== -1) playerQueue.splice(qIdx, 1);
  }

  // Remove DM from queue
  const dmIdx = dmQueue.findIndex((q) => q.userId === match.dm.userId);
  if (dmIdx !== -1) dmQueue.splice(dmIdx, 1);

  // Load dungeon from a template (pick random), with hardcoded fallback
  const template = getRandomTemplate();
  party.templateEncounters = template ? encountersFromTemplate(template) : new Map();
  party.templateLootTables = template ? lootTablesFromTemplate(template) : new Map();
  party.dungeonState = template
    ? dungeonStateFromTemplate(template)
    : createDungeonState(fallbackRooms(), fallbackConnections(), "room-1");
  party.session = {
    id: nextId("session"),
    ...createSession({ partyId }),
  };

  // Persist party + session to DB (fire-and-forget)
  party.dbReady = (async () => {
    try {
      const dmDbUserId = match.dm.userId ? getDbUserId(match.dm.userId) : null;
      // Look up campaign_template DB id by name so dungeon stats aggregate correctly
      let templateDbId: string | undefined;
      if (template) {
        const [tplRow] = await db.select({ id: campaignTemplatesTable.id }).from(campaignTemplatesTable).where(eq(campaignTemplatesTable.name, template.name));
        templateDbId = tplRow?.id;
      }
      const [partyRow] = await db.insert(partiesTable).values({ name: partyName, dmUserId: dmDbUserId, campaignTemplateId: templateDbId }).returning({ id: partiesTable.id });
      party.dbPartyId = partyRow.id;
      const [sessionRow] = await db.insert(gameSessionsTable).values({ partyId: partyRow.id }).returning({ id: gameSessionsTable.id });
      party.dbSessionId = sessionRow.id;

      // Update character partyId FKs in DB
      for (const charId of party.members) {
        const char = characters.get(charId);
        if (char?.dbCharId) {
          db.update(charactersTable)
            .set({ partyId: partyRow.id })
            .where(eq(charactersTable.id, char.dbCharId))
            .catch((err) => console.error("[DB] Failed to update character partyId:", err));
        }
      }
    } catch (err) {
      console.error("[DB] Failed to persist session:", err);
    }
  })();

  parties.set(partyId, party);

  // Track DM stats
  if (match.dm.userId) {
    persistDmStats(match.dm.userId, { totalPartiesLed: 1 });
  }
}

function logEvent(party: GameParty | null, type: string, actorId: string | null, data: Record<string, unknown>): void {
  if (!party) return;
  const timestamp = new Date();
  party.events.push({ type, actorId, data, timestamp });

  // Persist to DB (fire-and-forget, chained after session row exists)
  if (party.dbReady) {
    party.dbReady.then(() => {
      if (!party.dbSessionId) return;
      db.insert(sessionEventsTable).values({
        sessionId: party.dbSessionId,
        type,
        actorId,
        data,
        createdAt: timestamp,
      }).catch((err) => console.error("[DB] Failed to persist event:", err));
    }).catch((err) => console.error("[DB] logEvent: dbReady rejected:", err));
  }
}

function persistDmStats(userId: string, increments: { sessionsAsDM?: number; dungeonsCompletedAsDM?: number; totalPartiesLed?: number; totalEncountersRun?: number; totalMonsterSpawns?: number }): void {
  const dbUserId = getDbUserId(userId);
  if (!dbUserId) return;

  // Find existing user info for username
  const user = [...characters.values()].find((c) => c.userId === userId);
  // Also check auth users
  const username = user?.name ?? "DM";

  // Upsert: try update first, insert if not found
  db.select().from(dmStatsTable).where(eq(dmStatsTable.userId, dbUserId)).then((rows) => {
    if (rows.length > 0) {
      const row = rows[0];
      db.update(dmStatsTable).set({
        sessionsAsDM: row.sessionsAsDM + (increments.sessionsAsDM ?? 0),
        dungeonsCompletedAsDM: row.dungeonsCompletedAsDM + (increments.dungeonsCompletedAsDM ?? 0),
        totalPartiesLed: row.totalPartiesLed + (increments.totalPartiesLed ?? 0),
        totalEncountersRun: row.totalEncountersRun + (increments.totalEncountersRun ?? 0),
        totalMonsterSpawns: row.totalMonsterSpawns + (increments.totalMonsterSpawns ?? 0),
      }).where(eq(dmStatsTable.id, row.id))
        .catch((err) => console.error("[DB] Failed to update DM stats:", err));
    } else {
      // Need the username from the users table
      db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, dbUserId)).then((userRows) => {
        const uname = userRows[0]?.username ?? "DM";
        db.insert(dmStatsTable).values({
          userId: dbUserId,
          username: uname,
          sessionsAsDM: increments.sessionsAsDM ?? 0,
          dungeonsCompletedAsDM: increments.dungeonsCompletedAsDM ?? 0,
          totalPartiesLed: increments.totalPartiesLed ?? 0,
          totalEncountersRun: increments.totalEncountersRun ?? 0,
          totalMonsterSpawns: increments.totalMonsterSpawns ?? 0,
        }).catch((err) => console.error("[DB] Failed to insert DM stats:", err));
      }).catch((err) => console.error("[DB] Failed to look up username for DM stats:", err));
    }
  }).catch((err) => console.error("[DB] Failed to read DM stats:", err));
}

function snapshotCharacters(party: GameParty): void {
  if (!party.dbReady) return;
  party.dbReady.then(() => {
    for (const charId of party.members) {
      const char = characters.get(charId);
      if (!char) continue;

      const snapshot = {
        level: char.level,
        xp: char.xp,
        gold: char.gold,
        hpCurrent: char.hpCurrent,
        hpMax: char.hpMax,
        ac: char.ac,
        abilityScores: char.abilityScores,
        spellSlots: char.spellSlots,
        hitDice: char.hitDice,
        inventory: char.inventory,
        equipment: char.equipment,
        proficiencies: char.proficiencies,
        features: char.features,
        conditions: char.conditions,
        deathSaves: char.deathSaves,
        backstory: char.backstory,
        personality: char.personality,
        playstyle: char.playstyle,
        avatarUrl: char.avatarUrl,
        description: char.description,
        isAlive: char.hpCurrent > 0 && !char.conditions.includes("dead"),
        monstersKilled: char.monstersKilled,
        dungeonsCleared: char.dungeonsCleared,
        sessionsPlayed: char.sessionsPlayed,
        totalDamageDealt: char.totalDamageDealt,
        criticalHits: char.criticalHits,
        timesKnockedOut: char.timesKnockedOut,
        goldEarned: char.goldEarned,
      };

      if (char.dbCharId) {
        db.update(charactersTable)
          .set(snapshot)
          .where(eq(charactersTable.id, char.dbCharId))
          .catch((err) => console.error("[DB] Failed to snapshot character:", err));
      } else {
        // Race condition fallback: character DB insert hasn't resolved yet
        const dbUserId = getDbUserId(char.userId);
        if (dbUserId) {
          db.insert(charactersTable).values({
            userId: dbUserId,
            name: char.name,
            race: char.race,
            class: char.class,
            partyId: party.dbPartyId,
            ...snapshot,
          }).returning({ id: charactersTable.id })
            .then(([row]) => { char.dbCharId = row.id; })
            .catch((err) => console.error("[DB] Failed to insert character at snapshot:", err));
        }
      }
    }
  }).catch((err) => console.error("[DB] snapshotCharacters failed:", err));
}

function getWeaponDamage(weaponName: string | null): { damage: string; properties: string[]; damageType: string; magicBonus?: number } {
  if (!weaponName) return { damage: "1d4", properties: [], damageType: "bludgeoning" };

  const item = itemDefs.get(weaponName);
  if (item) {
    if (item.category === "weapon") {
      return { damage: item.damage ?? "1d4", properties: item.properties ?? [], damageType: item.damageType ?? "bludgeoning" };
    }
    if (item.category === "magic_item" && item.baseWeapon) {
      const base = itemDefs.get(item.baseWeapon);
      return {
        damage: base?.damage ?? "1d4",
        properties: base?.properties ?? [],
        damageType: base?.damageType ?? "bludgeoning",
        magicBonus: item.magicBonus ?? 0,
      };
    }
  }

  // Hardcoded fallback for backwards compat
  const fallbacks: Record<string, { damage: string; properties: string[]; damageType: string }> = {
    "Longsword": { damage: "1d8", properties: ["versatile"], damageType: "slashing" },
    "Shortsword": { damage: "1d6", properties: ["finesse"], damageType: "piercing" },
    "Greatsword": { damage: "2d6", properties: ["heavy", "two-handed"], damageType: "slashing" },
    "Dagger": { damage: "1d4", properties: ["finesse", "light", "thrown"], damageType: "piercing" },
    "Mace": { damage: "1d6", properties: [], damageType: "bludgeoning" },
    "Staff": { damage: "1d6", properties: ["versatile"], damageType: "bludgeoning" },
    "Longbow": { damage: "1d8", properties: ["ranged", "two-handed"], damageType: "piercing" },
    "Handaxe": { damage: "1d6", properties: ["light", "thrown"], damageType: "slashing" },
    "Warhammer": { damage: "1d8", properties: ["versatile"], damageType: "bludgeoning" },
  };
  return fallbacks[weaponName] ?? { damage: "1d4", properties: [], damageType: "bludgeoning" };
}

// --- Load spell definitions ---

export function loadSpellDef(name: string, spell: SpellDefinition): void {
  spellDefs.set(name, spell);
}

export function loadItemDef(name: string, item: ItemDef): void {
  itemDefs.set(name, item);
}

export function loadMonsterTemplate(name: string, template: {
  hpMax: number; ac: number;
  abilityScores: AbilityScores;
  attacks: { name: string; to_hit: number; damage: string; type: string }[];
  specialAbilities: string[];
  xpValue: number;
  lootTable?: LootTableEntry[];
}): void {
  monsterTemplates.set(name, template);
}

// --- Data loading ---

interface YAMLMonster {
  name: string;
  hp_max: number;
  ac: number;
  ability_scores: AbilityScores;
  attacks: { name: string; to_hit: number; damage: string; type: string }[];
  special_abilities: string[];
  xp_value: number;
  loot_table?: { item_name: string; weight: number; quantity: number }[];
}

interface YAMLSpell {
  name: string;
  level: number;
  casting_time: string;
  effect: string;
  damage_or_healing: string | null;
  ability_for_damage: string | null;
  saving_throw: string | null;
  spell_attack_type: string | null;
  is_healing: boolean;
  is_concentration: boolean;
  range: string;
  classes: string[];
}

function findDataDir(): string {
  // Try import.meta.dir-relative path first, then process.cwd()
  const candidates = [
    join(import.meta.dir, "../../data"),
    join(process.cwd(), "data"),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, "monsters.yaml"))) return dir;
  }
  return candidates[0]; // fall back, will log a warning on load
}

export function initGameData(dataDir?: string): void {
  const dir = dataDir ?? findDataDir();

  // Load monsters
  try {
    const monstersYAML = readFileSync(join(dir, "monsters.yaml"), "utf-8");
    const monsters = parseYAML(monstersYAML) as YAMLMonster[];
    for (const m of monsters) {
      monsterTemplates.set(m.name, {
        hpMax: m.hp_max,
        ac: m.ac,
        abilityScores: m.ability_scores,
        attacks: m.attacks,
        specialAbilities: m.special_abilities ?? [],
        xpValue: m.xp_value,
        lootTable: m.loot_table?.map((e) => ({
          itemName: e.item_name,
          weight: e.weight,
          quantity: e.quantity,
        })),
      });
    }
    console.log(`  Loaded ${monsters.length} monster templates`);
  } catch (e) {
    console.warn("  Warning: Could not load monsters.yaml:", (e as Error).message);
  }

  // Load spells
  try {
    const spellsYAML = readFileSync(join(dir, "spells.yaml"), "utf-8");
    const spells = parseYAML(spellsYAML) as YAMLSpell[];
    for (const s of spells) {
      const ability = s.ability_for_damage as "str" | "dex" | "con" | "int" | "wis" | "cha" | null;
      const save = s.saving_throw as "str" | "dex" | "con" | "int" | "wis" | "cha" | null;
      spellDefs.set(s.name, {
        name: s.name,
        level: s.level,
        castingTime: s.casting_time as "action" | "bonus_action" | "reaction",
        effect: s.effect,
        damageOrHealing: s.damage_or_healing,
        abilityForDamage: ability,
        savingThrow: save,
        spellAttackType: (s.spell_attack_type as "ranged" | "melee" | null) ?? null,
        isHealing: s.is_healing,
        isConcentration: s.is_concentration,
        range: s.range as "self" | "touch" | "ranged",
        classes: s.classes as CharacterClass[],
      });
    }
    console.log(`  Loaded ${spells.length} spell definitions`);
  } catch (e) {
    console.warn("  Warning: Could not load spells.yaml:", (e as Error).message);
  }

  // Load items
  try {
    const itemsYAML = readFileSync(join(dir, "items.yaml"), "utf-8");
    const parsed = parseYAML(itemsYAML) as Record<string, unknown>;
    let count = 0;

    const weaponList = (parsed.weapons ?? []) as { name: string; damage: string; damage_type: string; properties: string[]; description: string }[];
    for (const w of weaponList) {
      itemDefs.set(w.name, { name: w.name, category: "weapon", description: w.description, damage: w.damage, damageType: w.damage_type, properties: w.properties ?? [] });
      count++;
    }

    const armorList = (parsed.armor ?? []) as { name: string; ac_base: number; ac_dex_cap: number | null; type: string; description: string }[];
    for (const a of armorList) {
      itemDefs.set(a.name, { name: a.name, category: "armor", description: a.description, acBase: a.ac_base, acDexCap: a.ac_dex_cap, armorType: a.type });
      count++;
    }

    const potionList = (parsed.potions ?? []) as { name: string; heal_amount: string; description: string }[];
    for (const p of potionList) {
      itemDefs.set(p.name, { name: p.name, category: "potion", description: p.description, healAmount: p.heal_amount });
      count++;
    }

    const scrollList = (parsed.scrolls ?? []) as { name: string; spell_name: string; description: string }[];
    for (const s of scrollList) {
      itemDefs.set(s.name, { name: s.name, category: "scroll", description: s.description, spellName: s.spell_name });
      count++;
    }

    const magicList = (parsed.magic_items ?? []) as { name: string; base_weapon?: string; magic_bonus?: number; type?: string; description: string }[];
    for (const m of magicList) {
      itemDefs.set(m.name, { name: m.name, category: "magic_item", description: m.description, baseWeapon: m.base_weapon, magicBonus: m.magic_bonus, magicType: m.type });
      count++;
    }

    const miscList = (parsed.misc ?? []) as { name: string; description: string }[];
    for (const x of miscList) {
      itemDefs.set(x.name, { name: x.name, category: "misc", description: x.description });
      count++;
    }

    console.log(`  Loaded ${count} item definitions`);
  } catch (e) {
    console.warn("  Warning: Could not load items.yaml:", (e as Error).message);
  }
}

// Auto-load game data on import
try {
  initGameData();
} catch (e) {
  console.error("Failed to load game data on startup:", (e as Error).message);
}

// --- Restart loading ---

export async function loadPersistedState(): Promise<number> {
  try {
    // Mark all previously-active sessions as inactive on startup.
    // Without connected players/DM, restored sessions are ghost parties.
    // Fresh sessions should be created by agents after restart.
    await db.update(gameSessionsTable).set({ isActive: false }).where(eq(gameSessionsTable.isActive, true));

    // Nothing to restore — all sessions deactivated above
    const activeSessions: typeof gameSessionsTable.$inferSelect[] = [];
    let loaded = 0;

    for (const sessionRow of activeSessions) {
      // Load party
      const [partyRow] = await db.select().from(partiesTable).where(eq(partiesTable.id, sessionRow.partyId));
      if (!partyRow) continue;

      // Load characters for this party
      const charRows = await db.select().from(charactersTable).where(eq(charactersTable.partyId, partyRow.id));
      if (charRows.length === 0) continue;

      // Load events
      const eventRows = await db.select().from(sessionEventsTable)
        .where(eq(sessionEventsTable.sessionId, sessionRow.id))
        .orderBy(asc(sessionEventsTable.createdAt));

      const partyId = nextId("party");
      const memberIds: string[] = [];

      // Rebuild characters
      for (const row of charRows) {
        const userId = findUserIdByDbId(row.userId);
        if (!userId) continue;

        const charId = nextId("char");
        const abilityScores = row.abilityScores as AbilityScores;
        const spellSlots = row.spellSlots as CharacterSheet["spellSlots"];
        const hitDice = row.hitDice as CharacterSheet["hitDice"];
        const equipment = row.equipment as CharacterSheet["equipment"];

        const char: GameCharacter = {
          name: row.name,
          race: row.race,
          class: row.class,
          level: row.level,
          xp: row.xp,
          gold: row.gold ?? 0,
          abilityScores,
          hpMax: row.hpMax,
          hpCurrent: row.hpCurrent,
          ac: row.ac,
          spellSlots,
          hitDice,
          inventory: row.inventory,
          equipment,
          proficiencies: row.proficiencies,
          features: row.features,
          backstory: row.backstory,
          personality: row.personality,
          playstyle: row.playstyle,
          avatarUrl: row.avatarUrl ?? null,
          description: row.description ?? null,
          id: charId,
          userId,
          partyId,
          conditions: (row.conditions as string[]) ?? [],
          deathSaves: (row.deathSaves as DeathSaves) ?? { successes: 0, failures: 0 },
          dbCharId: row.id,
          monstersKilled: 0,
          dungeonsCleared: 0,
          sessionsPlayed: 0,
          totalDamageDealt: 0,
          criticalHits: 0,
          timesKnockedOut: 0,
          goldEarned: 0,
          relentlessEnduranceUsed: false,
        };

        characters.set(charId, char);
        charactersByUser.set(userId, charId);
        memberIds.push(charId);
      }

      if (memberIds.length === 0) continue;

      // Rebuild events
      const events: SessionEvent[] = eventRows.map((e) => ({
        type: e.type,
        actorId: e.actorId,
        data: e.data as Record<string, unknown>,
        timestamp: e.createdAt,
      }));

      // Recreate dungeon from template (pick random), with fallback
      const restoreTemplate = getRandomTemplate();

      // Find DM userId — look for a user that is a DM for this session
      // The DM isn't stored on the party row, so we check event actors or fall back to null
      let dmUserId: string | null = null;
      const dmDbId = partyRow.dmUserId;
      if (dmDbId) {
        dmUserId = findUserIdByDbId(dmDbId);
      }

      const party: GameParty = {
        id: partyId,
        name: partyRow.name ?? "Unnamed Party",
        members: memberIds,
        dmUserId,
        dungeonState: restoreTemplate
          ? dungeonStateFromTemplate(restoreTemplate)
          : createDungeonState(fallbackRooms(), fallbackConnections(), "room-1"),
        session: {
          id: nextId("session"),
          partyId,
          phase: "exploration", // reset to exploration (can't restore combat)
          currentTurn: 0,
          initiativeOrder: [],
          turnResources: {},
          isActive: true,
          startedAt: sessionRow.startedAt,
          endedAt: null,
        },
        monsters: [],
        events,
        templateEncounters: restoreTemplate ? encountersFromTemplate(restoreTemplate) : new Map(),
        triggeredEncounters: new Set(),
        templateLootTables: restoreTemplate ? lootTablesFromTemplate(restoreTemplate) : new Map(),
        lootedRooms: new Set(),
        campaignId: null, // TODO: restore from DB when campaigns are loaded
        dbPartyId: partyRow.id,
        dbSessionId: sessionRow.id,
        dbReady: Promise.resolve(),
      };

      parties.set(partyId, party);
      loaded++;
    }

    return loaded;
  } catch (err) {
    console.error("[DB] Failed to load persisted state:", err);
    return 0;
  }
}

/**
 * Load all characters from DB into memory so they persist across restarts.
 * For each user, loads the most recent character (by createdAt).
 * Resets HP to max and clears conditions/deathSaves (restart = long rest).
 */
export async function loadPersistedCharacters(): Promise<number> {
  try {
    const rows = await db.select().from(charactersTable).orderBy(desc(charactersTable.createdAt));
    let loaded = 0;
    const seenUsers = new Set<string>();

    for (const row of rows) {
      const userId = findUserIdByDbId(row.userId);
      if (!userId) continue;

      // One character per user — keep the most recent (rows ordered by createdAt DESC)
      if (seenUsers.has(userId)) continue;
      seenUsers.add(userId);

      // Skip if user already has a character in memory (from loadPersistedState)
      if (charactersByUser.has(userId)) continue;

      const charId = nextId("char");
      const abilityScores = row.abilityScores as AbilityScores;
      const spellSlots = row.spellSlots as CharacterSheet["spellSlots"];
      const hitDice = row.hitDice as CharacterSheet["hitDice"];
      const equipment = row.equipment as CharacterSheet["equipment"];

      const char: GameCharacter = {
        name: row.name,
        race: row.race,
        class: row.class,
        level: row.level,
        xp: row.xp,
        gold: row.gold ?? 0,
        abilityScores,
        hpMax: row.hpMax,
        hpCurrent: row.hpMax, // restart = long rest, full HP
        ac: row.ac,
        spellSlots,
        hitDice,
        inventory: row.inventory,
        equipment,
        proficiencies: row.proficiencies,
        features: row.features,
        backstory: row.backstory,
        personality: row.personality,
        playstyle: row.playstyle,
        avatarUrl: row.avatarUrl ?? null,
        description: row.description ?? null,
        id: charId,
        userId,
        partyId: null, // no active party after restart
        conditions: [],
        deathSaves: { successes: 0, failures: 0 },
        dbCharId: row.id,
        monstersKilled: row.monstersKilled ?? 0,
        dungeonsCleared: row.dungeonsCleared ?? 0,
        sessionsPlayed: row.sessionsPlayed ?? 0,
        totalDamageDealt: row.totalDamageDealt ?? 0,
        criticalHits: row.criticalHits ?? 0,
        timesKnockedOut: row.timesKnockedOut ?? 0,
        goldEarned: row.goldEarned ?? 0,
        relentlessEnduranceUsed: false,
      };

      characters.set(charId, char);
      charactersByUser.set(userId, charId);
      loaded++;
    }

    return loaded;
  } catch (err) {
    console.error("[DB] Failed to load persisted characters:", err);
    return 0;
  }
}

/**
 * Load custom monster templates from DB into the in-memory monsterTemplates map.
 * Called at startup so DM-created monsters persist across restarts.
 */
export async function loadCustomMonsters(): Promise<number> {
  try {
    const rows = await db.select().from(customMonsterTemplatesTable);
    let loaded = 0;
    for (const row of rows) {
      const stat = row.statBlock as Record<string, unknown> | null;
      if (!stat || monsterTemplates.has(row.name)) continue; // don't overwrite YAML templates
      if (!stat.hpMax) {
        console.warn(`[DB] Custom monster "${row.name}" has no hpMax — skipping`);
        continue;
      }
      monsterTemplates.set(row.name, stat);
      loaded++;
    }
    return loaded;
  } catch (err) {
    console.error("[DB] Failed to load custom monsters:", err);
    return 0;
  }
}

/**
 * Load campaigns from DB into memory.
 * Re-links campaigns to parties by matching dbPartyId.
 */
export async function loadCampaigns(): Promise<number> {
  try {
    const rows = await db.select().from(campaignsTable);
    let loaded = 0;
    for (const row of rows) {
      if (row.status === "abandoned") continue; // skip abandoned campaigns

      const campaignId = nextId("campaign");

      // Find the in-memory party linked to this campaign's DB party
      let linkedPartyId: string | null = null;
      if (row.partyId) {
        for (const [pid, p] of parties) {
          if (p.dbPartyId === row.partyId) {
            linkedPartyId = pid;
            p.campaignId = campaignId;
            break;
          }
        }
      }

      const campaign: GameCampaign = {
        id: campaignId,
        name: row.name,
        description: row.description,
        createdByUserId: row.createdByUserId ? findUserIdByDbId(row.createdByUserId) : null,
        partyId: linkedPartyId,
        storyFlags: (row.storyFlags as Record<string, unknown>) ?? {},
        completedDungeons: (row.completedDungeons as string[]) ?? [],
        quests: ((row.storyFlags as Record<string, unknown>)?.__quests as CampaignQuest[]) ?? [],
        sessionHistory: ((row.storyFlags as Record<string, unknown>)?.__sessionHistory as SessionHistoryEntry[]) ?? [],
        sessionCount: row.sessionCount,
        status: row.status as "active" | "completed" | "abandoned",
        dbCampaignId: row.id,
      };

      campaignsMap.set(campaignId, campaign);
      loaded++;
    }
    return loaded;
  } catch (err) {
    console.error("[DB] Failed to load campaigns:", err);
    return 0;
  }
}

export async function loadNpcs(): Promise<number> {
  try {
    const rows = await db.select().from(npcsTable);
    let loaded = 0;
    for (const row of rows) {
      // Find the in-memory campaign linked to this NPC's DB campaign
      let linkedCampaignId: string | null = null;
      for (const [cid, c] of campaignsMap) {
        if (c.dbCampaignId === row.campaignId) {
          linkedCampaignId = cid;
          break;
        }
      }
      if (!linkedCampaignId) continue; // skip NPCs from unloaded campaigns

      const npcId = nextId("npc");
      const npc: GameNPC = {
        id: npcId,
        campaignId: linkedCampaignId,
        name: row.name,
        description: row.description,
        personality: row.personality,
        location: row.location,
        disposition: row.disposition,
        dispositionLabel: row.dispositionLabel,
        isAlive: row.isAlive,
        tags: (row.tags as string[]) ?? [],
        memory: (row.memory as NpcMemoryEntry[]) ?? [],
        dbNpcId: row.id,
      };
      npcsMap.set(npcId, npc);
      loaded++;
    }
    return loaded;
  } catch (err) {
    console.error("[DB] Failed to load NPCs:", err);
    return 0;
  }
}

// --- State access for testing ---

export function getState() {
  return { characters, parties, playerQueue, dmQueue, campaigns: campaignsMap };
}
