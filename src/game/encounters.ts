/**
 * Encounter spawning and monster turn management.
 */

import { rollInitiative, sortInitiative } from "../engine/combat.ts";
import type { InitiativeEntry } from "../engine/combat.ts";
import type { AbilityScores } from "../types.ts";
import type { LootTableEntry } from "../engine/loot.ts";

export interface MonsterAttack {
  name: string;
  to_hit: number;
  damage: string;
  type: string;
  recharge?: number;  // recharges on d6 >= this value (e.g. 5 = recharge 5-6)
  aoe?: boolean;      // hits all players (each makes a save)
  save_dc?: number;   // DC for save-based attacks
  save_ability?: string; // ability for save (e.g. "dex", "con")
}

export interface MonsterInstance {
  id: string;
  templateName: string;
  name: string;
  hpCurrent: number;
  hpMax: number;
  ac: number;
  abilityScores: AbilityScores;
  attacks: MonsterAttack[];
  specialAbilities: string[];
  xpValue: number;
  conditions: string[];
  isAlive: boolean;
  lootTable?: LootTableEntry[];
  rechargeTracker: Record<string, boolean>; // attack name → available (true = ready to use)
}

export interface EncounterState {
  monsters: MonsterInstance[];
  active: boolean;
}

/**
 * Spawn monsters from an encounter template.
 * Returns monster instances with unique IDs and names.
 */
export function spawnMonsters(
  monstersToSpawn: {
    templateName: string;
    count: number;
    template: {
      hpMax: number;
      ac: number;
      abilityScores: AbilityScores;
      attacks: MonsterAttack[];
      specialAbilities: string[];
      xpValue: number;
      lootTable?: LootTableEntry[];
    };
  }[]
): MonsterInstance[] {
  const instances: MonsterInstance[] = [];
  let counter = 1;

  for (const group of monstersToSpawn) {
    for (let i = 0; i < group.count; i++) {
      const name =
        group.count > 1
          ? `${group.templateName} ${String.fromCharCode(64 + counter)}` // Goblin A, Goblin B...
          : group.templateName;

      // Initialize recharge tracker — all rechargeable attacks start available
      const rechargeTracker: Record<string, boolean> = {};
      for (const atk of group.template.attacks) {
        if (atk.recharge) rechargeTracker[atk.name] = true;
      }

      instances.push({
        id: `monster-${counter}`,
        templateName: group.templateName,
        name,
        hpCurrent: group.template.hpMax ?? 10,
        hpMax: group.template.hpMax ?? 10,
        ac: group.template.ac ?? 12,
        abilityScores: { ...group.template.abilityScores },
        attacks: group.template.attacks.map((a) => ({ ...a })),
        specialAbilities: [...group.template.specialAbilities],
        xpValue: group.template.xpValue,
        conditions: [],
        isAlive: true,
        lootTable: group.template.lootTable ? [...group.template.lootTable] : undefined,
        rechargeTracker,
      });
      counter++;
    }
  }

  return instances;
}

/**
 * Roll initiative for all combatants (players + monsters).
 * Returns sorted initiative order.
 */
export function rollEncounterInitiative(
  players: { id: string; name: string; dexScore: number }[],
  monsters: MonsterInstance[],
  randomFn?: (sides: number) => number
): InitiativeEntry[] {
  const entries: InitiativeEntry[] = [];

  for (const p of players) {
    entries.push(
      rollInitiative(p.id, p.name, p.dexScore, "player", randomFn)
    );
  }

  for (const m of monsters) {
    entries.push(
      rollInitiative(m.id, m.name, m.abilityScores.dex, "monster", randomFn)
    );
  }

  return sortInitiative(entries);
}

/**
 * Apply damage to a monster instance.
 * Returns updated monster and whether it was killed.
 * Wakes sleeping monsters (damage breaks Sleep per 5e rules).
 */
export function damageMonster(
  monster: MonsterInstance,
  damage: number
): { monster: MonsterInstance; killed: boolean; wokeUp: boolean } {
  const wokeUp = monster.conditions.includes("asleep");
  const conditions = wokeUp
    ? monster.conditions.filter((c) => c !== "asleep")
    : [...monster.conditions];
  const newHP = Math.max(0, monster.hpCurrent - damage);
  const killed = newHP <= 0;

  return {
    monster: {
      ...monster,
      conditions,
      hpCurrent: newHP,
      isAlive: !killed,
    },
    killed,
    wokeUp,
  };
}

/**
 * Get total XP value of all monsters in an encounter.
 */
export function calculateEncounterXP(monsters: MonsterInstance[]): number {
  return monsters.reduce((sum, m) => sum + (m.xpValue ?? 0), 0);
}

/**
 * Check if all monsters are dead/fled.
 */
export function isEncounterOver(monsters: MonsterInstance[]): boolean {
  return monsters.every((m) => !m.isAlive);
}

/**
 * Get alive monsters.
 */
export function getAliveMonsters(monsters: MonsterInstance[]): MonsterInstance[] {
  return monsters.filter((m) => m.isAlive);
}
