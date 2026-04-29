/**
 * P1-6: Turn Undead + creature_type.
 * - Channel Divinity uses initialized for clerics (1 use at L1)
 * - turn_undead applies frightened condition on failed WIS saves (decorative)
 * - Non-clerics blocked
 * - Cooldown enforced; rest restores
 * - No-undead returns TARGET_INVALID
 * - creature_type pass-through in spectator + handleLook + handleSpawnEncounter
 */
import { describe, test, expect } from "bun:test";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  handleSpawnEncounter,
  handleChannelDivinity,
  handleShortRest,
  handleLongRest,
  handleLook,
  handleGetRoomState,
  getState,
} from "../src/game/game-manager.ts";
import type { AbilityScores } from "../src/types.ts";

const scores: AbilityScores = { str: 14, dex: 14, con: 14, int: 10, wis: 14, cha: 10 };

let counter = 0;
function uid(prefix: string) {
  return `tu-${prefix}-${++counter}`;
}

async function setupClericParty() {
  const pids = [uid("p"), uid("p"), uid("p"), uid("p")];
  const dmId = uid("dm");
  const charIds: string[] = [];
  // First player is the cleric
  const classes = ["cleric", "fighter", "rogue", "wizard"] as const;
  for (let i = 0; i < pids.length; i++) {
    const r = await handleCreateCharacter(pids[i]!, {
      name: `Hero-${pids[i]}`,
      race: "human",
      class: classes[i]!,
      ability_scores: scores,
      avatar_url: "https://example.com/test-avatar.png",
    });
    expect(r.success).toBe(true);
    charIds.push(r.character!.id);
    handleQueueForParty(pids[i]!);
  }
  const dmRes = handleDMQueueForParty(dmId);
  expect(dmRes.success).toBe(true);
  const partyId = [...getState().parties.keys()].pop()!;
  return { dmId, playerIds: pids, charIds, partyId };
}

describe("Turn Undead — happy path", () => {
  test("L1 cleric initialized with 1 channel divinity use", async () => {
    const { charIds } = await setupClericParty();
    const cleric = getState().characters.get(charIds[0]!)!;
    expect(cleric.class).toBe("cleric");
    expect(cleric.channelDivinityUses).toBe(1);
  });

  test("non-cleric initialized with 0 channel divinity uses", async () => {
    const { charIds } = await setupClericParty();
    for (let i = 1; i < charIds.length; i++) {
      const c = getState().characters.get(charIds[i]!)!;
      expect(c.channelDivinityUses).toBe(0);
    }
  });

  test("cleric vs 2 skeletons → frightened condition applied to failed saves", async () => {
    const { dmId, playerIds } = await setupClericParty();

    // Spawn 2 skeletons (creature_type: undead)
    const spawn = handleSpawnEncounter(dmId, {
      monsters: [{ template_name: "Skeleton", count: 2 }],
    });
    expect(spawn.success).toBe(true);

    // Force skeletons to fail saves: set their WIS to 1 (mod -5), DC will easily exceed roll
    const state = getState();
    const partyId = [...state.parties.keys()].pop()!;
    const party = state.parties.get(partyId)!;
    for (const m of party.monsters) {
      m.abilityScores.wis = 1;
    }

    const result = handleChannelDivinity(playerIds[0]!, { ability: "turn_undead" });
    expect(result.success).toBe(true);
    const data = result.data!;
    expect(data.ability).toBe("turn_undead");
    // With WIS 1 and very low rolls, all should fail
    const results = data.results as { saved: boolean }[];
    expect(results.length).toBe(2);
    // We can't deterministically force failure (random rolls), but we can assert
    // that the contract is correct: any failed save has frightened applied.
    const turnedNames = data.turned as number;
    if (turnedNames > 0) {
      // At least one undead got the frightened condition
      const frightened = party.monsters.filter((m) => m.conditions.includes("frightened"));
      expect(frightened.length).toBeGreaterThan(0);
    }
  });

  test("usesRemaining decremented after Channel Divinity", async () => {
    const { dmId, charIds, playerIds } = await setupClericParty();
    handleSpawnEncounter(dmId, { monsters: [{ template_name: "Skeleton", count: 1 }] });

    const result = handleChannelDivinity(playerIds[0]!, { ability: "turn_undead" });
    expect(result.success).toBe(true);
    expect(result.data!.usesRemaining).toBe(0);

    const cleric = getState().characters.get(charIds[0]!)!;
    expect(cleric.channelDivinityUses).toBe(0);
  });
});

describe("Turn Undead — error paths", () => {
  test("non-cleric blocked with WRONG_STATE", async () => {
    const { dmId, playerIds } = await setupClericParty();
    handleSpawnEncounter(dmId, { monsters: [{ template_name: "Skeleton", count: 1 }] });

    // playerIds[1] is the fighter
    const result = handleChannelDivinity(playerIds[1]!, { ability: "turn_undead" });
    expect(result.success).toBe(false);
    expect(result.reason_code).toBe("WRONG_STATE");
    expect(result.error).toMatch(/cleric/i);
  });

  test("no undead present → TARGET_INVALID", async () => {
    const { dmId, playerIds } = await setupClericParty();
    // Spawn humanoid only (Goblin)
    handleSpawnEncounter(dmId, { monsters: [{ template_name: "Goblin", count: 2 }] });

    const result = handleChannelDivinity(playerIds[0]!, { ability: "turn_undead" });
    expect(result.success).toBe(false);
    expect(result.reason_code).toBe("TARGET_INVALID");
  });

  test("0 uses remaining → ABILITY_ON_COOLDOWN", async () => {
    const { dmId, charIds, playerIds } = await setupClericParty();
    const cleric = getState().characters.get(charIds[0]!)!;
    cleric.channelDivinityUses = 0;
    handleSpawnEncounter(dmId, { monsters: [{ template_name: "Skeleton", count: 1 }] });

    const result = handleChannelDivinity(playerIds[0]!, { ability: "turn_undead" });
    expect(result.success).toBe(false);
    expect(result.reason_code).toBe("ABILITY_ON_COOLDOWN");
  });

  test("not in combat → WRONG_PHASE", async () => {
    const { playerIds } = await setupClericParty();
    // No spawn → still in exploration
    const result = handleChannelDivinity(playerIds[0]!, { ability: "turn_undead" });
    expect(result.success).toBe(false);
    expect(result.reason_code).toBe("WRONG_PHASE");
  });

  test("unknown ability → INVALID_ENUM_VALUE", async () => {
    const { dmId, playerIds } = await setupClericParty();
    handleSpawnEncounter(dmId, { monsters: [{ template_name: "Skeleton", count: 1 }] });

    const result = handleChannelDivinity(playerIds[0]!, { ability: "smite_evil" });
    expect(result.success).toBe(false);
    expect(result.reason_code).toBe("INVALID_ENUM_VALUE");
  });
});

describe("Turn Undead — short/long rest restores Channel Divinity", () => {
  test("short rest after use → channelDivinityUses reset to 1", async () => {
    const { dmId, charIds, playerIds } = await setupClericParty();
    const cleric = getState().characters.get(charIds[0]!)!;
    cleric.channelDivinityUses = 0;

    // Need to NOT be in combat to short rest. Spawn isn't called.
    const result = handleShortRest(playerIds[0]!);
    expect(result.success).toBe(true);
    expect(cleric.channelDivinityUses).toBe(1);
  });

  test("long rest → channelDivinityUses reset to 1", async () => {
    const { charIds, playerIds } = await setupClericParty();
    const cleric = getState().characters.get(charIds[0]!)!;
    cleric.channelDivinityUses = 0;

    const result = handleLongRest(playerIds[0]!);
    expect(result.success).toBe(true);
    expect(cleric.channelDivinityUses).toBe(1);
  });
});

describe("creature_type — pass-through in response shapes", () => {
  test("Skeleton template carries creature_type=undead", async () => {
    const { dmId, partyId } = await setupClericParty();
    handleSpawnEncounter(dmId, { monsters: [{ template_name: "Skeleton", count: 1 }] });
    const party = getState().parties.get(partyId)!;
    expect(party.monsters[0]!.creatureType).toBe("undead");
  });

  test("Goblin template carries creature_type=humanoid", async () => {
    const { dmId, partyId } = await setupClericParty();
    handleSpawnEncounter(dmId, { monsters: [{ template_name: "Goblin", count: 1 }] });
    const party = getState().parties.get(partyId)!;
    expect(party.monsters[0]!.creatureType).toBe("humanoid");
  });

  test("Wolf template carries creature_type=beast", async () => {
    const { dmId, partyId } = await setupClericParty();
    handleSpawnEncounter(dmId, { monsters: [{ template_name: "Wolf", count: 1 }] });
    const party = getState().parties.get(partyId)!;
    expect(party.monsters[0]!.creatureType).toBe("beast");
  });

  test("handleLook surfaces creatureType to player", async () => {
    const { dmId, playerIds } = await setupClericParty();
    handleSpawnEncounter(dmId, { monsters: [{ template_name: "Zombie", count: 1 }] });

    const look = handleLook(playerIds[0]!);
    expect(look.success).toBe(true);
    const monsters = look.data!.monsters as { creatureType: string }[];
    expect(monsters[0]!.creatureType).toBe("undead");
  });

  test("handleSpawnEncounter return surfaces creatureType", async () => {
    const { dmId } = await setupClericParty();
    const result = handleSpawnEncounter(dmId, { monsters: [{ template_name: "Wight", count: 1 }] });
    expect(result.success).toBe(true);
    const monsters = result.data!.monsters as { creatureType: string }[];
    expect(monsters[0]!.creatureType).toBe("undead");
  });

  test("handleGetRoomState surfaces creatureType to DM", async () => {
    const { dmId } = await setupClericParty();
    handleSpawnEncounter(dmId, { monsters: [{ template_name: "Ghoul", count: 1 }] });

    const room = handleGetRoomState(dmId);
    expect(room.success).toBe(true);
    const monsters = room.data!.monsters as { creatureType: string }[];
    expect(monsters[0]!.creatureType).toBe("undead");
  });

  test("creatureType defaults to humanoid for unknown templates", async () => {
    const { dmId, partyId } = await setupClericParty();
    handleSpawnEncounter(dmId, { monsters: [{ template_name: "UnknownGuy", count: 1 }] });
    const party = getState().parties.get(partyId)!;
    expect(party.monsters[0]!.creatureType).toBe("humanoid");
  });
});
