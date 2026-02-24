/**
 * Loot table rolls and item generation.
 */

import { roll } from "./dice.ts";
import type { DiceRollResult } from "./dice.ts";

export interface LootTableEntry {
  itemName: string;
  weight: number;
  quantity: number;
}

export interface LootRollResult {
  items: { itemName: string; quantity: number }[];
  roll: DiceRollResult;
}

/**
 * Roll on a loot table.
 * Weighted random selection.
 */
export function rollLootTable(
  entries: LootTableEntry[],
  randomFn?: (sides: number) => number
): LootRollResult {
  if (entries.length === 0) {
    return {
      items: [],
      roll: { notation: "0d0", total: 0, rolls: [], kept: [], modifier: 0 },
    };
  }

  const totalWeight = entries.reduce((sum, e) => sum + e.weight, 0);

  // Roll a d(totalWeight) to pick an entry
  const diceResult = roll(`1d${totalWeight}`, randomFn);
  const rollValue = diceResult.total;

  let cumulative = 0;
  for (const entry of entries) {
    cumulative += entry.weight;
    if (rollValue <= cumulative) {
      return {
        items: [{ itemName: entry.itemName, quantity: entry.quantity }],
        roll: diceResult,
      };
    }
  }

  // Fallback to last entry
  const lastEntry = entries[entries.length - 1]!;
  return {
    items: [{ itemName: lastEntry.itemName, quantity: lastEntry.quantity }],
    roll: diceResult,
  };
}
