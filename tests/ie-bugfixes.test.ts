import { describe, test, expect } from "bun:test";
import {
  handleCreateCharacter,
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
