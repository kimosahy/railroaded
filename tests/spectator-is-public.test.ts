/**
 * Sprint P §3.1: isPublic filter on spectator character endpoints.
 *
 * Per Eon v2 AR: each endpoint iterates state.characters (in-memory)
 * THEN merges DB queries — adding a WHERE clause to the DB query alone
 * does NOT filter in-memory test characters. Each endpoint needs
 * two-place filtering.
 *
 * These tests cover the in-memory side (DB side requires DATABASE_URL).
 */
import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import spectator from "../src/api/spectator.ts";
import {
  handleCreateCharacter,
  getState,
} from "../src/game/game-manager.ts";
import { _registerTestUser, _clearUsersForTest } from "../src/api/auth.ts";
import type { AbilityScores } from "../src/types.ts";

const scores: AbilityScores = { str: 12, dex: 14, con: 12, int: 10, wis: 10, cha: 10 };
let counter = 0;
const uid = (p: string) => `pub-${p}-${++counter}`;

const app = new Hono();
app.route("/spectator", spectator);

async function makeChar(userId: string, name: string, isPublic: boolean): Promise<string> {
  _registerTestUser({ userId, username: userId, role: "player" });
  await handleCreateCharacter(userId, {
    name,
    race: "human",
    class: "fighter",
    ability_scores: scores,
    avatar_url: "https://example.com/avatar.png",
  });
  // Mark non-public after creation (handleCreateCharacter defaults to public)
  const state = getState();
  for (const [, char] of state.characters) {
    if (char.userId === userId) {
      char.isPublic = isPublic;
      return char.id;
    }
  }
  throw new Error("character not found");
}

function resetState() {
  const { playerQueue, dmQueue, characters, parties } = getState();
  playerQueue.length = 0;
  dmQueue.length = 0;
  characters.clear();
  parties.clear();
  _clearUsersForTest();
}

describe("Sprint P §3.1 — isPublic filter on spectator endpoints", () => {
  beforeEach(resetState);
  afterEach(resetState);

  test("/spectator/characters excludes non-public in-memory characters", async () => {
    const publicId = await makeChar(uid("u"), "PublicHero", true);
    await makeChar(uid("u"), "TestProbe", false);

    const res = await app.request("/spectator/characters");
    expect(res.status).toBe(200);
    const body = await res.json() as { characters: Array<{ id: string; name: string }> };

    const names = body.characters.map(c => c.name);
    expect(names).toContain("PublicHero");
    expect(names).not.toContain("TestProbe");
    expect(body.characters.some(c => c.id === publicId)).toBe(true);
  });

  test("/spectator/leaderboard excludes non-public in-memory characters", async () => {
    await makeChar(uid("u"), "LeaderHero", true);
    await makeChar(uid("u"), "HiddenTest", false);

    const res = await app.request("/spectator/leaderboard");
    expect(res.status).toBe(200);
    const body = await res.json() as { leaderboard?: unknown; characters?: Array<{ name: string }> } & Record<string, unknown>;
    // The endpoint may return characters under various keys. Look for "HiddenTest" anywhere.
    const json = JSON.stringify(body);
    expect(json).toContain("LeaderHero");
    expect(json).not.toContain("HiddenTest");
  });

  test("/spectator/character-identities excludes non-public in-memory characters", async () => {
    await makeChar(uid("u"), "IdentityHero", true);
    await makeChar(uid("u"), "HiddenIdentity", false);

    const res = await app.request("/spectator/character-identities");
    expect(res.status).toBe(200);
    const body = await res.json() as { identities: Array<{ name: string }> };
    const names = body.identities.map(i => i.name);
    expect(names).toContain("IdentityHero");
    expect(names).not.toContain("HiddenIdentity");
  });

  test("/spectator/characters/:id returns 404 for non-public character (UUID-guess protection)", async () => {
    const hiddenId = await makeChar(uid("u"), "HiddenDetail", false);

    const res = await app.request(`/spectator/characters/${hiddenId}`);
    expect(res.status).toBe(404);
    const body = await res.json() as { code: string };
    expect(body.code).toBe("NOT_FOUND");
  });

  test("/spectator/characters/:id returns 200 for public character", async () => {
    const publicId = await makeChar(uid("u"), "PublicDetail", true);

    const res = await app.request(`/spectator/characters/${publicId}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { name: string };
    expect(body.name).toBe("PublicDetail");
  });

  test("/spectator/journals/:characterId returns empty events for non-public character", async () => {
    const hiddenId = await makeChar(uid("u"), "HiddenJournal", false);

    const res = await app.request(`/spectator/journals/${hiddenId}`);
    expect(res.status).toBe(200);
    const body = await res.json() as { events?: unknown[]; eventCount?: number };
    expect(body.eventCount ?? (body.events?.length ?? 0)).toBe(0);
  });
});
