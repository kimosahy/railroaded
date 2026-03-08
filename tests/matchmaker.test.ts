import { describe, test, expect } from "bun:test";
import { tryMatchParty, calculateBalanceScore, getMatchedIds, SYSTEM_DM_ID, type QueueEntry } from "../src/game/matchmaker.ts";

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

  test("3 players + 1 DM → no match (not enough players)", () => {
    const queue = [makePlayer("p1"), makePlayer("p2"), makePlayer("p3"), makeDM("dm1")];
    expect(tryMatchParty(queue)).toBeNull();
  });

  test("4 players + no DM → match with system-dm", () => {
    const queue = [makePlayer("p1"), makePlayer("p2"), makePlayer("p3"), makePlayer("p4")];
    const match = tryMatchParty(queue);
    expect(match).not.toBeNull();
    expect(match!.players).toHaveLength(4);
    expect(match!.dm.userId).toBe(SYSTEM_DM_ID);
    expect(match!.dm.role).toBe("dm");
  });

  test("5 players + no DM → match with system-dm (picks best 4)", () => {
    const queue = [
      makePlayer("p1", "cleric"),
      makePlayer("p2", "fighter"),
      makePlayer("p3", "wizard"),
      makePlayer("p4", "rogue"),
      makePlayer("p5", "fighter"),
    ];
    const match = tryMatchParty(queue);
    expect(match).not.toBeNull();
    expect(match!.players).toHaveLength(4);
    expect(match!.dm.userId).toBe(SYSTEM_DM_ID);
  });

  test("real DM preferred over system-dm", () => {
    const queue = [makePlayer("p1"), makePlayer("p2"), makePlayer("p3"), makePlayer("p4"), makeDM("dm1")];
    const match = tryMatchParty(queue);
    expect(match!.dm.userId).toBe("dm1");
  });

  test("getMatchedIds includes system-dm when no real DM", () => {
    const queue = [makePlayer("p1"), makePlayer("p2"), makePlayer("p3"), makePlayer("p4")];
    const match = tryMatchParty(queue)!;
    const ids = getMatchedIds(match);
    expect(ids).toContain(SYSTEM_DM_ID);
    expect(ids).toHaveLength(5);
  });
});

describe("calculateBalanceScore", () => {
  test("perfect party = max score", () => {
    const party = [makePlayer("1", "cleric"), makePlayer("2", "fighter"), makePlayer("3", "wizard"), makePlayer("4", "rogue")];
    const score = calculateBalanceScore(party);
    expect(score).toBe(115); // 4*25 + 10 (healer) + 5 (tank)
  });
});
