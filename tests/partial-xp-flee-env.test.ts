/**
 * CC-260429-FRONTEND-LIVE Task 1.
 *
 * Two combat-end exits previously awarded 0 XP:
 *  - Monster-flee path (handleMonsterAction action="flee" → all monsters gone)
 *  - Environment-damage TPK (last PC dies from env damage with combat ending)
 *
 * Mirrors tests/partial-xp-award.test.ts setup pattern.
 */
import { describe, test, expect } from "bun:test";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  handleSpawnEncounter,
  handleMonsterAction,
  handleDealEnvironmentDamage,
  getState,
} from "../src/game/game-manager.ts";
import type { AbilityScores } from "../src/types.ts";

const scores: AbilityScores = { str: 14, dex: 14, con: 14, int: 10, wis: 10, cha: 10 };

let counter = 0;
function uid(prefix: string) {
  return `flee-env-${prefix}-${++counter}`;
}

async function setupParty() {
  const pids = [uid("p"), uid("p"), uid("p"), uid("p")];
  const dmId = uid("dm");
  const charIds: string[] = [];
  for (const id of pids) {
    const r = await handleCreateCharacter(id, {
      name: `Hero-${id}`,
      race: "human",
      class: "fighter",
      ability_scores: scores,
      avatar_url: "https://example.com/test-avatar.png",
    });
    expect(r.success).toBe(true);
    charIds.push(r.character!.id);
    handleQueueForParty(id);
  }
  const dmRes = handleDMQueueForParty(dmId);
  expect(dmRes.success).toBe(true);
  const partyId = [...getState().parties.keys()].pop()!;
  return { dmId, playerIds: pids, charIds, partyId };
}

describe("CC-260429 Task 1a: monster-flee XP", () => {
  test("kill 1 of 2 monsters, last monster flees → partial_xp_awarded fires", async () => {
    const { dmId, partyId } = await setupParty();
    const spawn = handleSpawnEncounter(dmId, {
      monsters: [{ template_name: "Goblin", count: 2 }],
    });
    expect(spawn.success).toBe(true);

    const party = getState().parties.get(partyId)!;
    expect(party.monsters.length).toBe(2);

    // Kill monster[0] off-the-books — mark dead and remove from initiative.
    party.monsters[0]!.isAlive = false;
    party.session = {
      ...party.session!,
      initiativeOrder: party.session!.initiativeOrder.filter(
        (s) => s.entityId !== party.monsters[0]!.id,
      ),
    };

    // Make monster[1]'s turn current.
    const m1Idx = party.session.initiativeOrder.findIndex(
      (s) => s.entityId === party.monsters[1]!.id,
    );
    expect(m1Idx).toBeGreaterThanOrEqual(0);
    party.session = { ...party.session, currentTurn: m1Idx };

    const res = handleMonsterAction(dmId, {
      monster_id: party.monsters[1]!.id,
      action: "flee",
    });
    expect(res.success).toBe(true);

    const partial = party.events.filter((e) => e.type === "partial_xp_awarded");
    expect(partial.length).toBe(1);
    const data = partial[0]!.data as Record<string, unknown>;
    expect(data.reason).toBe("all_monsters_fled");
    expect(data.xpAwarded).toBeGreaterThan(0);
    expect(data.monstersDefeated).toBe(2); // both !isAlive (1 killed, 1 fled)

    const combatEnd = party.events.filter(
      (e) => e.type === "combat_end" && (e.data as { reason?: string }).reason === "all_monsters_gone",
    );
    expect(combatEnd.length).toBe(1);
  });
});

describe("CC-260429 Task 1b: env-damage TPK XP", () => {
  test("kill 1 monster, env-damage kills last PC → partial_xp_awarded with reason environment_damage_tpk", async () => {
    const { dmId, charIds, partyId } = await setupParty();
    const spawn = handleSpawnEncounter(dmId, {
      monsters: [{ template_name: "Goblin", count: 1 }],
    });
    expect(spawn.success).toBe(true);
    const party = getState().parties.get(partyId)!;

    // The L4828 path requires shouldCombatEnd=true after the last PC is removed,
    // which requires no monsters in initiative. Set up: 1 monster killed +
    // removed from init, 3 PCs dead + removed, 4th PC at 0 HP / 2 death-save
    // failures. Env-damage on the 4th PC fires the wired XP code.
    party.monsters[0]!.isAlive = false;
    party.session = {
      ...party.session!,
      initiativeOrder: party.session!.initiativeOrder.filter(
        (s) => s.entityId !== party.monsters[0]!.id,
      ),
    };

    const chars = charIds.map((id) => getState().characters.get(id)!);
    for (let i = 0; i < 3; i++) {
      chars[i]!.hpCurrent = 0;
      chars[i]!.conditions = ["dead"];
      chars[i]!.isAlive = false;
      party.session = {
        ...party.session,
        initiativeOrder: party.session.initiativeOrder.filter(
          (s) => s.entityId !== chars[i]!.id,
        ),
      };
    }
    const last = chars[3]!;
    last.hpCurrent = 0;
    last.conditions = ["unconscious", "prone"];
    last.deathSaves = { successes: 0, failures: 2 };

    const res = handleDealEnvironmentDamage(dmId, {
      player_id: last.id,
      damage: 5,
      damage_type: "fire",
    });
    expect(res.success).toBe(true);
    expect(res.data!.dead).toBe(true);

    const partial = party.events.filter((e) => e.type === "partial_xp_awarded");
    expect(partial.length).toBe(1);
    const data = partial[0]!.data as Record<string, unknown>;
    expect(data.reason).toBe("environment_damage_tpk");
    expect(data.xpAwarded).toBeGreaterThan(0);
    expect(data.monstersKilled).toBe(1);
  });

  test("env-damage TPK with monsters alive — XP branch unreachable (shouldCombatEnd false)", async () => {
    const { dmId, charIds, partyId } = await setupParty();
    const spawn = handleSpawnEncounter(dmId, {
      monsters: [{ template_name: "Goblin", count: 2 }],
    });
    expect(spawn.success).toBe(true);
    const party = getState().parties.get(partyId)!;

    // All monsters still alive in initiative. shouldCombatEnd will be false
    // when the PC is removed → the L4828 branch never enters → no XP event.
    const chars = charIds.map((id) => getState().characters.get(id)!);
    for (let i = 0; i < 3; i++) {
      chars[i]!.hpCurrent = 0;
      chars[i]!.conditions = ["dead"];
      chars[i]!.isAlive = false;
      party.session = {
        ...party.session!,
        initiativeOrder: party.session!.initiativeOrder.filter(
          (s) => s.entityId !== chars[i]!.id,
        ),
      };
    }
    const last = chars[3]!;
    last.hpCurrent = 0;
    last.conditions = ["unconscious", "prone"];
    last.deathSaves = { successes: 0, failures: 2 };

    const res = handleDealEnvironmentDamage(dmId, {
      player_id: last.id,
      damage: 5,
      damage_type: "fire",
    });
    expect(res.success).toBe(true);
    expect(res.data!.dead).toBe(true);

    const partial = party.events.filter(
      (e) => e.type === "partial_xp_awarded"
        && (e.data as { reason?: string }).reason === "environment_damage_tpk",
    );
    expect(partial.length).toBe(0);
  });
});
