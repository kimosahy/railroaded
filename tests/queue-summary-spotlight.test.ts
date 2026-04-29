/**
 * CC-260429-FRONTEND-LIVE Tasks 3 + 4.
 *
 *  - GET /spectator/queue-summary  — public, counts only, no PII
 *  - GET /spectator/spotlight      — picks the highest-scoring active character
 */
import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import spectator from "../src/api/spectator.ts";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  getState,
} from "../src/game/game-manager.ts";
import type { AbilityScores } from "../src/types.ts";

const scores: AbilityScores = { str: 14, dex: 14, con: 14, int: 10, wis: 10, cha: 10 };
let counter = 0;
const uid = (p: string) => `qs-${p}-${++counter}`;

const app = new Hono();
app.route("/spectator", spectator);

describe("GET /spectator/queue-summary", () => {
  test("returns 200 with the expected shape and no auth", async () => {
    const res = await app.request("/spectator/queue-summary");
    expect(res.status).toBe(200);
    const body = await res.json() as Record<string, unknown>;

    expect(body).toHaveProperty("players_queued");
    expect(body).toHaveProperty("dms_queued");
    expect(body).toHaveProperty("active_sessions");
    expect(body).toHaveProperty("blocking_reason");
    expect(typeof body.players_queued).toBe("number");
    expect(typeof body.dms_queued).toBe("number");
    expect(typeof body.active_sessions).toBe("number");
    expect(typeof body.blocking_reason).toBe("string");
  });

  test("strips PII — no user IDs or character names in the body", async () => {
    // Queue someone with an identifying name first so we can confirm it's NOT echoed.
    const playerId = uid("priv-player");
    const charName = `Spy-${playerId}`;
    const r = await handleCreateCharacter(playerId, {
      name: charName,
      race: "human",
      class: "fighter",
      ability_scores: scores,
      avatar_url: "https://example.com/test-avatar.png",
    });
    expect(r.success).toBe(true);
    handleQueueForParty(playerId);

    const res = await app.request("/spectator/queue-summary");
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).not.toContain(playerId);
    expect(text).not.toContain(charName);
    expect(text).not.toMatch(/userId|user_id|characterName/);
  });
});

describe("GET /spectator/spotlight", () => {
  test("returns { character: null } when no active sessions exist", async () => {
    // Wipe transient state so this test stands alone — drop any in-memory parties.
    const { parties } = getState();
    for (const [, party] of parties) {
      if (party.session) party.session = { ...party.session, isActive: false };
    }

    const res = await app.request("/spectator/spotlight");
    expect(res.status).toBe(200);
    const body = await res.json() as { character: unknown };
    expect(body.character).toBeNull();
  });

  test("returns { character: {...} } when an active session has characters", async () => {
    // Form a party so a session is active.
    const pids = [uid("p"), uid("p"), uid("p"), uid("p")];
    const dmId = uid("dm");
    for (const id of pids) {
      const r = await handleCreateCharacter(id, {
        name: `Hero-${id}`,
        race: "human",
        class: "fighter",
        ability_scores: scores,
        avatar_url: "https://example.com/test-avatar.png",
      });
      expect(r.success).toBe(true);
      handleQueueForParty(id);
    }
    const dmRes = handleDMQueueForParty(dmId);
    expect(dmRes.success).toBe(true);

    // Bump one character's monstersKilled so the heuristic prefers it.
    const partyId = [...getState().parties.keys()].pop()!;
    const party = getState().parties.get(partyId)!;
    const star = getState().characters.get(party.members[0]!)!;
    star.monstersKilled = 7;

    const res = await app.request("/spectator/spotlight");
    expect(res.status).toBe(200);
    const body = await res.json() as { character: Record<string, unknown> | null };
    expect(body.character).not.toBeNull();
    expect(body.character).toHaveProperty("id");
    expect(body.character).toHaveProperty("name");
    expect(body.character).toHaveProperty("class");
    expect(body.character).toHaveProperty("race");
    expect(body.character).toHaveProperty("level");
    expect(body.character).toHaveProperty("monstersKilled");
    expect(body.character).toHaveProperty("sessionsPlayed");
    expect(body.character).toHaveProperty("dungeonsCleared");
    expect(body.character!.monstersKilled).toBe(7);
    expect(body.character!.name).toBe(star.name);
  });
});
