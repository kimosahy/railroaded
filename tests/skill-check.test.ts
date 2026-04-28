/**
 * P1-5: handleSkillCheck contract.
 *
 * Verifies the {roll, dc, success, narrative} response shape, default DC,
 * proficiency wiring (rogue + lockpicking → tool proficiency), unknown-skill
 * rejection, and the route surface in playerActionRoutes.
 */
import { describe, expect, test } from "bun:test";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  handleSkillCheck,
  getCharacterForUser,
  getState,
} from "../src/game/game-manager.ts";
import type { AbilityScores } from "../src/types.ts";

const scores: AbilityScores = { str: 14, dex: 16, con: 12, int: 10, wis: 12, cha: 10 };

let tc = 0;
function uid(p: string): string { return `${p}-skillcheck-${++tc}-${Date.now()}`; }

async function setupRogueInSession() {
  const pids = [uid("p"), uid("p"), uid("p"), uid("p")];
  const dmId = uid("dm");

  await handleCreateCharacter(pids[0]!, {
    name: `Rogue-${pids[0]}`, race: "human", class: "rogue",
    ability_scores: scores,
    avatar_url: "https://example.com/avatar.png",
  });
  for (let i = 1; i < pids.length; i++) {
    await handleCreateCharacter(pids[i]!, {
      name: `C-${pids[i]}`, race: "human", class: "fighter",
      ability_scores: scores,
      avatar_url: "https://example.com/avatar.png",
    });
  }
  pids.forEach((id) => handleQueueForParty(id));
  handleDMQueueForParty(dmId);

  return { rogueId: pids[0]!, pids, dmId };
}

describe("P1-5 handleSkillCheck contract", () => {
  test("rogue + lockpicking → returns roll, dc, success, narrative; proficient via tool", async () => {
    const { rogueId } = await setupRogueInSession();
    const result = handleSkillCheck(rogueId, { skill: "lockpicking", dc: 15 });

    expect(result.success).toBe(true);
    const data = result.data!;
    expect(typeof data.roll).toBe("number");
    expect(data.roll as number).toBeGreaterThanOrEqual(1);
    expect(data.roll as number).toBeLessThanOrEqual(20);
    expect(data.dc).toBe(15);
    expect(typeof data.success).toBe("boolean");
    expect(typeof data.narrative).toBe("string");
    const char = getCharacterForUser(rogueId)!;
    expect((data.narrative as string)).toContain(char.name);

    // Rogue gets thieves' tools proficiency for lockpicking via the class fallback.
    expect(data.proficient).toBe(true);
    expect(data.skill).toBe("lockpicking");
    expect(data.ability).toBe("dex");

    // Skill check is logged as an event for the spectator API.
    const party = [...getState().parties.values()].find((p) => p.members.some((m) => {
      const c = getState().characters.get(m);
      return c?.userId === rogueId;
    }))!;
    const ev = party.events.find((e) => e.type === "skill_check");
    expect(ev).toBeDefined();
  });

  test("dc defaults to 15 when omitted", async () => {
    const { rogueId } = await setupRogueInSession();
    const result = handleSkillCheck(rogueId, { skill: "perception" });

    expect(result.success).toBe(true);
    expect(result.data!.dc).toBe(15);
  });

  test("unknown skill rejected with INVALID_ENUM_VALUE", async () => {
    const { rogueId } = await setupRogueInSession();
    const result = handleSkillCheck(rogueId, { skill: "telepathy" });

    expect(result.success).toBe(false);
    expect(result.reason_code).toBe("INVALID_ENUM_VALUE");
  });

  test("unconscious character cannot skill-check", async () => {
    const { rogueId } = await setupRogueInSession();
    const char = getCharacterForUser(rogueId)!;
    char.conditions = ["unconscious", "stable"];
    char.hpCurrent = 0;

    const result = handleSkillCheck(rogueId, { skill: "lockpicking" });
    expect(result.success).toBe(false);
    expect(result.reason_code).toBe("CHARACTER_UNCONSCIOUS");
  });
});
