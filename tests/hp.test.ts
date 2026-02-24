import { describe, test, expect } from "bun:test";
import {
  applyDamage,
  applyHealing,
  setTempHP,
  addCondition,
  removeCondition,
  hasCondition,
  handleDropToZero,
  handleRegainFromZero,
  calculateMaxHP,
  calculateAC,
} from "../src/engine/hp.ts";

describe("applyDamage", () => {
  test("reduces current HP", () => {
    const result = applyDamage({ current: 20, max: 20, temp: 0 }, 8);
    expect(result.hp.current).toBe(12);
    expect(result.droppedToZero).toBe(false);
  });

  test("temp HP absorbs damage first", () => {
    const result = applyDamage({ current: 20, max: 20, temp: 5 }, 8);
    expect(result.hp.temp).toBe(0);
    expect(result.hp.current).toBe(17); // 5 absorbed by temp, 3 to current
  });

  test("partial temp HP absorption", () => {
    const result = applyDamage({ current: 20, max: 20, temp: 10 }, 6);
    expect(result.hp.temp).toBe(4);
    expect(result.hp.current).toBe(20);
  });

  test("drops to zero", () => {
    const result = applyDamage({ current: 5, max: 20, temp: 0 }, 10);
    expect(result.hp.current).toBe(0);
    expect(result.droppedToZero).toBe(true);
  });

  test("HP can't go below 0", () => {
    const result = applyDamage({ current: 5, max: 20, temp: 0 }, 100);
    expect(result.hp.current).toBe(0);
  });

  test("zero damage does nothing", () => {
    const result = applyDamage({ current: 20, max: 20, temp: 5 }, 0);
    expect(result.hp.current).toBe(20);
    expect(result.hp.temp).toBe(5);
  });

  test("already at 0 doesn't trigger droppedToZero", () => {
    const result = applyDamage({ current: 0, max: 20, temp: 0 }, 5);
    expect(result.droppedToZero).toBe(false);
  });
});

describe("applyHealing", () => {
  test("increases current HP", () => {
    const result = applyHealing({ current: 10, max: 20, temp: 0 }, 5);
    expect(result.current).toBe(15);
  });

  test("can't exceed max HP", () => {
    const result = applyHealing({ current: 18, max: 20, temp: 0 }, 10);
    expect(result.current).toBe(20);
  });

  test("zero healing does nothing", () => {
    const result = applyHealing({ current: 10, max: 20, temp: 0 }, 0);
    expect(result.current).toBe(10);
  });
});

describe("setTempHP", () => {
  test("sets temp HP", () => {
    const result = setTempHP({ current: 20, max: 20, temp: 0 }, 5);
    expect(result.temp).toBe(5);
  });

  test("uses higher value (doesn't stack)", () => {
    const result = setTempHP({ current: 20, max: 20, temp: 8 }, 5);
    expect(result.temp).toBe(8); // keeps the higher
  });

  test("replaces if new value is higher", () => {
    const result = setTempHP({ current: 20, max: 20, temp: 3 }, 8);
    expect(result.temp).toBe(8);
  });
});

describe("conditions", () => {
  test("add condition", () => {
    const result = addCondition([], "poisoned");
    expect(result).toEqual(["poisoned"]);
  });

  test("no duplicate conditions", () => {
    const result = addCondition(["poisoned"], "poisoned");
    expect(result).toEqual(["poisoned"]);
  });

  test("remove condition", () => {
    const result = removeCondition(["poisoned", "stunned"], "poisoned");
    expect(result).toEqual(["stunned"]);
  });

  test("hasCondition", () => {
    expect(hasCondition(["poisoned", "stunned"], "poisoned")).toBe(true);
    expect(hasCondition(["poisoned", "stunned"], "blinded")).toBe(false);
  });
});

describe("handleDropToZero", () => {
  test("adds unconscious and prone", () => {
    const result = handleDropToZero([]);
    expect(result).toContain("unconscious");
    expect(result).toContain("prone");
  });
});

describe("handleRegainFromZero", () => {
  test("removes unconscious when healed", () => {
    const result = handleRegainFromZero(["unconscious", "prone"], true);
    expect(result).not.toContain("unconscious");
    expect(result).not.toContain("prone");
  });

  test("keeps prone when stabilized (not healed)", () => {
    const result = handleRegainFromZero(
      ["unconscious", "prone", "stable"],
      false
    );
    expect(result).not.toContain("unconscious");
    expect(result).toContain("prone");
  });
});

describe("calculateMaxHP", () => {
  test("fighter level 1 with CON 14", () => {
    // d10 + 2 = 12
    expect(calculateMaxHP(10, 2, 1)).toBe(12);
  });

  test("wizard level 1 with CON 10", () => {
    // d6 + 0 = 6
    expect(calculateMaxHP(6, 0, 1)).toBe(6);
  });

  test("fighter level 3 with CON 14", () => {
    // Level 1: 10 + 2 = 12
    // Level 2: avg(6) + 2 = 8
    // Level 3: avg(6) + 2 = 8
    // Total: 12 + 8 + 8 = 28
    expect(calculateMaxHP(10, 2, 3)).toBe(28);
  });

  test("minimum 1 HP per level", () => {
    // Even with terrible CON
    expect(calculateMaxHP(6, -4, 2)).toBeGreaterThanOrEqual(1);
  });
});

describe("calculateAC", () => {
  test("unarmored: 10 + DEX", () => {
    expect(calculateAC(2, null, false)).toBe(12);
  });

  test("leather armor: 11 + DEX", () => {
    expect(calculateAC(3, { acBase: 11, acDexCap: 99 }, false)).toBe(14);
  });

  test("chain shirt: 13 + DEX (max 2)", () => {
    expect(calculateAC(4, { acBase: 13, acDexCap: 2 }, false)).toBe(15);
  });

  test("chain mail: 16, no DEX", () => {
    expect(calculateAC(4, { acBase: 16, acDexCap: null }, false)).toBe(16);
  });

  test("shield adds +2", () => {
    expect(calculateAC(2, { acBase: 16, acDexCap: null }, true)).toBe(18);
  });
});
