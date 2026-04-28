/**
 * P0-3 tiered autopilot — fake-timer tests for the 10s post-action grace
 * window (CC-260428 §1d). Complements the immediate-advance assertions in
 * tests/game-manager.test.ts and tests/mcp-sprint-j.test.ts by exercising
 * the rescheduled-grace-timer path that those tests don't reach.
 *
 * Three deterministic cases:
 *  1. Grace expiry advances the turn with reason "post_action_grace_expired".
 *  2. Bonus action used within grace cancels the grace timer; turn advances
 *     immediately via checkAutoAdvanceTurn's all-resources branch
 *     (reason "all_resources_used"); no late grace fires.
 *  3. handleEndTurn within grace cancels the grace and advances immediately;
 *     no late grace fires.
 */
import { afterEach, beforeEach, describe, expect, jest, test } from "bun:test";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  handleSpawnEncounter,
  handleAttack,
  handleBonusAction,
  handleEndTurn,
  getCharacterForUser,
  getState,
} from "../src/game/game-manager.ts";
import { getCurrentCombatant } from "../src/game/session.ts";
import type { AbilityScores } from "../src/types.ts";

const scores: AbilityScores = { str: 12, dex: 16, con: 12, int: 10, wis: 10, cha: 10 };

let tc = 0;
function uid(p: string): string { return `${p}-grace-${++tc}-${Date.now()}`; }

/**
 * Drive a 4-rogue party (Cunning Action default) into combat against one
 * Goblin tankified so attacks don't kill it. Walks initiative until a player
 * is the current combatant. Returns refs needed to drive the test.
 */
async function setupCombatOnPlayerTurn() {
  const pids = [uid("p"), uid("p"), uid("p"), uid("p")];
  const dmId = uid("dm");

  for (const id of pids) {
    await handleCreateCharacter(id, {
      name: `R-${id}`, race: "human", class: "rogue",
      ability_scores: scores,
      avatar_url: "https://example.com/avatar.png",
    });
  }
  pids.forEach((id) => handleQueueForParty(id));
  handleDMQueueForParty(dmId);

  handleSpawnEncounter(dmId, { monsters: [{ template_name: "Goblin", count: 1 }] });

  const { parties, characters } = getState();
  const partyId = [...parties.keys()].pop()!;
  const party = parties.get(partyId)!;
  if (!party.session) throw new Error("Test setup: no session after spawn");

  // Tank the goblin so attacks don't end combat.
  party.monsters[0]!.hpCurrent = 9999;
  party.monsters[0]!.ac = 1;

  // Skip past any monster turns at the head of initiative so the next player action lands on a player.
  for (let i = 0; i < 8; i++) {
    const cur = getCurrentCombatant(party.session);
    if (!cur) break;
    if (cur.type === "player") break;
    handleEndTurn(dmId);
  }

  const cur = getCurrentCombatant(party.session);
  if (!cur || cur.type !== "player") throw new Error("Test setup: no player turn reached");
  const char = characters.get(cur.entityId)!;

  return { partyId, party, dmId, currentPlayerUserId: char.userId, currentChar: char };
}

describe("P0-3 tiered-autopilot grace timer (fake timers)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test("Test 1: grace expiry advances the turn with reason post_action_grace_expired", async () => {
    const { party, currentPlayerUserId, currentChar } = await setupCombatOnPlayerTurn();
    const monsterId = party.monsters[0]!.id;

    const beforeId = getCurrentCombatant(party.session!)?.entityId;
    expect(beforeId).toBe(currentChar.id);

    // Use action — actionUsed=true, bonusUsed=false. checkAutoAdvanceTurn
    // schedules the 10s grace timer.
    const atk = handleAttack(currentPlayerUserId, { target_id: monsterId });
    expect(atk.success).toBe(true);

    // Before grace expires, turn must NOT have advanced yet.
    expect(getCurrentCombatant(party.session!)?.entityId).toBe(currentChar.id);

    // Fire the grace timer.
    jest.advanceTimersByTime(10_000);

    const graceEvent = party.events.find(
      (e) => e.type === "turn_auto_advanced"
        && (e.data as Record<string, unknown>).reason === "post_action_grace_expired",
    );
    expect(graceEvent).toBeDefined();

    expect(getCurrentCombatant(party.session!)?.entityId).not.toBe(currentChar.id);
  });

  test("Test 2: bonus action within grace cancels grace, advances via all_resources_used", async () => {
    const { party, currentPlayerUserId, currentChar } = await setupCombatOnPlayerTurn();
    const monsterId = party.monsters[0]!.id;

    const atk = handleAttack(currentPlayerUserId, { target_id: monsterId });
    expect(atk.success).toBe(true);

    // Within the grace window, use a bonus action. Rogues have Cunning Action
    // for dash/disengage/hide as a bonus action.
    jest.advanceTimersByTime(3_000);
    const bonus = handleBonusAction(currentPlayerUserId, { action: "dash" });
    expect(bonus.success).toBe(true);

    // Turn must have advanced immediately via the all-resources branch.
    const allResourcesEvent = party.events.find(
      (e) => e.type === "turn_auto_advanced"
        && (e.data as Record<string, unknown>).reason === "all_resources_used",
    );
    expect(allResourcesEvent).toBeDefined();

    // The grace timer was cancelled by markCharacterAction inside handleBonusAction
    // (cancelAutopilotTimer matches the `${partyId}:${charId}:` prefix and clears
    // the grace key, which is `${partyId}:${charId}:${currentTurn}:grace`).
    // Drain past the would-be grace expiry to confirm no late firing.
    jest.advanceTimersByTime(20_000);

    const graceEvent = party.events.find(
      (e) => e.type === "turn_auto_advanced"
        && (e.data as Record<string, unknown>).reason === "post_action_grace_expired"
        && (e.actorId === currentChar.id),
    );
    expect(graceEvent).toBeUndefined();
  });

  test("Test 3: handleEndTurn within grace cancels the grace and no late fire", async () => {
    const { party, currentPlayerUserId, currentChar } = await setupCombatOnPlayerTurn();
    const monsterId = party.monsters[0]!.id;

    const atk = handleAttack(currentPlayerUserId, { target_id: monsterId });
    expect(atk.success).toBe(true);

    jest.advanceTimersByTime(3_000);
    const end = handleEndTurn(currentPlayerUserId);
    expect(end.success).toBe(true);

    // Turn advanced immediately on end_turn.
    expect(getCurrentCombatant(party.session!)?.entityId).not.toBe(currentChar.id);

    // No late grace fire after the explicit end_turn. handleEndTurn calls
    // markCharacterAction → cancelAutopilotTimer → the grace key matching
    // `${partyId}:${charId}:` is cleared. Even if the timer somehow ran, the
    // callback's still-current re-validation would silently bail.
    jest.advanceTimersByTime(20_000);

    const graceEvent = party.events.find(
      (e) => e.type === "turn_auto_advanced"
        && (e.data as Record<string, unknown>).reason === "post_action_grace_expired"
        && (e.actorId === currentChar.id),
    );
    expect(graceEvent).toBeUndefined();
  });
});
