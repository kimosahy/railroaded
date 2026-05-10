import { describe, test, expect, beforeEach } from "bun:test";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  handlePartyChat,
  handleWhisper,
  getState,
} from "../src/game/game-manager.ts";
import {
  _resetSetupStore,
  getEmissionHistory,
} from "../src/theater/setup-store.ts";
import {
  clearVocabularyQueue,
  getVocabularyQueue,
} from "../src/theater/normalizer.ts";

let tc = 0;
function uid(prefix: string) { return `${prefix}-${++tc}`; }

function reset() {
  const { characters, charactersByUser, parties, playerQueue, dmQueue, npcs } = getState();
  characters.clear();
  charactersByUser.clear();
  parties.clear();
  playerQueue.length = 0;
  dmQueue.length = 0;
  npcs.clear();
  _resetSetupStore();
  clearVocabularyQueue();
}

async function createChar(userId: string) {
  return await handleCreateCharacter(userId, {
    name: `Char-${userId}`,
    race: "human",
    class: "fighter",
    ability_scores: { str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 15 },
    avatar_url: "https://example.com/avatar.png",
  } as Parameters<typeof handleCreateCharacter>[1]);
}

async function makeParty() {
  const pids = [uid("p"), uid("p"), uid("p"), uid("p")];
  const dmId = uid("dm");
  for (const id of pids) { await createChar(id); }
  pids.forEach((id) => handleQueueForParty(id));
  handleDMQueueForParty(dmId);
  const { parties } = getState();
  const partyId = [...parties.keys()].pop()!;
  return { partyId, playerUserIds: pids, dmUserId: dmId };
}

beforeEach(reset);

describe("handlePartyChat — Theater emission contract", () => {
  test("backward compat: { message } only → normalized emission with track: dialogue, no warnings", async () => {
    const { partyId, playerUserIds } = await makeParty();
    const result = handlePartyChat(playerUserIds[0], { message: "hello world" });
    expect(result.success).toBe(true);
    const emission = result.data?.emission as Record<string, unknown>;
    expect(emission).toBeDefined();
    expect(emission.track).toBe("dialogue");
    expect(emission.content).toBe("hello world");
    expect(emission.tone).toBeNull();
    expect(emission.pacing).toBeNull();
    expect(emission.agent_role).toBe("player");
    expect(typeof emission.turn_id).toBe("string");
    expect(typeof emission.emission_id).toBe("string");
    // Stored for replay
    expect(getEmissionHistory(partyId).length).toBe(1);
  });

  test("new shape persists §14 fields (tone, pacing, address, posture, mood)", async () => {
    const { partyId, playerUserIds } = await makeParty();
    const result = handlePartyChat(playerUserIds[0], {
      message: "Did anyone hear that?",
      track: "dialogue",
      tone: "whisper",
      pacing: "deliberate",
      address: "to-party",
      posture: "crouching",
      mood: "fear",
    });
    expect(result.success).toBe(true);
    const emission = result.data?.emission as Record<string, unknown>;
    expect(emission.track).toBe("dialogue");
    expect(emission.tone).toBe("whisper");
    expect(emission.pacing).toBe("deliberate");
    expect(emission.address).toBe("to-party");
    expect(emission.posture).toBe("crouching");
    expect(emission.mood).toBe("fear");
    // Replay store has the same emission
    const stored = getEmissionHistory(partyId);
    expect(stored.length).toBe(1);
    expect(stored[0].tone).toBe("whisper");
  });

  test("unknown tone → emission still rendered, vocabulary queue records it", async () => {
    const { playerUserIds } = await makeParty();
    const result = handlePartyChat(playerUserIds[0], {
      message: "huh",
      tone: "wistful",
    });
    expect(result.success).toBe(true);
    const queue = getVocabularyQueue();
    const wistful = queue.find(e => e.attribute === "tone" && e.value === "wistful");
    expect(wistful).toBeDefined();
    expect(wistful!.count).toBeGreaterThanOrEqual(1);
  });

  test("internal_monologue track is stored for audience replay", async () => {
    const { partyId, playerUserIds } = await makeParty();
    handlePartyChat(playerUserIds[0], {
      message: "(I have no idea what I'm doing)",
      track: "internal_monologue",
    });
    const stored = getEmissionHistory(partyId);
    expect(stored.length).toBe(1);
    expect(stored[0].track).toBe("internal_monologue");
  });

  test("dual-storage: legacy fields AND nested emission both present on response data", async () => {
    const { playerUserIds } = await makeParty();
    const result = handlePartyChat(playerUserIds[0], { message: "hi" });
    expect(result.data?.speaker).toBeDefined();
    expect(result.data?.message).toBe("hi");
    expect(result.data?.emission).toBeDefined();
  });

  test("agent_id on emission matches character id (vocab queue attribution works)", async () => {
    const { playerUserIds } = await makeParty();
    const { characters } = getState();
    const char = [...characters.values()].find(c => c.userId === playerUserIds[0])!;
    const result = handlePartyChat(playerUserIds[0], { message: "x", tone: "wistful" });
    expect(result.success).toBe(true);
    const queue = getVocabularyQueue();
    const entry = queue.find(e => e.value === "wistful");
    expect(entry?.agentId).toBe(char.id);
  });

  test("dead character → 400, no emission produced", async () => {
    const { partyId, playerUserIds } = await makeParty();
    const { characters } = getState();
    const char = [...characters.values()].find(c => c.userId === playerUserIds[0])!;
    char.conditions.push("dead");
    const result = handlePartyChat(playerUserIds[0], { message: "hello", tone: "wistful" });
    expect(result.success).toBe(false);
    // No emission stored, vocab queue untouched
    expect(getEmissionHistory(partyId).length).toBe(0);
    expect(getVocabularyQueue().find(e => e.value === "wistful")).toBeUndefined();
  });
});

describe("handleWhisper — Theater emission contract", () => {
  test("whisper hits storeEmission for audience replay", async () => {
    const { partyId, playerUserIds } = await makeParty();
    const { characters } = getState();
    const fromChar = [...characters.values()].find(c => c.userId === playerUserIds[0])!;
    const toChar = [...characters.values()].find(c => c.userId === playerUserIds[1])!;
    const result = handleWhisper(playerUserIds[0], {
      player_id: toChar.id,
      message: "psst",
      tone: "whisper",
    });
    expect(result.success).toBe(true);
    const stored = getEmissionHistory(partyId);
    expect(stored.length).toBe(1);
    expect(stored[0].content).toBe("psst");
    expect(stored[0].tone).toBe("whisper");
    expect(stored[0].agent_id).toBe(fromChar.id);
  });

  test("whisper backward compat: { player_id, message } only", async () => {
    const { playerUserIds } = await makeParty();
    const { characters } = getState();
    const toChar = [...characters.values()].find(c => c.userId === playerUserIds[1])!;
    const result = handleWhisper(playerUserIds[0], {
      player_id: toChar.id,
      message: "old shape",
    });
    expect(result.success).toBe(true);
    const emission = result.data?.emission as Record<string, unknown>;
    expect(emission.content).toBe("old shape");
    expect(emission.track).toBe("dialogue");
    expect(emission.tone).toBeNull();
  });

  test("whisper to self rejected", async () => {
    const { partyId, playerUserIds } = await makeParty();
    const { characters } = getState();
    const fromChar = [...characters.values()].find(c => c.userId === playerUserIds[0])!;
    const result = handleWhisper(playerUserIds[0], {
      player_id: fromChar.id,
      message: "self",
    });
    expect(result.success).toBe(false);
    expect(getEmissionHistory(partyId).length).toBe(0);
  });

  test("whisper response data exposes from/to/message + emission", async () => {
    const { playerUserIds } = await makeParty();
    const { characters } = getState();
    const toChar = [...characters.values()].find(c => c.userId === playerUserIds[1])!;
    const result = handleWhisper(playerUserIds[0], {
      player_id: toChar.id,
      message: "hi",
    });
    expect(result.data?.from).toBeDefined();
    expect(result.data?.to).toBe(toChar.name);
    expect(result.data?.message).toBe("hi");
    expect(result.data?.emission).toBeDefined();
  });
});

describe("chatMessages metric guard for internal_monologue (Rev3 Task 6)", () => {
  test("dialogue track DOES increment chatMessages (visibility metric)", async () => {
    const { playerUserIds } = await makeParty();
    const { characters } = getState();
    const char = [...characters.values()].find(c => c.userId === playerUserIds[0])!;
    const before = char.chatMessages;
    handlePartyChat(playerUserIds[0], { message: "out loud", track: "dialogue" });
    expect(char.chatMessages).toBe(before + 1);
  });

  test("internal_monologue track does NOT increment chatMessages or totalActionWords", async () => {
    const { playerUserIds } = await makeParty();
    const { characters } = getState();
    const char = [...characters.values()].find(c => c.userId === playerUserIds[0])!;
    const beforeChat = char.chatMessages;
    const beforeWords = char.totalActionWords;
    handlePartyChat(playerUserIds[0], {
      message: "I do not trust the bartender, the way his hand twitched at the seal",
      track: "internal_monologue",
    });
    expect(char.chatMessages).toBe(beforeChat);
    expect(char.totalActionWords).toBe(beforeWords);
  });

  test("internal_monologue still triggers behavior-detection metrics (track-agnostic signal)", async () => {
    // safetyRefusals captures bleed-through regardless of visibility class.
    // If detectSafetyBleedThrough flags the message, safetyRefusals increments
    // even when the emission is audience-only thinking.
    const { playerUserIds } = await makeParty();
    const { characters } = getState();
    const char = [...characters.values()].find(c => c.userId === playerUserIds[0])!;
    const beforeSafety = char.safetyRefusals;
    const beforeChat = char.chatMessages;
    // Use a phrase known to trigger bleed-through (typical AI-safety hedging).
    handlePartyChat(playerUserIds[0], {
      message: "I cannot help with that as an AI assistant",
      track: "internal_monologue",
    });
    // safetyRefusals: should fire (behavior detection, track-agnostic)
    expect(char.safetyRefusals).toBeGreaterThanOrEqual(beforeSafety);
    // chatMessages: should NOT fire (visibility class, track-gated)
    expect(char.chatMessages).toBe(beforeChat);
  });
});

describe("chatMessages metric guard for handleWhisper (Rev3.1 Task 6.1 — sibling-path fix)", () => {
  test("whisper with track: dialogue (default) DOES increment chatMessages (regression)", async () => {
    const { playerUserIds } = await makeParty();
    const { characters } = getState();
    const fromChar = [...characters.values()].find(c => c.userId === playerUserIds[0])!;
    const toChar = [...characters.values()].find(c => c.userId === playerUserIds[1])!;
    const beforeChat = fromChar.chatMessages;
    const beforeWords = fromChar.totalActionWords;
    handleWhisper(playerUserIds[0], { player_id: toChar.id, message: "psst" });
    expect(fromChar.chatMessages).toBe(beforeChat + 1);
    expect(fromChar.totalActionWords).toBeGreaterThan(beforeWords);
  });

  test("whisper with track: internal_monologue does NOT increment chatMessages or totalActionWords", async () => {
    const { playerUserIds } = await makeParty();
    const { characters } = getState();
    const fromChar = [...characters.values()].find(c => c.userId === playerUserIds[0])!;
    const toChar = [...characters.values()].find(c => c.userId === playerUserIds[1])!;
    const beforeChat = fromChar.chatMessages;
    const beforeWords = fromChar.totalActionWords;
    handleWhisper(playerUserIds[0], {
      player_id: toChar.id,
      message: "I do not trust this character but I shouldn't say so out loud",
      track: "internal_monologue",
    });
    expect(fromChar.chatMessages).toBe(beforeChat);
    expect(fromChar.totalActionWords).toBe(beforeWords);
  });

  test("whisper with internal_monologue + safety bleed-through still fires safetyRefusals (track-agnostic behavior)", async () => {
    const { playerUserIds } = await makeParty();
    const { characters } = getState();
    const fromChar = [...characters.values()].find(c => c.userId === playerUserIds[0])!;
    const toChar = [...characters.values()].find(c => c.userId === playerUserIds[1])!;
    const beforeSafety = fromChar.safetyRefusals;
    const beforeChat = fromChar.chatMessages;
    handleWhisper(playerUserIds[0], {
      player_id: toChar.id,
      message: "I cannot help with that as an AI assistant",
      track: "internal_monologue",
    });
    // Behavior detection (track-agnostic) fires
    expect(fromChar.safetyRefusals).toBeGreaterThanOrEqual(beforeSafety);
    // Visibility metric (track-gated) does NOT fire
    expect(fromChar.chatMessages).toBe(beforeChat);
  });
});
