/**
 * Tests for account auth (JWT-based human accounts).
 *
 * Tests the account registration, login, refresh, and logout flows.
 * DB-dependent — skipped when Postgres is unavailable.
 */
import { describe, test, expect, beforeAll } from "bun:test";
import { db } from "../src/db/connection.ts";
import { accounts, refreshTokens } from "../src/db/schema.ts";
import { eq } from "drizzle-orm";

// Check if DB is available
let dbAvailable = false;
try {
  await db.select().from(accounts).limit(1);
  dbAvailable = true;
} catch {
  // No DB
}

const dbDescribe = dbAvailable ? describe : describe.skip;

// Import the Hono app for request testing
import accountAuth from "../src/api/account-auth.ts";
import { Hono } from "hono";

const app = new Hono();
app.route("/api/v1/auth", accountAuth);

const PREFIX = `authtest-${Date.now()}`;
const TEST_EMAIL = `${PREFIX}@test.railroaded.ai`;
const TEST_PASSWORD = "testpassword123";
const TEST_DISPLAY_NAME = "Test User";

dbDescribe("account registration", () => {
  test("POST /api/v1/auth/register creates account and returns tokens", async () => {
    const res = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        display_name: TEST_DISPLAY_NAME,
      }),
    });

    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.account.email).toBe(TEST_EMAIL.toLowerCase());
    expect(body.account.display_name).toBe(TEST_DISPLAY_NAME);
    expect(body.access_token).toBeDefined();
    expect(body.refresh_token).toBeDefined();
    expect(body.expires_at).toBeDefined();
  });

  test("rejects duplicate email", async () => {
    const res = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        display_name: "Another User",
      }),
    });

    expect(res.status).toBe(409);
  });

  test("rejects short password", async () => {
    const res = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: `short-${PREFIX}@test.com`,
        password: "short",
        display_name: "Test",
      }),
    });

    expect(res.status).toBe(400);
  });

  test("rejects invalid email format", async () => {
    const res = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "not-an-email",
        password: TEST_PASSWORD,
        display_name: "Test",
      }),
    });

    expect(res.status).toBe(400);
  });
});

dbDescribe("account login", () => {
  test("POST /api/v1/auth/login with valid credentials returns tokens", async () => {
    const res = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.access_token).toBeDefined();
    expect(body.refresh_token).toBeDefined();
    expect(body.account.email).toBe(TEST_EMAIL.toLowerCase());
  });

  test("rejects wrong password", async () => {
    const res = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: "wrongpassword123",
      }),
    });

    expect(res.status).toBe(401);
  });

  test("rejects non-existent email", async () => {
    const res = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "noone@nowhere.com",
        password: TEST_PASSWORD,
      }),
    });

    expect(res.status).toBe(401);
  });
});

dbDescribe("token refresh", () => {
  let refreshToken: string;

  beforeAll(async () => {
    const res = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      }),
    });
    const body = await res.json();
    refreshToken = body.refresh_token;
  });

  test("POST /api/v1/auth/refresh exchanges refresh token for new access token", async () => {
    const res = await app.request("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.access_token).toBeDefined();
    expect(body.refresh_token).toBeDefined();
    // Old refresh token should be invalidated (one-time use)
    expect(body.refresh_token).not.toBe(refreshToken);
  });

  test("rejects reused refresh token", async () => {
    const res = await app.request("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }), // already used
    });

    expect(res.status).toBe(401);
  });
});

dbDescribe("logout", () => {
  test("POST /api/v1/auth/logout invalidates refresh token", async () => {
    // Get fresh tokens
    const loginRes = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
      }),
    });
    const { refresh_token } = await loginRes.json();

    // Logout
    const logoutRes = await app.request("/api/v1/auth/logout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token }),
    });

    expect(logoutRes.status).toBe(200);

    // Refresh should fail now
    const refreshRes = await app.request("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token }),
    });

    expect(refreshRes.status).toBe(401);
  });
});

// Always-run tests (no DB required)
describe("account auth validation", () => {
  test("register rejects missing fields", async () => {
    const res = await app.request("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  test("login rejects missing fields", async () => {
    const res = await app.request("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });

  test("refresh rejects missing refresh_token", async () => {
    const res = await app.request("/api/v1/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
  });
});
