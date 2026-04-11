import { describe, test, expect } from "bun:test";
import {
  parseDice,
  roll,
  rollParsed,
  rollAdvantage,
  rollDisadvantage,
  rollD20,
  rollMultiple,
  rollAbilityScore,
  rollAbilityScores,
  abilityModifier,
} from "../src/engine/dice.ts";

// Deterministic roller for testing: cycles through provided values
function makeRoller(values: number[]) {
  let i = 0;
  return (_sides: number) => {
    const val = values[i % values.length]!;
    i++;
    return val;
  };
}

describe("parseDice", () => {
  test("parses simple notation: d20", () => {
    const p = parseDice("d20");
    expect(p.count).toBe(1);
    expect(p.sides).toBe(20);
    expect(p.modifier).toBe(0);
    expect(p.keepHighest).toBeNull();
    expect(p.keepLowest).toBeNull();
  });

  test("parses NdS: 2d6", () => {
    const p = parseDice("2d6");
    expect(p.count).toBe(2);
    expect(p.sides).toBe(6);
    expect(p.modifier).toBe(0);
  });

  test("parses positive modifier: 1d8+3", () => {
    const p = parseDice("1d8+3");
    expect(p.count).toBe(1);
    expect(p.sides).toBe(8);
    expect(p.modifier).toBe(3);
  });

  test("parses negative modifier: 1d6-2", () => {
    const p = parseDice("1d6-2");
    expect(p.modifier).toBe(-2);
  });

  test("parses keep highest: 4d6kh3", () => {
    const p = parseDice("4d6kh3");
    expect(p.count).toBe(4);
    expect(p.sides).toBe(6);
    expect(p.keepHighest).toBe(3);
    expect(p.keepLowest).toBeNull();
  });

  test("parses keep lowest: 2d20kl1", () => {
    const p = parseDice("2d20kl1");
    expect(p.count).toBe(2);
    expect(p.sides).toBe(20);
    expect(p.keepHighest).toBeNull();
    expect(p.keepLowest).toBe(1);
  });

  test("parses keep with modifier: 4d6kh3+2", () => {
    const p = parseDice("4d6kh3+2");
    expect(p.keepHighest).toBe(3);
    expect(p.modifier).toBe(2);
  });

  test("handles whitespace", () => {
    const p = parseDice("  2d6 + 3 ");
    expect(p.count).toBe(2);
    expect(p.sides).toBe(6);
    expect(p.modifier).toBe(3);
  });

  test("case insensitive", () => {
    const p = parseDice("2D6KH1");
    expect(p.count).toBe(2);
    expect(p.sides).toBe(6);
    expect(p.keepHighest).toBe(1);
  });

  test("throws on invalid notation", () => {
    expect(() => parseDice("abc")).toThrow("Invalid dice notation");
    expect(() => parseDice("")).toThrow("Invalid dice notation");
    expect(() => parseDice("d")).toThrow("Invalid dice notation");
  });

  test("throws when keeping more dice than rolled", () => {
    expect(() => parseDice("2d6kh5")).toThrow("Cannot keep 5 dice");
  });
});

describe("roll", () => {
  test("1d6 with fixed roller returns expected value", () => {
    const result = roll("1d6", makeRoller([4]));
    expect(result.total).toBe(4);
    expect(result.rolls).toEqual([4]);
    expect(result.kept).toEqual([4]);
    expect(result.modifier).toBe(0);
  });

  test("2d6 sums both dice", () => {
    const result = roll("2d6", makeRoller([3, 5]));
    expect(result.total).toBe(8);
    expect(result.rolls).toEqual([3, 5]);
    expect(result.kept).toEqual([3, 5]);
  });

  test("2d6+3 adds modifier", () => {
    const result = roll("2d6+3", makeRoller([3, 5]));
    expect(result.total).toBe(11);
    expect(result.modifier).toBe(3);
  });

  test("1d8-2 subtracts modifier", () => {
    const result = roll("1d8-2", makeRoller([5]));
    expect(result.total).toBe(3);
  });

  test("4d6kh3 keeps highest 3", () => {
    const result = roll("4d6kh3", makeRoller([2, 5, 3, 6]));
    expect(result.rolls).toEqual([2, 5, 3, 6]);
    expect(result.kept.sort()).toEqual([3, 5, 6].sort());
    expect(result.total).toBe(14); // 5 + 3 + 6
  });

  test("2d20kl1 keeps lowest", () => {
    const result = roll("2d20kl1", makeRoller([15, 8]));
    expect(result.rolls).toEqual([15, 8]);
    expect(result.kept).toEqual([8]);
    expect(result.total).toBe(8);
  });

  test("d20 roll is between 1 and 20", () => {
    for (let i = 0; i < 100; i++) {
      const result = roll("1d20");
      expect(result.total).toBeGreaterThanOrEqual(1);
      expect(result.total).toBeLessThanOrEqual(20);
    }
  });

  test("notation is preserved in result", () => {
    const result = roll("2d6+3", makeRoller([1, 1]));
    expect(result.notation).toBe("2d6+3");
  });
});

describe("rollAdvantage", () => {
  test("keeps highest of two d20s", () => {
    const result = rollAdvantage(0, makeRoller([7, 15]));
    expect(result.total).toBe(15);
    expect(result.rolls).toEqual([7, 15]);
    expect(result.kept).toEqual([15]);
  });

  test("adds modifier", () => {
    const result = rollAdvantage(5, makeRoller([7, 15]));
    expect(result.total).toBe(20);
  });
});

describe("rollDisadvantage", () => {
  test("keeps lowest of two d20s", () => {
    const result = rollDisadvantage(0, makeRoller([7, 15]));
    expect(result.total).toBe(7);
    expect(result.rolls).toEqual([7, 15]);
    expect(result.kept).toEqual([7]);
  });

  test("adds modifier", () => {
    const result = rollDisadvantage(3, makeRoller([7, 15]));
    expect(result.total).toBe(10);
  });
});

describe("rollD20", () => {
  test("rolls 1d20 with modifier", () => {
    const result = rollD20(5, makeRoller([12]));
    expect(result.total).toBe(17);
  });

  test("negative modifier", () => {
    const result = rollD20(-2, makeRoller([10]));
    expect(result.total).toBe(8);
  });

  test("zero modifier", () => {
    const result = rollD20(0, makeRoller([20]));
    expect(result.total).toBe(20);
  });
});

describe("rollMultiple", () => {
  test("sums multiple dice expressions", () => {
    const { results, total } = rollMultiple(
      ["2d6", "1d4+3"],
      makeRoller([3, 5, 2])
    );
    expect(results).toHaveLength(2);
    expect(results[0]!.total).toBe(8);   // 3+5
    expect(results[1]!.total).toBe(5);   // 2+3
    expect(total).toBe(13);
  });
});

describe("rollAbilityScore", () => {
  test("rolls 4d6 keep highest 3", () => {
    const result = rollAbilityScore(makeRoller([4, 3, 5, 1]));
    expect(result.rolls).toEqual([4, 3, 5, 1]);
    // Should keep 4, 3, 5 (drop the 1)
    expect(result.kept.sort()).toEqual([3, 4, 5].sort());
    expect(result.total).toBe(12);
  });
});

describe("rollAbilityScores", () => {
  test("generates 6 scores", () => {
    const scores = rollAbilityScores(makeRoller([4, 4, 4, 4]));
    expect(scores).toHaveLength(6);
    // All should be 12 (three 4s kept)
    for (const score of scores) {
      expect(score.total).toBe(12);
    }
  });
});

describe("abilityModifier", () => {
  test("standard modifiers", () => {
    expect(abilityModifier(1)).toBe(-5);
    expect(abilityModifier(3)).toBe(-4);
    expect(abilityModifier(8)).toBe(-1);
    expect(abilityModifier(9)).toBe(-1);
    expect(abilityModifier(10)).toBe(0);
    expect(abilityModifier(11)).toBe(0);
    expect(abilityModifier(12)).toBe(1);
    expect(abilityModifier(13)).toBe(1);
    expect(abilityModifier(14)).toBe(2);
    expect(abilityModifier(15)).toBe(2);
    expect(abilityModifier(16)).toBe(3);
    expect(abilityModifier(18)).toBe(4);
    expect(abilityModifier(20)).toBe(5);
  });

  test("returns 0 for undefined/NaN/Infinity scores", () => {
    expect(abilityModifier(undefined as any)).toBe(0);
    expect(abilityModifier(NaN)).toBe(0);
    expect(abilityModifier(Infinity)).toBe(0);
    expect(abilityModifier(-Infinity)).toBe(0);
  });
});

describe("rollD20 — NaN guard", () => {
  test("NaN modifier treated as 0", () => {
    const result = rollD20(NaN, makeRoller([15]));
    expect(result.total).toBe(15);
  });

  test("undefined modifier treated as 0", () => {
    const result = rollD20(undefined as any, makeRoller([12]));
    expect(result.total).toBe(12);
  });

  test("Infinity modifier treated as 0", () => {
    const result = rollD20(Infinity, makeRoller([10]));
    expect(result.total).toBe(10);
  });
});
