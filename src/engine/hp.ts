/**
 * HP tracking and condition management.
 */

import type { Condition } from "../types.ts";

export interface HPState {
  current: number;
  max: number;
  temp: number;
}

/**
 * Apply damage to a character.
 * Temp HP absorbs damage first, then current HP.
 * Returns new HP state and whether the character dropped to 0.
 */
export function applyDamage(
  hp: HPState,
  damage: number
): { hp: HPState; droppedToZero: boolean } {
  if (damage <= 0) return { hp: { ...hp }, droppedToZero: false };

  let remaining = damage;
  let newTemp = hp.temp;
  let newCurrent = hp.current;

  // Temp HP absorbs first
  if (newTemp > 0) {
    if (remaining >= newTemp) {
      remaining -= newTemp;
      newTemp = 0;
    } else {
      newTemp -= remaining;
      remaining = 0;
    }
  }

  // Then current HP
  newCurrent -= remaining;
  const droppedToZero = newCurrent <= 0 && hp.current > 0;
  if (newCurrent < 0) newCurrent = 0;

  return {
    hp: { current: newCurrent, max: hp.max, temp: newTemp },
    droppedToZero,
  };
}

/**
 * Apply healing to a character.
 * Cannot exceed max HP. Does not affect temp HP.
 */
export function applyHealing(hp: HPState, amount: number): HPState {
  if (amount <= 0) return { ...hp };

  const newCurrent = Math.min(hp.current + amount, hp.max);
  return { current: newCurrent, max: hp.max, temp: hp.temp };
}

/**
 * Set temporary hit points.
 * Temp HP doesn't stack — use the higher value.
 */
export function setTempHP(hp: HPState, tempHP: number): HPState {
  return {
    current: hp.current,
    max: hp.max,
    temp: Math.max(hp.temp, tempHP),
  };
}

/**
 * Add a condition. Returns new conditions array.
 * Won't add duplicates.
 */
export function addCondition(
  conditions: Condition[],
  condition: Condition
): Condition[] {
  if (conditions.includes(condition)) return conditions;
  return [...conditions, condition];
}

/**
 * Remove a condition. Returns new conditions array.
 */
export function removeCondition(
  conditions: Condition[],
  condition: Condition
): Condition[] {
  return conditions.filter((c) => c !== condition);
}

/**
 * Check if an entity has a specific condition.
 */
export function hasCondition(
  conditions: Condition[],
  condition: Condition
): boolean {
  return conditions.includes(condition);
}

/**
 * When a character drops to 0 HP, they become unconscious.
 * Returns updated conditions.
 */
export function handleDropToZero(conditions: Condition[]): Condition[] {
  let updated = addCondition(conditions, "unconscious");
  updated = addCondition(updated, "prone");
  return updated;
}

/**
 * When a character is stabilized or regains HP from 0.
 * Removes unconscious (and prone if healed, not if stabilized).
 */
export function handleRegainFromZero(
  conditions: Condition[],
  healed: boolean
): Condition[] {
  let updated = removeCondition(conditions, "unconscious");
  // Remove dead/stable states
  updated = removeCondition(updated, "dead");
  updated = removeCondition(updated, "stable");
  // Only remove prone if actually healed (not just stabilized)
  if (healed) {
    updated = removeCondition(updated, "prone");
  }
  return updated;
}

/**
 * Calculate max HP for a character.
 * Level 1: max hit die + CON modifier
 * Each level after: average hit die + CON modifier (min 1 per level)
 */
export function calculateMaxHP(
  hitDieSides: number,
  conModifier: number,
  level: number
): number {
  // Level 1: max die roll + CON
  let hp = hitDieSides + conModifier;
  // Levels 2+: average roll (rounded up) + CON
  const averageRoll = Math.ceil(hitDieSides / 2) + 1;
  for (let i = 2; i <= level; i++) {
    hp += Math.max(averageRoll + conModifier, 1);
  }
  return Math.max(hp, 1);
}

/**
 * Calculate AC based on armor and DEX modifier.
 */
export function calculateAC(
  dexModifier: number,
  armor: { acBase: number; acDexCap: number | null } | null,
  hasShield: boolean
): number {
  let ac: number;

  if (!armor) {
    // Unarmored: 10 + DEX
    ac = 10 + dexModifier;
  } else if (armor.acDexCap === null) {
    // Heavy armor: no DEX bonus
    ac = armor.acBase;
  } else if (armor.acDexCap === 0) {
    // Medium/heavy with zero cap
    ac = armor.acBase;
  } else {
    // Light/medium armor: base + DEX (capped)
    const cappedDex = Math.min(dexModifier, armor.acDexCap);
    ac = armor.acBase + Math.max(cappedDex, 0);
  }

  if (hasShield) ac += 2;

  return ac;
}
