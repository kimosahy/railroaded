import { describe, test, expect } from "bun:test";
import {
  stripMonsterSuffix,
  countEncountersFromEvents,
  buildBestiary,
} from "../src/api/spectator.ts";

describe("stripMonsterSuffix", () => {
  test("strips single-letter suffix", () => {
    expect(stripMonsterSuffix("Goblin A")).toBe("Goblin");
    expect(stripMonsterSuffix("Skeleton B")).toBe("Skeleton");
    expect(stripMonsterSuffix("Wolf C")).toBe("Wolf");
  });

  test("leaves names without suffix unchanged", () => {
    expect(stripMonsterSuffix("Goblin")).toBe("Goblin");
    expect(stripMonsterSuffix("Bandit Captain")).toBe("Bandit Captain");
    expect(stripMonsterSuffix("Giant Rat")).toBe("Giant Rat");
  });

  test("trims whitespace", () => {
    expect(stripMonsterSuffix("  Goblin  ")).toBe("Goblin");
    expect(stripMonsterSuffix("  Skeleton A  ")).toBe("Skeleton");
  });

  test("does not strip lowercase suffix", () => {
    expect(stripMonsterSuffix("Young Dragon")).toBe("Young Dragon");
  });

  test("handles empty string", () => {
    expect(stripMonsterSuffix("")).toBe("");
  });
});

describe("countEncountersFromEvents", () => {
  test("counts monsters from combat_start events", () => {
    const events = [
      { data: { monsters: [{ name: "Goblin A" }, { name: "Goblin B" }] } },
      { data: { monsters: [{ name: "Skeleton A" }] } },
      { data: { monsters: [{ name: "Goblin A" }] } },
    ];
    const counts = countEncountersFromEvents(events);
    expect(counts.get("Goblin")).toBe(3);
    expect(counts.get("Skeleton")).toBe(1);
  });

  test("skips events without monsters array", () => {
    const events = [
      { data: {} },
      { data: { monsters: "not an array" } },
      { data: { monsters: [{ name: "Wolf" }] } },
    ];
    const counts = countEncountersFromEvents(events);
    expect(counts.size).toBe(1);
    expect(counts.get("Wolf")).toBe(1);
  });

  test("skips entries with empty names", () => {
    const events = [
      { data: { monsters: [{ name: "" }, { name: "Orc" }, {}] } },
    ];
    const counts = countEncountersFromEvents(events);
    expect(counts.size).toBe(1);
    expect(counts.get("Orc")).toBe(1);
  });

  test("returns empty map for no events", () => {
    const counts = countEncountersFromEvents([]);
    expect(counts.size).toBe(0);
  });
});

describe("buildBestiary", () => {
  const templates = [
    { name: "Goblin", hpMax: 7, ac: 15, challengeRating: 0.25, xpValue: 50 },
    { name: "Skeleton", hpMax: 13, ac: 13, challengeRating: 0.25, xpValue: 50 },
    { name: "Ogre", hpMax: 59, ac: 11, challengeRating: 2, xpValue: 450 },
  ];

  test("maps template fields to bestiary fields", () => {
    const counts = new Map<string, number>();
    const bestiary = buildBestiary(templates, counts);
    const goblin = bestiary.find((m) => m.name === "Goblin");
    expect(goblin).toBeDefined();
    expect(goblin!.hp).toBe(7);
    expect(goblin!.ac).toBe(15);
    expect(goblin!.cr).toBe(0.25);
    expect(goblin!.xp).toBe(50);
    expect(goblin!.count).toBe(0);
  });

  test("enriches with encounter counts", () => {
    const counts = new Map([["Goblin", 5], ["Skeleton", 2]]);
    const bestiary = buildBestiary(templates, counts);
    expect(bestiary.find((m) => m.name === "Goblin")!.count).toBe(5);
    expect(bestiary.find((m) => m.name === "Skeleton")!.count).toBe(2);
    expect(bestiary.find((m) => m.name === "Ogre")!.count).toBe(0);
  });

  test("includes custom monsters not in templates", () => {
    const counts = new Map([["Goblin", 3], ["Custom Dragon", 1]]);
    const bestiary = buildBestiary(templates, counts);
    const custom = bestiary.find((m) => m.name === "Custom Dragon");
    expect(custom).toBeDefined();
    expect(custom!.count).toBe(1);
    expect(custom!.hp).toBe(0);
    expect(custom!.ac).toBe(0);
  });

  test("sorts by count descending then name", () => {
    const counts = new Map([["Skeleton", 10], ["Goblin", 5], ["Ogre", 5]]);
    const bestiary = buildBestiary(templates, counts);
    expect(bestiary[0].name).toBe("Skeleton");
    // Goblin vs Ogre both have count 5, sorted alphabetically
    expect(bestiary[1].name).toBe("Goblin");
    expect(bestiary[2].name).toBe("Ogre");
  });

  test("returns empty array for no templates and no counts", () => {
    const bestiary = buildBestiary([], new Map());
    expect(bestiary).toEqual([]);
  });
});
