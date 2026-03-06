import { describe, test, expect } from "bun:test";
import {
  spawnMonsters,
  damageMonster,
  isEncounterOver,
  calculateEncounterXP,
  rollEncounterInitiative,
  getAliveMonsters,
} from "../src/game/encounters.ts";

// --- Helpers ---

function makeRoller(values: number[]) {
  let i = 0;
  return (_sides: number) => {
    const val = values[i % values.length]!;
    i++;
    return val;
  };
}

const goblinTemplate = {
  hpMax: 10,
  ac: 12,
  abilityScores: { str: 8, dex: 14, con: 10, int: 10, wis: 8, cha: 8 },
  attacks: [{ name: "Scimitar", to_hit: 4, damage: "1d6+2", type: "slashing" }],
  specialAbilities: ["Nimble Escape"],
  xpValue: 50,
};

const wolfTemplate = {
  hpMax: 11,
  ac: 13,
  abilityScores: { str: 12, dex: 15, con: 12, int: 3, wis: 12, cha: 6 },
  attacks: [{ name: "Bite", to_hit: 4, damage: "2d4+2", type: "piercing" }],
  specialAbilities: ["Pack Tactics"],
  xpValue: 25,
};

// --- Tests ---

// (a) spawnMonsters → correct count, HP, abilities

describe("spawnMonsters", () => {
  test("spawns correct count with HP, AC, and abilities", () => {
    const monsters = spawnMonsters([
      { templateName: "Goblin", count: 3, template: goblinTemplate },
    ]);
    expect(monsters).toHaveLength(3);
    for (const m of monsters) {
      expect(m.hpCurrent).toBe(10);
      expect(m.hpMax).toBe(10);
      expect(m.ac).toBe(12);
      expect(m.isAlive).toBe(true);
      expect(m.xpValue).toBe(50);
      expect(m.attacks).toHaveLength(1);
      expect(m.specialAbilities).toContain("Nimble Escape");
    }
  });

  test("single monster gets plain name, multiple get letter suffixes", () => {
    const single = spawnMonsters([{ templateName: "Dragon", count: 1, template: goblinTemplate }]);
    expect(single[0]!.name).toBe("Dragon");

    const multi = spawnMonsters([{ templateName: "Goblin", count: 3, template: goblinTemplate }]);
    expect(multi[0]!.name).toContain("Goblin");
    expect(multi[1]!.name).toContain("Goblin");
    expect(multi[2]!.name).toContain("Goblin");
  });

  test("unique IDs across groups", () => {
    const monsters = spawnMonsters([
      { templateName: "Goblin", count: 2, template: goblinTemplate },
      { templateName: "Wolf", count: 1, template: wolfTemplate },
    ]);
    const ids = monsters.map((m) => m.id);
    expect(new Set(ids).size).toBe(3);
  });
});

// (b) damageMonster → HP reduction, death at 0

describe("damageMonster", () => {
  test("reduces HP by damage amount", () => {
    const monster = spawnMonsters([{ templateName: "Goblin", count: 1, template: goblinTemplate }])[0]!;
    const { monster: updated, killed } = damageMonster(monster, 4);
    expect(updated.hpCurrent).toBe(6);
    expect(killed).toBe(false);
    expect(updated.isAlive).toBe(true);
  });

  test("dies at 0 HP", () => {
    const monster = spawnMonsters([{ templateName: "Goblin", count: 1, template: goblinTemplate }])[0]!;
    const { monster: updated, killed } = damageMonster(monster, 10);
    expect(updated.hpCurrent).toBe(0);
    expect(killed).toBe(true);
    expect(updated.isAlive).toBe(false);
  });

  test("overkill damage clamped to 0 HP", () => {
    const monster = spawnMonsters([{ templateName: "Goblin", count: 1, template: goblinTemplate }])[0]!;
    const { monster: updated } = damageMonster(monster, 999);
    expect(updated.hpCurrent).toBe(0);
  });
});

// (c) isEncounterOver → true when all monsters dead

describe("isEncounterOver", () => {
  test("true when all monsters dead", () => {
    const monsters = spawnMonsters([{ templateName: "Goblin", count: 2, template: goblinTemplate }]);
    const dead = monsters.map((m) => ({ ...m, isAlive: false }));
    expect(isEncounterOver(dead)).toBe(true);
  });

  test("false when any monster alive", () => {
    const monsters = spawnMonsters([{ templateName: "Goblin", count: 2, template: goblinTemplate }]);
    const mixed = [{ ...monsters[0]!, isAlive: false }, monsters[1]!];
    expect(isEncounterOver(mixed)).toBe(false);
  });
});

// (d) calculateEncounterXP → correct total

describe("calculateEncounterXP", () => {
  test("sums XP for all monsters", () => {
    const monsters = spawnMonsters([
      { templateName: "Goblin", count: 2, template: goblinTemplate },
      { templateName: "Wolf", count: 1, template: wolfTemplate },
    ]);
    expect(calculateEncounterXP(monsters)).toBe(125); // 50 + 50 + 25
  });
});

// (e) rollEncounterInitiative → all entities have initiative values

describe("rollEncounterInitiative", () => {
  test("all entities get initiative values", () => {
    const players = [
      { id: "p1", name: "Fighter", dexScore: 14 },
      { id: "p2", name: "Rogue", dexScore: 16 },
    ];
    const monsters = spawnMonsters([{ templateName: "Goblin", count: 2, template: goblinTemplate }]);
    const init = rollEncounterInitiative(players, monsters, makeRoller([10, 15, 12, 8]));
    expect(init).toHaveLength(4);
    for (const entry of init) {
      expect(entry.initiative).toBeGreaterThan(0);
      expect(entry.entityId).toBeDefined();
      expect(entry.name).toBeDefined();
    }
  });

  test("sorted by initiative descending", () => {
    const players = [{ id: "p1", name: "Fighter", dexScore: 10 }];
    const monsters = spawnMonsters([{ templateName: "Goblin", count: 1, template: goblinTemplate }]);
    // p1: roll 5 + mod(10)=0 = 5, monster: roll 18 + mod(14)=2 = 20
    const init = rollEncounterInitiative(players, monsters, makeRoller([5, 18]));
    expect(init[0]!.type).toBe("monster");
    expect(init[1]!.entityId).toBe("p1");
  });
});

// getAliveMonsters

describe("getAliveMonsters", () => {
  test("filters to alive monsters only", () => {
    const monsters = spawnMonsters([{ templateName: "Goblin", count: 3, template: goblinTemplate }]);
    const mixed = [
      { ...monsters[0]!, isAlive: false },
      monsters[1]!,
      { ...monsters[2]!, isAlive: false },
    ];
    const alive = getAliveMonsters(mixed);
    expect(alive).toHaveLength(1);
    expect(alive[0]!.id).toBe(monsters[1]!.id);
  });
});
