import { describe, test, expect } from "bun:test";
import {
  stripMonsterSuffix,
  normalizeMonsterName,
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

describe("normalizeMonsterName", () => {
  test("converts hyphenated names to title case", () => {
    expect(normalizeMonsterName("bandit-captain")).toBe("Bandit Captain");
    expect(normalizeMonsterName("giant-fire-beetle")).toBe("Giant Fire Beetle");
  });

  test("converts underscored names to title case", () => {
    expect(normalizeMonsterName("dire_wolf")).toBe("Dire Wolf");
  });

  test("normalizes all-caps to title case", () => {
    expect(normalizeMonsterName("GOBLIN")).toBe("Goblin");
  });

  test("leaves properly cased names unchanged", () => {
    expect(normalizeMonsterName("Bandit Captain")).toBe("Bandit Captain");
    expect(normalizeMonsterName("Goblin")).toBe("Goblin");
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

  test("normalizes hyphenated names to title case", () => {
    const events = [
      { data: { monsters: [{ name: "bandit-captain" }] } },
    ];
    const counts = countEncountersFromEvents(events);
    expect(counts.get("Bandit Captain")).toBe(1);
    expect(counts.has("bandit-captain")).toBe(false);
  });

  test("merges differently-cased monster names", () => {
    const events = [
      { data: { monsters: [{ name: "goblin" }, { name: "Goblin A" }] } },
      { data: { monsters: [{ name: "GOBLIN B" }] } },
    ];
    const counts = countEncountersFromEvents(events);
    expect(counts.get("Goblin")).toBe(3);
  });

  test("filters out 'unknown' monsters", () => {
    const events = [
      { data: { monsters: [{ name: "unknown" }, { name: "Goblin" }] } },
      { data: { monsters: [{ name: "Unknown" }] } },
    ];
    const counts = countEncountersFromEvents(events);
    expect(counts.has("Unknown")).toBe(false);
    expect(counts.has("unknown")).toBe(false);
    expect(counts.get("Goblin")).toBe(1);
  });

  test("prefers templateName over name when available", () => {
    const events = [
      { data: { monsters: [{ name: "Goblin A", templateName: "Goblin" }] } },
    ];
    const counts = countEncountersFromEvents(events);
    expect(counts.get("Goblin")).toBe(1);
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

  test("matches normalized encounter names to templates", () => {
    const counts = new Map([["Bandit Captain", 3]]);
    const tmpl = [{ name: "Bandit Captain", hpMax: 65, ac: 15, challengeRating: 2, xpValue: 450 }];
    const bestiary = buildBestiary(tmpl, counts);
    expect(bestiary.find((m) => m.name === "Bandit Captain")!.count).toBe(3);
  });

  test("does not create duplicate entries for normalized names that match templates", () => {
    const counts = new Map([["Bandit Captain", 2]]);
    const tmpl = [{ name: "Bandit Captain", hpMax: 65, ac: 15, challengeRating: 2, xpValue: 450 }];
    const bestiary = buildBestiary(tmpl, counts);
    const matches = bestiary.filter((m) => m.name.toLowerCase().includes("bandit"));
    expect(matches.length).toBe(1);
    expect(matches[0].hp).toBe(65);
    expect(matches[0].count).toBe(2);
  });

  test("encountered monsters (count > 0) appear before undiscovered (count === 0)", () => {
    const counts = new Map([["Skeleton", 3]]);
    const bestiary = buildBestiary(templates, counts);
    const encountered = bestiary.filter((m) => m.count > 0);
    const undiscovered = bestiary.filter((m) => m.count === 0);
    expect(encountered.length).toBe(1);
    expect(encountered[0].name).toBe("Skeleton");
    expect(undiscovered.length).toBe(2);
    // Encountered entries should come first in the sorted output
    const firstUndiscoveredIdx = bestiary.findIndex((m) => m.count === 0);
    const lastEncounteredIdx = bestiary.length - 1 - [...bestiary].reverse().findIndex((m) => m.count > 0);
    expect(lastEncounteredIdx).toBeLessThan(firstUndiscoveredIdx);
  });

  test("all-zero encounters produces entirely undiscovered list", () => {
    const counts = new Map<string, number>();
    const bestiary = buildBestiary(templates, counts);
    expect(bestiary.length).toBe(3);
    expect(bestiary.every((m) => m.count === 0)).toBe(true);
  });

  test("all templates encountered produces no undiscovered entries", () => {
    const counts = new Map([["Goblin", 2], ["Skeleton", 5], ["Ogre", 1]]);
    const bestiary = buildBestiary(templates, counts);
    expect(bestiary.length).toBe(3);
    expect(bestiary.every((m) => m.count > 0)).toBe(true);
  });
});
