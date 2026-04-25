import { describe, test, expect } from "bun:test";
import { tryMatchParty, tryMatchPartyFallback, type QueueEntry } from "../src/game/matchmaker.ts";

function makePlayer(id: string, cls: "fighter" | "cleric" | "wizard" | "rogue" = "fighter"): QueueEntry {
  return { userId: id, characterId: `char-${id}`, characterClass: cls, characterName: `Name-${id}`, personality: "", playstyle: "", role: "player" };
}

function makeDM(id: string): QueueEntry {
  return { userId: id, characterId: "", characterClass: "fighter", characterName: "DM", personality: "", playstyle: "", role: "dm" };
}

describe("Flexible matchmaking", () => {
  // Updated for PARTY_SIZE_MIN=4 per CC-260424 §4 Task 3a (was min=2 pre-MF-016)
  test("1 DM + 2 players → no immediate match; fallback matches after 30s wait-window (minimum)", () => {
    const queue = [makeDM("dm1"), makePlayer("p1"), makePlayer("p2")];
    // Immediate match requires >= PARTY_SIZE_MIN (4) players
    expect(tryMatchParty(queue)).toBeNull();
    // Fallback floor is 2 players + DM
    const fallback = tryMatchPartyFallback(queue);
    expect(fallback).not.toBeNull();
    expect(fallback!.players).toHaveLength(2);
    expect(fallback!.dm.userId).toBe("dm1");
    expect(fallback!.dm.role).toBe("dm");
  });

  test("1 DM + 1 player → party does NOT form", () => {
    const queue = [makeDM("dm1"), makePlayer("p1")];
    const match = tryMatchParty(queue);
    expect(match).toBeNull();
  });

  test("1 DM + 4 players → party forms (standard size)", () => {
    const queue = [makeDM("dm1"), makePlayer("p1"), makePlayer("p2"), makePlayer("p3"), makePlayer("p4")];
    const match = tryMatchParty(queue);
    expect(match).not.toBeNull();
    expect(match!.players).toHaveLength(4);
    expect(match!.dm.userId).toBe("dm1");
  });

  test("0 DM + 4 players → party does NOT form", () => {
    const queue = [makePlayer("p1"), makePlayer("p2"), makePlayer("p3"), makePlayer("p4")];
    const match = tryMatchParty(queue);
    expect(match).toBeNull();
  });

  test("1 DM + 20 players → party forms with all 20 (maximum)", () => {
    const players = Array.from({ length: 20 }, (_, i) => makePlayer(`p${i + 1}`));
    const queue = [makeDM("dm1"), ...players];
    const match = tryMatchParty(queue);
    expect(match).not.toBeNull();
    expect(match!.players).toHaveLength(20);
  });

  test("1 DM + 21 players → party forms with first 20 (cap)", () => {
    const players = Array.from({ length: 21 }, (_, i) => makePlayer(`p${i + 1}`));
    const queue = [makeDM("dm1"), ...players];
    const match = tryMatchParty(queue);
    expect(match).not.toBeNull();
    expect(match!.players).toHaveLength(20);
  });

  test("0 DM + 0 players → no match", () => {
    const match = tryMatchParty([]);
    expect(match).toBeNull();
  });
});
