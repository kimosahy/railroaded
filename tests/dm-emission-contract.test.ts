import { describe, test, expect, beforeEach } from "bun:test";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  handleNarrate,
  handleNarrateTo,
  handleVoiceNpc,
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

describe("handleNarrate — Theater emission contract", () => {
  test("backward compat: { text } only → emission with track: narration, agent_role: dm", async () => {
    const { partyId, dmUserId } = await makeParty();
    const result = handleNarrate(dmUserId, { text: "The torches gutter." });
    expect(result.success).toBe(true);
    const emission = result.data?.emission as Record<string, unknown>;
    expect(emission.track).toBe("narration");
    expect(emission.agent_role).toBe("dm");
    expect(emission.content).toBe("The torches gutter.");
    expect(getEmissionHistory(partyId).length).toBe(1);
  });

  test("DM extension fields persist (lighting, tension, scene, mood)", async () => {
    const { partyId, dmUserId } = await makeParty();
    const result = handleNarrate(dmUserId, {
      text: "Dust, ankle-deep.",
      type: "scene",
      lighting: "torchlit",
      tension: 4,
      mood: "dread",
      scene: { type: "establishing", image_prompt: "ruins" },
    } as Parameters<typeof handleNarrate>[1]);
    expect(result.success).toBe(true);
    const emission = result.data?.emission as Record<string, unknown>;
    expect(emission.lighting).toBe("torchlit");
    expect(emission.tension).toBe(4);
    expect(emission.mood).toBe("dread");
    expect((emission.scene as Record<string, unknown>)?.type).toBe("establishing");
    expect(getEmissionHistory(partyId).length).toBe(1);
  });

  test("orthogonality: narrate.type and §14 track both present on event", async () => {
    const { dmUserId } = await makeParty();
    const result = handleNarrate(dmUserId, {
      text: "scene-setter",
      type: "atmosphere",
    } as Parameters<typeof handleNarrate>[1]);
    expect(result.success).toBe(true);
    expect(result.data?.type).toBe("atmosphere");
    const emission = result.data?.emission as Record<string, unknown>;
    expect(emission.track).toBe("narration");
  });

  test("C4 metadata.{mood,lighting} promoted to top-level §14 fields", async () => {
    const { dmUserId } = await makeParty();
    const result = handleNarrate(dmUserId, {
      text: "scene",
      metadata: { mood: "fear", lighting: "midnight", location: "great-hall" },
    } as Parameters<typeof handleNarrate>[1]);
    const emission = result.data?.emission as Record<string, unknown>;
    expect(emission.mood).toBe("fear");
    expect(emission.lighting).toBe("midnight");
    // location stays in metadata; not promoted (no §14 location field)
  });

  test("C4 collision: top-level mood wins over metadata.mood", async () => {
    const { dmUserId } = await makeParty();
    const result = handleNarrate(dmUserId, {
      text: "scene",
      mood: "joy",
      metadata: { mood: "fear" },
    } as Parameters<typeof handleNarrate>[1]);
    const emission = result.data?.emission as Record<string, unknown>;
    expect(emission.mood).toBe("joy");
  });

  test("duplicate narration suppression rejects BEFORE emission build (vocab queue untouched)", async () => {
    const { partyId, dmUserId } = await makeParty();
    // First narration with unknown tone → succeeds, vocab queue captures
    handleNarrate(dmUserId, { text: "the same line", tone: "wistful" } as Parameters<typeof handleNarrate>[1]);
    expect(getVocabularyQueue().length).toBe(1);
    expect(getEmissionHistory(partyId).length).toBe(1);

    // Duplicate: same text → rejected, NO new emission stored, NO new vocab entry
    const dup = handleNarrate(dmUserId, { text: "the same line", tone: "pensive" } as Parameters<typeof handleNarrate>[1]);
    expect(dup.success).toBe(false);
    expect(getEmissionHistory(partyId).length).toBe(1);
    // "pensive" must NOT appear in vocab queue — dup check fired before emission build
    expect(getVocabularyQueue().find(e => e.value === "pensive")).toBeUndefined();
  });

  test("commentary meta (intent/reasoning) preserved on event payload, orthogonal to §14", async () => {
    const { dmUserId } = await makeParty();
    const result = handleNarrate(dmUserId, {
      text: "x",
      meta: { intent: "set tone", reasoning: "build dread" },
    } as Parameters<typeof handleNarrate>[1]);
    expect(result.success).toBe(true);
    // emission shouldn't contain intent/reasoning at top level — meta is orthogonal
    const emission = result.data?.emission as Record<string, unknown>;
    expect(emission.intent).toBeUndefined();
    expect(emission.reasoning).toBeUndefined();
  });
});

describe("handleVoiceNpc — Theater emission contract", () => {
  test("track is dialogue (NPCs SPEAK, not narrate); address_target is npc name", async () => {
    const { partyId, dmUserId } = await makeParty();
    const result = handleVoiceNpc(dmUserId, {
      npc_id: "bartender",
      dialogue: "Whatever you ordered, the answer is no.",
      tone: "growl",
    });
    expect(result.success).toBe(true);
    const emission = result.data?.emission as Record<string, unknown>;
    expect(emission.track).toBe("dialogue");
    expect(emission.address_target).toBe("bartender");
    expect(emission.tone).toBe("growl");
    expect(emission.agent_role).toBe("dm");
    expect(getEmissionHistory(partyId).length).toBe(1);
  });

  test("legacy field aliases still work: name + message", async () => {
    const { dmUserId } = await makeParty();
    const result = handleVoiceNpc(dmUserId, {
      name: "innkeeper",
      message: "Last call.",
    });
    expect(result.success).toBe(true);
    const emission = result.data?.emission as Record<string, unknown>;
    expect(emission.content).toBe("Last call.");
    expect(emission.address_target).toBe("innkeeper");
  });

  test("missing identifier → 400, no emission produced", async () => {
    const { partyId, dmUserId } = await makeParty();
    const result = handleVoiceNpc(dmUserId, { dialogue: "no identifier" });
    expect(result.success).toBe(false);
    expect(getEmissionHistory(partyId).length).toBe(0);
  });
});

describe("handleNarrateTo — stub-fix verification", () => {
  test("targeted player narrate_to writes to storeEmission for audience replay", async () => {
    const { partyId, playerUserIds, dmUserId } = await makeParty();
    const { characters } = getState();
    const target = [...characters.values()].find(c => c.userId === playerUserIds[0])!;
    const result = handleNarrateTo(dmUserId, {
      player_id: target.id,
      text: "You catch the flicker of a sigil.",
      tone: "whisper",
    });
    expect(result.success).toBe(true);
    const emission = result.data?.emission as Record<string, unknown>;
    expect(emission.track).toBe("narration");
    expect(emission.agent_role).toBe("dm");
    expect(emission.content).toBe("You catch the flicker of a sigil.");
    // Audience replay sees it
    const stored = getEmissionHistory(partyId);
    expect(stored.length).toBe(1);
    expect(stored[0].content).toBe("You catch the flicker of a sigil.");
  });

  test("response data includes target name + emission", async () => {
    const { playerUserIds, dmUserId } = await makeParty();
    const { characters } = getState();
    const target = [...characters.values()].find(c => c.userId === playerUserIds[0])!;
    const result = handleNarrateTo(dmUserId, {
      player_id: target.id,
      text: "private",
    });
    expect(result.data?.to).toBe(target.id);
    expect(result.data?.toName).toBe(target.name);
    expect(result.data?.text).toBe("private");
    expect(result.data?.emission).toBeDefined();
  });

  test("missing player_id → 400, no emission produced", async () => {
    const { partyId, dmUserId } = await makeParty();
    const result = handleNarrateTo(dmUserId, { player_id: "", text: "x" });
    expect(result.success).toBe(false);
    expect(getEmissionHistory(partyId).length).toBe(0);
  });

  test("target not in party → 400", async () => {
    const { partyId, dmUserId } = await makeParty();
    const result = handleNarrateTo(dmUserId, { player_id: "char-not-real", text: "x" });
    expect(result.success).toBe(false);
    expect(getEmissionHistory(partyId).length).toBe(0);
  });

  test("Rev3 Task 5 — narration_to renders cleanly in journal (not raw JSON)", async () => {
    const { partyId, playerUserIds, dmUserId } = await makeParty();
    const { characters, parties } = getState();
    const target = [...characters.values()].find(c => c.userId === playerUserIds[0])!;
    handleNarrateTo(dmUserId, {
      player_id: target.id,
      text: "You catch the flicker of a sigil on the table.",
    });
    const party = parties.get(partyId)!;
    const { summarizeSession } = await import("../src/game/journal.ts");
    const journal = summarizeSession(party.events as Parameters<typeof summarizeSession>[0]);
    // The narration_to event must render as a clean line, not as JSON.stringify
    // dump of the entire event.data envelope (which would include the nested
    // emission object).
    expect(journal).toContain(`[Whisper to ${target.name}]`);
    expect(journal).toContain("You catch the flicker of a sigil on the table.");
    expect(journal).not.toContain("emission_id");
    expect(journal).not.toContain("turn_id");
  });
});
