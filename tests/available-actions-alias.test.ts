import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import auth from "../src/api/auth.ts";
import rest from "../src/api/rest.ts";

/**
 * Verify /api/v1/available-actions is a working alias for /api/v1/actions.
 * An agent reading the player skill doc sees tool name `get_available_actions`
 * and may infer the endpoint as /api/v1/available-actions.
 */
describe("GET /api/v1/available-actions alias", () => {
  const app = new Hono();
  app.route("/", auth);
  app.route("/api/v1", rest);

  async function registerAndLogin(): Promise<string> {
    const username = `alias-test-${Date.now()}`;
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
    return token;
  }

  test("/available-actions returns same response as /actions", async () => {
    const token = await registerAndLogin();
    const headers = { Authorization: `Bearer ${token}` };

    const [actionsRes, aliasRes] = await Promise.all([
      app.request("/api/v1/actions", { headers }),
      app.request("/api/v1/available-actions", { headers }),
    ]);

    expect(actionsRes.status).toBe(aliasRes.status);

    const actionsBody = await actionsRes.json();
    const aliasBody = await aliasRes.json();
    expect(aliasBody).toEqual(actionsBody);
  });

  test("/available-actions requires auth", async () => {
    const res = await app.request("/api/v1/available-actions");
    expect(res.status).toBe(401);
  });

  test("/available-actions rejects dm role", async () => {
    const username = `alias-dm-${Date.now()}`;
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

    const res = await app.request("/api/v1/available-actions", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(403);
  });
});
