/**
 * Ability checks and saving throws.
 */

import { roll, rollAdvantage, rollDisadvantage, abilityModifier } from "./dice.ts";
import type { DiceRollResult } from "./dice.ts";
import type { AbilityScores, AbilityName } from "../types.ts";

export interface CheckResult {
  roll: DiceRollResult;
  modifier: number;
  proficiencyBonus: number;
  dc: number;
  success: boolean;
  margin: number; // total - dc (positive = passed by that much, negative = failed by that much)
  natural20: boolean;
  natural1: boolean;
}

/**
 * Perform an ability check.
 *
 * d20 + ability modifier + (proficiency bonus if proficient)
 * vs DC.
 */
export function abilityCheck(params: {
  abilityScores: AbilityScores;
  ability: AbilityName;
  dc: number;
  proficiencyBonus?: number;
  advantage?: boolean;
  disadvantage?: boolean;
  randomFn?: (sides: number) => number;
}): CheckResult {
  const {
    abilityScores,
    ability,
    dc,
    proficiencyBonus = 0,
    advantage = false,
    disadvantage = false,
    randomFn,
  } = params;

  const mod = abilityModifier(abilityScores[ability]);
  const totalMod = mod + proficiencyBonus;

  let diceResult: DiceRollResult;

  if (advantage && !disadvantage) {
    diceResult = rollAdvantage(totalMod, randomFn);
  } else if (disadvantage && !advantage) {
    diceResult = rollDisadvantage(totalMod, randomFn);
  } else {
    // Normal roll, or advantage + disadvantage cancel out
    diceResult = roll(`1d20${totalMod >= 0 ? "+" : ""}${totalMod}`, randomFn);
  }

  // The natural die value is in kept[0] for advantage/disadvantage,
  // or rolls[0] for normal
  const naturalRoll = diceResult.kept[0]!;
  // But we need the raw d20 result, not the total
  // For advantage/disadvantage, the kept value IS the chosen d20 result
  // For normal roll, it's rolls[0]
  const rawD20 =
    advantage || disadvantage ? diceResult.kept[0]! : diceResult.rolls[0]!;

  return {
    roll: diceResult,
    modifier: mod,
    proficiencyBonus,
    dc,
    success: diceResult.total >= dc,
    margin: diceResult.total - dc,
    natural20: rawD20 === 20,
    natural1: rawD20 === 1,
  };
}

/**
 * Perform a saving throw.
 * Mechanically identical to an ability check.
 * Natural 20 always succeeds, natural 1 always fails for saving throws.
 */
export function savingThrow(params: {
  abilityScores: AbilityScores;
  ability: AbilityName;
  dc: number;
  proficiencyBonus?: number;
  advantage?: boolean;
  disadvantage?: boolean;
  randomFn?: (sides: number) => number;
}): CheckResult {
  const result = abilityCheck(params);

  // For saving throws, nat 20 = auto-success, nat 1 = auto-fail
  if (result.natural20) {
    return { ...result, success: true };
  }
  if (result.natural1) {
    return { ...result, success: false };
  }

  return result;
}

/**
 * Perform a group check: all characters roll, majority rules.
 * Returns individual results and overall success.
 */
export function groupCheck(params: {
  characters: {
    id: string;
    abilityScores: AbilityScores;
    proficiencyBonus?: number;
  }[];
  ability: AbilityName;
  dc: number;
  advantage?: boolean;
  disadvantage?: boolean;
  randomFn?: (sides: number) => number;
}): { results: { id: string; check: CheckResult }[]; success: boolean } {
  const results = params.characters.map((char) => ({
    id: char.id,
    check: abilityCheck({
      abilityScores: char.abilityScores,
      ability: params.ability,
      dc: params.dc,
      proficiencyBonus: char.proficiencyBonus,
      advantage: params.advantage,
      disadvantage: params.disadvantage,
      randomFn: params.randomFn,
    }),
  }));

  const successes = results.filter((r) => r.check.success).length;
  const success = successes >= Math.ceil(results.length / 2);

  return { results, success };
}

/**
 * Calculate passive score for a given ability.
 * 10 + ability modifier + proficiency bonus (if proficient)
 */
export function passiveScore(
  abilityScores: AbilityScores,
  ability: AbilityName,
  proficiencyBonus: number = 0
): number {
  return 10 + abilityModifier(abilityScores[ability]) + proficiencyBonus;
}

/**
 * Get the proficiency bonus for a given character level.
 */
export function proficiencyBonus(level: number): number {
  if (level <= 4) return 2;
  if (level <= 8) return 3;
  if (level <= 12) return 4;
  if (level <= 16) return 5;
  return 6;
}
