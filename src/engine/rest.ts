/**
 * Short rest and long rest mechanics.
 */

import { roll } from "./dice.ts";
import type { DiceRollResult } from "./dice.ts";
import type { SpellSlots, HitDice, CharacterClass } from "../types.ts";
import { applyHealing, type HPState } from "./hp.ts";
import { arcaneRecovery, getMaxSpellSlots } from "./spells.ts";

export interface ShortRestResult {
  hpBefore: number;
  hpAfter: number;
  hitDiceSpent: number;
  hitDiceRemaining: number;
  healingRolls: DiceRollResult[];
  totalHealing: number;
  spellSlotsRecovered: boolean;
  newSpellSlots: SpellSlots;
}

export interface LongRestResult {
  hpBefore: number;
  hpAfter: number;
  hitDiceRecovered: number;
  hitDiceTotal: number;
  newSpellSlots: SpellSlots;
}

/**
 * Short rest: spend hit dice to heal. Some features recharge.
 *
 * - Character spends hit dice (up to available)
 * - Each hit die: roll + CON modifier HP healed
 * - Wizard: Arcane Recovery (1/short rest) — recover spell slots
 * - Fighter: Second Wind and Action Surge recharge
 */
export function shortRest(params: {
  hp: HPState;
  hitDice: HitDice;
  conModifier: number;
  hitDiceToSpend: number;
  characterClass: CharacterClass;
  characterLevel: number;
  spellSlots: SpellSlots;
  arcaneRecoveryUsed?: boolean;
  randomFn?: (sides: number) => number;
}): ShortRestResult {
  const {
    hp,
    hitDice,
    conModifier,
    hitDiceToSpend,
    characterClass,
    characterLevel,
    spellSlots,
    arcaneRecoveryUsed = false,
    randomFn,
  } = params;

  // Don't spend hit dice if already at full HP
  const needsHealing = hp.current < hp.max;
  const actualDiceToSpend = needsHealing ? Math.min(hitDiceToSpend, hitDice.current) : 0;
  const healingRolls: DiceRollResult[] = [];
  let currentHP = { ...hp };
  let totalHealing = 0;
  let remainingHitDice = hitDice.current;

  for (let i = 0; i < actualDiceToSpend; i++) {
    // Stop spending if already at full HP
    if (currentHP.current >= currentHP.max) break;
    const healRoll = roll(hitDice.die, randomFn);
    const healing = Math.max(healRoll.total + conModifier, 0);
    healingRolls.push(healRoll);
    totalHealing += healing;
    currentHP = applyHealing(currentHP, healing);
    remainingHitDice--;
  }

  // Wizard arcane recovery
  let newSpellSlots = { ...spellSlots, level_1: { ...spellSlots.level_1 }, level_2: { ...spellSlots.level_2 } };
  let spellSlotsRecovered = false;

  if (characterClass === "wizard" && !arcaneRecoveryUsed) {
    newSpellSlots = arcaneRecovery(spellSlots, characterLevel);
    spellSlotsRecovered =
      newSpellSlots.level_1.current !== spellSlots.level_1.current ||
      newSpellSlots.level_2.current !== spellSlots.level_2.current;
  }

  return {
    hpBefore: hp.current,
    hpAfter: currentHP.current,
    hitDiceSpent: hitDice.current - remainingHitDice,
    hitDiceRemaining: remainingHitDice,
    healingRolls,
    totalHealing,
    spellSlotsRecovered,
    newSpellSlots,
  };
}

/**
 * Long rest: full HP, recover all spell slots, recover half spent hit dice.
 */
export function longRest(params: {
  hp: HPState;
  hitDice: HitDice;
  characterClass: CharacterClass;
  characterLevel: number;
  spellSlots: SpellSlots;
}): LongRestResult {
  const { hp, hitDice, characterClass, characterLevel } = params;

  // Restore full HP
  const newHP: HPState = { current: hp.max, max: hp.max, temp: 0 };

  // Recover half of total hit dice (minimum 1)
  const spent = hitDice.max - hitDice.current;
  const recovered = Math.max(Math.floor(hitDice.max / 2), 1);
  const actualRecovered = Math.min(recovered, spent);

  // Restore all spell slots
  const newSpellSlots = getMaxSpellSlots(characterLevel, characterClass);

  return {
    hpBefore: hp.current,
    hpAfter: newHP.current,
    hitDiceRecovered: actualRecovered,
    hitDiceTotal: hitDice.current + actualRecovered,
    newSpellSlots,
  };
}

/**
 * Get the hit die string for a class.
 */
export function hitDieForClass(characterClass: CharacterClass): string {
  switch (characterClass) {
    case "fighter":
      return "1d10";
    case "rogue":
    case "cleric":
      return "1d8";
    case "wizard":
      return "1d6";
  }
}

/**
 * Get the hit die sides for a class.
 */
export function hitDieSidesForClass(characterClass: CharacterClass): number {
  switch (characterClass) {
    case "fighter":
      return 10;
    case "rogue":
    case "cleric":
      return 8;
    case "wizard":
      return 6;
  }
}
