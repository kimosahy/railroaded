/**
 * Fable sprint GAP 1 — downed PCs never hold the combat turn.
 *
 * PT-0612: "a stabilized/unconscious PC keeps being handed combat turns
 * (soft-lock requiring a manual end_turn)". advanceTurnSkipDead now:
 *  - skips stable PCs (like asleep monsters), logging turn_auto_advanced
 *  - auto-rolls the death save for dying PCs (RAW: a dying creature's turn
 *    IS its death save) and passes the turn on
 * and getAllowedActions no longer advertises death_save to stable PCs.
 */
import { describe, test, expect } from "bun:test";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  handleSpawnEncounter,
  handleEndTurn,
  getState,
} from "../src/game/game-manager.ts";
import { getCurrentCombatant } from "../src/game/session.ts";
import { getAllowedActions } from "../src/game/turns.ts";
import type { AbilityScores } from "../src/types.ts";

const scores: AbilityScores = { str: 14, dex: 14, con: 14, int: 10, wis: 10, cha: 10 };

let counter = 0;
function uid(prefix: string) {
  return `downed-${prefix}-${++counter}-${Date.now()}`;
}

async function setupCombatParty() {
  const pids = [uid("p"), uid("p"), uid("p"), uid("p")];
  const dmId = uid("dm");
  const charIds: string[] = [];
  for (const pid of pids) {
    const r = await handleCreateCharacter(pid, {
      name: `Hero-${pid}`,
      race: "human",
      class: "fighter",
      ability_scores: scores,
      avatar_url: "https://example.com/test-avatar.png",
    });
    expect(r.success).toBe(true);
    charIds.push((r as { character?: { id: string } }).character!.id);
    handleQueueForParty(pid);
  }
  const dmRes = handleDMQueueForParty(dmId);
  expect(dmRes.success).toBe(true);

  const partyId = [...getState().parties.keys()].pop()!;
  const party = getState().parties.get(partyId)!;

  const spawn = handleSpawnEncounter(dmId, { monsters: [{ template_name: "Goblin", count: 1 }] });
  expect(spawn.success).toBe(true);

  return { dmId, playerIds: pids, charIds, party };
}

/** Rewrite initiative deterministically: given entity ids, in order. */
function arrangeInitiative(party: ReturnType<typeof getState>["parties"] extends Map<string, infer P> ? P : never, order: string[]) {
  const monsterIds = new Set(party.monsters.map((m: { id: string }) => m.id));
  party.session!.initiativeOrder = order.map((id, i) => ({
    entityId: id,
    initiative: 20 - i,
    type: monsterIds.has(id) ? ("monster" as const) : ("player" as const),
  }));
  party.session!.currentTurn = 0;
}

describe("advanceTurnSkipDead — stable PCs are skipped", () => {
  test("turn passes over an unconscious+stable PC to the next combatant", async () => {
    const { playerIds, charIds, party } = await setupCombatParty();
    const [aChar, bChar] = [charIds[0]!, charIds[1]!];
    const monsterId = party.monsters[0]!.id;

    // B is down and stabilized
    const b = getState().characters.get(bChar)!;
    b.hpCurrent = 0;
    b.conditions = ["unconscious", "stable", "prone"];

    arrangeInitiative(party, [aChar, bChar, monsterId]);

    const res = handleEndTurn(playerIds[0]!);
    expect(res.success).toBe(true);

    // Turn skipped B entirely and landed on the monster
    const current = getCurrentCombatant(party.session!);
    expect(current?.entityId).toBe(monsterId);

    // The skip is visible in the event stream (story beat, not dead air)
    const skip = party.events.find(
      (e) => e.type === "turn_auto_advanced" && e.actorId === bChar &&
        (e.data as { reason?: string }).reason === "unconscious_stable"
    );
    expect(skip).toBeDefined();
  });

  test("multiple stable PCs in a row are all skipped", async () => {
    const { playerIds, charIds, party } = await setupCombatParty();
    const [aChar, bChar, cChar] = [charIds[0]!, charIds[1]!, charIds[2]!];
    const monsterId = party.monsters[0]!.id;

    for (const id of [bChar, cChar]) {
      const c = getState().characters.get(id)!;
      c.hpCurrent = 0;
      c.conditions = ["unconscious", "stable", "prone"];
    }

    arrangeInitiative(party, [aChar, bChar, cChar, monsterId]);

    handleEndTurn(playerIds[0]!);

    const current = getCurrentCombatant(party.session!);
    expect(current?.entityId).toBe(monsterId);
  });
});

describe("advanceTurnSkipDead — dying PCs auto-roll their death save", () => {
  test("a dying PC's turn rolls a death save automatically and passes on", async () => {
    const { playerIds, charIds, party } = await setupCombatParty();
    const [aChar, bChar] = [charIds[0]!, charIds[1]!];
    const monsterId = party.monsters[0]!.id;

    const b = getState().characters.get(bChar)!;
    b.hpCurrent = 0;
    b.conditions = ["unconscious", "prone"];
    b.deathSaves = { successes: 0, failures: 0 };

    arrangeInitiative(party, [aChar, bChar, monsterId]);

    const res = handleEndTurn(playerIds[0]!);
    expect(res.success).toBe(true);

    // An automatic death save was rolled and logged
    const save = party.events.find(
      (e) => e.type === "death_save" && e.actorId === bChar &&
        (e.data as { auto?: boolean }).auto === true
    );
    expect(save).toBeDefined();

    const current = getCurrentCombatant(party.session!);
    if (b.hpCurrent === 1 && !b.conditions.includes("unconscious")) {
      // Nat 20 — revived, it's legitimately B's turn now
      expect(current?.entityId).toBe(bChar);
    } else {
      // Any other roll: the turn moved past B — no stall
      expect(current?.entityId).toBe(monsterId);
      const saves = b.deathSaves;
      expect(saves.successes + saves.failures).toBeGreaterThanOrEqual(1);
    }
  });

  test("at 2 successes / 2 failures every outcome resolves without B holding the turn while down", async () => {
    const { playerIds, charIds, party } = await setupCombatParty();
    const [aChar, bChar] = [charIds[0]!, charIds[1]!];
    const monsterId = party.monsters[0]!.id;

    const b = getState().characters.get(bChar)!;
    b.hpCurrent = 0;
    b.conditions = ["unconscious", "prone"];
    b.deathSaves = { successes: 2, failures: 2 };

    arrangeInitiative(party, [aChar, bChar, monsterId]);

    handleEndTurn(playerIds[0]!);

    const current = getCurrentCombatant(party.session!);
    const revived = b.hpCurrent === 1 && !b.conditions.includes("unconscious");
    if (revived) {
      expect(current?.entityId).toBe(bChar);
    } else {
      // stabilized (3rd success), or dead (3rd failure): turn is NOT B's
      expect(current?.entityId).toBe(monsterId);
      const resolved = b.conditions.includes("stable") || b.conditions.includes("dead");
      expect(resolved).toBe(true);
      if (b.conditions.includes("dead")) {
        // dead PCs are removed from initiative entirely
        const stillListed = party.session!.initiativeOrder.some((s) => s.entityId === bChar);
        expect(stillListed).toBe(false);
      }
    }
  });

  test("dead PCs are still removed from initiative (regression)", async () => {
    const { playerIds, charIds, party } = await setupCombatParty();
    const [aChar, bChar] = [charIds[0]!, charIds[1]!];
    const monsterId = party.monsters[0]!.id;

    const b = getState().characters.get(bChar)!;
    b.hpCurrent = 0;
    b.conditions = ["dead"];

    arrangeInitiative(party, [aChar, bChar, monsterId]);

    handleEndTurn(playerIds[0]!);

    const current = getCurrentCombatant(party.session!);
    expect(current?.entityId).toBe(monsterId);
    expect(party.session!.initiativeOrder.some((s) => s.entityId === bChar)).toBe(false);
  });
});

describe("getAllowedActions — stable PCs are not offered death_save", () => {
  test("stable + unconscious on their turn: end_turn only, no death_save", () => {
    const actions = getAllowedActions("combat", true, ["unconscious", "stable", "prone"], 0);
    expect(actions).not.toContain("death_save");
    expect(actions).toContain("end_turn");
  });

  test("dying (unconscious, not stable) on their turn still gets death_save", () => {
    const actions = getAllowedActions("combat", true, ["unconscious", "prone"], 0);
    expect(actions).toContain("death_save");
  });
});
