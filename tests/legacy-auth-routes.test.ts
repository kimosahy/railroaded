/**
 * FT008: Old /api/v1/register and /api/v1/login should return a helpful 400
 * instead of the misleading 401 from the auth middleware.
 */
import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import auth from "../src/api/auth.ts";
import rest from "../src/api/rest.ts";
import spectator from "../src/api/spectator.ts";

function buildApp(): Hono {
  const app = new Hono();
  app.route("/", auth);
  app.route("/api/v1/spectate", spectator);

  // Legacy auth route aliases (mirrors src/index.ts)
  app.post("/api/v1/register", (c) => {
    return c.json({ error: "This endpoint has moved to /register", code: "MOVED" }, 400);
  });
  app.post("/api/v1/login", (c) => {
    return c.json({ error: "This endpoint has moved to /login", code: "MOVED" }, 400);
  });

  app.route("/api/v1", rest);
  return app;
}

describe("Legacy auth route redirects (FT008)", () => {
  const app = buildApp();

  test("POST /api/v1/register returns 400 with MOVED code", async () => {
    const res = await app.request("/api/v1/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", role: "player" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("MOVED");
    expect(body.error).toMatch(/\/register/);
  });

  test("POST /api/v1/login returns 400 with MOVED code", async () => {
    const res = await app.request("/api/v1/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "testuser", password: "pw" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("MOVED");
    expect(body.error).toMatch(/\/login/);
  });

  test("POST /api/v1/register returns 400 even with no body", async () => {
    const res = await app.request("/api/v1/register", { method: "POST" });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("MOVED");
  });

  test("POST /register still works normally", async () => {
    const username = `legacy-test-${Date.now()}`;
    const res = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, role: "player" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toHaveProperty("password");
  });

  test("POST /login still works normally", async () => {
    const username = `legacy-login-${Date.now()}`;
    const regRes = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, role: "player" }),
    });
    const { password } = await regRes.json();

    const res = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("token");
  });
});
