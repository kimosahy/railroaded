/**
 * Tests for GET /spectator/sessions/:id — session detail endpoint.
 *
 * DB-dependent: skipped when Postgres is unavailable.
 */
import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import spectator from "../src/api/spectator.ts";
import { db } from "../src/db/connection.ts";
import {
  gameSessions as gameSessionsTable,
  parties as partiesTable,
  sessionEvents as sessionEventsTable,
  characters as charactersTable,
  narrations as narrationsTable,
} from "../src/db/schema.ts";
import { eq } from "drizzle-orm";

const app = new Hono();
app.route("/spectator", spectator);

// --- Check if DB is available ---
let dbAvailable = false;
let testPartyId: string | null = null;
let testSessionId: string | null = null;
const PREFIX = `sessdetail-${Date.now()}`;

try {
  // Create a party
  const [party] = await db
    .insert(partiesTable)
    .values({ name: `${PREFIX}-party`, status: "adventuring" })
    .returning({ id: partiesTable.id });
  testPartyId = party.id;

  // Create a session
  const [session] = await db
    .insert(gameSessionsTable)
    .values({
      partyId: testPartyId,
      phase: "exploration",
      isActive: false,
      summary: "The heroes explored the dungeon.",
    })
    .returning({ id: gameSessionsTable.id });
  testSessionId = session.id;

  // Create a character in that party
  await db.insert(charactersTable).values({
    name: `${PREFIX}-Hero`,
    race: "human",
    class: "fighter",
    level: 2,
    xp: 300,
    hpCurrent: 12,
    hpMax: 14,
    ac: 16,
    abilityScores: { str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 15 },
    partyId: testPartyId,
    userId: null as unknown as string,
  });

  // Create some events
  await db.insert(sessionEventsTable).values([
    {
      sessionId: testSessionId,
      type: "room_enter",
      actorId: null,
      data: { roomName: "Entrance Hall" },
    },
    {
      sessionId: testSessionId,
      type: "combat_start",
      actorId: null,
      data: { monsters: ["Goblin A"] },
    },
  ]);

  // Create a narration
  await db.insert(narrationsTable).values({
    sessionId: testSessionId,
    content: "The torchlight flickered as the heroes entered the dungeon.",
  });

  dbAvailable = true;
} catch {
  // No DB — skip tests
}

describe("GET /spectator/sessions/:id", () => {
  test("returns 404 for non-existent session ID", async () => {
    if (!dbAvailable) return;

    const res = await app.request(
      "/spectator/sessions/00000000-0000-0000-0000-000000000000"
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Session not found");
    expect(body.code).toBe("NOT_FOUND");
  });

  test("returns full session detail for valid session ID", async () => {
    if (!dbAvailable || !testSessionId) return;

    const res = await app.request(`/spectator/sessions/${testSessionId}`);
    expect(res.status).toBe(200);
    const body = await res.json();

    // Session metadata
    expect(body.id).toBe(testSessionId);
    expect(body.partyId).toBe(testPartyId);
    expect(body.partyName).toBe(`${PREFIX}-party`);
    expect(body.phase).toBe("exploration");
    expect(body.isActive).toBe(false);
    expect(body.summary).toBe("The heroes explored the dungeon.");
    expect(body.startedAt).toBeDefined();
    expect(body.endedAt).toBeNull();

    // Members
    expect(body.members).toBeInstanceOf(Array);
    expect(body.members.length).toBeGreaterThanOrEqual(1);
    const hero = body.members.find(
      (m: { name: string }) => m.name === `${PREFIX}-Hero`
    );
    expect(hero).toBeDefined();
    expect(hero.class).toBe("fighter");
    expect(hero.level).toBe(2);
    expect(hero.race).toBe("human");
    expect(hero.ac).toBe(16);

    // Events
    expect(body.events).toBeInstanceOf(Array);
    expect(body.events.length).toBe(2);
    expect(body.events[0].type).toBe("room_enter");
    expect(body.events[1].type).toBe("combat_start");
    expect(body.events[0].timestamp).toBeDefined();

    // Narrations
    expect(body.narrations).toBeInstanceOf(Array);
    expect(body.narrations.length).toBe(1);
    expect(body.narrations[0].content).toContain("torchlight");

    // Event count
    expect(body.eventCount).toBe(2);
  });

  test("events are ordered chronologically (ascending)", async () => {
    if (!dbAvailable || !testSessionId) return;

    const res = await app.request(`/spectator/sessions/${testSessionId}`);
    const body = await res.json();

    for (let i = 1; i < body.events.length; i++) {
      const prev = new Date(body.events[i - 1].timestamp).getTime();
      const curr = new Date(body.events[i].timestamp).getTime();
      expect(curr).toBeGreaterThanOrEqual(prev);
    }
  });

  test("returns 404 for malformed UUID", async () => {
    if (!dbAvailable) return;

    const res = await app.request("/spectator/sessions/not-a-uuid");
    // Postgres will reject the malformed UUID, caught by error handler → 404
    expect(res.status).toBe(404);
  });
});

// Cleanup
if (dbAvailable && testSessionId && testPartyId) {
  try {
    await db
      .delete(narrationsTable)
      .where(eq(narrationsTable.sessionId, testSessionId));
    await db
      .delete(sessionEventsTable)
      .where(eq(sessionEventsTable.sessionId, testSessionId));
    await db
      .delete(gameSessionsTable)
      .where(eq(gameSessionsTable.id, testSessionId));
    await db
      .delete(charactersTable)
      .where(eq(charactersTable.partyId, testPartyId));
    await db.delete(partiesTable).where(eq(partiesTable.id, testPartyId));
  } catch {
    // Best-effort cleanup
  }
}
