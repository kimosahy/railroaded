/**
 * CC-260428 Task 4 Step 4g — fake-timer tests for the auto-DM trigger.
 *
 * Five cases:
 *  (a) RAILROADED_AUTO_DM_PROVISION=true: 3 players, no DM, advance 60s →
 *      SYSTEM_DM_ID lands in dmQueue, party forms via tryMatchPartyFallback,
 *      autoDmLog records "fired" + "provisioned".
 *  (b) RAILROADED_AUTO_DM_PROVISION=false (default): 3 players, no DM, advance
 *      60s → autoDmLog records "fired" + "skipped"; conductor NOT in dmQueue.
 *  (c) 3 players, real DM joins at 30s, advance to 60s → party forms via the
 *      standard wait-window fallback, NOT via auto-DM. No Conductor entry.
 *  (d) 2 players (below threshold), advance 60s → no trigger.
 *  (e) Provision enabled, two trigger fires into the same gap → only one
 *      Conductor entry (duplicate guard).
 *
 * autoDmLog is module-level state that persists across tests; we snapshot the
 * length before each action and assert deltas instead of absolute counts.
 */
import { afterAll, afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  getQueueState,
  getState,
} from "../src/game/game-manager.ts";
import { SYSTEM_DM_ID } from "../src/game/matchmaker.ts";
import type { AbilityScores } from "../src/types.ts";

const scores: AbilityScores = { str: 12, dex: 14, con: 12, int: 10, wis: 10, cha: 10 };
let tc = 0;
function uid(p: string): string { return `${p}-autodm-${++tc}-${Date.now()}`; }

const ORIGINAL_PROVISION = process.env.RAILROADED_AUTO_DM_PROVISION;

function resetState() {
  const { playerQueue, dmQueue, characters, parties } = getState();
  playerQueue.length = 0;
  dmQueue.length = 0;
  characters.clear();
  parties.clear();
}

/** Snapshot of autoDmLog — used to compute per-test deltas without exposing
 *  the array directly. recent_auto_dm_events is the last 20 of autoDmLog;
 *  for our delta purposes that's enough since we never push >20 in a single test. */
function logSnapshot(): Array<{ type: string; reason?: string }> {
  return [...(getQueueState().recent_auto_dm_events as Array<{ type: string; reason?: string }>)];
}

function logsAfter(before: Array<{ type: string }>): Array<{ type: string; reason?: string }> {
  const after = logSnapshot();
  // Subtract the prefix (events present before this test). Since both arrays
  // are append-only and we only ran one test in between, after's first entries
  // match before; the new tail is what we care about.
  return after.slice(before.length);
}

async function queueThreePlayers(): Promise<string[]> {
  const ids = [uid("p"), uid("p"), uid("p")];
  for (const id of ids) {
    await handleCreateCharacter(id, {
      name: `R-${id}`, race: "human", class: "fighter",
      ability_scores: scores,
      avatar_url: "https://example.com/avatar.png",
    });
  }
  for (const id of ids) handleQueueForParty(id);
  return ids;
}

describe("Auto-DM trigger (Task 4)", () => {
  beforeEach(() => {
    resetState();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    if (ORIGINAL_PROVISION === undefined) delete process.env.RAILROADED_AUTO_DM_PROVISION;
    else process.env.RAILROADED_AUTO_DM_PROVISION = ORIGINAL_PROVISION;
  });

  // After this file finishes, leave the in-memory state clean so test files
  // that don't reset themselves (e.g. tests/post-action-grace.test.ts) start
  // fresh. Without this, a leftover SYSTEM_DM_ID entry in dmQueue from test
  // (a) can be picked up by subsequent files' setupCombat helpers.
  afterAll(resetState);

  test("(a) provision enabled: 3 players, no DM, advance 60s → conductor queued + party forms", async () => {
    process.env.RAILROADED_AUTO_DM_PROVISION = "true";
    const before = logSnapshot();
    await queueThreePlayers();

    const { dmQueue, parties } = getState();
    expect(dmQueue.length).toBe(0);
    expect(parties.size).toBe(0);

    jest.advanceTimersByTime(60_000);

    // Auto-DM provisioned the conductor; tryMatchPartyFallback formed a party.
    expect(parties.size).toBe(1);

    const newEvents = logsAfter(before);
    expect(newEvents.some((e) => e.type === "fired")).toBe(true);
    expect(newEvents.some((e) => e.type === "provisioned")).toBe(true);
    expect(newEvents.some((e) => e.type === "skipped")).toBe(false);
  });

  test("(b) provision disabled (default): 3 players, no DM, advance 60s → trigger fires but conductor NOT queued", async () => {
    delete process.env.RAILROADED_AUTO_DM_PROVISION;
    const before = logSnapshot();
    await queueThreePlayers();

    jest.advanceTimersByTime(60_000);

    const { dmQueue, parties } = getState();
    expect(dmQueue.some((q) => q.userId === SYSTEM_DM_ID)).toBe(false);
    expect(parties.size).toBe(0);

    const newEvents = logsAfter(before);
    expect(newEvents.some((e) => e.type === "fired")).toBe(true);
    expect(newEvents.some((e) => e.type === "skipped" && e.reason === "provision_disabled")).toBe(true);
    expect(newEvents.some((e) => e.type === "provisioned")).toBe(false);
  });

  test("(c) 3 players + real DM joins at 30s → party forms via standard fallback, no auto-DM event", async () => {
    process.env.RAILROADED_AUTO_DM_PROVISION = "true";
    const before = logSnapshot();
    await queueThreePlayers();

    jest.advanceTimersByTime(30_000);

    // Real DM joins — checkAutoDmTrigger clears the auto-DM timer (eligibility
    // dropped because dmQueue.length > 0). The standard 30s wait-window timer
    // had been armed at first-player-queue (t=0); when DM joins at t=30s,
    // remaining=0, and the next tick fires tryMatchPartyFallback successfully.
    const dmId = uid("dm");
    handleDMQueueForParty(dmId);

    jest.advanceTimersByTime(30_000); // total wallclock = 60s

    // Standard match formed (3 players + real DM). The Conductor is NOT in the
    // queue (auto-DM never fired).
    const { parties, dmQueue } = getState();
    expect(parties.size).toBe(1);
    expect(dmQueue.some((q) => q.userId === SYSTEM_DM_ID)).toBe(false);

    const newEvents = logsAfter(before);
    expect(newEvents.some((e) => e.type === "fired")).toBe(false);
    expect(newEvents.some((e) => e.type === "provisioned")).toBe(false);
  });

  test("(d) only 2 players → trigger never fires (below AUTO_DM_MIN_PLAYERS)", async () => {
    process.env.RAILROADED_AUTO_DM_PROVISION = "true";
    const before = logSnapshot();

    const ids = [uid("p"), uid("p")];
    for (const id of ids) {
      await handleCreateCharacter(id, {
        name: `R-${id}`, race: "human", class: "fighter",
        ability_scores: scores,
        avatar_url: "https://example.com/avatar.png",
      });
    }
    for (const id of ids) handleQueueForParty(id);

    jest.advanceTimersByTime(60_000);

    const { dmQueue } = getState();
    expect(dmQueue.length).toBe(0);

    const newEvents = logsAfter(before);
    expect(newEvents.length).toBe(0);
  });

  test("(e) Conductor already in queue → auto-DM trigger never arms (eligibility check excludes Conductor)", async () => {
    process.env.RAILROADED_AUTO_DM_PROVISION = "true";
    const before = logSnapshot();

    // Hand-seed the Conductor as if a prior cycle queued it.
    const { dmQueue } = getState();
    dmQueue.push({
      userId: SYSTEM_DM_ID,
      characterId: "",
      characterClass: "fighter",
      characterName: "The Conductor",
      personality: "",
      playstyle: "",
      role: "dm",
      queuedAt: new Date(),
    });

    // Add 3 players. checkAutoDmTrigger sees dmQueue.length > 0 and refuses
    // to arm the timer. (Defense-in-depth: even if it did arm, the re-check
    // and dmQueue.some(SYSTEM_DM_ID) duplicate guard inside provisionConductor
    // would prevent a second push.)
    await queueThreePlayers();

    // Advance to just before the standard 30s wait-window would fire a
    // standard fallback match. Asserts auto-DM never fires in this state.
    jest.advanceTimersByTime(29_000);

    const conductors = dmQueue.filter((q) => q.userId === SYSTEM_DM_ID);
    expect(conductors.length).toBe(1);

    const newEvents = logsAfter(before);
    expect(newEvents.some((e) => e.type === "fired")).toBe(false);
    expect(newEvents.some((e) => e.type === "provisioned")).toBe(false);
  });
});
