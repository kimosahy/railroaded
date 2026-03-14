import { describe, test, expect } from "bun:test";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  handleAwardXp,
  handleGetStatus,
} from "../src/game/game-manager.ts";
import type { AbilityScores } from "../src/types.ts";

const scores: AbilityScores = { str: 14, dex: 14, con: 14, int: 10, wis: 10, cha: 10 };

describe("level-up", () => {
  test("setup: form a party", async () => {
    const classes = ["fighter", "rogue", "cleric", "wizard"] as const;
    for (let i = 1; i <= 4; i++) {
      await handleCreateCharacter(`lvl-player-${i}`, {
        name: `LevelHero${i}`,
        race: "human",
        class: classes[i - 1],
        ability_scores: scores,
        avatar_url: "https://example.com/test-avatar.png",
      });
      handleQueueForParty(`lvl-player-${i}`);
    }
    const dm = handleDMQueueForParty("lvl-dm-1");
    expect(dm.success).toBe(true);
  });

  test("no level up below threshold", () => {
    // 300 XP needed for level 2, split 4 ways = need 1200 total
    const result = handleAwardXp("lvl-dm-1", { amount: 800 }); // 200 each
    expect(result.success).toBe(true);
    expect(result.data!.levelUps).toBeUndefined();

    const status = handleGetStatus("lvl-player-1");
    expect(status.data!.level).toBe(1);
    expect(status.data!.xp).toBe(200);
  });

  test("level up to 2 when XP threshold reached", () => {
    // Need 300 total, have 200, need 100 more each = 400 total
    const result = handleAwardXp("lvl-dm-1", { amount: 400 }); // 100 each → 300 total
    expect(result.success).toBe(true);
    expect(result.data!.levelUps).toBeDefined();
    expect((result.data!.levelUps as unknown[]).length).toBe(4);

    const status = handleGetStatus("lvl-player-1");
    expect(status.data!.level).toBe(2);
    expect(status.data!.xp).toBe(300);
  });

  test("HP increased on level up", () => {
    // Fighter: d10 hit die. CON 15 (14 + human +1), mod = +2
    // Level 1 HP = 10 + 2 = 12
    // Level 2 HP = 12 + (ceil(10/2)+1 + 2) = 12 + 8 = 20
    const status = handleGetStatus("lvl-player-1");
    const hp = status.data!.hp as { current: number; max: number };
    expect(hp.max).toBe(20);
    expect(hp.current).toBe(20); // full HP after level up
  });

  test("fighter gains Action Surge at level 2", () => {
    const status = handleGetStatus("lvl-player-1");
    const features = status.data!.features as string[];
    expect(features).toContain("Action Surge");
  });

  test("rogue has Cunning Action (core feature, present at all levels)", () => {
    const status = handleGetStatus("lvl-player-2");
    const features = status.data!.features as string[];
    expect(features).toContain("Cunning Action");
  });

  test("caster gets more spell slots at higher levels", () => {
    // Cleric at level 2 should have 3 level-1 slots (was 2 at level 1)
    const status = handleGetStatus("lvl-player-3");
    const slots = status.data!.spellSlots as { level_1: { max: number }; level_2: { max: number } };
    expect(slots.level_1.max).toBe(3);
  });

  test("level up to 3 with large XP award", () => {
    // Need 900 total, have 300, need 600 more each = 2400 total
    const result = handleAwardXp("lvl-dm-1", { amount: 2400 });
    expect(result.success).toBe(true);

    const status = handleGetStatus("lvl-player-1");
    expect(status.data!.level).toBe(3);
    expect(status.data!.xp).toBe(900);
  });

  test("caster gets level 2 spell slots at character level 3", () => {
    const status = handleGetStatus("lvl-player-3"); // cleric
    const slots = status.data!.spellSlots as { level_1: { max: number }; level_2: { max: number } };
    expect(slots.level_1.max).toBe(4);
    expect(slots.level_2.max).toBe(2);
  });

  test("multi-level jump works", () => {
    // Jump from 3 to 5 with one big award
    // Need 6500 total, have 900, need 5600 more each = 22400 total
    const result = handleAwardXp("lvl-dm-1", { amount: 22400 });
    expect(result.success).toBe(true);
    expect(result.data!.levelUps).toBeDefined();

    const status = handleGetStatus("lvl-player-1");
    expect(status.data!.level).toBe(5);
  });

  test("cap at level 5", () => {
    // Already at level 5 — more XP should not level further
    const result = handleAwardXp("lvl-dm-1", { amount: 40000 });
    expect(result.data!.levelUps).toBeUndefined();

    const after = handleGetStatus("lvl-player-1");
    expect(after.data!.level).toBe(5);
  });

  test("HP scales correctly to level 5", () => {
    // Fighter: d10, CON mod +2
    // Level 1: 10 + 2 = 12
    // Levels 2-5: each adds ceil(10/2)+1 + 2 = 8
    // Total: 12 + 4*8 = 44
    const status = handleGetStatus("lvl-player-1");
    const hp = status.data!.hp as { current: number; max: number };
    expect(hp.max).toBe(44);
  });
});
