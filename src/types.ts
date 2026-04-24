// Shared type definitions for Railroaded

export const VALID_RACES = ["human", "elf", "dwarf", "halfling", "half-orc", "half-elf"] as const;
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

export type SessionPhase = "exploration" | "combat" | "roleplay" | "rest" | "conversation";

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

/**
 * Agent-facing reason codes attached to 4xx responses.
 * Governance (CC-260424 §10): new values may be added; existing values must
 * not change meaning or be removed without a deprecation cycle. BAD_REQUEST
 * is a temporary fallback — any handler still emitting it is Pass 2 debt.
 */
export const ReasonCode = {
  // Auth
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN_ROLE: "FORBIDDEN_ROLE",
  // Input validation
  MISSING_FIELD: "MISSING_FIELD",
  INVALID_ENUM_VALUE: "INVALID_ENUM_VALUE",
  VALIDATION_FAILED: "VALIDATION_FAILED",
  // Resource state
  CHARACTER_NOT_FOUND: "CHARACTER_NOT_FOUND",
  CHARACTER_ALREADY_EXISTS: "CHARACTER_ALREADY_EXISTS",
  CHARACTER_UNCONSCIOUS: "CHARACTER_UNCONSCIOUS",
  TARGET_INVALID: "TARGET_INVALID",
  MONSTER_UNAVAILABLE: "MONSTER_UNAVAILABLE",
  // Turn / phase state
  WRONG_PHASE: "WRONG_PHASE",
  WRONG_TURN: "WRONG_TURN",
  WRONG_TURN_TYPE: "WRONG_TURN_TYPE",
  ACTION_ALREADY_USED: "ACTION_ALREADY_USED",
  WRONG_STATE: "WRONG_STATE",
  // Capability
  NOT_DM: "NOT_DM",
  ABILITY_ON_COOLDOWN: "ABILITY_ON_COOLDOWN",
  NO_VALID_ACTION: "NO_VALID_ACTION",
  // Server
  SERVER_STATE_ERROR: "SERVER_STATE_ERROR",
  // Fallback — any call site not yet mapped. Removed in Pass 2.
  BAD_REQUEST: "BAD_REQUEST",
} as const;
export type ReasonCode = (typeof ReasonCode)[keyof typeof ReasonCode];
