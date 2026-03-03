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

describe("abilityCheck with advantage", () => {
  test("advantage takes higher of 2 rolls", () => {
    const result = abilityCheck({
      abilityScores: standardScores,
      ability: "str",
      dc: 15,
      advantage: true,
      randomFn: makeRoller([5, 18]), // keeps 18, +3 STR = 21 >= 15
    });
    expect(result.success).toBe(true);
    expect(result.roll.total).toBe(21);
    expect(result.margin).toBe(6);
    expect(result.roll.rolls).toEqual([5, 18]);
  });

  test("disadvantage takes lower of 2 rolls", () => {
    const result = abilityCheck({
      abilityScores: standardScores,
      ability: "str",
      dc: 15,
      disadvantage: true,
      randomFn: makeRoller([5, 18]), // keeps 5, +3 STR = 8 < 15
    });
    expect(result.success).toBe(false);
    expect(result.roll.total).toBe(8);
    expect(result.margin).toBe(-7);
  });

  test("advantage + disadvantage cancel out to single roll", () => {
    const result = abilityCheck({
      abilityScores: standardScores,
      ability: "str",
      dc: 10,
      advantage: true,
      disadvantage: true,
      randomFn: makeRoller([12]), // normal single roll
    });
    expect(result.roll.rolls).toHaveLength(1);
    expect(result.roll.total).toBe(15); // 12 + 3 STR
    expect(result.margin).toBe(5);
  });
});

describe("savingThrow with advantage", () => {
  test("advantage on saving throw takes higher roll", () => {
    const result = savingThrow({
      abilityScores: standardScores,
      ability: "dex",
      dc: 14,
      advantage: true,
      randomFn: makeRoller([4, 15]), // keeps 15, +2 DEX = 17 >= 14
    });
    expect(result.success).toBe(true);
    expect(result.roll.total).toBe(17);
    expect(result.margin).toBe(3);
  });
});

describe("groupCheck with advantage", () => {
  test("advantage applied to all characters in group", () => {
    const characters = [
      { id: "a", abilityScores: standardScores },
      { id: "b", abilityScores: standardScores },
    ];
    // Each character rolls 2d20 with advantage (takes higher)
    // Character a: rolls 3, 16 → keeps 16, +3 STR = 19 >= 15 → pass
    // Character b: rolls 2, 8 → keeps 8, +3 STR = 11 < 15 → fail
    const result = groupCheck({
      characters,
      ability: "str",
      dc: 15,
      randomFn: makeRoller([3, 16, 2, 8]),
      advantage: true,
    });
    expect(result.results[0]!.check.success).toBe(true);
    expect(result.results[0]!.check.roll.total).toBe(19);
    expect(result.results[1]!.check.success).toBe(false);
    expect(result.results[1]!.check.roll.total).toBe(11);
    expect(result.success).toBe(true); // 1 of 2 pass → majority
  });
});

describe("contested checks", () => {
  test("player 1 wins with higher total", () => {
    // Player 1: roll 15, +3 STR = 18
    // Player 2: roll 10, +2 DEX = 12
    const result1 = abilityCheck({
      abilityScores: standardScores,
      ability: "str",
      dc: 0,
      randomFn: makeRoller([15]),
    });
    const result2 = abilityCheck({
      abilityScores: standardScores,
      ability: "dex",
      dc: 0,
      randomFn: makeRoller([10]),
    });
    const winner = result1.roll.total >= result2.roll.total ? 1 : 2;
    const margin = result1.roll.total - result2.roll.total;
    expect(winner).toBe(1);
    expect(margin).toBe(6); // 18 - 12
  });

  test("player 2 wins with higher total", () => {
    const result1 = abilityCheck({
      abilityScores: standardScores,
      ability: "str",
      dc: 0,
      randomFn: makeRoller([5]), // 5 + 3 = 8
    });
    const result2 = abilityCheck({
      abilityScores: standardScores,
      ability: "dex",
      dc: 0,
      randomFn: makeRoller([15]), // 15 + 2 = 17
    });
    const winner = result1.roll.total >= result2.roll.total ? 1 : 2;
    expect(winner).toBe(2);
    expect(result1.roll.total - result2.roll.total).toBe(-9);
  });

  test("tie goes to initiator (player 1)", () => {
    // Both roll the same total
    const result1 = abilityCheck({
      abilityScores: standardScores,
      ability: "str",
      dc: 0,
      randomFn: makeRoller([9]), // 9 + 3 = 12
    });
    const result2 = abilityCheck({
      abilityScores: standardScores,
      ability: "dex",
      dc: 0,
      randomFn: makeRoller([10]), // 10 + 2 = 12
    });
    const winner = result1.roll.total >= result2.roll.total ? 1 : 2;
    const margin = result1.roll.total - result2.roll.total;
    expect(result1.roll.total).toBe(12);
    expect(result2.roll.total).toBe(12);
    expect(winner).toBe(1); // tie → player 1
    expect(margin).toBe(0);
  });

  test("skill proficiency gives bonus in contested check", () => {
    // Player with proficiency (+2) vs player without
    const result1 = abilityCheck({
      abilityScores: standardScores,
      ability: "str",
      dc: 0,
      proficiencyBonus: 2,
      randomFn: makeRoller([10]), // 10 + 3 + 2 = 15
    });
    const result2 = abilityCheck({
      abilityScores: standardScores,
      ability: "str",
      dc: 0,
      proficiencyBonus: 0,
      randomFn: makeRoller([10]), // 10 + 3 = 13
    });
    const winner = result1.roll.total >= result2.roll.total ? 1 : 2;
    expect(result1.roll.total).toBe(15);
    expect(result2.roll.total).toBe(13);
    expect(winner).toBe(1);
  });

  test("advantage on one side of contested check", () => {
    // Player 1 has advantage: rolls 3, 16 → keeps 16, +3 STR = 19
    // Player 2 normal: rolls 15, +2 DEX = 17
    const result1 = abilityCheck({
      abilityScores: standardScores,
      ability: "str",
      dc: 0,
      advantage: true,
      randomFn: makeRoller([3, 16]),
    });
    const result2 = abilityCheck({
      abilityScores: standardScores,
      ability: "dex",
      dc: 0,
      randomFn: makeRoller([15]),
    });
    const winner = result1.roll.total >= result2.roll.total ? 1 : 2;
    expect(result1.roll.total).toBe(19);
    expect(result2.roll.total).toBe(17);
    expect(winner).toBe(1);
  });
});
