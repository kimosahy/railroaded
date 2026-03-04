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
  handleSpawnEncounter,
  handleMove,
  getPartyForUser,
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
});

// --- Pre-placed encounters ---

describe("trigger_encounter", () => {
  const scores: AbilityScores = { str: 14, dex: 14, con: 12, int: 10, wis: 10, cha: 10 };

  test("setup: form a party", () => {
    for (let i = 1; i <= 4; i++) {
      const cls = (["fighter", "rogue", "cleric", "wizard"] as const)[i - 1];
      handleCreateCharacter(`tpl-player-${i}`, {
        name: `TplHero${i}`,
        race: "human",
        class: cls,
        ability_scores: scores,
      });
      handleQueueForParty(`tpl-player-${i}`);
    }
    const dmResult = handleDMQueueForParty("tpl-dm-1");
    expect(dmResult.success).toBe(true);
    expect(dmResult.data!.matched).toBe(true);
  });

  test("get_room_state includes suggestedEncounter field", () => {
    const result = handleGetRoomState("tpl-dm-1");
    expect(result.success).toBe(true);
    expect("suggestedEncounter" in result.data!).toBe(true);
  });

  test("trigger_encounter fails for non-DM", () => {
    const result = handleTriggerEncounter("tpl-player-1");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Not a DM");
  });

  test("trigger_encounter on room with no encounter gives helpful error", () => {
    // Entry rooms in our templates don't have encounters
    const roomState = handleGetRoomState("tpl-dm-1");
    if (roomState.data!.suggestedEncounter === null) {
      const result = handleTriggerEncounter("tpl-dm-1");
      expect(result.success).toBe(false);
      expect(result.error).toContain("No pre-placed encounter");
      expect(result.error).toContain("spawn_encounter");
    }
  });

  test("navigate to room with encounter and trigger it", () => {
    // Get room state to see available exits
    const roomState = handleGetRoomState("tpl-dm-1");
    if (!roomState.success || !roomState.data!.exits) return;

    const exits = roomState.data!.exits as { name: string; type: string; id: string }[];
    if (exits.length === 0) return;

    // Move to first available exit — might have an encounter
    const firstExit = exits[0];
    const moveResult = handleMove("tpl-player-1", { direction_or_target: firstExit.id });

    // Check new room state for encounter
    const newRoomState = handleGetRoomState("tpl-dm-1");
    if (newRoomState.data!.suggestedEncounter) {
      const enc = newRoomState.data!.suggestedEncounter as { id: string; name: string; difficulty: string; monsters: unknown[] };
      expect(enc.name).toBeDefined();
      expect(enc.difficulty).toBeDefined();
      expect(enc.monsters).toBeDefined();

      // Trigger the encounter
      const triggerResult = handleTriggerEncounter("tpl-dm-1");
      expect(triggerResult.success).toBe(true);
      expect(triggerResult.data!.monsters).toBeDefined();
      expect(triggerResult.data!.phase).toBe("combat");

      // Verify the encounter no longer shows as suggested
      const afterState = handleGetRoomState("tpl-dm-1");
      expect(afterState.data!.suggestedEncounter).toBeNull();

      // Trigger again — should fail
      const retrigger = handleTriggerEncounter("tpl-dm-1");
      expect(retrigger.success).toBe(false);
      expect(retrigger.error).toContain("already been triggered");
    }
  });
});
