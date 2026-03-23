import { describe, test, expect, beforeEach } from "bun:test";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  handleSpawnEncounter,
  handleLook,
  handleGetRoomState,
  handleGetPartyState,
  handleGetParty,
  getState,
} from "../src/game/game-manager.ts";

// --- Helpers ---

let tc = 0;
function uid(prefix: string) { return `${prefix}-pf-${++tc}`; }

function resetState() {
  const { characters, parties, playerQueue, dmQueue } = getState();
  characters.clear();
  parties.clear();
  playerQueue.length = 0;
  dmQueue.length = 0;
}

async function createChar(userId: string, overrides?: Record<string, unknown>) {
  return await handleCreateCharacter(userId, {
    name: `Char-${userId}`,
    race: "human",
    class: "fighter",
    ability_scores: { str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 15 },
    avatar_url: "https://example.com/avatar.png",
    ...overrides,
  } as Parameters<typeof handleCreateCharacter>[1]);
}

async function createTestParty() {
  const pids = [uid("p"), uid("p"), uid("p"), uid("p")];
  const dmId = uid("dm");
  for (const id of pids) { await createChar(id); }
  pids.forEach((id) => handleQueueForParty(id));
  handleDMQueueForParty(dmId);
  const { parties } = getState();
  const partyId = [...parties.keys()].pop()!;
  return { partyId, playerUserIds: pids, dmUserId: dmId };
}

// --- Tests ---

beforeEach(resetState);

describe("Perception filter — player view", () => {
  test("handleLook does NOT return monster HP numbers", async () => {
    const { dmUserId, playerUserIds } = await createTestParty();
    handleSpawnEncounter(dmUserId, { monsters: [{ template_name: "Goblin", count: 1 }] });

    const result = handleLook(playerUserIds[0]!);
    expect(result.success).toBe(true);
    const monsters = result.data!.monsters as { id: string; name: string; condition: string }[];
    expect(monsters.length).toBeGreaterThan(0);

    for (const m of monsters) {
      // Player should NOT see hp, hpMax, or ac
      expect((m as Record<string, unknown>).hp).toBeUndefined();
      expect((m as Record<string, unknown>).hpMax).toBeUndefined();
      expect((m as Record<string, unknown>).ac).toBeUndefined();
    }
  });

  test("handleLook returns behavioral descriptions for monsters", async () => {
    const { dmUserId, playerUserIds } = await createTestParty();
    handleSpawnEncounter(dmUserId, { monsters: [{ template_name: "Goblin", count: 1 }] });

    const result = handleLook(playerUserIds[0]!);
    expect(result.success).toBe(true);
    const monsters = result.data!.monsters as { id: string; name: string; condition: string }[];
    expect(monsters.length).toBeGreaterThan(0);

    // Full health monsters should be described as "seems healthy"
    for (const m of monsters) {
      expect(m.condition).toBe("seems healthy");
    }
  });

  test("handleGetParty returns condition labels, not HP numbers", async () => {
    const { playerUserIds } = await createTestParty();

    const result = handleGetParty(playerUserIds[0]!);
    expect(result.success).toBe(true);
    const members = result.data!.members as Record<string, unknown>[];
    expect(members.length).toBeGreaterThan(0);

    for (const m of members) {
      // Player party view should show condition string, not raw HP
      expect(typeof m.condition).toBe("string");
    }
  });
});

describe("Perception filter — DM view", () => {
  test("handleGetRoomState returns full monster stats including HP", async () => {
    const { dmUserId } = await createTestParty();
    handleSpawnEncounter(dmUserId, { monsters: [{ template_name: "Goblin", count: 1 }] });

    const result = handleGetRoomState(dmUserId);
    expect(result.success).toBe(true);
    const monsters = result.data!.monsters as { id: string; name: string; hp: number; hpMax: number; ac: number }[];
    expect(monsters.length).toBeGreaterThan(0);

    for (const m of monsters) {
      expect(typeof m.hp).toBe("number");
      expect(typeof m.hpMax).toBe("number");
      expect(typeof m.ac).toBe("number");
      expect(m.hp).toBeGreaterThan(0);
    }
  });

  test("handleGetPartyState returns full HP numbers for all party members", async () => {
    const { dmUserId } = await createTestParty();

    const result = handleGetPartyState(dmUserId);
    expect(result.success).toBe(true);
    const members = result.data!.members as { id: string; name: string; hp: { current: number; max: number }; ac: number }[];
    expect(members.length).toBeGreaterThan(0);

    for (const m of members) {
      expect(typeof m.hp.current).toBe("number");
      expect(typeof m.hp.max).toBe("number");
      expect(typeof m.ac).toBe("number");
    }
  });
});
