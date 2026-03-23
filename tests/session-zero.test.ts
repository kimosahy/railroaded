import { describe, test, expect, beforeEach } from "bun:test";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  handleSetSessionMetadata,
  getState,
  getCharacterForUser,
} from "../src/game/game-manager.ts";

// --- Helpers ---

let tc = 0;
function uid(prefix: string) { return `${prefix}-sz-${++tc}`; }

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

describe("Session zero — character creation with traits", () => {
  test("character creation stores flaw, bond, ideal, fear fields", async () => {
    const userId = uid("u");
    const result = await createChar(userId, {
      flaw: "Will betray allies for gold",
      bond: "Loyal to the Thieves' Guild",
      ideal: "Freedom above all",
      fear: "Being trapped underground",
    });
    expect(result.success).toBe(true);
    expect(result.character).toBeDefined();
    expect(result.character!.flaw).toBe("Will betray allies for gold");
    expect(result.character!.bond).toBe("Loyal to the Thieves' Guild");
    expect(result.character!.ideal).toBe("Freedom above all");
    expect(result.character!.fear).toBe("Being trapped underground");
  });

  test("character creation stores decisionTimeMs", async () => {
    const userId = uid("u");
    const result = await createChar(userId, {
      decisionTimeMs: 4500,
    });
    expect(result.success).toBe(true);
    expect(result.character!.decisionTimeMs).toBe(4500);
  });

  test("trait fields default to empty string when not provided", async () => {
    const userId = uid("u");
    const result = await createChar(userId);
    expect(result.success).toBe(true);
    expect(result.character!.flaw).toBe("");
    expect(result.character!.bond).toBe("");
    expect(result.character!.ideal).toBe("");
    expect(result.character!.fear).toBe("");
  });

  test("character is retrievable after creation with all trait fields", async () => {
    const userId = uid("u");
    await createChar(userId, {
      flaw: "Compulsive liar",
      bond: "Sworn to protect the innocent",
      ideal: "Justice",
      fear: "Fire",
    });
    const char = getCharacterForUser(userId);
    expect(char).not.toBeNull();
    expect(char!.flaw).toBe("Compulsive liar");
    expect(char!.bond).toBe("Sworn to protect the innocent");
    expect(char!.ideal).toBe("Justice");
    expect(char!.fear).toBe("Fire");
  });
});

describe("Session zero — DM metadata", () => {
  test("DM can set session metadata", async () => {
    const { dmUserId } = await createTestParty();
    const result = handleSetSessionMetadata(dmUserId, {
      worldDescription: "A frozen wasteland",
      style: "grimdark",
      tone: "oppressive",
      setting: "arctic tundra",
      decisionTimeMs: 8000,
    });
    expect(result.success).toBe(true);
  });

  test("session metadata is stored on the party", async () => {
    const { partyId, dmUserId } = await createTestParty();
    handleSetSessionMetadata(dmUserId, {
      worldDescription: "A sunlit forest realm",
      style: "whimsical",
    });
    const { parties } = getState();
    const party = parties.get(partyId)! as Record<string, unknown>;
    expect(party.dmMetadata).toBeDefined();
    const meta = party.dmMetadata as Record<string, unknown>;
    expect(meta.worldDescription).toBe("A sunlit forest realm");
    expect(meta.style).toBe("whimsical");
  });

  test("non-DM cannot set session metadata", async () => {
    const { playerUserIds } = await createTestParty();
    const result = handleSetSessionMetadata(playerUserIds[0]!, {
      worldDescription: "Should fail",
    });
    expect(result.success).toBe(false);
  });
});
