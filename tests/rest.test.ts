import { describe, test, expect } from "bun:test";
import { shortRest, longRest, hitDieForClass, hitDieSidesForClass } from "../src/engine/rest.ts";

function makeRoller(values: number[]) {
  let i = 0;
  return (_sides: number) => {
    const val = values[i % values.length]!;
    i++;
    return val;
  };
}

describe("shortRest", () => {
  test("spend hit dice to heal", () => {
    const result = shortRest({
      hp: { current: 10, max: 30, temp: 0 },
      hitDice: { current: 3, max: 3, die: "1d10" },
      conModifier: 2,
      hitDiceToSpend: 2,
      characterClass: "fighter",
      characterLevel: 1,
      spellSlots: { level_1: { current: 0, max: 0 }, level_2: { current: 0, max: 0 } },
      randomFn: makeRoller([7, 5]),
    });
    expect(result.hpBefore).toBe(10);
    expect(result.hitDiceSpent).toBe(2);
    expect(result.hitDiceRemaining).toBe(1);
    expect(result.totalHealing).toBe(16); // (7+2) + (5+2)
    expect(result.hpAfter).toBe(26);
  });

  test("can't spend more hit dice than available", () => {
    const result = shortRest({
      hp: { current: 5, max: 20, temp: 0 },
      hitDice: { current: 1, max: 3, die: "1d8" },
      conModifier: 1,
      hitDiceToSpend: 5, // only has 1
      characterClass: "cleric",
      characterLevel: 1,
      spellSlots: { level_1: { current: 0, max: 2 }, level_2: { current: 0, max: 0 } },
      randomFn: makeRoller([6]),
    });
    expect(result.hitDiceSpent).toBe(1);
    expect(result.hitDiceRemaining).toBe(0);
  });

  test("healing can't exceed max HP", () => {
    const result = shortRest({
      hp: { current: 18, max: 20, temp: 0 },
      hitDice: { current: 3, max: 3, die: "1d10" },
      conModifier: 2,
      hitDiceToSpend: 1,
      characterClass: "fighter",
      characterLevel: 1,
      spellSlots: { level_1: { current: 0, max: 0 }, level_2: { current: 0, max: 0 } },
      randomFn: makeRoller([8]),
    });
    expect(result.hpAfter).toBe(20); // capped at max
  });

  test("wizard arcane recovery on short rest", () => {
    const result = shortRest({
      hp: { current: 10, max: 10, temp: 0 },
      hitDice: { current: 1, max: 1, die: "1d6" },
      conModifier: 0,
      hitDiceToSpend: 0,
      characterClass: "wizard",
      characterLevel: 3,
      spellSlots: {
        level_1: { current: 1, max: 4 },
        level_2: { current: 0, max: 2 },
      },
      arcaneRecoveryUsed: false,
    });
    expect(result.spellSlotsRecovered).toBe(true);
    expect(result.newSpellSlots.level_2.current).toBe(1); // recovered 1 level 2 slot
  });

  test("no arcane recovery if already used", () => {
    const result = shortRest({
      hp: { current: 10, max: 10, temp: 0 },
      hitDice: { current: 1, max: 1, die: "1d6" },
      conModifier: 0,
      hitDiceToSpend: 0,
      characterClass: "wizard",
      characterLevel: 3,
      spellSlots: {
        level_1: { current: 1, max: 4 },
        level_2: { current: 0, max: 2 },
      },
      arcaneRecoveryUsed: true,
    });
    expect(result.spellSlotsRecovered).toBe(false);
  });
});

describe("longRest", () => {
  test("restores full HP", () => {
    const result = longRest({
      hp: { current: 5, max: 30, temp: 3 },
      hitDice: { current: 1, max: 3, die: "1d10" },
      characterClass: "fighter",
      characterLevel: 3,
      spellSlots: { level_1: { current: 0, max: 0 }, level_2: { current: 0, max: 0 } },
    });
    expect(result.hpAfter).toBe(30);
  });

  test("recovers half hit dice (minimum 1)", () => {
    const result = longRest({
      hp: { current: 5, max: 30, temp: 0 },
      hitDice: { current: 0, max: 3, die: "1d10" },
      characterClass: "fighter",
      characterLevel: 3,
      spellSlots: { level_1: { current: 0, max: 0 }, level_2: { current: 0, max: 0 } },
    });
    // floor(3/2) = 1, but had 3 spent, so recovers 1
    expect(result.hitDiceRecovered).toBe(1);
    expect(result.hitDiceTotal).toBe(1);
  });

  test("restores all spell slots", () => {
    const result = longRest({
      hp: { current: 10, max: 10, temp: 0 },
      hitDice: { current: 3, max: 3, die: "1d8" },
      characterClass: "cleric",
      characterLevel: 3,
      spellSlots: {
        level_1: { current: 1, max: 4 },
        level_2: { current: 0, max: 2 },
      },
    });
    expect(result.newSpellSlots.level_1.current).toBe(4);
    expect(result.newSpellSlots.level_2.current).toBe(2);
  });
});

describe("hitDieForClass", () => {
  test("fighter = d10", () => expect(hitDieForClass("fighter")).toBe("1d10"));
  test("rogue = d8", () => expect(hitDieForClass("rogue")).toBe("1d8"));
  test("cleric = d8", () => expect(hitDieForClass("cleric")).toBe("1d8"));
  test("wizard = d6", () => expect(hitDieForClass("wizard")).toBe("1d6"));
});

describe("hitDieSidesForClass", () => {
  test("fighter = 10", () => expect(hitDieSidesForClass("fighter")).toBe(10));
  test("wizard = 6", () => expect(hitDieSidesForClass("wizard")).toBe(6));
});
