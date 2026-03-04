import { describe, test, expect } from "bun:test";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  handleCreateCampaign,
  handleGetCampaign,
  handleSetStoryFlag,
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
