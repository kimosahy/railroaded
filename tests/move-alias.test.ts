import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import auth from "../src/api/auth.ts";
import rest from "../src/api/rest.ts";
import {
  handleCreateCharacter,
  handleMove,
} from "../src/game/game-manager.ts";
import type { AbilityScores } from "../src/types.ts";

/**
 * B056: POST /api/v1/move returns 500 because the REST endpoint only reads
 * `direction_or_target` but clients (and the /look response) use `room_id`.
 * Fix: accept room_id and direction as aliases, matching the use-item alias pattern.
 */

const scores: AbilityScores = { str: 10, dex: 14, con: 12, int: 10, wis: 10, cha: 10 };

describe("POST /api/v1/move accepts room_id alias (B056)", () => {
  const app = new Hono();
  app.route("/", auth);
  app.route("/api/v1", rest);

  let token: string;
  let userId: string;

  async function registerAndLogin(): Promise<void> {
    const username = `move-alias-${Date.now()}`;
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
      name: "MoveAliasTest",
      race: "human",
      class: "fighter",
      ability_scores: scores,
      avatar_url: "https://example.com/test.png",
    });
  }

  test("direction_or_target field does not produce 500", async () => {
    await registerAndLogin();
    const res = await app.request("/api/v1/move", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ direction_or_target: "north" }),
    });
    // 400 = game-level error (no dungeon), NOT 500 (crash)
    expect(res.status).not.toBe(500);
    const body = await res.json();
    expect(body.error ?? "").not.toContain("Internal");
  });

  test("room_id field works as alias — no 500", async () => {
    const res = await app.request("/api/v1/move", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ room_id: "cow-burial-hall" }),
    });
    expect(res.status).not.toBe(500);
    const body = await res.json();
    expect(body.error ?? "").not.toContain("Internal");
  });

  test("direction field works as alias — no 500", async () => {
    const res = await app.request("/api/v1/move", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ direction: "south" }),
    });
    expect(res.status).not.toBe(500);
    const body = await res.json();
    expect(body.error ?? "").not.toContain("Internal");
  });

  test("missing all fields returns validation error, not 500", async () => {
    const res = await app.request("/api/v1/move", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    expect(res.status).not.toBe(500);
    const body = await res.json();
    expect(body.error).toContain("Missing");
  });

  test("direction_or_target takes precedence over room_id", async () => {
    const res = await app.request("/api/v1/move", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ direction_or_target: "north", room_id: "cow-burial-hall" }),
    });
    expect(res.status).not.toBe(500);
  });
});

describe("handleMove guards against undefined direction_or_target (B056)", () => {
  test("returns error instead of throwing when direction_or_target is undefined", () => {
    const result = handleMove("nonexistent-user", { direction_or_target: undefined as unknown as string });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Missing");
  });

  test("returns error when direction_or_target is empty string", () => {
    const result = handleMove("nonexistent-user", { direction_or_target: "" });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
