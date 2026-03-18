/**
 * Tests for registration race condition fix (ie-B022).
 *
 * Verifies that concurrent registrations with the same username
 * don't bypass the uniqueness check due to the async password hash.
 */
import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import auth from "../src/api/auth.ts";

function buildApp(): Hono {
  const app = new Hono();
  app.route("/", auth);
  return app;
}

function register(app: Hono, username: string, role = "player") {
  return app.request("/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, role }),
  });
}

function login(app: Hono, username: string, password: string) {
  return app.request("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
}

describe("registration race condition (ie-B022)", () => {
  const app = buildApp();
  const PREFIX = `race-${Date.now()}`;

  test("concurrent registrations with same username: only one succeeds", async () => {
    const username = `${PREFIX}-dup`;

    // Fire both concurrently — the TOCTOU race would let both through without the fix
    const [res1, res2] = await Promise.all([
      register(app, username),
      register(app, username),
    ]);

    const statuses = [res1.status, res2.status].sort();
    // One should be 201 (created), the other 409 (conflict)
    expect(statuses).toEqual([201, 409]);
  });

  test("concurrent registrations with same username: winner can login", async () => {
    const username = `${PREFIX}-login`;

    const [res1, res2] = await Promise.all([
      register(app, username),
      register(app, username),
    ]);

    // Find the successful registration
    const winner = res1.status === 201 ? res1 : res2;
    const { password } = await winner.json();

    const loginRes = await login(app, username, password);
    expect(loginRes.status).toBe(200);
    const body = await loginRes.json();
    expect(body).toHaveProperty("token");
  });

  test("concurrent registrations with different usernames: all succeed with unique IDs", async () => {
    const usernames = [`${PREFIX}-a`, `${PREFIX}-b`, `${PREFIX}-c`];

    const responses = await Promise.all(usernames.map((u) => register(app, u)));

    const bodies = await Promise.all(responses.map((r) => r.json()));

    // All should succeed
    for (const res of responses) {
      expect(res.status).toBe(201);
    }

    // All IDs must be unique
    const ids = bodies.map((b) => b.id);
    expect(new Set(ids).size).toBe(3);

    // All passwords must work for login
    for (let i = 0; i < usernames.length; i++) {
      const loginRes = await login(app, usernames[i], bodies[i].password);
      expect(loginRes.status).toBe(200);
    }
  });
});
