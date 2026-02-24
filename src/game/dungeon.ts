/**
 * Room navigation and dungeon state management.
 */

import type { ConnectionType, RoomType } from "../types.ts";

export interface DungeonRoom {
  id: string;
  name: string;
  description: string;
  type: RoomType;
  features: string[];
  visited: boolean;
  revealed: boolean;
}

export interface RoomConnection {
  fromRoomId: string;
  toRoomId: string;
  type: ConnectionType;
  discovered: boolean;
}

export interface DungeonState {
  rooms: Map<string, DungeonRoom>;
  connections: RoomConnection[];
  currentRoomId: string;
}

/**
 * Initialize dungeon state from template data.
 */
export function createDungeonState(
  rooms: { id: string; name: string; description: string; type: RoomType; features: string[] }[],
  connections: { fromRoomId: string; toRoomId: string; type: ConnectionType }[],
  entryRoomId: string
): DungeonState {
  const roomMap = new Map<string, DungeonRoom>();

  for (const r of rooms) {
    roomMap.set(r.id, {
      ...r,
      visited: r.id === entryRoomId,
      revealed: r.id === entryRoomId,
    });
  }

  const dungeonConnections: RoomConnection[] = connections.map((c) => ({
    ...c,
    // Hidden connections start undiscovered, others are visible
    discovered: c.type !== "hidden",
  }));

  return {
    rooms: roomMap,
    connections: dungeonConnections,
    currentRoomId: entryRoomId,
  };
}

/**
 * Get the current room.
 */
export function getCurrentRoom(state: DungeonState): DungeonRoom | null {
  return state.rooms.get(state.currentRoomId) ?? null;
}

/**
 * Get available exits from the current room.
 * Only shows discovered connections.
 */
export function getAvailableExits(state: DungeonState): {
  roomId: string;
  roomName: string;
  connectionType: ConnectionType;
}[] {
  const exits: { roomId: string; roomName: string; connectionType: ConnectionType }[] = [];

  for (const conn of state.connections) {
    if (!conn.discovered) continue;

    let targetRoomId: string | null = null;

    if (conn.fromRoomId === state.currentRoomId) {
      targetRoomId = conn.toRoomId;
    } else if (conn.toRoomId === state.currentRoomId) {
      // Connections are bidirectional
      targetRoomId = conn.fromRoomId;
    }

    if (targetRoomId) {
      const room = state.rooms.get(targetRoomId);
      if (room) {
        exits.push({
          roomId: targetRoomId,
          roomName: room.name,
          connectionType: conn.type,
        });
      }
    }
  }

  return exits;
}

/**
 * Move to a connected room.
 * Returns updated state or null if the move is invalid.
 */
export function moveToRoom(
  state: DungeonState,
  targetRoomId: string
): DungeonState | null {
  // Check if the room is accessible
  const exits = getAvailableExits(state);
  const exit = exits.find((e) => e.roomId === targetRoomId);

  if (!exit) return null;

  // Can't move through locked doors without a key/check
  if (exit.connectionType === "locked") return null;

  // Update state
  const newRooms = new Map(state.rooms);
  const targetRoom = newRooms.get(targetRoomId);
  if (!targetRoom) return null;

  newRooms.set(targetRoomId, {
    ...targetRoom,
    visited: true,
    revealed: true,
  });

  return {
    rooms: newRooms,
    connections: state.connections,
    currentRoomId: targetRoomId,
  };
}

/**
 * Unlock a locked connection.
 */
export function unlockConnection(
  state: DungeonState,
  fromRoomId: string,
  toRoomId: string
): DungeonState {
  const newConnections = state.connections.map((c) => {
    if (
      (c.fromRoomId === fromRoomId && c.toRoomId === toRoomId) ||
      (c.fromRoomId === toRoomId && c.toRoomId === fromRoomId)
    ) {
      return { ...c, type: "door" as ConnectionType };
    }
    return c;
  });

  return { ...state, connections: newConnections };
}

/**
 * Discover a hidden connection.
 */
export function discoverConnection(
  state: DungeonState,
  fromRoomId: string,
  toRoomId: string
): DungeonState {
  const newConnections = state.connections.map((c) => {
    if (
      (c.fromRoomId === fromRoomId && c.toRoomId === toRoomId) ||
      (c.fromRoomId === toRoomId && c.toRoomId === fromRoomId)
    ) {
      return { ...c, discovered: true };
    }
    return c;
  });

  // Also reveal the connected room
  const newRooms = new Map(state.rooms);
  const targetId = fromRoomId === state.currentRoomId ? toRoomId : fromRoomId;
  const targetRoom = newRooms.get(targetId);
  if (targetRoom) {
    newRooms.set(targetId, { ...targetRoom, revealed: true });
  }

  return { ...state, connections: newConnections, rooms: newRooms };
}

/**
 * Get all visited rooms.
 */
export function getVisitedRooms(state: DungeonState): DungeonRoom[] {
  return Array.from(state.rooms.values()).filter((r) => r.visited);
}
