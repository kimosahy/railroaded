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
  type SessionState,
  type InitiativeSlot,
} from "./session.ts";
import { getAllowedActions, getAllowedDMActions } from "./turns.ts";
import { tryMatchParty, type QueueEntry, type MatchResult } from "./matchmaker.ts";
import { resolveAttack, meleeAttackParams, rangedAttackParams } from "../engine/combat.ts";
import { abilityCheck, savingThrow, groupCheck, proficiencyBonus } from "../engine/checks.ts";
import { applyDamage, applyHealing, handleDropToZero, addCondition, removeCondition, hasCondition } from "../engine/hp.ts";
import { castSpell, spellSaveDC, spellAttackBonus, type SpellDefinition } from "../engine/spells.ts";
import { deathSave, applyDeathSaveConditions, resetDeathSaves, damageAtZeroHP } from "../engine/death.ts";
import { shortRest as doShortRest, longRest as doLongRest, hitDieForClass } from "../engine/rest.ts";
import { roll, abilityModifier } from "../engine/dice.ts";
import { rollLootTable } from "../engine/loot.ts";
import { summarizeSession, filterEventsForCharacter, type SessionEvent } from "./journal.ts";
import type { Race, CharacterClass, AbilityScores, Condition, SessionPhase } from "../types.ts";
import { parse as parseYAML } from "yaml";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { db } from "../db/connection.ts";
import { sessionEvents as sessionEventsTable, parties as partiesTable, gameSessions as gameSessionsTable, characters as charactersTable } from "../db/schema.ts";
import { getDbUserId, findUserIdByDbId } from "../api/auth.ts";
import { eq, asc } from "drizzle-orm";

// --- In-memory state ---

interface GameCharacter extends CharacterSheet {
  id: string;
  userId: string;
  partyId: string | null;
  conditions: Condition[];
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

// Monster templates
const monsterTemplates = new Map<string, {
  hpMax: number;
  ac: number;
  abilityScores: AbilityScores;
  attacks: { name: string; to_hit: number; damage: string; type: string }[];
  specialAbilities: string[];
  xpValue: number;
}>();

let idCounter = 1;
function nextId(prefix: string): string {
  return `${prefix}-${idCounter++}`;
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

  return {
    success: true,
    data: {
      equipment: char.equipment,
      inventory: char.inventory,
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

  return {
    success: true,
    data: { phase, isYourTurn: isCurrentTurn, availableActions: actions },
  };
}

export function handleAttack(userId: string, params: { target_id: string; weapon?: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };

  const party = getPartyForCharacter(char.id);
  if (!party?.session || party.session.phase !== "combat") {
    return { success: false, error: "You can only attack during combat." };
  }

  // Find target monster
  const target = party.monsters.find((m) => m.id === params.target_id && m.isAlive);
  if (!target) return { success: false, error: `Target ${params.target_id} not found or already dead.` };

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

    // Advance to next turn (if still in combat)
    if (party.session && party.session.phase === "combat") {
      party.session = nextTurn(party.session);
    }

    return {
      success: true,
      data: {
        hit: true, critical: result.critical, damage: result.totalDamage,
        damageType: result.damageType, targetHP: monster.hpCurrent,
        killed, naturalRoll: result.naturalRoll,
        nextTurn: party.session?.phase === "combat" ? getCurrentCombatant(party.session)?.entityId ?? null : null,
      },
    };
  }

  logEvent(party, "attack", char.id, {
    attackerName: char.name, targetName: target.name,
    hit: false, fumble: result.fumble,
  });

  // Advance to next turn even on miss
  if (party.session && party.session.phase === "combat") {
    party.session = nextTurn(party.session);
  }

  return {
    success: true,
    data: {
      hit: false, fumble: result.fumble, naturalRoll: result.naturalRoll,
      nextTurn: party.session?.phase === "combat" ? getCurrentCombatant(party.session)?.entityId ?? null : null,
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
    }

    logEvent(party, "monster_attack", monster.id, {
      monsterName: monster.name, targetName: target.name, attackName: attack.name,
      hit: true, damage: result.totalDamage, damageType: result.damageType,
      critical: result.critical, droppedToZero,
    });

    // Advance to next turn
    party.session = nextTurn(party.session);

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

  const result = castSpell({
    spell,
    casterAbilityScores: char.abilityScores,
    casterClass: char.class,
    spellSlots: char.spellSlots,
  });

  if (!result.success) {
    return { success: false, error: result.error };
  }

  // Update spell slots
  char.spellSlots = result.remainingSlots;

  const party = getPartyForCharacter(char.id);

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
  // In a full implementation, this would set a "dodging" flag
  return { success: true, data: { action: "dodge", message: `${char.name} takes the Dodge action.` } };
}

export function handleDash(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };
  return { success: true, data: { action: "dash", message: `${char.name} dashes.` } };
}

export function handleDisengage(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };
  return { success: true, data: { action: "disengage", message: `${char.name} disengages.` } };
}

export function handleHelp(userId: string, params: { target_id: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };
  return { success: true, data: { action: "help", target: params.target_id, message: `${char.name} helps an ally.` } };
}

export function handleHide(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found." };
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

  const itemIdx = char.inventory.indexOf(params.item_id);
  if (itemIdx === -1) {
    return { success: false, error: `Item "${params.item_id}" not found in inventory.` };
  }

  // Handle potions
  if (params.item_id === "Potion of Healing") {
    const healRoll = roll("2d4+2");
    const target = params.target_id ? characters.get(params.target_id) : char;
    if (target) {
      const hp = applyHealing({ current: target.hpCurrent, max: target.hpMax, temp: 0 }, healRoll.total);
      target.hpCurrent = hp.current;
    }
    char.inventory.splice(itemIdx, 1);
    return { success: true, data: { item: params.item_id, healed: healRoll.total, targetHP: (params.target_id ? characters.get(params.target_id) : char)?.hpCurrent } };
  }

  if (params.item_id === "Potion of Greater Healing") {
    const healRoll = roll("4d4+4");
    const target = params.target_id ? characters.get(params.target_id) : char;
    if (target) {
      const hp = applyHealing({ current: target.hpCurrent, max: target.hpMax, temp: 0 }, healRoll.total);
      target.hpCurrent = hp.current;
    }
    char.inventory.splice(itemIdx, 1);
    return { success: true, data: { item: params.item_id, healed: healRoll.total } };
  }

  return { success: true, data: { item: params.item_id, message: "Item used." } };
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

export function handleRequestCheck(userId: string, params: { player_id: string; ability: string; dc: number; skill?: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
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
      natural20: result.natural20,
      natural1: result.natural1,
    },
  };
}

export function handleRequestSave(userId: string, params: { player_id: string; ability: string; dc: number }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const char = resolveCharacter(params.player_id);
  if (!char) return { success: false, error: `Player ${params.player_id} not found. Use character IDs from get_party_state (e.g. char-1).` };

  const ability = params.ability as "str" | "dex" | "con" | "int" | "wis" | "cha";
  const result = savingThrow({
    abilityScores: char.abilityScores,
    ability,
    dc: params.dc,
  });

  return {
    success: true,
    data: {
      player: char.name, ability: params.ability, dc: params.dc,
      roll: result.roll.total, success: result.success,
    },
  };
}

export function handleRequestGroupCheck(userId: string, params: { ability: string; dc: number }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  const charList = party.members.map((mid) => characters.get(mid)).filter(Boolean);
  const ability = params.ability as "str" | "dex" | "con" | "int" | "wis" | "cha";

  const result = groupCheck({
    characters: charList.map((c) => ({
      id: c!.id,
      abilityScores: c!.abilityScores,
    })),
    ability,
    dc: params.dc,
  });

  return {
    success: true,
    data: {
      ability: params.ability, dc: params.dc,
      overallSuccess: result.success,
      results: result.results.map((r) => ({
        id: r.id,
        name: characters.get(r.id)?.name,
        roll: r.check.roll.total,
        success: r.check.success,
      })),
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

  char.inventory.push(params.item_id);
  logEvent(findDMParty(userId), "loot", null, { characterId: params.player_id, characterName: char.name, itemName: params.item_id });

  return { success: true, data: { player: char.name, item: params.item_id } };
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

function getWeaponDamage(weaponName: string | null): { damage: string; properties: string[]; damageType: string } {
  const weapons: Record<string, { damage: string; properties: string[]; damageType: string }> = {
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
  return weapons[weaponName ?? ""] ?? { damage: "1d4", properties: [], damageType: "bludgeoning" };
}

// --- Load spell definitions ---

export function loadSpellDef(name: string, spell: SpellDefinition): void {
  spellDefs.set(name, spell);
}

export function loadMonsterTemplate(name: string, template: {
  hpMax: number; ac: number;
  abilityScores: AbilityScores;
  attacks: { name: string; to_hit: number; damage: string; type: string }[];
  specialAbilities: string[];
  xpValue: number;
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
