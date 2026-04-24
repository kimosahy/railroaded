import { describe, test, expect } from "bun:test";
import { tryMatchParty, tryMatchPartyFallback, calculateBalanceScore, getMatchedIds, type QueueEntry } from "../src/game/matchmaker.ts";

function makePlayer(id: string, cls: "fighter" | "cleric" | "wizard" | "rogue" = "fighter"): QueueEntry {
  return { userId: id, characterId: `char-${id}`, characterClass: cls, characterName: `Name-${id}`, personality: "", playstyle: "", role: "player" };
}

function makeDM(id: string): QueueEntry {
  return { userId: id, characterId: "", characterClass: "fighter", characterName: "DM", personality: "", playstyle: "", role: "dm" };
}

describe("tryMatchParty", () => {
  test("4 players + 1 DM → match", () => {
    const queue = [makePlayer("p1"), makePlayer("p2"), makePlayer("p3"), makePlayer("p4"), makeDM("dm1")];
    const match = tryMatchParty(queue);
    expect(match).not.toBeNull();
    expect(match!.players).toHaveLength(4);
    expect(match!.dm.userId).toBe("dm1");
  });

  // Updated for PARTY_SIZE_MIN=4 per CC-260424 §4 Task 3a (was min=2 pre-MF-016)
  test("3 players + 1 DM → no immediate match (below PARTY_SIZE_MIN=4); fallback matches after 30s wait-window", () => {
    const queue = [makePlayer("p1"), makePlayer("p2"), makePlayer("p3"), makeDM("dm1")];
    // Immediate match requires >= PARTY_SIZE_MIN (4) players
    expect(tryMatchParty(queue)).toBeNull();
    // Fallback (called by wait-window timer at 30s) matches >=2 players + DM
    const fallback = tryMatchPartyFallback(queue);
    expect(fallback).not.toBeNull();
    expect(fallback!.players).toHaveLength(3);
    expect(fallback!.dm.userId).toBe("dm1");
  });

  test("4 players + no DM → no match (DM required)", () => {
    const queue = [makePlayer("p1"), makePlayer("p2"), makePlayer("p3"), makePlayer("p4")];
    const match = tryMatchParty(queue);
    expect(match).toBeNull();
  });

  test("5 players + no DM → no match (DM required)", () => {
    const queue = [
      makePlayer("p1", "cleric"),
      makePlayer("p2", "fighter"),
      makePlayer("p3", "wizard"),
      makePlayer("p4", "rogue"),
      makePlayer("p5", "fighter"),
    ];
    const match = tryMatchParty(queue);
    expect(match).toBeNull();
  });

  test("DM uses real DM from queue", () => {
    const queue = [makePlayer("p1"), makePlayer("p2"), makePlayer("p3"), makePlayer("p4"), makeDM("dm1")];
    const match = tryMatchParty(queue);
    expect(match!.dm.userId).toBe("dm1");
  });

  test("getMatchedIds includes DM", () => {
    const queue = [makePlayer("p1"), makePlayer("p2"), makePlayer("p3"), makePlayer("p4"), makeDM("dm1")];
    const match = tryMatchParty(queue)!;
    const ids = getMatchedIds(match);
    expect(ids).toContain("dm1");
    expect(ids).toHaveLength(5); // 4 players + DM
  });
});

describe("calculateBalanceScore", () => {
  test("perfect party = max score", () => {
    const party = [makePlayer("1", "cleric"), makePlayer("2", "fighter"), makePlayer("3", "wizard"), makePlayer("4", "rogue")];
    const score = calculateBalanceScore(party);
    expect(score).toBe(115); // 4*25 + 10 (healer) + 5 (tank)
  });
});
