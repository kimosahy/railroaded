/**
 * Party matchmaker: queue management, matching algorithm, party creation.
 *
 * Matching priorities:
 * 1. Class balance — 1 tank, 1 healer, 1 DPS, 1 caster preferred
 * 2. Diverse personalities for interesting dynamics
 * 3. DM style matched to party composition
 */

import type { CharacterClass } from "../types.ts";

export interface QueueEntry {
  userId: string;
  characterId: string;
  characterClass: CharacterClass;
  characterName: string;
  personality: string;
  playstyle: string;
  role: "player" | "dm";
}

export interface MatchResult {
  players: QueueEntry[];
  dm: QueueEntry;
  balanceScore: number;
}

const PARTY_SIZE = 4;

/** Sentinel userId for parties that formed without a real DM in the queue. */
export const SYSTEM_DM_ID = "system-dm";

/**
 * Attempt to form a party from the queue.
 * Returns a MatchResult if a valid party can be formed, null otherwise.
 * If enough players are queued but no DM is available, forms the party
 * with a synthetic system-dm placeholder so players aren't blocked.
 */
export function tryMatchParty(queue: QueueEntry[]): MatchResult | null {
  const players = queue.filter((e) => e.role === "player");
  const dms = queue.filter((e) => e.role === "dm");

  if (players.length < PARTY_SIZE) {
    return null;
  }

  // Find the best party composition
  const bestParty = findBestParty(players);
  if (!bestParty) return null;

  // Pick the first available DM, or use a synthetic placeholder
  const dm: QueueEntry = dms.length > 0
    ? dms[0]!
    : {
        userId: SYSTEM_DM_ID,
        characterId: "",
        characterClass: "fighter",
        characterName: "DM",
        personality: "",
        playstyle: "",
        role: "dm",
      };

  return {
    players: bestParty.members,
    dm,
    balanceScore: bestParty.score,
  };
}

interface PartyCandidate {
  members: QueueEntry[];
  score: number;
}

/**
 * Find the best party of 4 from available players.
 * Prioritizes class balance.
 */
function findBestParty(players: QueueEntry[]): PartyCandidate | null {
  if (players.length < PARTY_SIZE) return null;

  // If we have exactly 4 or few enough to not need complex matching,
  // use a greedy approach
  if (players.length <= 8) {
    return greedyMatch(players);
  }

  // For larger queues, use the greedy approach too (fast enough for MVP)
  return greedyMatch(players);
}

/**
 * Greedy matching: fill roles one at a time.
 * Priority order: healer > tank > caster > DPS
 */
function greedyMatch(players: QueueEntry[]): PartyCandidate | null {
  const remaining = [...players];
  const selected: QueueEntry[] = [];

  // Role priorities
  const rolePriorities: { class: CharacterClass; role: string }[] = [
    { class: "cleric", role: "healer" },
    { class: "fighter", role: "tank" },
    { class: "wizard", role: "caster" },
    { class: "rogue", role: "dps" },
  ];

  // Try to fill each role
  for (const priority of rolePriorities) {
    if (selected.length >= PARTY_SIZE) break;

    const idx = remaining.findIndex(
      (p) => p.characterClass === priority.class
    );
    if (idx !== -1) {
      selected.push(remaining[idx]!);
      remaining.splice(idx, 1);
    }
  }

  // Fill remaining slots with whoever is available
  while (selected.length < PARTY_SIZE && remaining.length > 0) {
    selected.push(remaining.shift()!);
  }

  if (selected.length < PARTY_SIZE) return null;

  return {
    members: selected,
    score: calculateBalanceScore(selected),
  };
}

/**
 * Calculate a balance score for a party composition.
 * Higher = better balanced.
 * Perfect party (1 of each class) = 100.
 */
export function calculateBalanceScore(players: QueueEntry[]): number {
  let score = 0;

  const classes = players.map((p) => p.characterClass);
  const uniqueClasses = new Set(classes);

  // Unique classes bonus (25 points each)
  score += uniqueClasses.size * 25;

  // Has healer bonus
  if (classes.includes("cleric")) score += 10;

  // Has tank bonus
  if (classes.includes("fighter")) score += 5;

  // Penalty for duplicate classes
  const classCounts = new Map<string, number>();
  for (const c of classes) {
    classCounts.set(c, (classCounts.get(c) ?? 0) + 1);
  }
  for (const count of classCounts.values()) {
    if (count > 1) score -= (count - 1) * 15;
  }

  return Math.max(0, score);
}

/**
 * Get IDs of entries that were matched, for removal from queue.
 */
export function getMatchedIds(match: MatchResult): string[] {
  return [
    ...match.players.map((p) => p.userId),
    match.dm.userId,
  ];
}
