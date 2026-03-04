/**
 * Spell casting and spell slot management.
 */

import { roll, abilityModifier } from "./dice.ts";
import type { DiceRollResult } from "./dice.ts";
import type { SpellSlots, AbilityScores, CharacterClass } from "../types.ts";

export interface SpellDefinition {
  name: string;
  level: number; // 0 = cantrip
  castingTime: "action" | "bonus_action" | "reaction";
  effect: string;
  damageOrHealing: string | null; // dice notation, e.g. "1d8"
  abilityForDamage: "str" | "dex" | "con" | "int" | "wis" | "cha" | null;
  savingThrow: "str" | "dex" | "con" | "int" | "wis" | "cha" | null;
  isHealing: boolean;
  isConcentration: boolean;
  range: "self" | "touch" | "ranged";
  classes: CharacterClass[];
}

export interface CastResult {
  spell: SpellDefinition;
  success: boolean;
  error?: string;
  roll?: DiceRollResult;
  totalEffect?: number; // total damage or healing
  remainingSlots: SpellSlots;
}

/**
 * Get max spell slots for a given caster level.
 */
export function getMaxSpellSlots(level: number, characterClass: CharacterClass): SpellSlots {
  if (characterClass !== "cleric" && characterClass !== "wizard") {
    return {
      level_1: { current: 0, max: 0 },
      level_2: { current: 0, max: 0 },
    };
  }

  const slotTable: Record<number, { l1: number; l2: number }> = {
    1: { l1: 2, l2: 0 },
    2: { l1: 3, l2: 0 },
    3: { l1: 4, l2: 2 },
    4: { l1: 4, l2: 3 },
    5: { l1: 4, l2: 3 },
  };

  const slots = slotTable[level] ?? slotTable[5]!;
  return {
    level_1: { current: slots.l1, max: slots.l1 },
    level_2: { current: slots.l2, max: slots.l2 },
  };
}

/**
 * Check if a character has a spell slot available at the given level.
 */
export function hasSpellSlot(slots: SpellSlots, spellLevel: number): boolean {
  if (spellLevel === 0) return true; // Cantrips don't use slots
  if (spellLevel === 1) return slots.level_1.current > 0;
  if (spellLevel === 2) return slots.level_2.current > 0;
  return false;
}

/**
 * Expend a spell slot.
 * Returns new spell slots or null if no slot available.
 */
export function expendSpellSlot(
  slots: SpellSlots,
  spellLevel: number
): SpellSlots | null {
  if (spellLevel === 0) return { ...slots }; // Cantrips are free

  const newSlots = {
    level_1: { ...slots.level_1 },
    level_2: { ...slots.level_2 },
  };

  if (spellLevel === 1) {
    if (newSlots.level_1.current <= 0) return null;
    newSlots.level_1.current -= 1;
  } else if (spellLevel === 2) {
    if (newSlots.level_2.current <= 0) return null;
    newSlots.level_2.current -= 1;
  } else {
    return null;
  }

  return newSlots;
}

/**
 * Cast a spell. Validates the spell slot, rolls damage/healing.
 */
export function castSpell(params: {
  spell: SpellDefinition;
  casterAbilityScores: AbilityScores;
  casterClass: CharacterClass;
  spellSlots: SpellSlots;
  randomFn?: (sides: number) => number;
  freecast?: boolean;
}): CastResult {
  const { spell, casterAbilityScores, casterClass, spellSlots, randomFn, freecast } = params;

  // Freecast (scrolls) skips class and slot checks
  let newSlots: SpellSlots;
  if (freecast) {
    newSlots = { ...spellSlots };
  } else {
    // Check class can cast this spell
    if (!spell.classes.includes(casterClass)) {
      return {
        spell,
        success: false,
        error: `${casterClass} cannot cast ${spell.name}`,
        remainingSlots: spellSlots,
      };
    }

    // Check and expend spell slot
    if (!hasSpellSlot(spellSlots, spell.level)) {
      return {
        spell,
        success: false,
        error: `No level ${spell.level} spell slots remaining`,
        remainingSlots: spellSlots,
      };
    }

    const expended = expendSpellSlot(spellSlots, spell.level);
    if (!expended) {
      return {
        spell,
        success: false,
        error: `Failed to expend spell slot`,
        remainingSlots: spellSlots,
      };
    }
    newSlots = expended;
  }

  // Roll damage or healing if applicable
  let diceResult: DiceRollResult | undefined;
  let totalEffect: number | undefined;

  if (spell.damageOrHealing) {
    diceResult = roll(spell.damageOrHealing, randomFn);
    totalEffect = diceResult.total;

    // Add ability modifier for damage/healing spells
    if (spell.abilityForDamage) {
      totalEffect += abilityModifier(casterAbilityScores[spell.abilityForDamage]);
    }

    // Can't deal negative damage or negative healing
    if (totalEffect < 0) totalEffect = 0;
  }

  return {
    spell,
    success: true,
    roll: diceResult,
    totalEffect,
    remainingSlots: newSlots,
  };
}

/**
 * Calculate spell save DC for a caster.
 * 8 + proficiency bonus + spellcasting ability modifier
 */
export function spellSaveDC(
  abilityScores: AbilityScores,
  casterClass: CharacterClass,
  profBonus: number
): number {
  const abilityKey = spellcastingAbility(casterClass);
  if (!abilityKey) return 10;
  return 8 + profBonus + abilityModifier(abilityScores[abilityKey]);
}

/**
 * Calculate spell attack bonus for a caster.
 * proficiency bonus + spellcasting ability modifier
 */
export function spellAttackBonus(
  abilityScores: AbilityScores,
  casterClass: CharacterClass,
  profBonus: number
): number {
  const abilityKey = spellcastingAbility(casterClass);
  if (!abilityKey) return 0;
  return profBonus + abilityModifier(abilityScores[abilityKey]);
}

/**
 * Get the spellcasting ability for a class.
 */
export function spellcastingAbility(
  characterClass: CharacterClass
): "int" | "wis" | null {
  if (characterClass === "wizard") return "int";
  if (characterClass === "cleric") return "wis";
  return null;
}

/**
 * Arcane Recovery: wizard recovers spell slots on short rest.
 * Can recover slots with combined level <= ceil(wizard_level / 2).
 */
export function arcaneRecovery(
  slots: SpellSlots,
  wizardLevel: number
): SpellSlots {
  const maxRecoverLevels = Math.ceil(wizardLevel / 2);
  const newSlots = {
    level_1: { ...slots.level_1 },
    level_2: { ...slots.level_2 },
  };

  let levelsRemaining = maxRecoverLevels;

  // Recover level 2 slots first (more valuable)
  while (
    levelsRemaining >= 2 &&
    newSlots.level_2.current < newSlots.level_2.max
  ) {
    newSlots.level_2.current++;
    levelsRemaining -= 2;
  }

  // Then level 1 slots
  while (
    levelsRemaining >= 1 &&
    newSlots.level_1.current < newSlots.level_1.max
  ) {
    newSlots.level_1.current++;
    levelsRemaining -= 1;
  }

  return newSlots;
}
