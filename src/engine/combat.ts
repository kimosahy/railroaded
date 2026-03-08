/**
 * Combat engine: initiative, attack rolls, damage, critical hits.
 */

import { roll, abilityModifier } from "./dice.ts";
import type { DiceRollResult } from "./dice.ts";
import type { AbilityScores } from "../types.ts";

export interface InitiativeEntry {
  entityId: string;
  initiative: number;
  dexScore: number;
  name: string;
  type: "player" | "monster";
}

export interface AttackResult {
  attackRoll: DiceRollResult;
  hit: boolean;
  critical: boolean;
  naturalRoll: number;
  fumble: boolean;
  damage: DiceRollResult | null;
  totalDamage: number;
  damageType: string;
}

/**
 * Roll initiative for a combatant.
 * d20 + DEX modifier
 */
export function rollInitiative(
  entityId: string,
  name: string,
  dexScore: number,
  type: "player" | "monster",
  randomFn?: (sides: number) => number
): InitiativeEntry {
  const mod = abilityModifier(dexScore);
  const result = roll(`1d20+${mod}`, randomFn);
  return {
    entityId,
    initiative: result.total,
    dexScore,
    name,
    type,
  };
}

/**
 * Sort initiative entries: highest initiative first.
 * Ties broken by DEX score (higher goes first), then alphabetically by name.
 */
export function sortInitiative(entries: InitiativeEntry[]): InitiativeEntry[] {
  return [...entries].sort((a, b) => {
    if (a.initiative !== b.initiative) return b.initiative - a.initiative;
    if (a.dexScore !== b.dexScore) return b.dexScore - a.dexScore;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Resolve an attack roll.
 *
 * d20 + ability modifier + proficiency bonus vs target AC
 * Natural 20 = critical hit (double damage dice)
 * Natural 1 = automatic miss
 */
export function resolveAttack(params: {
  attackerAbilityMod: number;
  proficiencyBonus: number;
  targetAC: number;
  damageDice: string;
  damageType: string;
  damageAbilityMod: number;
  advantage?: boolean;
  disadvantage?: boolean;
  bonusToHit?: number;
  bonusDamage?: number;
  autoCrit?: boolean;
  randomFn?: (sides: number) => number;
}): AttackResult {
  const {
    attackerAbilityMod,
    proficiencyBonus,
    targetAC,
    damageDice,
    damageType,
    damageAbilityMod,
    advantage = false,
    disadvantage = false,
    bonusToHit = 0,
    bonusDamage = 0,
    autoCrit = false,
    randomFn,
  } = params;

  const totalAttackMod = attackerAbilityMod + proficiencyBonus + bonusToHit;

  // Roll the attack d20
  let attackRoll: DiceRollResult;
  if (advantage && !disadvantage) {
    attackRoll = roll("2d20kh1", randomFn);
  } else if (disadvantage && !advantage) {
    attackRoll = roll("2d20kl1", randomFn);
  } else {
    attackRoll = roll("1d20", randomFn);
  }

  const naturalRoll = attackRoll.kept[0]!;
  const totalAttack = naturalRoll + totalAttackMod;

  const fumble = naturalRoll === 1;
  // Natural 20 always crits; autoCrit forces crit on any hit (e.g. melee vs unconscious)
  const natural20 = naturalRoll === 20;

  // Natural 1 always misses, natural 20 always hits
  const hit = fumble ? false : natural20 ? true : totalAttack >= targetAC;
  const critical = natural20 || (autoCrit && hit);

  let damage: DiceRollResult | null = null;
  let totalDamage = 0;

  if (hit) {
    if (critical) {
      // Critical hit: double the damage dice (roll twice the number of dice)
      const parsed = parseDamageForCrit(damageDice);
      damage = roll(parsed, randomFn);
    } else {
      damage = roll(damageDice, randomFn);
    }
    totalDamage = damage.total + damageAbilityMod + bonusDamage;
    // Damage can't go below 0
    if (totalDamage < 0) totalDamage = 0;
  }

  // Attach the modifier to the attack roll result for display
  const attackResult: DiceRollResult = {
    ...attackRoll,
    total: totalAttack,
    modifier: totalAttackMod,
  };

  return {
    attackRoll: attackResult,
    hit,
    critical,
    naturalRoll,
    fumble,
    damage,
    totalDamage,
    damageType,
  };
}

/**
 * Double the dice count for critical hits.
 * "1d8" → "2d8", "2d6" → "4d6"
 * Preserves modifiers: "1d8+3" → "2d8+3"
 */
function parseDamageForCrit(notation: string): string {
  const match = notation.toLowerCase().match(/^(\d*)d(\d+)(.*)$/);
  if (!match) return notation;
  const count = match[1] ? parseInt(match[1], 10) : 1;
  return `${count * 2}d${match[2]}${match[3] ?? ""}`;
}

/**
 * Calculate melee attack parameters from a character's stats.
 */
export function meleeAttackParams(
  abilityScores: AbilityScores,
  profBonus: number,
  weapon: { damage: string; properties: string[]; damageType: string },
  magicBonus: number = 0
): {
  attackerAbilityMod: number;
  proficiencyBonus: number;
  damageDice: string;
  damageType: string;
  damageAbilityMod: number;
  bonusToHit: number;
  bonusDamage: number;
} {
  // Finesse weapons use the better of STR or DEX
  const isFinesse = weapon.properties.includes("finesse");
  const strMod = abilityModifier(abilityScores.str);
  const dexMod = abilityModifier(abilityScores.dex);
  const abilityMod = isFinesse ? Math.max(strMod, dexMod) : strMod;

  return {
    attackerAbilityMod: abilityMod,
    proficiencyBonus: profBonus,
    damageDice: weapon.damage,
    damageType: weapon.damageType,
    damageAbilityMod: abilityMod,
    bonusToHit: magicBonus,
    bonusDamage: magicBonus,
  };
}

/**
 * Calculate ranged attack parameters from a character's stats.
 */
export function rangedAttackParams(
  abilityScores: AbilityScores,
  profBonus: number,
  weapon: { damage: string; properties: string[]; damageType: string },
  magicBonus: number = 0
): {
  attackerAbilityMod: number;
  proficiencyBonus: number;
  damageDice: string;
  damageType: string;
  damageAbilityMod: number;
  bonusToHit: number;
  bonusDamage: number;
} {
  const dexMod = abilityModifier(abilityScores.dex);

  return {
    attackerAbilityMod: dexMod,
    proficiencyBonus: profBonus,
    damageDice: weapon.damage,
    damageType: weapon.damageType,
    damageAbilityMod: dexMod,
    bonusToHit: magicBonus,
    bonusDamage: magicBonus,
  };
}

/**
 * Calculate Sneak Attack extra damage dice based on rogue level.
 * Level 1-2: 1d6, Level 3-4: 2d6, Level 5: 3d6
 */
export function sneakAttackDice(rogueLevel: number): string {
  const diceCount = Math.ceil(rogueLevel / 2);
  return `${diceCount}d6`;
}
