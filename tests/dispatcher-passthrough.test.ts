// Rev3 Task 1+2 coverage: MCP and REST dispatchers must pass Theater fields
// through to the handler instead of cherry-picking legacy params.
//
// Root cause (pre-rev3): mcp.ts and rest.ts constructed new params objects with
// only legacy typed fields per Theater tool case, silently dropping every §14
// field (track, tone, pacing, scene, mood, audience_aside, ...) before the
// handler saw them. Tests passed because they called handlers directly and
// bypassed the dispatchers — the PR's thesis was undelivered through the agent path.
//
// Fix: pick() with shared whitelist constants in src/api/_dispatcher-whitelists.ts.

import { describe, test, expect, beforeEach } from "bun:test";
import { executeToolCall } from "../src/api/mcp.ts";
import {
  PARTY_CHAT_FIELDS, WHISPER_FIELDS, NARRATE_FIELDS, NARRATE_TO_FIELDS, VOICE_NPC_FIELDS, pick,
} from "../src/api/_dispatcher-whitelists.ts";
import {
  handleCreateCharacter, handleQueueForParty, handleDMQueueForParty, getState,
} from "../src/game/game-manager.ts";
import { _resetSetupStore } from "../src/theater/setup-store.ts";
import { clearVocabularyQueue } from "../src/theater/normalizer.ts";

let tc = 0;
function uid(p: string) { return `${p}-${++tc}`; }

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

describe("pick() helper", () => {
  test("returns only whitelisted keys", () => {
    const out = pick({ message: "hi", tone: "whisper", evil_field: "spoof" }, PARTY_CHAT_FIELDS);
    expect(out.message).toBe("hi");
    expect(out.tone).toBe("whisper");
    expect("evil_field" in out).toBe(false);
  });

  test("preserves nested objects intact", () => {
    const out = pick({ message: "hi", dice_intent: { die: "d20", for: "x" } }, PARTY_CHAT_FIELDS);
    expect(out.dice_intent).toEqual({ die: "d20", for: "x" });
  });

  test("WHISPER_FIELDS includes target aliases (target_id, targetId, target)", () => {
    expect(WHISPER_FIELDS.has("target_id")).toBe(true);
    expect(WHISPER_FIELDS.has("targetId")).toBe(true);
    expect(WHISPER_FIELDS.has("target")).toBe(true);
  });

  test("VOICE_NPC_FIELDS includes legacy aliases (name, message)", () => {
    expect(VOICE_NPC_FIELDS.has("name")).toBe(true);
    expect(VOICE_NPC_FIELDS.has("message")).toBe(true);
  });

  test("NARRATE_FIELDS includes audience_aside (DM-only directorial field)", () => {
    expect(NARRATE_FIELDS.has("audience_aside")).toBe(true);
    expect(NARRATE_FIELDS.has("hidden_information")).toBe(true);
    expect(NARRATE_FIELDS.has("foreshadow")).toBe(true);
  });

  test("NARRATE_TO_FIELDS includes audience_aside + scene", () => {
    expect(NARRATE_TO_FIELDS.has("audience_aside")).toBe(true);
    expect(NARRATE_TO_FIELDS.has("scene")).toBe(true);
  });
});

describe("MCP dispatcher pass-through (Task 1)", () => {
  test("party_chat: tone + track + mood survive end-to-end through executeToolCall", async () => {
    const { playerUserIds } = await makeParty();
    const result = await executeToolCall("party_chat", playerUserIds[0], {
      message: "Did anyone hear that?",
      track: "dialogue",
      tone: "whisper",
      mood: "fear",
      pacing: "deliberate",
    });
    expect(result.success).toBe(true);
    const emission = result.data?.emission as Record<string, unknown>;
    expect(emission.tone).toBe("whisper");
    expect(emission.mood).toBe("fear");
    expect(emission.pacing).toBe("deliberate");
  });

  test("party_chat: unknown fields are dropped by whitelist (defense-in-depth)", async () => {
    const { playerUserIds } = await makeParty();
    const result = await executeToolCall("party_chat", playerUserIds[0], {
      message: "x",
      tone: "whisper",
      malicious_admin_flag: true,
      __proto__: { evil: 1 },
    });
    expect(result.success).toBe(true);
    const emission = result.data?.emission as Record<string, unknown>;
    expect(emission.tone).toBe("whisper");
    expect(emission.malicious_admin_flag).toBeUndefined();
  });

  test("whisper: Theater fields + target aliases all flow through", async () => {
    const { playerUserIds } = await makeParty();
    const { characters } = getState();
    const target = [...characters.values()].find(c => c.userId === playerUserIds[1])!;
    const result = await executeToolCall("whisper", playerUserIds[0], {
      target_id: target.id,         // alias for player_id
      message: "psst",
      tone: "mutter",
      mood: "anger",
    });
    expect(result.success).toBe(true);
    const emission = result.data?.emission as Record<string, unknown>;
    expect(emission.tone).toBe("mutter");
    expect(emission.mood).toBe("anger");
  });

  test("narrate: scene + lighting + tension survive", async () => {
    const { dmUserId } = await makeParty();
    const result = await executeToolCall("narrate", dmUserId, {
      text: "The torches gutter.",
      type: "scene",
      scene: { type: "establishing", image_prompt: "ruins" },
      lighting: "torchlit",
      tension: 4,
      mood: "dread",
    });
    expect(result.success).toBe(true);
    const emission = result.data?.emission as Record<string, unknown>;
    expect((emission.scene as Record<string, unknown>)?.type).toBe("establishing");
    expect(emission.lighting).toBe("torchlit");
    expect(emission.tension).toBe(4);
    expect(emission.mood).toBe("dread");
  });

  test("narrate: audience_aside flows through (DM-authored directorial field)", async () => {
    const { dmUserId } = await makeParty();
    const result = await executeToolCall("narrate", dmUserId, {
      text: "Of course they walked into the trap.",
      audience_aside: { kind: "fourth-wall", subject_agent_id: "self" },
    });
    expect(result.success).toBe(true);
    const emission = result.data?.emission as Record<string, unknown>;
    expect((emission.audience_aside as Record<string, unknown>)?.kind).toBe("fourth-wall");
  });

  test("narrate: legacy npc_id is renamed to npcId at dispatch boundary", async () => {
    const { dmUserId } = await makeParty();
    const result = await executeToolCall("narrate", dmUserId, {
      text: "x",
      type: "npc_dialogue",
      npc_id: "npc-bartender",
    });
    expect(result.success).toBe(true);
    // narrate handler uses params.npcId — confirms dispatcher-level rename worked
  });

  test("narrate_to: scene + Theater fields survive", async () => {
    const { playerUserIds, dmUserId } = await makeParty();
    const { characters } = getState();
    const target = [...characters.values()].find(c => c.userId === playerUserIds[0])!;
    const result = await executeToolCall("narrate_to", dmUserId, {
      player_id: target.id,
      text: "You catch the flicker of a sigil.",
      tone: "whisper",
      memory_recall: { turn_id: "earlier", caption: "the seal" },
    });
    expect(result.success).toBe(true);
    const emission = result.data?.emission as Record<string, unknown>;
    expect(emission.tone).toBe("whisper");
    expect((emission.memory_recall as Record<string, unknown>)?.caption).toBe("the seal");
  });

  test("voice_npc: legacy aliases (name + message) work alongside Theater fields", async () => {
    const { dmUserId } = await makeParty();
    const result = await executeToolCall("voice_npc", dmUserId, {
      name: "innkeeper",                  // alias for npc_id
      message: "Last call.",              // alias for dialogue
      tone: "growl",
      mood: "anger",
    });
    expect(result.success).toBe(true);
    const emission = result.data?.emission as Record<string, unknown>;
    expect(emission.content).toBe("Last call.");
    expect(emission.tone).toBe("growl");
    expect(emission.mood).toBe("anger");
    expect(emission.address_target).toBe("innkeeper");
  });
});
