/**
 * Dice engine for Railroaded.
 *
 * Parses standard dice notation (e.g. "2d6+3", "1d20", "4d6kh3", "2d20kl1")
 * and rolls dice with full result tracking.
 */

export interface DiceRollResult {
  /** The notation that was parsed */
  notation: string;
  /** Total result after all modifiers */
  total: number;
  /** Individual die results before keep/drop filtering */
  rolls: number[];
  /** Which rolls were kept (after kh/kl filtering) */
  kept: number[];
  /** Static modifier added to the total */
  modifier: number;
}

export interface ParsedDice {
  count: number;
  sides: number;
  modifier: number;
  keepHighest: number | null;
  keepLowest: number | null;
}

/**
 * Parse dice notation string into components.
 *
 * Supports:
 * - "d20" → 1d20
 * - "2d6" → two six-sided dice
 * - "2d6+3" → two six-sided dice plus 3
 * - "1d8-1" → one eight-sided die minus 1
 * - "4d6kh3" → four d6, keep highest 3
 * - "2d20kl1" → two d20, keep lowest 1 (disadvantage)
 */
export function parseDice(notation: string): ParsedDice {
  const cleaned = notation.toLowerCase().replace(/\s/g, "");
  const match = cleaned.match(
    /^(\d*)d(\d+)(?:(kh|kl)(\d+))?([+-]\d+)?$/
  );

  if (!match) {
    throw new Error(`Invalid dice notation: "${notation}"`);
  }

  const count = match[1] ? parseInt(match[1], 10) : 1;
  const sides = parseInt(match[2]!, 10);
  const keepType = match[3] as "kh" | "kl" | undefined;
  const keepCount = match[4] ? parseInt(match[4], 10) : null;
  const modifier = match[5] ? parseInt(match[5], 10) : 0;

  if (count < 1) throw new Error(`Dice count must be >= 1, got ${count}`);
  if (sides < 1) throw new Error(`Dice sides must be >= 1, got ${sides}`);
  if (keepCount !== null && keepCount > count) {
    throw new Error(
      `Cannot keep ${keepCount} dice when only rolling ${count}`
    );
  }
  if (keepCount !== null && keepCount < 1) {
    throw new Error(`Keep count must be >= 1, got ${keepCount}`);
  }

  return {
    count,
    sides,
    modifier,
    keepHighest: keepType === "kh" ? keepCount : null,
    keepLowest: keepType === "kl" ? keepCount : null,
  };
}

/**
 * Roll a single die with the given number of sides.
 * Returns a value from 1 to sides, inclusive.
 */
export function rollDie(sides: number): number {
  return Math.floor(Math.random() * sides) + 1;
}

/**
 * Roll dice from a parsed notation.
 * Optionally accepts a custom random function for testing.
 */
export function rollParsed(
  parsed: ParsedDice,
  randomFn?: (sides: number) => number
): DiceRollResult {
  const roller = randomFn ?? rollDie;
  const rolls: number[] = [];

  for (let i = 0; i < parsed.count; i++) {
    rolls.push(roller(parsed.sides));
  }

  let kept: number[];

  if (parsed.keepHighest !== null) {
    // Sort descending, keep the top N
    const sorted = [...rolls].sort((a, b) => b - a);
    kept = sorted.slice(0, parsed.keepHighest);
  } else if (parsed.keepLowest !== null) {
    // Sort ascending, keep the bottom N
    const sorted = [...rolls].sort((a, b) => a - b);
    kept = sorted.slice(0, parsed.keepLowest);
  } else {
    kept = [...rolls];
  }

  const total =
    kept.reduce((sum, val) => sum + val, 0) + parsed.modifier;

  return {
    notation: formatNotation(parsed),
    total,
    rolls,
    kept,
    modifier: parsed.modifier,
  };
}

/**
 * Roll dice from a notation string.
 * This is the main entry point for dice rolling.
 */
export function roll(
  notation: string,
  randomFn?: (sides: number) => number
): DiceRollResult {
  const parsed = parseDice(notation);
  return rollParsed(parsed, randomFn);
}

/**
 * Roll with advantage (2d20, keep highest).
 */
export function rollAdvantage(
  modifier: number = 0,
  randomFn?: (sides: number) => number
): DiceRollResult {
  const parsed: ParsedDice = {
    count: 2,
    sides: 20,
    modifier,
    keepHighest: 1,
    keepLowest: null,
  };
  return rollParsed(parsed, randomFn);
}

/**
 * Roll with disadvantage (2d20, keep lowest).
 */
export function rollDisadvantage(
  modifier: number = 0,
  randomFn?: (sides: number) => number
): DiceRollResult {
  const parsed: ParsedDice = {
    count: 2,
    sides: 20,
    modifier,
    keepHighest: null,
    keepLowest: 1,
  };
  return rollParsed(parsed, randomFn);
}

/**
 * Roll a standard d20 check with a modifier.
 */
export function rollD20(
  modifier: number = 0,
  randomFn?: (sides: number) => number
): DiceRollResult {
  return roll(`1d20${modifier >= 0 ? "+" : ""}${modifier}`, randomFn);
}

/**
 * Roll multiple dice expressions and sum them.
 * e.g. for "2d6+1d4+3", pass ["2d6", "1d4+3"]
 */
export function rollMultiple(
  notations: string[],
  randomFn?: (sides: number) => number
): { results: DiceRollResult[]; total: number } {
  const results = notations.map((n) => roll(n, randomFn));
  const total = results.reduce((sum, r) => sum + r.total, 0);
  return { results, total };
}

/**
 * Ability score generation: 4d6 drop lowest (keep highest 3).
 */
export function rollAbilityScore(
  randomFn?: (sides: number) => number
): DiceRollResult {
  return roll("4d6kh3", randomFn);
}

/**
 * Generate a full set of 6 ability scores.
 */
export function rollAbilityScores(
  randomFn?: (sides: number) => number
): DiceRollResult[] {
  return Array.from({ length: 6 }, () => rollAbilityScore(randomFn));
}

/**
 * Calculate ability modifier from a score.
 * modifier = floor((score - 10) / 2)
 */
export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Format a ParsedDice back into notation string.
 */
function formatNotation(parsed: ParsedDice): string {
  let s = `${parsed.count}d${parsed.sides}`;
  if (parsed.keepHighest !== null) s += `kh${parsed.keepHighest}`;
  if (parsed.keepLowest !== null) s += `kl${parsed.keepLowest}`;
  if (parsed.modifier > 0) s += `+${parsed.modifier}`;
  if (parsed.modifier < 0) s += `${parsed.modifier}`;
  return s;
}
