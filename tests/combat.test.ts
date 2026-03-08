import { describe, test, expect } from "bun:test";
import {
  rollInitiative,
  sortInitiative,
  resolveAttack,
  meleeAttackParams,
  rangedAttackParams,
  sneakAttackDice,
} from "../src/engine/combat.ts";
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

describe("rollInitiative", () => {
  test("rolls d20 + DEX modifier", () => {
    const entry = rollInitiative("p1", "Fighter", 14, "player", makeRoller([15]));
    expect(entry.initiative).toBe(17); // 15 + 2 (DEX mod)
    expect(entry.entityId).toBe("p1");
    expect(entry.type).toBe("player");
  });
});

describe("sortInitiative", () => {
  test("sorts by initiative descending", () => {
    const entries = [
      { entityId: "a", initiative: 10, dexScore: 12, name: "Alpha", type: "player" as const },
      { entityId: "b", initiative: 18, dexScore: 14, name: "Beta", type: "monster" as const },
      { entityId: "c", initiative: 14, dexScore: 10, name: "Charlie", type: "player" as const },
    ];
    const sorted = sortInitiative(entries);
    expect(sorted[0]!.entityId).toBe("b");
    expect(sorted[1]!.entityId).toBe("c");
    expect(sorted[2]!.entityId).toBe("a");
  });

  test("ties broken by DEX score", () => {
    const entries = [
      { entityId: "a", initiative: 15, dexScore: 12, name: "Alpha", type: "player" as const },
      { entityId: "b", initiative: 15, dexScore: 16, name: "Beta", type: "player" as const },
    ];
    const sorted = sortInitiative(entries);
    expect(sorted[0]!.entityId).toBe("b"); // higher DEX goes first
  });

  test("ties broken by name when DEX also ties", () => {
    const entries = [
      { entityId: "a", initiative: 15, dexScore: 14, name: "Zara", type: "player" as const },
      { entityId: "b", initiative: 15, dexScore: 14, name: "Abel", type: "player" as const },
    ];
    const sorted = sortInitiative(entries);
    expect(sorted[0]!.entityId).toBe("b"); // Abel before Zara
  });
});

describe("resolveAttack", () => {
  test("hit with damage", () => {
    const result = resolveAttack({
      attackerAbilityMod: 3,
      proficiencyBonus: 2,
      targetAC: 15,
      damageDice: "1d8",
      damageType: "slashing",
      damageAbilityMod: 3,
      randomFn: makeRoller([12, 6]), // attack: 12, damage: 6
    });
    expect(result.hit).toBe(true);
    expect(result.naturalRoll).toBe(12);
    expect(result.attackRoll.total).toBe(17); // 12 + 3 + 2
    expect(result.totalDamage).toBe(9); // 6 + 3
    expect(result.damageType).toBe("slashing");
    expect(result.critical).toBe(false);
    expect(result.fumble).toBe(false);
  });

  test("miss", () => {
    const result = resolveAttack({
      attackerAbilityMod: 3,
      proficiencyBonus: 2,
      targetAC: 20,
      damageDice: "1d8",
      damageType: "slashing",
      damageAbilityMod: 3,
      randomFn: makeRoller([10]), // 10 + 3 + 2 = 15 < 20
    });
    expect(result.hit).toBe(false);
    expect(result.totalDamage).toBe(0);
    expect(result.damage).toBeNull();
  });

  test("natural 20 = critical hit, double damage dice", () => {
    const result = resolveAttack({
      attackerAbilityMod: 3,
      proficiencyBonus: 2,
      targetAC: 30, // impossible to hit normally
      damageDice: "1d8",
      damageType: "slashing",
      damageAbilityMod: 3,
      randomFn: makeRoller([20, 4, 6]), // nat 20, damage: 2d8 = 4+6
    });
    expect(result.hit).toBe(true);
    expect(result.critical).toBe(true);
    expect(result.damage!.rolls).toHaveLength(2); // doubled dice
    expect(result.totalDamage).toBe(13); // 4+6+3
  });

  test("natural 1 = fumble, always miss", () => {
    const result = resolveAttack({
      attackerAbilityMod: 10,
      proficiencyBonus: 5,
      targetAC: 5, // trivial AC
      damageDice: "1d8",
      damageType: "slashing",
      damageAbilityMod: 3,
      randomFn: makeRoller([1]),
    });
    expect(result.hit).toBe(false);
    expect(result.fumble).toBe(true);
  });

  test("advantage on attack roll", () => {
    const result = resolveAttack({
      attackerAbilityMod: 3,
      proficiencyBonus: 2,
      targetAC: 15,
      damageDice: "1d8",
      damageType: "slashing",
      damageAbilityMod: 3,
      advantage: true,
      randomFn: makeRoller([5, 18, 7]), // advantage: 5 and 18, keeps 18. Damage: 7
    });
    expect(result.hit).toBe(true);
    expect(result.naturalRoll).toBe(18);
  });

  test("disadvantage on attack roll", () => {
    const result = resolveAttack({
      attackerAbilityMod: 3,
      proficiencyBonus: 2,
      targetAC: 15,
      damageDice: "1d8",
      damageType: "slashing",
      damageAbilityMod: 3,
      disadvantage: true,
      randomFn: makeRoller([18, 5]), // disadvantage: 18 and 5, keeps 5
    });
    expect(result.hit).toBe(false); // 5 + 5 = 10 < 15
    expect(result.naturalRoll).toBe(5);
  });

  test("bonus to hit and damage", () => {
    const result = resolveAttack({
      attackerAbilityMod: 3,
      proficiencyBonus: 2,
      targetAC: 20,
      damageDice: "1d8",
      damageType: "slashing",
      damageAbilityMod: 3,
      bonusToHit: 1, // +1 magic weapon
      bonusDamage: 1,
      randomFn: makeRoller([14, 5]), // 14 + 3 + 2 + 1 = 20 >= 20 (hit!)
    });
    expect(result.hit).toBe(true);
    expect(result.totalDamage).toBe(9); // 5 + 3 + 1
  });

  test("damage floor at 0", () => {
    const result = resolveAttack({
      attackerAbilityMod: 0,
      proficiencyBonus: 2,
      targetAC: 10,
      damageDice: "1d4",
      damageType: "bludgeoning",
      damageAbilityMod: -3,
      randomFn: makeRoller([15, 1]), // hit, damage: 1 + (-3) = -2, floored to 0
    });
    expect(result.totalDamage).toBe(0);
  });

  test("autoCrit forces critical hit on any hit (melee vs unconscious)", () => {
    const result = resolveAttack({
      attackerAbilityMod: 3,
      proficiencyBonus: 2,
      targetAC: 10,
      damageDice: "1d8",
      damageType: "slashing",
      damageAbilityMod: 3,
      autoCrit: true,
      randomFn: makeRoller([12, 4, 6]), // attack: 12 (not nat 20), damage: 2d8 = 4+6
    });
    expect(result.hit).toBe(true);
    expect(result.critical).toBe(true);
    expect(result.damage!.rolls).toHaveLength(2); // doubled dice from auto-crit
    expect(result.totalDamage).toBe(13); // 4+6+3
  });

  test("autoCrit does not force crit on miss", () => {
    const result = resolveAttack({
      attackerAbilityMod: 0,
      proficiencyBonus: 0,
      targetAC: 30,
      damageDice: "1d8",
      damageType: "slashing",
      damageAbilityMod: 3,
      autoCrit: true,
      randomFn: makeRoller([5]), // 5 + 0 + 0 = 5 < 30
    });
    expect(result.hit).toBe(false);
    expect(result.critical).toBe(false);
  });

  test("autoCrit does not override natural 1 fumble", () => {
    const result = resolveAttack({
      attackerAbilityMod: 10,
      proficiencyBonus: 5,
      targetAC: 5,
      damageDice: "1d8",
      damageType: "slashing",
      damageAbilityMod: 3,
      autoCrit: true,
      randomFn: makeRoller([1]),
    });
    expect(result.hit).toBe(false);
    expect(result.fumble).toBe(true);
    expect(result.critical).toBe(false);
  });
});

describe("meleeAttackParams", () => {
  test("STR-based weapon", () => {
    const params = meleeAttackParams(standardScores, 2, {
      damage: "1d8",
      properties: [],
      damageType: "slashing",
    });
    expect(params.attackerAbilityMod).toBe(3); // STR mod
    expect(params.damageAbilityMod).toBe(3);
    expect(params.proficiencyBonus).toBe(2);
  });

  test("finesse weapon uses better of STR/DEX", () => {
    const dexCharacter: AbilityScores = {
      str: 10, dex: 18, con: 12, int: 10, wis: 8, cha: 15,
    };
    const params = meleeAttackParams(dexCharacter, 2, {
      damage: "1d6",
      properties: ["finesse"],
      damageType: "piercing",
    });
    expect(params.attackerAbilityMod).toBe(4); // DEX mod > STR mod
  });

  test("magic bonus applied", () => {
    const params = meleeAttackParams(standardScores, 2, {
      damage: "1d8",
      properties: [],
      damageType: "slashing",
    }, 1);
    expect(params.bonusToHit).toBe(1);
    expect(params.bonusDamage).toBe(1);
  });
});

describe("rangedAttackParams", () => {
  test("uses DEX modifier", () => {
    const params = rangedAttackParams(standardScores, 2, {
      damage: "1d8",
      properties: ["ranged"],
      damageType: "piercing",
    });
    expect(params.attackerAbilityMod).toBe(2); // DEX mod
    expect(params.damageAbilityMod).toBe(2);
  });
});

describe("sneakAttackDice", () => {
  test("level 1-2 = 1d6", () => {
    expect(sneakAttackDice(1)).toBe("1d6");
    expect(sneakAttackDice(2)).toBe("1d6");
  });

  test("level 3-4 = 2d6", () => {
    expect(sneakAttackDice(3)).toBe("2d6");
    expect(sneakAttackDice(4)).toBe("2d6");
  });

  test("level 5 = 3d6", () => {
    expect(sneakAttackDice(5)).toBe("3d6");
  });
});
