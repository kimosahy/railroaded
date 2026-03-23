/**
 * Spectator API — live tracker, journal reader, leaderboard, and tavern board.
 * These are public (no auth required).
 */

import { Hono } from "hono";
import * as gm from "../game/game-manager.ts";
import {
  summarizeSession,
  filterEventsForCharacter,
  type SessionEvent,
} from "../game/journal.ts";
import { db } from "../db/connection.ts";
import {
  narrations as narrationsTable,
  gameSessions as gameSessionsTable,
  parties as partiesTable,
  sessionEvents as sessionEventsTable,
  characters as charactersTable,
  campaigns as campaignsTable,
  journalEntries as journalEntriesTable,
  tavernPosts as tavernPostsTable,
  tavernReplies as tavernRepliesTable,
  dmStats as dmStatsTable,
  campaignTemplates as campaignTemplatesTable,
  rooms as roomsTable,
  waitlistSignups as waitlistSignupsTable,
  monsterTemplates as monsterTemplatesTable,
  users as usersTable,
} from "../db/schema.ts";
import { getModelIdentity } from "./auth.ts";
import { eq, desc, count, asc, isNotNull, max, and, inArray, sql, avg, lt } from "drizzle-orm";

const SUMMARY_FALLBACK = "Dungeon Exploration Session";

/** Sanitize a session summary for public display — strips QA/debug markers and
 *  replaces fully-debug summaries with a generic fallback. */
function sanitizeSummaryForPublic(summary: string | null): string | null {
  if (!summary) return null;
  const cleaned = gm.filterSummary(summary);
  if (!cleaned || cleaned.length < 3) return SUMMARY_FALLBACK;
  if (gm.summaryContainsDebugText(cleaned)) return SUMMARY_FALLBACK;
  return cleaned;
}

// --- Tavern Board in-memory storage ---

interface TavernReply {
  id: string;
  characterName: string;
  content: string;
  createdAt: string;
}

interface TavernPost {
  id: string;
  characterName: string;
  title: string;
  content: string;
  createdAt: string;
  replies: TavernReply[];
}

const tavernPosts = new Map<string, TavernPost>();
let tavernIdCounter = 1;

function nextTavernId(): string {
  return `tavern-${tavernIdCounter++}`;
}

// --- Spectator routes ---

const spectator = new Hono();

// GET /spectator/parties — list all active parties with member names, phase, and dungeon room
spectator.get("/parties", async (c) => {
  const state = gm.getState();
  const partyList: {
    id: string;
    name: string;
    members: { id: string; name: string; class: string; level: number; avatarUrl: string | null; description: string | null }[];
    phase: string | null;
    currentRoom: string | null;
    dmUserId: string | null;
    monsterCount: number;
  }[] = [];

  for (const [id, party] of state.parties) {

    // Skip parties with no active session — they're historical, not live
    if (!party.session) continue;

    const members = party.members.map((charId) => {
      const char = state.characters.get(charId);
      const model = char ? getModelIdentity(char.userId) : null;
      return {
        id: char?.dbCharId ?? charId,
        name: char?.name ?? "Unknown",
        class: char?.class ?? "unknown",
        level: char?.level ?? 1,
        avatarUrl: char?.avatarUrl ?? null,
        description: char?.description ?? null,
        ...(model ? { model } : {}),
      };
    });

    let currentRoom: string | null = null;
    if (party.dungeonState) {
      const roomId = party.dungeonState.currentRoomId;
      const room = party.dungeonState.rooms.get(roomId);
      currentRoom = room ? room.name : roomId;
    }

    partyList.push({
      id: party.dbPartyId ?? id,
      name: party.name,
      members,
      phase: party.session?.phase ?? null,
      currentRoom,
      dmUserId: party.dmUserId,
      monsterCount: party.monsters.length,
    });
  }

  // Live parties = in-memory only. DB parties are historical (shown in Past Sessions).
  // loadPersistedState() restores active sessions to memory on startup,
  // so anything not in memory is genuinely not running.

  return c.json({ parties: partyList });
});

// GET /spectator/parties/:id — detailed party view with recent events
spectator.get("/parties/:id", async (c) => {
  const partyId = c.req.param("id");
  const state = gm.getState();

  // Try in-memory first: by direct ID, then by dbPartyId
  let party = state.parties.get(partyId);
  if (!party) {
    for (const [, p] of state.parties) {
      if (p.dbPartyId === partyId) { party = p; break; }
    }
  }

  if (party) {
    // --- In-memory path (live session) ---
    const members = party.members.map((charId) => {
      const char = state.characters.get(charId);
      if (!char) {
        return { id: charId, name: "Unknown", class: "unknown", race: "unknown", level: 1, xp: 0, hpCurrent: 0, hpMax: 0, ac: 10, conditions: [] as string[], avatarUrl: null as string | null, description: null as string | null };
      }
      const model = getModelIdentity(char.userId);
      return { id: char.dbCharId ?? charId, name: char.name, class: char.class, race: char.race, level: char.level, xp: char.xp, hpCurrent: char.hpCurrent, hpMax: char.hpMax, ac: char.ac, conditions: char.conditions, avatarUrl: char.avatarUrl, description: char.description, ...(model ? { model } : {}) };
    });

    let currentRoom: string | null = null;
    let currentRoomDescription: string | null = null;
    if (party.dungeonState) {
      const roomId = party.dungeonState.currentRoomId;
      const room = party.dungeonState.rooms.get(roomId);
      if (room) { currentRoom = room.name; currentRoomDescription = room.description; }
      else { currentRoom = roomId; }
    }

    let recentEvents = party.events.slice(-50).map((e) => ({
      type: e.type, actorId: e.actorId, data: e.data, timestamp: e.timestamp.toISOString(),
    }));

    // Fall back to DB events if in-memory is empty but we have a DB session
    if (recentEvents.length === 0 && party.dbSessionId) {
      try {
        const rows = await db.select({
          type: sessionEventsTable.type, actorId: sessionEventsTable.actorId,
          data: sessionEventsTable.data, createdAt: sessionEventsTable.createdAt,
        }).from(sessionEventsTable)
          .where(eq(sessionEventsTable.sessionId, party.dbSessionId))
          .orderBy(asc(sessionEventsTable.createdAt)).limit(50);

        recentEvents = rows.map((r) => ({
          type: r.type, actorId: r.actorId, data: r.data, timestamp: r.createdAt.toISOString(),
        }));
      } catch (err) {
        console.error("[DB] Failed to fetch session events for party detail:", err);
      }
    }

    const sessionSummary = party.events.length > 0 ? summarizeSession(party.events) : null;

    return c.json({
      id: party.dbPartyId ?? partyId,
      name: party.name, members, dmUserId: party.dmUserId,
      phase: party.session?.phase ?? null, isActive: party.session?.isActive ?? false,
      currentRoom, currentRoomDescription,
      monsters: party.monsters.map((m) => ({ id: m.id, name: m.name, hpCurrent: m.hpCurrent, hpMax: m.hpMax, ac: m.ac })),
      recentEvents, sessionSummary, eventCount: party.events.length,
    });
  }

  // --- DB fallback path (party not live in memory) ---
  try {
    const [dbParty] = await db.select({
      id: partiesTable.id, name: partiesTable.name,
      dmUserId: partiesTable.dmUserId, status: partiesTable.status,
    }).from(partiesTable).where(eq(partiesTable.id, partyId));

    if (!dbParty) return c.json({ error: "Party not found", code: "NOT_FOUND" }, 404);

    const dbMembers = await db.select({
      id: charactersTable.id, name: charactersTable.name, class: charactersTable.class,
      race: charactersTable.race, level: charactersTable.level, xp: charactersTable.xp,
      hpCurrent: charactersTable.hpCurrent, hpMax: charactersTable.hpMax,
      ac: charactersTable.ac, conditions: charactersTable.conditions,
      avatarUrl: charactersTable.avatarUrl, description: charactersTable.description,
      modelProvider: usersTable.modelProvider, modelName: usersTable.modelName,
    }).from(charactersTable)
      .leftJoin(usersTable, eq(charactersTable.userId, usersTable.id))
      .where(eq(charactersTable.partyId, partyId));

    // Get latest session for this party
    const [latestSession] = await db.select({
      id: gameSessionsTable.id, phase: gameSessionsTable.phase,
      isActive: gameSessionsTable.isActive, summary: gameSessionsTable.summary,
    }).from(gameSessionsTable)
      .where(eq(gameSessionsTable.partyId, partyId))
      .orderBy(desc(gameSessionsTable.startedAt)).limit(1);

    // Get recent events from latest session
    let recentEvents: { type: string; actorId: string | null; data: Record<string, unknown>; timestamp: string }[] = [];
    if (latestSession) {
      const eventRows = await db.select({
        type: sessionEventsTable.type, actorId: sessionEventsTable.actorId,
        data: sessionEventsTable.data, createdAt: sessionEventsTable.createdAt,
      }).from(sessionEventsTable)
        .where(eq(sessionEventsTable.sessionId, latestSession.id))
        .orderBy(asc(sessionEventsTable.createdAt)).limit(50);

      recentEvents = eventRows.map((r) => ({
        type: r.type, actorId: r.actorId, data: r.data, timestamp: r.createdAt.toISOString(),
      }));
    }

    return c.json({
      id: dbParty.id,
      name: dbParty.name ?? "Unknown Party",
      members: dbMembers.map((m) => ({
        id: m.id, name: m.name, class: m.class, race: m.race,
        level: m.level, xp: m.xp, hpCurrent: m.hpCurrent, hpMax: m.hpMax,
        ac: m.ac, conditions: m.conditions,
        avatarUrl: m.avatarUrl ?? null, description: m.description ?? null,
        ...(m.modelProvider && m.modelName ? { model: { provider: m.modelProvider, name: m.modelName } } : {}),
      })),
      dmUserId: dbParty.dmUserId ?? null,
      phase: latestSession?.isActive ? latestSession.phase : dbParty.status,
      isActive: latestSession?.isActive ?? false,
      currentRoom: null, currentRoomDescription: null,
      monsters: [],
      recentEvents,
      sessionSummary: sanitizeSummaryForPublic(latestSession?.summary ?? null),
      eventCount: recentEvents.length,
    });
  } catch (err) {
    console.error("[DB] Failed to fetch party from DB:", err);
    return c.json({ error: "Party not found", code: "NOT_FOUND" }, 404);
  }
});

// GET /spectator/journals — adventure journal entries (session summaries) from all parties
spectator.get("/journals", async (c) => {
  const state = gm.getState();
  const journals: {
    partyId: string;
    partyName: string;
    memberNames: string[];
    summary: string;
    eventCount: number;
  }[] = [];

  // Track DB IDs of in-memory parties already included
  const knownDbIds = new Set<string>();

  for (const [partyId, party] of state.parties) {
    if (party.events.length === 0) continue;
    if (party.dbPartyId) knownDbIds.add(party.dbPartyId);

    const memberNames = party.members.map((charId) => {
      const char = state.characters.get(charId);
      return char?.name ?? "Unknown";
    });

    const summary = summarizeSession(party.events);
    journals.push({
      partyId: party.dbPartyId ?? partyId,
      partyName: party.name,
      memberNames,
      summary,
      eventCount: party.events.length,
    });
  }

  // Fall back to DB — journal entries per character, grouped by session/party
  try {
    const dbEntries = await db.select({
      partyId: gameSessionsTable.partyId,
      partyName: partiesTable.name,
      content: journalEntriesTable.content,
      characterName: charactersTable.name,
      sessionId: journalEntriesTable.sessionId,
    })
      .from(journalEntriesTable)
      .innerJoin(charactersTable, eq(journalEntriesTable.characterId, charactersTable.id))
      .innerJoin(gameSessionsTable, eq(journalEntriesTable.sessionId, gameSessionsTable.id))
      .innerJoin(partiesTable, eq(gameSessionsTable.partyId, partiesTable.id))
      .orderBy(desc(journalEntriesTable.createdAt));

    // Group by partyId
    const byParty = new Map<string, { partyName: string; memberNames: Set<string>; entries: string[] }>();
    for (const row of dbEntries) {
      if (knownDbIds.has(row.partyId)) continue;
      let group = byParty.get(row.partyId);
      if (!group) {
        group = { partyName: row.partyName ?? "Unknown Party", memberNames: new Set(), entries: [] };
        byParty.set(row.partyId, group);
      }
      group.memberNames.add(row.characterName);
      group.entries.push(row.content);
    }

    for (const [pid, group] of byParty) {
      journals.push({
        partyId: pid,
        partyName: group.partyName,
        memberNames: [...group.memberNames],
        summary: group.entries.slice(0, 5).join("\n"),
        eventCount: group.entries.length,
      });
    }
  } catch (err) {
    console.error("[DB] Failed to fetch journal entries:", err);
  }

  return c.json({ journals });
});

// GET /spectator/journals/:characterId — events filtered for a specific character
spectator.get("/journals/:characterId", async (c) => {
  const characterId = c.req.param("characterId");
  const state = gm.getState();

  // Try in-memory first (by ID or dbCharId)
  let character = state.characters.get(characterId);
  if (!character) {
    for (const [, ch] of state.characters) {
      if (ch.dbCharId === characterId) { character = ch; break; }
    }
  }

  if (character) {
    // In-memory path
    let partyEvents: SessionEvent[] = [];
    if (character.partyId) {
      const party = state.parties.get(character.partyId);
      if (party) partyEvents = party.events;
    } else {
      for (const [, party] of state.parties) {
        if (party.members.includes(characterId)) { partyEvents = party.events; break; }
      }
    }

    const filtered = filterEventsForCharacter(partyEvents, characterId);
    const summary = summarizeSession(filtered);

    return c.json({
      characterId: character.dbCharId ?? characterId,
      characterName: character.name, class: character.class,
      race: character.race, level: character.level,
      eventCount: filtered.length, summary,
      events: filtered.map((e) => ({
        type: e.type, actorId: e.actorId, data: e.data, timestamp: e.timestamp.toISOString(),
      })),
    });
  }

  // DB fallback
  try {
    const [dbChar] = await db.select({
      id: charactersTable.id, name: charactersTable.name, class: charactersTable.class,
      race: charactersTable.race, level: charactersTable.level, partyId: charactersTable.partyId,
    }).from(charactersTable).where(eq(charactersTable.id, characterId));

    if (!dbChar) return c.json({ error: "Character not found", code: "NOT_FOUND" }, 404);

    // Try journal_entries first
    const journalRows = await db.select({
      content: journalEntriesTable.content,
      createdAt: journalEntriesTable.createdAt,
    }).from(journalEntriesTable)
      .where(eq(journalEntriesTable.characterId, characterId))
      .orderBy(desc(journalEntriesTable.createdAt));

    if (journalRows.length > 0) {
      return c.json({
        characterId, characterName: dbChar.name, class: dbChar.class,
        race: dbChar.race, level: dbChar.level,
        eventCount: journalRows.length,
        summary: journalRows.map((r) => r.content).slice(0, 5).join("\n"),
        events: journalRows.map((r) => ({
          type: "journal_entry", actorId: characterId,
          data: { content: r.content }, timestamp: r.createdAt.toISOString(),
        })),
      });
    }

    // Fall back to session_events where actorId matches
    const eventRows = await db.select({
      type: sessionEventsTable.type, actorId: sessionEventsTable.actorId,
      data: sessionEventsTable.data, createdAt: sessionEventsTable.createdAt,
    }).from(sessionEventsTable)
      .where(eq(sessionEventsTable.actorId, characterId))
      .orderBy(asc(sessionEventsTable.createdAt)).limit(200);

    const asEvents: SessionEvent[] = eventRows.map((r) => ({
      type: r.type, actorId: r.actorId, data: r.data, timestamp: r.createdAt,
    }));
    const summary = summarizeSession(asEvents);

    return c.json({
      characterId, characterName: dbChar.name, class: dbChar.class,
      race: dbChar.race, level: dbChar.level,
      eventCount: eventRows.length, summary,
      events: eventRows.map((r) => ({
        type: r.type, actorId: r.actorId, data: r.data, timestamp: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[DB] Failed to fetch character journal:", err);
    return c.json({ error: "Character not found", code: "NOT_FOUND" }, 404);
  }
});

// GET /spectator/leaderboard — computed from characters in game state + DB
spectator.get("/leaderboard", async (c) => {
  const state = gm.getState();

  interface LeaderboardEntry {
    id: string;
    name: string;
    class: string;
    race: string;
    level: number;
    xp: number;
    avatarUrl: string | null;
    description: string | null;
    monstersKilled: number;
    dungeonsCleared: number;
    sessionsPlayed: number;
    totalDamageDealt: number;
    criticalHits: number;
    timesKnockedOut: number;
    goldEarned: number;
    model?: { provider: string; name: string } | null;
  }

  // Merge in-memory + DB characters (dedup by DB id)
  const charMap = new Map<string, LeaderboardEntry>();
  for (const [id, char] of state.characters) {
    const model = getModelIdentity(char.userId);
    charMap.set(char.dbCharId ?? id, {
      id: char.dbCharId ?? id, name: char.name,
      class: char.class, race: char.race, level: char.level, xp: char.xp,
      avatarUrl: char.avatarUrl, description: char.description,
      monstersKilled: char.monstersKilled ?? 0, dungeonsCleared: char.dungeonsCleared ?? 0,
      sessionsPlayed: char.sessionsPlayed ?? 0, totalDamageDealt: char.totalDamageDealt ?? 0,
      criticalHits: char.criticalHits ?? 0, timesKnockedOut: char.timesKnockedOut ?? 0,
      goldEarned: char.goldEarned ?? 0,
      ...(model ? { model } : {}),
    });
  }

  let dbTotalCharacters = charMap.size;
  let dbTotalParties = state.parties.size;

  try {
    const dbChars = await db.select({
      id: charactersTable.id, name: charactersTable.name,
      class: charactersTable.class, race: charactersTable.race,
      level: charactersTable.level, xp: charactersTable.xp,
      avatarUrl: charactersTable.avatarUrl, description: charactersTable.description,
      monstersKilled: charactersTable.monstersKilled,
      dungeonsCleared: charactersTable.dungeonsCleared,
      sessionsPlayed: charactersTable.sessionsPlayed,
      totalDamageDealt: charactersTable.totalDamageDealt,
      criticalHits: charactersTable.criticalHits,
      timesKnockedOut: charactersTable.timesKnockedOut,
      goldEarned: charactersTable.goldEarned,
    }).from(charactersTable);

    for (const ch of dbChars) {
      if (!charMap.has(ch.id)) {
        charMap.set(ch.id, {
          ...ch,
          avatarUrl: ch.avatarUrl ?? null,
          description: ch.description ?? null,
        });
      }
    }
    dbTotalCharacters = charMap.size;
  } catch (err) {
    console.error("[DB] Full leaderboard query failed, trying core columns:", err);
    // Fallback: query only core columns (matches /spectator/characters query)
    // Stat columns may not exist if migrations were partially applied
    try {
      const coreChars = await db.select({
        id: charactersTable.id, name: charactersTable.name,
        class: charactersTable.class, race: charactersTable.race,
        level: charactersTable.level, xp: charactersTable.xp,
        avatarUrl: charactersTable.avatarUrl, description: charactersTable.description,
      }).from(charactersTable);

      for (const ch of coreChars) {
        if (!charMap.has(ch.id)) {
          charMap.set(ch.id, {
            id: ch.id, name: ch.name, class: ch.class, race: ch.race,
            level: ch.level, xp: ch.xp,
            avatarUrl: ch.avatarUrl ?? null, description: ch.description ?? null,
            monstersKilled: 0, dungeonsCleared: 0, sessionsPlayed: 0,
            totalDamageDealt: 0, criticalHits: 0, timesKnockedOut: 0, goldEarned: 0,
          });
        }
      }
      dbTotalCharacters = charMap.size;
    } catch (coreErr) {
      console.error("[DB] Core leaderboard query also failed:", coreErr);
    }
  }

  try {
    const [partyCountRow] = await db.select({ total: count() }).from(partiesTable);
    dbTotalParties = Math.max(dbTotalParties, Number(partyCountRow?.total ?? 0));
  } catch (err) {
    console.error("[DB] Failed to fetch DB party count for leaderboard:", err);
  }

  const allChars = [...charMap.values()];

  const highestLevel = [...allChars]
    .sort((a, b) => b.level - a.level || b.xp - a.xp)
    .slice(0, 10);

  const mostXP = [...allChars]
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 10);

  // Parties: in-memory for live data, DB for sessionCount
  interface PartyLeaderboardEntry {
    id: string;
    name: string;
    memberNames: string[];
    memberCount: number;
    eventCount: number;
    phase: string | null;
  }

  const partyMap = new Map<string, PartyLeaderboardEntry>();
  for (const [partyId, party] of state.parties) {
    const memberNames = party.members.map((charId) => {
      const char = state.characters.get(charId);
      return char?.name ?? "Unknown";
    });
    partyMap.set(party.dbPartyId ?? partyId, {
      id: party.dbPartyId ?? partyId, name: party.name,
      memberNames, memberCount: party.members.length,
      eventCount: party.events.length, phase: party.session?.phase ?? null,
    });
  }

  try {
    const dbParties = await db.select({
      id: partiesTable.id, name: partiesTable.name,
      sessionCount: partiesTable.sessionCount, status: partiesTable.status,
    }).from(partiesTable);

    const dbCharsForParties = await db.select({
      name: charactersTable.name, partyId: charactersTable.partyId,
    }).from(charactersTable).where(isNotNull(charactersTable.partyId));

    const namesByParty = new Map<string, string[]>();
    for (const ch of dbCharsForParties) {
      const list = namesByParty.get(ch.partyId!) ?? [];
      list.push(ch.name);
      namesByParty.set(ch.partyId!, list);
    }

    for (const dbParty of dbParties) {
      if (partyMap.has(dbParty.id)) continue;
      partyMap.set(dbParty.id, {
        id: dbParty.id, name: dbParty.name ?? "Unknown Party",
        memberNames: namesByParty.get(dbParty.id) ?? [],
        memberCount: (namesByParty.get(dbParty.id) ?? []).length,
        eventCount: dbParty.sessionCount, phase: dbParty.status,
      });
    }
  } catch (err) {
    console.error("[DB] Failed to fetch DB parties for leaderboard:", err);
  }

  const longestParties = [...partyMap.values()]
    .sort((a, b) => b.eventCount - a.eventCount)
    .slice(0, 10);

  // Dungeons Cleared leaderboard
  const dungeons_cleared = [...allChars]
    .filter((c) => c.dungeonsCleared > 0)
    .sort((a, b) => b.dungeonsCleared - a.dungeonsCleared || b.level - a.level)
    .slice(0, 10)
    .map((c) => ({
      name: c.name, class: c.class, race: c.race,
      level: c.level, dungeons_cleared: c.dungeonsCleared,
      avatarUrl: c.avatarUrl, description: c.description,
      monstersKilled: c.monstersKilled,
    }));

  // Best DMs leaderboard
  let best_dms: { name: string; sessions: number; dungeons_completed: number; parties_led: number; encounters_run: number; rating: number; style: string }[] = [];
  try {
    const dmStatsRows = await db.select().from(dmStatsTable)
      .orderBy(desc(dmStatsTable.sessionsAsDM))
      .limit(10);

    best_dms = dmStatsRows.map((dm) => ({
      name: dm.username,
      sessions: dm.sessionsAsDM,
      dungeons_completed: dm.dungeonsCompletedAsDM,
      parties_led: dm.totalPartiesLed,
      encounters_run: dm.totalEncountersRun,
      rating: 0,
      style: "",
    }));
  } catch (err) {
    console.error("[DB] Failed to fetch DM stats for leaderboard:", err);
  }

  return c.json({
    leaderboards: { highestLevel, mostXP, longestParties, dungeons_cleared, best_dms },
    totalCharacters: dbTotalCharacters,
    totalParties: dbTotalParties,
  });
});

// --- Character List & Sheet ---

// GET /spectator/characters — list all characters (summary view for Tavern page)
spectator.get("/characters", async (c) => {
  const state = gm.getState();

  interface CharacterSummary {
    id: string;
    name: string;
    class: string;
    race: string;
    level: number;
    xp: number;
    gold: number;
    avatarUrl: string | null;
    description: string | null;
    isAlive: boolean;
    monstersKilled: number;
    dungeonsCleared: number;
    sessionsPlayed: number;
  }

  // Merge in-memory + DB characters (dedup by DB id)
  const charMap = new Map<string, CharacterSummary>();
  for (const [id, char] of state.characters) {
    charMap.set(char.dbCharId ?? id, {
      id: char.dbCharId ?? id,
      name: char.name, class: char.class, race: char.race,
      level: char.level, xp: char.xp, gold: char.gold,
      avatarUrl: char.avatarUrl, description: char.description,
      isAlive: char.isAlive !== false,
      monstersKilled: char.monstersKilled ?? 0,
      dungeonsCleared: char.dungeonsCleared ?? 0,
      sessionsPlayed: char.sessionsPlayed ?? 0,
    });
  }

  try {
    const dbChars = await db.select({
      id: charactersTable.id,
      name: charactersTable.name,
      class: charactersTable.class,
      race: charactersTable.race,
      level: charactersTable.level,
      xp: charactersTable.xp,
      gold: charactersTable.gold,
      avatarUrl: charactersTable.avatarUrl,
      description: charactersTable.description,
      isAlive: charactersTable.isAlive,
      monstersKilled: charactersTable.monstersKilled,
      dungeonsCleared: charactersTable.dungeonsCleared,
      sessionsPlayed: charactersTable.sessionsPlayed,
    }).from(charactersTable);

    for (const ch of dbChars) {
      if (!charMap.has(ch.id)) {
        charMap.set(ch.id, {
          id: ch.id,
          name: ch.name, class: ch.class, race: ch.race,
          level: ch.level, xp: ch.xp, gold: ch.gold ?? 0,
          avatarUrl: ch.avatarUrl ?? null, description: ch.description ?? null,
          isAlive: ch.isAlive,
          monstersKilled: ch.monstersKilled ?? 0,
          dungeonsCleared: ch.dungeonsCleared ?? 0,
          sessionsPlayed: ch.sessionsPlayed ?? 0,
        });
      }
    }
  } catch (err) {
    console.error("[DB] Failed to fetch characters for list:", err);
  }

  // Sort by level desc, then XP desc
  const characters = Array.from(charMap.values()).sort((a, b) =>
    b.level - a.level || b.xp - a.xp
  );

  return c.json({ characters });
});

// GET /spectator/characters/:id — full character sheet for spectators
spectator.get("/characters/:id", async (c) => {
  const characterId = c.req.param("id");
  const state = gm.getState();

  // Try in-memory first (by ID or dbCharId)
  let char = state.characters.get(characterId);
  if (!char) {
    for (const [, ch] of state.characters) {
      if (ch.dbCharId === characterId) { char = ch; break; }
    }
  }

  if (char) {
    return c.json({
      id: char.dbCharId ?? characterId,
      name: char.name, race: char.race, class: char.class,
      level: char.level, xp: char.xp, gold: char.gold,
      hpCurrent: char.hpCurrent, hpMax: char.hpMax, ac: char.ac,
      abilityScores: char.abilityScores,
      spellSlots: char.spellSlots,
      inventory: char.inventory, equipment: char.equipment,
      proficiencies: char.proficiencies, features: char.features,
      conditions: char.conditions,
      backstory: char.backstory, personality: char.personality,
      avatarUrl: char.avatarUrl, description: char.description,
      monstersKilled: char.monstersKilled ?? 0,
      dungeonsCleared: char.dungeonsCleared ?? 0,
      sessionsPlayed: char.sessionsPlayed ?? 0,
      totalDamageDealt: char.totalDamageDealt ?? 0,
      criticalHits: char.criticalHits ?? 0,
      timesKnockedOut: char.timesKnockedOut ?? 0,
      goldEarned: char.goldEarned ?? 0,
    });
  }

  // DB fallback
  try {
    const [row] = await db.select().from(charactersTable).where(eq(charactersTable.id, characterId));
    if (!row) return c.json({ error: "Character not found", code: "NOT_FOUND" }, 404);

    return c.json({
      id: row.id,
      name: row.name, race: row.race, class: row.class,
      level: row.level, xp: row.xp, gold: row.gold ?? 0,
      hpCurrent: row.hpCurrent, hpMax: row.hpMax, ac: row.ac,
      abilityScores: row.abilityScores,
      spellSlots: row.spellSlots,
      inventory: row.inventory, equipment: row.equipment,
      proficiencies: row.proficiencies, features: row.features,
      conditions: row.conditions,
      backstory: row.backstory, personality: row.personality,
      avatarUrl: row.avatarUrl ?? null, description: row.description ?? null,
      monstersKilled: row.monstersKilled ?? 0,
      dungeonsCleared: row.dungeonsCleared ?? 0,
      sessionsPlayed: row.sessionsPlayed ?? 0,
      totalDamageDealt: row.totalDamageDealt ?? 0,
      criticalHits: row.criticalHits ?? 0,
      timesKnockedOut: row.timesKnockedOut ?? 0,
      goldEarned: row.goldEarned ?? 0,
    });
  } catch (err) {
    console.error("[DB] Failed to fetch character:", err);
    return c.json({ error: "Character not found", code: "NOT_FOUND" }, 404);
  }
});

// --- Homepage Stats ---

// GET /spectator/stats — aggregate counts for the homepage "World So Far" section.
// Each query is isolated so one table failure doesn't zero out all stats.
spectator.get("/stats", async (c) => {
  let totalSessions = 0;
  let totalCharacters = 0;
  let totalEvents = 0;
  let totalNarrations = 0;
  let highestLevel = 0;
  let totalParties = 0;

  const queries = [
    async () => {
      const [row] = await db.select({ total: count() }).from(gameSessionsTable);
      totalSessions = Number(row?.total ?? 0);
    },
    async () => {
      const [row] = await db.select({ total: count() }).from(charactersTable);
      totalCharacters = Number(row?.total ?? 0);
    },
    async () => {
      const [row] = await db.select({ total: count() }).from(sessionEventsTable);
      totalEvents = Number(row?.total ?? 0);
    },
    async () => {
      const [row] = await db.select({ total: count() }).from(narrationsTable);
      totalNarrations = Number(row?.total ?? 0);
    },
    async () => {
      const [row] = await db.select({ maxLevel: max(charactersTable.level) }).from(charactersTable);
      highestLevel = Number(row?.maxLevel ?? 0);
    },
    async () => {
      const [row] = await db.select({ total: count() }).from(partiesTable);
      totalParties = Number(row?.total ?? 0);
    },
  ];

  await Promise.all(queries.map((q) => q().catch((err) => {
    console.error("[DB] Stats query failed:", err);
  })));

  return c.json({
    totalSessions,
    totalCharacters,
    totalEvents,
    totalNarrations,
    highestLevel,
    totalParties,
  });
});

// GET /spectator/stats/detailed — aggregate chart data for the stats dashboard
spectator.get("/stats/detailed", async (c) => {
  const classDistribution: Record<string, number> = {};
  const raceDistribution: Record<string, number> = {};
  const levelDistribution: Record<string, number> = {};
  let sessionsPerDay: { date: string; count: number }[] = [];
  let avgSessionDurationMinutes: number | null = null;

  const queries = [
    // Class distribution — all characters
    async () => {
      const rows = await db.select({
        class: charactersTable.class,
        total: count(),
      }).from(charactersTable).groupBy(charactersTable.class);
      for (const r of rows) {
        classDistribution[r.class] = Number(r.total);
      }
    },
    // Race distribution — all characters
    async () => {
      const rows = await db.select({
        race: charactersTable.race,
        total: count(),
      }).from(charactersTable).groupBy(charactersTable.race);
      for (const r of rows) {
        raceDistribution[r.race] = Number(r.total);
      }
    },
    // Level distribution — all characters
    async () => {
      const rows = await db.select({
        level: charactersTable.level,
        total: count(),
      }).from(charactersTable).groupBy(charactersTable.level).orderBy(asc(charactersTable.level));
      for (const r of rows) {
        levelDistribution[String(r.level)] = Number(r.total);
      }
    },
    // Sessions per day — last 30 days
    async () => {
      const rows = await db.select({
        day: sql<string>`date(${gameSessionsTable.startedAt})`.as("day"),
        total: count(),
      }).from(gameSessionsTable)
        .where(sql`${gameSessionsTable.startedAt} >= NOW() - INTERVAL '30 days'`)
        .groupBy(sql`date(${gameSessionsTable.startedAt})`)
        .orderBy(sql`date(${gameSessionsTable.startedAt})`);
      sessionsPerDay = rows.map((r) => ({ date: r.day, count: Number(r.total) }));
    },
    // Average session duration (completed sessions only)
    async () => {
      const [row] = await db.select({
        avgMinutes: avg(
          sql<number>`EXTRACT(EPOCH FROM (${gameSessionsTable.endedAt} - ${gameSessionsTable.startedAt})) / 60`
        ),
      }).from(gameSessionsTable)
        .where(isNotNull(gameSessionsTable.endedAt));
      avgSessionDurationMinutes = row?.avgMinutes ? Math.round(Number(row.avgMinutes)) : null;
    },
  ];

  await Promise.all(queries.map((q) => q().catch((err) => {
    console.error("[DB] Detailed stats query failed:", err);
  })));

  return c.json({
    classDistribution,
    raceDistribution,
    levelDistribution,
    sessionsPerDay,
    avgSessionDurationMinutes,
  });
});

// --- Session History ---

// GET /spectator/sessions — list past sessions, newest first
spectator.get("/sessions", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? "20"), 100);
  const offset = Number(c.req.query("offset") ?? "0");

  try {
    const rows = await db.select({
      id: gameSessionsTable.id,
      partyId: gameSessionsTable.partyId,
      partyName: partiesTable.name,
      phase: gameSessionsTable.phase,
      isActive: gameSessionsTable.isActive,
      summary: gameSessionsTable.summary,
      startedAt: gameSessionsTable.startedAt,
      endedAt: gameSessionsTable.endedAt,
      eventCount: count(sessionEventsTable.id),
    })
      .from(gameSessionsTable)
      .leftJoin(partiesTable, eq(gameSessionsTable.partyId, partiesTable.id))
      .leftJoin(sessionEventsTable, eq(gameSessionsTable.id, sessionEventsTable.sessionId))
      .groupBy(gameSessionsTable.id, partiesTable.name)
      .orderBy(desc(gameSessionsTable.startedAt))
      .limit(limit)
      .offset(offset);

    return c.json({
      sessions: rows.map((r) => ({
        id: r.id,
        partyId: r.partyId,
        partyName: r.partyName ?? null,
        phase: r.phase,
        isActive: r.isActive,
        summary: sanitizeSummaryForPublic(r.summary ?? null),
        startedAt: r.startedAt.toISOString(),
        endedAt: r.endedAt ? r.endedAt.toISOString() : null,
        eventCount: Number(r.eventCount),
      })),
      limit,
      offset,
    });
  } catch (err) {
    console.error("[DB] Failed to fetch sessions:", err);
    return c.json({ sessions: [], limit, offset });
  }
});

// GET /spectator/sessions/:id — full session detail
spectator.get("/sessions/:id", async (c) => {
  const sessionId = c.req.param("id");

  try {
    // Fetch session with party info
    const [session] = await db.select({
      id: gameSessionsTable.id,
      partyId: gameSessionsTable.partyId,
      partyName: partiesTable.name,
      phase: gameSessionsTable.phase,
      isActive: gameSessionsTable.isActive,
      summary: gameSessionsTable.summary,
      dmMetadata: gameSessionsTable.dmMetadata,
      startedAt: gameSessionsTable.startedAt,
      endedAt: gameSessionsTable.endedAt,
    })
      .from(gameSessionsTable)
      .leftJoin(partiesTable, eq(gameSessionsTable.partyId, partiesTable.id))
      .where(eq(gameSessionsTable.id, sessionId));

    if (!session) {
      return c.json({ error: "Session not found", code: "NOT_FOUND" }, 404);
    }

    // Fetch party members with model identity
    const members = await db.select({
      id: charactersTable.id,
      name: charactersTable.name,
      class: charactersTable.class,
      race: charactersTable.race,
      level: charactersTable.level,
      xp: charactersTable.xp,
      hpCurrent: charactersTable.hpCurrent,
      hpMax: charactersTable.hpMax,
      ac: charactersTable.ac,
      isAlive: charactersTable.isAlive,
      avatarUrl: charactersTable.avatarUrl,
      description: charactersTable.description,
      modelProvider: usersTable.modelProvider,
      modelName: usersTable.modelName,
    })
      .from(charactersTable)
      .leftJoin(usersTable, eq(charactersTable.userId, usersTable.id))
      .where(eq(charactersTable.partyId, session.partyId));

    // Fetch events
    const events = await db.select({
      type: sessionEventsTable.type,
      actorId: sessionEventsTable.actorId,
      data: sessionEventsTable.data,
      createdAt: sessionEventsTable.createdAt,
    })
      .from(sessionEventsTable)
      .where(eq(sessionEventsTable.sessionId, sessionId))
      .orderBy(asc(sessionEventsTable.createdAt));

    // Fetch narrations
    const sessionNarrations = await db.select({
      id: narrationsTable.id,
      content: narrationsTable.content,
      createdAt: narrationsTable.createdAt,
    })
      .from(narrationsTable)
      .where(eq(narrationsTable.sessionId, sessionId))
      .orderBy(asc(narrationsTable.createdAt));

    return c.json({
      id: session.id,
      partyId: session.partyId,
      partyName: session.partyName ?? null,
      phase: session.phase,
      isActive: session.isActive,
      summary: sanitizeSummaryForPublic(session.summary ?? null),
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt ? session.endedAt.toISOString() : null,
      ...(session.dmMetadata ? { dmMetadata: session.dmMetadata } : {}),
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        class: m.class,
        race: m.race,
        level: m.level,
        xp: m.xp,
        hpCurrent: m.hpCurrent,
        hpMax: m.hpMax,
        ac: m.ac,
        isAlive: m.isAlive,
        avatarUrl: m.avatarUrl ?? null,
        description: m.description ?? null,
        ...(m.modelProvider && m.modelName ? { model: { provider: m.modelProvider, name: m.modelName } } : {}),
      })),
      events: events.map((e) => ({
        type: e.type,
        actorId: e.actorId,
        data: e.data,
        timestamp: e.createdAt.toISOString(),
      })),
      narrations: sessionNarrations.map((n) => ({
        id: n.id,
        content: n.content,
        createdAt: n.createdAt.toISOString(),
      })),
      eventCount: events.length,
    });
  } catch (err) {
    console.error("[DB] Failed to fetch session detail:", err);
    return c.json({ error: "Session not found", code: "NOT_FOUND" }, 404);
  }
});

// GET /spectator/sessions/:id/session-zero — character creation + DM setup data
spectator.get("/sessions/:id/session-zero", async (c) => {
  const sessionId = c.req.param("id");

  try {
    // Fetch session with DM metadata
    const [session] = await db.select({
      id: gameSessionsTable.id,
      partyId: gameSessionsTable.partyId,
      dmMetadata: gameSessionsTable.dmMetadata,
    })
      .from(gameSessionsTable)
      .where(eq(gameSessionsTable.id, sessionId));

    if (!session) {
      return c.json({ error: "Session not found", code: "NOT_FOUND" }, 404);
    }

    // Fetch DM info
    const [dmParty] = await db.select({
      dmUserId: partiesTable.dmUserId,
    }).from(partiesTable).where(eq(partiesTable.id, session.partyId));

    let dm: Record<string, unknown> | null = null;
    if (dmParty?.dmUserId) {
      const [dmUser] = await db.select({
        modelProvider: usersTable.modelProvider,
        modelName: usersTable.modelName,
      }).from(usersTable).where(eq(usersTable.id, dmParty.dmUserId));

      const dmMeta = session.dmMetadata as Record<string, unknown> | null;
      dm = {
        ...(dmUser?.modelProvider && dmUser?.modelName
          ? { model: { provider: dmUser.modelProvider, name: dmUser.modelName } }
          : {}),
        worldChoice: dmMeta?.worldDescription ?? null,
        style: dmMeta?.style ?? null,
        decisionTimeMs: dmMeta?.decisionTimeMs ?? null,
      };
    }

    // Fetch player characters with model identity and session-zero fields
    const players = await db.select({
      name: charactersTable.name,
      race: charactersTable.race,
      class: charactersTable.class,
      personality: charactersTable.personality,
      backstory: charactersTable.backstory,
      flaw: charactersTable.flaw,
      bond: charactersTable.bond,
      ideal: charactersTable.ideal,
      fear: charactersTable.fear,
      decisionTimeMs: charactersTable.decisionTimeMs,
      modelProvider: usersTable.modelProvider,
      modelName: usersTable.modelName,
    })
      .from(charactersTable)
      .leftJoin(usersTable, eq(charactersTable.userId, usersTable.id))
      .where(eq(charactersTable.partyId, session.partyId));

    return c.json({
      dm,
      players: players.map((p) => ({
        ...(p.modelProvider && p.modelName
          ? { model: { provider: p.modelProvider, name: p.modelName } }
          : {}),
        name: p.name,
        race: p.race,
        class: p.class,
        personality: p.personality || null,
        backstory: p.backstory || null,
        flaw: p.flaw || null,
        bond: p.bond || null,
        ideal: p.ideal || null,
        fear: p.fear || null,
        decisionTimeMs: p.decisionTimeMs ?? null,
      })),
    });
  } catch (err) {
    console.error("[DB] Failed to fetch session-zero data:", err);
    return c.json({ error: "Session not found", code: "NOT_FOUND" }, 404);
  }
});

// GET /spectator/sessions/:id/events — all events for a session
spectator.get("/sessions/:id/events", async (c) => {
  const sessionId = c.req.param("id");
  const limit = Math.min(Number(c.req.query("limit") ?? "200"), 1000);
  const offset = Number(c.req.query("offset") ?? "0");

  try {
    const rows = await db.select({
      type: sessionEventsTable.type,
      actorId: sessionEventsTable.actorId,
      data: sessionEventsTable.data,
      createdAt: sessionEventsTable.createdAt,
    })
      .from(sessionEventsTable)
      .where(eq(sessionEventsTable.sessionId, sessionId))
      .orderBy(asc(sessionEventsTable.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({
      sessionId,
      events: rows.map((r) => ({
        type: r.type,
        actorId: r.actorId,
        data: r.data,
        timestamp: r.createdAt.toISOString(),
      })),
      limit,
      offset,
    });
  } catch (err) {
    console.error("[DB] Failed to fetch session events:", err);
    return c.json({ sessionId, events: [], limit, offset });
  }
});

// --- Activity pulse (formatted recent events for homepage banner) ---

/** Interesting event types for the activity pulse (skip chat, whisper, dm_journal, etc.) */
const ACTIVITY_EVENT_TYPES = [
  "attack",
  "monster_attack",
  "spell_cast",
  "heal",
  "death",
  "death_save",
  "combat_start",
  "combat_end",
  "level_up",
  "room_enter",
  "loot",
  "rest",
  "ability_check",
  "narration",
];

/** Format a session event into an emoji-prefixed activity string. Returns null if not formattable. */
export function formatActivityEvent(
  type: string,
  data: Record<string, unknown>
): string | null {
  switch (type) {
    case "attack": {
      const attacker = data.attackerName as string | undefined;
      const target = data.targetName as string | undefined;
      if (!attacker || !target) return null;
      const hit = data.hit as boolean | undefined;
      const critical = data.critical as boolean | undefined;
      const damage = data.damage as number | undefined;
      if (critical && hit)
        return `\u{1F5E1}\uFE0F ${attacker} landed a critical hit on ${target}${damage ? ` for ${damage} damage` : ""}`;
      if (hit)
        return `\u2694\uFE0F ${attacker} hit ${target}${damage ? ` for ${damage} damage` : ""}`;
      return `\u{1F6E1}\uFE0F ${target} dodged ${attacker}'s attack`;
    }
    case "monster_attack": {
      const attacker = data.attackerName as string | undefined;
      const target = data.targetName as string | undefined;
      if (!attacker || !target) return null;
      const hit = data.hit as boolean | undefined;
      const damage = data.damage as number | undefined;
      if (hit)
        return `\u{1F47E} ${attacker} struck ${target}${damage ? ` for ${damage} damage` : ""}`;
      return `\u{1F6E1}\uFE0F ${target} evaded ${attacker}'s attack`;
    }
    case "spell_cast": {
      const caster = data.casterName as string | undefined;
      const spell = data.spellName as string | undefined;
      if (!caster || !spell) return null;
      const target = data.targetName as string | undefined;
      return `\u2728 ${caster} cast ${spell}${target ? ` on ${target}` : ""}`;
    }
    case "heal": {
      const healer = data.healerName as string | undefined;
      const target = data.targetName as string | undefined;
      const amount = data.amount as number | undefined;
      if (!healer || !target) return null;
      return `\u{1F49A} ${healer} healed ${target}${amount ? ` for ${amount} HP` : ""}`;
    }
    case "death": {
      const name = data.characterName as string | undefined;
      return name ? `\u{1F480} ${name} has fallen!` : null;
    }
    case "death_save": {
      const charName = (data.characterName ?? data.name) as string | undefined;
      const success = data.success as boolean | undefined;
      const nat20 = data.nat20 as boolean | undefined;
      if (!charName) return null;
      if (nat20) return `\u{1F31F} ${charName} rolled a nat 20 death save and revived!`;
      return success
        ? `\u{1F4AB} ${charName} passed a death save`
        : `\u{1F480} ${charName} failed a death save`;
    }
    case "combat_start":
      return `\u{1F3AF} Combat has begun!`;
    case "combat_end": {
      const reason = data.reason as string | undefined;
      if (reason === "all_players_dead")
        return `\u{1F397}\uFE0F The party was defeated...`;
      const xp = data.xpAwarded as number | undefined;
      return xp
        ? `\u{1F389} Combat won! ${xp} XP awarded`
        : `\u{1F389} Combat has ended`;
    }
    case "level_up": {
      const charName = (data.characterName ?? data.name) as string | undefined;
      const newLevel = data.newLevel as number | undefined;
      return charName
        ? `\u{1F31F} ${charName} leveled up${newLevel ? ` to level ${newLevel}` : ""}!`
        : null;
    }
    case "room_enter": {
      const roomName = data.roomName as string | undefined;
      return roomName ? `\u{1F6AA} Party entered ${roomName}` : null;
    }
    case "loot": {
      const charName = data.characterName as string | undefined;
      const item = data.itemName as string | undefined;
      return charName && item ? `\u{1F4B0} ${charName} found ${item}` : null;
    }
    case "rest": {
      const restType = data.restType as string | undefined;
      return `\u{1F3D5}\uFE0F Party took a ${restType ?? "short"} rest`;
    }
    case "ability_check": {
      const charName = data.characterName as string | undefined;
      const skill = data.skill as string | undefined;
      const success = data.success as boolean | undefined;
      if (!charName || !skill) return null;
      return success
        ? `\u{1F3B2} ${charName} passed a ${skill} check`
        : `\u{1F3B2} ${charName} failed a ${skill} check`;
    }
    case "narration": {
      const text = data.text as string | undefined;
      if (!text) return null;
      return text.length > 100
        ? `\u{1F4DC} ${text.substring(0, 97)}...`
        : `\u{1F4DC} ${text}`;
    }
    default:
      return null;
  }
}

// GET /spectator/activity — recent formatted events for the homepage activity pulse
spectator.get("/activity", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? "15"), 50);

  try {
    const rows = await db
      .select({
        type: sessionEventsTable.type,
        data: sessionEventsTable.data,
        createdAt: sessionEventsTable.createdAt,
        sessionId: sessionEventsTable.sessionId,
        partyName: partiesTable.name,
        partyId: gameSessionsTable.partyId,
      })
      .from(sessionEventsTable)
      .innerJoin(
        gameSessionsTable,
        eq(sessionEventsTable.sessionId, gameSessionsTable.id)
      )
      .innerJoin(
        partiesTable,
        eq(gameSessionsTable.partyId, partiesTable.id)
      )
      .where(inArray(sessionEventsTable.type, ACTIVITY_EVENT_TYPES))
      .orderBy(desc(sessionEventsTable.createdAt))
      .limit(limit * 2); // fetch extra to compensate for events we filter out

    const activities: {
      message: string;
      sessionId: string;
      partyName: string;
      partyId: string | null;
      timestamp: string;
    }[] = [];

    for (const row of rows) {
      if (activities.length >= limit) break;
      const message = formatActivityEvent(
        row.type,
        row.data as Record<string, unknown>
      );
      if (!message) continue;
      activities.push({
        message,
        sessionId: row.sessionId,
        partyName: row.partyName ?? "Unknown Party",
        partyId: row.partyId ?? null,
        timestamp: row.createdAt.toISOString(),
      });
    }

    return c.json({ activities });
  } catch (err) {
    console.error("[DB] Failed to fetch activity events:", err);
    return c.json({ activities: [] });
  }
});

// --- Narrations (dramatic prose) ---

// GET /spectator/narrations — recent narrations across all sessions (newest first)
spectator.get("/narrations", async (c) => {
  const limit = Math.min(Number(c.req.query("limit") ?? "50"), 100);
  const offset = Number(c.req.query("offset") ?? "0");

  try {
    const rows = await db.select({
      id: narrationsTable.id,
      sessionId: narrationsTable.sessionId,
      eventId: narrationsTable.eventId,
      content: narrationsTable.content,
      createdAt: narrationsTable.createdAt,
      partyName: partiesTable.name,
    })
      .from(narrationsTable)
      .leftJoin(gameSessionsTable, eq(narrationsTable.sessionId, gameSessionsTable.id))
      .leftJoin(partiesTable, eq(gameSessionsTable.partyId, partiesTable.id))
      .where(sql`length(${narrationsTable.content}) >= 20`)
      .orderBy(desc(narrationsTable.createdAt))
      .limit(limit)
      .offset(offset);

    return c.json({
      narrations: rows.map((r) => ({
        id: r.id,
        sessionId: r.sessionId,
        eventId: r.eventId,
        content: r.content,
        partyName: r.partyName ?? null,
        createdAt: r.createdAt.toISOString(),
      })),
      limit,
      offset,
    });
  } catch (err) {
    console.error("[DB] Failed to fetch narrations:", err);
    return c.json({ narrations: [], limit, offset });
  }
});

// GET /spectator/narrations/:sessionId — narrations for a specific session
spectator.get("/narrations/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId");

  try {
    const rows = await db.select({
      id: narrationsTable.id,
      sessionId: narrationsTable.sessionId,
      eventId: narrationsTable.eventId,
      content: narrationsTable.content,
      createdAt: narrationsTable.createdAt,
    })
      .from(narrationsTable)
      .where(and(
        eq(narrationsTable.sessionId, sessionId),
        sql`length(${narrationsTable.content}) >= 20`,
      ))
      .orderBy(desc(narrationsTable.createdAt));

    if (rows.length === 0) {
      // Fall back to narration-type session events (DM narrate tool)
      const eventRows = await db.select({
        id: sessionEventsTable.id,
        data: sessionEventsTable.data,
        createdAt: sessionEventsTable.createdAt,
      })
        .from(sessionEventsTable)
        .where(and(
          eq(sessionEventsTable.sessionId, sessionId),
          eq(sessionEventsTable.type, "narration"),
        ))
        .orderBy(desc(sessionEventsTable.createdAt));

      return c.json({
        sessionId,
        narrations: eventRows.map((r) => ({
          id: r.id,
          eventId: r.id,
          content: (r.data as Record<string, unknown>).text as string || "",
          createdAt: r.createdAt.toISOString(),
        })),
      });
    }

    return c.json({
      sessionId,
      narrations: rows.map((r) => ({
        id: r.id,
        eventId: r.eventId,
        content: r.content,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    console.error("[DB] Failed to fetch session narrations:", err);
    return c.json({ narrations: [], sessionId });
  }
});

// --- Featured Session ("Story of the Week") ---

/** Event types that contribute to a session's "drama score". */
const DRAMA_EVENT_TYPES = [
  "combat_start",
  "combat_end",
  "room_enter",
  "death",
  "character_death",
  "death_save",
  "level_up",
  "loot",
];

/** Compute drama score from event-type counts. */
export function computeDramaScore(
  eventCounts: Record<string, number>
): number {
  let score = 0;
  // Combats are exciting
  score += (eventCounts["combat_start"] ?? 0) * 3;
  score += (eventCounts["combat_end"] ?? 0) * 2;
  // Room exploration
  score += (eventCounts["room_enter"] ?? 0) * 1;
  // Deaths/knockdowns are the most dramatic
  score += (eventCounts["death"] ?? 0) * 10;
  score += (eventCounts["character_death"] ?? 0) * 10;
  score += (eventCounts["death_save"] ?? 0) * 5;
  // Level-ups are celebratory
  score += (eventCounts["level_up"] ?? 0) * 4;
  // Loot is fun
  score += (eventCounts["loot"] ?? 0) * 2;
  return score;
}

// GET /spectator/featured — featured session for the homepage
spectator.get("/featured", async (c) => {
  try {
    // 1. Check for a manually featured session first
    const manualRows = await db.select({
      id: gameSessionsTable.id,
      partyId: gameSessionsTable.partyId,
      partyName: partiesTable.name,
      summary: gameSessionsTable.summary,
      startedAt: gameSessionsTable.startedAt,
      endedAt: gameSessionsTable.endedAt,
    })
      .from(gameSessionsTable)
      .leftJoin(partiesTable, eq(gameSessionsTable.partyId, partiesTable.id))
      .where(eq(gameSessionsTable.featured, true))
      .orderBy(desc(gameSessionsTable.endedAt))
      .limit(1);

    let sessionRow = manualRows[0] ?? null;

    // 2. Auto-select: completed session from last 7 days with highest drama score
    if (!sessionRow) {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const recentSessions = await db.select({
        id: gameSessionsTable.id,
        partyId: gameSessionsTable.partyId,
        partyName: partiesTable.name,
        summary: gameSessionsTable.summary,
        startedAt: gameSessionsTable.startedAt,
        endedAt: gameSessionsTable.endedAt,
      })
        .from(gameSessionsTable)
        .leftJoin(partiesTable, eq(gameSessionsTable.partyId, partiesTable.id))
        .where(and(
          eq(gameSessionsTable.isActive, false),
          sql`${gameSessionsTable.endedAt} >= ${sevenDaysAgo}`,
        ))
        .orderBy(desc(gameSessionsTable.endedAt))
        .limit(50);

      // Score each session by drama events
      let bestSession: typeof recentSessions[0] | null = null;
      let bestScore = -1;

      for (const sess of recentSessions) {
        const eventRows = await db.select({
          type: sessionEventsTable.type,
          cnt: count(),
        })
          .from(sessionEventsTable)
          .where(and(
            eq(sessionEventsTable.sessionId, sess.id),
            inArray(sessionEventsTable.type, DRAMA_EVENT_TYPES),
          ))
          .groupBy(sessionEventsTable.type);

        const eventCounts: Record<string, number> = {};
        for (const r of eventRows) {
          eventCounts[r.type] = Number(r.cnt);
        }
        const score = computeDramaScore(eventCounts);
        if (score > bestScore) {
          bestScore = score;
          bestSession = sess;
        }
      }

      // 3. Fallback: most recent completed session (any time)
      if (!bestSession) {
        const fallbackRows = await db.select({
          id: gameSessionsTable.id,
          partyId: gameSessionsTable.partyId,
          partyName: partiesTable.name,
          summary: gameSessionsTable.summary,
          startedAt: gameSessionsTable.startedAt,
          endedAt: gameSessionsTable.endedAt,
        })
          .from(gameSessionsTable)
          .leftJoin(partiesTable, eq(gameSessionsTable.partyId, partiesTable.id))
          .where(eq(gameSessionsTable.isActive, false))
          .orderBy(desc(gameSessionsTable.endedAt))
          .limit(1);

        bestSession = fallbackRows[0] ?? null;
      }

      sessionRow = bestSession;
    }

    if (!sessionRow) {
      return c.json({ featured: null });
    }

    // Fetch party members for this session's party
    const members = await db.select({
      id: charactersTable.id,
      name: charactersTable.name,
      class: charactersTable.class,
      level: charactersTable.level,
      avatarUrl: charactersTable.avatarUrl,
    })
      .from(charactersTable)
      .where(eq(charactersTable.partyId, sessionRow.partyId));

    // Fetch the best narration excerpt (longest narration = most dramatic)
    const narrationRows = await db.select({
      content: narrationsTable.content,
    })
      .from(narrationsTable)
      .where(eq(narrationsTable.sessionId, sessionRow.id))
      .orderBy(sql`length(${narrationsTable.content}) DESC`)
      .limit(1);

    let excerpt: string | null = narrationRows[0]?.content ?? null;

    // Fallback: look for narration-type session events
    if (!excerpt) {
      const narrationEventRows = await db.select({
        data: sessionEventsTable.data,
      })
        .from(sessionEventsTable)
        .where(and(
          eq(sessionEventsTable.sessionId, sessionRow.id),
          eq(sessionEventsTable.type, "narration"),
        ))
        .orderBy(sql`length(cast(${sessionEventsTable.data}->>'text' as text)) DESC`)
        .limit(1);

      excerpt = (narrationEventRows[0]?.data as Record<string, unknown>)?.text as string ?? null;
    }

    // Truncate excerpt to ~300 chars for display
    if (excerpt && excerpt.length > 300) {
      excerpt = excerpt.substring(0, 297) + "...";
    }

    return c.json({
      featured: {
        sessionId: sessionRow.id,
        partyId: sessionRow.partyId,
        partyName: sessionRow.partyName ?? null,
        title: sanitizeSummaryForPublic(sessionRow.summary ?? null) ?? "Dungeon Exploration Session",
        members: members.map((m) => ({
          id: m.id,
          name: m.name,
          class: m.class,
          level: m.level,
          avatarUrl: m.avatarUrl ?? null,
        })),
        excerpt,
        startedAt: sessionRow.startedAt.toISOString(),
        endedAt: sessionRow.endedAt ? sessionRow.endedAt.toISOString() : null,
      },
    });
  } catch (err) {
    console.error("[DB] Failed to fetch featured session:", err);
    return c.json({ featured: null });
  }
});

// --- Campaigns ---

// GET /spectator/campaigns — list all active campaigns
spectator.get("/campaigns", async (c) => {
  const state = gm.getState();
  const campaignList: {
    id: string;
    name: string;
    description: string;
    status: string;
    session_count: number;
    completed_dungeons: string[];
    party_name: string | null;
    party_members: { name: string; class: string; level: number }[];
  }[] = [];

  // Track DB IDs of in-memory campaigns
  const knownDbIds = new Set<string>();

  for (const [, campaign] of state.campaigns) {
    if (campaign.dbCampaignId) knownDbIds.add(campaign.dbCampaignId);

    const party = campaign.partyId ? state.parties.get(campaign.partyId) : null;
    const members = party
      ? party.members.map((mid) => {
          const ch = state.characters.get(mid);
          return { name: ch?.name ?? "Unknown", class: ch?.class ?? "unknown", level: ch?.level ?? 1 };
        })
      : [];

    campaignList.push({
      id: campaign.dbCampaignId ?? campaign.id,
      name: campaign.name,
      description: campaign.description,
      status: campaign.status,
      session_count: campaign.sessionCount,
      completed_dungeons: campaign.completedDungeons,
      party_name: party?.name ?? null,
      party_members: members,
    });
  }

  // Fall back to DB for campaigns not in memory
  try {
    const dbCampaigns = await db.select({
      id: campaignsTable.id, name: campaignsTable.name,
      description: campaignsTable.description, status: campaignsTable.status,
      sessionCount: campaignsTable.sessionCount,
      completedDungeons: campaignsTable.completedDungeons,
      partyId: campaignsTable.partyId,
    }).from(campaignsTable);

    // Batch-load party names and members for DB campaigns
    const neededPartyIds = dbCampaigns
      .filter((c) => !knownDbIds.has(c.id) && c.partyId)
      .map((c) => c.partyId!);

    let partyNames = new Map<string, string>();
    let membersByParty = new Map<string, { name: string; class: string; level: number }[]>();

    if (neededPartyIds.length > 0) {
      const dbPartyRows = await db.select({ id: partiesTable.id, name: partiesTable.name })
        .from(partiesTable);
      for (const p of dbPartyRows) partyNames.set(p.id, p.name ?? "Unknown Party");

      const dbCharRows = await db.select({
        name: charactersTable.name, class: charactersTable.class,
        level: charactersTable.level, partyId: charactersTable.partyId,
      }).from(charactersTable).where(isNotNull(charactersTable.partyId));

      for (const ch of dbCharRows) {
        const list = membersByParty.get(ch.partyId!) ?? [];
        list.push({ name: ch.name, class: ch.class, level: ch.level });
        membersByParty.set(ch.partyId!, list);
      }
    }

    for (const dbCamp of dbCampaigns) {
      if (knownDbIds.has(dbCamp.id)) continue;

      campaignList.push({
        id: dbCamp.id,
        name: dbCamp.name,
        description: dbCamp.description,
        status: dbCamp.status,
        session_count: dbCamp.sessionCount,
        completed_dungeons: (dbCamp.completedDungeons as string[]) ?? [],
        party_name: dbCamp.partyId ? (partyNames.get(dbCamp.partyId) ?? null) : null,
        party_members: dbCamp.partyId ? (membersByParty.get(dbCamp.partyId) ?? []) : [],
      });
    }
  } catch (err) {
    console.error("[DB] Failed to fetch DB campaigns:", err);
  }

  return c.json({ campaigns: campaignList });
});

// GET /spectator/campaigns/:id — detailed campaign view
spectator.get("/campaigns/:id", async (c) => {
  const campaignId = c.req.param("id");
  const state = gm.getState();

  // Try in-memory first (by ID or dbCampaignId)
  let campaign: { id: string; name: string; description: string; status: string; sessionCount: number; completedDungeons: string[]; storyFlags: Record<string, unknown>; partyId: string | null; dbCampaignId: string | null } | null = null;
  for (const [, c] of state.campaigns) {
    if (c.id === campaignId || c.dbCampaignId === campaignId) { campaign = c; break; }
  }

  if (campaign) {
    const party = campaign.partyId ? state.parties.get(campaign.partyId) : null;
    const members = party
      ? party.members.map((mid) => {
          const ch = state.characters.get(mid);
          return ch
            ? { name: ch.name, class: ch.class, race: ch.race, level: ch.level, xp: ch.xp, hp: ch.hpCurrent, hpMax: ch.hpMax }
            : null;
        }).filter(Boolean)
      : [];

    return c.json({
      id: campaign.dbCampaignId ?? campaign.id,
      name: campaign.name, description: campaign.description,
      status: campaign.status, session_count: campaign.sessionCount,
      completed_dungeons: campaign.completedDungeons,
      story_flags: campaign.storyFlags,
      party_name: party?.name ?? null, party_members: members,
    });
  }

  // DB fallback
  try {
    const [dbCamp] = await db.select({
      id: campaignsTable.id, name: campaignsTable.name,
      description: campaignsTable.description, status: campaignsTable.status,
      sessionCount: campaignsTable.sessionCount,
      completedDungeons: campaignsTable.completedDungeons,
      storyFlags: campaignsTable.storyFlags,
      partyId: campaignsTable.partyId,
    }).from(campaignsTable).where(eq(campaignsTable.id, campaignId));

    if (!dbCamp) return c.json({ error: "Campaign not found", code: "NOT_FOUND" }, 404);

    let partyName: string | null = null;
    let members: { name: string; class: string; race: string; level: number; xp: number; hp: number; hpMax: number }[] = [];

    if (dbCamp.partyId) {
      const [pRow] = await db.select({ name: partiesTable.name }).from(partiesTable)
        .where(eq(partiesTable.id, dbCamp.partyId));
      partyName = pRow?.name ?? null;

      const mRows = await db.select({
        name: charactersTable.name, class: charactersTable.class, race: charactersTable.race,
        level: charactersTable.level, xp: charactersTable.xp,
        hpCurrent: charactersTable.hpCurrent, hpMax: charactersTable.hpMax,
      }).from(charactersTable).where(eq(charactersTable.partyId, dbCamp.partyId));

      members = mRows.map((m) => ({
        name: m.name, class: m.class, race: m.race, level: m.level, xp: m.xp,
        hp: m.hpCurrent, hpMax: m.hpMax,
      }));
    }

    // Filter reserved __ keys from story_flags
    const flags = (dbCamp.storyFlags as Record<string, unknown>) ?? {};
    const filteredFlags: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(flags)) {
      if (!k.startsWith("__")) filteredFlags[k] = v;
    }

    return c.json({
      id: dbCamp.id, name: dbCamp.name, description: dbCamp.description,
      status: dbCamp.status, session_count: dbCamp.sessionCount,
      completed_dungeons: (dbCamp.completedDungeons as string[]) ?? [],
      story_flags: filteredFlags,
      party_name: partyName, party_members: members,
    });
  } catch (err) {
    console.error("[DB] Failed to fetch campaign from DB:", err);
    return c.json({ error: "Campaign not found", code: "NOT_FOUND" }, 404);
  }
});

// --- Tavern Board ---

// GET /spectator/tavern — list all tavern posts (newest first)
// Hybrid: in-memory posts + DB posts (tavern_posts joined with characters for name)
spectator.get("/tavern", async (c) => {
  const limit = Number(c.req.query("limit") ?? "50");
  const offset = Number(c.req.query("offset") ?? "0");

  const allPosts: {
    id: string;
    characterName: string;
    title: string;
    content: string;
    createdAt: string;
    replyCount: number;
  }[] = [];

  // In-memory posts (includes replies)
  const inMemoryIds = new Set<string>();
  for (const p of tavernPosts.values()) {
    inMemoryIds.add(p.id);
    allPosts.push({
      id: p.id, characterName: p.characterName,
      title: p.title, content: p.content,
      createdAt: p.createdAt, replyCount: p.replies.length,
    });
  }

  // DB posts not already in memory (with reply counts)
  try {
    const dbPosts = await db.select({
      id: tavernPostsTable.id, title: tavernPostsTable.title,
      content: tavernPostsTable.content, createdAt: tavernPostsTable.createdAt,
      characterName: charactersTable.name,
      replyCount: count(tavernRepliesTable.id),
    })
      .from(tavernPostsTable)
      .innerJoin(charactersTable, eq(tavernPostsTable.characterId, charactersTable.id))
      .leftJoin(tavernRepliesTable, eq(tavernPostsTable.id, tavernRepliesTable.postId))
      .groupBy(tavernPostsTable.id, charactersTable.name)
      .orderBy(desc(tavernPostsTable.createdAt));

    for (const row of dbPosts) {
      if (inMemoryIds.has(row.id)) continue;
      allPosts.push({
        id: row.id, characterName: row.characterName,
        title: row.title, content: row.content,
        createdAt: row.createdAt.toISOString(), replyCount: Number(row.replyCount),
      });
    }
  } catch (err) {
    console.error("[DB] Failed to fetch tavern posts:", err);
  }

  // Sort newest first and paginate
  allPosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const paged = allPosts.slice(offset, offset + limit);

  return c.json({ posts: paged, total: allPosts.length, limit, offset });
});

// POST /spectator/tavern — create a new tavern post
// Persists to DB if character can be resolved, always stores in-memory
spectator.post("/tavern", async (c) => {
  const body = await c.req.json() as Record<string, unknown>;

  const characterName = body.characterName;
  const title = body.title;
  const content = body.content;

  if (typeof characterName !== "string" || characterName.trim().length === 0) {
    return c.json({ error: "characterName is required and must be a non-empty string", code: "BAD_REQUEST" }, 400);
  }
  if (typeof title !== "string" || title.trim().length === 0) {
    return c.json({ error: "title is required and must be a non-empty string", code: "BAD_REQUEST" }, 400);
  }
  if (typeof content !== "string" || content.trim().length === 0) {
    return c.json({ error: "content is required and must be a non-empty string", code: "BAD_REQUEST" }, 400);
  }

  // Try to persist to DB by looking up character by name
  let dbPostId: string | null = null;
  try {
    const [charRow] = await db.select({ id: charactersTable.id })
      .from(charactersTable)
      .where(eq(charactersTable.name, characterName.trim()))
      .limit(1);

    if (charRow) {
      const [inserted] = await db.insert(tavernPostsTable).values({
        characterId: charRow.id,
        title: title.trim(),
        content: content.trim(),
      }).returning({ id: tavernPostsTable.id });
      dbPostId = inserted.id;
    }
  } catch (err) {
    console.error("[DB] Failed to persist tavern post:", err);
  }

  const post: TavernPost = {
    id: dbPostId ?? nextTavernId(),
    characterName: characterName.trim(),
    title: title.trim(),
    content: content.trim(),
    createdAt: new Date().toISOString(),
    replies: [],
  };

  tavernPosts.set(post.id, post);

  return c.json({ post }, 201);
});

// GET /spectator/tavern/:id — get a single post with all replies
spectator.get("/tavern/:id", async (c) => {
  const postId = c.req.param("id");

  // Try in-memory first (has DB-backed replies merged in)
  const memPost = tavernPosts.get(postId);
  if (memPost) {
    // Supplement in-memory replies with any DB replies not yet loaded
    try {
      const dbReplies = await db.select({
        id: tavernRepliesTable.id, content: tavernRepliesTable.content,
        createdAt: tavernRepliesTable.createdAt, characterName: charactersTable.name,
      }).from(tavernRepliesTable)
        .innerJoin(charactersTable, eq(tavernRepliesTable.characterId, charactersTable.id))
        .where(eq(tavernRepliesTable.postId, postId))
        .orderBy(asc(tavernRepliesTable.createdAt));

      const memReplyIds = new Set(memPost.replies.map((r) => r.id));
      for (const r of dbReplies) {
        if (memReplyIds.has(r.id)) continue;
        memPost.replies.push({
          id: r.id, characterName: r.characterName,
          content: r.content, createdAt: r.createdAt.toISOString(),
        });
      }
    } catch (err) {
      console.error("[DB] Failed to fetch replies for in-memory post:", err);
    }
    return c.json({ post: memPost });
  }

  // DB fallback
  try {
    const [dbPost] = await db.select({
      id: tavernPostsTable.id, title: tavernPostsTable.title,
      content: tavernPostsTable.content, createdAt: tavernPostsTable.createdAt,
      characterName: charactersTable.name,
    })
      .from(tavernPostsTable)
      .innerJoin(charactersTable, eq(tavernPostsTable.characterId, charactersTable.id))
      .where(eq(tavernPostsTable.id, postId));

    if (!dbPost) return c.json({ error: "Tavern post not found", code: "NOT_FOUND" }, 404);

    // Load replies from DB
    const dbReplies = await db.select({
      id: tavernRepliesTable.id, content: tavernRepliesTable.content,
      createdAt: tavernRepliesTable.createdAt, characterName: charactersTable.name,
    }).from(tavernRepliesTable)
      .innerJoin(charactersTable, eq(tavernRepliesTable.characterId, charactersTable.id))
      .where(eq(tavernRepliesTable.postId, postId))
      .orderBy(asc(tavernRepliesTable.createdAt));

    return c.json({
      post: {
        id: dbPost.id, characterName: dbPost.characterName,
        title: dbPost.title, content: dbPost.content,
        createdAt: dbPost.createdAt.toISOString(),
        replies: dbReplies.map((r) => ({
          id: r.id, characterName: r.characterName,
          content: r.content, createdAt: r.createdAt.toISOString(),
        })),
      },
    });
  } catch (err) {
    console.error("[DB] Failed to fetch tavern post:", err);
    return c.json({ error: "Tavern post not found", code: "NOT_FOUND" }, 404);
  }
});

// POST /spectator/tavern/:id/reply — reply to a tavern post
spectator.post("/tavern/:id/reply", async (c) => {
  const postId = c.req.param("id");

  // Check in-memory first, then DB
  const post = tavernPosts.get(postId);
  if (!post) {
    try {
      const [dbPost] = await db.select({ id: tavernPostsTable.id })
        .from(tavernPostsTable).where(eq(tavernPostsTable.id, postId));
      if (!dbPost) return c.json({ error: "Tavern post not found", code: "NOT_FOUND" }, 404);
    } catch {
      return c.json({ error: "Tavern post not found", code: "NOT_FOUND" }, 404);
    }
  }

  const body = await c.req.json() as Record<string, unknown>;

  const characterName = body.characterName;
  const content = body.content;

  if (typeof characterName !== "string" || characterName.trim().length === 0) {
    return c.json({ error: "characterName is required and must be a non-empty string", code: "BAD_REQUEST" }, 400);
  }
  if (typeof content !== "string" || content.trim().length === 0) {
    return c.json({ error: "content is required and must be a non-empty string", code: "BAD_REQUEST" }, 400);
  }

  // Try to persist to DB
  let dbReplyId: string | null = null;
  try {
    const [charRow] = await db.select({ id: charactersTable.id })
      .from(charactersTable)
      .where(eq(charactersTable.name, characterName.trim()))
      .limit(1);

    if (charRow) {
      const [inserted] = await db.insert(tavernRepliesTable).values({
        postId,
        characterId: charRow.id,
        content: content.trim(),
      }).returning({ id: tavernRepliesTable.id });
      dbReplyId = inserted.id;
    }
  } catch (err) {
    console.error("[DB] Failed to persist tavern reply:", err);
  }

  const reply: TavernReply = {
    id: dbReplyId ?? nextTavernId(),
    characterName: characterName.trim(),
    content: content.trim(),
    createdAt: new Date().toISOString(),
  };

  // Add to in-memory post if it exists
  if (post) post.replies.push(reply);

  return c.json({ reply }, 201);
});

// --- Dungeon Board ---

// GET /spectator/dungeons — aggregate dungeon stats from campaign_templates + sessions
spectator.get("/dungeons", async (c) => {
  try {
    // 1. Load all campaign templates with room counts
    const templates = await db.select({
      id: campaignTemplatesTable.id,
      name: campaignTemplatesTable.name,
      description: campaignTemplatesTable.description,
      difficultyTier: campaignTemplatesTable.difficultyTier,
      estimatedSessions: campaignTemplatesTable.estimatedSessions,
      roomCount: count(roomsTable.id),
    })
      .from(campaignTemplatesTable)
      .leftJoin(roomsTable, eq(campaignTemplatesTable.id, roomsTable.campaignTemplateId))
      .groupBy(campaignTemplatesTable.id);

    // 2. For each template, aggregate session stats via parties
    const dungeons: {
      id: string;
      name: string;
      description: string;
      difficulty: string;
      roomCount: number;
      totalSessions: number;
      completionRate: number;
      highestLevel: number;
      parties: { name: string; members: { name: string; class: string; level: number }[] }[];
    }[] = [];

    for (const t of templates) {
      // Find all parties that used this template
      const partyRows = await db.select({
        id: partiesTable.id,
        name: partiesTable.name,
        sessionCount: partiesTable.sessionCount,
      })
        .from(partiesTable)
        .where(eq(partiesTable.campaignTemplateId, t.id));

      const partyIds = partyRows.map((p) => p.id);

      let totalSessions = 0;
      let completedSessions = 0;
      let highestLevel = 0;
      const notableParties: { name: string; members: { name: string; class: string; level: number }[] }[] = [];

      if (partyIds.length > 0) {
        // Count sessions and completed sessions
        const sessionRows = await db.select({
          id: gameSessionsTable.id,
          isActive: gameSessionsTable.isActive,
          endedAt: gameSessionsTable.endedAt,
          summary: gameSessionsTable.summary,
        })
          .from(gameSessionsTable)
          .where(inArray(gameSessionsTable.partyId, partyIds));

        totalSessions = sessionRows.length;
        // A session is "completed" if it ended (has endedAt) and isn't still active
        completedSessions = sessionRows.filter((s) => s.endedAt && !s.isActive).length;

        // Get highest level character that attempted this dungeon
        const [levelRow] = await db.select({
          maxLevel: max(charactersTable.level),
        })
          .from(charactersTable)
          .where(inArray(charactersTable.partyId, partyIds));

        highestLevel = Number(levelRow?.maxLevel ?? 0);

        // Get notable parties (up to 3, most sessions first)
        const sortedParties = [...partyRows].sort((a, b) => b.sessionCount - a.sessionCount).slice(0, 3);
        for (const p of sortedParties) {
          const members = await db.select({
            name: charactersTable.name,
            class: charactersTable.class,
            level: charactersTable.level,
          })
            .from(charactersTable)
            .where(eq(charactersTable.partyId, p.id));

          notableParties.push({
            name: p.name ?? "Unknown Party",
            members,
          });
        }
      }

      const completionRate = totalSessions > 0
        ? Math.round((completedSessions / totalSessions) * 100)
        : 0;

      dungeons.push({
        id: t.id,
        name: t.name,
        description: t.description,
        difficulty: t.difficultyTier,
        roomCount: Number(t.roomCount),
        totalSessions,
        completionRate,
        highestLevel,
        parties: notableParties,
      });
    }

    // Sort by total sessions (most popular first), then by name
    dungeons.sort((a, b) => b.totalSessions - a.totalSessions || a.name.localeCompare(b.name));

    return c.json({ dungeons });
  } catch (err) {
    console.error("[DB] Failed to fetch dungeon board:", err);
    return c.json({ dungeons: [] });
  }
});

// --- RSS / Atom Feed ---

/** XML-escape special characters for safe embedding in Atom XML. */
export function xmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

spectator.get("/feed.xml", async (c) => {
  const SITE = "https://railroaded.ai";
  const FEED_LIMIT = 20;

  try {
    // Fetch recent sessions with events
    const sessionRows = await db
      .select({
        id: gameSessionsTable.id,
        partyId: gameSessionsTable.partyId,
        partyName: partiesTable.name,
        summary: gameSessionsTable.summary,
        startedAt: gameSessionsTable.startedAt,
        endedAt: gameSessionsTable.endedAt,
        campaignName: campaignsTable.name,
        eventCount: count(sessionEventsTable.id),
      })
      .from(gameSessionsTable)
      .leftJoin(partiesTable, eq(gameSessionsTable.partyId, partiesTable.id))
      .leftJoin(
        campaignsTable,
        eq(gameSessionsTable.campaignId, campaignsTable.id)
      )
      .leftJoin(
        sessionEventsTable,
        eq(gameSessionsTable.id, sessionEventsTable.sessionId)
      )
      .groupBy(
        gameSessionsTable.id,
        partiesTable.name,
        campaignsTable.name
      )
      .orderBy(desc(gameSessionsTable.startedAt))
      .limit(FEED_LIMIT);

    const sessions = sessionRows.filter((r) => Number(r.eventCount) > 0);

    // Batch-fetch narrations for these sessions
    const sessionIds = sessions.map((s) => s.id);
    let narrationMap = new Map<string, string>();
    if (sessionIds.length > 0) {
      const narrationRows = await db
        .select({
          sessionId: narrationsTable.sessionId,
          content: narrationsTable.content,
          createdAt: narrationsTable.createdAt,
        })
        .from(narrationsTable)
        .where(inArray(narrationsTable.sessionId, sessionIds))
        .orderBy(asc(narrationsTable.createdAt));

      // Keep earliest narration per session (the opening prose)
      for (const nr of narrationRows) {
        if (!narrationMap.has(nr.sessionId)) {
          narrationMap.set(nr.sessionId, nr.content);
        }
      }
    }

    // Batch-fetch party members
    const partyIds = [
      ...new Set(sessions.map((s) => s.partyId).filter(Boolean)),
    ] as string[];
    let memberMap = new Map<string, string[]>();
    if (partyIds.length > 0) {
      const memberRows = await db
        .select({
          partyId: charactersTable.partyId,
          name: charactersTable.name,
        })
        .from(charactersTable)
        .where(inArray(charactersTable.partyId, partyIds));

      for (const mr of memberRows) {
        if (!mr.partyId) continue;
        const list = memberMap.get(mr.partyId) || [];
        list.push(mr.name);
        memberMap.set(mr.partyId, list);
      }
    }

    // Build the latest update timestamp
    const latestDate =
      sessions.length > 0 ? sessions[0].startedAt.toISOString() : new Date().toISOString();

    // Build Atom entries
    const entries = sessions.map((s) => {
      const partyName = s.partyName ?? "Unknown Party";
      const cleanSummary = sanitizeSummaryForPublic(s.summary ?? null);
      const title = s.campaignName
        ? `${xmlEscape(partyName)} — ${xmlEscape(s.campaignName)}`
        : xmlEscape(partyName);

      const members = memberMap.get(s.partyId) || [];
      const memberLine =
        members.length > 0
          ? `Party: ${members.map((n) => xmlEscape(n)).join(", ")}`
          : "";

      const narration = narrationMap.get(s.id) || "";
      const truncatedNarration =
        narration.length > 500 ? narration.slice(0, 500) + "..." : narration;

      const descParts: string[] = [];
      if (cleanSummary) descParts.push(xmlEscape(cleanSummary));
      if (memberLine) descParts.push(memberLine);
      if (truncatedNarration) descParts.push(xmlEscape(truncatedNarration));

      const description = descParts.join("\n\n");
      const published = s.startedAt.toISOString();
      const updated = s.endedAt ? s.endedAt.toISOString() : published;
      const link = `${SITE}/journals?session=${s.id}`;

      return `  <entry>
    <title>${title}</title>
    <link href="${xmlEscape(link)}" rel="alternate"/>
    <id>urn:railroaded:session:${s.id}</id>
    <published>${published}</published>
    <updated>${updated}</updated>
    <summary type="text">${description}</summary>
  </entry>`;
    });

    const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Railroaded — Adventure Journals</title>
  <subtitle>AI-powered D&amp;D session chronicles</subtitle>
  <link href="${SITE}/journals" rel="alternate"/>
  <link href="${SITE}/spectator/feed.xml" rel="self"/>
  <id>urn:railroaded:feed</id>
  <updated>${latestDate}</updated>
  <author><name>Railroaded</name></author>
${entries.join("\n")}
</feed>`;

    c.header("Content-Type", "application/atom+xml; charset=UTF-8");
    c.header("Cache-Control", "public, max-age=300");
    return c.body(atom);
  } catch (err) {
    console.error("[RSS] Failed to generate feed:", err);
    const fallback = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Railroaded — Adventure Journals</title>
  <id>urn:railroaded:feed</id>
  <updated>${new Date().toISOString()}</updated>
</feed>`;
    c.header("Content-Type", "application/atom+xml; charset=UTF-8");
    return c.body(fallback);
  }
});

// GET /spectator/feed — redirect to /spectator/feed.xml for convenience
spectator.get("/feed", (c) => {
  return c.redirect("/spectator/feed.xml", 301);
});

// ============================
// Waitlist with referral tracking
// ============================

/** Generate a short unique referral code (8 chars, alphanumeric). */
function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/** POST /waitlist — sign up for the waitlist, optionally with a referral code. */
spectator.post("/waitlist", async (c) => {
  try {
    const body = await c.req.json<{ email: string; ref?: string }>();
    const email = body.email?.trim().toLowerCase();
    if (!email || !email.includes("@") || !email.includes(".")) {
      return c.json({ error: "Invalid email address" }, 400);
    }

    // Check for existing signup
    const existing = await db
      .select({ id: waitlistSignupsTable.id, referralCode: waitlistSignupsTable.referralCode })
      .from(waitlistSignupsTable)
      .where(eq(waitlistSignupsTable.email, email))
      .limit(1);

    if (existing.length > 0) {
      // Already signed up — return their existing referral code
      const position = await getWaitlistPosition(existing[0].referralCode);
      return c.json({
        already_registered: true,
        referral_code: existing[0].referralCode,
        position,
      });
    }

    // Validate referral code if provided
    let referredBy: string | null = null;
    if (body.ref) {
      const referrer = await db
        .select({ id: waitlistSignupsTable.id, referralCode: waitlistSignupsTable.referralCode })
        .from(waitlistSignupsTable)
        .where(eq(waitlistSignupsTable.referralCode, body.ref))
        .limit(1);
      if (referrer.length > 0) {
        referredBy = body.ref;
      }
    }

    // Generate unique referral code
    let referralCode = generateReferralCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const clash = await db
        .select({ id: waitlistSignupsTable.id })
        .from(waitlistSignupsTable)
        .where(eq(waitlistSignupsTable.referralCode, referralCode))
        .limit(1);
      if (clash.length === 0) break;
      referralCode = generateReferralCode();
    }

    // Insert new signup
    await db.insert(waitlistSignupsTable).values({
      email,
      referralCode,
      referredBy,
    });

    // Increment referrer's count
    if (referredBy) {
      await db
        .update(waitlistSignupsTable)
        .set({
          referralCount: sql`${waitlistSignupsTable.referralCount} + 1`,
        })
        .where(eq(waitlistSignupsTable.referralCode, referredBy));
    }

    const position = await getWaitlistPosition(referralCode);

    return c.json({
      referral_code: referralCode,
      position,
    }, 201);
  } catch (err) {
    console.error("[WAITLIST] Signup error:", err);
    return c.json({ error: "Failed to join waitlist" }, 500);
  }
});

/** Compute waitlist position for a given referral code.
 *  Position = (total signups) - (your referral count) clamped to >= 1.
 *  People who refer more move up the line. */
async function getWaitlistPosition(referralCode: string): Promise<number> {
  const signup = await db
    .select({
      referralCount: waitlistSignupsTable.referralCount,
      createdAt: waitlistSignupsTable.createdAt,
    })
    .from(waitlistSignupsTable)
    .where(eq(waitlistSignupsTable.referralCode, referralCode))
    .limit(1);

  if (signup.length === 0) return -1;

  // Count how many people signed up before this person
  const [{ value: aheadCount }] = await db
    .select({ value: count() })
    .from(waitlistSignupsTable)
    .where(lt(waitlistSignupsTable.createdAt, signup[0].createdAt));

  // Base position = signup order (1-indexed)
  const basePosition = aheadCount + 1;

  // Each referral moves you up 1 position, minimum position is 1
  const position = Math.max(1, basePosition - signup[0].referralCount);
  return position;
}

/** GET /waitlist/position/:code — get position and referral stats. */
spectator.get("/waitlist/position/:code", async (c) => {
  try {
    const code = c.req.param("code");
    const signup = await db
      .select({
        referralCode: waitlistSignupsTable.referralCode,
        referralCount: waitlistSignupsTable.referralCount,
      })
      .from(waitlistSignupsTable)
      .where(eq(waitlistSignupsTable.referralCode, code))
      .limit(1);

    if (signup.length === 0) {
      return c.json({ error: "Referral code not found" }, 404);
    }

    const position = await getWaitlistPosition(code);
    const [{ value: totalCount }] = await db
      .select({ value: count() })
      .from(waitlistSignupsTable);

    return c.json({
      position,
      referral_count: signup[0].referralCount,
      total_signups: totalCount,
    });
  } catch (err) {
    console.error("[WAITLIST] Position lookup error:", err);
    return c.json({ error: "Failed to look up position" }, 500);
  }
});

/** GET /waitlist/leaderboard — top 10 referrers. */
spectator.get("/waitlist/leaderboard", async (c) => {
  try {
    const leaders = await db
      .select({
        referralCode: waitlistSignupsTable.referralCode,
        referralCount: waitlistSignupsTable.referralCount,
      })
      .from(waitlistSignupsTable)
      .where(sql`${waitlistSignupsTable.referralCount} > 0`)
      .orderBy(desc(waitlistSignupsTable.referralCount))
      .limit(10);

    // Mask codes for privacy — show first 3 chars + "***"
    const leaderboard = leaders.map((l, i) => ({
      rank: i + 1,
      code_hint: l.referralCode.slice(0, 3) + "*****",
      referral_count: l.referralCount,
    }));

    return c.json({ leaderboard });
  } catch (err) {
    console.error("[WAITLIST] Leaderboard error:", err);
    return c.json({ error: "Failed to load leaderboard" }, 500);
  }
});

/** GET /waitlist/count — total waitlist signups (public stat). */
spectator.get("/waitlist/count", async (c) => {
  try {
    const [{ value: totalCount }] = await db
      .select({ value: count() })
      .from(waitlistSignupsTable);
    return c.json({ count: totalCount });
  } catch (err) {
    console.error("[WAITLIST] Count error:", err);
    return c.json({ error: "Failed to get count" }, 500);
  }
});

/** Strip instance suffixes like "Goblin A" → "Goblin" from monster names. */
export function stripMonsterSuffix(name: string): string {
  return name.trim().replace(/\s+[A-Z]$/, "");
}

/** Normalize monster name: replace hyphens/underscores with spaces, then title-case each word.
 *  e.g. "bandit-captain" → "Bandit Captain", "GOBLIN" → "Goblin" */
export function normalizeMonsterName(name: string): string {
  return name
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\B\w+/g, (c) => c.toLowerCase());
}

/** Count encounters per base monster name from combat_start event rows. */
export function countEncountersFromEvents(
  eventRows: { data: Record<string, unknown> }[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const row of eventRows) {
    const monsters = row.data.monsters as { name?: string; templateName?: string }[] | undefined;
    if (!Array.isArray(monsters)) continue;
    for (const m of monsters) {
      // Prefer templateName (added in fix) over instance name
      const raw = (m.templateName || m.name || "").trim();
      if (!raw) continue;
      const baseName = normalizeMonsterName(stripMonsterSuffix(raw));
      if (baseName.toLowerCase() === "unknown") continue;
      counts.set(baseName, (counts.get(baseName) || 0) + 1);
    }
  }
  return counts;
}

export interface BestiaryEntry {
  name: string;
  hp: number;
  ac: number;
  cr: number;
  xp: number;
  count: number;
}

/** Build the bestiary array from templates + encounter counts. */
export function buildBestiary(
  templates: { name: string; hpMax: number; ac: number; challengeRating: number; xpValue: number }[],
  encounterCounts: Map<string, number>
): BestiaryEntry[] {
  // Build a normalized lookup: normalized name → template name
  const normalizedTemplateNames = new Map<string, string>();
  for (const t of templates) {
    normalizedTemplateNames.set(normalizeMonsterName(t.name), t.name);
  }

  const bestiary: BestiaryEntry[] = templates.map((t) => {
    const normalized = normalizeMonsterName(t.name);
    return {
      name: t.name,
      hp: t.hpMax,
      ac: t.ac,
      cr: t.challengeRating,
      xp: t.xpValue,
      count: encounterCounts.get(normalized) || encounterCounts.get(t.name) || 0,
    };
  });

  // Add monsters from events that don't have templates (custom monsters)
  for (const [name, cnt] of encounterCounts) {
    if (!normalizedTemplateNames.has(name)) {
      bestiary.push({ name, hp: 0, ac: 0, cr: 0, xp: 0, count: cnt });
    }
  }

  // Sort by encounter count descending, then name
  bestiary.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return bestiary;
}

// GET /spectator/bestiary — monster compendium with encounter counts
spectator.get("/bestiary", async (c) => {
  try {
    const templates = await db
      .select({
        name: monsterTemplatesTable.name,
        hpMax: monsterTemplatesTable.hpMax,
        ac: monsterTemplatesTable.ac,
        challengeRating: monsterTemplatesTable.challengeRating,
        xpValue: monsterTemplatesTable.xpValue,
      })
      .from(monsterTemplatesTable)
      .orderBy(asc(monsterTemplatesTable.name));

    const combatEvents = await db
      .select({ data: sessionEventsTable.data })
      .from(sessionEventsTable)
      .where(eq(sessionEventsTable.type, "combat_start"));

    const encounterCounts = countEncountersFromEvents(combatEvents);
    const bestiary = buildBestiary(templates, encounterCounts);

    return c.json({ monsters: bestiary });
  } catch (err) {
    console.error("[DB] Failed to fetch bestiary:", err);
    return c.json({ monsters: [] });
  }
});

export default spectator;
