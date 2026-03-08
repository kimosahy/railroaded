/**
 * Tests for B015: DM endpoints must not return "requires player role" errors.
 *
 * Root cause: player middleware mounted at "/" via rest.route("/", player) leaked
 * to /dm/* paths, causing unmatched DM endpoints to return "requires player role"
 * instead of a proper 404 or DM-specific response.
 */
import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";

/**
 * Build a minimal Hono app that mirrors the real rest.ts routing structure.
 * This isolates the middleware leaking behavior without needing real auth or game state.
 */
function buildTestApp() {
  interface AuthUser {
    userId: string;
    username: string;
    role: "player" | "dm";
  }

  type AuthEnv = { Variables: { user: AuthUser } };

  // Simulated auth middleware — role comes from X-Test-Role header
  const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
    const role = c.req.header("X-Test-Role") as "player" | "dm" | undefined;
    if (!role) return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    c.set("user", { userId: "test-user", username: "tester", role });
    await next();
  });

  const rest = new Hono<AuthEnv>();
  rest.use("/*", requireAuth);

  const player = new Hono<AuthEnv>();
  // Mirror the FIXED player middleware (with dm path guard)
  player.use("/*", createMiddleware<AuthEnv>(async (c, next) => {
    if (c.req.path.includes("/dm/") || c.req.path.endsWith("/dm")) {
      await next();
      return;
    }
    const user = c.get("user");
    if (user.role !== "player") {
      return c.json({ error: `Forbidden — requires 'player' role, you are '${user.role}'`, code: "FORBIDDEN" }, 403);
    }
    await next();
  }));
  player.get("/look", (c) => c.json({ ok: true }));

  const dm = new Hono<AuthEnv>();
  dm.use("/*", createMiddleware<AuthEnv>(async (c, next) => {
    const user = c.get("user");
    if (user.role !== "dm") {
      return c.json({ error: `Forbidden — requires 'dm' role, you are '${user.role}'`, code: "FORBIDDEN" }, 403);
    }
    await next();
  }));
  dm.post("/narrate", (c) => c.json({ ok: true }));

  rest.route("/dm", dm);
  rest.route("/", player);

  return rest;
}

/**
 * Build a BUGGY version (before fix) to verify the test catches the bug.
 */
function buildBuggyApp() {
  interface AuthUser {
    userId: string;
    username: string;
    role: "player" | "dm";
  }

  type AuthEnv = { Variables: { user: AuthUser } };

  const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
    const role = c.req.header("X-Test-Role") as "player" | "dm" | undefined;
    if (!role) return c.json({ error: "Unauthorized", code: "UNAUTHORIZED" }, 401);
    c.set("user", { userId: "test-user", username: "tester", role });
    await next();
  });

  const rest = new Hono<AuthEnv>();
  rest.use("/*", requireAuth);

  const player = new Hono<AuthEnv>();
  // BUGGY: no dm path guard — leaks to /dm/* paths
  player.use("/*", createMiddleware<AuthEnv>(async (c, next) => {
    const user = c.get("user");
    if (user.role !== "player") {
      return c.json({ error: `Forbidden — requires 'player' role, you are '${user.role}'`, code: "FORBIDDEN" }, 403);
    }
    await next();
  }));
  player.get("/look", (c) => c.json({ ok: true }));

  const dm = new Hono<AuthEnv>();
  dm.use("/*", createMiddleware<AuthEnv>(async (c, next) => {
    const user = c.get("user");
    if (user.role !== "dm") {
      return c.json({ error: `Forbidden — requires 'dm' role, you are '${user.role}'`, code: "FORBIDDEN" }, 403);
    }
    await next();
  }));
  dm.post("/narrate", (c) => c.json({ ok: true }));

  rest.route("/dm", dm);
  rest.route("/", player);

  return rest;
}

describe("B015: DM endpoints must not return inverted role check", () => {
  const app = buildTestApp();

  test("DM calling existing /dm/narrate gets 200 (not role error)", async () => {
    const res = await app.request("/dm/narrate", {
      method: "POST",
      headers: { "X-Test-Role": "dm", "Content-Type": "application/json" },
      body: JSON.stringify({ text: "test" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("DM calling non-existent /dm/sessions must NOT get 'requires player role'", async () => {
    const res = await app.request("/dm/sessions", {
      method: "GET",
      headers: { "X-Test-Role": "dm" },
    });
    // Should be 404 (not found), NOT 403 with "requires player role"
    expect(res.status).not.toBe(403);
    const text = await res.text();
    expect(text).not.toContain("requires 'player' role");
  });

  test("DM calling non-existent /dm/npc-dialogue must NOT get 'requires player role'", async () => {
    const res = await app.request("/dm/npc-dialogue", {
      method: "POST",
      headers: { "X-Test-Role": "dm", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).not.toBe(403);
    const text = await res.text();
    expect(text).not.toContain("requires 'player' role");
  });

  test("DM calling non-existent /dm/end-combat must NOT get 'requires player role'", async () => {
    const res = await app.request("/dm/end-combat", {
      method: "POST",
      headers: { "X-Test-Role": "dm", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).not.toBe(403);
    const text = await res.text();
    expect(text).not.toContain("requires 'player' role");
  });

  test("DM calling non-existent /dm/start-session must NOT get 'requires player role'", async () => {
    const res = await app.request("/dm/start-session", {
      method: "POST",
      headers: { "X-Test-Role": "dm", "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).not.toBe(403);
    const text = await res.text();
    expect(text).not.toContain("requires 'player' role");
  });

  test("player calling player route /look gets 200", async () => {
    const res = await app.request("/look", {
      method: "GET",
      headers: { "X-Test-Role": "player" },
    });
    expect(res.status).toBe(200);
  });

  test("DM calling player route /look gets 403 'requires player role'", async () => {
    const res = await app.request("/look", {
      method: "GET",
      headers: { "X-Test-Role": "dm" },
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("requires 'player' role");
  });

  test("player calling DM route /dm/narrate gets 403 'requires dm role'", async () => {
    const res = await app.request("/dm/narrate", {
      method: "POST",
      headers: { "X-Test-Role": "player", "Content-Type": "application/json" },
      body: JSON.stringify({ text: "test" }),
    });
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain("requires 'dm' role");
  });
});

describe("B015: buggy version reproduces the original bug", () => {
  const buggyApp = buildBuggyApp();

  test("buggy: DM calling /dm/sessions gets 'requires player role' (confirms bug)", async () => {
    const res = await buggyApp.request("/dm/sessions", {
      method: "GET",
      headers: { "X-Test-Role": "dm" },
    });
    const body = await res.json();
    // The buggy version SHOULD produce the inverted role error
    expect(body.error).toContain("requires 'player' role");
  });
});
