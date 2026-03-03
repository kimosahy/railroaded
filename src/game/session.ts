/**
 * Session lifecycle management.
 * Create, start, run, and end game sessions.
 */

import type { SessionPhase, PartyStatus } from "../types.ts";

export interface TurnResources {
  actionUsed: boolean;
  bonusUsed: boolean;
  reactionUsed: boolean;
}

export function freshTurnResources(): TurnResources {
  return { actionUsed: false, bonusUsed: false, reactionUsed: false };
}

export interface SessionState {
  id: string;
  partyId: string;
  phase: SessionPhase;
  currentTurn: number;
  initiativeOrder: InitiativeSlot[];
  turnResources: Record<string, TurnResources>;
  isActive: boolean;
  startedAt: Date;
  endedAt: Date | null;
}

export interface InitiativeSlot {
  entityId: string;
  initiative: number;
  type: "player" | "monster";
}

export interface SessionCreateParams {
  partyId: string;
}

/**
 * Create a new session in exploration phase.
 */
export function createSession(params: SessionCreateParams): Omit<SessionState, "id"> {
  return {
    partyId: params.partyId,
    phase: "exploration",
    currentTurn: 0,
    initiativeOrder: [],
    turnResources: {},
    isActive: true,
    startedAt: new Date(),
    endedAt: null,
  };
}

/**
 * Transition to combat phase.
 * Sets initiative order and resets turn counter.
 */
export function enterCombat(
  session: SessionState,
  initiativeOrder: InitiativeSlot[]
): SessionState {
  const turnResources: Record<string, TurnResources> = {};
  for (const slot of initiativeOrder) {
    turnResources[slot.entityId] = freshTurnResources();
  }
  return {
    ...session,
    phase: "combat",
    currentTurn: 0,
    initiativeOrder,
    turnResources,
  };
}

/**
 * Advance to the next turn in combat.
 * Wraps around when we reach the end of initiative order.
 */
export function nextTurn(session: SessionState): SessionState {
  if (session.phase !== "combat" || session.initiativeOrder.length === 0) {
    return session;
  }

  const nextTurnNum = (session.currentTurn + 1) % session.initiativeOrder.length;
  return {
    ...session,
    currentTurn: nextTurnNum,
  };
}

/**
 * Get the current combatant (whose turn it is).
 */
export function getCurrentCombatant(session: SessionState): InitiativeSlot | null {
  if (session.phase !== "combat" || session.initiativeOrder.length === 0) {
    return null;
  }
  return session.initiativeOrder[session.currentTurn] ?? null;
}

/**
 * Remove a combatant from initiative (e.g., they died or fled).
 * Adjusts currentTurn if needed.
 */
export function removeCombatant(
  session: SessionState,
  entityId: string
): SessionState {
  const idx = session.initiativeOrder.findIndex(
    (s) => s.entityId === entityId
  );
  if (idx === -1) return session;

  const newOrder = session.initiativeOrder.filter(
    (s) => s.entityId !== entityId
  );

  let newTurn = session.currentTurn;
  if (idx < session.currentTurn) {
    newTurn = Math.max(0, newTurn - 1);
  } else if (idx === session.currentTurn && newTurn >= newOrder.length) {
    newTurn = 0;
  }

  return {
    ...session,
    initiativeOrder: newOrder,
    currentTurn: newOrder.length > 0 ? newTurn : 0,
  };
}

/**
 * Exit combat phase, return to exploration.
 */
export function exitCombat(session: SessionState): SessionState {
  return {
    ...session,
    phase: "exploration",
    initiativeOrder: [],
    currentTurn: 0,
    turnResources: {},
  };
}

/**
 * Transition to roleplay phase.
 */
export function enterRoleplay(session: SessionState): SessionState {
  return {
    ...session,
    phase: "roleplay",
  };
}

/**
 * Transition to rest phase.
 */
export function enterRest(session: SessionState): SessionState {
  return {
    ...session,
    phase: "rest",
  };
}

/**
 * End the session.
 */
export function endSession(session: SessionState): SessionState {
  return {
    ...session,
    isActive: false,
    endedAt: new Date(),
  };
}

/**
 * Check if combat should end (no monsters remaining in initiative).
 */
export function shouldCombatEnd(session: SessionState): boolean {
  if (session.phase !== "combat") return false;
  return !session.initiativeOrder.some((s) => s.type === "monster");
}

/**
 * Get tick duration in milliseconds based on current phase.
 */
export function getTickDuration(phase: SessionPhase): number {
  switch (phase) {
    case "combat":
      return 30_000; // 30 seconds
    case "exploration":
      return 60_000; // 60 seconds
    case "roleplay":
      return 0; // no hard limit
    case "rest":
      return 0; // no hard limit
  }
}
