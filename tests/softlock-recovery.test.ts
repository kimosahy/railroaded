/**
 * P0-2 softlock recovery — fake-timer tests (CC-260428 §3g).
 *
 * Three deterministic cases:
 *  1. Auto-revive fires after the 60s grace expires.
 *  2. markDmActed during the grace cancels the timer.
 *  3. After a simulated restart (timer map cleared), checkSoftlockRecovery
 *     re-detects the state and the next 60s tick still revives a PC.
 */
import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  checkSoftlockRecovery,
  markDmActed,
  cancelSoftlockRecovery,
  getState,
} from "../src/game/game-manager.ts";
import type { AbilityScores } from "../src/types.ts";

const scores: AbilityScores = { str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 15 };

let tc = 0;
function uid(prefix: string): string { return `${prefix}-softlock-${++tc}-${Date.now()}`; }

async function setupSoftlockedParty() {
  const pids = [uid("p"), uid("p"), uid("p"), uid("p")];
  const dmId = uid("dm");

  for (const id of pids) {
    await handleCreateCharacter(id, {
      name: `C-${id}`, race: "human", class: "fighter",
      ability_scores: scores,
      avatar_url: "https://example.com/avatar.png",
    });
  }
  pids.forEach((id) => handleQueueForParty(id));
  handleDMQueueForParty(dmId);

  const { parties, characters } = getState();
  const partyId = [...parties.keys()].pop()!;
  const party = parties.get(partyId)!;

  // Force the softlock precondition: all PCs unconscious + stable, 0 HP, exploration
  // phase, no living monsters. Bypasses the combat flow — we are unit-testing
  // checkSoftlockRecovery directly.
  for (const mid of party.members) {
    const c = characters.get(mid)!;
    c.hpCurrent = 0;
    c.conditions = ["unconscious", "stable", "prone"];
  }
  if (!party.session) {
    throw new Error("Test setup: party has no session");
  }
  party.session.phase = "exploration";
  party.monsters = [];

  return { partyId, pids, dmId, party };
}

describe("P0-2 softlock recovery (fake timers)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test("Test 1: auto-revive fires after 60s grace expires", async () => {
    const { partyId, party } = await setupSoftlockedParty();
    cancelSoftlockRecovery(partyId); // clear any leftover timer between tests

    checkSoftlockRecovery(party);

    // Before grace expiry, no PC has been revived.
    const stillDown = party.members.every((mid) => {
      const m = getState().characters.get(mid)!;
      return m.hpCurrent === 0 && m.conditions.includes("unconscious");
    });
    expect(stillDown).toBe(true);

    // Advance past the 60s grace.
    jest.advanceTimersByTime(60_000);

    // Exactly one PC should be revived at 1 HP, with unconscious/stable cleared.
    const reviveStates = party.members.map((mid) => {
      const m = getState().characters.get(mid)!;
      return { hp: m.hpCurrent, unconscious: m.conditions.includes("unconscious") };
    });
    const revivedCount = reviveStates.filter((s) => s.hp === 1 && !s.unconscious).length;
    expect(revivedCount).toBe(1);

    // Auto-revive event was logged.
    const reviveEvent = party.events.find((e) => e.type === "softlock_auto_revive");
    expect(reviveEvent).toBeDefined();
  });

  test("Test 2: markDmActed during grace cancels the timer", async () => {
    const { partyId, party } = await setupSoftlockedParty();
    cancelSoftlockRecovery(partyId);

    checkSoftlockRecovery(party);

    // DM acts during the grace window (e.g. narrate / spawn / advance scene).
    markDmActed(partyId);

    // Advance well past the grace expiry.
    jest.advanceTimersByTime(120_000);

    // No PC was revived: every PC is still 0 HP unconscious.
    const allDown = party.members.every((mid) => {
      const m = getState().characters.get(mid)!;
      return m.hpCurrent === 0 && m.conditions.includes("unconscious");
    });
    expect(allDown).toBe(true);

    const reviveEvent = party.events.find((e) => e.type === "softlock_auto_revive");
    expect(reviveEvent).toBeUndefined();
  });

  test("Test 3: after a simulated restart, checkSoftlockRecovery re-detects and a PC revives", async () => {
    const { partyId, party } = await setupSoftlockedParty();
    cancelSoftlockRecovery(partyId);

    // First detection (this would be wiped by a real restart).
    checkSoftlockRecovery(party);
    cancelSoftlockRecovery(partyId); // simulate the in-memory timer being lost on restart

    // Rehydration path (loadPersistedState / loadPersistedCharacters) calls
    // checkSoftlockRecovery again for each session-bearing party.
    checkSoftlockRecovery(party);

    jest.advanceTimersByTime(60_000);

    const revivedCount = party.members.filter((mid) => {
      const m = getState().characters.get(mid)!;
      return m.hpCurrent === 1 && !m.conditions.includes("unconscious");
    }).length;
    expect(revivedCount).toBe(1);

    const reviveEvent = party.events.find((e) => e.type === "softlock_auto_revive");
    expect(reviveEvent).toBeDefined();
  });
});
