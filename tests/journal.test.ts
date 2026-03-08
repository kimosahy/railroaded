import { describe, test, expect } from "bun:test";
import { summarizeSession, filterEventsForCharacter, type SessionEvent } from "../src/game/journal.ts";

function makeEvent(type: string, actorId: string | null, data: Record<string, unknown>): SessionEvent {
  return { type, actorId, data, timestamp: new Date() };
}

describe("summarizeSession", () => {
  test("empty events returns empty string", () => {
    expect(summarizeSession([])).toBe("");
  });

  test("narration event", () => {
    const result = summarizeSession([makeEvent("narration", null, { text: "A dark cave looms." })]);
    expect(result).toBe("[Narration] A dark cave looms.");
  });

  test("narration event with undefined text renders as undefined (B030 regression)", () => {
    // This documents the bug: if event.data.text is undefined, the journal shows "[Narration] undefined"
    // The fix is upstream in REST endpoint (rest.ts) which normalizes 'message' → 'text'
    const result = summarizeSession([makeEvent("narration", null, { text: undefined as unknown as string })]);
    expect(result).toBe("[Narration] undefined");
  });

  test("combat_start event", () => {
    const result = summarizeSession([makeEvent("combat_start", null, {})]);
    expect(result).toBe("[Combat] Encounter began!");
  });

  test("attack hit event", () => {
    const result = summarizeSession([
      makeEvent("attack", "char-1", { attackerName: "Brog", targetName: "Goblin", hit: true, damage: 8 }),
    ]);
    expect(result).toContain("[Combat]");
    expect(result).toContain("Brog attacked Goblin: Hit for 8 damage");
  });

  test("attack miss event", () => {
    const result = summarizeSession([
      makeEvent("attack", "char-1", { attackerName: "Brog", targetName: "Goblin", hit: false }),
    ]);
    expect(result).toContain("Miss");
    expect(result).not.toContain("damage");
  });

  test("spell_cast event", () => {
    const result = summarizeSession([
      makeEvent("spell_cast", "char-2", { casterName: "Wren", spellName: "Fire Bolt", targetName: "Skeleton" }),
    ]);
    expect(result).toBe("[Magic] Wren cast Fire Bolt on Skeleton");
  });

  test("spell_cast without target", () => {
    const result = summarizeSession([
      makeEvent("spell_cast", "char-2", { casterName: "Wren", spellName: "Shield" }),
    ]);
    expect(result).toBe("[Magic] Wren cast Shield");
  });

  test("death event", () => {
    const result = summarizeSession([makeEvent("death", "char-1", { characterName: "Brog" })]);
    expect(result).toBe("[Death] Brog has fallen!");
  });

  test("heal event", () => {
    const result = summarizeSession([
      makeEvent("heal", "char-3", { healerName: "Aria", targetName: "Brog", amount: 12 }),
    ]);
    expect(result).toBe("[Heal] Aria healed Brog for 12 HP");
  });

  test("chat event", () => {
    const result = summarizeSession([
      makeEvent("chat", "char-1", { speakerName: "Brog", message: "Let's go!" }),
    ]);
    expect(result).toBe('[Chat] Brog: "Let\'s go!"');
  });

  test("npc_dialogue event", () => {
    const result = summarizeSession([
      makeEvent("npc_dialogue", null, { npcName: "Barkeep", dialogue: "Welcome!" }),
    ]);
    expect(result).toBe('[NPC] Barkeep: "Welcome!"');
  });

  test("room_enter event", () => {
    const result = summarizeSession([
      makeEvent("room_enter", null, { roomName: "Dark Hallway" }),
    ]);
    expect(result).toBe("[Exploration] Party entered: Dark Hallway");
  });

  test("loot event", () => {
    const result = summarizeSession([
      makeEvent("loot", "char-1", { characterName: "Brog", itemName: "Longsword" }),
    ]);
    expect(result).toBe("[Loot] Brog received Longsword");
  });

  test("rest event", () => {
    const result = summarizeSession([makeEvent("rest", null, { restType: "short" })]);
    expect(result).toBe("[Rest] Party took a short rest");
  });

  test("combat_end event", () => {
    const result = summarizeSession([makeEvent("combat_end", null, {})]);
    expect(result).toBe("[Combat] Encounter resolved");
  });

  test("session_end event with summary", () => {
    const result = summarizeSession([makeEvent("session_end", null, { summary: "Victory!" })]);
    expect(result).toBe("[Session End] Victory!");
  });

  test("session_end event without summary", () => {
    const result = summarizeSession([makeEvent("session_end", null, {})]);
    expect(result).toBe("[Session End] The adventure continues...");
  });

  test("unknown event type uses JSON fallback", () => {
    const result = summarizeSession([makeEvent("custom_thing", null, { foo: "bar" })]);
    expect(result).toContain("[custom_thing]");
    expect(result).toContain('"foo"');
  });

  test("preserves event order", () => {
    const events = [
      makeEvent("narration", null, { text: "First" }),
      makeEvent("combat_start", null, {}),
      makeEvent("combat_end", null, {}),
    ];
    const lines = summarizeSession(events).split("\n");
    expect(lines[0]).toContain("First");
    expect(lines[1]).toContain("Encounter began");
    expect(lines[2]).toContain("Encounter resolved");
  });
});

describe("filterEventsForCharacter", () => {
  const charId = "char-1";
  const otherId = "char-2";

  test("includes events where actorId matches", () => {
    const events = [makeEvent("attack", charId, { attackerName: "Brog", targetName: "Goblin", hit: true })];
    expect(filterEventsForCharacter(events, charId).length).toBe(1);
  });

  test("includes events where data.targetId matches", () => {
    const events = [makeEvent("attack", otherId, { targetId: charId, hit: true })];
    expect(filterEventsForCharacter(events, charId).length).toBe(1);
  });

  test("always includes narration, room_enter, session_end, combat_start, combat_end", () => {
    const events = [
      makeEvent("narration", null, { text: "test" }),
      makeEvent("room_enter", null, { roomName: "Hall" }),
      makeEvent("session_end", null, {}),
      makeEvent("combat_start", null, {}),
      makeEvent("combat_end", null, {}),
    ];
    const filtered = filterEventsForCharacter(events, charId);
    expect(filtered.length).toBe(5);
  });

  test("always includes chat and npc_dialogue", () => {
    const events = [
      makeEvent("chat", otherId, { speakerName: "Other", message: "Hi" }),
      makeEvent("npc_dialogue", null, { npcName: "Bob", dialogue: "Hello" }),
    ];
    const filtered = filterEventsForCharacter(events, charId);
    expect(filtered.length).toBe(2);
  });

  test("includes loot only when data.characterId matches", () => {
    const myLoot = makeEvent("loot", null, { characterId: charId, itemName: "Sword" });
    const otherLoot = makeEvent("loot", null, { characterId: otherId, itemName: "Shield" });
    const filtered = filterEventsForCharacter([myLoot, otherLoot], charId);
    expect(filtered.length).toBe(1);
    expect(filtered[0].data.itemName).toBe("Sword");
  });

  test("excludes unrelated events", () => {
    const events = [
      makeEvent("attack", otherId, { attackerName: "Other", targetName: "Goblin", targetId: "goblin-1", hit: true }),
    ];
    const filtered = filterEventsForCharacter(events, charId);
    expect(filtered.length).toBe(0);
  });
});
