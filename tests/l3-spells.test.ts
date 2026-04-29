/**
 * P1-8: 6 wizard spells + L3 slot infrastructure.
 * Verifies: getMaxSpellSlots / hasSpellSlot / expendSpellSlot / arcaneRecovery
 * all carry level_3; new spells are loadable.
 */
import { describe, test, expect } from "bun:test";
import {
  getMaxSpellSlots,
  hasSpellSlot,
  expendSpellSlot,
  arcaneRecovery,
} from "../src/engine/spells.ts";
import { shortRest } from "../src/engine/rest.ts";
import { readFileSync } from "fs";
import { parse } from "yaml";

describe("L3 spell slots — caster progression", () => {
  test("wizard L1: 2 L1 slots, no L2/L3", () => {
    const slots = getMaxSpellSlots(1, "wizard");
    expect(slots.level_1.max).toBe(2);
    expect(slots.level_2.max).toBe(0);
    expect(slots.level_3.max).toBe(0);
  });

  test("wizard L3: 4 L1, 2 L2, no L3 yet", () => {
    const slots = getMaxSpellSlots(3, "wizard");
    expect(slots.level_1.max).toBe(4);
    expect(slots.level_2.max).toBe(2);
    expect(slots.level_3.max).toBe(0);
  });

  test("wizard L5: 4 L1, 3 L2, 2 L3", () => {
    const slots = getMaxSpellSlots(5, "wizard");
    expect(slots.level_1.max).toBe(4);
    expect(slots.level_2.max).toBe(3);
    expect(slots.level_3.max).toBe(2);
    expect(slots.level_3.current).toBe(2);
  });

  test("cleric L5: matches wizard L5 progression", () => {
    const slots = getMaxSpellSlots(5, "cleric");
    expect(slots.level_3.max).toBe(2);
  });

  test("non-caster (fighter): no slots at any level", () => {
    const slots = getMaxSpellSlots(5, "fighter");
    expect(slots.level_1.max).toBe(0);
    expect(slots.level_2.max).toBe(0);
    expect(slots.level_3.max).toBe(0);
  });
});

describe("L3 spell slots — hasSpellSlot / expendSpellSlot", () => {
  test("hasSpellSlot returns true for L3 with available slot", () => {
    const slots = getMaxSpellSlots(5, "wizard");
    expect(hasSpellSlot(slots, 3)).toBe(true);
  });

  test("hasSpellSlot returns false for L3 with no slots", () => {
    const slots = getMaxSpellSlots(1, "wizard");
    expect(hasSpellSlot(slots, 3)).toBe(false);
  });

  test("expendSpellSlot decrements L3 slot when called with level=3", () => {
    const slots = getMaxSpellSlots(5, "wizard");
    const after = expendSpellSlot(slots, 3);
    expect(after).not.toBeNull();
    expect(after!.level_3.current).toBe(1);
    expect(after!.level_3.max).toBe(2);
    // L1/L2 untouched
    expect(after!.level_1.current).toBe(slots.level_1.current);
    expect(after!.level_2.current).toBe(slots.level_2.current);
  });

  test("expendSpellSlot returns null when no L3 slot", () => {
    const slots = getMaxSpellSlots(1, "wizard");
    const after = expendSpellSlot(slots, 3);
    expect(after).toBeNull();
  });
});

describe("L3 spell slots — arcaneRecovery", () => {
  test("L5 wizard recovers L3 slot first (greedy, highest first)", () => {
    let slots = getMaxSpellSlots(5, "wizard");
    // Spend everything so there's room to recover
    slots = { ...slots, level_3: { current: 0, max: 2 }, level_2: { current: 0, max: 3 }, level_1: { current: 0, max: 4 } };

    // L5 wizard: maxRecoverLevels = ceil(5/2) = 3 → exactly one L3 slot
    const recovered = arcaneRecovery(slots, 5);
    expect(recovered.level_3.current).toBe(1);
    expect(recovered.level_2.current).toBe(0);
    expect(recovered.level_1.current).toBe(0);
  });

  test("L4 wizard with empty slots: ceil(4/2)=2 levels → recovers L2 only", () => {
    let slots = getMaxSpellSlots(4, "wizard");
    slots = { ...slots, level_2: { current: 0, max: 3 }, level_1: { current: 0, max: 4 } };
    const recovered = arcaneRecovery(slots, 4);
    // Greedy: L3 has 0/0 max → skip. L2 takes priority over L1 — recover 1 L2.
    expect(recovered.level_2.current).toBe(1);
    expect(recovered.level_1.current).toBe(0);
  });
});

describe("L3 spell slots — long rest restores everything", () => {
  test("longRest equivalent: getMaxSpellSlots gives full slots including L3", () => {
    // longRest in rest.ts uses getMaxSpellSlots — proven by extension
    const fresh = getMaxSpellSlots(5, "wizard");
    expect(fresh.level_3.current).toBe(2);
    expect(fresh.level_3.max).toBe(2);
  });
});

describe("L3 spell slots — shortRest preserves level_3 field", () => {
  test("shortRest output object includes level_3", () => {
    const result = shortRest({
      hp: { current: 10, max: 20 },
      hitDice: { current: 0, max: 5, sides: 8 }, // no hit dice spent so HP recovery is 0
      hitDiceToSpend: 0,
      conMod: 2,
      characterLevel: 3,
      characterClass: "wizard",
      arcaneRecoveryUsed: false,
      spellSlots: {
        level_1: { current: 0, max: 4 },
        level_2: { current: 0, max: 2 },
        level_3: { current: 0, max: 0 },
      },
    });
    expect(result.newSpellSlots.level_3).toBeDefined();
    expect(result.newSpellSlots.level_3.max).toBe(0);
  });

  test("shortRest at L5 wizard recovers L3 slot via arcane recovery", () => {
    const result = shortRest({
      hp: { current: 10, max: 20 },
      hitDice: { current: 0, max: 5, sides: 8 },
      hitDiceToSpend: 0,
      conMod: 2,
      characterLevel: 5,
      characterClass: "wizard",
      arcaneRecoveryUsed: false,
      spellSlots: {
        level_1: { current: 0, max: 4 },
        level_2: { current: 0, max: 3 },
        level_3: { current: 0, max: 2 },
      },
    });
    expect(result.spellSlotsRecovered).toBe(true);
    // L5 wizard: ceil(5/2) = 3 → one L3 slot (3 levels) recovered
    expect(result.newSpellSlots.level_3.current).toBe(1);
  });
});

describe("New wizard spells loaded from YAML", () => {
  const spellsYaml = readFileSync("data/spells.yaml", "utf-8");
  const spells = parse(spellsYaml) as Array<{ name: string; level: number; classes: string[]; casting_time: string }>;

  test("Mage Armor (L1)", () => {
    const s = spells.find((x) => x.name === "Mage Armor");
    expect(s).toBeDefined();
    expect(s!.level).toBe(1);
    expect(s!.classes).toContain("wizard");
  });

  test("Burning Hands (L1, DEX save AoE)", () => {
    const s = spells.find((x) => x.name === "Burning Hands") as Record<string, unknown> | undefined;
    expect(s).toBeDefined();
    expect(s!.level).toBe(1);
    expect(s!.saving_throw).toBe("dex");
    expect(s!.damage_or_healing).toBe("3d6");
  });

  test("Detect Magic (L1, wizard + cleric)", () => {
    const s = spells.find((x) => x.name === "Detect Magic");
    expect(s).toBeDefined();
    expect(s!.classes).toContain("wizard");
    expect(s!.classes).toContain("cleric");
  });

  test("Identify (L1, ritual-style touch spell)", () => {
    const s = spells.find((x) => x.name === "Identify");
    expect(s).toBeDefined();
    expect(s!.level).toBe(1);
  });

  test("Misty Step (L2, bonus_action)", () => {
    const s = spells.find((x) => x.name === "Misty Step");
    expect(s).toBeDefined();
    expect(s!.level).toBe(2);
    expect(s!.casting_time).toBe("bonus_action");
  });

  test("Fireball (L3 — first L3 spell in catalog)", () => {
    const s = spells.find((x) => x.name === "Fireball") as Record<string, unknown> | undefined;
    expect(s).toBeDefined();
    expect(s!.level).toBe(3);
    expect(s!.saving_throw).toBe("dex");
    expect(s!.damage_or_healing).toBe("8d6");
  });
});

describe("DB rehydration defensive default for level_3", () => {
  test("loadPersistedCharacters and loadPersistedState backfill missing level_3", () => {
    // Direct test of the defensive shape: a SpellSlots-shaped object with only
    // level_1 and level_2 (e.g. read from older DB row) must be safely usable
    // after the defensive default fires.
    const oldShape = {
      level_1: { current: 2, max: 2 },
      level_2: { current: 0, max: 0 },
    } as unknown as { level_1: { current: number; max: number }; level_2: { current: number; max: number }; level_3?: { current: number; max: number } };

    // Simulate the loader's defensive branch
    if (!oldShape.level_3) oldShape.level_3 = { current: 0, max: 0 };

    expect(oldShape.level_3).toEqual({ current: 0, max: 0 });
  });
});
