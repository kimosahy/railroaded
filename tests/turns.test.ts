import { describe, test, expect } from "bun:test";
import {
  createTurnState,
  canEntityAct,
  recordAction,
  nextRound,
  getAllowedActions,
  getAllowedDMActions,
} from "../src/game/turns.ts";

describe("createTurnState", () => {
  test("returns initial state with exploration phase, round 1, tick 0", () => {
    const state = createTurnState();
    expect(state.phase).toBe("exploration");
    expect(state.roundNumber).toBe(1);
    expect(state.tickNumber).toBe(0);
    expect(state.currentEntityId).toBeNull();
    expect(state.lastActionTime.size).toBe(0);
  });
});

describe("canEntityAct", () => {
  test("returns 0 for entity with no last action", () => {
    const state = createTurnState();
    expect(canEntityAct(state, "player-1", 1000)).toBe(0);
  });

  test("returns remaining ms when recently acted", () => {
    let state = createTurnState();
    // exploration has 60s tick
    state = recordAction(state, "player-1", 1000);
    const remaining = canEntityAct(state, "player-1", 31000); // 30s elapsed of 60s tick
    expect(remaining).toBe(30000);
  });

  test("returns 0 when enough time has elapsed", () => {
    let state = createTurnState();
    state = recordAction(state, "player-1", 1000);
    const remaining = canEntityAct(state, "player-1", 61001); // 60s elapsed
    expect(remaining).toBe(0);
  });

  test("returns 0 in roleplay phase (no rate limit)", () => {
    let state = createTurnState();
    state = { ...state, phase: "roleplay" };
    state = recordAction(state, "player-1", 1000);
    expect(canEntityAct(state, "player-1", 1001)).toBe(0);
  });

  test("returns 0 in rest phase (no rate limit)", () => {
    let state = createTurnState();
    state = { ...state, phase: "rest" };
    state = recordAction(state, "player-1", 1000);
    expect(canEntityAct(state, "player-1", 1001)).toBe(0);
  });
});

describe("recordAction", () => {
  test("increments tickNumber and sets lastActionTime", () => {
    const state = createTurnState();
    const updated = recordAction(state, "player-1", 5000);
    expect(updated.tickNumber).toBe(1);
    expect(updated.lastActionTime.get("player-1")).toBe(5000);
  });

  test("increments tickNumber on each call", () => {
    let state = createTurnState();
    state = recordAction(state, "player-1", 1000);
    state = recordAction(state, "player-2", 2000);
    expect(state.tickNumber).toBe(2);
    expect(state.lastActionTime.get("player-1")).toBe(1000);
    expect(state.lastActionTime.get("player-2")).toBe(2000);
  });
});

describe("nextRound", () => {
  test("increments roundNumber", () => {
    const state = createTurnState();
    const r2 = nextRound(state);
    expect(r2.roundNumber).toBe(2);
    const r3 = nextRound(r2);
    expect(r3.roundNumber).toBe(3);
  });
});

describe("getAllowedActions", () => {
  test("exploration returns look, move, search, etc.", () => {
    const actions = getAllowedActions("exploration", true);
    expect(actions).toContain("look");
    expect(actions).toContain("move");
    expect(actions).toContain("search");
    expect(actions).toContain("use_item");
    expect(actions).toContain("party_chat");
    expect(actions).toContain("whisper");
    expect(actions).toContain("get_status");
    expect(actions).toContain("get_available_actions");
    expect(actions).toContain("short_rest");
    expect(actions).toContain("long_rest");
  });

  test("exploration: isCurrentTurn true and false return same actions", () => {
    const onTurn = getAllowedActions("exploration", true);
    const offTurn = getAllowedActions("exploration", false);
    expect(onTurn).toEqual(offTurn);
  });

  test("combat on your turn returns attack, cast, dodge, etc.", () => {
    const actions = getAllowedActions("combat", true, []);
    expect(actions).toContain("attack");
    expect(actions).toContain("cast");
    expect(actions).toContain("dodge");
    expect(actions).toContain("dash");
    expect(actions).toContain("disengage");
    expect(actions).toContain("help");
    expect(actions).toContain("hide");
    expect(actions).toContain("move");
    expect(actions).toContain("bonus_action");
    expect(actions).toContain("end_turn");
    expect(actions).toContain("party_chat");
    expect(actions).toContain("get_status");
    expect(actions).toContain("get_available_actions");
  });

  test("combat off turn returns reaction, party_chat, get_status, get_available_actions", () => {
    const actions = getAllowedActions("combat", false, []);
    expect(actions).toContain("reaction");
    expect(actions).toContain("party_chat");
    expect(actions).toContain("get_status");
    expect(actions).toContain("get_available_actions");
    expect(actions).not.toContain("attack");
    expect(actions).not.toContain("dodge");
  });

  test("combat unconscious on turn returns death_save, get_status, get_available_actions", () => {
    const actions = getAllowedActions("combat", true, ["unconscious"]);
    expect(actions).toContain("death_save");
    expect(actions).toContain("get_status");
    expect(actions).toContain("get_available_actions");
    expect(actions).not.toContain("attack");
    expect(actions).not.toContain("reaction");
  });

  test("combat unconscious off turn returns get_status, get_available_actions only", () => {
    const actions = getAllowedActions("combat", false, ["unconscious"]);
    expect(actions).toContain("get_status");
    expect(actions).toContain("get_available_actions");
    expect(actions).not.toContain("death_save");
    expect(actions).not.toContain("attack");
    expect(actions).not.toContain("reaction");
  });

  test("combat dead returns only get_status, get_available_actions", () => {
    const actions = getAllowedActions("combat", true, ["dead"]);
    expect(actions).toContain("get_status");
    expect(actions).toContain("get_available_actions");
    expect(actions.length).toBe(2);
  });

  test("roleplay returns party_chat, whisper, look, etc.", () => {
    const actions = getAllowedActions("roleplay", true);
    expect(actions).toContain("party_chat");
    expect(actions).toContain("whisper");
    expect(actions).toContain("look");
    expect(actions).toContain("get_status");
    expect(actions).toContain("get_party");
    expect(actions).toContain("get_inventory");
    expect(actions).toContain("journal_add");
    expect(actions).toContain("get_available_actions");
  });

  test("rest returns short_rest, long_rest, etc.", () => {
    const actions = getAllowedActions("rest", true);
    expect(actions).toContain("short_rest");
    expect(actions).toContain("long_rest");
    expect(actions).toContain("party_chat");
    expect(actions).toContain("whisper");
    expect(actions).toContain("get_status");
    expect(actions).toContain("get_inventory");
    expect(actions).toContain("get_available_actions");
  });
});

describe("getAllowedDMActions", () => {
  test("exploration includes spawn_encounter, request_check, end_session", () => {
    const actions = getAllowedDMActions("exploration");
    expect(actions).toContain("spawn_encounter");
    expect(actions).toContain("request_check");
    expect(actions).toContain("request_save");
    expect(actions).toContain("request_group_check");
    expect(actions).toContain("request_contested_check");
    expect(actions).toContain("deal_environment_damage");
    expect(actions).toContain("award_xp");
    expect(actions).toContain("end_session");
    expect(actions).toContain("narrate");
    expect(actions).toContain("advance_scene");
  });

  test("combat includes monster_attack, excludes spawn_encounter and end_session", () => {
    const actions = getAllowedDMActions("combat");
    expect(actions).toContain("monster_attack");
    expect(actions).toContain("request_check");
    expect(actions).toContain("deal_environment_damage");
    expect(actions).not.toContain("spawn_encounter");
    expect(actions).not.toContain("end_session");
    expect(actions).not.toContain("request_group_check");
  });

  test("roleplay includes spawn_encounter, request_check", () => {
    const actions = getAllowedDMActions("roleplay");
    expect(actions).toContain("spawn_encounter");
    expect(actions).toContain("request_check");
    expect(actions).toContain("request_save");
    expect(actions).toContain("request_group_check");
    expect(actions).toContain("request_contested_check");
    expect(actions).toContain("award_xp");
    expect(actions).toContain("end_session");
  });

  test("rest includes award_xp, end_session", () => {
    const actions = getAllowedDMActions("rest");
    expect(actions).toContain("award_xp");
    expect(actions).toContain("end_session");
    expect(actions).toContain("narrate");
    expect(actions).not.toContain("spawn_encounter");
    expect(actions).not.toContain("monster_attack");
  });
});
