import { describe, test, expect } from "bun:test";
import {
  createDungeonState,
  moveToRoom,
  getAvailableExits,
  unlockConnection,
} from "../src/game/dungeon.ts";
import type { ConnectionType, RoomType } from "../src/types.ts";

/**
 * FT025: Moving to a locked/puzzle room should return a descriptive error
 * instead of a silent null.
 */

function makeDungeon() {
  const rooms = [
    { id: "entry", name: "Entry Hall", description: "A stone hall.", type: "entrance" as RoomType, features: [] },
    { id: "armory", name: "The Armory", description: "A locked armory.", type: "treasure" as RoomType, features: [] },
    { id: "corridor", name: "Corridor", description: "A corridor.", type: "combat" as RoomType, features: [] },
  ];
  const connections = [
    { fromRoomId: "entry", toRoomId: "armory", type: "locked" as ConnectionType },
    { fromRoomId: "entry", toRoomId: "corridor", type: "passage" as ConnectionType },
  ];
  return createDungeonState(rooms, connections, "entry");
}

describe("moveToRoom returns descriptive errors for locked rooms (FT025)", () => {
  test("locked connection returns ok:false with descriptive reason", () => {
    const state = makeDungeon();
    const result = moveToRoom(state, "armory");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain("locked");
      expect(result.reason).toContain("The Armory");
    }
  });

  test("normal passage returns ok:true with updated state", () => {
    const state = makeDungeon();
    const result = moveToRoom(state, "corridor");

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.state.currentRoomId).toBe("corridor");
    }
  });

  test("non-existent room returns ok:false with reason", () => {
    const state = makeDungeon();
    const result = moveToRoom(state, "nonexistent");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no_exit");
    }
  });

  test("unlocked connection allows movement", () => {
    const state = makeDungeon();
    // First verify it's locked
    const lockedResult = moveToRoom(state, "armory");
    expect(lockedResult.ok).toBe(false);

    // Unlock and try again
    const unlocked = unlockConnection(state, "entry", "armory");
    const unlockedResult = moveToRoom(unlocked, "armory");
    expect(unlockedResult.ok).toBe(true);
    if (unlockedResult.ok) {
      expect(unlockedResult.state.currentRoomId).toBe("armory");
    }
  });

  test("locked exit still appears in available exits", () => {
    const state = makeDungeon();
    const exits = getAvailableExits(state);
    const armoryExit = exits.find((e) => e.roomId === "armory");
    expect(armoryExit).toBeDefined();
    expect(armoryExit!.connectionType).toBe("locked");
  });
});
