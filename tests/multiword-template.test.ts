/**
 * Tests for multi-word monster template name resolution.
 *
 * BUG: template_name "bandit_captain" should resolve to "Bandit Captain"
 * with correct stats (HP:65, AC:15), not defaults (HP:10, AC:12).
 */
import { describe, test, expect } from "bun:test";
import {
  handleCreateCharacter,
  handleSpawnEncounter,
  handleQueueForParty,
  handleDMQueueForParty,
  getPartyForUser,
} from "../src/game/game-manager.ts";

const scores = { str: 10, dex: 14, con: 12, int: 18, wis: 14, cha: 10 };
const dmUser = "mwt-dm";
const players = ["mwt-p1", "mwt-p2", "mwt-p3", "mwt-p4"];

describe("multi-word monster template lookup", () => {
  test("setup: form party", async () => {
    for (let i = 0; i < 4; i++) {
      await handleCreateCharacter(players[i]!, {
        name: `MWTHero${i + 1}`,
        race: "human",
        class: "fighter",
        ability_scores: scores,
        avatar_url: "https://example.com/avatar.png",
      });
      handleQueueForParty(players[i]!);
    }
    handleDMQueueForParty(dmUser);

    const party = getPartyForUser(players[0]!);
    expect(party).not.toBeNull();
    expect(party!.session).not.toBeNull();
  });

  test("bandit_captain (underscores) resolves to Bandit Captain with HP:39, AC:15", () => {
    const result = handleSpawnEncounter(dmUser, {
      monsters: [{ template_name: "bandit_captain", count: 1 }],
    });
    expect(result.success).toBe(true);
    const monsters = result.data!.monsters as { id: string; name: string; hp: number; ac: number }[];
    expect(monsters[0]!.name).toBe("Bandit Captain");
    expect(monsters[0]!.hp).toBe(39);
    expect(monsters[0]!.ac).toBe(15);
  });

  test("hobgoblin-warlord (hyphens) resolves to Hobgoblin Warlord with HP:52, AC:17", () => {
    const result = handleSpawnEncounter(dmUser, {
      monsters: [{ template_name: "hobgoblin-warlord", count: 1 }],
    });
    expect(result.success).toBe(true);
    const monsters = result.data!.monsters as { id: string; name: string; hp: number; ac: number }[];
    expect(monsters[0]!.name).toBe("Hobgoblin Warlord");
    expect(monsters[0]!.hp).toBe(52);
    expect(monsters[0]!.ac).toBe(17);
  });

  test("YOUNG_DRAGON (uppercase + underscores) resolves correctly", () => {
    const result = handleSpawnEncounter(dmUser, {
      monsters: [{ template_name: "YOUNG_DRAGON", count: 1 }],
    });
    expect(result.success).toBe(true);
    const monsters = result.data!.monsters as { id: string; name: string; hp: number; ac: number }[];
    expect(monsters[0]!.name).toBe("Young Dragon");
    expect(monsters[0]!.hp).toBe(75);
    expect(monsters[0]!.ac).toBe(17);
  });

  test("single-word template still works (Goblin)", () => {
    const result = handleSpawnEncounter(dmUser, {
      monsters: [{ template_name: "goblin", count: 1 }],
    });
    expect(result.success).toBe(true);
    const monsters = result.data!.monsters as { id: string; name: string; hp: number; ac: number }[];
    expect(monsters[0]!.name).toBe("Goblin");
    expect(monsters[0]!.hp).toBe(7);
    expect(monsters[0]!.ac).toBe(15);
  });
});
