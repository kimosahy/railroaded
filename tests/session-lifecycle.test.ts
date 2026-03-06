import { describe, test, expect } from "bun:test";
import {
  createSession,
  enterCombat,
  exitCombat,
  nextTurn,
  getCurrentCombatant,
  removeCombatant,
  shouldCombatEnd,
  endSession,
  type SessionState,
  type InitiativeSlot,
} from "../src/game/session.ts";

// --- Helpers ---

function makeSession(overrides?: Partial<SessionState>): SessionState {
  return {
    id: "session-test",
    ...createSession({ partyId: "party-test" }),
    ...overrides,
  };
}

const testInitiative: InitiativeSlot[] = [
  { entityId: "p1", initiative: 20, type: "player" },
  { entityId: "m1", initiative: 15, type: "monster" },
  { entityId: "p2", initiative: 10, type: "player" },
  { entityId: "m2", initiative: 5, type: "monster" },
];

// --- Tests ---

// (a) createSession → exploration phase

describe("createSession", () => {
  test("starts in exploration phase", () => {
    const session = createSession({ partyId: "party-1" });
    expect(session.phase).toBe("exploration");
    expect(session.isActive).toBe(true);
    expect(session.initiativeOrder).toHaveLength(0);
    expect(session.currentTurn).toBe(0);
    expect(session.endedAt).toBeNull();
  });
});

// (b) enterCombat → combat phase, initiative order set

describe("enterCombat", () => {
  test("transitions to combat with initiative order", () => {
    const session = makeSession();
    const combat = enterCombat(session, testInitiative);
    expect(combat.phase).toBe("combat");
    expect(combat.currentTurn).toBe(0);
    expect(combat.initiativeOrder).toHaveLength(4);
    expect(combat.initiativeOrder[0]!.entityId).toBe("p1");
  });
});

// (c) nextTurn → advances to next combatant

describe("nextTurn", () => {
  test("advances to next combatant", () => {
    const session = enterCombat(makeSession(), testInitiative);
    const after = nextTurn(session);
    expect(after.currentTurn).toBe(1);
    expect(getCurrentCombatant(after)!.entityId).toBe("m1");
  });

  test("wraps around at end of initiative order", () => {
    let session = enterCombat(makeSession(), testInitiative);
    for (let i = 0; i < 4; i++) session = nextTurn(session);
    expect(session.currentTurn).toBe(0);
    expect(getCurrentCombatant(session)!.entityId).toBe("p1");
  });

  test("no-op if not in combat", () => {
    const session = makeSession();
    const after = nextTurn(session);
    expect(after.currentTurn).toBe(session.currentTurn);
  });
});

// (d) removeCombatant → dead entity removed from order

describe("removeCombatant", () => {
  test("removes entity from initiative order", () => {
    const session = enterCombat(makeSession(), testInitiative);
    const after = removeCombatant(session, "m1");
    expect(after.initiativeOrder).toHaveLength(3);
    expect(after.initiativeOrder.find((s) => s.entityId === "m1")).toBeUndefined();
  });

  test("adjusts currentTurn when earlier entity removed", () => {
    let session = enterCombat(makeSession(), testInitiative);
    session = nextTurn(nextTurn(session)); // currentTurn = 2 (p2)
    const after = removeCombatant(session, "p1"); // remove index 0
    expect(after.currentTurn).toBe(1); // shifted back
    expect(getCurrentCombatant(after)!.entityId).toBe("p2");
  });

  test("no-op for entity not in order", () => {
    const session = enterCombat(makeSession(), testInitiative);
    const after = removeCombatant(session, "nonexistent");
    expect(after.initiativeOrder).toHaveLength(4);
  });
});

// (e) shouldCombatEnd → true when all monsters dead

describe("shouldCombatEnd", () => {
  test("true when no monsters remain in initiative", () => {
    let session = enterCombat(makeSession(), testInitiative);
    session = removeCombatant(session, "m1");
    session = removeCombatant(session, "m2");
    expect(shouldCombatEnd(session)).toBe(true);
  });

  test("false when monsters remain", () => {
    const session = enterCombat(makeSession(), testInitiative);
    expect(shouldCombatEnd(session)).toBe(false);
  });

  test("false when not in combat", () => {
    expect(shouldCombatEnd(makeSession())).toBe(false);
  });
});

// (f) exitCombat → back to exploration

describe("exitCombat", () => {
  test("returns to exploration with cleared initiative", () => {
    const session = enterCombat(makeSession(), testInitiative);
    const after = exitCombat(session);
    expect(after.phase).toBe("exploration");
    expect(after.initiativeOrder).toHaveLength(0);
    expect(after.currentTurn).toBe(0);
  });
});

// (g) Full cycle: exploration → combat → monster death → combat end → exploration

describe("Full lifecycle", () => {
  test("exploration → combat → kill monsters → combat end → exploration", () => {
    // Start in exploration
    let session = makeSession();
    expect(session.phase).toBe("exploration");

    // Enter combat
    session = enterCombat(session, testInitiative);
    expect(session.phase).toBe("combat");
    expect(getCurrentCombatant(session)!.entityId).toBe("p1");

    // Advance through turns
    session = nextTurn(session);
    expect(getCurrentCombatant(session)!.entityId).toBe("m1");

    // Kill both monsters
    session = removeCombatant(session, "m1");
    session = removeCombatant(session, "m2");
    expect(shouldCombatEnd(session)).toBe(true);

    // Exit combat
    session = exitCombat(session);
    expect(session.phase).toBe("exploration");
    expect(session.initiativeOrder).toHaveLength(0);

    // End session
    session = endSession(session);
    expect(session.isActive).toBe(false);
    expect(session.endedAt).not.toBeNull();
  });
});
