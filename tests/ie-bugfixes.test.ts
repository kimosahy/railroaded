import { describe, test, expect } from "bun:test";
import {
  handleCreateCharacter,
  handleGetAvailableActions,
  handleQueueForParty,
  handleDMQueueForParty,
  handleSpawnEncounter,
  handleNarrate,
  handleNarrateTo,
  getPartyForUser,
} from "../src/game/game-manager.ts";
import type { AbilityScores } from "../src/types.ts";

const scores: AbilityScores = { str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 15 };

async function setupParty(prefix: string): Promise<{ players: string[]; dm: string }> {
  const players = [`${prefix}-p1`, `${prefix}-p2`, `${prefix}-p3`, `${prefix}-p4`];
  const dm = `${prefix}-dm`;
  for (let i = 0; i < 4; i++) {
    await handleCreateCharacter(players[i], {
      name: `${prefix}Hero${i + 1}`,
      race: "human",
      class: "fighter" as any,
      ability_scores: scores,
      avatar_url: "https://example.com/test.png",
    });
    handleQueueForParty(players[i]);
  }
  handleDMQueueForParty(dm);
  return { players, dm };
}

// === B017: spawn-encounter with `type` param resolves template correctly ===
describe("B017: spawn-encounter template lookup with type param", () => {
  let dm: string;

  test("setup party", async () => {
    const setup = await setupParty("b017");
    dm = setup.dm;
    expect(getPartyForUser(setup.players[0])).not.toBeNull();
  });

  test("spawn with {type: 'goblin'} resolves to Goblin, not unknown", () => {
    const result = handleSpawnEncounter(dm, { monsters: [{ type: "goblin", count: 1 }] } as any);
    expect(result.success).toBe(true);
    const monsters = (result.data as any)?.monsters;
    expect(monsters).toBeDefined();
    expect(monsters.length).toBe(1);
    expect(monsters[0].name.toLowerCase()).toContain("goblin");
    expect(monsters[0].name.toLowerCase()).not.toContain("unknown");
  });
});

describe("B017: template_name still works", () => {
  let dm: string;

  test("setup party", async () => {
    const setup = await setupParty("b017b");
    dm = setup.dm;
  });

  test("spawn with {template_name: 'goblin'} works", () => {
    const result = handleSpawnEncounter(dm, { monsters: [{ template_name: "goblin", count: 1 }] });
    expect(result.success).toBe(true);
    const monsters = (result.data as any)?.monsters;
    expect(monsters.length).toBe(1);
    expect(monsters[0].name.toLowerCase()).toContain("goblin");
  });
});

// === B016: spawn-encounter with flat params should not crash ===
describe("B016: spawn-encounter flat format normalization", () => {
  let dm: string;

  test("setup party", async () => {
    const setup = await setupParty("b016");
    dm = setup.dm;
  });

  test("flat format {monster_type: 'goblin', count: 2} spawns 2 goblins", () => {
    const result = handleSpawnEncounter(dm, { monster_type: "goblin", count: 2 } as any);
    expect(result.success).toBe(true);
    const monsters = (result.data as any)?.monsters;
    expect(monsters).toBeDefined();
    expect(monsters.length).toBe(2);
  });
});

describe("B016: empty/missing params returns error", () => {
  let dm: string;

  test("setup party", async () => {
    const setup = await setupParty("b016b");
    dm = setup.dm;
  });

  test("empty params returns helpful error", () => {
    const result = handleSpawnEncounter(dm, {} as any);
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
    expect(result.error!.toLowerCase()).toContain("monsters");
  });
});

// === FT002: Actions endpoint distinguishes 'idle' from 'in session' ===
describe("FT002: actions endpoint idle state", () => {
  test("no character returns idle with create_character action", () => {
    const result = handleGetAvailableActions("ft002-no-char");
    expect(result.success).toBe(true);
    expect(result.data!.phase).toBe("idle");
    expect(result.data!.isYourTurn).toBe(false);
    expect(result.data!.availableActions).toEqual(["create_character"]);
  });

  test("character exists but no session returns idle with queue/status/inventory", async () => {
    await handleCreateCharacter("ft002-idle", {
      name: "IdleWarden",
      race: "human",
      class: "fighter" as any,
      ability_scores: scores,
      avatar_url: "https://example.com/test.png",
    });
    const result = handleGetAvailableActions("ft002-idle");
    expect(result.success).toBe(true);
    expect(result.data!.phase).toBe("idle");
    expect(result.data!.isYourTurn).toBe(false);
    expect(result.data!.availableActions).toEqual(["queue", "get_status", "get_inventory"]);
  });

  test("in-session player gets exploration actions, not idle", async () => {
    const setup = await setupParty("ft002-session");
    const result = handleGetAvailableActions(setup.players[0]);
    expect(result.success).toBe(true);
    expect(result.data!.phase).toBe("exploration");
    expect((result.data!.availableActions as string[]).length).toBeGreaterThan(0);
    expect(result.data!.availableActions).not.toContain("queue");
    expect(result.data!.availableActions).not.toContain("create_character");
  });
});
