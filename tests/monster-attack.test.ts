import { describe, it, expect } from "bun:test";
import { resolveAttack } from "../src/engine/combat.ts";

/**
 * Monster attack hit calculation tests.
 *
 * Monster to_hit already includes ability mod + proficiency per SRD convention.
 * resolveAttack should use: totalAttackMod = 0 + 0 + to_hit = to_hit.
 */
describe("monster attack hit calculation", () => {
  // Helper: build monster attack params with a deterministic d20 roll
  function monsterAttack(toHit: number, targetAC: number, naturalRoll: number) {
    return resolveAttack({
      attackerAbilityMod: 0,
      proficiencyBonus: 0,
      targetAC,
      damageDice: "1d6",
      damageType: "slashing",
      damageAbilityMod: 2,
      bonusToHit: toHit,
      randomFn: () => naturalRoll,
    });
  }

  it("goblin (to_hit: 4) with nat 18 vs AC 14 → hit", () => {
    const result = monsterAttack(4, 14, 18);
    expect(result.hit).toBe(true);
    expect(result.naturalRoll).toBe(18);
  });

  it("goblin (to_hit: 4) with nat 1 → miss (fumble)", () => {
    const result = monsterAttack(4, 14, 1);
    expect(result.hit).toBe(false);
    expect(result.fumble).toBe(true);
  });

  it("goblin (to_hit: 4) with nat 20 → hit (critical)", () => {
    const result = monsterAttack(4, 14, 20);
    expect(result.hit).toBe(true);
    expect(result.critical).toBe(true);
  });

  it("goblin (to_hit: 4) with nat 9 vs AC 14 → miss (9+4=13 < 14)", () => {
    const result = monsterAttack(4, 14, 9);
    expect(result.hit).toBe(false);
  });

  it("goblin (to_hit: 4) with nat 10 vs AC 14 → hit (10+4=14 >= 14)", () => {
    const result = monsterAttack(4, 14, 10);
    expect(result.hit).toBe(true);
  });
});
