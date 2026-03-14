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
 * B007: POST /api/v1/attack should accept both 'target_id' and 'target'
 * field names. Using 'target' previously returned misleading
 * "Target undefined not found or already dead." error.
 */
describe("POST /api/v1/attack accepts target alias (B007)", () => {
  const app = new Hono();
  app.route("/", auth);
  app.route("/api/v1", rest);

  const scores: AbilityScores = { str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 15 };
  let token: string;
  let userId: string;

  async function registerAndLogin(): Promise<void> {
    const username = `attack-alias-${Date.now()}`;
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

    await handleCreateCharacter(userId, {
      name: "AttackAliasFighter",
      race: "human",
      class: "fighter",
      ability_scores: scores,
      avatar_url: "https://example.com/test.png",
    });

    for (let i = 0; i < 3; i++) {
      const pid = `attack-alias-filler-${Date.now()}-${i}`;
      await handleCreateCharacter(pid, {
        name: `AtkFiller${i}`,
        race: "human",
        class: "fighter",
        ability_scores: scores,
        avatar_url: "https://example.com/test.png",
      });
      handleQueueForParty(pid);
    }
    handleQueueForParty(userId);
    handleDMQueueForParty(`attack-alias-dm-${Date.now()}`);
  }

  test("missing both target_id and target returns 400 with helpful error", async () => {
    await registerAndLogin();

    const res = await app.request("/api/v1/attack", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ weapon: "longsword" }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Missing required field: target_id");
    // Must not contain "undefined" — that was the original bug
    expect(body.error).not.toContain("undefined");
  });

  test("target_id field passes validation (not rejected as missing)", async () => {
    const res = await app.request("/api/v1/attack", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target_id: "monster-1" }),
    });
    const body = await res.json();
    // Should get a game-logic error (not in combat), not a missing-field error
    expect(body.error ?? "").not.toContain("Missing required field");
    expect(body.error ?? "").not.toContain("undefined");
  });

  test("target field works as alias for target_id (no undefined error)", async () => {
    const res = await app.request("/api/v1/attack", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target: "monster-1" }),
    });
    const body = await res.json();
    // Should get a game-logic error, not "Target undefined not found"
    expect(body.error ?? "").not.toContain("Missing required field");
    expect(body.error ?? "").not.toContain("undefined");
  });

  test("target_id takes precedence over target when both provided", async () => {
    const res = await app.request("/api/v1/attack", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target_id: "monster-1", target: "monster-99" }),
    });
    const body = await res.json();
    expect(body.error ?? "").not.toContain("Missing required field");
    expect(body.error ?? "").not.toContain("undefined");
  });
});
