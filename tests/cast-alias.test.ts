import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import auth from "../src/api/auth.ts";
import rest from "../src/api/rest.ts";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
} from "../src/game/game-manager.ts";
import type { AbilityScores } from "../src/types.ts";

/**
 * B006: POST /api/v1/cast should accept both 'spell_name' and 'spell'
 * field names. Using 'spell' previously caused a 500 Internal Server Error.
 */
describe("POST /api/v1/cast accepts spell alias (B006)", () => {
  const app = new Hono();
  app.route("/", auth);
  app.route("/api/v1", rest);

  const scores: AbilityScores = { str: 10, dex: 14, con: 12, int: 16, wis: 10, cha: 10 };
  let token: string;
  let userId: string;

  async function registerAndLogin(): Promise<void> {
    const username = `cast-alias-${Date.now()}`;
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
    const result = await loginRes.json();
    token = result.token;
    userId = result.userId;

    // Create wizard character
    await handleCreateCharacter(userId, {
      name: "CastAliasWiz",
      race: "human",
      class: "wizard",
      ability_scores: scores,
      avatar_url: "https://example.com/test.png",
    });

    // Form a party so character is in a session
    for (let i = 0; i < 3; i++) {
      const pid = `cast-alias-filler-${Date.now()}-${i}`;
      await handleCreateCharacter(pid, {
        name: `Filler${i}`,
        race: "human",
        class: "fighter",
        ability_scores: scores,
        avatar_url: "https://example.com/test.png",
      });
      handleQueueForParty(pid);
    }
    handleQueueForParty(userId);
    handleDMQueueForParty(`cast-alias-dm-${Date.now()}`);
  }

  test("spell_name field works (baseline)", async () => {
    await registerAndLogin();

    const res = await app.request("/api/v1/cast", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ spell_name: "Fire Bolt" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error ?? "").not.toContain("Missing required field");
  });

  test("spell field works as alias for spell_name", async () => {
    const res = await app.request("/api/v1/cast", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ spell: "Fire Bolt" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error ?? "").not.toContain("Missing required field");
  });

  test("missing both spell_name and spell returns 400", async () => {
    const res = await app.request("/api/v1/cast", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target_id: "monster-1" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required field: spell_name");
  });

  test("spell_name takes precedence over spell when both provided", async () => {
    const res = await app.request("/api/v1/cast", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ spell_name: "Fire Bolt", spell: "Nonexistent" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error ?? "").not.toContain("Unknown spell");
  });
});
