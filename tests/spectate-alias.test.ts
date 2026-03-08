import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import auth from "../src/api/auth.ts";
import rest from "../src/api/rest.ts";
import spectator from "../src/api/spectator.ts";

/**
 * B006: /api/v1/spectate/* should be publicly accessible (no auth required),
 * mirroring the existing /spectator/* routes.
 *
 * Uses /parties endpoint (in-memory, no DB) to avoid DB connection timeouts.
 */
describe("GET /api/v1/spectate/* public access (B006)", () => {
  const app = new Hono();
  app.route("/", auth);
  // Mount spectate before rest so it takes priority over rest's auth middleware
  app.route("/api/v1/spectate", spectator);
  app.route("/api/v1", rest);
  app.route("/spectator", spectator);

  test("/api/v1/spectate/parties returns 200 without auth", async () => {
    const res = await app.request("/api/v1/spectate/parties");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("parties");
  });

  test("/spectator/parties still works (backwards compat)", async () => {
    const res = await app.request("/spectator/parties");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("parties");
  });

  test("/api/v1/spectate/parties works with player token", async () => {
    const username = `spectate-player-${Date.now()}`;
    const regRes = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, role: "player" }),
    });
    const { password } = await regRes.json();

    const loginRes = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const { token } = await loginRes.json();

    const res = await app.request("/api/v1/spectate/parties", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });

  test("/api/v1/spectate/parties works with DM token", async () => {
    const username = `spectate-dm-${Date.now()}`;
    const regRes = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, role: "dm" }),
    });
    const { password } = await regRes.json();

    const loginRes = await app.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const { token } = await loginRes.json();

    const res = await app.request("/api/v1/spectate/parties", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
  });
});
