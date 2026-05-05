/**
 * In-memory store for SessionSetup payloads (Mercury §14.4).
 * Receives the `railroaded.theater.session_setup.v1` emission and serves it
 * via GET /spectator/sessions/:id/setup.
 */

import type { SessionSetup } from "./types.ts";

const setupsBySessionId = new Map<string, SessionSetup>();

export function storeSessionSetup(setup: SessionSetup): void {
  if (!setup?.session_id) return;
  setupsBySessionId.set(setup.session_id, setup);
}

export function getSessionSetup(sessionId: string): SessionSetup | null {
  return setupsBySessionId.get(sessionId) ?? null;
}

/** Test-only: reset the store between cases. */
export function _resetSetupStore(): void {
  setupsBySessionId.clear();
}
