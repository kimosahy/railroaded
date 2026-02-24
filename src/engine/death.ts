/**
 * Death saving throws.
 *
 * When HP hits 0, character is unconscious.
 * Each turn: d20 death save.
 * - 10+ = success
 * - 9-  = failure
 * - Natural 20 = regain 1 HP (back in the fight)
 * - Natural 1 = 2 failures
 * - 3 successes = stabilize
 * - 3 failures = dead
 */

import { roll } from "./dice.ts";
import type { DiceRollResult } from "./dice.ts";
import type { Condition, DeathSaves } from "../types.ts";
import { addCondition, removeCondition } from "./hp.ts";

export interface DeathSaveResult {
  roll: DiceRollResult;
  naturalRoll: number;
  success: boolean;
  deathSaves: DeathSaves;
  stabilized: boolean;
  dead: boolean;
  revivedWith1HP: boolean;
}

/**
 * Perform a death saving throw.
 */
export function deathSave(
  currentSaves: DeathSaves,
  randomFn?: (sides: number) => number
): DeathSaveResult {
  const diceResult = roll("1d20", randomFn);
  const naturalRoll = diceResult.rolls[0]!;

  const newSaves = { ...currentSaves };
  let revivedWith1HP = false;

  if (naturalRoll === 20) {
    // Natural 20: regain 1 HP
    revivedWith1HP = true;
    // Reset death saves
    newSaves.successes = 0;
    newSaves.failures = 0;
  } else if (naturalRoll === 1) {
    // Natural 1: 2 failures
    newSaves.failures += 2;
  } else if (naturalRoll >= 10) {
    newSaves.successes += 1;
  } else {
    newSaves.failures += 1;
  }

  const stabilized = newSaves.successes >= 3;
  const dead = newSaves.failures >= 3;

  // If stabilized, reset
  if (stabilized) {
    newSaves.successes = 3;
    newSaves.failures = Math.min(newSaves.failures, 2);
  }

  return {
    roll: diceResult,
    naturalRoll,
    success: naturalRoll >= 10,
    deathSaves: newSaves,
    stabilized,
    dead,
    revivedWith1HP,
  };
}

/**
 * Apply death save outcome to conditions.
 */
export function applyDeathSaveConditions(
  conditions: Condition[],
  result: DeathSaveResult
): Condition[] {
  let updated = [...conditions];

  if (result.dead) {
    updated = addCondition(updated, "dead");
    updated = removeCondition(updated, "unconscious");
  } else if (result.stabilized) {
    updated = addCondition(updated, "stable");
  } else if (result.revivedWith1HP) {
    updated = removeCondition(updated, "unconscious");
    updated = removeCondition(updated, "stable");
    // Still prone until they use movement to stand
  }

  return updated;
}

/**
 * Reset death saves (e.g., after being healed).
 */
export function resetDeathSaves(): DeathSaves {
  return { successes: 0, failures: 0 };
}

/**
 * Taking damage while at 0 HP causes automatic death save failures.
 * If damage >= max HP, instant death.
 */
export function damageAtZeroHP(
  currentSaves: DeathSaves,
  damage: number,
  maxHP: number,
  isCritical: boolean = false
): { deathSaves: DeathSaves; instantDeath: boolean } {
  // Massive damage: if remaining damage >= max HP, instant death
  if (damage >= maxHP) {
    return {
      deathSaves: { successes: 0, failures: 3 },
      instantDeath: true,
    };
  }

  const newSaves = { ...currentSaves };
  // Each hit is 1 failure, critical hits cause 2 failures
  newSaves.failures += isCritical ? 2 : 1;

  return {
    deathSaves: newSaves,
    instantDeath: newSaves.failures >= 3,
  };
}
