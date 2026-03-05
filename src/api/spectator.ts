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
} from "../db/schema.ts";
import { eq, desc, count, asc, isNotNull } from "drizzle-orm";

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

  // Track DB IDs of in-memory parties to avoid duplicates
  const knownDbIds = new Set<string>();

  for (const [id, party] of state.parties) {
    if (party.dbPartyId) knownDbIds.add(party.dbPartyId);

    // Skip parties with no active session — they're historical, not live
    if (!party.session) continue;

    const members = party.members.map((charId) => {
      const char = state.characters.get(charId);
      return {
        id: char?.dbCharId ?? charId,
        name: char?.name ?? "Unknown",
        class: char?.class ?? "unknown",
        level: char?.level ?? 1,
        avatarUrl: char?.avatarUrl ?? null,
        description: char?.description ?? null,
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

  // Fall back to DB for parties not in memory
  try {
    const dbParties = await db.select({
      id: partiesTable.id,
      name: partiesTable.name,
      dmUserId: partiesTable.dmUserId,
      status: partiesTable.status,
    }).from(partiesTable);

    const dbChars = await db.select({
      id: charactersTable.id,
      name: charactersTable.name,
      class: charactersTable.class,
      level: charactersTable.level,
      partyId: charactersTable.partyId,
      avatarUrl: charactersTable.avatarUrl,
      description: charactersTable.description,
    }).from(charactersTable).where(isNotNull(charactersTable.partyId));

    const charsByParty = new Map<string, typeof dbChars>();
    for (const ch of dbChars) {
      const list = charsByParty.get(ch.partyId!) ?? [];
      list.push(ch);
      charsByParty.set(ch.partyId!, list);
    }

    for (const dbParty of dbParties) {
      if (knownDbIds.has(dbParty.id)) continue;

      // Skip stale/ended parties — only in-memory parties are truly "live"
      // DB parties are historical context only, not active sessions
      if (dbParty.status === "ended" || dbParty.status === "completed" || dbParty.status === "disbanded") continue;

      const members = (charsByParty.get(dbParty.id) ?? []).map((m) => ({
        id: m.id,
        name: m.name,
        class: m.class,
        level: m.level,
        avatarUrl: m.avatarUrl ?? null,
        description: m.description ?? null,
      }));

      partyList.push({
        id: dbParty.id,
        name: dbParty.name ?? "Unknown Party",
        members,
        phase: null, // DB parties have no active session phase
        currentRoom: null,
        dmUserId: dbParty.dmUserId ?? null,
        monsterCount: 0,
      });
    }
  } catch (err) {
    console.error("[DB] Failed to fetch DB parties:", err);
  }

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
      return { id: char.dbCharId ?? charId, name: char.name, class: char.class, race: char.race, level: char.level, xp: char.xp, hpCurrent: char.hpCurrent, hpMax: char.hpMax, ac: char.ac, conditions: char.conditions, avatarUrl: char.avatarUrl, description: char.description };
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

    if (!dbParty) return c.json({ error: "Party not found" }, 404);

    const dbMembers = await db.select({
      id: charactersTable.id, name: charactersTable.name, class: charactersTable.class,
      race: charactersTable.race, level: charactersTable.level, xp: charactersTable.xp,
      hpCurrent: charactersTable.hpCurrent, hpMax: charactersTable.hpMax,
      ac: charactersTable.ac, conditions: charactersTable.conditions,
      avatarUrl: charactersTable.avatarUrl, description: charactersTable.description,
    }).from(charactersTable).where(eq(charactersTable.partyId, partyId));

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
      })),
      dmUserId: dbParty.dmUserId ?? null,
      phase: latestSession?.isActive ? latestSession.phase : dbParty.status,
      isActive: latestSession?.isActive ?? false,
      currentRoom: null, currentRoomDescription: null,
      monsters: [],
      recentEvents,
      sessionSummary: latestSession?.summary ?? null,
      eventCount: recentEvents.length,
    });
  } catch (err) {
    console.error("[DB] Failed to fetch party from DB:", err);
    return c.json({ error: "Party not found" }, 404);
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

    if (!dbChar) return c.json({ error: "Character not found" }, 404);

    // Try journal_entries first
    const journalRows = await db.select({
      content: journalEntriesTable.content,
      createdAt: journalEntriesTable.createdAt,
    }).from(journalEntriesTable)
      .where(eq(journalEntriesTable.characterId, characterId))
      .orderBy(asc(journalEntriesTable.createdAt));

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
    return c.json({ error: "Character not found" }, 404);
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
  }

  // Merge in-memory + DB characters (dedup by DB id)
  const charMap = new Map<string, LeaderboardEntry>();
  for (const [id, char] of state.characters) {
    charMap.set(char.dbCharId ?? id, {
      id: char.dbCharId ?? id, name: char.name,
      class: char.class, race: char.race, level: char.level, xp: char.xp,
      avatarUrl: char.avatarUrl, description: char.description,
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
    }).from(charactersTable);

    for (const ch of dbChars) {
      if (!charMap.has(ch.id)) {
        charMap.set(ch.id, ch);
      }
    }
    dbTotalCharacters = charMap.size;

    const [partyCountRow] = await db.select({ total: count() }).from(partiesTable);
    dbTotalParties = Math.max(dbTotalParties, Number(partyCountRow?.total ?? 0));
  } catch (err) {
    console.error("[DB] Failed to fetch DB characters for leaderboard:", err);
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

  return c.json({
    leaderboards: { highestLevel, mostXP, longestParties },
    totalCharacters: dbTotalCharacters,
    totalParties: dbTotalParties,
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
        summary: r.summary ?? null,
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
      .where(eq(narrationsTable.sessionId, sessionId))
      .orderBy(narrationsTable.createdAt);

    if (rows.length === 0) {
      return c.json({ narrations: [], sessionId });
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

    if (!dbCamp) return c.json({ error: "Campaign not found" }, 404);

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
    return c.json({ error: "Campaign not found" }, 404);
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
    return c.json({ error: "characterName is required and must be a non-empty string" }, 400);
  }
  if (typeof title !== "string" || title.trim().length === 0) {
    return c.json({ error: "title is required and must be a non-empty string" }, 400);
  }
  if (typeof content !== "string" || content.trim().length === 0) {
    return c.json({ error: "content is required and must be a non-empty string" }, 400);
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

    if (!dbPost) return c.json({ error: "Tavern post not found" }, 404);

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
    return c.json({ error: "Tavern post not found" }, 404);
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
      if (!dbPost) return c.json({ error: "Tavern post not found" }, 404);
    } catch {
      return c.json({ error: "Tavern post not found" }, 404);
    }
  }

  const body = await c.req.json() as Record<string, unknown>;

  const characterName = body.characterName;
  const content = body.content;

  if (typeof characterName !== "string" || characterName.trim().length === 0) {
    return c.json({ error: "characterName is required and must be a non-empty string" }, 400);
  }
  if (typeof content !== "string" || content.trim().length === 0) {
    return c.json({ error: "content is required and must be a non-empty string" }, 400);
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

export default spectator;
