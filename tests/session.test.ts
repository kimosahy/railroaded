/**
 * Tests for session lifecycle and turn resources.
 */
import { describe, expect, test } from "bun:test";
import {
  createSession,
  enterCombat,
  exitCombat,
  nextTurn,
  getCurrentCombatant,
  freshTurnResources,
  type InitiativeSlot,
} from "../src/game/session.ts";

describe("freshTurnResources", () => {
  test("returns all resources as unused", () => {
    const resources = freshTurnResources();
    expect(resources.actionUsed).toBe(false);
    expect(resources.bonusUsed).toBe(false);
    expect(resources.reactionUsed).toBe(false);
  });

  test("returns a new object each call", () => {
    const a = freshTurnResources();
    const b = freshTurnResources();
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

describe("enterCombat turnResources", () => {
  const slots: InitiativeSlot[] = [
    { entityId: "char-1", initiative: 18, type: "player" },
    { entityId: "mob-1", initiative: 14, type: "monster" },
    { entityId: "char-2", initiative: 10, type: "player" },
  ];

  test("populates turnResources for all combatants", () => {
    const session = { ...createSession({ partyId: "p-1" }), id: "s-1" };
    const combat = enterCombat(session, slots);

    expect(combat.turnResources["char-1"]).toEqual(freshTurnResources());
    expect(combat.turnResources["mob-1"]).toEqual(freshTurnResources());
    expect(combat.turnResources["char-2"]).toEqual(freshTurnResources());
    expect(Object.keys(combat.turnResources)).toHaveLength(3);
  });

  test("sets phase to combat and currentTurn to 0", () => {
    const session = { ...createSession({ partyId: "p-1" }), id: "s-1" };
    const combat = enterCombat(session, slots);

    expect(combat.phase).toBe("combat");
    expect(combat.currentTurn).toBe(0);
    expect(combat.initiativeOrder).toEqual(slots);
  });
});

describe("exitCombat turnResources", () => {
  test("clears turnResources", () => {
    const session = { ...createSession({ partyId: "p-1" }), id: "s-1" };
    const combat = enterCombat(session, [
      { entityId: "char-1", initiative: 15, type: "player" },
    ]);

    expect(Object.keys(combat.turnResources)).toHaveLength(1);

    const exploration = exitCombat(combat);
    expect(exploration.turnResources).toEqual({});
    expect(exploration.phase).toBe("exploration");
  });
});

describe("createSession turnResources", () => {
  test("initializes with empty turnResources", () => {
    const session = createSession({ partyId: "p-1" });
    expect(session.turnResources).toEqual({});
  });
});

describe("nextTurn", () => {
  test("advances currentTurn and wraps around", () => {
    const slots: InitiativeSlot[] = [
      { entityId: "char-1", initiative: 18, type: "player" },
      { entityId: "mob-1", initiative: 14, type: "monster" },
    ];
    const session = { ...createSession({ partyId: "p-1" }), id: "s-1" };
    const combat = enterCombat(session, slots);

    expect(combat.currentTurn).toBe(0);
    expect(getCurrentCombatant(combat)?.entityId).toBe("char-1");

    const turn2 = nextTurn(combat);
    expect(turn2.currentTurn).toBe(1);
    expect(getCurrentCombatant(turn2)?.entityId).toBe("mob-1");

    const turn3 = nextTurn(turn2);
    expect(turn3.currentTurn).toBe(0);
    expect(getCurrentCombatant(turn3)?.entityId).toBe("char-1");
  });
});
