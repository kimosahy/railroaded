/**
 * F-4: Partial XP award on non-normal combat exits.
 * Scenarios: session-end mid-combat, no-kill timeout. Both paths previously
 * awarded 0 XP for monsters killed before the exit.
 */
import { describe, test, expect } from "bun:test";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  handleSpawnEncounter,
  handleEndSession,
  getState,
} from "../src/game/game-manager.ts";
import type { AbilityScores } from "../src/types.ts";

const scores: AbilityScores = { str: 14, dex: 14, con: 14, int: 10, wis: 10, cha: 10 };

let counter = 0;
function uid(prefix: string) {
  return `xp-${prefix}-${++counter}`;
}

async function setupParty() {
  const pids = [uid("p"), uid("p"), uid("p"), uid("p")];
  const dmId = uid("dm");
  const charIds: string[] = [];
  for (const id of pids) {
    const r = await handleCreateCharacter(id, {
      name: `Hero-${id}`,
      race: "human",
      class: "fighter",
      ability_scores: scores,
      avatar_url: "https://example.com/test-avatar.png",
    });
    expect(r.success).toBe(true);
    charIds.push(r.character!.id);
    handleQueueForParty(id);
  }
  const dmRes = handleDMQueueForParty(dmId);
  expect(dmRes.success).toBe(true);
  const partyId = [...getState().parties.keys()].pop()!;
  return { dmId, playerIds: pids, charIds, partyId };
}

describe("F-4: partial XP on session-end mid-combat", () => {
  test("kill 2 of 3 monsters, end session → partial XP awarded", async () => {
    const { dmId, charIds, partyId } = await setupParty();
    const spawn = handleSpawnEncounter(dmId, {
      monsters: [{ template_name: "Goblin", count: 3 }],
    });
    expect(spawn.success).toBe(true);

    const party = getState().parties.get(partyId)!;
    expect(party.monsters.length).toBe(3);

    party.monsters[0]!.isAlive = false;
    party.monsters[1]!.isAlive = false;

    const initialXp = charIds.map((id) => getState().characters.get(id)!.xp);

    const res = handleEndSession(dmId, {
      summary: "Recalled the party before the third goblin fell.",
      outcome: "abandoned",
    });
    expect(res.success).toBe(true);

    const partialEvents = party.events.filter((e) => e.type === "partial_xp_awarded");
    expect(partialEvents.length).toBe(1);
    const data = partialEvents[0]!.data as Record<string, unknown>;
    expect(data.monstersKilled).toBe(2);
    expect(data.reason).toBe("session_end_mid_combat");
    // 2 dead goblins (xpValue 50 each = 100) split across 4 players
    expect(data.xpAwarded).toBe(100);

    const finalXp = charIds.map((id) => getState().characters.get(id)!.xp);
    for (let i = 0; i < charIds.length; i++) {
      expect(finalXp[i]! - initialXp[i]!).toBe(25);
    }
  });

  test("end session with 0 kills → no partial_xp_awarded event", async () => {
    const { dmId, partyId } = await setupParty();
    const spawn = handleSpawnEncounter(dmId, {
      monsters: [{ template_name: "Goblin", count: 2 }],
    });
    expect(spawn.success).toBe(true);
    const party = getState().parties.get(partyId)!;

    const res = handleEndSession(dmId, {
      summary: "Bailed out before any kills.",
      outcome: "retreat",
    });
    expect(res.success).toBe(true);

    const partialEvents = party.events.filter((e) => e.type === "partial_xp_awarded");
    expect(partialEvents.length).toBe(0);
  });

  test("end session NOT in combat → no partial_xp_awarded event", async () => {
    const { dmId, partyId } = await setupParty();
    const party = getState().parties.get(partyId)!;
    expect(party.session?.phase).toBe("exploration");

    const res = handleEndSession(dmId, { summary: "Quiet exploration only.", outcome: "victory" });
    expect(res.success).toBe(true);

    const partialEvents = party.events.filter((e) => e.type === "partial_xp_awarded");
    expect(partialEvents.length).toBe(0);
  });

  test("kill all monsters, end session → partial XP equals full encounter XP", async () => {
    const { dmId, charIds, partyId } = await setupParty();
    const spawn = handleSpawnEncounter(dmId, {
      monsters: [{ template_name: "Goblin", count: 4 }],
    });
    expect(spawn.success).toBe(true);
    const party = getState().parties.get(partyId)!;
    for (const m of party.monsters) m.isAlive = false;

    const res = handleEndSession(dmId, { summary: "Wiped them all.", outcome: "victory" });
    expect(res.success).toBe(true);

    const partialEvents = party.events.filter((e) => e.type === "partial_xp_awarded");
    expect(partialEvents.length).toBe(1);
    const data = partialEvents[0]!.data as Record<string, unknown>;
    expect(data.xpAwarded).toBe(200); // 4 * 50
    expect(data.monstersKilled).toBe(4);
    for (const cid of charIds) {
      const c = getState().characters.get(cid)!;
      expect(c.xp).toBeGreaterThanOrEqual(50);
    }
  });
});

describe("F-4: awardPartialXP triggers level_up events", () => {
  test("partial XP crosses L2 threshold → level_up events emitted", async () => {
    const { dmId, charIds, partyId } = await setupParty();
    for (const cid of charIds) {
      const c = getState().characters.get(cid)!;
      c.xp = 290; // just below L2 threshold (300)
    }

    const spawn = handleSpawnEncounter(dmId, {
      monsters: [{ template_name: "Goblin", count: 1 }],
    });
    expect(spawn.success).toBe(true);
    const party = getState().parties.get(partyId)!;
    party.monsters[0]!.isAlive = false; // 50 xp

    const res = handleEndSession(dmId, { summary: "Last goblin felled.", outcome: "victory" });
    expect(res.success).toBe(true);

    // 50 / 4 = 12 each → 290 + 12 = 302 → above L2 threshold (300)
    const levelUpEvents = party.events.filter((e) => e.type === "level_up");
    expect(levelUpEvents.length).toBe(charIds.length);
    for (const cid of charIds) {
      const c = getState().characters.get(cid)!;
      expect(c.level).toBe(2);
    }
  });
});
