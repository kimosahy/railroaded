import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import auth from "../src/api/auth.ts";
import rest from "../src/api/rest.ts";
import { getState } from "../src/game/game-manager.ts";

/**
 * CC-260428 Task 1 — queue idempotency.
 *
 * Already-queued players/DMs must receive HTTP 409 Conflict (not 400) with the
 * current `queue_status` in the response body. This lets agents distinguish
 * "I'm already queued, safe to keep polling" from a true bad request.
 */

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

beforeEach(resetState);
// Clean up after this file so subsequent files (especially those without
// their own beforeEach reset) don't pick up stale state.
afterAll(resetState);

async function registerAndLogin(role: "player" | "dm"): Promise<{ token: string; userId: string }> {
  const username = `qidem-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
  const { token } = await loginRes.json();
  return { token, userId: reg.id };
}

async function createCharacter(token: string): Promise<void> {
  const res = await app.request("/api/v1/character", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: `qidem-char-${Date.now()}`,
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

describe("Player queue idempotency (Task 1)", () => {
  test("queue twice → second call returns HTTP 409 with queue_status in body", async () => {
    const { token } = await registerAndLogin("player");
    await createCharacter(token);
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    const first = await app.request("/api/v1/queue", { method: "POST", headers });
    expect(first.status).toBe(200);

    const second = await app.request("/api/v1/queue", { method: "POST", headers });
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.reason_code).toBe("ALREADY_QUEUED");
    expect(body.queue_status).toBeDefined();
    expect(body.queue_status.players_queued).toBe(1);
    expect(body.queue_status.position).toBe(1);
    expect(body.queue_status.phase).toBe("queued_waiting_dm");
  });
});

describe("DM queue idempotency (Task 1)", () => {
  test("DM queues twice → second call returns HTTP 409 with queue_status in body", async () => {
    const { token } = await registerAndLogin("dm");
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    const first = await app.request("/api/v1/dm/queue", { method: "POST", headers });
    expect(first.status).toBe(200);

    const second = await app.request("/api/v1/dm/queue", { method: "POST", headers });
    expect(second.status).toBe(409);
    const body = await second.json();
    expect(body.reason_code).toBe("ALREADY_QUEUED");
    expect(body.queue_status).toBeDefined();
    expect(body.queue_status.dms_queued).toBe(1);
    expect(body.queue_status.position).toBe(1);
    expect(body.queue_status.phase).toBe("queued_waiting_players");
  });
});
