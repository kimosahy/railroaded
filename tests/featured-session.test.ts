import { describe, test, expect } from "bun:test";
import { computeDramaScore } from "../src/api/spectator.ts";

describe("computeDramaScore", () => {
  test("returns 0 for empty event counts", () => {
    expect(computeDramaScore({})).toBe(0);
  });

  test("scores combat events", () => {
    const score = computeDramaScore({
      combat_start: 2,
      combat_end: 2,
    });
    // 2*3 + 2*2 = 10
    expect(score).toBe(10);
  });

  test("scores death events highest", () => {
    const score = computeDramaScore({
      death: 1,
      character_death: 1,
    });
    // 1*10 + 1*10 = 20
    expect(score).toBe(20);
  });

  test("scores death saves", () => {
    const score = computeDramaScore({
      death_save: 3,
    });
    // 3*5 = 15
    expect(score).toBe(15);
  });

  test("scores room exploration", () => {
    const score = computeDramaScore({
      room_enter: 5,
    });
    // 5*1 = 5
    expect(score).toBe(5);
  });

  test("scores level-ups", () => {
    const score = computeDramaScore({
      level_up: 2,
    });
    // 2*4 = 8
    expect(score).toBe(8);
  });

  test("scores loot", () => {
    const score = computeDramaScore({
      loot: 4,
    });
    // 4*2 = 8
    expect(score).toBe(8);
  });

  test("ignores unrelated event types", () => {
    const score = computeDramaScore({
      chat: 100,
      whisper: 50,
      narration: 20,
    });
    expect(score).toBe(0);
  });

  test("computes combined drama score correctly", () => {
    const score = computeDramaScore({
      combat_start: 3,    // 3*3 = 9
      combat_end: 3,      // 3*2 = 6
      room_enter: 8,      // 8*1 = 8
      death: 1,           // 1*10 = 10
      death_save: 2,      // 2*5 = 10
      level_up: 1,        // 1*4 = 4
      loot: 5,            // 5*2 = 10
    });
    // 9 + 6 + 8 + 10 + 10 + 4 + 10 = 57
    expect(score).toBe(57);
  });

  test("session with character_death scores higher than one without", () => {
    const withDeath = computeDramaScore({
      combat_start: 1,
      combat_end: 1,
      character_death: 1,
    });
    const withoutDeath = computeDramaScore({
      combat_start: 1,
      combat_end: 1,
    });
    expect(withDeath).toBeGreaterThan(withoutDeath);
  });
});
