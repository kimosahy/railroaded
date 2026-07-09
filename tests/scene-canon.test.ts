/**
 * Fable sprint GAP 3 — scene canon: a room's established lore survives
 * revisits (PT-0505: "Room descriptions regenerate per-call. Same room ID,
 * different lore on revisit... no traceable arc is possible").
 *
 *  - first scene-narration in a room is stamped as canonNarration
 *  - get_room_state / advance_scene re-serve canon + visited/revisit flags
 *  - override_room_description replaces canon (explicit rewrite)
 *  - room_enter events carry roomId + description + revisit
 */
import { describe, test, expect } from "bun:test";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  handleNarrate,
  handleGetRoomState,
  handleAdvanceScene,
  handleOverrideRoomDescription,
  getState,
} from "../src/game/game-manager.ts";
import { getCurrentRoom } from "../src/game/dungeon.ts";
import type { AbilityScores } from "../src/types.ts";

const scores: AbilityScores = { str: 14, dex: 14, con: 14, int: 10, wis: 10, cha: 10 };

let counter = 0;
function uid(prefix: string) {
  return `canon-${prefix}-${++counter}-${Date.now()}`;
}

async function setupParty() {
  const pids = [uid("p"), uid("p"), uid("p"), uid("p")];
  const dmId = uid("dm");
  for (const pid of pids) {
    const r = await handleCreateCharacter(pid, {
      name: `Hero-${pid}`,
      race: "human",
      class: "fighter",
      ability_scores: scores,
      avatar_url: "https://example.com/test-avatar.png",
    });
    expect(r.success).toBe(true);
    handleQueueForParty(pid);
  }
  expect(handleDMQueueForParty(dmId).success).toBe(true);
  const partyId = [...getState().parties.keys()].pop()!;
  const party = getState().parties.get(partyId)!;
  return { dmId, playerIds: pids, party };
}

describe("scene canon — narration stamps established lore", () => {
  test("first scene narration becomes the room's canon; later ones do not overwrite", async () => {
    const { dmId, party } = await setupParty();
    const room = getCurrentRoom(party.dungeonState!)!;

    const first = `The hall opens onto a drowned observatory, brass and glass ${counter}.`;
    expect(handleNarrate(dmId, { text: first, type: "scene" }).success).toBe(true);
    expect(room.canonNarration).toBe(first);

    const second = `Suddenly it is a warrior-king's tomb instead ${counter}.`;
    expect(handleNarrate(dmId, { text: second, type: "scene" }).success).toBe(true);
    expect(room.canonNarration).toBe(first); // canon holds
  });

  test("non-scene narration types never become canon", async () => {
    const { dmId, party } = await setupParty();
    const room = getCurrentRoom(party.dungeonState!)!;

    expect(handleNarrate(dmId, { text: `A cold wind stirs the dust ${counter}.`, type: "atmosphere" }).success).toBe(true);
    expect(handleNarrate(dmId, { text: `"Who goes there?" rasps the guard ${counter}.`, type: "npc_dialogue" }).success).toBe(true);
    expect(room.canonNarration ?? null).toBeNull();
  });

  test("get_room_state serves visited + canon_narration + consistency note", async () => {
    const { dmId, party } = await setupParty();
    const canonText = `Forty-three astronomers sleep in glass cylinders ${counter}.`;
    handleNarrate(dmId, { text: canonText, type: "scene" });

    const res = handleGetRoomState(dmId);
    expect(res.success).toBe(true);
    const room = res.data!.room as Record<string, unknown>;
    expect(room.visited).toBe(true);
    expect(room.canon_narration).toBe(canonText);
    expect(String(room.canon_note)).toContain("established");
    void party;
  });
});

describe("scene canon — revisits re-serve established lore", () => {
  test("advance away and back: revisit=true and canon preserved", async () => {
    const { dmId, party } = await setupParty();
    const entryRoom = getCurrentRoom(party.dungeonState!)!;
    const canonText = `The gatehouse still smells of pitch and old blood ${counter}.`;
    handleNarrate(dmId, { text: canonText, type: "scene" });

    // Find a connected room and advance to it
    const exitsRes = handleAdvanceScene(dmId, {});
    const exits = (exitsRes.data!.exits as { id: string; type: string }[]).filter((e) => e.type !== "locked");
    expect(exits.length).toBeGreaterThan(0);

    const out = handleAdvanceScene(dmId, { next_room_id: exits[0]!.id });
    expect(out.success).toBe(true);
    expect(out.data!.revisit).toBe(false); // first time in the new room
    expect(out.data!.canon_narration ?? null).toBeNull(); // no lore established there yet

    // Come back to the entry room
    const back = handleAdvanceScene(dmId, { next_room_id: entryRoom.id });
    expect(back.success).toBe(true);
    expect(back.data!.revisit).toBe(true);
    expect(back.data!.canon_narration).toBe(canonText);
    expect(String(back.data!.canon_note)).toContain("established");
  });

  test("room_enter events carry roomId, description and revisit flag", async () => {
    const { dmId, party } = await setupParty();
    const entryRoom = getCurrentRoom(party.dungeonState!)!;

    const exitsRes = handleAdvanceScene(dmId, {});
    const exits = (exitsRes.data!.exits as { id: string; type: string }[]).filter((e) => e.type !== "locked");
    handleAdvanceScene(dmId, { next_room_id: exits[0]!.id });
    handleAdvanceScene(dmId, { next_room_id: entryRoom.id });

    const roomEnters = party.events.filter((e) => e.type === "room_enter");
    expect(roomEnters.length).toBeGreaterThanOrEqual(2);

    const firstEnter = roomEnters[roomEnters.length - 2]!.data as Record<string, unknown>;
    expect(firstEnter.roomId).toBe(exits[0]!.id);
    expect(typeof firstEnter.description).toBe("string");
    expect(firstEnter.revisit).toBe(false);

    const backEnter = roomEnters[roomEnters.length - 1]!.data as Record<string, unknown>;
    expect(backEnter.roomId).toBe(entryRoom.id);
    expect(backEnter.revisit).toBe(true);
  });
});

describe("scene canon — explicit override rewrites canon", () => {
  test("override_room_description replaces both description and canon", async () => {
    const { dmId, party } = await setupParty();
    const room = getCurrentRoom(party.dungeonState!)!;
    handleNarrate(dmId, { text: `Original canon lore ${counter}.`, type: "scene" });

    const rewrite = `Now a Victorian mortuary chapel, gaslit and silent ${counter}.`;
    const res = handleOverrideRoomDescription(dmId, { description: rewrite });
    expect(res.success).toBe(true);

    expect(room.description).toBe(rewrite);
    expect(room.canonNarration).toBe(rewrite);

    // And get_room_state serves the rewritten canon
    const state = handleGetRoomState(dmId);
    expect((state.data!.room as Record<string, unknown>).canon_narration).toBe(rewrite);
  });
});
