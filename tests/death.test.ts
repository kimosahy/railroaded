import { describe, test, expect } from "bun:test";
import {
  deathSave,
  applyDeathSaveConditions,
  resetDeathSaves,
  damageAtZeroHP,
} from "../src/engine/death.ts";

function makeRoller(values: number[]) {
  let i = 0;
  return (_sides: number) => {
    const val = values[i % values.length]!;
    i++;
    return val;
  };
}

describe("deathSave", () => {
  test("roll 10+ = success", () => {
    const result = deathSave({ successes: 0, failures: 0 }, makeRoller([14]));
    expect(result.success).toBe(true);
    expect(result.deathSaves.successes).toBe(1);
    expect(result.deathSaves.failures).toBe(0);
  });

  test("roll 9- = failure", () => {
    const result = deathSave({ successes: 0, failures: 0 }, makeRoller([5]));
    expect(result.success).toBe(false);
    expect(result.deathSaves.failures).toBe(1);
  });

  test("natural 20 = revive with 1 HP", () => {
    const result = deathSave({ successes: 1, failures: 2 }, makeRoller([20]));
    expect(result.revivedWith1HP).toBe(true);
    expect(result.deathSaves.successes).toBe(0);
    expect(result.deathSaves.failures).toBe(0);
  });

  test("natural 1 = 2 failures", () => {
    const result = deathSave({ successes: 0, failures: 0 }, makeRoller([1]));
    expect(result.deathSaves.failures).toBe(2);
  });

  test("3 successes = stabilized", () => {
    const result = deathSave({ successes: 2, failures: 1 }, makeRoller([15]));
    expect(result.stabilized).toBe(true);
    expect(result.dead).toBe(false);
  });

  test("3 failures = dead", () => {
    const result = deathSave({ successes: 1, failures: 2 }, makeRoller([3]));
    expect(result.dead).toBe(true);
    expect(result.stabilized).toBe(false);
  });

  test("natural 1 can cause death from 1 failure", () => {
    const result = deathSave({ successes: 0, failures: 2 }, makeRoller([1]));
    // 2 existing + 2 from nat 1 = 4 >= 3
    expect(result.dead).toBe(true);
  });

  test("roll exactly 10 = success", () => {
    const result = deathSave({ successes: 0, failures: 0 }, makeRoller([10]));
    expect(result.success).toBe(true);
    expect(result.deathSaves.successes).toBe(1);
  });
});

describe("applyDeathSaveConditions", () => {
  test("dead → adds dead, removes unconscious", () => {
    const result = applyDeathSaveConditions(["unconscious", "prone"], {
      roll: { notation: "1d20", total: 2, rolls: [2], kept: [2], modifier: 0 },
      naturalRoll: 2,
      success: false,
      deathSaves: { successes: 0, failures: 3 },
      stabilized: false,
      dead: true,
      revivedWith1HP: false,
    });
    expect(result).toContain("dead");
    expect(result).not.toContain("unconscious");
  });

  test("stabilized → adds stable condition", () => {
    const result = applyDeathSaveConditions(["unconscious", "prone"], {
      roll: { notation: "1d20", total: 15, rolls: [15], kept: [15], modifier: 0 },
      naturalRoll: 15,
      success: true,
      deathSaves: { successes: 3, failures: 1 },
      stabilized: true,
      dead: false,
      revivedWith1HP: false,
    });
    expect(result).toContain("stable");
    expect(result).toContain("unconscious"); // still unconscious, just stable
  });

  test("revived → removes unconscious", () => {
    const result = applyDeathSaveConditions(["unconscious", "prone"], {
      roll: { notation: "1d20", total: 20, rolls: [20], kept: [20], modifier: 0 },
      naturalRoll: 20,
      success: true,
      deathSaves: { successes: 0, failures: 0 },
      stabilized: false,
      dead: false,
      revivedWith1HP: true,
    });
    expect(result).not.toContain("unconscious");
    expect(result).toContain("prone"); // still prone until they stand
  });
});

describe("resetDeathSaves", () => {
  test("resets to zeros", () => {
    const result = resetDeathSaves();
    expect(result.successes).toBe(0);
    expect(result.failures).toBe(0);
  });
});

describe("damageAtZeroHP", () => {
  test("damage causes 1 failure", () => {
    const result = damageAtZeroHP({ successes: 1, failures: 0 }, 5, 20);
    expect(result.deathSaves.failures).toBe(1);
    expect(result.instantDeath).toBe(false);
  });

  test("critical hit causes 2 failures", () => {
    const result = damageAtZeroHP({ successes: 1, failures: 0 }, 5, 20, true);
    expect(result.deathSaves.failures).toBe(2);
  });

  test("massive damage = instant death", () => {
    const result = damageAtZeroHP({ successes: 2, failures: 0 }, 25, 20);
    expect(result.instantDeath).toBe(true);
    expect(result.deathSaves.failures).toBe(3);
  });

  test("damage exactly equal to max HP = instant death", () => {
    const result = damageAtZeroHP({ successes: 0, failures: 0 }, 20, 20);
    expect(result.instantDeath).toBe(true);
  });
});
