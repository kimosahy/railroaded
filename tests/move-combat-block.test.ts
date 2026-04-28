/**
 * F-5: handleMove must reject room transitions during combat.
 *
 * Without this guard, players could walk away from a fight mid-encounter,
 * stranding monsters in initiative and breaking the combat phase.
 */
import { describe, expect, test } from "bun:test";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  handleSpawnEncounter,
  handleMove,
  getCharacterForUser,
  getPartyForCharacter,
} from "../src/game/game-manager.ts";
import type { AbilityScores } from "../src/types.ts";

const scores: AbilityScores = { str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 15 };

let tc = 0;
function uid(p: string): string { return `${p}-movecombat-${++tc}-${Date.now()}`; }

async function setupCombatParty() {
  const pids = [uid("p"), uid("p"), uid("p"), uid("p")];
  const dmId = uid("dm");

  for (const id of pids) {
    await handleCreateCharacter(id, {
      name: `C-${id}`, race: "human", class: "fighter",
      ability_scores: scores,
      avatar_url: "https://example.com/avatar.png",
    });
    handleQueueForParty(id);
  }
  handleDMQueueForParty(dmId);

  // Spawn encounter — this puts the session into "combat" phase and seeds initiative.
  handleSpawnEncounter(dmId, { monsters: [{ template_name: "Goblin", count: 1 }] });

  return { pids, dmId };
}

describe("F-5: room transitions blocked during combat", () => {
  test("handleMove during combat returns success:false with WRONG_PHASE", async () => {
    const { pids } = await setupCombatParty();

    const char = getCharacterForUser(pids[0]!)!;
    const party = getPartyForCharacter(char.id)!;
    expect(party.session?.phase).toBe("combat");

    // Pick any candidate exit name from the dungeon — we expect rejection
    // before the dungeon code is consulted, so the value doesn't have to match.
    const result = handleMove(pids[0]!, { direction_or_target: "any-room" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("combat");
    expect(result.reason_code).toBe("WRONG_PHASE");
  });

  test("handleMove rejection does NOT update lastActionAt (cancel autopilot)", async () => {
    const { pids } = await setupCombatParty();

    const char = getCharacterForUser(pids[0]!)!;
    const before = char.lastActionAt;

    handleMove(pids[0]!, { direction_or_target: "any-room" });

    // F-5 spec demands the combat-phase guard run BEFORE markCharacterAction —
    // so a rejected move must not bump lastActionAt.
    expect(char.lastActionAt).toBe(before);
  });
});
