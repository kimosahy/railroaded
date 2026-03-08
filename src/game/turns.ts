/**
 * Tick system, turn order, and phase management.
 */

import type { SessionPhase } from "../types.ts";

export interface TurnState {
  phase: SessionPhase;
  roundNumber: number;
  tickNumber: number;
  currentEntityId: string | null;
  lastActionTime: Map<string, number>;
}

/**
 * Create initial turn state.
 */
export function createTurnState(): TurnState {
  return {
    phase: "exploration",
    roundNumber: 1,
    tickNumber: 0,
    currentEntityId: null,
    lastActionTime: new Map(),
  };
}

/**
 * Check if an entity can act (rate limiting).
 * Returns time remaining in ms if they need to wait, 0 if they can act.
 */
export function canEntityAct(
  state: TurnState,
  entityId: string,
  now: number = Date.now()
): number {
  const tickMs = getTickMs(state.phase);
  if (tickMs === 0) return 0; // no rate limit in this phase

  const lastAction = state.lastActionTime.get(entityId);
  if (!lastAction) return 0;

  const elapsed = now - lastAction;
  if (elapsed >= tickMs) return 0;

  return tickMs - elapsed;
}

/**
 * Record that an entity took an action.
 */
export function recordAction(
  state: TurnState,
  entityId: string,
  now: number = Date.now()
): TurnState {
  const newLastActionTime = new Map(state.lastActionTime);
  newLastActionTime.set(entityId, now);

  return {
    ...state,
    tickNumber: state.tickNumber + 1,
    lastActionTime: newLastActionTime,
  };
}

/**
 * Advance to the next round (all combatants have acted).
 */
export function nextRound(state: TurnState): TurnState {
  return {
    ...state,
    roundNumber: state.roundNumber + 1,
  };
}

/**
 * Get tick duration in milliseconds for a phase.
 */
function getTickMs(phase: SessionPhase): number {
  switch (phase) {
    case "combat":
      return 30_000;
    case "exploration":
      return 60_000;
    case "roleplay":
    case "rest":
      return 0;
  }
}

/**
 * Get allowed actions for a phase.
 */
export function getAllowedActions(
  phase: SessionPhase,
  isCurrentTurn: boolean,
  conditions: string[] = []
): string[] {
  // Dead characters can only check status
  if (conditions.includes("dead")) {
    return ["get_status", "get_available_actions"];
  }
  // Unconscious characters can only make death saves (on their turn) or check status
  if (conditions.includes("unconscious")) {
    return isCurrentTurn
      ? ["death_save", "end_turn", "get_status", "get_available_actions"]
      : ["get_status", "get_available_actions"];
  }

  switch (phase) {
    case "exploration":
      return [
        "look", "move", "use_item",
        "party_chat", "whisper", "get_status", "get_party",
        "get_inventory", "get_available_actions", "short_rest", "long_rest",
      ];
    case "combat":
      if (isCurrentTurn) {
        return [
          "attack", "cast", "dodge", "dash", "disengage",
          "help", "hide", "use_item", "move",
          "bonus_action", "end_turn", "death_save",
          "party_chat", "get_status", "get_available_actions",
        ];
      }
      return [
        "reaction",
        "party_chat", "get_status", "get_available_actions",
      ];
    case "roleplay":
      return [
        "party_chat", "whisper", "look", "get_status",
        "get_party", "get_inventory", "get_available_actions",
        "journal_add",
      ];
    case "rest":
      return [
        "short_rest", "long_rest", "party_chat", "whisper",
        "get_status", "get_inventory", "get_available_actions",
      ];
  }
}

/**
 * Get allowed DM actions for a phase.
 */
export function getAllowedDMActions(phase: SessionPhase): string[] {
  const always = [
    "narrate", "narrate_to", "get_party_state", "get_room_state",
    "voice_npc", "advance_scene",
  ];

  switch (phase) {
    case "exploration":
      return [
        ...always,
        "spawn_encounter", "request_check", "request_save",
        "request_group_check", "request_contested_check", "deal_environment_damage",
        "award_xp", "award_loot", "end_session",
      ];
    case "combat":
      return [
        ...always,
        "monster_attack", "request_check", "request_save",
        "request_contested_check", "deal_environment_damage",
        "award_xp", "award_loot",
      ];
    case "roleplay":
      return [
        ...always,
        "request_check", "request_save", "request_group_check",
        "request_contested_check",
        "spawn_encounter", "award_xp", "award_loot", "end_session",
      ];
    case "rest":
      return [
        ...always,
        "award_xp", "end_session",
      ];
  }
}
