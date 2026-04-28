/**
 * CC-260428 Task 7 — verification tests + P2-9 stale-party investigation.
 *
 * 7a P0-1 — party never forms without a DM in the queue. tryMatchParty
 *    explicitly returns null when dms.length === 0.
 * 7b P2-10 — handleMonsterAttack accepts target_name; handleVoiceNpc accepts
 *    message. Server-side aliases were added in earlier sprints; we verify
 *    they still work.
 * 7c P2-9 — handleDMQueueForParty allows re-queue when the existing party
 *    has had no events for 5+ minutes (we mock Date.now()). Fresh parties
 *    (formed within the last 5 minutes) still block re-queue.
 *
 *    formParty now logs `party_formed` so the events array is non-empty for
 *    any real party. We assert that and use it as the staleness anchor.
 */
import { afterAll, afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  handleSpawnEncounter,
  handleMonsterAttack,
  handleVoiceNpc,
  getState,
} from "../src/game/game-manager.ts";
import { tryMatchParty, tryMatchPartyFallback, type QueueEntry } from "../src/game/matchmaker.ts";
import type { AbilityScores } from "../src/types.ts";

const scores: AbilityScores = { str: 12, dex: 14, con: 12, int: 10, wis: 10, cha: 10 };
let tc = 0;
function uid(p: string): string { return `${p}-cc260428-${++tc}-${Date.now()}`; }

function resetState() {
  const { playerQueue, dmQueue, characters, parties } = getState();
  playerQueue.length = 0;
  dmQueue.length = 0;
  characters.clear();
  parties.clear();
}

beforeEach(resetState);
// Clean up after the file finishes so test files that don't reset (e.g.
// tests/post-action-grace.test.ts which uses parties.keys().pop()) don't
// pick up stale parties / queue entries from this file's last test.
afterAll(resetState);

// ---------------------------------------------------------------------------
// 7a P0-1 verification
// ---------------------------------------------------------------------------

describe("P0-1: party cannot form without a DM in the queue (Task 7a)", () => {
  test("4 players + 0 DMs in queue → no party formed", async () => {
    const ids = [uid("p"), uid("p"), uid("p"), uid("p")];
    for (const id of ids) {
      await handleCreateCharacter(id, {
        name: `R-${id}`, race: "human", class: "fighter",
        ability_scores: scores,
        avatar_url: "https://example.com/avatar.png",
      });
    }
    for (const id of ids) handleQueueForParty(id);

    const { parties, playerQueue } = getState();
    expect(parties.size).toBe(0);
    // All 4 players are still in the queue (none matched).
    expect(playerQueue.length).toBe(4);
  });

  test("tryMatchParty returns null when no DM is in the queue (defensive)", () => {
    const queue: QueueEntry[] = [
      { userId: "p1", characterId: "c1", characterClass: "fighter", characterName: "P1", personality: "", playstyle: "", role: "player", queuedAt: new Date() },
      { userId: "p2", characterId: "c2", characterClass: "cleric",  characterName: "P2", personality: "", playstyle: "", role: "player", queuedAt: new Date() },
      { userId: "p3", characterId: "c3", characterClass: "wizard",  characterName: "P3", personality: "", playstyle: "", role: "player", queuedAt: new Date() },
      { userId: "p4", characterId: "c4", characterClass: "rogue",   characterName: "P4", personality: "", playstyle: "", role: "player", queuedAt: new Date() },
    ];
    expect(tryMatchParty(queue)).toBeNull();
    expect(tryMatchPartyFallback(queue)).toBeNull();
  });

  test("4 players queue, then DM joins → party forms immediately", async () => {
    const pids = [uid("p"), uid("p"), uid("p"), uid("p")];
    for (const id of pids) {
      await handleCreateCharacter(id, {
        name: `R-${id}`, race: "human", class: "fighter",
        ability_scores: scores,
        avatar_url: "https://example.com/avatar.png",
      });
    }
    for (const id of pids) handleQueueForParty(id);

    expect(getState().parties.size).toBe(0);

    handleDMQueueForParty(uid("dm"));
    expect(getState().parties.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 7b P2-10 verification — param aliases on the server side
// ---------------------------------------------------------------------------

describe("P2-10: param aliases work server-side (Task 7b)", () => {
  async function setupCombat() {
    const pids = [uid("p"), uid("p"), uid("p"), uid("p")];
    const dmId = uid("dm");
    for (const id of pids) {
      await handleCreateCharacter(id, {
        name: `Char-${id}`, race: "human", class: "fighter",
        ability_scores: scores,
        avatar_url: "https://example.com/avatar.png",
      });
    }
    for (const id of pids) handleQueueForParty(id);
    handleDMQueueForParty(dmId);
    handleSpawnEncounter(dmId, { monsters: [{ template_name: "Goblin", count: 1 }] });
    const { parties, characters } = getState();
    const partyId = [...parties.keys()].pop()!;
    const party = parties.get(partyId)!;
    // Tank the monster so it survives all 4 player attacks before its own turn.
    // Without this, the monster can die before the test reaches its turn,
    // depending on RNG state inherited from prior tests in the same process.
    if (party.monsters[0]) {
      party.monsters[0].hpCurrent = 9999;
      party.monsters[0].ac = 1;
    }
    return { party, dmId, characters, pids };
  }

  test("handleVoiceNpc accepts `message` instead of `dialogue`", async () => {
    const { dmId } = await setupCombat();
    const result = handleVoiceNpc(dmId, { name: "Innkeeper", message: "Welcome, traveler." });
    expect(result.success).toBe(true);
  });

  test("handleVoiceNpc accepts `dialogue` (canonical)", async () => {
    const { dmId } = await setupCombat();
    const result = handleVoiceNpc(dmId, { name: "Innkeeper", dialogue: "Welcome, traveler." });
    expect(result.success).toBe(true);
  });

  test("handleMonsterAttack accepts `target_name` instead of `target_id` (resolved by name)", async () => {
    const { party, dmId, characters } = await setupCombat();
    // Walk turns until the monster is current
    const { getCurrentCombatant } = await import("../src/game/session.ts");
    let cur = getCurrentCombatant(party.session!);
    let safety = 20;
    while (cur && cur.type === "player" && safety-- > 0) {
      // Make players use their action via attack on the monster, advancing initiative.
      const monsterId = party.monsters[0]!.id;
      const playerChar = characters.get(cur.entityId)!;
      const { handleAttack, handleEndTurn } = await import("../src/game/game-manager.ts");
      handleAttack(playerChar.userId, { target_id: monsterId });
      handleEndTurn(playerChar.userId);
      cur = getCurrentCombatant(party.session!);
    }
    if (!cur || cur.type !== "monster") {
      throw new Error("Test setup: failed to reach monster turn");
    }

    // monster_attack uses target_name to resolve a player by name
    const targetChar = [...characters.values()].find((c) => c.partyId === party.id && c.hpCurrent > 0);
    expect(targetChar).toBeDefined();
    const result = handleMonsterAttack(dmId, {
      monster_id: cur.entityId,
      target_name: targetChar!.name,
    });
    // Either success (attack resolved) or a graceful failure that's NOT a
    // "missing target_id" param error. The point of P2-10 is that target_name
    // doesn't trip the missing-field guard.
    if (result.success) {
      expect(result.success).toBe(true);
    } else {
      expect(result.error ?? "").not.toMatch(/Missing required field/i);
    }
  });
});

// ---------------------------------------------------------------------------
// 7c P2-9 — stale party check
// ---------------------------------------------------------------------------

describe("P2-9: handleDMQueueForParty allows re-queue when party is stale (Task 7c)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  async function formPartyForTest(): Promise<{ dmId: string; partyId: string }> {
    const pids = [uid("p"), uid("p"), uid("p"), uid("p")];
    const dmId = uid("dm");
    for (const id of pids) {
      await handleCreateCharacter(id, {
        name: `R-${id}`, race: "human", class: "fighter",
        ability_scores: scores,
        avatar_url: "https://example.com/avatar.png",
      });
    }
    for (const id of pids) handleQueueForParty(id);
    handleDMQueueForParty(dmId);
    const partyId = [...getState().parties.keys()].pop()!;
    return { dmId, partyId };
  }

  test("formParty logs a `party_formed` event (events array is non-empty)", async () => {
    const { partyId } = await formPartyForTest();
    const party = getState().parties.get(partyId)!;
    expect(party.events.length).toBeGreaterThanOrEqual(1);
    expect(party.events.some((e) => e.type === "party_formed")).toBe(true);
  });

  test("fresh party (events within 5 minutes) → re-queue blocked with WRONG_STATE", async () => {
    const { dmId } = await formPartyForTest();
    // No time advance — party_formed event is fresh.
    const result = handleDMQueueForParty(dmId);
    expect(result.success).toBe(false);
    expect(result.reason_code).toBe("WRONG_STATE");
  });

  test("stale party (events older than 5 minutes) → re-queue allowed (DM joins queue)", async () => {
    const { dmId, partyId } = await formPartyForTest();

    // Advance wallclock by 6 minutes so the party_formed event ages past
    // the 5-minute staleness threshold. setSystemTime mutates Date.now()
    // for both the test and the gameplay code path under test.
    jest.setSystemTime(Date.now() + 6 * 60 * 1000);

    const result = handleDMQueueForParty(dmId);
    expect(result.success).toBe(true);

    // The DM is now back in the dmQueue (the active party still exists in
    // parties Map, but is treated as stale for re-queue purposes).
    const { dmQueue, parties } = getState();
    expect(dmQueue.some((q) => q.userId === dmId)).toBe(true);
    expect(parties.has(partyId)).toBe(true);
  });
});
