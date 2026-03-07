import { describe, test, expect } from "bun:test";
import {
  getMaxSpellSlots,
  hasSpellSlot,
  expendSpellSlot,
  castSpell,
  spellSaveDC,
  spellAttackBonus,
  spellcastingAbility,
  arcaneRecovery,
} from "../src/engine/spells.ts";
import type { SpellDefinition } from "../src/engine/spells.ts";
import type { AbilityScores, SpellSlots } from "../src/types.ts";

function makeRoller(values: number[]) {
  let i = 0;
  return (_sides: number) => {
    const val = values[i % values.length]!;
    i++;
    return val;
  };
}

const clericScores: AbilityScores = {
  str: 12, dex: 10, con: 14, int: 8, wis: 16, cha: 10,
};

const wizardScores: AbilityScores = {
  str: 8, dex: 14, con: 12, int: 18, wis: 10, cha: 10,
};

const healingWord: SpellDefinition = {
  name: "Healing Word",
  level: 1,
  castingTime: "bonus_action",
  effect: "Heal 1d4 + WIS modifier at range",
  damageOrHealing: "1d4",
  abilityForDamage: "wis",
  savingThrow: null,
  spellAttackType: null,
  isHealing: true,
  isConcentration: false,
  range: "ranged",
  classes: ["cleric"],
};

const fireBolt: SpellDefinition = {
  name: "Fire Bolt",
  level: 0,
  castingTime: "action",
  effect: "Ranged attack, 1d10 fire damage",
  damageOrHealing: "1d10",
  abilityForDamage: null,
  savingThrow: null,
  spellAttackType: "ranged",
  isHealing: false,
  isConcentration: false,
  range: "ranged",
  classes: ["wizard"],
};

const magicMissile: SpellDefinition = {
  name: "Magic Missile",
  level: 1,
  castingTime: "action",
  effect: "3 darts of 1d4+1 force damage",
  damageOrHealing: "1d4",
  abilityForDamage: null,
  savingThrow: null,
  spellAttackType: null,
  isHealing: false,
  isConcentration: false,
  range: "ranged",
  classes: ["wizard"],
};

describe("getMaxSpellSlots", () => {
  test("cleric level 1", () => {
    const slots = getMaxSpellSlots(1, "cleric");
    expect(slots.level_1.max).toBe(2);
    expect(slots.level_2.max).toBe(0);
  });

  test("wizard level 3", () => {
    const slots = getMaxSpellSlots(3, "wizard");
    expect(slots.level_1.max).toBe(4);
    expect(slots.level_2.max).toBe(2);
  });

  test("fighter has no spell slots", () => {
    const slots = getMaxSpellSlots(5, "fighter");
    expect(slots.level_1.max).toBe(0);
    expect(slots.level_2.max).toBe(0);
  });
});

describe("hasSpellSlot", () => {
  test("cantrip always available", () => {
    const slots: SpellSlots = {
      level_1: { current: 0, max: 2 },
      level_2: { current: 0, max: 0 },
    };
    expect(hasSpellSlot(slots, 0)).toBe(true);
  });

  test("level 1 slot available", () => {
    const slots: SpellSlots = {
      level_1: { current: 1, max: 2 },
      level_2: { current: 0, max: 0 },
    };
    expect(hasSpellSlot(slots, 1)).toBe(true);
  });

  test("level 1 slot exhausted", () => {
    const slots: SpellSlots = {
      level_1: { current: 0, max: 2 },
      level_2: { current: 0, max: 0 },
    };
    expect(hasSpellSlot(slots, 1)).toBe(false);
  });
});

describe("expendSpellSlot", () => {
  test("expends level 1 slot", () => {
    const slots: SpellSlots = {
      level_1: { current: 2, max: 2 },
      level_2: { current: 1, max: 1 },
    };
    const result = expendSpellSlot(slots, 1);
    expect(result).not.toBeNull();
    expect(result!.level_1.current).toBe(1);
    expect(result!.level_2.current).toBe(1); // unchanged
  });

  test("cantrip doesn't expend slot", () => {
    const slots: SpellSlots = {
      level_1: { current: 2, max: 2 },
      level_2: { current: 0, max: 0 },
    };
    const result = expendSpellSlot(slots, 0);
    expect(result).not.toBeNull();
    expect(result!.level_1.current).toBe(2); // unchanged
  });

  test("returns null if no slot available", () => {
    const slots: SpellSlots = {
      level_1: { current: 0, max: 2 },
      level_2: { current: 0, max: 0 },
    };
    expect(expendSpellSlot(slots, 1)).toBeNull();
  });
});

describe("castSpell", () => {
  test("cleric casts Healing Word", () => {
    const slots: SpellSlots = {
      level_1: { current: 2, max: 2 },
      level_2: { current: 0, max: 0 },
    };
    const result = castSpell({
      spell: healingWord,
      casterAbilityScores: clericScores,
      casterClass: "cleric",
      spellSlots: slots,
      randomFn: makeRoller([3]),
    });
    expect(result.success).toBe(true);
    expect(result.totalEffect).toBe(6); // 3 + 3 (WIS mod)
    expect(result.remainingSlots.level_1.current).toBe(1);
  });

  test("wizard casts cantrip without using slot", () => {
    const slots: SpellSlots = {
      level_1: { current: 0, max: 0 },
      level_2: { current: 0, max: 0 },
    };
    const result = castSpell({
      spell: fireBolt,
      casterAbilityScores: wizardScores,
      casterClass: "wizard",
      spellSlots: slots,
      randomFn: makeRoller([8]),
    });
    expect(result.success).toBe(true);
    expect(result.totalEffect).toBe(8);
    expect(result.remainingSlots.level_1.current).toBe(0);
  });

  test("fails when no spell slots", () => {
    const slots: SpellSlots = {
      level_1: { current: 0, max: 2 },
      level_2: { current: 0, max: 0 },
    };
    const result = castSpell({
      spell: magicMissile,
      casterAbilityScores: wizardScores,
      casterClass: "wizard",
      spellSlots: slots,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("No level 1 spell slots");
  });

  test("fails when wrong class", () => {
    const slots: SpellSlots = {
      level_1: { current: 2, max: 2 },
      level_2: { current: 0, max: 0 },
    };
    const result = castSpell({
      spell: healingWord,
      casterAbilityScores: wizardScores,
      casterClass: "wizard",
      spellSlots: slots,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("cannot cast");
  });
});

describe("spellSaveDC", () => {
  test("cleric spell DC", () => {
    // 8 + 2 (prof) + 3 (WIS mod) = 13
    expect(spellSaveDC(clericScores, "cleric", 2)).toBe(13);
  });

  test("wizard spell DC", () => {
    // 8 + 2 (prof) + 4 (INT mod) = 14
    expect(spellSaveDC(wizardScores, "wizard", 2)).toBe(14);
  });
});

describe("spellAttackBonus", () => {
  test("cleric spell attack", () => {
    // 2 (prof) + 3 (WIS mod) = 5
    expect(spellAttackBonus(clericScores, "cleric", 2)).toBe(5);
  });
});

describe("spellcastingAbility", () => {
  test("wizard = INT", () => {
    expect(spellcastingAbility("wizard")).toBe("int");
  });
  test("cleric = WIS", () => {
    expect(spellcastingAbility("cleric")).toBe("wis");
  });
  test("fighter = null", () => {
    expect(spellcastingAbility("fighter")).toBeNull();
  });
});

describe("arcaneRecovery", () => {
  test("level 1 wizard recovers 1 level of slots", () => {
    const slots: SpellSlots = {
      level_1: { current: 0, max: 2 },
      level_2: { current: 0, max: 0 },
    };
    const result = arcaneRecovery(slots, 1);
    expect(result.level_1.current).toBe(1);
  });

  test("level 3 wizard recovers level 2 first", () => {
    const slots: SpellSlots = {
      level_1: { current: 0, max: 4 },
      level_2: { current: 0, max: 2 },
    };
    // ceil(3/2) = 2 levels to recover
    // Recover 1 level 2 slot (costs 2 levels) → 0 remaining
    const result = arcaneRecovery(slots, 3);
    expect(result.level_2.current).toBe(1);
    expect(result.level_1.current).toBe(0);
  });

  test("won't exceed max slots", () => {
    const slots: SpellSlots = {
      level_1: { current: 2, max: 2 },
      level_2: { current: 0, max: 0 },
    };
    const result = arcaneRecovery(slots, 1);
    expect(result.level_1.current).toBe(2); // already at max
  });
});
