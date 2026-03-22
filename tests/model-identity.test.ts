import { describe, test, expect } from "bun:test";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  handleAttack,
  getState,
} from "../src/game/game-manager.ts";
import { getModelIdentity } from "../src/api/auth.ts";
import type { AbilityScores } from "../src/types.ts";

// We test the admin endpoint (Hono route) separately since it requires HTTP.
// For the model identity plumbing (getModelIdentity, event tagging), we test
// via direct game-manager calls to avoid DB timeouts in CI.

const scores: AbilityScores = { str: 14, dex: 14, con: 12, int: 10, wis: 10, cha: 10 };

describe("model identity", () => {
  // --- Unit tests for getModelIdentity (no DB needed) ---

  test("getModelIdentity returns null for nonexistent user", () => {
    const model = getModelIdentity("nonexistent-user-id");
    expect(model).toBeNull();
  });

  // --- Admin endpoint unit tests via Hono ---

  test("register-model-identity endpoint exists and validates inputs", async () => {
    // Lazy-load Hono to avoid import order issues
    const { Hono } = await import("hono");
    const authRoutes = (await import("../src/api/auth.ts")).default;
    const testApp = new Hono();
    testApp.route("/", authRoutes);

    const origSecret = process.env.ADMIN_SECRET;
    process.env.ADMIN_SECRET = "mi-test-secret-2";

    // Test 401 without correct secret
    const res401 = await testApp.request("/admin/register-model-identity", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer wrong" },
      body: JSON.stringify({ userId: "any", modelProvider: "anthropic", modelName: "opus" }),
    });
    expect(res401.status).toBe(401);

    // Test 400 when fields missing
    const res400 = await testApp.request("/admin/register-model-identity", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer mi-test-secret-2" },
      body: JSON.stringify({ userId: "any" }),
    });
    expect(res400.status).toBe(400);

    // Test 404 for unknown user
    const res404 = await testApp.request("/admin/register-model-identity", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer mi-test-secret-2" },
      body: JSON.stringify({ userId: "nonexistent", modelProvider: "anthropic", modelName: "opus" }),
    });
    expect(res404.status).toBe(404);

    // Cleanup
    if (origSecret) process.env.ADMIN_SECRET = origSecret;
    else delete process.env.ADMIN_SECRET;
  });

  // --- Event tagging via game-manager (no HTTP / DB needed) ---

  test("setup: create party for event tagging tests", async () => {
    const classes = ["fighter", "rogue", "cleric", "wizard"] as const;
    for (let i = 1; i <= 4; i++) {
      await handleCreateCharacter(`mi-evt-player-${i}`, {
        name: `MIEvtHero${i}`,
        race: "human",
        class: classes[i - 1],
        ability_scores: scores,
        avatar_url: "https://example.com/test-avatar.png",
      });
      handleQueueForParty(`mi-evt-player-${i}`);
    }
    const dmResult = handleDMQueueForParty("mi-evt-dm-1");
    expect(dmResult.success).toBe(true);
    expect(dmResult.data!.matched).toBe(true);
  });

  test("party formed and characters exist", () => {
    const state = getState();
    const hero1 = [...state.characters.values()].find(c => c.name === "MIEvtHero1");
    expect(hero1).toBeDefined();
    expect(hero1!.userId).toBe("mi-evt-player-1");
  });

  test("getModelIdentity returns null for user without model set", () => {
    // mi-evt-player-1 hasn't had model identity registered
    const model = getModelIdentity("mi-evt-player-1");
    expect(model).toBeNull();
  });

  test("events from user without model identity do not include modelIdentity field", () => {
    const state = getState();
    // Find the party with our heroes
    let testParty: typeof state.parties extends Map<string, infer V> ? V : never = undefined as never;
    for (const [, party] of state.parties) {
      const hasMIEvtHero = party.members.some(id => {
        const char = state.characters.get(id);
        return char?.name === "MIEvtHero1";
      });
      if (hasMIEvtHero) { testParty = party; break; }
    }
    expect(testParty).toBeDefined();

    // All events in this party should NOT have modelIdentity since no user has it set
    for (const event of testParty.events) {
      if (event.actorId) {
        expect(event.data.modelIdentity).toBeUndefined();
      }
    }
  });
});
