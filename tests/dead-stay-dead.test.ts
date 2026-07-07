/**
 * Fable sprint GAP 2 — death persists across encounters (PT-0505 Tier-1 bug 2:
 * "A player with 3 failed death saves appeared alive at full HP when the next
 * encounter triggered").
 *
 *  - spawn_encounter / trigger_encounter never put dead PCs in initiative
 *  - healing cannot resurrect: handleRegainFromZero keeps "dead"; potion use
 *    on a corpse errors; spell heals skip dead targets
 */
import { describe, test, expect } from "bun:test";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  handleSpawnEncounter,
  handleUseItem,
  handleCast,
  getState,
} from "../src/game/game-manager.ts";
import { handleRegainFromZero } from "../src/engine/hp.ts";
import type { AbilityScores, Condition } from "../src/types.ts";

const scores: AbilityScores = { str: 14, dex: 14, con: 14, int: 10, wis: 14, cha: 10 };

let counter = 0;
function uid(prefix: string) {
  return `deadstay-${prefix}-${++counter}-${Date.now()}`;
}

async function setupParty(classes: readonly ["cleric" | "fighter" | "wizard" | "rogue", ...("cleric" | "fighter" | "wizard" | "rogue")[]] = ["cleric", "fighter", "rogue", "fighter"]) {
  const pids = [uid("p"), uid("p"), uid("p"), uid("p")];
  const dmId = uid("dm");
  const charIds: string[] = [];
  for (let i = 0; i < pids.length; i++) {
    const r = await handleCreateCharacter(pids[i]!, {
      name: `Hero-${pids[i]}`,
      race: "human",
      class: classes[i] ?? "fighter",
      ability_scores: scores,
      avatar_url: "https://example.com/test-avatar.png",
    });
    expect(r.success).toBe(true);
    charIds.push((r as { character?: { id: string } }).character!.id);
    handleQueueForParty(pids[i]!);
  }
  expect(handleDMQueueForParty(dmId).success).toBe(true);
  const partyId = [...getState().parties.keys()].pop()!;
  const party = getState().parties.get(partyId)!;
  return { dmId, playerIds: pids, charIds, party };
}

function killCharacter(charId: string) {
  const c = getState().characters.get(charId)!;
  c.hpCurrent = 0;
  c.conditions = ["dead", "prone"] as Condition[];
  c.deathSaves = { successes: 0, failures: 3 };
  return c;
}

describe("dead PCs never re-enter initiative", () => {
  test("spawn_encounter excludes dead party members from initiative", async () => {
    const { dmId, charIds, party } = await setupParty();
    const dead = killCharacter(charIds[1]!);

    const spawn = handleSpawnEncounter(dmId, { monsters: [{ template_name: "Goblin", count: 2 }] });
    expect(spawn.success).toBe(true);

    const order = party.session!.initiativeOrder;
    expect(order.some((s) => s.entityId === dead.id)).toBe(false);
    // The living three players + monsters are all present
    const playerSlots = order.filter((s) => s.type === "player");
    expect(playerSlots.length).toBe(3);

    // The dead character was not touched by the spawn
    expect(dead.hpCurrent).toBe(0);
    expect(dead.conditions).toContain("dead");
    expect(dead.deathSaves.failures).toBe(3);
  });

  test("combat_start event does not list the dead PC as a combatant", async () => {
    const { dmId, charIds, party } = await setupParty();
    const dead = killCharacter(charIds[2]!);

    handleSpawnEncounter(dmId, { monsters: [{ template_name: "Goblin", count: 1 }] });

    const combatStart = [...party.events].reverse().find((e) => e.type === "combat_start");
    expect(combatStart).toBeDefined();
    const initiative = (combatStart!.data as { initiative: { name: string }[] }).initiative;
    expect(initiative.some((s) => s.name === dead.name)).toBe(false);
  });
});

describe("healing cannot resurrect", () => {
  test("handleRegainFromZero keeps the dead condition", () => {
    const after = handleRegainFromZero(["dead", "prone", "unconscious"] as Condition[], true);
    expect(after).toContain("dead");
    expect(after).not.toContain("unconscious");
  });

  test("using a healing potion on a corpse errors and does not consume the potion", async () => {
    const { playerIds, charIds } = await setupParty();
    const dead = killCharacter(charIds[1]!);

    const user = getState().characters.get(charIds[0]!)!;
    user.inventory.push("Potion of Healing");
    const invSizeBefore = user.inventory.length;

    const res = handleUseItem(playerIds[0]!, { item_name: "Potion of Healing", target_id: dead.id });
    expect(res.success).toBe(false);
    expect(res.error).toContain("dead");

    expect(user.inventory.length).toBe(invSizeBefore); // potion not consumed
    expect(dead.hpCurrent).toBe(0);
    expect(dead.conditions).toContain("dead");
  });

  test("a healing spell aimed at a corpse leaves it dead at 0 HP", async () => {
    const { playerIds, charIds } = await setupParty(["cleric", "fighter", "rogue", "fighter"]);
    const dead = killCharacter(charIds[1]!);

    // Cleric casts Cure Wounds at the dead fighter
    const res = handleCast(playerIds[0]!, { spell_name: "Cure Wounds", target_id: dead.id });
    // The cast itself may succeed (slot spent) — but the corpse must not move
    expect(dead.hpCurrent).toBe(0);
    expect(dead.conditions).toContain("dead");
    expect(dead.deathSaves.failures).toBe(3);
    // And it must never be reported as a kill-shot resurrection
    if (res.success) {
      expect((res.data as { targetKilled?: boolean })?.targetKilled).not.toBe(true);
    }
  });
});
