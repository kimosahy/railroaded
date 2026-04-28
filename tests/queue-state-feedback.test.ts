import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { Hono } from "hono";
import auth from "../src/api/auth.ts";
import rest from "../src/api/rest.ts";
import { getState } from "../src/game/game-manager.ts";

/**
 * CC-260428 Task 2 — queue-state feedback on GET /actions and GET /dm/actions.
 *
 * - Queued players see `phase: "queued_waiting_dm"` (or `_dm_available`) with a
 *   `queue_status` object instead of the previous `phase: "idle"`.
 * - Queued DMs see `phase: "queued"` with `success: true` (changed from the
 *   prior `success: false` NOT_DM error).
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
afterAll(resetState);

async function registerAndLogin(role: "player" | "dm"): Promise<string> {
  const username = `qfeedback-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
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
  return token;
}

async function createCharacter(token: string): Promise<void> {
  const res = await app.request("/api/v1/character", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      name: `qfeedback-char-${Date.now()}`,
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

describe("Player queue-state feedback (Task 2)", () => {
  test("queued player → GET /actions returns phase=queued_waiting_dm and queue_status", async () => {
    const token = await registerAndLogin("player");
    await createCharacter(token);
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    await app.request("/api/v1/queue", { method: "POST", headers });

    const actionsRes = await app.request("/api/v1/actions", { headers });
    expect(actionsRes.status).toBe(200);
    const body = await actionsRes.json();
    expect(body.phase).toBe("queued_waiting_dm");
    expect(body.queue_status).toBeDefined();
    expect(body.queue_status.players_queued).toBe(1);
    expect(body.queue_status.dms_queued).toBe(0);
    expect(body.queue_status.blocking_reason).toBe("waiting_for_dm");
    expect(body.queue_status.position).toBe(1);
    expect(body.queue_status.queued_at).toBeDefined();
    expect(body.availableActions).toContain("leave_queue");
    // leave_queue must have its REST route in the actionRoutes map
    expect(body.actionRoutes.leave_queue).toEqual({ method: "DELETE", path: "/api/v1/queue" });
  });

  test("non-queued player with character → still phase=idle (not queued)", async () => {
    const token = await registerAndLogin("player");
    await createCharacter(token);
    const headers = { Authorization: `Bearer ${token}` };

    const actionsRes = await app.request("/api/v1/actions", { headers });
    const body = await actionsRes.json();
    expect(body.phase).toBe("idle");
    expect(body.queue_status).toBeUndefined();
    expect(body.availableActions).toContain("queue");
  });
});

describe("DM queue-state feedback (Task 2 Step 2d)", () => {
  test("queued DM → GET /dm/actions returns success:true, phase=queued, queue_status", async () => {
    const token = await registerAndLogin("dm");
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    const queueRes = await app.request("/api/v1/dm/queue", { method: "POST", headers });
    expect(queueRes.status).toBe(200);

    const actionsRes = await app.request("/api/v1/dm/actions", { headers });
    expect(actionsRes.status).toBe(200);
    const body = await actionsRes.json();
    expect(body.success).toBe(true);
    expect(body.phase).toBe("queued");
    expect(body.queue_status).toBeDefined();
    expect(body.queue_status.players_queued).toBe(0);
    expect(body.queue_status.dms_queued).toBe(1);
    expect(body.availableTools).toEqual(["leave_queue"]);
    // The actionRoutes map exposes the DELETE /dm/queue path
    expect(body.actionRoutes.leave_queue).toEqual({ method: "DELETE", path: "/api/v1/dm/queue" });
  });

  test("DM not in queue and not in party → still NOT_DM error (unchanged)", async () => {
    const token = await registerAndLogin("dm");
    const headers = { Authorization: `Bearer ${token}` };

    const actionsRes = await app.request("/api/v1/dm/actions", { headers });
    expect(actionsRes.status).toBe(400);
    const body = await actionsRes.json();
    expect(body.reason_code).toBe("NOT_DM");
  });
});
