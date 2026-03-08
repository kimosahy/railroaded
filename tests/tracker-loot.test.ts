import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const html = readFileSync(join(__dirname, "../website/tracker.html"), "utf-8");

describe("tracker loot event rendering", () => {
  test("switch statement handles 'loot' event type", () => {
    expect(html).toContain("case 'loot':");
  });

  test("renderLootAward function exists", () => {
    expect(html).toContain("function renderLootAward(d)");
  });

  test("renderLootAward renders item name with item-name class", () => {
    expect(html).toMatch(/renderLootAward[\s\S]*?d\.itemName[\s\S]*?item-name/);
  });

  test("renderLootAward renders gold with gold-val class", () => {
    expect(html).toMatch(/renderLootAward[\s\S]*?d\.gold[\s\S]*?gold-val/);
  });

  test("renderLootAward shows character name when present", () => {
    expect(html).toMatch(/renderLootAward[\s\S]*?d\.characterName/);
  });

  test("renderLoot shows recipient via characterName", () => {
    // renderLoot should reference d.characterName for the recipient
    expect(html).toMatch(/function renderLoot[\s\S]*?d\.characterName/);
  });

  test("renderLoot shows monster name as loot source", () => {
    expect(html).toMatch(/function renderLoot[\s\S]*?d\.monsterName/);
  });

  test("item-name CSS class exists with styling", () => {
    expect(html).toMatch(/\.item-name\s*\{[^}]*font-style:\s*italic/);
  });

  test("loot case routes to renderLootAward", () => {
    expect(html).toMatch(/case 'loot':\s*return renderLootAward\(d\)/);
  });

  test("loot_drop and room_loot still route to renderLoot", () => {
    expect(html).toMatch(/case 'loot_drop'.*case 'room_loot'.*return renderLoot\(d\)/);
  });
});
