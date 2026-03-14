import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import auth from "../src/api/auth.ts";
import rest from "../src/api/rest.ts";
import {
  handleCreateCharacter,
  handleAwardLoot,
  getCharacterForUser,
} from "../src/game/game-manager.ts";
import type { AbilityScores } from "../src/types.ts";

/**
 * B010: use_item REST endpoint should accept both 'item_name' and 'item_id'
 * field names. The documented field was 'item_id' but server only read 'item_name'.
 */
describe("POST /api/v1/use-item accepts item_id alias (B010)", () => {
  const app = new Hono();
  app.route("/", auth);
  app.route("/api/v1", rest);

  const scores: AbilityScores = { str: 10, dex: 14, con: 12, int: 10, wis: 10, cha: 10 };
  let token: string;
  let userId: string;
  let charId: string;

  async function registerAndLogin(): Promise<void> {
    const username = `use-item-alias-${Date.now()}`;
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

    // Create character
    const createRes = await handleCreateCharacter(userId, {
      name: "ItemAliasTest",
      race: "human",
      class: "fighter",
      ability_scores: scores,
      avatar_url: "https://example.com/test.png",
    });
    charId = createRes.character!.id;
  }

  test("item_name field works (baseline)", async () => {
    await registerAndLogin();
    handleAwardLoot("dm-1", { player_id: charId, item_name: "Potion of Healing" });
    const char = getCharacterForUser(userId)!;
    char.hpCurrent = 5;

    const res = await app.request("/api/v1/use-item", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ item_name: "Potion of Healing" }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.healed).toBeGreaterThanOrEqual(4);
  });

  test("item_id field works as alias for item_name", async () => {
    handleAwardLoot("dm-1", { player_id: charId, item_name: "Potion of Healing" });
    const char = getCharacterForUser(userId)!;
    char.hpCurrent = 5;

    const res = await app.request("/api/v1/use-item", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ item_id: "Potion of Healing" }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.healed).toBeGreaterThanOrEqual(4);
  });

  test("'item' field works as alias for item_name (B008)", async () => {
    handleAwardLoot("dm-1", { player_id: charId, item_name: "Potion of Healing" });
    const char = getCharacterForUser(userId)!;
    char.hpCurrent = 5;

    const res = await app.request("/api/v1/use-item", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ item: "Potion of Healing" }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.healed).toBeGreaterThanOrEqual(4);
  });

  test("missing all item fields returns 400 with clear error (B008)", async () => {
    const res = await app.request("/api/v1/use-item", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ target_id: "someone" }),
    });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain("Missing required field: item_name");
    expect(body.error).not.toContain("undefined");
  });

  test("item_name takes precedence over item_id when both provided", async () => {
    handleAwardLoot("dm-1", { player_id: charId, item_name: "Potion of Healing" });
    const char = getCharacterForUser(userId)!;
    char.hpCurrent = 5;

    const res = await app.request("/api/v1/use-item", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ item_name: "Potion of Healing", item_id: "Nonexistent" }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.healed).toBeGreaterThanOrEqual(4);
  });
});
