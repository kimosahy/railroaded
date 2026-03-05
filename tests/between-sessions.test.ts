import { describe, test, expect } from "bun:test";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  handleCreateCampaign,
  handleGetCampaign,
  handleSetStoryFlag,
  handleEndSession,
  handleStartCampaignSession,
  handleAwardGold,
  handleAwardXp,
  handleCreateNpc,
  handleAddQuest,
  handleUpdateQuest,
  handleListQuests,
} from "../src/game/game-manager.ts";
import type { AbilityScores } from "../src/types.ts";

const scores: AbilityScores = { str: 14, dex: 14, con: 14, int: 10, wis: 10, cha: 10 };

describe("enriched campaign briefing", () => {
  test("setup: party + campaign + NPCs + gold + XP", async () => {
    const classes = ["fighter", "rogue", "cleric", "wizard"] as const;
    for (let i = 1; i <= 4; i++) {
      await handleCreateCharacter(`bsess-player-${i}`, {
        name: `BSessionHero${i}`,
        race: "human",
        class: classes[i - 1],
        ability_scores: scores,
      });
      handleQueueForParty(`bsess-player-${i}`);
    }
    const dm = handleDMQueueForParty("bsess-dm-1");
    expect(dm.success).toBe(true);

    handleCreateCampaign("bsess-dm-1", {
      name: "The Enriched Campaign",
      description: "Testing the full briefing.",
    });
    handleAwardGold("bsess-dm-1", { amount: 400 }); // 100 each
    handleAwardXp("bsess-dm-1", { amount: 1200 }); // 300 each → level 2
    handleCreateNpc("bsess-dm-1", {
      name: "Test Merchant",
      description: "A merchant.",
      personality: "Friendly.",
      tags: ["merchant"],
    });
  });

  test("briefing includes full character details", () => {
    const result = handleGetCampaign("bsess-dm-1");
    expect(result.success).toBe(true);

    const members = result.data!.party_members as unknown[];
    expect(members.length).toBe(4);

    const fighter = (members as Record<string, unknown>[]).find((m) => m.name === "BSessionHero1")!;
    expect(fighter.id).toBeDefined();
    expect(fighter.race).toBe("human");
    expect(fighter.class).toBe("fighter");
    expect(fighter.level).toBe(2);
    expect(fighter.xp).toBe(300);
    expect(fighter.xp_next_level).toBe(900); // next threshold for level 3
    expect(fighter.gold).toBe(115); // 15 starting + 100 awarded
    expect(fighter.ac).toBeDefined();
    expect(fighter.equipment).toBeDefined();
    expect(fighter.inventory).toBeDefined();
    expect(fighter.spell_slots).toBeDefined();
    expect(fighter.conditions).toBeDefined();
    expect(fighter.features).toBeDefined();
  });

  test("briefing includes NPC personality and memory", () => {
    const result = handleGetCampaign("bsess-dm-1");
    const npcs = result.data!.npcs as { name: string; personality: string; description: string; recent_memory: unknown[] }[];
    const merchant = npcs.find((n) => n.name === "Test Merchant");
    expect(merchant).toBeDefined();
    expect(merchant!.personality).toBe("Friendly.");
    expect(merchant!.description).toBe("A merchant.");
    expect(merchant!.recent_memory).toBeDefined();
  });

  test("briefing includes empty quests and session history initially", () => {
    const result = handleGetCampaign("bsess-dm-1");
    expect(result.data!.quests).toEqual([]);
    expect(result.data!.previous_sessions).toEqual([]);
  });
});

describe("quest tracking", () => {
  test("add_quest creates an active quest", () => {
    const result = handleAddQuest("bsess-dm-1", {
      title: "Rescue the Blacksmith's Daughter",
      description: "She was last seen near the goblin caves.",
    });
    expect(result.success).toBe(true);
    expect(result.data!.quest_id).toBeDefined();
    expect(result.data!.title).toBe("Rescue the Blacksmith's Daughter");
    expect(result.data!.status).toBe("active");
  });

  test("add_quest with NPC giver", () => {
    // Get the merchant NPC ID
    const campaign = handleGetCampaign("bsess-dm-1");
    const merchantId = (campaign.data!.npcs as { npc_id: string; name: string }[])
      .find((n) => n.name === "Test Merchant")!.npc_id;

    const result = handleAddQuest("bsess-dm-1", {
      title: "Deliver the Package",
      description: "Bring the sealed crate to the fort.",
      giver_npc_id: merchantId,
    });
    expect(result.success).toBe(true);
    expect(result.data!.giver_npc_id).toBe(merchantId);
  });

  test("add_quest rejects empty title", () => {
    const result = handleAddQuest("bsess-dm-1", { title: "", description: "test" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("title");
  });

  test("list_quests shows all quests", () => {
    const result = handleListQuests("bsess-dm-1", {});
    expect(result.success).toBe(true);
    const quests = result.data!.quests as unknown[];
    expect(quests.length).toBe(2);
  });

  test("update_quest marks quest completed", () => {
    const list = handleListQuests("bsess-dm-1", {});
    const questId = (list.data!.quests as { quest_id: string }[])[0].quest_id;

    const result = handleUpdateQuest("bsess-dm-1", {
      quest_id: questId,
      status: "completed",
    });
    expect(result.success).toBe(true);
    expect(result.data!.status).toBe("completed");
  });

  test("list_quests filters by status", () => {
    const active = handleListQuests("bsess-dm-1", { status: "active" });
    expect((active.data!.quests as unknown[]).length).toBe(1);

    const completed = handleListQuests("bsess-dm-1", { status: "completed" });
    expect((completed.data!.quests as unknown[]).length).toBe(1);
  });

  test("update_quest can mark as failed", () => {
    const list = handleListQuests("bsess-dm-1", { status: "active" });
    const questId = (list.data!.quests as { quest_id: string }[])[0].quest_id;

    const result = handleUpdateQuest("bsess-dm-1", {
      quest_id: questId,
      status: "failed",
      description: "The package was destroyed in the fire.",
    });
    expect(result.success).toBe(true);
    expect(result.data!.status).toBe("failed");
    expect(result.data!.description).toBe("The package was destroyed in the fire.");
  });

  test("update_quest fails for unknown quest", () => {
    const result = handleUpdateQuest("bsess-dm-1", { quest_id: "quest-999" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  test("quests appear in campaign briefing", () => {
    const result = handleGetCampaign("bsess-dm-1");
    const quests = result.data!.quests as { title: string; status: string }[];
    expect(quests.length).toBe(2);
    expect(quests.find((q) => q.title === "Rescue the Blacksmith's Daughter")!.status).toBe("completed");
  });
});

describe("session history", () => {
  test("end_session records session history", () => {
    handleEndSession("bsess-dm-1", {
      summary: "Explored the goblin caves and rescued the daughter.",
      completed_dungeon: "Goblin Caves",
    });

    const campaign = handleGetCampaign("bsess-dm-1");
    const history = campaign.data!.previous_sessions as { session_number: number; summary: string; completed_dungeon?: string }[];
    expect(history.length).toBe(1);
    expect(history[0].session_number).toBe(2); // was 1, incremented to 2
    expect(history[0].summary).toBe("Explored the goblin caves and rescued the daughter.");
    expect(history[0].completed_dungeon).toBe("Goblin Caves");
  });

  test("start_campaign_session returns full briefing", () => {
    const result = handleStartCampaignSession("bsess-dm-1");
    expect(result.success).toBe(true);

    // Should have campaign briefing fields
    expect(result.data!.name).toBe("The Enriched Campaign");
    expect(result.data!.party_members).toBeDefined();
    expect(result.data!.npcs).toBeDefined();
    expect(result.data!.quests).toBeDefined();
    expect(result.data!.previous_sessions).toBeDefined();
    expect(result.data!.story_flags).toBeDefined();

    // Should have session-specific fields
    expect(result.data!.session_number).toBe(3);
    expect(result.data!.message).toContain("reconvenes");
  });

  test("multiple session histories accumulate", () => {
    handleEndSession("bsess-dm-1", {
      summary: "Cleared the undead crypt.",
      completed_dungeon: "Undead Crypt",
    });

    const campaign = handleGetCampaign("bsess-dm-1");
    const history = campaign.data!.previous_sessions as { session_number: number }[];
    expect(history.length).toBe(2);
  });
});

describe("story flag improvements", () => {
  test("reserved keys are rejected", () => {
    const result = handleSetStoryFlag("bsess-dm-1", { key: "__internal", value: true });
    expect(result.success).toBe(false);
    expect(result.error).toContain("reserved");
  });

  test("story_flags exclude reserved keys in response", () => {
    handleSetStoryFlag("bsess-dm-1", { key: "dragon_slain", value: true });
    const campaign = handleGetCampaign("bsess-dm-1");
    const flags = campaign.data!.story_flags as Record<string, unknown>;
    expect(flags.dragon_slain).toBe(true);
    expect(flags.__quests).toBeUndefined();
    expect(flags.__sessionHistory).toBeUndefined();
  });
});
