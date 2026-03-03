import { describe, test, expect } from "bun:test";
import {
  abilityCheck,
  savingThrow,
  groupCheck,
  passiveScore,
  proficiencyBonus,
} from "../src/engine/checks.ts";
import type { AbilityScores } from "../src/types.ts";

function makeRoller(values: number[]) {
  let i = 0;
  return (_sides: number) => {
    const val = values[i % values.length]!;
    i++;
    return val;
  };
}

const standardScores: AbilityScores = {
  str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 15,
};

describe("abilityCheck", () => {
  test("basic STR check succeeds", () => {
    const result = abilityCheck({
      abilityScores: standardScores,
      ability: "str",
      dc: 15,
      randomFn: makeRoller([14]), // 14 + 3 (STR mod) = 17 >= 15
    });
    expect(result.success).toBe(true);
    expect(result.modifier).toBe(3);
    expect(result.roll.total).toBe(17);
  });

  test("basic STR check fails", () => {
    const result = abilityCheck({
      abilityScores: standardScores,
      ability: "str",
      dc: 15,
      randomFn: makeRoller([10]), // 10 + 3 = 13 < 15
    });
    expect(result.success).toBe(false);
  });

  test("proficiency bonus adds to roll", () => {
    const result = abilityCheck({
      abilityScores: standardScores,
      ability: "wis",
      dc: 10,
      proficiencyBonus: 2,
      randomFn: makeRoller([10]), // 10 + (-1) + 2 = 11 >= 10
    });
    expect(result.success).toBe(true);
    expect(result.proficiencyBonus).toBe(2);
  });

  test("advantage rolls two d20, keeps higher", () => {
    const result = abilityCheck({
      abilityScores: standardScores,
      ability: "dex",
      dc: 15,
      advantage: true,
      randomFn: makeRoller([8, 16]), // keeps 16, +2 DEX mod = 18 >= 15
    });
    expect(result.success).toBe(true);
    expect(result.roll.rolls).toEqual([8, 16]);
  });

  test("disadvantage rolls two d20, keeps lower", () => {
    const result = abilityCheck({
      abilityScores: standardScores,
      ability: "dex",
      dc: 15,
      disadvantage: true,
      randomFn: makeRoller([8, 16]), // keeps 8, +2 DEX mod = 10 < 15
    });
    expect(result.success).toBe(false);
  });

  test("advantage + disadvantage cancel out", () => {
    const result = abilityCheck({
      abilityScores: standardScores,
      ability: "str",
      dc: 10,
      advantage: true,
      disadvantage: true,
      randomFn: makeRoller([12]), // normal roll
    });
    expect(result.roll.rolls).toHaveLength(1);
  });

  test("detects natural 20", () => {
    const result = abilityCheck({
      abilityScores: standardScores,
      ability: "str",
      dc: 30,
      randomFn: makeRoller([20]),
    });
    expect(result.natural20).toBe(true);
  });

  test("detects natural 1", () => {
    const result = abilityCheck({
      abilityScores: standardScores,
      ability: "str",
      dc: 5,
      randomFn: makeRoller([1]),
    });
    expect(result.natural1).toBe(true);
  });
});

describe("savingThrow", () => {
  test("natural 20 always succeeds", () => {
    const result = savingThrow({
      abilityScores: standardScores,
      ability: "int",
      dc: 50, // impossible DC
      randomFn: makeRoller([20]),
    });
    expect(result.success).toBe(true);
    expect(result.natural20).toBe(true);
  });

  test("natural 1 always fails", () => {
    const result = savingThrow({
      abilityScores: standardScores,
      ability: "str",
      dc: 1, // trivial DC
      randomFn: makeRoller([1]),
    });
    expect(result.success).toBe(false);
    expect(result.natural1).toBe(true);
  });

  test("normal saving throw works same as ability check", () => {
    const result = savingThrow({
      abilityScores: standardScores,
      ability: "con",
      dc: 14,
      randomFn: makeRoller([13]), // 13 + 1 (CON mod) = 14 >= 14
    });
    expect(result.success).toBe(true);
  });
});

describe("groupCheck", () => {
  test("majority pass = group success", () => {
    const characters = [
      { id: "a", abilityScores: standardScores },
      { id: "b", abilityScores: standardScores },
      { id: "c", abilityScores: standardScores },
      { id: "d", abilityScores: standardScores },
    ];
    // STR mod is +3. Rolls: 12(pass), 5(fail), 15(pass), 10(pass) → 3 pass
    const result = groupCheck({
      characters,
      ability: "str",
      dc: 13,
      randomFn: makeRoller([12, 5, 15, 10]),
    });
    expect(result.success).toBe(true);
    expect(result.results).toHaveLength(4);
  });

  test("majority fail = group failure", () => {
    const characters = [
      { id: "a", abilityScores: standardScores },
      { id: "b", abilityScores: standardScores },
      { id: "c", abilityScores: standardScores },
      { id: "d", abilityScores: standardScores },
    ];
    // STR mod is +3. Rolls: 2(fail), 5(fail), 15(pass), 3(fail) → 1 pass
    const result = groupCheck({
      characters,
      ability: "str",
      dc: 13,
      randomFn: makeRoller([2, 5, 15, 3]),
    });
    expect(result.success).toBe(false);
  });
});

describe("passiveScore", () => {
  test("calculates 10 + modifier", () => {
    expect(passiveScore(standardScores, "str")).toBe(13); // 10 + 3
    expect(passiveScore(standardScores, "dex")).toBe(12); // 10 + 2
    expect(passiveScore(standardScores, "wis")).toBe(9);  // 10 + (-1)
  });

  test("adds proficiency bonus", () => {
    expect(passiveScore(standardScores, "str", 2)).toBe(15); // 10 + 3 + 2
  });
});

describe("proficiencyBonus", () => {
  test("levels 1-4 = +2", () => {
    expect(proficiencyBonus(1)).toBe(2);
    expect(proficiencyBonus(4)).toBe(2);
  });

  test("level 5 = +3", () => {
    expect(proficiencyBonus(5)).toBe(3);
  });
});

describe("margin", () => {
  test("positive margin on pass", () => {
    const result = abilityCheck({
      abilityScores: standardScores,
      ability: "str",
      dc: 12,
      randomFn: makeRoller([14]), // 14 + 3 = 17, margin = 17 - 12 = 5
    });
    expect(result.success).toBe(true);
    expect(result.margin).toBe(5);
  });

  test("negative margin on fail", () => {
    const result = abilityCheck({
      abilityScores: standardScores,
      ability: "str",
      dc: 18,
      randomFn: makeRoller([10]), // 10 + 3 = 13, margin = 13 - 18 = -5
    });
    expect(result.success).toBe(false);
    expect(result.margin).toBe(-5);
  });

  test("zero margin on exact DC match", () => {
    const result = abilityCheck({
      abilityScores: standardScores,
      ability: "str",
      dc: 15,
      randomFn: makeRoller([12]), // 12 + 3 = 15, margin = 0
    });
    expect(result.success).toBe(true);
    expect(result.margin).toBe(0);
  });

  test("margin on saving throw", () => {
    const result = savingThrow({
      abilityScores: standardScores,
      ability: "con",
      dc: 14,
      randomFn: makeRoller([13]), // 13 + 1 = 14, margin = 0
    });
    expect(result.success).toBe(true);
    expect(result.margin).toBe(0);
  });

  test("margin with proficiency bonus", () => {
    const result = abilityCheck({
      abilityScores: standardScores,
      ability: "wis",
      dc: 12,
      proficiencyBonus: 2,
      randomFn: makeRoller([10]), // 10 + (-1) + 2 = 11, margin = 11 - 12 = -1
    });
    expect(result.success).toBe(false);
    expect(result.margin).toBe(-1);
  });
});

describe("groupCheck with skill proficiency", () => {
  test("proficiency bonus applied per-character", () => {
    const characters = [
      {
        id: "rogue",
        abilityScores: { str: 10, dex: 16, con: 12, int: 10, wis: 10, cha: 10 },
        proficiencyBonus: 2, // proficient in stealth
      },
      {
        id: "fighter",
        abilityScores: { str: 16, dex: 10, con: 14, int: 10, wis: 10, cha: 10 },
        proficiencyBonus: 0, // not proficient
      },
    ];
    // Rogue: roll 8 + 3 (DEX) + 2 (prof) = 13 >= 13 → pass
    // Fighter: roll 8 + 0 (DEX) + 0 = 8 < 13 → fail
    const result = groupCheck({
      characters,
      ability: "dex",
      dc: 13,
      randomFn: makeRoller([8, 8]),
    });
    expect(result.results[0]!.check.success).toBe(true);
    expect(result.results[0]!.check.roll.total).toBe(13);
    expect(result.results[0]!.check.margin).toBe(0);
    expect(result.results[1]!.check.success).toBe(false);
    expect(result.results[1]!.check.roll.total).toBe(8);
    expect(result.results[1]!.check.margin).toBe(-5);
    // 1 pass, 1 fail out of 2 → majority = ceil(2/2) = 1 → 1 >= 1 → success
    expect(result.success).toBe(true);
  });
});
