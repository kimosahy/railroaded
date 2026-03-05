import { describe, test, expect } from "bun:test";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  handleCreateCustomMonster,
  handleSpawnEncounter,
  handleGetRoomState,
  handleListCustomMonsters,
} from "../src/game/game-manager.ts";
import type { AbilityScores } from "../src/types.ts";

const scores: AbilityScores = { str: 14, dex: 14, con: 12, int: 10, wis: 10, cha: 10 };

describe("create_custom_monster", () => {
  test("setup: form a party", async () => {
    for (let i = 1; i <= 4; i++) {
      const cls = (["fighter", "rogue", "cleric", "wizard"] as const)[i - 1];
      await handleCreateCharacter(`cm-player-${i}`, {
        name: `MonsterTester${i}`,
        race: "human",
        class: cls,
        ability_scores: scores,
      });
      handleQueueForParty(`cm-player-${i}`);
    }
    const dmResult = handleDMQueueForParty("cm-dm-1");
    expect(dmResult.success).toBe(true);
    expect(dmResult.data!.matched).toBe(true);
  });

  test("creates a basic custom monster", () => {
    const result = handleCreateCustomMonster("cm-dm-1", {
      name: "Corrupted Treant",
      hp_max: 50,
      ac: 15,
      attacks: [
        { name: "Slam", damage: "2d8+4", to_hit: 6 },
        { name: "Root Whip", damage: "1d10+2", to_hit: 5 },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.data!.name).toBe("Corrupted Treant");
    expect(result.data!.hp_max).toBe(50);
    expect(result.data!.ac).toBe(15);
    expect((result.data!.attacks as unknown[]).length).toBe(2);
  });

  test("custom monster can be spawned via spawn_encounter", () => {
    const result = handleSpawnEncounter("cm-dm-1", {
      monsters: [{ template_name: "Corrupted Treant", count: 1 }],
    });
    expect(result.success).toBe(true);
    const monsters = result.data!.monsters as { name: string; hp: number; ac: number }[];
    expect(monsters.length).toBe(1);
    expect(monsters[0].name).toBe("Corrupted Treant");
    expect(monsters[0].hp).toBe(50);
    expect(monsters[0].ac).toBe(15);
  });

  test("creates monster with all optional fields", () => {
    const result = handleCreateCustomMonster("cm-dm-1", {
      name: "Fire Elemental Lord",
      hp_max: 100,
      ac: 18,
      attacks: [{ name: "Flame Touch", damage: "3d6+5", to_hit: 8 }],
      ability_scores: { str: 18, dex: 14, con: 16, int: 8, wis: 12, cha: 10 },
      vulnerabilities: ["cold"],
      immunities: ["fire", "poison"],
      resistances: ["slashing"],
      special_abilities: [
        { name: "Fire Aura", description: "Creatures within 5 feet take 1d6 fire damage." },
      ],
      xp_value: 2000,
      loot_table: [
        { item_name: "Potion of Healing", weight: 3, quantity: 1 },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.data!.xp_value).toBe(2000);
  });

  test("rejects monster with no name", () => {
    const result = handleCreateCustomMonster("cm-dm-1", {
      name: "",
      hp_max: 10,
      ac: 10,
      attacks: [{ name: "Bite", damage: "1d4", to_hit: 2 }],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("name");
  });

  test("rejects monster with no attacks", () => {
    const result = handleCreateCustomMonster("cm-dm-1", {
      name: "Pacifist Ooze",
      hp_max: 10,
      ac: 10,
      attacks: [],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("attack");
  });

  test("rejects monster with invalid hp", () => {
    const result = handleCreateCustomMonster("cm-dm-1", {
      name: "Ghost",
      hp_max: 0,
      ac: 10,
      attacks: [{ name: "Touch", damage: "1d4", to_hit: 2 }],
    });
    expect(result.success).toBe(false);
  });

  test("non-DM cannot create monsters", () => {
    const result = handleCreateCustomMonster("cm-player-1", {
      name: "Rogue Monster",
      hp_max: 10,
      ac: 10,
      attacks: [{ name: "Bite", damage: "1d4", to_hit: 2 }],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Not a DM");
  });

  test("auto-calculates xp_value when not provided", () => {
    const result = handleCreateCustomMonster("cm-dm-1", {
      name: "Test Blob",
      hp_max: 20,
      ac: 12,
      attacks: [{ name: "Pseudopod", damage: "1d6", to_hit: 3 }],
    });
    expect(result.success).toBe(true);
    expect(result.data!.xp_value).toBe(60); // floor(20 * 12 / 4)
  });

  test("list_monster_templates includes custom and built-in monsters", () => {
    const result = handleListCustomMonsters("cm-dm-1");
    expect(result.success).toBe(true);
    const templates = result.data!.templates as { name: string; hp_max: number; ac: number }[];
    // Should include at least the YAML templates + the custom ones we created
    expect(templates.length).toBeGreaterThanOrEqual(3);
    // Check our custom monster is in the list
    const treant = templates.find((t) => t.name === "Corrupted Treant");
    expect(treant).toBeDefined();
    expect(treant!.hp_max).toBe(50);
    expect(treant!.ac).toBe(15);
  });

  test("list_monster_templates shows attack names", () => {
    const result = handleListCustomMonsters("cm-dm-1");
    expect(result.success).toBe(true);
    const templates = result.data!.templates as { name: string; attacks: string[] }[];
    const treant = templates.find((t) => t.name === "Corrupted Treant");
    expect(treant!.attacks).toContain("Slam");
    expect(treant!.attacks).toContain("Root Whip");
  });

  test("list_monster_templates fails for non-DM", () => {
    const result = handleListCustomMonsters("cm-player-1");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Not a DM");
  });
});
