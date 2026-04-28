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
  queuedAt: Date;
}

export interface MatchResult {
  players: QueueEntry[];
  dm: QueueEntry;
  balanceScore: number;
}

export const PARTY_SIZE_MIN = 4;
export const PARTY_SIZE_MAX = 20;

// Keep PARTY_SIZE as alias for backward compat (used in queue messages)
export const PARTY_SIZE = PARTY_SIZE_MIN;

/** Sentinel userId for parties that formed without a real DM in the queue. */
export const SYSTEM_DM_ID = "system-dm";

/**
 * Attempt to form a party from the queue.
 * Returns a MatchResult if a valid party can be formed, null otherwise.
 * Requires at least 1 DM + 2 players. Takes up to 20 players.
 * A real DM is always required — no system-dm fallback.
 */
export function tryMatchParty(queue: QueueEntry[]): MatchResult | null {
  const players = queue.filter((e) => e.role === "player");
  const dms = queue.filter((e) => e.role === "dm");

  // A real DM is required to form a party
  if (dms.length === 0) return null;
  if (players.length < PARTY_SIZE_MIN) return null;

  // Find the best party composition (take up to PARTY_SIZE_MAX)
  const bestParty = findBestParty(players);
  if (!bestParty) return null;

  return {
    players: bestParty.members,
    dm: dms[0]!,
    balanceScore: bestParty.score,
  };
}

interface PartyCandidate {
  members: QueueEntry[];
  score: number;
}

/**
 * Find the best party from available players.
 * Takes all queued players (up to PARTY_SIZE_MAX).
 * Prioritizes class balance for the first 4 slots, then fills remaining.
 */
function findBestParty(players: QueueEntry[]): PartyCandidate | null {
  if (players.length < PARTY_SIZE_MIN) return null;

  return greedyMatch(players);
}

/**
 * Greedy matching: fill roles one at a time.
 * Priority order: healer > tank > caster > DPS, then fill remaining up to max.
 */
function greedyMatch(players: QueueEntry[]): PartyCandidate | null {
  const remaining = [...players];
  const selected: QueueEntry[] = [];

  // Role priorities (try to fill each role first for balance)
  const rolePriorities: { class: CharacterClass; role: string }[] = [
    { class: "cleric", role: "healer" },
    { class: "fighter", role: "tank" },
    { class: "wizard", role: "caster" },
    { class: "rogue", role: "dps" },
  ];

  // Try to fill each role
  for (const priority of rolePriorities) {
    if (selected.length >= PARTY_SIZE_MAX) break;

    const idx = remaining.findIndex(
      (p) => p.characterClass === priority.class
    );
    if (idx !== -1) {
      selected.push(remaining[idx]!);
      remaining.splice(idx, 1);
    }
  }

  // Fill remaining slots with whoever is available (up to max)
  while (selected.length < PARTY_SIZE_MAX && remaining.length > 0) {
    selected.push(remaining.shift()!);
  }

  if (selected.length < PARTY_SIZE_MIN) return null;

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
 * Fallback match: uses min=2 instead of PARTY_SIZE_MIN.
 * Only called by the wait-window timer after 30s without a full-party match.
 * Does NOT call findBestParty or greedyMatch (both check PARTY_SIZE_MIN=4).
 * Instead inlines the role-priority ordering with a hard floor of 2 players.
 */
export function tryMatchPartyFallback(queue: QueueEntry[]): MatchResult | null {
  const players = queue.filter((e) => e.role === "player");
  const dms = queue.filter((e) => e.role === "dm");
  if (dms.length === 0) return null;
  if (players.length < 2) return null;  // Hard floor: never match with <2

  // Role-priority ordering mirrors greedyMatch but without the PARTY_SIZE_MIN check.
  const rolePriorities: { class: CharacterClass }[] = [
    { class: "cleric" },
    { class: "fighter" },
    { class: "wizard" },
    { class: "rogue" },
  ];
  const remaining = [...players];
  const selected: QueueEntry[] = [];
  for (const priority of rolePriorities) {
    if (selected.length >= PARTY_SIZE_MAX) break;
    const idx = remaining.findIndex((p) => p.characterClass === priority.class);
    if (idx !== -1) {
      selected.push(remaining[idx]!);
      remaining.splice(idx, 1);
    }
  }
  while (selected.length < PARTY_SIZE_MAX && remaining.length > 0) {
    selected.push(remaining.shift()!);
  }

  if (selected.length < 2) return null;
  return {
    players: selected,
    dm: dms[0]!,
    balanceScore: calculateBalanceScore(selected),
  };
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
