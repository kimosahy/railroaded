/**
 * In-memory store for SessionSetup payloads (Mercury §14.4) and emission
 * history for Director's Cut (CC Task 14a-pre).
 * - SessionSetup: served via GET /spectator/sessions/:id/setup
 * - Emission history: served via GET /spectator/sessions/:id/emissions
 */

import type { SessionSetup } from "./types.ts";

const setupsBySessionId = new Map<string, SessionSetup>();
const emissionHistory = new Map<string, Record<string, unknown>[]>();

export function storeSessionSetup(setup: SessionSetup): void {
  if (!setup?.session_id) return;
  setupsBySessionId.set(setup.session_id, setup);
}

export function getSessionSetup(sessionId: string): SessionSetup | null {
  return setupsBySessionId.get(sessionId) ?? null;
}

export function storeEmission(partyId: string, emission: Record<string, unknown>): void {
  if (!partyId) return;
  if (!emissionHistory.has(partyId)) emissionHistory.set(partyId, []);
  emissionHistory.get(partyId)!.push(emission);
}

export function getEmissionHistory(partyId: string): Record<string, unknown>[] {
  return emissionHistory.get(partyId) ?? [];
}

/** Test-only: reset the store between cases. */
export function _resetSetupStore(): void {
  setupsBySessionId.clear();
  emissionHistory.clear();
}
