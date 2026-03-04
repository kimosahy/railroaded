/**
 * Character creation: race bonuses, class features, starting equipment, HP, AC.
 */

import { abilityModifier } from "../engine/dice.ts";
import { calculateMaxHP, calculateAC } from "../engine/hp.ts";
import { getMaxSpellSlots } from "../engine/spells.ts";
import { hitDieForClass, hitDieSidesForClass } from "../engine/rest.ts";
import type {
  Race,
  CharacterClass,
  AbilityScores,
  SpellSlots,
  HitDice,
  Equipment,
} from "../types.ts";

export interface CharacterSheet {
  name: string;
  race: Race;
  class: CharacterClass;
  level: number;
  xp: number;
  gold: number;
  abilityScores: AbilityScores;
  hpMax: number;
  hpCurrent: number;
  ac: number;
  spellSlots: SpellSlots;
  hitDice: HitDice;
  inventory: string[];
  equipment: Equipment;
  proficiencies: string[];
  features: string[];
  backstory: string;
  personality: string;
  playstyle: string;
}

/**
 * Apply racial ability score bonuses.
 */
export function applyRaceBonuses(scores: AbilityScores, race: Race): AbilityScores {
  const result = { ...scores };

  switch (race) {
    case "human":
      result.str += 1;
      result.dex += 1;
      result.con += 1;
      result.int += 1;
      result.wis += 1;
      result.cha += 1;
      break;
    case "elf":
      result.dex += 2;
      break;
    case "dwarf":
      result.con += 2;
      break;
    case "halfling":
      result.dex += 2;
      break;
    case "half-orc":
      result.str += 2;
      result.con += 1;
      break;
  }

  return result;
}

/**
 * Get racial features.
 */
export function racialFeatures(race: Race): string[] {
  switch (race) {
    case "human":
      return ["Extra Skill Proficiency"];
    case "elf":
      return ["Darkvision", "Trance"];
    case "dwarf":
      return ["Darkvision", "Poison Resistance"];
    case "halfling":
      return ["Lucky"];
    case "half-orc":
      return ["Relentless Endurance"];
  }
}

/**
 * Get class features at level 1.
 */
export function classFeatures(characterClass: CharacterClass, level: number): string[] {
  const features: string[] = [];

  switch (characterClass) {
    case "fighter":
      features.push("Fighting Style", "Second Wind");
      if (level >= 2) features.push("Action Surge");
      break;
    case "rogue":
      features.push("Sneak Attack", "Thieves' Cant");
      if (level >= 2) features.push("Cunning Action");
      break;
    case "cleric":
      features.push("Spellcasting", "Channel Divinity: Turn Undead");
      if (level >= 2) features.push("Channel Divinity: Preserve Life");
      break;
    case "wizard":
      features.push("Spellcasting", "Arcane Recovery");
      break;
  }

  return features;
}

/**
 * Get class proficiencies.
 */
export function classProficiencies(characterClass: CharacterClass): string[] {
  switch (characterClass) {
    case "fighter":
      return [
        "All armor", "Shields", "Simple weapons", "Martial weapons",
        "STR saves", "CON saves",
        "Athletics", "Intimidation",
      ];
    case "rogue":
      return [
        "Light armor", "Simple weapons", "Hand crossbows", "Longswords",
        "Rapiers", "Shortswords",
        "DEX saves", "INT saves",
        "Stealth", "Sleight of Hand", "Acrobatics", "Deception",
      ];
    case "cleric":
      return [
        "Light armor", "Medium armor", "Shields", "Simple weapons",
        "WIS saves", "CHA saves",
        "Medicine", "Religion",
      ];
    case "wizard":
      return [
        "Daggers", "Darts", "Slings", "Quarterstaffs", "Light crossbows",
        "INT saves", "WIS saves",
        "Arcana", "Investigation",
      ];
  }
}

/**
 * Get starting equipment for a class, adjusted for racial proficiencies.
 * Dwarves get Warhammer over Mace (martial weapon proficiency).
 * Elves get Longbow in inventory (weapon proficiency).
 * Half-Orcs get Greatsword over Longsword for fighters (STR-focused).
 */
export function startingEquipment(characterClass: CharacterClass, race?: Race): {
  equipment: Equipment;
  inventory: string[];
} {
  switch (characterClass) {
    case "fighter":
      return {
        equipment: {
          weapon: race === "half-orc" ? "Greatsword" : "Longsword",
          armor: "Chain Mail",
          shield: race === "half-orc" ? null : "Shield", // Greatsword is two-handed
        },
        inventory: ["Handaxe", "Handaxe", "Torch", "Rope (50 ft)"],
      };
    case "rogue":
      return {
        equipment: { weapon: "Shortsword", armor: "Leather Armor", shield: null },
        inventory: [
          "Dagger", "Dagger", "Thieves' Tools", "Torch",
          ...(race === "elf" ? ["Longbow"] : []),
        ],
      };
    case "cleric":
      return {
        equipment: {
          weapon: race === "dwarf" ? "Warhammer" : "Mace",
          armor: "Chain Shirt",
          shield: "Shield",
        },
        inventory: ["Torch", "Potion of Healing"],
      };
    case "wizard":
      return {
        equipment: { weapon: "Staff", armor: null, shield: null },
        inventory: [
          "Dagger", "Torch", "Scroll of Magic Missile",
          ...(race === "elf" ? ["Shortsword"] : []),
        ],
      };
  }
}

/**
 * Get AC for starting equipment of a class.
 */
function startingAC(characterClass: CharacterClass, dexMod: number, race?: Race): number {
  switch (characterClass) {
    case "fighter":
      // Chain Mail (16); Shield (+2) unless two-handed weapon (half-orc Greatsword)
      return calculateAC(dexMod, { acBase: 16, acDexCap: 0 }, race !== "half-orc");
    case "rogue":
      // Leather (11 + DEX)
      return calculateAC(dexMod, { acBase: 11, acDexCap: 99 }, false);
    case "cleric":
      // Chain Shirt (13 + DEX max 2) + Shield (+2)
      return calculateAC(dexMod, { acBase: 13, acDexCap: 2 }, true);
    case "wizard":
      // Unarmored (10 + DEX)
      return calculateAC(dexMod, null, false);
  }
}

/**
 * Create a full character sheet from input parameters.
 */
export function createCharacter(params: {
  name: string;
  race: Race;
  class: CharacterClass;
  abilityScores: AbilityScores;
  backstory?: string;
  personality?: string;
  playstyle?: string;
}): CharacterSheet {
  const level = 1;

  // Apply racial bonuses
  const finalScores = applyRaceBonuses(params.abilityScores, params.race);

  // Calculate derived stats
  const conMod = abilityModifier(finalScores.con);
  const dexMod = abilityModifier(finalScores.dex);
  const hitDieSides = hitDieSidesForClass(params.class);
  const hpMax = calculateMaxHP(hitDieSides, conMod, level);
  const ac = startingAC(params.class, dexMod, params.race);
  const spellSlots = getMaxSpellSlots(level, params.class);
  const { equipment, inventory } = startingEquipment(params.class, params.race);

  // Combine racial + class features
  const features = [
    ...racialFeatures(params.race),
    ...classFeatures(params.class, level),
  ];

  const proficiencies = classProficiencies(params.class);

  // Starting gold by class (simplified 5e averages)
  const startingGold: Record<CharacterClass, number> = {
    fighter: 15,
    rogue: 15,
    cleric: 15,
    wizard: 10,
  };

  return {
    name: params.name,
    race: params.race,
    class: params.class,
    level,
    xp: 0,
    gold: startingGold[params.class],
    abilityScores: finalScores,
    hpMax,
    hpCurrent: hpMax,
    ac,
    spellSlots,
    hitDice: {
      current: level,
      max: level,
      die: hitDieForClass(params.class),
    },
    inventory,
    equipment,
    proficiencies,
    features,
    backstory: params.backstory ?? "",
    personality: params.personality ?? "",
    playstyle: params.playstyle ?? "",
  };
}

/**
 * Validate ability scores (each 3-18 before racial bonuses, sum 60-90).
 */
export function validateAbilityScores(scores: AbilityScores): {
  valid: boolean;
  error?: string;
} {
  const values = Object.values(scores);
  for (const v of values) {
    if (v < 3 || v > 18) {
      return { valid: false, error: `Ability scores must be between 3 and 18, got ${v}` };
    }
  }
  const sum = values.reduce((a, b) => a + b, 0);
  if (sum < 60 || sum > 90) {
    return { valid: false, error: `Ability score total must be 60-90, got ${sum}` };
  }
  return { valid: true };
}
