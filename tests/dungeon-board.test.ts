/**
 * Tests for GET /spectator/dungeons — dungeon board stats endpoint.
 *
 * Verifies that parties linked to campaign templates produce correct
 * attempt counts, completion rates, and highest-level stats.
 *
 * DB-dependent: skipped when Postgres is unavailable.
 */
import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import spectator from "../src/api/spectator.ts";
import { db } from "../src/db/connection.ts";
import {
  campaignTemplates as campaignTemplatesTable,
  rooms as roomsTable,
  parties as partiesTable,
  gameSessions as gameSessionsTable,
  characters as charactersTable,
} from "../src/db/schema.ts";
import { eq } from "drizzle-orm";

const app = new Hono();
app.route("/spectator", spectator);

// --- Check if DB is available + seed test data ---
let dbAvailable = false;
const PREFIX = `dungboard-${Date.now()}`;
let templateId: string | null = null;

try {
  // Create a campaign template
  const [tpl] = await db
    .insert(campaignTemplatesTable)
    .values({
      name: `${PREFIX}-dungeon`,
      description: "A test dungeon",
      difficultyTier: "easy",
      estimatedSessions: 1,
    })
    .returning({ id: campaignTemplatesTable.id });
  templateId = tpl.id;

  // Create 2 rooms for the template
  await db.insert(roomsTable).values([
    {
      campaignTemplateId: templateId,
      name: "Entry Hall",
      description: "A dark hall",
      type: "entry",
    },
    {
      campaignTemplateId: templateId,
      name: "Boss Room",
      description: "A dangerous room",
      type: "boss",
    },
  ]);

  // Create a party linked to this template
  const [party1] = await db
    .insert(partiesTable)
    .values({
      name: `${PREFIX}-party1`,
      campaignTemplateId: templateId,
      status: "adventuring",
    })
    .returning({ id: partiesTable.id });

  // Create a completed session for this party
  await db.insert(gameSessionsTable).values({
    partyId: party1.id,
    phase: "exploration",
    isActive: false,
    endedAt: new Date(),
    summary: "The heroes cleared the dungeon.",
  });

  // Create an active (in-progress) session
  await db.insert(gameSessionsTable).values({
    partyId: party1.id,
    phase: "combat",
    isActive: true,
  });

  // Create a level 3 character in the party
  await db.insert(charactersTable).values({
    name: `${PREFIX}-Hero`,
    race: "human",
    class: "fighter",
    level: 3,
    xp: 900,
    hpCurrent: 28,
    hpMax: 28,
    ac: 16,
    abilityScores: { str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 15 },
    partyId: party1.id,
    userId: null as unknown as string,
  });

  dbAvailable = true;
} catch {
  // No DB — skip tests
}

describe("GET /spectator/dungeons", () => {
  test("returns dungeon stats with correct attempts and completion rate", async () => {
    if (!dbAvailable) return;

    const res = await app.request("/spectator/dungeons");
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.dungeons).toBeInstanceOf(Array);

    // Find our test dungeon
    const dungeon = body.dungeons.find(
      (d: { name: string }) => d.name === `${PREFIX}-dungeon`
    );
    expect(dungeon).toBeDefined();

    // Room count
    expect(dungeon.roomCount).toBe(2);

    // 2 sessions total (1 completed + 1 active)
    expect(dungeon.totalSessions).toBe(2);

    // 1 out of 2 completed = 50%
    expect(dungeon.completionRate).toBe(50);

    // Highest level is 3
    expect(dungeon.highestLevel).toBe(3);
  });

  test("dungeon with no linked parties shows 0 attempts", async () => {
    if (!dbAvailable) return;

    // Create a template with no parties
    const [emptyTpl] = await db
      .insert(campaignTemplatesTable)
      .values({
        name: `${PREFIX}-empty`,
        description: "An empty dungeon",
        difficultyTier: "medium",
        estimatedSessions: 1,
      })
      .returning({ id: campaignTemplatesTable.id });

    const res = await app.request("/spectator/dungeons");
    const body = await res.json();

    const dungeon = body.dungeons.find(
      (d: { name: string }) => d.name === `${PREFIX}-empty`
    );
    expect(dungeon).toBeDefined();
    expect(dungeon.totalSessions).toBe(0);
    expect(dungeon.completionRate).toBe(0);
    expect(dungeon.highestLevel).toBe(0);

    // Clean up
    await db
      .delete(campaignTemplatesTable)
      .where(eq(campaignTemplatesTable.id, emptyTpl.id));
  });

  test("notable parties include member details", async () => {
    if (!dbAvailable) return;

    const res = await app.request("/spectator/dungeons");
    const body = await res.json();

    const dungeon = body.dungeons.find(
      (d: { name: string }) => d.name === `${PREFIX}-dungeon`
    );
    expect(dungeon).toBeDefined();
    expect(dungeon.parties).toBeInstanceOf(Array);
    expect(dungeon.parties.length).toBeGreaterThanOrEqual(1);

    const party = dungeon.parties.find(
      (p: { name: string }) => p.name === `${PREFIX}-party1`
    );
    expect(party).toBeDefined();
    expect(party.members).toBeInstanceOf(Array);
    expect(party.members.length).toBeGreaterThanOrEqual(1);

    const hero = party.members.find(
      (m: { name: string }) => m.name === `${PREFIX}-Hero`
    );
    expect(hero).toBeDefined();
    expect(hero.class).toBe("fighter");
    expect(hero.level).toBe(3);
  });
});
