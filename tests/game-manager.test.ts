import { describe, test, expect, beforeEach } from "bun:test";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  handleSpawnEncounter,
  handleAttack,
  handleMonsterAttack,
  handleAdvanceScene,
  handleEndSession,
  handleAwardXp,
  getState,
  getCharacterForUser,
} from "../src/game/game-manager.ts";

// --- Helpers ---

let tc = 0;
function uid(prefix: string) { return `${prefix}-${++tc}`; }

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

// (a) Character creation

describe("Character creation", () => {
  test("creates character with valid params → success, character in state", async () => {
    const userId = uid("u");
    const result = await createChar(userId);
    expect(result.success).toBe(true);
    expect(result.character).toBeDefined();
    expect(result.character!.name).toBe(`Char-${userId}`);
    expect(result.character!.userId).toBe(userId);
    const { characters } = getState();
    expect(characters.has(result.character!.id)).toBe(true);
  });

  test("rejects duplicate userId", async () => {
    const userId = uid("u");
    await createChar(userId);
    const result = await createChar(userId, { name: "Duplicate" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("already have a character");
  });

  test("rejects invalid ability scores", async () => {
    const result = await handleCreateCharacter(uid("u"), {
      name: "Bad",
      race: "human",
      class: "fighter",
      ability_scores: { str: 20, dex: 20, con: 20, int: 20, wis: 20, cha: 20 },
      avatar_url: "https://example.com/avatar.png",
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("rejects invalid race with helpful error", async () => {
    const result = await createChar(uid("u"), { race: "tiefling" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid race");
    expect(result.error).toContain("human");
    expect(result.error).toContain("half-orc");
  });

  test("rejects invalid class with helpful error", async () => {
    const result = await createChar(uid("u"), { class: "warlock" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid class");
    expect(result.error).toContain("fighter");
    expect(result.error).toContain("wizard");
  });

  test("lists all missing required fields at once", async () => {
    const result = await handleCreateCharacter(uid("u"), { name: "Minimal" } as Parameters<typeof handleCreateCharacter>[1]);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Missing required fields");
    expect(result.error).toContain("race");
    expect(result.error).toContain("class");
    expect(result.error).toContain("ability_scores");
  });

  test("lists only the fields that are actually missing", async () => {
    const result = await handleCreateCharacter(uid("u"), {
      name: "Partial",
      race: "human",
    } as Parameters<typeof handleCreateCharacter>[1]);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Missing required fields");
    expect(result.error).toContain("class");
    expect(result.error).toContain("ability_scores");
    expect(result.error).not.toContain("name");
    expect(result.error).not.toContain("race");
  });

  test("reports missing fields when all required fields are absent", async () => {
    const result = await handleCreateCharacter(uid("u"), {} as Parameters<typeof handleCreateCharacter>[1]);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Missing required fields");
    expect(result.error).toContain("name");
    expect(result.error).toContain("race");
    expect(result.error).toContain("class");
    expect(result.error).toContain("ability_scores");
  });
});

// (b) Party formation (matchmaker)

describe("Party formation", () => {
  test("4 players + 1 DM queue → party formed", async () => {
    const { partyId } = await createTestParty();
    const { parties } = getState();
    expect(parties.has(partyId)).toBe(true);
  });

  test("player queue returns structured response with queue size and players needed", async () => {
    const userId = uid("u");
    await createChar(userId);
    const result = handleQueueForParty(userId);
    expect(result.success).toBe(true);
    expect(result.data!.queued).toBe(true);
    expect(result.data!.matched).toBe(false);
    expect(result.data!.position).toBe(1);
    expect(result.data!.playersInQueue).toBe(1);
    expect(result.data!.playersNeeded).toBe(3);
    expect(result.data!.message).toBe("You've joined the matchmaking queue. 3 more players needed to form a party.");
  });

  test("queue shows correct count as players join", async () => {
    const p1 = uid("u"); const p2 = uid("u"); const p3 = uid("u");
    await createChar(p1); await createChar(p2); await createChar(p3);
    handleQueueForParty(p1);
    const r2 = handleQueueForParty(p2);
    expect(r2.data!.playersInQueue).toBe(2);
    expect(r2.data!.playersNeeded).toBe(2);
    expect(r2.data!.message).toBe("You've joined the matchmaking queue. 2 more players needed to form a party.");
    const r3 = handleQueueForParty(p3);
    expect(r3.data!.playersInQueue).toBe(3);
    expect(r3.data!.playersNeeded).toBe(1);
    expect(r3.data!.message).toBe("You've joined the matchmaking queue. 1 more player needed to form a party.");
  });

  test("DM queue response includes playersNeeded", async () => {
    const p1 = uid("u"); await createChar(p1);
    handleQueueForParty(p1);
    const dmId = uid("dm");
    const result = handleDMQueueForParty(dmId);
    expect(result.data!.playersWaiting).toBe(1);
    expect(result.data!.playersNeeded).toBe(3);
    expect(result.data!.message).toContain("3 more players");
  });

  test("party has correct members and DM", async () => {
    const { partyId, dmUserId } = await createTestParty();
    const { parties } = getState();
    const party = parties.get(partyId)!;
    expect(party.members).toHaveLength(4);
    expect(party.dmUserId).toBe(dmUserId);
    expect(party.session).not.toBeNull();
    expect(party.session!.phase).toBe("exploration");
  });

  test("4 players queued with no DM → party still forms with system-dm", async () => {
    const pids = [uid("p"), uid("p"), uid("p"), uid("p")];
    for (const id of pids) { await createChar(id); }
    // Queue first 3 — no match yet
    for (let i = 0; i < 3; i++) handleQueueForParty(pids[i]!);
    const { parties: before } = getState();
    expect(before.size).toBe(0);
    // 4th player triggers match without a DM
    const result = handleQueueForParty(pids[3]!);
    expect(result.success).toBe(true);
    expect(result.data!.matched).toBe(true);
    const { parties: after } = getState();
    expect(after.size).toBe(1);
    const party = [...after.values()][0]!;
    expect(party.members).toHaveLength(4);
    expect(party.dmUserId).toBe("system-dm");
    expect(party.session).not.toBeNull();
  });

  test("DM queuing claims existing system-dm party", async () => {
    // Form party without DM
    const pids = [uid("p"), uid("p"), uid("p"), uid("p")];
    for (const id of pids) { await createChar(id); }
    pids.forEach((id) => handleQueueForParty(id));
    const { parties } = getState();
    const party = [...parties.values()][0]!;
    expect(party.dmUserId).toBe("system-dm");
    // DM queues → should claim the existing party
    const dmId = uid("dm");
    const result = handleDMQueueForParty(dmId);
    expect(result.success).toBe(true);
    expect(result.data!.matched).toBe(true);
    expect(party.dmUserId).toBe(dmId);
  });
});

// (c) handleSpawnEncounter

describe("handleSpawnEncounter", () => {
  test("DM spawns monsters → combat, monsters in state, initiative rolled", async () => {
    const { partyId, dmUserId } = await createTestParty();
    const result = handleSpawnEncounter(dmUserId, {
      monsters: [{ template_name: "Goblin", count: 2 }],
    });
    expect(result.success).toBe(true);
    expect(result.data!.phase).toBe("combat");
    expect(result.data!.monsters).toHaveLength(2);
    expect((result.data!.initiative as unknown[]).length).toBeGreaterThan(0);

    const { parties } = getState();
    const party = parties.get(partyId)!;
    expect(party.session!.phase).toBe("combat");
    expect(party.monsters).toHaveLength(2);
    expect(party.session!.initiativeOrder.length).toBeGreaterThan(0);
  });

  test("non-DM user cannot spawn", async () => {
    const { playerUserIds } = await createTestParty();
    const result = handleSpawnEncounter(playerUserIds[0]!, {
      monsters: [{ template_name: "Goblin", count: 1 }],
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Not a DM");
  });

  test("spawning when already in combat replaces encounter", async () => {
    const { partyId, dmUserId } = await createTestParty();
    handleSpawnEncounter(dmUserId, { monsters: [{ template_name: "Goblin", count: 1 }] });
    const result = handleSpawnEncounter(dmUserId, { monsters: [{ template_name: "Goblin", count: 3 }] });
    expect(result.success).toBe(true);
    const { parties } = getState();
    expect(parties.get(partyId)!.monsters).toHaveLength(3);
  });
});

// (d) handleAttack

describe("handleAttack", () => {
  test("player attacks monster → resolves hit or miss", async () => {
    const { partyId, playerUserIds, dmUserId } = await createTestParty();
    handleSpawnEncounter(dmUserId, { monsters: [{ template_name: "Goblin", count: 1 }] });
    const { parties } = getState();
    const party = parties.get(partyId)!;
    const monsterId = party.monsters[0]!.id;

    // Set initiative so player 0 goes first
    const charId = getCharacterForUser(playerUserIds[0]!)!.id;
    const playerIdx = party.session!.initiativeOrder.findIndex((s) => s.entityId === charId);
    party.session!.currentTurn = playerIdx;

    const result = handleAttack(playerUserIds[0]!, { target_id: monsterId });
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(typeof result.data!.hit).toBe("boolean");
  });

  test("attack when not in combat → error", async () => {
    const { playerUserIds } = await createTestParty();
    const result = handleAttack(playerUserIds[0]!, { target_id: "monster-999" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("only attack during combat");
  });

  test.todo("attack when unconscious (0 HP) → error (guard not yet implemented)");

  test("killing a monster removes it from initiative and ends combat", async () => {
    const { partyId, playerUserIds, dmUserId } = await createTestParty();
    handleSpawnEncounter(dmUserId, { monsters: [{ template_name: "Goblin", count: 1 }] });
    const { parties } = getState();
    const party = parties.get(partyId)!;
    const monsterId = party.monsters[0]!.id;

    // Make monster trivially easy to kill
    party.monsters[0]!.hpCurrent = 1;
    party.monsters[0]!.ac = 1;

    // Attack until monster dies (statistically near-certain within 20 tries)
    for (let i = 0; i < 20; i++) {
      if (!party.monsters.find((m) => m.id === monsterId)?.isAlive) break;
      if (party.session?.phase !== "combat") break;
      handleAttack(playerUserIds[i % 4]!, { target_id: monsterId });
    }

    const monster = party.monsters.find((m) => m.id === monsterId)!;
    expect(monster.isAlive).toBe(false);
    // Single monster: combat should have ended
    expect(party.session!.phase).toBe("exploration");
  });
});

// (e) handleMonsterAttack

describe("handleMonsterAttack", () => {
  test("DM commands monster attack → resolves against player", async () => {
    const { partyId, dmUserId } = await createTestParty();
    handleSpawnEncounter(dmUserId, { monsters: [{ template_name: "Goblin", count: 1 }] });
    const { parties, characters } = getState();
    const party = parties.get(partyId)!;
    const monster = party.monsters[0]!;

    // Set initiative so monster goes first
    const monsterIdx = party.session!.initiativeOrder.findIndex((s) => s.entityId === monster.id);
    party.session!.currentTurn = monsterIdx;

    const targetCharId = party.members[0]!;
    const result = handleMonsterAttack(dmUserId, {
      monster_id: monster.id,
      target_id: targetCharId,
    });
    expect(result.success).toBe(true);
    expect(typeof result.data!.hit).toBe("boolean");
  });

  test("DM can target player by character name instead of target_id", async () => {
    const { partyId, dmUserId } = await createTestParty();
    handleSpawnEncounter(dmUserId, { monsters: [{ template_name: "Goblin", count: 1 }] });
    const { parties, characters } = getState();
    const party = parties.get(partyId)!;
    const monster = party.monsters[0]!;

    // Set initiative so monster goes first
    const monsterIdx = party.session!.initiativeOrder.findIndex((s) => s.entityId === monster.id);
    party.session!.currentTurn = monsterIdx;

    const targetCharId = party.members[0]!;
    const targetChar = characters.get(targetCharId)!;
    const result = handleMonsterAttack(dmUserId, {
      monster_id: monster.id,
      target: targetChar.name,
    });
    expect(result.success).toBe(true);
    expect(typeof result.data!.hit).toBe("boolean");
  });

  test("DM can target player by target_name instead of target_id", async () => {
    const { partyId, dmUserId } = await createTestParty();
    handleSpawnEncounter(dmUserId, { monsters: [{ template_name: "Goblin", count: 1 }] });
    const { parties, characters } = getState();
    const party = parties.get(partyId)!;
    const monster = party.monsters[0]!;

    const monsterIdx = party.session!.initiativeOrder.findIndex((s) => s.entityId === monster.id);
    party.session!.currentTurn = monsterIdx;

    const targetCharId = party.members[0]!;
    const targetChar = characters.get(targetCharId)!;
    const result = handleMonsterAttack(dmUserId, {
      monster_id: monster.id,
      target_name: targetChar.name,
    });
    expect(result.success).toBe(true);
    expect(typeof result.data!.hit).toBe("boolean");
  });

  test("monster attack with no target identifier returns error", async () => {
    const { partyId, dmUserId } = await createTestParty();
    handleSpawnEncounter(dmUserId, { monsters: [{ template_name: "Goblin", count: 1 }] });
    const { parties } = getState();
    const party = parties.get(partyId)!;
    const monster = party.monsters[0]!;

    const monsterIdx = party.session!.initiativeOrder.findIndex((s) => s.entityId === monster.id);
    party.session!.currentTurn = monsterIdx;

    const result = handleMonsterAttack(dmUserId, {
      monster_id: monster.id,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("target_id is required");
  });

  test.todo("monster attacks unconscious player → death save failures (not yet implemented)");
});

// (f) handleAdvanceScene

describe("handleAdvanceScene", () => {
  test("DM advances to next room → room changes", async () => {
    const { partyId, dmUserId } = await createTestParty();
    // First get available exits, then advance to one
    const scoutResult = handleAdvanceScene(dmUserId, {});
    expect(scoutResult.success).toBe(true);
    const exits = scoutResult.data!.exits as { id: string }[];
    if (exits.length > 0) {
      const result = handleAdvanceScene(dmUserId, { exit_id: exits[0]!.id });
      expect(result.success).toBe(true);
      expect(result.data!.advanced).toBe(true);
      expect(result.data!.room).toBeDefined();
    }

    const { parties } = getState();
    const party = parties.get(partyId)!;
    expect(party.session!.phase).toBe("exploration");
  });

  test("room_id param moves the party (alias for next_room_id)", async () => {
    const { partyId, dmUserId } = await createTestParty();
    const scoutResult = handleAdvanceScene(dmUserId, {});
    expect(scoutResult.success).toBe(true);
    const exits = scoutResult.data!.exits as { id: string; name: string }[];
    if (exits.length > 0) {
      const { parties } = getState();
      const party = parties.get(partyId)!;
      const oldRoom = party.dungeonState!.currentRoomId;

      const result = handleAdvanceScene(dmUserId, { room_id: exits[0]!.id });
      expect(result.success).toBe(true);
      expect(result.data!.advanced).toBe(true);
      expect(result.data!.room).toBeDefined();
      // Party should have actually moved
      expect(party.dungeonState!.currentRoomId).toBe(exits[0]!.id);
      expect(party.dungeonState!.currentRoomId).not.toBe(oldRoom);
      // Response should include exits for the NEW room
      expect(result.data!.exits).toBeDefined();
    }
  });

  test("advance during combat exits combat", async () => {
    const { partyId, dmUserId } = await createTestParty();
    handleSpawnEncounter(dmUserId, { monsters: [{ template_name: "Goblin", count: 1 }] });
    const { parties } = getState();
    const party = parties.get(partyId)!;
    expect(party.session!.phase).toBe("combat");

    const result = handleAdvanceScene(dmUserId, {});
    expect(result.success).toBe(true);
    expect(party.session!.phase).toBe("exploration");
    expect(party.monsters).toHaveLength(0);
  });
});

// (g) handleEndSession

describe("handleEndSession", () => {
  test("end session → session state updated, events logged", async () => {
    const { partyId, dmUserId } = await createTestParty();
    const result = handleEndSession(dmUserId, { summary: "Session complete" });
    expect(result.success).toBe(true);
    expect(result.data!.ended).toBe(true);

    // Non-campaign parties are cleaned up after session end
    const { parties } = getState();
    expect(parties.get(partyId)).toBeUndefined();
  });

  test("rejects empty body (no summary)", async () => {
    const { dmUserId } = await createTestParty();
    const result = handleEndSession(dmUserId, {} as { summary: string });
    expect(result.success).toBe(false);
    expect(result.error).toContain("summary");
  });

  test("rejects empty string summary", async () => {
    const { dmUserId } = await createTestParty();
    const result = handleEndSession(dmUserId, { summary: "" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("summary");
  });

  test("rejects whitespace-only summary", async () => {
    const { dmUserId } = await createTestParty();
    const result = handleEndSession(dmUserId, { summary: "   " });
    expect(result.success).toBe(false);
    expect(result.error).toContain("summary");
  });

  test("session remains active after rejected end-session", async () => {
    const { partyId, dmUserId } = await createTestParty();
    handleEndSession(dmUserId, {} as { summary: string });
    const { parties } = getState();
    const party = parties.get(partyId)!;
    expect(party.session!.isActive).toBe(true);
  });

  test("XP awarded before end persists", async () => {
    const { playerUserIds, dmUserId } = await createTestParty();
    const char = getCharacterForUser(playerUserIds[0]!)!;
    const xpBefore = char.xp;

    handleAwardXp(dmUserId, { amount: 400 });
    expect(char.xp).toBe(xpBefore + 100); // 400 / 4 members

    handleEndSession(dmUserId, { summary: "Done" });
    expect(char.xp).toBe(xpBefore + 100); // persists
  });
});
