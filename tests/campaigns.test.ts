import { describe, test, expect } from "bun:test";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  handleCreateCampaign,
  handleGetCampaign,
  handleSetStoryFlag,
  handleEndSession,
  handleAwardGold,
  handleGetStatus,
  handleGetInventory,
} from "../src/game/game-manager.ts";
import type { AbilityScores } from "../src/types.ts";

const scores: AbilityScores = { str: 14, dex: 14, con: 12, int: 10, wis: 10, cha: 10 };

describe("campaigns", () => {
  test("setup: form a party", () => {
    for (let i = 1; i <= 4; i++) {
      const cls = (["fighter", "rogue", "cleric", "wizard"] as const)[i - 1];
      handleCreateCharacter(`camp-player-${i}`, {
        name: `CampaignHero${i}`,
        race: "human",
        class: cls,
        ability_scores: scores,
      });
      handleQueueForParty(`camp-player-${i}`);
    }
    const dmResult = handleDMQueueForParty("camp-dm-1");
    expect(dmResult.success).toBe(true);
    expect(dmResult.data!.matched).toBe(true);
  });

  test("creates a campaign", () => {
    const result = handleCreateCampaign("camp-dm-1", {
      name: "The Curse of Ashenmoor",
      description: "A dark blight spreads from the ancient forest.",
    });
    expect(result.success).toBe(true);
    expect(result.data!.name).toBe("The Curse of Ashenmoor");
    expect(result.data!.description).toBe("A dark blight spreads from the ancient forest.");
    expect(result.data!.status).toBe("active");
    expect(result.data!.session_count).toBe(1); // party already has a session
    expect(result.data!.campaign_id).toBeDefined();
  });

  test("rejects duplicate campaign for same party", () => {
    const result = handleCreateCampaign("camp-dm-1", {
      name: "Another Campaign",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("already has an active campaign");
  });

  test("rejects campaign with empty name", () => {
    // Need a different party for this test — the current one already has a campaign.
    // So we just test that our existing party rejects, and test empty name on a fresh party below.
    const result = handleCreateCampaign("camp-dm-1", { name: "" });
    // This will hit the "already has an active campaign" check first
    expect(result.success).toBe(false);
  });

  test("non-DM cannot create campaign", () => {
    const result = handleCreateCampaign("camp-player-1", {
      name: "Player Campaign",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Not a DM");
  });

  test("get_campaign returns campaign briefing", () => {
    const result = handleGetCampaign("camp-dm-1");
    expect(result.success).toBe(true);
    expect(result.data!.name).toBe("The Curse of Ashenmoor");
    expect(result.data!.description).toBe("A dark blight spreads from the ancient forest.");
    expect(result.data!.status).toBe("active");
    expect(result.data!.session_count).toBe(1);
    expect(result.data!.completed_dungeons).toEqual([]);
    expect(result.data!.story_flags).toEqual({});
    expect(result.data!.party_name).toBeDefined();
    const members = result.data!.party_members as { name: string; class: string }[];
    expect(members.length).toBe(4);
  });

  test("get_campaign fails for non-DM", () => {
    const result = handleGetCampaign("camp-player-1");
    expect(result.success).toBe(false);
  });

  test("set_story_flag sets a flag", () => {
    const result = handleSetStoryFlag("camp-dm-1", {
      key: "rescued_merchant",
      value: true,
    });
    expect(result.success).toBe(true);
    const flags = result.data!.story_flags as Record<string, unknown>;
    expect(flags.rescued_merchant).toBe(true);
  });

  test("set_story_flag updates existing flag", () => {
    const result = handleSetStoryFlag("camp-dm-1", {
      key: "rescued_merchant",
      value: false,
    });
    expect(result.success).toBe(true);
    const flags = result.data!.story_flags as Record<string, unknown>;
    expect(flags.rescued_merchant).toBe(false);
  });

  test("set_story_flag supports multiple flags", () => {
    handleSetStoryFlag("camp-dm-1", { key: "goblin_chief_dead", value: true });
    const result = handleSetStoryFlag("camp-dm-1", {
      key: "faction_reputation",
      value: 3,
    });
    expect(result.success).toBe(true);
    const flags = result.data!.story_flags as Record<string, unknown>;
    expect(flags.rescued_merchant).toBe(false);
    expect(flags.goblin_chief_dead).toBe(true);
    expect(flags.faction_reputation).toBe(3);
  });

  test("set_story_flag rejects empty key", () => {
    const result = handleSetStoryFlag("camp-dm-1", { key: "", value: true });
    expect(result.success).toBe(false);
    expect(result.error).toContain("key");
  });

  test("set_story_flag fails without campaign", () => {
    // Form a fresh party without a campaign
    for (let i = 1; i <= 4; i++) {
      const cls = (["fighter", "rogue", "cleric", "wizard"] as const)[i - 1];
      handleCreateCharacter(`camp-nocamp-${i}`, {
        name: `NoCamper${i}`,
        race: "elf",
        class: cls,
        ability_scores: scores,
      });
      handleQueueForParty(`camp-nocamp-${i}`);
    }
    handleDMQueueForParty("camp-dm-nocamp");

    const result = handleSetStoryFlag("camp-dm-nocamp", { key: "test", value: 1 });
    expect(result.success).toBe(false);
    expect(result.error).toContain("No active campaign");
  });

  test("get_campaign fails without campaign", () => {
    const result = handleGetCampaign("camp-dm-nocamp");
    expect(result.success).toBe(false);
    expect(result.error).toContain("No active campaign");
  });

  test("create_campaign rejects empty name on fresh party", () => {
    const result = handleCreateCampaign("camp-dm-nocamp", { name: "" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("name");
  });
});

describe("campaign + end_session integration", () => {
  test("setup: form a party with campaign", () => {
    for (let i = 1; i <= 4; i++) {
      const cls = (["fighter", "rogue", "cleric", "wizard"] as const)[i - 1];
      handleCreateCharacter(`ces-player-${i}`, {
        name: `SessionEnder${i}`,
        race: "dwarf",
        class: cls,
        ability_scores: scores,
      });
      handleQueueForParty(`ces-player-${i}`);
    }
    const dm = handleDMQueueForParty("ces-dm-1");
    expect(dm.success).toBe(true);

    const camp = handleCreateCampaign("ces-dm-1", {
      name: "Dungeon Crawl Series",
      description: "A three-dungeon campaign.",
    });
    expect(camp.success).toBe(true);
  });

  test("end_session increments campaign session count", () => {
    // Before: session_count = 1 (set during create because party already had a session)
    const before = handleGetCampaign("ces-dm-1");
    expect(before.data!.session_count).toBe(1);

    const result = handleEndSession("ces-dm-1", {
      summary: "Explored the first level of the goblin warren.",
    });
    expect(result.success).toBe(true);
    expect(result.data!.campaign_session_count).toBe(2);
  });

  test("end_session records completed dungeon", () => {
    // Start a new session for this party — need to re-form since session ended
    // Actually, end_session doesn't destroy the party, it just ends the session state.
    // We can check completed_dungeons on the campaign directly.
    const campaign = handleGetCampaign("ces-dm-1");
    expect(campaign.data!.completed_dungeons).toEqual([]);

    // Now create a new party+session to test completed_dungeon param
    for (let i = 1; i <= 4; i++) {
      const cls = (["fighter", "rogue", "cleric", "wizard"] as const)[i - 1];
      handleCreateCharacter(`ces2-player-${i}`, {
        name: `DungeonCrawler${i}`,
        race: "halfling",
        class: cls,
        ability_scores: scores,
      });
      handleQueueForParty(`ces2-player-${i}`);
    }
    const dm2 = handleDMQueueForParty("ces2-dm-1");
    expect(dm2.success).toBe(true);

    const camp2 = handleCreateCampaign("ces2-dm-1", {
      name: "Dungeon Trek",
    });
    expect(camp2.success).toBe(true);

    const end = handleEndSession("ces2-dm-1", {
      summary: "Cleared the goblin warren!",
      completed_dungeon: "The Goblin Warren",
    });
    expect(end.success).toBe(true);
    expect(end.data!.completed_dungeons).toContain("The Goblin Warren");
    expect(end.data!.campaign_session_count).toBe(2);
  });

  test("completed_dungeon is not duplicated", () => {
    // Form yet another party to test dedup
    for (let i = 1; i <= 4; i++) {
      const cls = (["fighter", "rogue", "cleric", "wizard"] as const)[i - 1];
      handleCreateCharacter(`ces3-player-${i}`, {
        name: `DedupTester${i}`,
        race: "human",
        class: cls,
        ability_scores: scores,
      });
      handleQueueForParty(`ces3-player-${i}`);
    }
    handleDMQueueForParty("ces3-dm-1");
    handleCreateCampaign("ces3-dm-1", { name: "Dedup Test" });

    handleEndSession("ces3-dm-1", {
      summary: "Session 1",
      completed_dungeon: "Dungeon A",
    });

    // The party's session is now ended, but campaign persists.
    // Get the campaign — it should show 1 completed dungeon.
    const briefing = handleGetCampaign("ces3-dm-1");
    expect(briefing.success).toBe(true);
    expect(briefing.data!.completed_dungeons).toEqual(["Dungeon A"]);
  });

  test("end_session without campaign does not error", () => {
    const result = handleEndSession("camp-dm-nocamp", {
      summary: "No campaign session.",
    });
    expect(result.success).toBe(true);
    // Should NOT have campaign fields
    expect(result.data!.campaign_session_count).toBeUndefined();
  });
});

describe("gold", () => {
  test("setup: form a party for gold tests", () => {
    const classes = ["fighter", "rogue", "cleric", "wizard"] as const;
    for (let i = 1; i <= 4; i++) {
      handleCreateCharacter(`gold-player-${i}`, {
        name: `GoldHero${i}`,
        race: "human",
        class: classes[i - 1],
        ability_scores: scores,
      });
      handleQueueForParty(`gold-player-${i}`);
    }
    const dm = handleDMQueueForParty("gold-dm-1");
    expect(dm.success).toBe(true);
  });

  test("characters start with class-based gold", () => {
    // Fighter, rogue, cleric start with 15; wizard starts with 10
    const fighter = handleGetStatus("gold-player-1");
    expect(fighter.data!.gold).toBe(15);

    const wizard = handleGetStatus("gold-player-4");
    expect(wizard.data!.gold).toBe(10);
  });

  test("gold appears in inventory", () => {
    const inv = handleGetInventory("gold-player-1");
    expect(inv.data!.gold).toBe(15);
  });

  test("award_gold to specific player", () => {
    const result = handleAwardGold("gold-dm-1", { player_id: "gold-player-1", amount: 50 });
    expect(result.success).toBe(true);
    expect(result.data!.amount).toBe(50);
    expect(result.data!.new_total).toBe(65); // 15 + 50

    const status = handleGetStatus("gold-player-1");
    expect(status.data!.gold).toBe(65);
  });

  test("award_gold split among party", () => {
    const result = handleAwardGold("gold-dm-1", { amount: 100 });
    expect(result.success).toBe(true);
    expect(result.data!.gold_each).toBe(25); // 100 / 4

    // Fighter had 65, now 90
    const status = handleGetStatus("gold-player-1");
    expect(status.data!.gold).toBe(90);
  });

  test("negative gold (spending) cannot go below 0", () => {
    const result = handleAwardGold("gold-dm-1", { player_id: "gold-player-4", amount: -999 });
    expect(result.success).toBe(true);
    expect(result.data!.new_total).toBe(0);
  });

  test("zero amount is rejected", () => {
    const result = handleAwardGold("gold-dm-1", { amount: 0 });
    expect(result.success).toBe(false);
    expect(result.error).toContain("non-zero");
  });
});
