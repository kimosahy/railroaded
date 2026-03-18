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
  handleEndTurn,
  handleBonusAction,
  getPartyForUser,
  getCharacterForUser,
} from "../src/game/game-manager.ts";
import { getCurrentCombatant } from "../src/game/session.ts";
import { classFeatures } from "../src/game/character-creation.ts";
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

// === B016b: bandit-captain (hyphenated) should resolve to Bandit Captain template ===
describe("B016b: hyphenated template names resolve correctly", () => {
  let dm: string;

  test("setup party", async () => {
    const setup = await setupParty("b016h");
    dm = setup.dm;
    expect(getPartyForUser(setup.players[0])).not.toBeNull();
  });

  test("'bandit-captain' resolves to Bandit Captain with correct stats", () => {
    const result = handleSpawnEncounter(dm, {
      monsters: [{ template_name: "bandit-captain", count: 1 }],
    });
    expect(result.success).toBe(true);
    const monsters = (result.data as any)?.monsters;
    expect(monsters).toBeDefined();
    expect(monsters.length).toBe(1);
    // Should use the canonical name "Bandit Captain", not "bandit-captain"
    expect(monsters[0].name).toBe("Bandit Captain");
    // Should have Bandit Captain stats (CR 2), not default fallback (HP 10, AC 12)
    expect(monsters[0].hp).toBe(65);
    expect(monsters[0].ac).toBe(15);
  });

  test("'hobgoblin-warlord' resolves to Hobgoblin Warlord", async () => {
    const setup = await setupParty("b016h2");
    const result = handleSpawnEncounter(setup.dm, {
      monsters: [{ template_name: "hobgoblin-warlord", count: 1 }],
    });
    expect(result.success).toBe(true);
    const monsters = (result.data as any)?.monsters;
    expect(monsters[0].name).toBe("Hobgoblin Warlord");
    expect(monsters[0].hp).toBe(52);
    expect(monsters[0].ac).toBe(17);
  });

  test("'giant-rat' resolves to Giant Rat", async () => {
    const setup = await setupParty("b016h3");
    const result = handleSpawnEncounter(setup.dm, {
      monsters: [{ template_name: "giant-rat", count: 1 }],
    });
    expect(result.success).toBe(true);
    const monsters = (result.data as any)?.monsters;
    expect(monsters[0].name).toBe("Giant Rat");
    expect(monsters[0].hp).toBe(7);
  });
});

// === B024: spawn-encounter with string array creates 'unknown' monsters with wrong stats ===
describe("B024: spawn-encounter with string array resolves templates", () => {
  let dm: string;

  test("setup party", async () => {
    const setup = await setupParty("b024");
    dm = setup.dm;
    expect(getPartyForUser(setup.players[0])).not.toBeNull();
  });

  test("string array ['Goblin','Goblin'] spawns 2 goblins with correct stats", () => {
    const result = handleSpawnEncounter(dm, { monsters: ["Goblin", "Goblin"] } as any);
    expect(result.success).toBe(true);
    const monsters = (result.data as any)?.monsters;
    expect(monsters).toBeDefined();
    expect(monsters.length).toBe(2);
    for (const m of monsters) {
      expect(m.name.toLowerCase()).toContain("goblin");
      expect(m.name.toLowerCase()).not.toContain("unknown");
      // Goblin stats: HP 7, AC 15 — not default HP 10, AC 12
      expect(m.hp).not.toBe(10);
      expect(m.ac).not.toBe(12);
    }
  });
});

describe("B024: string array with mixed monster types", () => {
  let dm: string;

  test("setup party", async () => {
    const setup = await setupParty("b024b");
    dm = setup.dm;
  });

  test("['Goblin','Hobgoblin','Skeleton'] spawns 3 distinct monsters", () => {
    const result = handleSpawnEncounter(dm, { monsters: ["Goblin", "Hobgoblin", "Skeleton"] } as any);
    expect(result.success).toBe(true);
    const monsters = (result.data as any)?.monsters;
    expect(monsters).toBeDefined();
    expect(monsters.length).toBe(3);
    // None should be 'unknown'
    for (const m of monsters) {
      expect(m.name.toLowerCase()).not.toContain("unknown");
    }
  });
});

describe("B024: case-insensitive string array", () => {
  let dm: string;

  test("setup party", async () => {
    const setup = await setupParty("b024c");
    dm = setup.dm;
  });

  test("['goblin'] (lowercase) resolves to Goblin template", () => {
    const result = handleSpawnEncounter(dm, { monsters: ["goblin"] } as any);
    expect(result.success).toBe(true);
    const monsters = (result.data as any)?.monsters;
    expect(monsters).toBeDefined();
    expect(monsters.length).toBe(1);
    expect(monsters[0].name).toBe("Goblin");
    expect(monsters[0].hp).not.toBe(10);
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

// === B009: Actions endpoint lists route names that don't match actual API routes ===
describe("B009: actions endpoint includes actionRoutes mapping", () => {
  test("idle (no character) includes actionRoutes with correct REST paths", () => {
    const result = handleGetAvailableActions("b009-no-char");
    expect(result.success).toBe(true);
    const routes = result.data!.actionRoutes as Record<string, { method: string; path: string }>;
    expect(routes).toBeDefined();
    expect(routes.create_character).toEqual({ method: "POST", path: "/api/v1/character" });
  });

  test("idle (character, no session) includes actionRoutes", async () => {
    await handleCreateCharacter("b009-idle", {
      name: "B009Idle",
      race: "human",
      class: "fighter" as any,
      ability_scores: scores,
      avatar_url: "https://example.com/test.png",
    });
    const result = handleGetAvailableActions("b009-idle");
    expect(result.success).toBe(true);
    const routes = result.data!.actionRoutes as Record<string, { method: string; path: string }>;
    expect(routes).toBeDefined();
    expect(routes.queue).toEqual({ method: "POST", path: "/api/v1/queue" });
    expect(routes.get_status).toEqual({ method: "GET", path: "/api/v1/status" });
    expect(routes.get_inventory).toEqual({ method: "GET", path: "/api/v1/inventory" });
  });

  test("in-session exploration: mismatched names map to correct routes", async () => {
    const setup = await setupParty("b009-session");
    const result = handleGetAvailableActions(setup.players[0]);
    expect(result.success).toBe(true);
    const routes = result.data!.actionRoutes as Record<string, { method: string; path: string }>;
    expect(routes).toBeDefined();
    // These are the action names that don't match their REST routes
    expect(routes.use_item).toEqual({ method: "POST", path: "/api/v1/use-item" });
    expect(routes.pickup_item).toEqual({ method: "POST", path: "/api/v1/pickup" });
    expect(routes.party_chat).toEqual({ method: "POST", path: "/api/v1/chat" });
    expect(routes.short_rest).toEqual({ method: "POST", path: "/api/v1/short-rest" });
    expect(routes.long_rest).toEqual({ method: "POST", path: "/api/v1/long-rest" });
  });

  test("every action in availableActions has a corresponding route", async () => {
    const setup = await setupParty("b009-all");
    const result = handleGetAvailableActions(setup.players[0]);
    expect(result.success).toBe(true);
    const actions = result.data!.availableActions as string[];
    const routes = result.data!.actionRoutes as Record<string, { method: string; path: string }>;
    for (const action of actions) {
      expect(routes[action]).toBeDefined();
      expect(routes[action].method).toMatch(/^(GET|POST)$/);
      expect(routes[action].path).toMatch(/^\/api\/v1\//);
    }
  });
});

// === B051: Cast spell response missing targetHP, hit/miss, and killed fields ===

describe("B051: cast spell response includes targetHP and killed", () => {
  const prefix = "b051";
  const dm = `${prefix}-dm`;
  const wizUser = `${prefix}-wiz`;

  test("setup: form wizard party with combat encounter", async () => {
    await handleCreateCharacter(wizUser, {
      name: "B051Wizard",
      race: "elf",
      class: "wizard" as any,
      ability_scores: { str: 10, dex: 14, con: 12, int: 18, wis: 14, cha: 10 },
      avatar_url: "https://example.com/test.png",
    });
    for (let i = 1; i <= 3; i++) {
      await handleCreateCharacter(`${prefix}-p${i}`, {
        name: `B051Hero${i}`,
        race: "human",
        class: "fighter" as any,
        ability_scores: scores,
        avatar_url: "https://example.com/test.png",
      });
      handleQueueForParty(`${prefix}-p${i}`);
    }
    handleQueueForParty(wizUser);
    handleDMQueueForParty(dm);

    const party = getPartyForUser(wizUser);
    expect(party).not.toBeNull();

    const spawn = handleSpawnEncounter(dm, { monsters: [{ template_name: "Goblin", count: 1 }] });
    expect(spawn.success).toBe(true);
  });

  test("magic_missile response includes targetHP and killed (auto-hit spell)", () => {
    const party = getPartyForUser(wizUser);
    if (!party?.session || party.session.phase !== "combat") return;

    const goblin = party.monsters.find((m) => m.isAlive);
    if (!goblin) return;

    // Advance to wizard's turn
    const char = getCharacterForUser(wizUser);
    if (!char) return;
    while (getCurrentCombatant(party.session!)?.entityId !== char.id) {
      const current = getCurrentCombatant(party.session!);
      if (!current) break;
      if (current.type === "player") {
        // Find userId for this character's turn and end it
        const pid = [wizUser, `${prefix}-p1`, `${prefix}-p2`, `${prefix}-p3`].find(
          (u) => getCharacterForUser(u)?.id === current.entityId
        );
        if (pid) handleEndTurn(pid);
      } else {
        // Skip monster turn by advancing
        party.session = party.session!;
        const { nextTurn } = require("../src/game/session.ts");
        party.session = nextTurn(party.session!);
      }
    }

    // Set goblin HP low but not 1 so we can verify HP tracking
    goblin.hpCurrent = 20;

    const result = handleCast(wizUser, { spell_name: "Magic Missile", target_id: goblin.id });
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();

    // Magic Missile auto-hits (no spellAttackType), so no hit field
    expect(result.data!.targetHP).toBeDefined();
    expect(typeof result.data!.targetHP).toBe("number");
    expect(result.data!.killed).toBeDefined();
    expect(typeof result.data!.killed).toBe("boolean");
  });
});

describe("B051: fire_bolt spell attack includes hit field", () => {
  const prefix = "b051b";
  const dm = `${prefix}-dm`;
  const wizUser = `${prefix}-wiz`;

  test("setup: form wizard party with combat encounter", async () => {
    await handleCreateCharacter(wizUser, {
      name: "B051bWizard",
      race: "elf",
      class: "wizard" as any,
      ability_scores: { str: 10, dex: 14, con: 12, int: 18, wis: 14, cha: 10 },
      avatar_url: "https://example.com/test.png",
    });
    for (let i = 1; i <= 3; i++) {
      await handleCreateCharacter(`${prefix}-p${i}`, {
        name: `B051bHero${i}`,
        race: "human",
        class: "fighter" as any,
        ability_scores: scores,
        avatar_url: "https://example.com/test.png",
      });
      handleQueueForParty(`${prefix}-p${i}`);
    }
    handleQueueForParty(wizUser);
    handleDMQueueForParty(dm);

    const party = getPartyForUser(wizUser);
    expect(party).not.toBeNull();

    const spawn = handleSpawnEncounter(dm, { monsters: [{ template_name: "Goblin", count: 1 }] });
    expect(spawn.success).toBe(true);
  });

  test("fire_bolt response includes hit, naturalRoll, targetHP and killed", () => {
    const party = getPartyForUser(wizUser);
    if (!party?.session || party.session.phase !== "combat") return;

    const goblin = party.monsters.find((m) => m.isAlive);
    if (!goblin) return;

    const char = getCharacterForUser(wizUser);
    if (!char) return;

    // Advance to wizard's turn
    while (getCurrentCombatant(party.session!)?.entityId !== char.id) {
      const current = getCurrentCombatant(party.session!);
      if (!current) break;
      if (current.type === "player") {
        const pid = [wizUser, `${prefix}-p1`, `${prefix}-p2`, `${prefix}-p3`].find(
          (u) => getCharacterForUser(u)?.id === current.entityId
        );
        if (pid) handleEndTurn(pid);
      } else {
        const { nextTurn } = require("../src/game/session.ts");
        party.session = nextTurn(party.session!);
      }
    }

    goblin.hpCurrent = 50; // High HP so it's not killed

    const result = handleCast(wizUser, { spell_name: "Fire Bolt", target_id: goblin.id });
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();

    // Fire Bolt has spellAttackType: "ranged", so hit/naturalRoll should be present
    expect(result.data!.hit).toBeDefined();
    expect(typeof result.data!.hit).toBe("boolean");
    expect(result.data!.naturalRoll).toBeDefined();
    expect(typeof result.data!.naturalRoll).toBe("number");

    // targetHP and killed should always be present for targeted damage spells
    expect(result.data!.targetHP).toBeDefined();
    expect(typeof result.data!.targetHP).toBe("number");
    expect(result.data!.killed).toBeDefined();
    expect(typeof result.data!.killed).toBe("boolean");

    if (result.data!.hit) {
      // On hit, damage should be applied
      expect(result.data!.effect).toBeGreaterThan(0);
      expect(result.data!.targetHP).toBeLessThan(50);
    } else {
      // On miss, effect should be 0 and HP unchanged
      expect(result.data!.effect).toBe(0);
      expect(result.data!.targetHP).toBe(50);
    }
  });
});
