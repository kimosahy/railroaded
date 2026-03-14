import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import auth from "../src/api/auth.ts";
import rest from "../src/api/rest.ts";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  getPartyForUser,
} from "../src/game/game-manager.ts";
import type { AbilityScores } from "../src/types.ts";

/**
 * B017: POST /api/v1/pickup should accept both 'item_name' and 'item' field names.
 * Same root cause as B006-B008 — field alias not applied to pickup endpoint.
 */
describe("POST /api/v1/pickup accepts 'item' alias (B017)", () => {
  const app = new Hono();
  app.route("/", auth);
  app.route("/api/v1", rest);

  const scores: AbilityScores = { str: 10, dex: 14, con: 12, int: 10, wis: 10, cha: 10 };
  let token: string;
  let userId: string;

  async function registerAndSetup(): Promise<void> {
    const username = `pickup-alias-${Date.now()}`;
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

    // Create character for this player
    await handleCreateCharacter(userId, {
      name: "PickupAliasHero",
      race: "human",
      class: "fighter",
      ability_scores: scores,
      avatar_url: "https://example.com/test.png",
    });

    // Need 4 players total + DM to form a party
    const prefix = `pickup-alias-${Date.now()}`;
    for (let i = 2; i <= 4; i++) {
      const filler = `${prefix}-filler${i}`;
      await handleCreateCharacter(filler, {
        name: `Filler${i}`,
        race: "human",
        class: "fighter" as any,
        ability_scores: scores,
        avatar_url: "https://example.com/test.png",
      });
      handleQueueForParty(filler);
    }
    handleQueueForParty(userId);
    handleDMQueueForParty(`${prefix}-dm`);
  }

  function placeItemOnGround(itemName: string): void {
    const party = getPartyForUser(userId);
    if (!party) throw new Error("No party found");
    party.groundItems.push({ itemName, quantity: 1 });
  }

  test("item_name field works (baseline)", async () => {
    await registerAndSetup();
    placeItemOnGround("Torch");

    const res = await app.request("/api/v1/pickup", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ item_name: "Torch" }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.picked_up).toBe("Torch");
  });

  test("'item' field works as alias for item_name", async () => {
    placeItemOnGround("Rope");

    const res = await app.request("/api/v1/pickup", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ item: "Rope" }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.picked_up).toBe("Rope");
  });

  test("missing all item fields returns 400", async () => {
    const res = await app.request("/api/v1/pickup", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error).toContain("Missing required field: item_name");
  });

  test("item_name takes precedence over item when both provided", async () => {
    placeItemOnGround("Shield");

    const res = await app.request("/api/v1/pickup", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ item_name: "Shield", item: "Nonexistent" }),
    });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.picked_up).toBe("Shield");
  });
});
