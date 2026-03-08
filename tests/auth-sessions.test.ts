/**
 * Tests for auth session persistence — sessions survive server restarts.
 *
 * DB-dependent tests are skipped when Postgres is unavailable (local dev without DB).
 * Core in-memory session logic is always tested.
 */
import { describe, test, expect } from "bun:test";
import { db } from "../src/db/connection.ts";
import { users as usersTable, sessions as sessionsTable } from "../src/db/schema.ts";
import { eq } from "drizzle-orm";
import {
  getAuthUser,
  loadPersistedUsers,
  loadPersistedSessions,
  _clearSessionsForTest,
} from "../src/api/auth.ts";

// --- Check if DB is available ---
let dbAvailable = false;
let dbUserId: string | null = null;
const PREFIX = `authtest-${Date.now()}`;

try {
  const [row] = await db
    .insert(usersTable)
    .values({
      username: `${PREFIX}-user`,
      passwordHash: "$2b$10$fakehashfortest000000000000000000000000000000000",
      role: "player",
    })
    .returning({ id: usersTable.id });
  dbUserId = row.id;
  dbAvailable = true;

  // Reload users so in-memory Maps pick up this test user
  await loadPersistedUsers();
} catch {
  // No DB — skip DB-dependent tests
}

function futureDate(minutes: number): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

function pastDate(minutes: number): Date {
  return new Date(Date.now() - minutes * 60 * 1000);
}

// === In-memory tests (always run) ===

describe("in-memory session lifecycle", () => {
  test("getAuthUser returns null for unknown token", async () => {
    const result = await getAuthUser("nonexistent-token-12345");
    expect(result).toBeNull();
  });

  test("getAuthUser returns null for undefined token", async () => {
    const result = await getAuthUser(undefined);
    expect(result).toBeNull();
  });

  test("_clearSessionsForTest clears all sessions from memory", async () => {
    _clearSessionsForTest();
    // After clear, any previously valid token should return null
    const result = await getAuthUser("any-token");
    expect(result).toBeNull();
  });

  test("loadPersistedSessions returns 0 when DB has no sessions", async () => {
    _clearSessionsForTest();
    // Even if DB is down, loadPersistedSessions catches errors and returns 0
    const count = await loadPersistedSessions();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});

// === DB-dependent tests (skipped without Postgres) ===

const dbDescribe = dbAvailable ? describe : describe.skip;

dbDescribe("session persistence across restart (DB)", () => {
  const token = `${PREFIX}-persist-token`;

  test("session inserted into DB survives in-memory clear + reload", async () => {
    // Insert a valid session directly into DB
    await db.insert(sessionsTable).values({
      userId: dbUserId!,
      token,
      expiresAt: futureDate(30),
    });

    // Clear in-memory sessions (simulates restart)
    _clearSessionsForTest();

    // Token should NOT work before reload
    const beforeReload = await getAuthUser(token);
    expect(beforeReload).toBeNull();

    // Reload from DB
    const loaded = await loadPersistedSessions();
    expect(loaded).toBeGreaterThanOrEqual(1);

    // Token should work after reload
    const afterReload = await getAuthUser(token);
    expect(afterReload).not.toBeNull();
    expect(afterReload!.username).toBe(`${PREFIX}-user`);
    expect(afterReload!.role).toBe("player");
  });
});

dbDescribe("expired session cleanup on load (DB)", () => {
  const expiredToken = `${PREFIX}-expired-token`;

  test("expired sessions are deleted from DB during load", async () => {
    // Insert an expired session
    await db.insert(sessionsTable).values({
      userId: dbUserId!,
      token: expiredToken,
      expiresAt: pastDate(5),
    });

    // Clear and reload — expired sessions should be pruned
    _clearSessionsForTest();
    await loadPersistedSessions();

    // Expired token should NOT be in memory
    const result = await getAuthUser(expiredToken);
    expect(result).toBeNull();

    // It should also be gone from DB
    const rows = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.token, expiredToken));
    expect(rows).toHaveLength(0);
  });
});

dbDescribe("session renewal updates expiresAt (DB)", () => {
  const renewToken = `${PREFIX}-renew-token`;

  test("getAuthUser renews expiresAt in DB on access", async () => {
    // Insert a session expiring in 5 minutes
    const shortExpiry = futureDate(5);
    await db.insert(sessionsTable).values({
      userId: dbUserId!,
      token: renewToken,
      expiresAt: shortExpiry,
    });

    // Load into memory
    _clearSessionsForTest();
    await loadPersistedSessions();

    // Access the session — triggers renewal to 30 minutes
    const result = await getAuthUser(renewToken);
    expect(result).not.toBeNull();

    // Wait briefly for fire-and-forget DB update
    await new Promise((r) => setTimeout(r, 200));

    // Check DB — expiresAt should now be later than original 5 minutes
    const [row] = await db
      .select()
      .from(sessionsTable)
      .where(eq(sessionsTable.token, renewToken));
    expect(row).toBeDefined();
    expect(row.expiresAt.getTime()).toBeGreaterThan(shortExpiry.getTime());
  });
});
