/**
 * Encounter spawning and monster turn management.
 */

import { rollInitiative, sortInitiative } from "../engine/combat.ts";
import type { InitiativeEntry } from "../engine/combat.ts";
import type { AbilityScores } from "../types.ts";

export interface MonsterInstance {
  id: string;
  templateName: string;
  name: string;
  hpCurrent: number;
  hpMax: number;
  ac: number;
  abilityScores: AbilityScores;
  attacks: { name: string; to_hit: number; damage: string; type: string }[];
  specialAbilities: string[];
  xpValue: number;
  conditions: string[];
  isAlive: boolean;
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
      attacks: { name: string; to_hit: number; damage: string; type: string }[];
      specialAbilities: string[];
      xpValue: number;
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

      instances.push({
        id: `monster-${counter}`,
        templateName: group.templateName,
        name,
        hpCurrent: group.template.hpMax,
        hpMax: group.template.hpMax,
        ac: group.template.ac,
        abilityScores: { ...group.template.abilityScores },
        attacks: [...group.template.attacks],
        specialAbilities: [...group.template.specialAbilities],
        xpValue: group.template.xpValue,
        conditions: [],
        isAlive: true,
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
 */
export function damageMonster(
  monster: MonsterInstance,
  damage: number
): { monster: MonsterInstance; killed: boolean } {
  const newHP = Math.max(0, monster.hpCurrent - damage);
  const killed = newHP <= 0;

  return {
    monster: {
      ...monster,
      hpCurrent: newHP,
      isAlive: !killed,
    },
    killed,
  };
}

/**
 * Get total XP value of all monsters in an encounter.
 */
export function calculateEncounterXP(monsters: MonsterInstance[]): number {
  return monsters.reduce((sum, m) => sum + m.xpValue, 0);
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
