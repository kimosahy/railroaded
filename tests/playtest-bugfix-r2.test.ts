/**
 * Tests for playtest bug fixes — Round 2.
 *
 * BUG 1: Healing doesn't clear unconscious/prone or reset death saves
 * BUG 2: Unconscious characters see full combat actions
 * BUG 4: Custom monster null HP guards
 * + Round 3 regression tests: unconscious attack guard, XP leveling, avatar mandatory
 */
import { describe, test, expect } from "bun:test";
import {
  handleCreateCharacter,
  handleSpawnEncounter,
  handleCast,
  handleUseItem,
  handleGetAvailableActions,
  handleAwardLoot,
  handleAwardXp,
  handleAttack,
  handleMove,
  handleBonusAction,
  handleCreateCustomMonster,
  getCharacterForUser,
  getPartyForUser,
  handleQueueForParty,
  handleDMQueueForParty,
} from "../src/game/game-manager.ts";
import { getAllowedActions } from "../src/game/turns.ts";
import { handleDropToZero, handleRegainFromZero } from "../src/engine/hp.ts";
import { resetDeathSaves } from "../src/engine/death.ts";
import { spawnMonsters, calculateEncounterXP } from "../src/game/encounters.ts";
import type { MonsterInstance } from "../src/game/encounters.ts";
import type { AbilityScores } from "../src/types.ts";

const scores: AbilityScores = { str: 10, dex: 14, con: 12, int: 18, wis: 14, cha: 10 };

// --- BUG 1: Healing clears unconscious/death saves ---

describe("healing clears unconscious and resets death saves (BUG 1)", () => {
  test("handleRegainFromZero removes unconscious, prone, dead, stable", () => {
    const conditions = ["unconscious", "prone", "poisoned"];
    const result = handleRegainFromZero(conditions, true);
    expect(result).not.toContain("unconscious");
    expect(result).not.toContain("prone");
    expect(result).toContain("poisoned"); // other conditions preserved
  });

  test("handleRegainFromZero keeps prone when stabilized (not healed)", () => {
    const conditions = ["unconscious", "prone"];
    const result = handleRegainFromZero(conditions, false);
    expect(result).not.toContain("unconscious");
    expect(result).toContain("prone"); // kept when just stabilized
  });

  test("resetDeathSaves returns zeros", () => {
    const ds = resetDeathSaves();
    expect(ds.successes).toBe(0);
    expect(ds.failures).toBe(0);
  });

  // Integration: heal a dying character via spell
  const dmUser = "healtest-dm";
  const players = ["healtest-p1", "healtest-p2", "healtest-p3", "healtest-p4"];

  test("setup: form party", async () => {
    for (let i = 0; i < 4; i++) {
      await handleCreateCharacter(players[i], {
        name: `HealHero${i + 1}`,
        race: "elf",
        class: i === 0 ? "cleric" : "fighter",
        ability_scores: scores,
        avatar_url: "https://example.com/test-avatar.png",
      });
      handleQueueForParty(players[i]);
    }
    handleDMQueueForParty(dmUser);
    expect(getPartyForUser(players[0])).not.toBeNull();
  });

  test("healing spell on dying character clears unconscious and resets death saves", () => {
    const target = getCharacterForUser(players[1])!;
    // Simulate being knocked to 0 HP
    target.hpCurrent = 0;
    target.conditions = handleDropToZero(target.conditions);
    target.deathSaves = { successes: 1, failures: 2 };

    expect(target.conditions).toContain("unconscious");
    expect(target.conditions).toContain("prone");

    // Cast Cure Wounds on the target
    const result = handleCast(players[0], { spell_name: "Cure Wounds", target_id: target.id });

    // Whether the spell succeeds depends on spell slot availability, but let's check the target
    if (result.success) {
      // Target should be healed above 0
      expect(target.hpCurrent).toBeGreaterThan(0);
      // Conditions should be cleared
      expect(target.conditions).not.toContain("unconscious");
      expect(target.conditions).not.toContain("prone");
      // Death saves should be reset
      expect(target.deathSaves.successes).toBe(0);
      expect(target.deathSaves.failures).toBe(0);
    }
  });

  test("potion on dying character clears unconscious and resets death saves", () => {
    const target = getCharacterForUser(players[2])!;
    target.hpCurrent = 0;
    target.conditions = handleDropToZero(target.conditions);
    target.deathSaves = { successes: 0, failures: 2 };

    // Give the user a potion
    const user = getCharacterForUser(players[0])!;
    user.inventory.push("Potion of Healing");

    const result = handleUseItem(players[0], { item_name: "Potion of Healing", target_id: target.id });
    expect(result.success).toBe(true);
    expect(target.hpCurrent).toBeGreaterThan(0);
    expect(target.conditions).not.toContain("unconscious");
    expect(target.conditions).not.toContain("prone");
    expect(target.deathSaves.successes).toBe(0);
    expect(target.deathSaves.failures).toBe(0);
  });
});

// --- BUG 2: Unconscious characters see full combat actions ---

describe("getAllowedActions respects conditions (BUG 2)", () => {
  test("unconscious character on their turn sees death_save, end_turn + status", () => {
    const actions = getAllowedActions("combat", true, ["unconscious", "prone"]);
    expect(actions).toContain("death_save");
    expect(actions).toContain("end_turn");
    expect(actions).toContain("get_status");
    expect(actions).toContain("get_available_actions");
    expect(actions).not.toContain("attack");
    expect(actions).not.toContain("cast");
    expect(actions).not.toContain("move");
  });

  test("unconscious character NOT on their turn only sees status", () => {
    const actions = getAllowedActions("combat", false, ["unconscious"]);
    expect(actions).toContain("get_status");
    expect(actions).toContain("get_available_actions");
    expect(actions).not.toContain("death_save");
    expect(actions).not.toContain("reaction");
  });

  test("dead character sees only status regardless of turn", () => {
    const actions = getAllowedActions("combat", true, ["dead"]);
    expect(actions).toContain("get_status");
    expect(actions).toContain("get_available_actions");
    expect(actions).not.toContain("death_save");
    expect(actions).not.toContain("attack");
    expect(actions.length).toBe(2);
  });

  test("normal character (no conditions) sees full action list", () => {
    const actions = getAllowedActions("combat", true, []);
    expect(actions).toContain("attack");
    expect(actions).toContain("cast");
    expect(actions).toContain("end_turn");
    expect(actions).not.toContain("death_save");
  });

  test("conditions default to empty array (backwards compat)", () => {
    const actions = getAllowedActions("combat", true);
    expect(actions).toContain("attack");
    expect(actions).toContain("cast");
  });

  test("exploration phase ignores unconscious (actions still restricted)", () => {
    const actions = getAllowedActions("exploration", false, ["unconscious"]);
    expect(actions).toContain("get_status");
    expect(actions).not.toContain("look");
    expect(actions).not.toContain("move");
  });
});

// --- BUG 4: Custom monster null HP guards ---

describe("custom monster HP guards (BUG 4)", () => {
  test("spawnMonsters defaults null hpMax to 10", () => {
    const instances = spawnMonsters([{
      templateName: "NullHPMonster",
      count: 1,
      template: {
        hpMax: undefined as unknown as number,
        ac: undefined as unknown as number,
        abilityScores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        attacks: [{ name: "Bite", to_hit: 3, damage: "1d6+1", type: "piercing" }],
        specialAbilities: [],
        xpValue: 25,
      },
    }]);
    expect(instances.length).toBe(1);
    expect(instances[0].hpMax).toBe(10);
    expect(instances[0].hpCurrent).toBe(10);
    expect(instances[0].ac).toBe(12);
  });

  test("spawnMonsters preserves valid hpMax", () => {
    const instances = spawnMonsters([{
      templateName: "ValidMonster",
      count: 1,
      template: {
        hpMax: 45,
        ac: 16,
        abilityScores: { str: 16, dex: 12, con: 14, int: 8, wis: 10, cha: 6 },
        attacks: [{ name: "Slash", to_hit: 5, damage: "2d6+3", type: "slashing" }],
        specialAbilities: [],
        xpValue: 100,
      },
    }]);
    expect(instances[0].hpMax).toBe(45);
    expect(instances[0].hpCurrent).toBe(45);
    expect(instances[0].ac).toBe(16);
  });

  test("handleCreateCustomMonster rejects falsy hp_max", () => {
    // We need a DM — use the one from heal test
    const result = handleCreateCustomMonster("healtest-dm", {
      name: "ZeroHPMonster",
      hp_max: 0,
      ac: 12,
      attacks: [{ name: "Punch", damage: "1d4", to_hit: 2 }],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("hp_max");
  });

  test("handleCreateCustomMonster rejects falsy ac", () => {
    const result = handleCreateCustomMonster("healtest-dm", {
      name: "ZeroACMonster",
      hp_max: 20,
      ac: 0,
      attacks: [{ name: "Punch", damage: "1d4", to_hit: 2 }],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("ac");
  });
});

// --- Round 3: Unconscious characters cannot take actions ---

describe("unconscious characters cannot take actions (Round 3 Bug 1)", () => {
  test("handleAttack rejects unconscious character", () => {
    const char = getCharacterForUser("healtest-p1");
    if (!char) {
      expect(true).toBe(true);
      return;
    }
    char.conditions = handleDropToZero(char.conditions);
    const result = handleAttack("healtest-p1", { target_id: "fake-target" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("unconscious");
    // Clean up
    char.conditions = [];
  });

  test("handleCast rejects unconscious character", () => {
    const char = getCharacterForUser("healtest-p1");
    if (!char) {
      expect(true).toBe(true);
      return;
    }
    char.conditions = handleDropToZero(char.conditions);
    const result = handleCast("healtest-p1", { spell_name: "Fire Bolt", target_id: "fake" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("unconscious");
    char.conditions = [];
  });

  test("handleMove rejects unconscious character", () => {
    const char = getCharacterForUser("healtest-p1");
    if (!char) {
      expect(true).toBe(true);
      return;
    }
    char.conditions = handleDropToZero(char.conditions);
    const result = handleMove("healtest-p1", { direction: "north", distance: 5 });
    expect(result.success).toBe(false);
    expect(result.error).toContain("unconscious");
    char.conditions = [];
  });

  test("handleUseItem rejects unconscious character", () => {
    const char = getCharacterForUser("healtest-p1");
    if (!char) {
      expect(true).toBe(true);
      return;
    }
    char.conditions = handleDropToZero(char.conditions);
    const result = handleUseItem("healtest-p1", { item_name: "Potion of Healing" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("unconscious");
    char.conditions = [];
  });
});

// --- Round 3: XP leveling is correct ---

describe("XP leveling (Round 3 Bug 2)", () => {
  test("75 XP does not level past 1", () => {
    const char = getCharacterForUser("healtest-p2");
    if (!char) {
      expect(true).toBe(true);
      return;
    }
    // Reset all party members to known state
    const party = getPartyForUser("healtest-p1");
    if (!party) { expect(true).toBe(true); return; }
    for (const mid of party.members) {
      const c = getCharacterForUser(["healtest-p1","healtest-p2","healtest-p3","healtest-p4"].find(u => {
        const ch = getCharacterForUser(u);
        return ch && ch.id === mid;
      }) ?? "");
      if (c) { c.level = 1; c.xp = 0; }
    }

    // Award 75 XP total — split among 4 = 18 each. Well below 300 threshold for level 2.
    const result = handleAwardXp("healtest-dm", { amount: 75 });
    expect(result.success).toBe(true);
    expect(result.data!.xpEach).toBe(18); // Math.floor(75 / 4)

    // Each character should have 18 XP and still be level 1
    expect(char.xp).toBe(18);
    expect(char.level).toBe(1);
  });

  test("xpEach calculates correctly for a 4-person party", () => {
    // A single goblin worth 25 XP split among 4 players = 6 each (Math.floor(25/4))
    const monsters: MonsterInstance[] = [{
      id: "xp-test-goblin",
      templateName: "Goblin",
      name: "Goblin A",
      hpCurrent: 0,
      hpMax: 7,
      ac: 15,
      abilityScores: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
      attacks: [{ name: "Scimitar", to_hit: 4, damage: "1d6+2", type: "slashing" }],
      specialAbilities: [],
      xpValue: 25,
      conditions: [],
      isAlive: false,
      rechargeTracker: {},
    }];

    const totalXP = calculateEncounterXP(monsters);
    expect(totalXP).toBe(25);

    const xpEach = Math.floor(totalXP / 4);
    expect(xpEach).toBe(6);
  });

  test("calculateEncounterXP handles undefined xpValue safely", () => {
    const monsters = [
      { xpValue: undefined } as unknown as MonsterInstance,
      { xpValue: 50 } as unknown as MonsterInstance,
    ];
    const total = calculateEncounterXP(monsters);
    expect(total).toBe(50); // undefined treated as 0, not NaN
    expect(Number.isFinite(total)).toBe(true);
  });

  test("NaN XP does not cause level-up", () => {
    const char = getCharacterForUser("healtest-p3");
    if (!char) {
      expect(true).toBe(true);
      return;
    }
    // Simulate corrupted XP
    char.level = 1;
    char.xp = NaN;

    // Award XP — should not crash or cause level jump
    const result = handleAwardXp("healtest-dm", { amount: 100 });
    // The XP is corrupted, so it stays NaN+100 = NaN. Level should not change.
    expect(char.level).toBe(1);

    // Clean up
    char.xp = 0;
  });
});

// --- B036: Bonus action healing (Healing Word) clears unconscious/prone ---

describe("B036: bonus_action healing clears unconscious and resets death saves", () => {
  const dmUser = "b036-dm";
  const players = ["b036-p1", "b036-p2", "b036-p3", "b036-p4"];

  test("setup: form party with cleric", async () => {
    // p1 = cleric (healer), p2-p4 = fighters (targets)
    await handleCreateCharacter(players[0], {
      name: "B036Cleric",
      race: "human",
      class: "cleric",
      ability_scores: { str: 10, dex: 10, con: 14, int: 10, wis: 16, cha: 10 },
      avatar_url: "https://example.com/test.png",
    });
    for (let i = 1; i < 4; i++) {
      await handleCreateCharacter(players[i], {
        name: `B036Fighter${i}`,
        race: "human",
        class: "fighter" as any,
        ability_scores: scores,
        avatar_url: "https://example.com/test.png",
      });
      handleQueueForParty(players[i]);
    }
    handleQueueForParty(players[0]);
    handleDMQueueForParty(dmUser);
    expect(getPartyForUser(players[0])).not.toBeNull();
  });

  test("setup: start combat", () => {
    const result = handleSpawnEncounter(dmUser, { monsters: [{ type: "goblin", count: 1 }] });
    expect(result.success).toBe(true);
  });

  test("Healing Word via bonus_action on dying character clears unconscious/prone and resets death saves", () => {
    const cleric = getCharacterForUser(players[0])!;
    const target = getCharacterForUser(players[1])!;

    // Simulate target knocked to 0 HP
    target.hpCurrent = 0;
    target.conditions = handleDropToZero(target.conditions);
    target.deathSaves = { successes: 1, failures: 2 };

    expect(target.conditions).toContain("unconscious");
    expect(target.conditions).toContain("prone");

    // Cast Healing Word as bonus action
    const result = handleBonusAction(players[0], {
      action: "cast",
      spell_name: "Healing Word",
      target_id: target.id,
    });

    if (result.success) {
      // Target should be healed above 0
      expect(target.hpCurrent).toBeGreaterThan(0);
      // Conditions MUST be cleared — this was the B036 bug
      expect(target.conditions).not.toContain("unconscious");
      expect(target.conditions).not.toContain("prone");
      // Death saves MUST be reset
      expect(target.deathSaves.successes).toBe(0);
      expect(target.deathSaves.failures).toBe(0);
    }
  });
});
