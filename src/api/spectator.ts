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
import { narrations as narrationsTable, gameSessions as gameSessionsTable, parties as partiesTable } from "../db/schema.ts";
import { eq, desc } from "drizzle-orm";

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
spectator.get("/parties", (c) => {
  const state = gm.getState();
  const partyList: {
    id: string;
    name: string;
    members: { id: string; name: string; class: string; level: number }[];
    phase: string | null;
    currentRoom: string | null;
    dmUserId: string | null;
    monsterCount: number;
  }[] = [];

  for (const [id, party] of state.parties) {
    const members = party.members.map((charId) => {
      const char = state.characters.get(charId);
      return {
        id: charId,
        name: char?.name ?? "Unknown",
        class: char?.class ?? "unknown",
        level: char?.level ?? 1,
      };
    });

    let currentRoom: string | null = null;
    if (party.dungeonState) {
      const roomId = party.dungeonState.currentRoomId;
      const room = party.dungeonState.rooms.get(roomId);
      currentRoom = room ? room.name : roomId;
    }

    partyList.push({
      id,
      name: party.name,
      members,
      phase: party.session?.phase ?? null,
      currentRoom,
      dmUserId: party.dmUserId,
      monsterCount: party.monsters.length,
    });
  }

  return c.json({ parties: partyList });
});

// GET /spectator/parties/:id — detailed party view with recent events
spectator.get("/parties/:id", (c) => {
  const partyId = c.req.param("id");
  const state = gm.getState();
  const party = state.parties.get(partyId);

  if (!party) {
    return c.json({ error: "Party not found" }, 404);
  }

  const members = party.members.map((charId) => {
    const char = state.characters.get(charId);
    if (!char) {
      return {
        id: charId,
        name: "Unknown",
        class: "unknown",
        race: "unknown",
        level: 1,
        xp: 0,
        hpCurrent: 0,
        hpMax: 0,
        ac: 10,
        conditions: [] as string[],
      };
    }
    return {
      id: charId,
      name: char.name,
      class: char.class,
      race: char.race,
      level: char.level,
      xp: char.xp,
      hpCurrent: char.hpCurrent,
      hpMax: char.hpMax,
      ac: char.ac,
      conditions: char.conditions,
    };
  });

  let currentRoom: string | null = null;
  let currentRoomDescription: string | null = null;
  if (party.dungeonState) {
    const roomId = party.dungeonState.currentRoomId;
    const room = party.dungeonState.rooms.get(roomId);
    if (room) {
      currentRoom = room.name;
      currentRoomDescription = room.description;
    } else {
      currentRoom = roomId;
    }
  }

  // Return the last 50 events for the session feed
  const recentEvents = party.events.slice(-50).map((e) => ({
    type: e.type,
    actorId: e.actorId,
    data: e.data,
    timestamp: e.timestamp.toISOString(),
  }));

  const sessionSummary = party.events.length > 0
    ? summarizeSession(party.events)
    : null;

  return c.json({
    id: partyId,
    name: party.name,
    members,
    dmUserId: party.dmUserId,
    phase: party.session?.phase ?? null,
    isActive: party.session?.isActive ?? false,
    currentRoom,
    currentRoomDescription,
    monsters: party.monsters.map((m) => ({
      id: m.id,
      name: m.name,
      hpCurrent: m.hpCurrent,
      hpMax: m.hpMax,
      ac: m.ac,
    })),
    recentEvents,
    sessionSummary,
    eventCount: party.events.length,
  });
});

// GET /spectator/journals — adventure journal entries (session summaries) from all parties
spectator.get("/journals", (c) => {
  const state = gm.getState();
  const journals: {
    partyId: string;
    memberNames: string[];
    summary: string;
    eventCount: number;
  }[] = [];

  for (const [partyId, party] of state.parties) {
    if (party.events.length === 0) continue;

    const memberNames = party.members.map((charId) => {
      const char = state.characters.get(charId);
      return char?.name ?? "Unknown";
    });

    const summary = summarizeSession(party.events);
    journals.push({
      partyId,
      partyName: party.name,
      memberNames,
      summary,
      eventCount: party.events.length,
    });
  }

  return c.json({ journals });
});

// GET /spectator/journals/:characterId — events filtered for a specific character
spectator.get("/journals/:characterId", (c) => {
  const characterId = c.req.param("characterId");
  const state = gm.getState();

  const character = state.characters.get(characterId);
  if (!character) {
    return c.json({ error: "Character not found" }, 404);
  }

  // Find the party this character belongs to
  let partyEvents: SessionEvent[] = [];
  if (character.partyId) {
    const party = state.parties.get(character.partyId);
    if (party) {
      partyEvents = party.events;
    }
  } else {
    // Search all parties for this character
    for (const [, party] of state.parties) {
      if (party.members.includes(characterId)) {
        partyEvents = party.events;
        break;
      }
    }
  }

  const filtered = filterEventsForCharacter(partyEvents, characterId);
  const summary = summarizeSession(filtered);

  return c.json({
    characterId,
    characterName: character.name,
    class: character.class,
    race: character.race,
    level: character.level,
    eventCount: filtered.length,
    summary,
    events: filtered.map((e) => ({
      type: e.type,
      actorId: e.actorId,
      data: e.data,
      timestamp: e.timestamp.toISOString(),
    })),
  });
});

// GET /spectator/leaderboard — computed from characters in game state
spectator.get("/leaderboard", (c) => {
  const state = gm.getState();

  interface LeaderboardEntry {
    id: string;
    name: string;
    class: string;
    race: string;
    level: number;
    xp: number;
  }

  const allChars: LeaderboardEntry[] = [];
  for (const [id, char] of state.characters) {
    allChars.push({
      id,
      name: char.name,
      class: char.class,
      race: char.race,
      level: char.level,
      xp: char.xp,
    });
  }

  // Highest level (then by XP as tiebreaker)
  const highestLevel = [...allChars]
    .sort((a, b) => b.level - a.level || b.xp - a.xp)
    .slice(0, 10);

  // Most XP
  const mostXP = [...allChars]
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 10);

  // Longest-surviving parties (most events as a proxy for activity)
  interface PartyLeaderboardEntry {
    id: string;
    name: string;
    memberNames: string[];
    memberCount: number;
    eventCount: number;
    phase: string | null;
  }

  const partyEntries: PartyLeaderboardEntry[] = [];
  for (const [partyId, party] of state.parties) {
    const memberNames = party.members.map((charId) => {
      const char = state.characters.get(charId);
      return char?.name ?? "Unknown";
    });
    partyEntries.push({
      id: partyId,
      name: party.name,
      memberNames,
      memberCount: party.members.length,
      eventCount: party.events.length,
      phase: party.session?.phase ?? null,
    });
  }

  const longestParties = [...partyEntries]
    .sort((a, b) => b.eventCount - a.eventCount)
    .slice(0, 10);

  return c.json({
    leaderboards: {
      highestLevel,
      mostXP,
      longestParties,
    },
    totalCharacters: allChars.length,
    totalParties: partyEntries.length,
  });
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

// --- Tavern Board ---

// GET /spectator/tavern — list all tavern posts (newest first)
spectator.get("/tavern", (c) => {
  const limit = Number(c.req.query("limit") ?? "50");
  const offset = Number(c.req.query("offset") ?? "0");

  const allPosts = [...tavernPosts.values()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const paged = allPosts.slice(offset, offset + limit);

  return c.json({
    posts: paged.map((p) => ({
      id: p.id,
      characterName: p.characterName,
      title: p.title,
      content: p.content,
      createdAt: p.createdAt,
      replyCount: p.replies.length,
    })),
    total: allPosts.length,
    limit,
    offset,
  });
});

// POST /spectator/tavern — create a new tavern post
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

  const post: TavernPost = {
    id: nextTavernId(),
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
spectator.get("/tavern/:id", (c) => {
  const postId = c.req.param("id");
  const post = tavernPosts.get(postId);

  if (!post) {
    return c.json({ error: "Tavern post not found" }, 404);
  }

  return c.json({ post });
});

// POST /spectator/tavern/:id/reply — reply to a tavern post
spectator.post("/tavern/:id/reply", async (c) => {
  const postId = c.req.param("id");
  const post = tavernPosts.get(postId);

  if (!post) {
    return c.json({ error: "Tavern post not found" }, 404);
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

  const reply: TavernReply = {
    id: nextTavernId(),
    characterName: characterName.trim(),
    content: content.trim(),
    createdAt: new Date().toISOString(),
  };

  post.replies.push(reply);

  return c.json({ reply }, 201);
});

export default spectator;
