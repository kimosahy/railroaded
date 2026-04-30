import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import auth from "../src/api/auth.ts";
import rest from "../src/api/rest.ts";
import { getState } from "../src/game/game-manager.ts";

/**
 * CC-260428 Task 3 — admin queue-state diagnostic endpoint.
 *
 * GET /api/v1/admin/queue-state with `Authorization: Bearer ${ADMIN_SECRET}` →
 * 200 + JSON snapshot. Without ADMIN_SECRET → 401. Without env var → 503.
 */

const ORIGINAL_ADMIN_SECRET = process.env.ADMIN_SECRET;
const TEST_ADMIN_SECRET = "test-admin-secret-cc260428";

const app = new Hono();
app.route("/", auth);
app.route("/api/v1", rest);

function resetState() {
  const { playerQueue, dmQueue, characters, parties } = getState();
  playerQueue.length = 0;
  dmQueue.length = 0;
  characters.clear();
  parties.clear();
}

beforeEach(() => {
  process.env.ADMIN_SECRET = TEST_ADMIN_SECRET;
  resetState();
});

afterAll(() => {
  if (ORIGINAL_ADMIN_SECRET === undefined) delete process.env.ADMIN_SECRET;
  else process.env.ADMIN_SECRET = ORIGINAL_ADMIN_SECRET;
  resetState();
});

async function registerAndLogin(role: "player" | "dm"): Promise<string> {
  const username = `aqs-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const regRes = await app.request("/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, role }),
  });
  const reg = await regRes.json();
  const loginRes = await app.request("/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: reg.password }),
  });
  return (await loginRes.json()).token;
}

async function createCharacter(token: string): Promise<void> {
  const res = await app.request("/api/v1/character", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: `aqs-char-${Date.now()}`,
      race: "human",
      class: "fighter",
      ability_scores: { str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 15 },
      avatar_url: "https://example.com/avatar.png",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Character creation failed: ${res.status} ${body}`);
  }
}

describe("GET /api/v1/admin/queue-state (Task 3)", () => {
  test("missing Authorization header → 401", async () => {
    const res = await app.request("/api/v1/admin/queue-state");
    expect(res.status).toBe(401);
  });

  test("wrong Bearer token → 401", async () => {
    const res = await app.request("/api/v1/admin/queue-state", {
      headers: { Authorization: "Bearer not-the-admin-secret" },
    });
    expect(res.status).toBe(401);
  });

  test("ADMIN_SECRET unset → 503", async () => {
    delete process.env.ADMIN_SECRET;
    const res = await app.request("/api/v1/admin/queue-state", {
      headers: { Authorization: `Bearer ${TEST_ADMIN_SECRET}` },
    });
    expect(res.status).toBe(503);
  });

  test("valid ADMIN_SECRET → 200 with full snapshot shape", async () => {
    const playerToken = await registerAndLogin("player");
    await createCharacter(playerToken);
    await app.request("/api/v1/queue", {
      method: "POST",
      headers: { Authorization: `Bearer ${playerToken}` },
    });

    const dmToken = await registerAndLogin("dm");
    await app.request("/api/v1/dm/queue", {
      method: "POST",
      headers: { Authorization: `Bearer ${dmToken}` },
    });

    const res = await app.request("/api/v1/admin/queue-state", {
      headers: { Authorization: `Bearer ${TEST_ADMIN_SECRET}` },
    });
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.timestamp).toBeDefined();
    // 1 player queued + 1 DM queued is below PARTY_SIZE_MIN=4 so the wait-window
    // timer fires after 30s but won't have triggered an immediate match.
    expect(Array.isArray(body.player_queue)).toBe(true);
    expect(body.player_queue.length).toBeGreaterThanOrEqual(1);
    expect(body.player_queue[0].userId).toBeDefined();
    expect(body.player_queue[0].queuedAt).toBeDefined();

    expect(Array.isArray(body.dm_queue)).toBe(true);
    expect(body.dm_queue.length).toBeGreaterThanOrEqual(1);

    expect(Array.isArray(body.active_sessions)).toBe(true);
    expect(body.matchmaker).toBeDefined();
    // MF-035 (CC-260430): RAILROADED_DM_PROMOTION_ENABLED defaults to true.
    // The field was renamed from autoDmProvisionEnabled → dmPromotionEnabled
    // to match the new semantics (Fix 3.2). The kill switch flipped the
    // default to on; explicit RAILROADED_DM_PROMOTION_ENABLED=false disables.
    expect(body.matchmaker.dmPromotionEnabled).toBe(true);
    expect(Array.isArray(body.recent_auto_dm_events)).toBe(true);
    // last_match_at can be null since no match formed yet
  });
});
