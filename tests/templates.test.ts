import { describe, test, expect } from "bun:test";
import {
  getTemplate,
  listTemplates,
  type DungeonTemplate,
} from "../src/game/templates.ts";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  handleGetRoomState,
  handleTriggerEncounter,
  handleLootRoom,
  handleInteractWithFeature,
  handleOverrideRoomDescription,
  handleLook,
  handleMove,
  getCharacterForUser,
} from "../src/game/game-manager.ts";
import type { AbilityScores } from "../src/types.ts";

// --- Template loading ---

describe("template loading", () => {
  test("templates loaded from YAML files", () => {
    const all = listTemplates();
    expect(all.length).toBeGreaterThanOrEqual(3);
  });

  test("getTemplate returns a template by name", () => {
    const gw = getTemplate("The Goblin Warren");
    expect(gw).toBeDefined();
    expect(gw!.difficultyTier).toBe("starter");
    expect(gw!.rooms.length).toBeGreaterThan(0);
    expect(gw!.encounters.length).toBeGreaterThan(0);
  });

  test("template rooms have suggestedEncounter references", () => {
    const gw = getTemplate("The Goblin Warren")!;
    const guardPost = gw.rooms.find((r) => r.id === "gw-guard-post");
    expect(guardPost).toBeDefined();
    expect(guardPost!.suggestedEncounter).toBe("gw-guards");
  });

  test("template encounters have monster groups", () => {
    const gw = getTemplate("The Goblin Warren")!;
    const guards = gw.encounters.find((e) => e.id === "gw-guards");
    expect(guards).toBeDefined();
    expect(guards!.monsters.length).toBe(1);
    expect(guards!.monsters[0].templateName).toBe("Goblin");
    expect(guards!.monsters[0].count).toBe(2);
  });

  test("entryRoomId is set correctly", () => {
    const gw = getTemplate("The Goblin Warren")!;
    expect(gw.entryRoomId).toBe("gw-entry");
  });

  test("connections are parsed correctly", () => {
    const gw = getTemplate("The Goblin Warren")!;
    expect(gw.connections.length).toBeGreaterThan(0);
    const first = gw.connections[0];
    expect(first.fromRoomId).toBe("gw-entry");
    expect(first.toRoomId).toBe("gw-guard-post");
    expect(first.type).toBe("passage");
  });

  test("template loot tables are parsed", () => {
    const gw = getTemplate("The Goblin Warren")!;
    expect(gw.lootTables.length).toBeGreaterThan(0);
    const storageLoot = gw.lootTables.find((lt) => lt.id === "gw-storage-loot");
    expect(storageLoot).toBeDefined();
    expect(storageLoot!.entries.length).toBeGreaterThan(0);
    expect(storageLoot!.entries[0].itemName).toBeDefined();
    expect(storageLoot!.entries[0].weight).toBeGreaterThan(0);
  });

  test("rooms reference loot tables by ID", () => {
    const gw = getTemplate("The Goblin Warren")!;
    const storage = gw.rooms.find((r) => r.id === "gw-storage");
    expect(storage).toBeDefined();
    expect(storage!.lootTable).toBe("gw-storage-loot");
  });
});

// --- Pre-placed encounters ---

describe("trigger_encounter", () => {
  const scores: AbilityScores = { str: 14, dex: 14, con: 12, int: 10, wis: 10, cha: 10 };

  test("setup: form a party", async () => {
    for (let i = 1; i <= 4; i++) {
      const cls = (["fighter", "rogue", "cleric", "wizard"] as const)[i - 1];
      await handleCreateCharacter(`tpl-player-${i}`, {
        name: `TplHero${i}`,
        race: "human",
        class: cls,
        ability_scores: scores,
        avatar_url: "https://example.com/test-avatar.png",
      });
      handleQueueForParty(`tpl-player-${i}`);
    }
    const dmResult = handleDMQueueForParty("tpl-dm-1");
    expect(dmResult.success).toBe(true);
    expect(dmResult.data!.matched).toBe(true);
  });

  test("get_room_state includes suggestedEncounter and lootTable fields", () => {
    const result = handleGetRoomState("tpl-dm-1");
    expect(result.success).toBe(true);
    expect("suggestedEncounter" in result.data!).toBe(true);
    expect("lootTable" in result.data!).toBe(true);
  });

  test("trigger_encounter fails for non-DM", () => {
    const result = handleTriggerEncounter("tpl-player-1");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Not a DM");
  });

  test("trigger_encounter on room with no encounter gives helpful error", () => {
    const roomState = handleGetRoomState("tpl-dm-1");
    if (roomState.data!.suggestedEncounter === null) {
      const result = handleTriggerEncounter("tpl-dm-1");
      expect(result.success).toBe(false);
      expect(result.error).toContain("No pre-placed encounter");
      expect(result.error).toContain("spawn_encounter");
    }
  });

  test("navigate to room with encounter and trigger it", () => {
    const roomState = handleGetRoomState("tpl-dm-1");
    if (!roomState.success || !roomState.data!.exits) return;

    const exits = roomState.data!.exits as { name: string; type: string; id: string }[];
    if (exits.length === 0) return;

    const firstExit = exits[0];
    handleMove("tpl-player-1", { direction_or_target: firstExit.id });

    const newRoomState = handleGetRoomState("tpl-dm-1");
    if (newRoomState.data!.suggestedEncounter) {
      const enc = newRoomState.data!.suggestedEncounter as { id: string; name: string; difficulty: string; monsters: unknown[] };
      expect(enc.name).toBeDefined();
      expect(enc.difficulty).toBeDefined();
      expect(enc.monsters).toBeDefined();

      const triggerResult = handleTriggerEncounter("tpl-dm-1");
      expect(triggerResult.success).toBe(true);
      expect(triggerResult.data!.monsters).toBeDefined();
      expect(triggerResult.data!.phase).toBe("combat");

      const afterState = handleGetRoomState("tpl-dm-1");
      expect(afterState.data!.suggestedEncounter).toBeNull();

      const retrigger = handleTriggerEncounter("tpl-dm-1");
      expect(retrigger.success).toBe(false);
      expect(retrigger.error).toContain("already been triggered");
    }
  });
});

// --- Pre-placed loot ---

describe("loot_room", () => {
  const scores: AbilityScores = { str: 14, dex: 14, con: 12, int: 10, wis: 10, cha: 10 };

  test("setup: form a party for loot testing", async () => {
    for (let i = 1; i <= 4; i++) {
      const cls = (["fighter", "rogue", "cleric", "wizard"] as const)[i - 1];
      await handleCreateCharacter(`loot-room-player-${i}`, {
        name: `LootHero${i}`,
        race: "dwarf",
        class: cls,
        ability_scores: scores,
        avatar_url: "https://example.com/test-avatar.png",
      });
      handleQueueForParty(`loot-room-player-${i}`);
    }
    const dmResult = handleDMQueueForParty("loot-room-dm-1");
    expect(dmResult.success).toBe(true);
    expect(dmResult.data!.matched).toBe(true);
  });

  test("loot_room fails for non-DM", () => {
    const result = handleLootRoom("loot-room-player-1", { player_id: "char-1" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Not a DM");
  });

  test("loot_room on room with no loot table gives helpful error", () => {
    const roomState = handleGetRoomState("loot-room-dm-1");
    if (roomState.data!.lootTable === null) {
      const char = getCharacterForUser("loot-room-player-1");
      const result = handleLootRoom("loot-room-dm-1", { player_id: char!.id });
      expect(result.success).toBe(false);
      expect(result.error).toContain("No loot table");
      expect(result.error).toContain("award_loot");
    }
  });

  test("loot_room rejects invalid player_id", () => {
    // If room has no loot table, error comes from that check first.
    // If room has a loot table, error comes from invalid player.
    // Either way, it should fail.
    const result = handleLootRoom("loot-room-dm-1", { player_id: "nonexistent-99" });
    expect(result.success).toBe(false);
  });
});

// --- Feature interaction ---

describe("interact_with_feature", () => {
  // Uses the party from "tpl-dm-1" formed earlier

  test("returns feature description on match", () => {
    const roomState = handleGetRoomState("tpl-dm-1");
    if (!roomState.success || !roomState.data!.room) return;
    const room = roomState.data!.room as { features: string[] };
    if (room.features.length === 0) return;

    // Use a partial match from the first feature
    const firstFeature = room.features[0];
    const keyword = firstFeature.split(" ")[0]; // first word
    const result = handleInteractWithFeature("tpl-dm-1", { feature_name: keyword });
    expect(result.success).toBe(true);
    expect(result.data!.feature).toBe(firstFeature);
    expect(result.data!.room).toBeDefined();
  });

  test("fails for non-existent feature", () => {
    const result = handleInteractWithFeature("tpl-dm-1", { feature_name: "Invisible Unicorn" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
    expect(result.error).toContain("Available features");
  });

  test("fails for non-DM", () => {
    const result = handleInteractWithFeature("tpl-player-1", { feature_name: "torch" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Not a DM");
  });

  test("returns 400 error instead of 500 when feature_name is missing", () => {
    // Simulates REST body with wrong field name (e.g. {feature: "..."} instead of {feature_name: "..."})
    const result = handleInteractWithFeature("tpl-dm-1", {} as { feature_name: string });
    expect(result.success).toBe(false);
    expect(result.error).toContain("feature_name");
  });

  test("returns 400 error instead of 500 when feature_name is undefined", () => {
    const result = handleInteractWithFeature("tpl-dm-1", { feature_name: undefined as unknown as string });
    expect(result.success).toBe(false);
    expect(result.error).toContain("feature_name");
  });
});

// --- DM scene override ---

describe("override_room_description", () => {
  test("replaces room description and persists in look", () => {
    const newDesc = "The room is engulfed in flames. Smoke chokes the air.";
    const result = handleOverrideRoomDescription("tpl-dm-1", { description: newDesc });
    expect(result.success).toBe(true);
    expect(result.data!.description).toBe(newDesc);

    // Verify the description is updated in room state
    const roomState = handleGetRoomState("tpl-dm-1");
    const room = roomState.data!.room as { description: string };
    expect(room.description).toBe(newDesc);

    // Verify players see it too via look
    const lookResult = handleLook("tpl-player-1");
    if (lookResult.success && lookResult.data!.description) {
      expect(lookResult.data!.description).toBe(newDesc);
    }
  });

  test("fails for non-DM", () => {
    const result = handleOverrideRoomDescription("tpl-player-1", { description: "test" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Not a DM");
  });
});
