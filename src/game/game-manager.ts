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
import { tryMatchParty, type QueueEntry, type MatchResult } from "./matchmaker.ts";
import { resolveAttack, meleeAttackParams, rangedAttackParams } from "../engine/combat.ts";
import { abilityCheck, savingThrow, groupCheck, proficiencyBonus } from "../engine/checks.ts";
import { applyDamage, applyHealing, handleDropToZero, addCondition, removeCondition, hasCondition, calculateAC } from "../engine/hp.ts";
import { castSpell, spellSaveDC, spellAttackBonus, type SpellDefinition } from "../engine/spells.ts";
import { deathSave, applyDeathSaveConditions, resetDeathSaves, damageAtZeroHP } from "../engine/death.ts";
import { shortRest as doShortRest, longRest as doLongRest, hitDieForClass } from "../engine/rest.ts";
import { roll, abilityModifier } from "../engine/dice.ts";
import { rollLootTable, type LootTableEntry } from "../engine/loot.ts";
import { summarizeSession, filterEventsForCharacter, type SessionEvent } from "./journal.ts";
import type { Race, CharacterClass, AbilityScores, Condition, SessionPhase, DeathSaves } from "../types.ts";
import { parse as parseYAML } from "yaml";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { db } from "../db/connection.ts";
import { sessionEvents as sessionEventsTable, parties as partiesTable, gameSessions as gameSessionsTable, characters as charactersTable } from "../db/schema.ts";
import { getDbUserId, findUserIdByDbId } from "../api/auth.ts";
import { eq, asc } from "drizzle-orm";
import { broadcastToParty, sendToUser } from "../api/ws.ts";

// --- In-memory state ---

interface GameCharacter extends CharacterSheet {
  id: string;
  userId: string;
  partyId: string | null;
  conditions: Condition[];
  deathSaves: DeathSaves;
  dbCharId: string | null; // UUID from characters table
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
  dbPartyId: string | null;     // UUID from parties table
  dbSessionId: string | null;   // UUID from game_sessions table
  dbReady: Promise<void> | null; // resolves when DB session row exists
}

const characters = new Map<string, GameCharacter>();
const charactersByUser = new Map<string, string>(); // userId → characterId
const parties = new Map<string, GameParty>();
const playerQueue: QueueEntry[] = [];
const dmQueue: QueueEntry[] = [];

// Spell definitions loaded from YAML (simplified for in-memory)
const spellDefs = new Map<string, SpellDefinition>();

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
  attacks: { name: string; to_hit: number; damage: string; type: string }[];
  specialAbilities: string[];
  xpValue: number;
  lootTable?: LootTableEntry[];
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

// --- Character Management ---

export function handleCreateCharacter(userId: string, params: {
  name: string;
  race: Race;
  class: CharacterClass;
  ability_scores: AbilityScores;
  backstory?: string;
  personality?: string;
  playstyle?: string;
}): { success: boolean; character?: GameCharacter; error?: string } {
  // Check if user already has a character
  if (charactersByUser.has(userId)) {
    return { success: false, error: "You already have a character. One character per account." };
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
    }).returning({ id: charactersTable.id })
      .then(([row]) => { character.dbCharId = row.id; })
      .catch((err) => console.error("[DB] Failed to persist character:", err));
  }

  return { success: true, character };
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
 * Resolve a player_id parameter — accepts char-X (character ID) or user-X (user ID).
 */
function resolveCharacter(playerId: string): GameCharacter | null {
  return characters.get(playerId) ?? characters.get(charactersByUser.get(playerId) ?? "") ?? null;
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
      monsters: aliveMonsters.map((m) => ({ id: m.id, name: m.name, hp: m.isAlive ? "alive" : "dead" })),
      partyMembers: party.members
        .map((mid) => characters.get(mid))
        .filter(Boolean)
        .map((c) => ({ name: c!.name, class: c!.class, condition: c!.conditions.length > 0 ? c!.conditions.join(", ") : "healthy" })),
    },
  };
}

export function handleGetStatus(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };

  return {
    success: true,
    data: {
      name: char.name,
      race: char.race,
      class: char.class,
      level: char.level,
      xp: char.xp,
      hp: { current: char.hpCurrent, max: char.hpMax },
      ac: char.ac,
      abilityScores: char.abilityScores,
      spellSlots: char.spellSlots,
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
    },
  };
}

export function handleGetAvailableActions(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };

  const party = char.partyId ? parties.get(char.partyId) : null;
  const phase = party?.session?.phase ?? "exploration";

  const isCurrentTurn =
    party?.session
      ? getCurrentCombatant(party.session)?.entityId === char.id
      : false;

  const actions = getAllowedActions(phase, isCurrentTurn);

  const turnResourceState = party?.session && phase === "combat"
    ? getTurnResources(party, char.id)
    : undefined;

  return {
    success: true,
    data: {
      phase, isYourTurn: isCurrentTurn, availableActions: actions,
      ...(turnResourceState ? { turnResources: turnResourceState } : {}),
    },
  };
}

export function handleAttack(userId: string, params: { target_id: string; weapon?: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };

  const party = getPartyForCharacter(char.id);
  if (!party?.session || party.session.phase !== "combat") {
    return { success: false, error: "You can only attack during combat." };
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

    logEvent(party, "attack", char.id, {
      attackerName: char.name, targetName: target.name,
      hit: true, damage: result.totalDamage, damageType: result.damageType,
      critical: result.critical,
    });

    if (killed) {
      rollMonsterLoot(party, monster);

      // Remove from initiative
      if (party.session) {
        party.session = removeCombatant(party.session, target.id);
      }

      // Check if combat should end
      if (party.session && shouldCombatEnd(party.session)) {
        const xp = calculateEncounterXP(party.monsters);
        const xpEach = Math.floor(xp / party.members.length);
        for (const mid of party.members) {
          const m = characters.get(mid);
          if (m) m.xp += xpEach;
        }
        party.session = exitCombat(party.session);
        logEvent(party, "combat_end", null, { xpAwarded: xp });
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

export function handleMonsterAttack(userId: string, params: { monster_id: string; target_id: string; attack_name?: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
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

  // Find target character
  const target = [...characters.values()].find((c) => c.id === params.target_id && party.members.includes(c.id));
  if (!target) return { success: false, error: `Target ${params.target_id} not found in party.` };

  // Pick attack (first matching or first available)
  const attack = params.attack_name
    ? monster.attacks.find((a) => a.name.toLowerCase() === params.attack_name!.toLowerCase())
    : monster.attacks[0];
  if (!attack) return { success: false, error: "No valid attack found for this monster." };

  // Resolve using the rules engine
  const result = resolveAttack({
    attackerAbilityMod: attack.to_hit - proficiencyBonus(1), // to_hit already includes proficiency in stat blocks
    proficiencyBonus: 0, // already baked into to_hit
    targetAC: target.ac,
    damageDice: attack.damage.replace(/[+-]\d+$/, ""), // strip modifier from notation like "1d6+1"
    damageType: attack.type,
    damageAbilityMod: parseInt(attack.damage.match(/[+-]\d+$/)?.[0] ?? "0", 10),
    bonusToHit: attack.to_hit, // use the full to_hit from the stat block
  });

  if (result.hit) {
    const { hp, droppedToZero } = applyDamage(
      { current: target.hpCurrent, max: target.hpMax, temp: 0 },
      result.totalDamage
    );
    target.hpCurrent = hp.current;

    if (droppedToZero) {
      target.conditions = handleDropToZero(target.conditions);
      target.deathSaves = resetDeathSaves();

      // Broadcast character down to entire party
      broadcastToParty(party.id, {
        type: "character_down",
        characterId: target.id,
        characterName: target.name,
        attackerName: monster.name,
        message: `${target.name} has fallen unconscious!`,
      });

      // Notify DM explicitly
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
      critical: result.critical, droppedToZero,
    });

    // Advance to next turn
    party.session = nextTurn(party.session);
    notifyTurnChange(party);

    return {
      success: true,
      data: {
        hit: true, critical: result.critical, damage: result.totalDamage,
        damageType: result.damageType, targetHP: target.hpCurrent,
        droppedToZero, naturalRoll: result.naturalRoll,
        attackName: attack.name, monsterName: monster.name, targetName: target.name,
        nextTurn: getCurrentCombatant(party.session)?.entityId ?? null,
      },
    };
  }

  logEvent(party, "monster_attack", monster.id, {
    monsterName: monster.name, targetName: target.name, attackName: attack.name,
    hit: false, fumble: result.fumble,
  });

  // Advance to next turn even on miss
  party.session = nextTurn(party.session);
  notifyTurnChange(party);

  return {
    success: true,
    data: {
      hit: false, fumble: result.fumble, naturalRoll: result.naturalRoll,
      attackName: attack.name, monsterName: monster.name, targetName: target.name,
      nextTurn: getCurrentCombatant(party.session)?.entityId ?? null,
    },
  };
}

export function handleCast(userId: string, params: { spell_name: string; target_id?: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };

  const spell = spellDefs.get(params.spell_name);
  if (!spell) return { success: false, error: `Unknown spell: ${params.spell_name}` };

  // Validate casting time — bonus_action/reaction spells must use those tools
  if (spell.castingTime === "bonus_action") {
    return { success: false, error: `${spell.name} is a bonus action spell. Use the bonus_action tool instead.` };
  }
  if (spell.castingTime === "reaction") {
    return { success: false, error: `${spell.name} is a reaction spell. Use the reaction tool instead.` };
  }

  // Check action resource in combat
  const party = getPartyForCharacter(char.id);
  if (party?.session?.phase === "combat") {
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

  // Apply effect to target if applicable
  if (spell.isHealing && params.target_id && result.totalEffect) {
    // Find target character
    const target = characters.get(params.target_id);
    if (target) {
      const hp = applyHealing(
        { current: target.hpCurrent, max: target.hpMax, temp: 0 },
        result.totalEffect
      );
      target.hpCurrent = hp.current;

      logEvent(party, "heal", char.id, {
        healerName: char.name, targetName: target.name, amount: result.totalEffect,
      });
    }
  } else if (!spell.isHealing && params.target_id && result.totalEffect) {
    // Damage a monster
    if (party) {
      const target = party.monsters.find((m) => m.id === params.target_id && m.isAlive);
      if (target) {
        const { monster } = damageMonster(target, result.totalEffect);
        const idx = party.monsters.findIndex((m) => m.id === target.id);
        if (idx !== -1) party.monsters[idx] = monster;
      }
    }
  }

  logEvent(party, "spell_cast", char.id, {
    casterName: char.name, spellName: params.spell_name,
    targetName: params.target_id, effect: result.totalEffect,
  });

  return {
    success: true,
    data: {
      spell: params.spell_name,
      effect: result.totalEffect,
      remainingSlots: result.remainingSlots,
    },
  };
}

export function handleDodge(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };
  const party = getPartyForCharacter(char.id);
  if (party?.session?.phase === "combat") {
    const resources = getTurnResources(party, char.id);
    if (resources.actionUsed) return { success: false, error: "You've already used your action this turn." };
    setTurnResources(party, char.id, { ...resources, actionUsed: true });
  }
  return { success: true, data: { action: "dodge", message: `${char.name} takes the Dodge action.` } };
}

export function handleDash(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };
  const party = getPartyForCharacter(char.id);
  if (party?.session?.phase === "combat") {
    const resources = getTurnResources(party, char.id);
    if (resources.actionUsed) return { success: false, error: "You've already used your action this turn." };
    setTurnResources(party, char.id, { ...resources, actionUsed: true });
  }
  return { success: true, data: { action: "dash", message: `${char.name} dashes.` } };
}

export function handleDisengage(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };
  const party = getPartyForCharacter(char.id);
  if (party?.session?.phase === "combat") {
    const resources = getTurnResources(party, char.id);
    if (resources.actionUsed) return { success: false, error: "You've already used your action this turn." };
    setTurnResources(party, char.id, { ...resources, actionUsed: true });
  }
  return { success: true, data: { action: "disengage", message: `${char.name} disengages.` } };
}

export function handleHelp(userId: string, params: { target_id: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };
  const party = getPartyForCharacter(char.id);
  if (party?.session?.phase === "combat") {
    const resources = getTurnResources(party, char.id);
    if (resources.actionUsed) return { success: false, error: "You've already used your action this turn." };
    setTurnResources(party, char.id, { ...resources, actionUsed: true });
  }
  return { success: true, data: { action: "help", target: params.target_id, message: `${char.name} helps an ally.` } };
}

export function handleHide(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };
  const party = getPartyForCharacter(char.id);
  if (party?.session?.phase === "combat") {
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
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };

  const party = getPartyForCharacter(char.id);
  if (!party?.dungeonState) {
    return { success: false, error: "Not in a dungeon." };
  }

  // Try to move to a room by ID or name
  const exits = getAvailableExits(party.dungeonState);
  const target = exits.find(
    (e) => e.roomId === params.direction_or_target || e.roomName.toLowerCase().includes(params.direction_or_target.toLowerCase())
  );

  if (!target) {
    return { success: false, error: `Cannot move to "${params.direction_or_target}". Available exits: ${exits.map((e) => e.roomName).join(", ")}` };
  }

  const newState = moveToRoom(party.dungeonState, target.roomId);
  if (!newState) {
    return { success: false, error: `Cannot move to ${target.roomName} (${target.connectionType}).` };
  }

  party.dungeonState = newState;
  const room = getCurrentRoom(newState);

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
  logEvent(party, "chat", char.id, { speakerName: char.name, message: params.message });

  return { success: true, data: { speaker: char.name, message: params.message } };
}

export function handleWhisper(userId: string, params: { player_id: string; message: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };
  return { success: true, data: { from: char.name, to: params.player_id, message: params.message } };
}

export function handleShortRest(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };

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
  char.conditions = [];

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

export function handleUseItem(userId: string, params: { item_id: string; target_id?: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };

  const party = getPartyForCharacter(char.id);
  if (party?.session?.phase === "combat") {
    const resources = getTurnResources(party, char.id);
    if (resources.actionUsed) return { success: false, error: "You've already used your action this turn." };
    setTurnResources(party, char.id, { ...resources, actionUsed: true });
  }

  const itemIdx = char.inventory.indexOf(params.item_id);
  if (itemIdx === -1) {
    return { success: false, error: `Item "${params.item_id}" not found in inventory.` };
  }

  const itemDef = itemDefs.get(params.item_id);

  // Data-driven potion handling
  if (itemDef?.category === "potion" && itemDef.healAmount) {
    const healRoll = roll(itemDef.healAmount);
    const target = params.target_id ? characters.get(params.target_id) : char;
    if (target) {
      const hp = applyHealing({ current: target.hpCurrent, max: target.hpMax, temp: 0 }, healRoll.total);
      target.hpCurrent = hp.current;
    }
    char.inventory.splice(itemIdx, 1);
    return { success: true, data: { item: params.item_id, healed: healRoll.total, targetHP: (params.target_id ? characters.get(params.target_id) : char)?.hpCurrent } };
  }

  // Data-driven scroll handling
  if (itemDef?.category === "scroll" && itemDef.spellName) {
    const spell = spellDefs.get(itemDef.spellName);
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

    // Apply spell effect to target
    if (spell.isHealing && params.target_id && result.totalEffect) {
      const target = characters.get(params.target_id);
      if (target) {
        const hp = applyHealing({ current: target.hpCurrent, max: target.hpMax, temp: 0 }, result.totalEffect);
        target.hpCurrent = hp.current;
      }
    } else if (!spell.isHealing && params.target_id && result.totalEffect && party) {
      const target = party.monsters.find((m) => m.id === params.target_id && m.isAlive);
      if (target) {
        const { monster } = damageMonster(target, result.totalEffect);
        const idx = party.monsters.findIndex((m) => m.id === target.id);
        if (idx !== -1) party.monsters[idx] = monster;
      }
    }

    char.inventory.splice(itemIdx, 1);
    logEvent(party, "scroll_used", char.id, { scrollName: params.item_id, spellName: itemDef.spellName, effect: result.totalEffect });
    return { success: true, data: { item: params.item_id, spell: itemDef.spellName, effect: result.totalEffect } };
  }

  return { success: true, data: { item: params.item_id, message: "Item used." } };
}

// --- End Turn / Bonus Action / Reaction ---

export function handleEndTurn(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };

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
      const spell = spellDefs.get(params.spell_name);
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
      if (spell.isHealing && params.target_id && result.totalEffect) {
        const target = characters.get(params.target_id);
        if (target) {
          const hp = applyHealing({ current: target.hpCurrent, max: target.hpMax, temp: 0 }, result.totalEffect);
          target.hpCurrent = hp.current;
          logEvent(party, "heal", char.id, {
            healerName: char.name, targetName: target.name, amount: result.totalEffect, bonusAction: true,
          });
        }
      } else if (!spell.isHealing && params.target_id && result.totalEffect) {
        const target = party.monsters.find((m) => m.id === params.target_id && m.isAlive);
        if (target) {
          const { monster } = damageMonster(target, result.totalEffect);
          const idx = party.monsters.findIndex((m) => m.id === target.id);
          if (idx !== -1) party.monsters[idx] = monster;
        }
      }

      logEvent(party, "bonus_action", char.id, {
        action: "cast", spellName: params.spell_name, effect: result.totalEffect,
      });

      return {
        success: true,
        data: { action: "cast", spell: params.spell_name, effect: result.totalEffect, remainingSlots: result.remainingSlots },
      };
    }

    case "dash":
    case "disengage":
    case "hide": {
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

    case "second_wind": {
      if (!char.features.includes("Second Wind")) {
        return { success: false, error: "Only Fighters with Second Wind can use this ability." };
      }
      const healRoll = roll(`1d10+${char.level}`);
      const hp = applyHealing({ current: char.hpCurrent, max: char.hpMax, temp: 0 }, healRoll.total);
      char.hpCurrent = hp.current;
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
      const spell = spellDefs.get(params.spell_name);
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

      logEvent(party, "reaction", char.id, {
        action: "cast", spellName: params.spell_name, effect: result.totalEffect,
      });

      return {
        success: true,
        data: { action: "cast", spell: params.spell_name, effect: result.totalEffect, remainingSlots: result.remainingSlots },
      };
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

        logEvent(party, "reaction", char.id, {
          action: "opportunity_attack", targetName: target.name,
          hit: true, damage: result.totalDamage, killed,
        });

        if (killed) {
          rollMonsterLoot(party, monster);

          if (party.session) {
            party.session = removeCombatant(party.session, target.id);
            if (shouldCombatEnd(party.session)) {
              const xp = calculateEncounterXP(party.monsters);
              const xpEach = Math.floor(xp / party.members.length);
              for (const mid of party.members) {
                const m = characters.get(mid);
                if (m) m.xp += xpEach;
              }
              party.session = exitCombat(party.session);
              logEvent(party, "combat_end", null, { xpAwarded: xp });
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

  return { success: true, data: { queued: true, matched: false, position: playerQueue.length } };
}

// --- DM Tool Handlers ---

export function handleDMQueueForParty(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
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

  return { success: true, data: { queued: true, matched: false, playersWaiting: playerQueue.length } };
}

export function handleNarrate(userId: string, params: { text: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "You are not a DM for any active party." };

  logEvent(party, "narration", null, { text: params.text });
  return { success: true, data: { narrated: true, text: params.text } };
}

export function handleNarrateTo(userId: string, params: { player_id: string; text: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };
  return { success: true, data: { narrated: true, to: params.player_id, text: params.text } };
}

export function handleSpawnEncounter(userId: string, params: { monsters: { template_name: string; count: number }[] }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };
  if (!party.session) return { success: false, error: "No active session." };

  // Look up monster templates (case-insensitive, fall back to "name" field from agents)
  const toSpawn = params.monsters.map((m) => {
    const rawName = m.template_name ?? (m as Record<string, unknown>).name as string ?? "unknown";
    // Try exact match first, then case-insensitive
    let template = monsterTemplates.get(rawName);
    let resolvedName = rawName;
    if (!template) {
      for (const [key, val] of monsterTemplates) {
        if (key.toLowerCase() === rawName.toLowerCase()) {
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
        count: m.count,
        template: {
          hpMax: 10, ac: 12,
          abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
          attacks: [{ name: "Attack", to_hit: 3, damage: "1d6+1", type: "slashing" }],
          specialAbilities: [],
          xpValue: 50,
        },
      };
    }
    return { templateName: resolvedName, count: m.count, template };
  });

  const monsters = spawnMonsters(toSpawn);
  party.monsters = monsters;

  // Roll initiative
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

  party.session = enterCombat(party.session, slots);

  logEvent(party, "combat_start", null, {
    monsters: monsters.map((m) => ({ name: m.name, hp: m.hpMax, ac: m.ac })),
    initiative: initiative.map((e) => ({ name: e.name, initiative: e.initiative })),
  });
  notifyTurnChange(party);

  return {
    success: true,
    data: {
      monsters: monsters.map((m) => ({ id: m.id, name: m.name, hp: m.hpMax, ac: m.ac })),
      initiative: initiative.map((e) => ({ name: e.name, initiative: e.initiative, type: e.type })),
      phase: "combat",
    },
  };
}

export function handleVoiceNpc(userId: string, params: { npc_id: string; dialogue: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  logEvent(party, "npc_dialogue", null, { npcName: params.npc_id, dialogue: params.dialogue });
  return { success: true, data: { npc: params.npc_id, dialogue: params.dialogue } };
}

export function handleRequestCheck(userId: string, params: { player_id: string; ability: string; dc: number; skill?: string; advantage?: boolean; disadvantage?: boolean }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = resolveCharacter(params.player_id);
  if (!char) return { success: false, error: `Player ${params.player_id} not found. Use character IDs from get_party_state (e.g. char-1).` };

  const ability = params.ability as "str" | "dex" | "con" | "int" | "wis" | "cha";
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

  const party = getPartyForCharacter(char.id);
  logEvent(party, "ability_check", char.id, {
    playerName: char.name, ability: params.ability, skill: params.skill,
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
  const char = resolveCharacter(params.player_id);
  if (!char) return { success: false, error: `Player ${params.player_id} not found. Use character IDs from get_party_state (e.g. char-1).` };

  const ability = params.ability as "str" | "dex" | "con" | "int" | "wis" | "cha";
  const result = savingThrow({
    abilityScores: char.abilityScores,
    ability,
    dc: params.dc,
    advantage: params.advantage,
    disadvantage: params.disadvantage,
  });

  const party = getPartyForCharacter(char.id);
  logEvent(party, "saving_throw", char.id, {
    playerName: char.name, ability: params.ability,
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
  const ability = params.ability as "str" | "dex" | "con" | "int" | "wis" | "cha";

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
  const char1 = resolveCharacter(params.player_id_1);
  if (!char1) return { success: false, error: `Player ${params.player_id_1} not found. Use character IDs from get_party_state (e.g. char-1).` };
  const char2 = resolveCharacter(params.player_id_2);
  if (!char2) return { success: false, error: `Player ${params.player_id_2} not found. Use character IDs from get_party_state (e.g. char-1).` };

  const ability1 = params.ability_1 as "str" | "dex" | "con" | "int" | "wis" | "cha";
  const ability2 = params.ability_2 as "str" | "dex" | "con" | "int" | "wis" | "cha";

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

  const party = getPartyForCharacter(char1.id);
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

export function handleDealEnvironmentDamage(userId: string, params: { player_id: string; notation: string; type: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = resolveCharacter(params.player_id);
  if (!char) return { success: false, error: `Player ${params.player_id} not found. Use character IDs from get_party_state (e.g. char-1).` };

  const dmgRoll = roll(params.notation);
  const { hp, droppedToZero } = applyDamage(
    { current: char.hpCurrent, max: char.hpMax, temp: 0 },
    dmgRoll.total
  );
  char.hpCurrent = hp.current;

  if (droppedToZero) {
    char.conditions = handleDropToZero(char.conditions);
    char.deathSaves = resetDeathSaves();

    const party = getPartyForCharacter(char.id);
    if (party) {
      broadcastToParty(party.id, {
        type: "character_down",
        characterId: char.id,
        characterName: char.name,
        cause: `environment (${params.type})`,
        message: `${char.name} has fallen unconscious from ${params.type} damage!`,
      });

      if (party.dmUserId) {
        sendToUser(party.dmUserId, {
          type: "character_down",
          characterId: char.id,
          characterName: char.name,
          cause: `environment (${params.type})`,
          hpMax: char.hpMax,
          message: `${char.name} has dropped to 0 HP from ${params.type} damage!`,
        });
      }
    }
  }

  return {
    success: true,
    data: {
      player: char.name, damage: dmgRoll.total, type: params.type,
      hpRemaining: char.hpCurrent, droppedToZero,
    },
  };
}

export function handleAdvanceScene(userId: string, params: { next_room_id?: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  // Exit combat if currently in combat
  if (party.session && party.session.phase === "combat") {
    party.session = exitCombat(party.session);
    party.monsters = []; // clear encounter
    logEvent(party, "combat_end", null, { reason: "scene_advanced" });
    snapshotCharacters(party);
  }

  if (params.next_room_id && party.dungeonState) {
    const newState = moveToRoom(party.dungeonState, params.next_room_id);
    if (newState) {
      party.dungeonState = newState;
      const room = getCurrentRoom(newState);
      logEvent(party, "room_enter", null, { roomName: room?.name });
      return { success: true, data: { advanced: true, room: room?.name, description: room?.description, phase: party.session?.phase } };
    }
    return { success: false, error: `Cannot move to room ${params.next_room_id} — not connected or not found.` };
  }

  // No room specified — just advance the scene (exit combat, return available exits)
  const exits = party.dungeonState ? getAvailableExits(party.dungeonState).map((e) => ({ name: e.roomName, type: e.connectionType, id: e.roomId })) : [];
  return { success: true, data: { advanced: true, phase: party.session?.phase, exits } };
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

  return { success: true, data: { members, phase: party.session?.phase } };
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

  return {
    success: true,
    data: {
      room: room ? { name: room.name, description: room.description, type: room.type, features: room.features } : null,
      exits: exits.map((e) => ({ name: e.roomName, type: e.connectionType, id: e.roomId })),
      monsters: aliveMonsters.map((m) => ({ id: m.id, name: m.name, hp: m.hpCurrent, hpMax: m.hpMax, ac: m.ac })),
    },
  };
}

export function handleAwardXp(userId: string, params: { amount: number }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  const xpEach = Math.floor(params.amount / party.members.length);
  for (const mid of party.members) {
    const c = characters.get(mid);
    if (c) c.xp += xpEach;
  }

  return { success: true, data: { totalXP: params.amount, xpEach, members: party.members.length } };
}

export function handleAwardLoot(userId: string, params: { player_id: string; item_id: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = resolveCharacter(params.player_id);
  if (!char) return { success: false, error: `Player ${params.player_id} not found. Use character IDs from get_party_state (e.g. char-1).` };

  // Validate item exists
  if (!itemDefs.has(params.item_id)) {
    const categories = ["weapon", "armor", "potion", "scroll", "magic_item", "misc"];
    const suggestions = categories.map((cat) => {
      const items = getItemsByCategory(cat);
      return items.length > 0 ? `${cat}: ${items.map((i) => i.name).join(", ")}` : null;
    }).filter(Boolean).join("; ");
    return { success: false, error: `Unknown item: "${params.item_id}". Available items — ${suggestions}` };
  }

  char.inventory.push(params.item_id);
  logEvent(findDMParty(userId), "loot", null, { characterId: params.player_id, characterName: char.name, itemName: params.item_id });

  return { success: true, data: { player: char.name, item: params.item_id } };
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

export function handleEndSession(userId: string, params: { summary: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  if (party.session) {
    party.session = endSessionState(party.session);
  }

  logEvent(party, "session_end", null, { summary: params.summary });
  snapshotCharacters(party);

  // Mark session as ended in DB
  if (party.dbReady) {
    party.dbReady.then(() => {
      if (!party.dbSessionId) return;
      db.update(gameSessionsTable)
        .set({ isActive: false, endedAt: new Date(), summary: params.summary })
        .where(eq(gameSessionsTable.id, party.dbSessionId))
        .catch((err) => console.error("[DB] Failed to end session:", err));
    });
  }

  const eventSummary = summarizeSession(party.events);

  return {
    success: true,
    data: { ended: true, summary: params.summary, eventLog: eventSummary },
  };
}

// --- Internal helpers ---

function rollMonsterLoot(party: GameParty, monster: MonsterInstance): void {
  if (!monster.lootTable || monster.lootTable.length === 0) return;

  const lootResult = rollLootTable(monster.lootTable);
  if (lootResult.items.length === 0) return;

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

  // Create a simple dungeon for testing
  const testRooms = [
    { id: "room-1", name: "Entrance Hall", description: "A dark stone entrance with torches flickering on the walls.", type: "entry" as const, features: ["Torches", "Stone archway"] },
    { id: "room-2", name: "Guard Room", description: "A room with overturned furniture. Signs of a struggle.", type: "chamber" as const, features: ["Overturned table", "Weapon rack"] },
    { id: "room-3", name: "Boss Chamber", description: "A large chamber with a throne at the far end.", type: "boss" as const, features: ["Throne", "Treasure chest"] },
  ];
  const testConnections = [
    { fromRoomId: "room-1", toRoomId: "room-2", type: "passage" as const },
    { fromRoomId: "room-2", toRoomId: "room-3", type: "door" as const },
  ];

  party.dungeonState = createDungeonState(testRooms, testConnections, "room-1");
  party.session = {
    id: nextId("session"),
    ...createSession({ partyId }),
  };

  // Persist party + session to DB (fire-and-forget)
  party.dbReady = (async () => {
    try {
      const dmDbUserId = match.dm.userId ? getDbUserId(match.dm.userId) : null;
      const [partyRow] = await db.insert(partiesTable).values({ name: partyName, dmUserId: dmDbUserId }).returning({ id: partiesTable.id });
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
    });
  }
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
        backstory: char.backstory,
        personality: char.personality,
        playstyle: char.playstyle,
        isAlive: char.hpCurrent > 0,
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
    // Find active sessions
    const activeSessions = await db.select().from(gameSessionsTable).where(eq(gameSessionsTable.isActive, true));
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
          id: charId,
          userId,
          partyId,
          conditions: (row.conditions as string[]) ?? [],
          deathSaves: (row.deathSaves as DeathSaves) ?? { successes: 0, failures: 0 },
          dbCharId: row.id,
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

      // Recreate test dungeon (can't restore original dungeon state)
      const testRooms = [
        { id: "room-1", name: "Entrance Hall", description: "A dark stone entrance with torches flickering on the walls.", type: "entry" as const, features: ["Torches", "Stone archway"] },
        { id: "room-2", name: "Guard Room", description: "A room with overturned furniture. Signs of a struggle.", type: "chamber" as const, features: ["Overturned table", "Weapon rack"] },
        { id: "room-3", name: "Boss Chamber", description: "A large chamber with a throne at the far end.", type: "boss" as const, features: ["Throne", "Treasure chest"] },
      ];
      const testConnections = [
        { fromRoomId: "room-1", toRoomId: "room-2", type: "passage" as const },
        { fromRoomId: "room-2", toRoomId: "room-3", type: "door" as const },
      ];

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
        dungeonState: createDungeonState(testRooms, testConnections, "room-1"),
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

// --- State access for testing ---

export function getState() {
  return { characters, parties, playerQueue, dmQueue };
}
