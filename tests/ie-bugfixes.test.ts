import { describe, test, expect } from "bun:test";
import {
  handleCreateCharacter,
  handleGetAvailableActions,
  handleGetStatus,
  handleQueueForParty,
  handleDMQueueForParty,
  handleSpawnEncounter,
  handleNarrate,
  handleNarrateTo,
  handleCast,
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

// === B011: spawn-encounter with custom monster objects (no count field) should not produce empty combat ===
describe("B011: spawn-encounter with custom monster objects", () => {
  let dm: string;

  test("setup party", async () => {
    const setup = await setupParty("b011");
    dm = setup.dm;
  });

  test("custom object with name but no count spawns 1 monster", () => {
    const result = handleSpawnEncounter(dm, {
      monsters: [{ name: "Skeleton", hp: 13, ac: 13, attacks: [{ name: "Shortsword", to_hit: 4, damage: "1d6+2", type: "slashing" }] }],
    } as any);
    expect(result.success).toBe(true);
    const monsters = (result.data as any)?.monsters;
    expect(monsters).toBeDefined();
    expect(monsters.length).toBe(1);
    expect(monsters[0].name.toLowerCase()).toContain("skeleton");
  });
});

describe("B011: spawn-encounter template_name without count defaults to 1", () => {
  let dm: string;

  test("setup party", async () => {
    const setup = await setupParty("b011b");
    dm = setup.dm;
  });

  test("template_name without count spawns 1 monster", () => {
    const result = handleSpawnEncounter(dm, {
      monsters: [{ template_name: "goblin" }],
    } as any);
    expect(result.success).toBe(true);
    const monsters = (result.data as any)?.monsters;
    expect(monsters).toBeDefined();
    expect(monsters.length).toBe(1);
    expect(monsters[0].name.toLowerCase()).toContain("goblin");
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

// === B013: Status endpoint should show known/prepared spells for spellcasters ===
describe("B013: status endpoint shows spells for spellcasters", () => {
  test("cleric gets spells grouped by level with cantrips", async () => {
    await handleCreateCharacter("b013-cleric", {
      name: "SpellCleric",
      race: "human",
      class: "cleric" as any,
      ability_scores: { str: 10, dex: 10, con: 14, int: 10, wis: 16, cha: 10 },
      avatar_url: "https://example.com/test.png",
    });
    const result = handleGetStatus("b013-cleric");
    expect(result.success).toBe(true);
    expect(result.data!.spells).not.toBeNull();
    const spells = result.data!.spells as Record<string, { name: string }[]>;
    expect(spells.cantrips).toBeDefined();
    expect(spells.cantrips.length).toBeGreaterThan(0);
    expect(spells.level_1).toBeDefined();
    expect(spells.level_1.length).toBeGreaterThan(0);
    // Every spell should have name and effect
    for (const spell of spells.cantrips) {
      expect(spell.name).toBeDefined();
    }
  });

  test("wizard gets spells grouped by level with cantrips", async () => {
    await handleCreateCharacter("b013-wizard", {
      name: "SpellWizard",
      race: "elf",
      class: "wizard" as any,
      ability_scores: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 10 },
      avatar_url: "https://example.com/test.png",
    });
    const result = handleGetStatus("b013-wizard");
    expect(result.success).toBe(true);
    expect(result.data!.spells).not.toBeNull();
    const spells = result.data!.spells as Record<string, { name: string }[]>;
    expect(spells.cantrips).toBeDefined();
    expect(spells.cantrips.length).toBeGreaterThan(0);
    expect(spells.level_1).toBeDefined();
    expect(spells.level_1.length).toBeGreaterThan(0);
  });

  test("fighter gets null spells", async () => {
    await handleCreateCharacter("b013-fighter", {
      name: "NoSpellFighter",
      race: "human",
      class: "fighter" as any,
      ability_scores: { str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 15 },
      avatar_url: "https://example.com/test.png",
    });
    const result = handleGetStatus("b013-fighter");
    expect(result.success).toBe(true);
    expect(result.data!.spells).toBeNull();
  });

  test("spell entries include effect and castingTime", async () => {
    const result = handleGetStatus("b013-cleric");
    const spells = result.data!.spells as Record<string, { name: string; effect: string; castingTime: string }[]>;
    for (const level of Object.keys(spells)) {
      for (const spell of spells[level]) {
        expect(spell.effect).toBeDefined();
        expect(spell.castingTime).toBeDefined();
      }
    }
  });
});

// === B012: Spell names should accept snake_case and case-insensitive input ===
describe("B012: spell name normalization accepts snake_case and mixed case", () => {
  test("setup wizard for casting tests", async () => {
    await handleCreateCharacter("b012-wiz", {
      name: "CaseWizard",
      race: "elf",
      class: "wizard" as any,
      ability_scores: { str: 8, dex: 14, con: 12, int: 16, wis: 10, cha: 10 },
      avatar_url: "https://example.com/test.png",
    });
    // Need a party + session for casting to work
    for (let i = 1; i <= 3; i++) {
      await handleCreateCharacter(`b012-p${i}`, {
        name: `B012Hero${i}`,
        race: "human",
        class: "fighter" as any,
        ability_scores: scores,
        avatar_url: "https://example.com/test.png",
      });
      handleQueueForParty(`b012-p${i}`);
    }
    handleQueueForParty("b012-wiz");
    handleDMQueueForParty("b012-dm");
    expect(getPartyForUser("b012-wiz")).not.toBeNull();
  });

  test("Title Case works (existing behavior)", () => {
    const result = handleCast("b012-wiz", { spell_name: "Fire Bolt" });
    // Should not fail with "Unknown spell"
    expect(result.error ?? "").not.toContain("Unknown spell");
  });

  test("snake_case spell name is accepted", () => {
    const result = handleCast("b012-wiz", { spell_name: "fire_bolt" });
    expect(result.error ?? "").not.toContain("Unknown spell");
  });

  test("lowercase spell name is accepted", () => {
    const result = handleCast("b012-wiz", { spell_name: "fire bolt" });
    expect(result.error ?? "").not.toContain("Unknown spell");
  });

  test("UPPER CASE spell name is accepted", () => {
    const result = handleCast("b012-wiz", { spell_name: "FIRE BOLT" });
    expect(result.error ?? "").not.toContain("Unknown spell");
  });

  test("multi-word snake_case (sacred_flame) is accepted", async () => {
    await handleCreateCharacter("b012-clr", {
      name: "CaseCleric",
      race: "human",
      class: "cleric" as any,
      ability_scores: { str: 10, dex: 10, con: 14, int: 10, wis: 16, cha: 10 },
      avatar_url: "https://example.com/test.png",
    });
    for (let i = 4; i <= 6; i++) {
      await handleCreateCharacter(`b012-p${i}`, {
        name: `B012Hero${i}`,
        race: "human",
        class: "fighter" as any,
        ability_scores: scores,
        avatar_url: "https://example.com/test.png",
      });
      handleQueueForParty(`b012-p${i}`);
    }
    handleQueueForParty("b012-clr");
    handleDMQueueForParty("b012-dm2");

    const result = handleCast("b012-clr", { spell_name: "sacred_flame" });
    expect(result.error ?? "").not.toContain("Unknown spell");
  });
});
