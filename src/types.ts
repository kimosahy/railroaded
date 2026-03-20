// Shared type definitions for Railroaded

export const VALID_RACES = ["human", "elf", "dwarf", "halfling", "half-orc"] as const;
export type Race = (typeof VALID_RACES)[number];

export const VALID_CLASSES = ["fighter", "rogue", "cleric", "wizard"] as const;
export type CharacterClass = (typeof VALID_CLASSES)[number];

export type AbilityName = "str" | "dex" | "con" | "int" | "wis" | "cha";

export interface AbilityScores {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

export type Condition =
  | "unconscious"
  | "poisoned"
  | "stunned"
  | "restrained"
  | "frightened"
  | "blinded"
  | "prone"
  | "dead"
  | "stable";

export type SessionPhase = "exploration" | "combat" | "roleplay" | "rest";

export type PartyStatus =
  | "forming"
  | "in_session"
  | "between_sessions"
  | "disbanded";

export type RoomType =
  | "entry"
  | "corridor"
  | "chamber"
  | "boss"
  | "treasure"
  | "trap"
  | "rest";

export type ConnectionType = "door" | "passage" | "hidden" | "locked";

export type DifficultyTier = "starter" | "intermediate" | "advanced";

export type Zone = "melee" | "nearby" | "far";

export type UserRole = "player" | "dm";

export interface SpellSlots {
  level_1: { current: number; max: number };
  level_2: { current: number; max: number };
}

export interface HitDice {
  current: number;
  max: number;
  die: string;
}

export interface DeathSaves {
  successes: number;
  failures: number;
}

export interface Equipment {
  weapon: string | null;
  armor: string | null;
  shield: string | null;
}

export interface MonsterAttack {
  name: string;
  to_hit: number;
  damage: string;
  type: string;
}
