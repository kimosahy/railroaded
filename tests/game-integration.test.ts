import { describe, test, expect } from "bun:test";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  handleSpawnEncounter,
  handleAttack,
  handleEndTurn,
  handleDodge,
  handleDash,
  handleDisengage,
  handleHelp,
  handleHide,
  handleMove,
  handleBonusAction,
  handleReaction,
  handleDeathSave,
  handleShortRest,
  handleLongRest,
  handleMonsterAttack,
  handleAdvanceScene,
  handleRequestCheck,
  handleRequestSave,
  handleRequestGroupCheck,
  handleRequestContestedCheck,
  handleGetAvailableActions,
  handleGetStatus,
  handleGetParty,
  handleGetPartyState,
  handleGetRoomState,
  handleGetInventory,
  handleLook,
  handlePartyChat,
  handleWhisper,
  handleNarrate,
  handleNarrateTo,
  handleDMJournal,
  handleJournalAdd,
  handleDealEnvironmentDamage,
  getCharacterForUser,
  getPartyForUser,
  getPartyForCharacter,
} from "../src/game/game-manager.ts";
import { getCurrentCombatant } from "../src/game/session.ts";
import type { AbilityScores } from "../src/types.ts";

const scores: AbilityScores = { str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 15 };

async function setupParty(
  prefix: string,
  classes: string[] = ["fighter", "fighter", "fighter", "fighter"]
): Promise<{ players: string[]; dm: string }> {
  const players = classes.map((_, i) => `${prefix}-p${i + 1}`);
  const dm = `${prefix}-dm`;
  for (let i = 0; i < 4; i++) {
    await handleCreateCharacter(players[i], {
      name: `${prefix}Hero${i + 1}`,
      race: "human",
      class: classes[i] as any,
      ability_scores: scores,
      avatar_url: "https://example.com/test-avatar.png",
    });
    handleQueueForParty(players[i]);
  }
  handleDMQueueForParty(dm);
  return { players, dm };
}

/** Find the player userId whose character's turn it is. Returns null if a monster is up. */
function findCurrentPlayerUser(players: string[]): string | null {
  for (const p of players) {
    const char = getCharacterForUser(p);
    if (!char) continue;
    const party = getPartyForCharacter(char.id);
    if (!party?.session) continue;
    const current = getCurrentCombatant(party.session);
    if (current && current.entityId === char.id) return p;
  }
  return null;
}

/** Advance turns until a player is up, skipping monsters via DM end_turn. Returns the player userId. */
function advanceToPlayerTurn(players: string[], dm: string): string | null {
  for (let i = 0; i < 20; i++) {
    const playerUser = findCurrentPlayerUser(players);
    if (playerUser) return playerUser;
    // Monster turn — DM ends it
    handleEndTurn(dm);
  }
  return null;
}

/** Advance turns until a specific character is up. */
function advanceToCharacterTurn(charId: string, players: string[], dm: string): boolean {
  for (let i = 0; i < 20; i++) {
    const party = getPartyForUser(players[0]);
    if (!party?.session) return false;
    const current = getCurrentCombatant(party.session);
    if (current?.entityId === charId) return true;
    // End current turn
    const currentUser = findCurrentPlayerUser(players);
    if (currentUser) {
      handleEndTurn(currentUser);
    } else {
      handleEndTurn(dm);
    }
  }
  return false;
}

// ==================== A. Combat Actions ====================

describe("A. Combat Actions (dodge, dash, disengage, help, hide)", () => {
  let players: string[];
  let dm: string;

  test("setup: create party and spawn encounter", async () => {
    const setup = await setupParty("combat-actions");
    players = setup.players;
    dm = setup.dm;
    const spawn = handleSpawnEncounter(dm, { monsters: [{ template_name: "Goblin", count: 1 }] });
    expect(spawn.success).toBe(true);
  });

  test("handleDodge succeeds during combat on your turn", () => {
    const userId = advanceToPlayerTurn(players, dm);
    expect(userId).not.toBeNull();
    const result = handleDodge(userId!);
    expect(result.success).toBe(true);
    expect(result.data!.action).toBe("dodge");
  });

  test("handleDodge fails with action already used", () => {
    // Same character, same turn — action already consumed by dodge above
    const userId = findCurrentPlayerUser(players);
    if (!userId) return; // turn may have changed
    const result = handleDodge(userId);
    expect(result.success).toBe(false);
    expect(result.error).toContain("already used your action");
  });

  test("handleDash succeeds during combat on your turn", () => {
    // End previous turn, advance to next player
    const currentUser = findCurrentPlayerUser(players);
    if (currentUser) handleEndTurn(currentUser);
    const userId = advanceToPlayerTurn(players, dm);
    if (!userId) return;
    const result = handleDash(userId);
    expect(result.success).toBe(true);
    expect(result.data!.action).toBe("dash");
  });

  test("handleDisengage succeeds during combat on your turn", () => {
    const currentUser = findCurrentPlayerUser(players);
    if (currentUser) handleEndTurn(currentUser);
    const userId = advanceToPlayerTurn(players, dm);
    if (!userId) return;
    const result = handleDisengage(userId);
    expect(result.success).toBe(true);
    expect(result.data!.action).toBe("disengage");
  });

  test("handleHelp succeeds with valid target_id", () => {
    const currentUser = findCurrentPlayerUser(players);
    if (currentUser) handleEndTurn(currentUser);
    const userId = advanceToPlayerTurn(players, dm);
    if (!userId) return;
    // Target another party member
    const otherPlayer = players.find((p) => p !== userId)!;
    const otherChar = getCharacterForUser(otherPlayer)!;
    const result = handleHelp(userId, { target_id: otherChar.id });
    expect(result.success).toBe(true);
    expect(result.data!.action).toBe("help");
  });

  test("handleHide succeeds during combat on your turn", () => {
    const currentUser = findCurrentPlayerUser(players);
    if (currentUser) handleEndTurn(currentUser);
    const userId = advanceToPlayerTurn(players, dm);
    if (!userId) return;
    const result = handleHide(userId);
    expect(result.success).toBe(true);
    expect(result.data!.action).toBe("hide");
  });

  test("all five fail for unknown userId", () => {
    expect(handleDodge("unknown-user-x").success).toBe(false);
    expect(handleDash("unknown-user-x").success).toBe(false);
    expect(handleDisengage("unknown-user-x").success).toBe(false);
    expect(handleHelp("unknown-user-x", { target_id: "x" }).success).toBe(false);
    expect(handleHide("unknown-user-x").success).toBe(false);
  });

  test("DM can end monster turn", () => {
    const party = getPartyForUser(players[0]);
    expect(party?.session?.phase).toBe("combat");
    // Advance until it's a monster's turn
    let monsterTurn = false;
    for (let i = 0; i < 20; i++) {
      const current = getCurrentCombatant(party!.session!);
      if (current?.type === "monster") {
        monsterTurn = true;
        break;
      }
      // It's a player turn — end it
      const playerUser = findCurrentPlayerUser(players);
      if (playerUser) handleEndTurn(playerUser);
      else break;
    }
    if (!monsterTurn) return; // all monsters dead, skip
    const result = handleEndTurn(dm);
    expect(result.success).toBe(true);
    expect(result.data!.ended).toBe(true);
  });
});

describe("A2. Combat actions fail outside combat", () => {
  let players: string[];

  test("setup: create party without combat", async () => {
    const setup = await setupParty("combat-noenc");
    players = setup.players;
  });

  test("dodge/dash/disengage/help/hide succeed outside combat (no action resource check)", () => {
    // These handlers don't require combat — they just skip resource checks outside combat
    const r1 = handleDodge(players[0]);
    expect(r1.success).toBe(true);
    const r2 = handleDash(players[0]);
    expect(r2.success).toBe(true);
    const r3 = handleDisengage(players[0]);
    expect(r3.success).toBe(true);
    const r4 = handleHelp(players[0], { target_id: "some-id" });
    expect(r4.success).toBe(true);
    const r5 = handleHide(players[0]);
    expect(r5.success).toBe(true);
  });
});

// ==================== B. Bonus Actions ====================

describe("B. Bonus Actions", () => {
  let players: string[];
  let dm: string;

  test("setup: create party with rogue + fighter, spawn encounter", async () => {
    const setup = await setupParty("bonus-act", ["rogue", "fighter", "fighter", "fighter"]);
    players = setup.players;
    dm = setup.dm;
    const spawn = handleSpawnEncounter(dm, { monsters: [{ template_name: "Goblin", count: 1 }] });
    expect(spawn.success).toBe(true);
  });

  test("rogue bonus action dash succeeds (Cunning Action)", () => {
    const rogueChar = getCharacterForUser(players[0])!;
    const onTurn = advanceToCharacterTurn(rogueChar.id, players, dm);
    if (!onTurn) return;
    const result = handleBonusAction(players[0], { action: "dash" });
    expect(result.success).toBe(true);
    expect(result.data!.action).toBe("dash");
  });

  test("rogue bonus action hide returns stealth roll (Cunning Action)", () => {
    const rogueChar = getCharacterForUser(players[0])!;
    // End rogue turn from the dash test (bonus action was consumed)
    handleEndTurn(players[0]);
    const onTurn = advanceToCharacterTurn(rogueChar.id, players, dm);
    if (!onTurn) return;
    const result = handleBonusAction(players[0], { action: "hide" });
    expect(result.success).toBe(true);
    expect(result.data!.action).toBe("hide");
    expect(result.data!.stealthRoll).toBeGreaterThanOrEqual(1);
    expect(result.data!.dc).toBe(10);
    expect(typeof result.data!.hidden).toBe("boolean");
  });

  test("double bonus action fails", () => {
    const rogueChar = getCharacterForUser(players[0])!;
    const onTurn = advanceToCharacterTurn(rogueChar.id, players, dm);
    if (!onTurn) return;
    // Ensure bonus is used — use disengage (rogue has Cunning Action)
    const first = handleBonusAction(players[0], { action: "disengage" });
    if (first.success) {
      const result = handleBonusAction(players[0], { action: "hide" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("already used your bonus action");
    } else {
      // Already used from previous test on same turn
      expect(first.error).toContain("already used your bonus action");
    }
  });

  test("non-rogue bonus action dash fails", () => {
    // Advance to a fighter's turn
    handleEndTurn(players[0]); // end rogue turn
    const userId = advanceToPlayerTurn(players, dm);
    if (!userId || userId === players[0]) return; // skip if rogue again
    const result = handleBonusAction(userId, { action: "dash" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Only Rogues with Cunning Action");
  });

  test("fighter bonus action second_wind succeeds", () => {
    // Fighter (player 2) has Second Wind
    const fighterChar = getCharacterForUser(players[1])!;
    // Damage the fighter so we can verify healing
    fighterChar.hpCurrent = fighterChar.hpMax - 5;
    const onTurn = advanceToCharacterTurn(fighterChar.id, players, dm);
    if (!onTurn) return;
    const hpBefore = fighterChar.hpCurrent;
    const result = handleBonusAction(players[1], { action: "second_wind" });
    expect(result.success).toBe(true);
    expect(result.data!.action).toBe("second_wind");
    expect(result.data!.healed).toBeGreaterThan(0);
  });

  test("non-fighter bonus action second_wind fails", () => {
    const rogueChar = getCharacterForUser(players[0])!;
    const onTurn = advanceToCharacterTurn(rogueChar.id, players, dm);
    if (!onTurn) return;
    const result = handleBonusAction(players[0], { action: "second_wind" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Only Fighters with Second Wind");
  });

  test("bonus action outside combat fails", () => {
    // Use a character from a non-combat party
    const result = handleBonusAction("combat-noenc-p1", { action: "dash" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Not in combat");
  });

  test("unknown bonus action fails", () => {
    const userId = findCurrentPlayerUser(players);
    if (!userId) return;
    const result = handleBonusAction(userId, { action: "fly" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown bonus action");
  });
});

// ==================== C. Reactions ====================

describe("C. Reactions", () => {
  let players: string[];
  let dm: string;

  test("setup: create party and spawn encounter", async () => {
    const setup = await setupParty("react");
    players = setup.players;
    dm = setup.dm;
    const spawn = handleSpawnEncounter(dm, { monsters: [{ template_name: "Goblin", count: 1 }] });
    expect(spawn.success).toBe(true);
  });

  test("opportunity_attack succeeds off-turn", () => {
    // First advance to a player's turn
    advanceToPlayerTurn(players, dm);
    const currentUser = findCurrentPlayerUser(players)!;
    // Find an off-turn player
    const offTurnUser = players.find((p) => p !== currentUser);
    if (!offTurnUser) return;

    // Find a monster target
    const party = getPartyForUser(players[0])!;
    const monster = party.monsters.find((m) => m.isAlive);
    if (!monster) return;

    const result = handleReaction(offTurnUser, { action: "opportunity_attack", target_id: monster.id });
    expect(result.success).toBe(true);
    expect(result.data!.action).toBe("opportunity_attack");
  });

  test("reaction on own turn fails", () => {
    const currentUser = findCurrentPlayerUser(players);
    if (!currentUser) return;
    const party = getPartyForUser(players[0])!;
    const monster = party.monsters.find((m) => m.isAlive);
    if (!monster) return;
    const result = handleReaction(currentUser, { action: "opportunity_attack", target_id: monster.id });
    expect(result.success).toBe(false);
    expect(result.error).toContain("can't use a reaction on your own turn");
  });

  test("double reaction fails", () => {
    // The off-turn player who already reacted
    const currentUser = findCurrentPlayerUser(players)!;
    const offTurnUser = players.find((p) => p !== currentUser);
    if (!offTurnUser) return;
    const party = getPartyForUser(players[0])!;
    const monster = party.monsters.find((m) => m.isAlive);
    if (!monster) return;
    const result = handleReaction(offTurnUser, { action: "opportunity_attack", target_id: monster.id });
    expect(result.success).toBe(false);
    expect(result.error).toContain("already used your reaction");
  });

  test("reaction outside combat fails", () => {
    const result = handleReaction("combat-noenc-p1", { action: "opportunity_attack", target_id: "x" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Not in combat");
  });

  test("reaction cast without spell_name fails", () => {
    // Combat may have ended. Re-spawn if needed.
    const party = getPartyForUser(players[0]);
    if (!party?.session || party.session.phase !== "combat") {
      const spawn = handleSpawnEncounter(dm, { monsters: [{ template_name: "Goblin", count: 1 }] });
      if (!spawn.success) return;
    }
    // Advance to a player turn to get fresh turn resources
    advanceToPlayerTurn(players, dm);
    const onTurnUser = findCurrentPlayerUser(players)!;
    if (!onTurnUser) return;
    // Find an off-turn player whose reaction is NOT used
    const offTurnUser = players.find((p) => {
      if (p === onTurnUser) return false;
      const c = getCharacterForUser(p);
      if (!c) return false;
      const pt = getPartyForCharacter(c.id);
      if (!pt?.session) return false;
      const res = pt.session.turnResources[c.id];
      return !res?.reactionUsed;
    });
    if (!offTurnUser) return;
    const result = handleReaction(offTurnUser, { action: "cast" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("spell_name is required");
  });
});

// ==================== D. Death Saves ====================

describe("D. Death Saves", () => {
  let players: string[];
  let dm: string;

  test("setup: create party and spawn encounter", async () => {
    const setup = await setupParty("deathsave");
    players = setup.players;
    dm = setup.dm;
    const spawn = handleSpawnEncounter(dm, { monsters: [{ template_name: "Goblin", count: 1 }] });
    expect(spawn.success).toBe(true);
  });

  test("death save on unconscious character during their turn succeeds", () => {
    const char = getCharacterForUser(players[0])!;
    char.hpCurrent = 0;
    char.conditions = ["unconscious", "prone"];
    char.deathSaves = { successes: 0, failures: 0 };

    const onTurn = advanceToCharacterTurn(char.id, players, dm);
    if (!onTurn) return;

    const result = handleDeathSave(players[0]);
    expect(result.success).toBe(true);
    expect(result.data!.naturalRoll).toBeDefined();
    expect(typeof result.data!.success).toBe("boolean");
  });

  test("death save on conscious character fails", () => {
    const char = getCharacterForUser(players[1])!;
    expect(char.conditions.includes("unconscious")).toBe(false);
    const result = handleDeathSave(players[1]);
    expect(result.success).toBe(false);
    expect(result.error).toContain("not unconscious");
  });

  test("death save on stable character fails", () => {
    const char = getCharacterForUser(players[2])!;
    char.hpCurrent = 0;
    char.conditions = ["unconscious", "stable"];
    const result = handleDeathSave(players[2]);
    expect(result.success).toBe(false);
    expect(result.error).toContain("already stabilized");
  });

  test("death save on dead character fails", () => {
    const char = getCharacterForUser(players[3])!;
    char.conditions = ["unconscious", "dead"];
    const result = handleDeathSave(players[3]);
    expect(result.success).toBe(false);
    expect(result.error).toContain("dead");
  });

  test("death save outside combat fails", () => {
    // Use a character from the no-combat party
    const char = getCharacterForUser("combat-noenc-p2")!;
    char.hpCurrent = 0;
    char.conditions = ["unconscious"];
    char.deathSaves = { successes: 0, failures: 0 };
    const result = handleDeathSave("combat-noenc-p2");
    expect(result.success).toBe(false);
    expect(result.error).toContain("only made during combat");
  });

  test("death save on wrong turn fails", () => {
    // Find a player whose turn it is NOT
    const currentUser = findCurrentPlayerUser(players);
    const offTurnUser = players.find((p) => p !== currentUser && p !== players[0]);
    if (!offTurnUser) return;
    const char = getCharacterForUser(offTurnUser)!;
    char.hpCurrent = 0;
    char.conditions = ["unconscious", "prone"];
    char.deathSaves = { successes: 0, failures: 0 };
    const result = handleDeathSave(offTurnUser);
    expect(result.success).toBe(false);
    expect(result.error).toContain("not your turn");
  });
});

// ==================== D2. Unconscious end-turn (B041) ====================

describe("D2. Unconscious character can end turn (B041)", () => {
  let players: string[];
  let dm: string;

  test("setup: create party and spawn encounter", async () => {
    const setup = await setupParty("b041");
    players = setup.players;
    dm = setup.dm;
    const spawn = handleSpawnEncounter(dm, { monsters: [{ template_name: "Goblin", count: 1 }] });
    expect(spawn.success).toBe(true);
  });

  test("unconscious character can end turn after death save", () => {
    const char = getCharacterForUser(players[0])!;
    char.hpCurrent = 0;
    char.conditions = ["unconscious", "prone"];
    char.deathSaves = { successes: 0, failures: 0 };

    // Advance to this character's turn
    const onTurn = advanceToCharacterTurn(char.id, players, dm);
    if (!onTurn) return;

    // Make a death save
    const saveResult = handleDeathSave(players[0]);
    expect(saveResult.success).toBe(true);

    // End turn should succeed despite being unconscious
    const endResult = handleEndTurn(players[0]);
    expect(endResult.success).toBe(true);
    expect(endResult.data!.ended).toBe(true);
    expect(endResult.data!.nextTurn).not.toBeNull();
  });

  test("turn advances to next combatant after unconscious end-turn", () => {
    const char = getCharacterForUser(players[0])!;
    char.hpCurrent = 0;
    char.conditions = ["unconscious", "prone"];
    char.deathSaves = { successes: 0, failures: 0 };

    // Advance to this character's turn
    const onTurn = advanceToCharacterTurn(char.id, players, dm);
    if (!onTurn) return;

    const party = getPartyForCharacter(char.id)!;
    const currentBefore = getCurrentCombatant(party.session!);
    expect(currentBefore!.entityId).toBe(char.id);

    // End turn
    const endResult = handleEndTurn(players[0]);
    expect(endResult.success).toBe(true);

    // Current combatant should have changed
    const currentAfter = getCurrentCombatant(party.session!);
    expect(currentAfter!.entityId).not.toBe(char.id);
  });

  test("dead character cannot end turn", () => {
    const char = getCharacterForUser(players[1])!;
    char.conditions = ["dead"];
    const result = handleEndTurn(players[1]);
    expect(result.success).toBe(false);
  });
});

// ==================== E. Rest Mechanics ====================

describe("E. Rest Mechanics", () => {
  let players: string[];

  test("setup: create party (no combat)", async () => {
    const setup = await setupParty("rest-mech");
    players = setup.players;
  });

  test("handleShortRest succeeds and returns healing data", () => {
    const char = getCharacterForUser(players[0])!;
    char.hpCurrent = char.hpMax - 5;
    const result = handleShortRest(players[0]);
    expect(result.success).toBe(true);
    expect(result.data!.hpBefore).toBeDefined();
    expect(result.data!.hpAfter).toBeDefined();
    expect(result.data!.hitDiceRemaining).toBeDefined();
  });

  test("handleLongRest succeeds and restores HP", () => {
    const char = getCharacterForUser(players[1])!;
    char.hpCurrent = char.hpMax - 10;
    const hpBefore = char.hpCurrent;
    const result = handleLongRest(players[1]);
    expect(result.success).toBe(true);
    expect(result.data!.hpAfter).toBeGreaterThanOrEqual(hpBefore);
  });

  test("short rest fails for unknown userId", () => {
    expect(handleShortRest("unknown-rest-user").success).toBe(false);
  });

  test("long rest fails for unknown userId", () => {
    expect(handleLongRest("unknown-rest-user").success).toBe(false);
  });

  test("short rest fails when unconscious", () => {
    const char = getCharacterForUser(players[2])!;
    char.conditions = ["unconscious"];
    const result = handleShortRest(players[2]);
    expect(result.success).toBe(false);
    char.conditions = []; // restore
  });

  test("long rest fails when unconscious", () => {
    const char = getCharacterForUser(players[3])!;
    char.conditions = ["unconscious"];
    const result = handleLongRest(players[3]);
    expect(result.success).toBe(false);
    char.conditions = []; // restore
  });
});

// ==================== F. DM Checks and Saves ====================

describe("F. DM Checks and Saves", () => {
  let players: string[];
  let dm: string;

  test("setup: create party", async () => {
    const setup = await setupParty("dmcheck");
    players = setup.players;
    dm = setup.dm;
  });

  test("handleRequestCheck succeeds", () => {
    const char = getCharacterForUser(players[0])!;
    const result = handleRequestCheck(dm, { player_id: char.id, ability: "str", dc: 10 });
    expect(result.success).toBe(true);
    expect(result.data!.roll).toBeDefined();
    expect(result.data!.dc).toBe(10);
    expect(typeof result.data!.success).toBe("boolean");
  });

  test("handleRequestSave succeeds", () => {
    const char = getCharacterForUser(players[1])!;
    const result = handleRequestSave(dm, { player_id: char.id, ability: "dex", dc: 12 });
    expect(result.success).toBe(true);
    expect(result.data!.roll).toBeDefined();
    expect(typeof result.data!.success).toBe("boolean");
  });

  test("handleRequestGroupCheck succeeds", () => {
    const result = handleRequestGroupCheck(dm, { ability: "dex", dc: 12 });
    expect(result.success).toBe(true);
    expect(result.data!.overallSuccess).toBeDefined();
    expect((result.data!.results as unknown[]).length).toBe(4);
  });

  test("handleRequestContestedCheck succeeds", () => {
    const char1 = getCharacterForUser(players[0])!;
    const char2 = getCharacterForUser(players[1])!;
    const result = handleRequestContestedCheck(dm, {
      player_id_1: char1.id, ability_1: "str",
      player_id_2: char2.id, ability_2: "str",
    });
    expect(result.success).toBe(true);
    expect(result.data!.winner).toBeDefined();
    expect(result.data!.margin).toBeDefined();
  });

  test("handleDealEnvironmentDamage succeeds", () => {
    const char = getCharacterForUser(players[2])!;
    const hpBefore = char.hpCurrent;
    const result = handleDealEnvironmentDamage(dm, { player_id: char.id, damage: 5, damage_type: "fire" });
    expect(result.success).toBe(true);
    expect(result.data!.damage).toBeDefined();
    expect(char.hpCurrent).toBeLessThan(hpBefore);
  });

  test("handleDealEnvironmentDamage fails for non-DM user", () => {
    const char = getCharacterForUser(players[0])!;
    const result = handleDealEnvironmentDamage("random-user-no-party", { player_id: char.id, damage: 3, damage_type: "fire" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Not a DM");
  });

  test("handleDealEnvironmentDamage fails for character not in DM's party", async () => {
    // Create a second party with a different DM
    const other = await setupParty("envdmg-other");
    const otherChar = getCharacterForUser(other.players[0])!;
    // The original DM tries to damage a character from the other party
    const result = handleDealEnvironmentDamage(dm, { player_id: otherChar.id, damage: 3, damage_type: "fire" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not in your party");
  });

  test("handleDealEnvironmentDamage adds death save failure when character is at 0 HP", async () => {
    const setup = await setupParty("envdmg-deathsave");
    const char = getCharacterForUser(setup.players[0])!;
    // Drop character to 0 HP
    char.hpCurrent = 0;
    char.conditions = ["unconscious", "prone"];
    char.deathSaves = { successes: 0, failures: 0 };

    const result = handleDealEnvironmentDamage(setup.dm, { player_id: char.id, damage: 3, damage_type: "fire" });
    expect(result.success).toBe(true);
    expect(result.data!.hpRemaining).toBe(0);
    expect(result.data!.deathSaves).toBeDefined();
    expect((result.data!.deathSaves as { failures: number }).failures).toBe(1);
    expect(char.deathSaves.failures).toBe(1);
    expect(result.data!.dead).toBe(false);
  });

  test("handleDealEnvironmentDamage kills character at 0 HP with 2 existing failures", async () => {
    const setup = await setupParty("envdmg-death");
    const char = getCharacterForUser(setup.players[0])!;
    // Character at 0 HP with 2 death save failures already
    char.hpCurrent = 0;
    char.conditions = ["unconscious", "prone"];
    char.deathSaves = { successes: 1, failures: 2 };

    const result = handleDealEnvironmentDamage(setup.dm, { player_id: char.id, damage: 3, damage_type: "fire" });
    expect(result.success).toBe(true);
    expect(result.data!.dead).toBe(true);
    expect(char.deathSaves.failures).toBe(3);
    expect(char.conditions).toContain("dead");
    expect(char.conditions).not.toContain("unconscious");
  });

  test("handleDealEnvironmentDamage causes instant death if damage >= max HP at 0 HP", async () => {
    const setup = await setupParty("envdmg-massive");
    const char = getCharacterForUser(setup.players[0])!;
    char.hpCurrent = 0;
    char.conditions = ["unconscious", "prone"];
    char.deathSaves = { successes: 0, failures: 0 };

    // Deal damage >= max HP for instant death
    const result = handleDealEnvironmentDamage(setup.dm, { player_id: char.id, damage: char.hpMax, damage_type: "necrotic" });
    expect(result.success).toBe(true);
    expect(result.data!.dead).toBe(true);
    expect(char.conditions).toContain("dead");
  });

  test("handleDealEnvironmentDamage returns dead:false at 2 failures", async () => {
    const setup = await setupParty("envdmg-2fail");
    const char = getCharacterForUser(setup.players[0])!;
    char.hpCurrent = 0;
    char.conditions = ["unconscious", "prone"];
    char.deathSaves = { successes: 0, failures: 1 };

    const result = handleDealEnvironmentDamage(setup.dm, { player_id: char.id, damage: 3, damage_type: "fire" });
    expect(result.success).toBe(true);
    expect((result.data!.deathSaves as { failures: number }).failures).toBe(2);
    expect(result.data!.dead).toBe(false);
    expect(char.conditions).not.toContain("dead");
  });

  test("handleRequestCheck fails for non-existent player", () => {
    const result = handleRequestCheck(dm, { player_id: "nonexistent", ability: "str", dc: 10 });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found");
  });

  test("handleRequestGroupCheck fails for non-DM", () => {
    const result = handleRequestGroupCheck(players[0], { ability: "dex", dc: 12 });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Not a DM");
  });

  test("handleRequestCheck fails for non-DM user", () => {
    const char = getCharacterForUser(players[0])!;
    const result = handleRequestCheck("random-user-no-party", { player_id: char.id, ability: "str", dc: 10 });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Not a DM");
  });

  test("handleRequestCheck fails for character not in DM's party", async () => {
    const other = await setupParty("reqcheck-other");
    const otherChar = getCharacterForUser(other.players[0])!;
    const result = handleRequestCheck(dm, { player_id: otherChar.id, ability: "str", dc: 10 });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not in your party");
  });

  test("handleRequestSave fails for non-DM user", () => {
    const char = getCharacterForUser(players[0])!;
    const result = handleRequestSave("random-user-no-party", { player_id: char.id, ability: "dex", dc: 12 });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Not a DM");
  });

  test("handleRequestSave fails for character not in DM's party", async () => {
    const other = await setupParty("reqsave-other");
    const otherChar = getCharacterForUser(other.players[0])!;
    const result = handleRequestSave(dm, { player_id: otherChar.id, ability: "dex", dc: 12 });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not in your party");
  });

  test("handleRequestContestedCheck fails for non-DM user", () => {
    const char1 = getCharacterForUser(players[0])!;
    const char2 = getCharacterForUser(players[1])!;
    const result = handleRequestContestedCheck("random-user-no-party", {
      player_id_1: char1.id, ability_1: "str",
      player_id_2: char2.id, ability_2: "str",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Not a DM");
  });

  test("handleRequestContestedCheck fails for character not in DM's party", async () => {
    const other = await setupParty("reqcontest-other");
    const otherChar = getCharacterForUser(other.players[0])!;
    const char = getCharacterForUser(players[0])!;
    const result = handleRequestContestedCheck(dm, {
      player_id_1: char.id, ability_1: "str",
      player_id_2: otherChar.id, ability_2: "str",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not in your party");
  });

  // B021: long-form ability names should be normalized
  test("handleRequestCheck accepts long-form ability name 'dexterity'", () => {
    const char = getCharacterForUser(players[0])!;
    const result = handleRequestCheck(dm, { player_id: char.id, ability: "dexterity", dc: 14, skill: "stealth" });
    expect(result.success).toBe(true);
    expect(result.data!.roll).toBeDefined();
    expect(typeof result.data!.success).toBe("boolean");
  });

  test("handleRequestCheck accepts all long-form ability names", () => {
    const char = getCharacterForUser(players[0])!;
    for (const name of ["strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"]) {
      const result = handleRequestCheck(dm, { player_id: char.id, ability: name, dc: 10 });
      expect(result.success).toBe(true);
    }
  });

  test("handleRequestCheck rejects invalid ability name with 400", () => {
    const char = getCharacterForUser(players[0])!;
    const result = handleRequestCheck(dm, { player_id: char.id, ability: "luck", dc: 10 });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid ability");
  });

  test("handleRequestSave accepts long-form ability name", () => {
    const char = getCharacterForUser(players[0])!;
    const result = handleRequestSave(dm, { player_id: char.id, ability: "constitution", dc: 14 });
    expect(result.success).toBe(true);
    expect(result.data!.roll).toBeDefined();
  });

  test("handleRequestSave rejects invalid ability name", () => {
    const char = getCharacterForUser(players[0])!;
    const result = handleRequestSave(dm, { player_id: char.id, ability: "fortitude", dc: 10 });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid ability");
  });

  test("handleRequestGroupCheck accepts long-form ability name", () => {
    const result = handleRequestGroupCheck(dm, { ability: "wisdom", dc: 12 });
    expect(result.success).toBe(true);
    expect(result.data!.overallSuccess).toBeDefined();
  });

  test("handleRequestGroupCheck rejects invalid ability name", () => {
    const result = handleRequestGroupCheck(dm, { ability: "reflex", dc: 12 });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid ability");
  });

  test("handleRequestContestedCheck accepts long-form ability names", () => {
    const char1 = getCharacterForUser(players[0])!;
    const char2 = getCharacterForUser(players[1])!;
    const result = handleRequestContestedCheck(dm, {
      player_id_1: char1.id, ability_1: "strength",
      player_id_2: char2.id, ability_2: "dexterity",
    });
    expect(result.success).toBe(true);
    expect(result.data!.winner).toBeDefined();
  });

  test("handleRequestContestedCheck rejects invalid ability name", () => {
    const char1 = getCharacterForUser(players[0])!;
    const char2 = getCharacterForUser(players[1])!;
    const result = handleRequestContestedCheck(dm, {
      player_id_1: char1.id, ability_1: "power",
      player_id_2: char2.id, ability_2: "str",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid ability");
  });
});

// ==================== G. Advance Scene ====================

describe("G. Advance Scene", () => {
  let players: string[];
  let dm: string;

  test("setup: create party and spawn encounter", async () => {
    const setup = await setupParty("advance");
    players = setup.players;
    dm = setup.dm;
    const spawn = handleSpawnEncounter(dm, { monsters: [{ template_name: "Goblin", count: 1 }] });
    expect(spawn.success).toBe(true);
  });

  test("advance scene exits combat but reports no movement without room_id", () => {
    const result = handleAdvanceScene(dm, {});
    expect(result.success).toBe(true);
    expect(result.data!.advanced).toBe(false);
    expect(result.data!.message).toContain("next_room_id");
    const party = getPartyForUser(players[0])!;
    expect(party.session!.phase).toBe("exploration");
  });

  test("advance scene with valid room_id moves the party", () => {
    // First get available exits
    const probe = handleAdvanceScene(dm, {});
    expect(probe.success).toBe(true);
    const exits = probe.data!.exits as { name: string; id: string }[];
    expect(exits.length).toBeGreaterThan(0);
    const targetId = exits[0].id;

    // Now advance with the room id
    const result = handleAdvanceScene(dm, { next_room_id: targetId });
    expect(result.success).toBe(true);
    expect(result.data!.advanced).toBe(true);
    expect(result.data!.room).toBeTruthy();

    // Verify party is now in the new room
    const party = getPartyForUser(players[0])!;
    expect(party.dungeonState!.currentRoomId).toBe(targetId);
  });

  test("advance scene with invalid room returns error about not connected", () => {
    const result = handleAdvanceScene(dm, { next_room_id: "nonexistent-room" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not connected");
  });

  test("advance scene for non-DM fails", () => {
    const result = handleAdvanceScene(players[0], {});
    expect(result.success).toBe(false);
    expect(result.error).toContain("Not a DM");
  });

  test("advance scene for DM with no party returns proper error", () => {
    const result = handleAdvanceScene("random-dm-no-party", {});
    expect(result.success).toBe(false);
    expect(result.error).toBe("Not a DM for any party.");
  });
});

// ==================== H. Information Handlers ====================

describe("H. Information Handlers", () => {
  let players: string[];
  let dm: string;

  test("setup: create party", async () => {
    const setup = await setupParty("info");
    players = setup.players;
    dm = setup.dm;
  });

  test("handleGetAvailableActions in exploration", () => {
    const result = handleGetAvailableActions(players[0]);
    expect(result.success).toBe(true);
    expect(result.data!.phase).toBe("exploration");
    expect(result.data!.availableActions).toBeDefined();
    expect((result.data!.availableActions as string[])).toContain("look");
  });

  test("handleGetAvailableActions in combat returns isYourTurn", () => {
    handleSpawnEncounter(dm, { monsters: [{ template_name: "Goblin", count: 1 }] });
    const result = handleGetAvailableActions(players[0]);
    expect(result.success).toBe(true);
    expect(result.data!.phase).toBe("combat");
    expect(typeof result.data!.isYourTurn).toBe("boolean");
  });

  test("handleGetAvailableActions returns idle phase for player not in session", async () => {
    const loneUserId = "actions-no-session";
    await handleCreateCharacter(loneUserId, {
      name: "IdleHero",
      race: "human",
      class: "fighter" as any,
      ability_scores: scores,
      avatar_url: "https://example.com/test-avatar.png",
    });
    const result = handleGetAvailableActions(loneUserId);
    expect(result.success).toBe(true);
    expect(result.data!.phase).toBe("idle");
    expect(result.data!.isYourTurn).toBe(false);
    expect(result.data!.availableActions).toEqual(["queue", "get_status", "get_inventory"]);
  });

  test("handleGetStatus returns character stats", () => {
    const result = handleGetStatus(players[0]);
    expect(result.success).toBe(true);
    expect(result.data!.name).toBeDefined();
    expect(result.data!.hp).toBeDefined();
    expect(result.data!.ac).toBeDefined();
    expect(result.data!.level).toBeDefined();
    expect(result.data!.class).toBeDefined();
  });

  test("handleGetParty returns party members", () => {
    const result = handleGetParty(players[0]);
    expect(result.success).toBe(true);
    expect(result.data!.members).toBeDefined();
    expect((result.data!.members as unknown[]).length).toBe(4);
  });

  test("handleGetParty includes non-null id for every member", () => {
    const result = handleGetParty(players[0]);
    expect(result.success).toBe(true);
    const members = result.data!.members as { id: string; name: string }[];
    expect(members.length).toBeGreaterThan(0);
    for (const m of members) {
      expect(m.id).toBeDefined();
      expect(m.id).not.toBeNull();
      expect(typeof m.id).toBe("string");
      expect(m.id.length).toBeGreaterThan(0);
    }
  });

  test("handleGetPartyState (DM) returns member details", () => {
    const result = handleGetPartyState(dm);
    expect(result.success).toBe(true);
    expect(result.data!.members).toBeDefined();
    const members = result.data!.members as { id: string; hp: { current: number; max: number } }[];
    expect(members.length).toBe(4);
    expect(members[0].hp).toBeDefined();
  });

  test("handleGetPartyState fails for player", () => {
    const result = handleGetPartyState(players[0]);
    expect(result.success).toBe(false);
  });

  test("handleGetPartyState includes combat state during combat", async () => {
    const setup = await setupParty("party-state-combat");
    const spawn = handleSpawnEncounter(setup.dm, { monsters: [{ template_name: "Goblin", count: 1 }] });
    expect(spawn.success).toBe(true);

    const result = handleGetPartyState(setup.dm);
    expect(result.success).toBe(true);
    expect(result.data!.phase).toBe("combat");
    expect(result.data!.currentTurn).toBeDefined();
    expect(result.data!.currentTurn).not.toBeNull();
    const turn = result.data!.currentTurn as { name: string; type: string; entityId: string };
    expect(turn.name).toBeDefined();
    expect(turn.type).toMatch(/^(player|monster)$/);
    expect(turn.entityId).toBeDefined();

    expect(result.data!.initiative).toBeDefined();
    const initiative = result.data!.initiative as { entityId: string; name: string; type: string; initiative: number }[];
    expect(initiative.length).toBeGreaterThan(0);
    for (const slot of initiative) {
      expect(slot.entityId).toBeDefined();
      expect(slot.name).toBeDefined();
      expect(slot.type).toMatch(/^(player|monster)$/);
      expect(typeof slot.initiative).toBe("number");
    }
  });

  test("handleGetRoomState (DM) returns room info or no dungeon", () => {
    const result = handleGetRoomState(dm);
    expect(result.success).toBe(true);
    // Without a loaded dungeon template, this returns "No dungeon loaded"
    if (!result.data!.room) {
      expect(result.data!.message).toContain("No dungeon loaded");
    }
  });

  test("handleLook returns location info", () => {
    const result = handleLook(players[0]);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  test("handleGetInventory returns equipment and inventory", () => {
    const result = handleGetInventory(players[0]);
    expect(result.success).toBe(true);
    expect(result.data!.equipment).toBeDefined();
    expect(result.data!.inventory).toBeDefined();
  });

  test("all info handlers fail for unknown user (except actions which returns idle)", () => {
    const actionsResult = handleGetAvailableActions("unknown-info");
    expect(actionsResult.success).toBe(true);
    expect(actionsResult.data!.phase).toBe("idle");
    expect(actionsResult.data!.availableActions).toEqual(["create_character"]);
    expect(handleGetStatus("unknown-info").success).toBe(false);
    expect(handleGetParty("unknown-info").success).toBe(false);
    expect(handleGetInventory("unknown-info").success).toBe(false);
  });
});

// ==================== I. Communication ====================

describe("I. Communication", () => {
  let players: string[];
  let dm: string;

  test("setup: create party", async () => {
    const setup = await setupParty("comms");
    players = setup.players;
    dm = setup.dm;
  });

  test("handlePartyChat succeeds", () => {
    const result = handlePartyChat(players[0], { message: "Hello team!" });
    expect(result.success).toBe(true);
    expect(result.data!.speaker).toBeDefined();
    expect(result.data!.message).toBe("Hello team!");
  });

  test("handlePartyChat fails without party membership", async () => {
    const loneUserId = "comms-chat-loner";
    await handleCreateCharacter(loneUserId, {
      name: "ChatLoner",
      race: "human",
      class: "fighter" as any,
      ability_scores: scores,
      avatar_url: "https://example.com/test-avatar.png",
    });
    const result = handlePartyChat(loneUserId, { message: "hello?" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Not in a party.");
  });

  test("handleWhisper succeeds", () => {
    const char2 = getCharacterForUser(players[1])!;
    const result = handleWhisper(players[0], { player_id: char2.id, message: "Secret" });
    expect(result.success).toBe(true);
    expect(result.data!.from).toBeDefined();
    expect(result.data!.to).toBe(char2.name);
    expect(result.data!.message).toBe("Secret");
  });

  test("handleWhisper fails without party membership", async () => {
    const loneUserId = "comms-loner";
    await handleCreateCharacter(loneUserId, {
      name: "LoneWolf",
      race: "human",
      class: "fighter" as any,
      ability_scores: scores,
      avatar_url: "https://example.com/test-avatar.png",
    });
    const result = handleWhisper(loneUserId, { player_id: players[0], message: "psst" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Not in a party.");
  });

  test("handleWhisper fails when target not in same party", async () => {
    const otherSetup = await setupParty("comms-other");
    const otherChar = getCharacterForUser(otherSetup.players[0])!;
    const result = handleWhisper(players[0], { player_id: otherChar.id, message: "hey" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("Target not in your party.");
  });

  test("handleWhisper fails when whispering to self", () => {
    const char1 = getCharacterForUser(players[0])!;
    const result = handleWhisper(players[0], { player_id: char1.id, message: "talking to myself" });
    expect(result.success).toBe(false);
    expect(result.error).toBe("You cannot whisper to yourself.");
  });

  test("handleWhisper resolves target by character name", () => {
    const char2 = getCharacterForUser(players[1])!;
    const result = handleWhisper(players[0], { player_id: char2.name, message: "Hey by name" });
    expect(result.success).toBe(true);
    expect(result.data!.to).toBe(char2.name);
    expect(result.data!.message).toBe("Hey by name");
  });

  test("handleWhisper resolves target by name case-insensitively", () => {
    const char2 = getCharacterForUser(players[1])!;
    const result = handleWhisper(players[0], { player_id: char2.name.toUpperCase(), message: "case test" });
    expect(result.success).toBe(true);
    expect(result.data!.to).toBe(char2.name);
  });

  test("handleWhisper fails gracefully when player_id is missing", () => {
    const result = handleWhisper(players[0], { player_id: undefined as unknown as string, message: "hello" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Missing player_id");
  });

  test("handleWhisper fails gracefully when message is missing", () => {
    const char2 = getCharacterForUser(players[1])!;
    const result = handleWhisper(players[0], { player_id: char2.id, message: undefined as unknown as string });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Missing message");
  });

  test("handleNarrate (DM) succeeds", () => {
    const result = handleNarrate(dm, { text: "The dungeon grows dark." });
    expect(result.success).toBe(true);
    expect(result.data!.narrated).toBe(true);
    expect(result.data!.text).toBe("The dungeon grows dark.");
  });

  test("handleNarrate stores text in event log (not undefined)", () => {
    const narrationText = "B030_CANARY: Two hobgoblins emerge from the shadows.";
    const result = handleNarrate(dm, { text: narrationText });
    expect(result.success).toBe(true);

    // Access party via a player (DM has no character, so getPartyForUser(dm) is null)
    const party = getPartyForUser(players[0])!;
    const narrationEvents = party.events.filter((e) => e.type === "narration");
    const lastNarration = narrationEvents[narrationEvents.length - 1];
    expect(lastNarration).toBeDefined();
    expect(lastNarration.data.text).toBe(narrationText);
    expect(lastNarration.data.text).not.toBe("undefined");
    expect(lastNarration.data.text).not.toBeUndefined();
  });

  test("handleNarrateTo (DM) succeeds", () => {
    const char = getCharacterForUser(players[0])!;
    const result = handleNarrateTo(dm, { player_id: char.id, text: "You hear a whisper." });
    expect(result.success).toBe(true);
    expect(result.data!.narrated).toBe(true);
  });

  test("handleDMJournal (DM) succeeds", () => {
    const result = handleDMJournal(dm, { entry: "Players explored the corridor." });
    expect(result.success).toBe(true);
    expect(result.data!.entry).toBe("Players explored the corridor.");
  });

  test("handleJournalAdd (player) succeeds", () => {
    const result = handleJournalAdd(players[0], { entry: "I found a strange rune." });
    expect(result.success).toBe(true);
    expect(result.data!.entry).toBe("I found a strange rune.");
    expect(result.data!.character).toBeDefined();
  });

  test("communication handlers fail for unknown user", () => {
    expect(handlePartyChat("unknown-comms", { message: "hi" }).success).toBe(false);
    expect(handleWhisper("unknown-comms", { player_id: "x", message: "hi" }).success).toBe(false);
    expect(handleNarrate("unknown-comms", { text: "hi" }).success).toBe(false);
    expect(handleNarrateTo("unknown-comms", { player_id: "x", text: "hi" }).success).toBe(false);
    expect(handleDMJournal("unknown-comms", { entry: "hi" }).success).toBe(false);
    expect(handleJournalAdd("unknown-comms", { entry: "hi" }).success).toBe(false);
  });
});

// ==================== J. Move ====================

describe("J. Move", () => {
  let players: string[];
  let dm: string;

  test("setup: create party", async () => {
    const setup = await setupParty("movt");
    players = setup.players;
    dm = setup.dm;
  });

  test("handleMove with invalid direction fails", () => {
    const result = handleMove(players[0], { direction_or_target: "nonexistent-direction-xyz" });
    expect(result.success).toBe(false);
    // Either "Not in a dungeon" or "Cannot move to" — both valid
    expect(result.error).toBeDefined();
  });

  test("handleMove fails for unknown user", () => {
    expect(handleMove("unknown-movt", { direction_or_target: "north" }).success).toBe(false);
  });

  test("handleMove to current room returns already-here message", () => {
    const party = getPartyForUser(players[0]);
    if (!party?.dungeonState) return; // skip if no dungeon

    // Get current room name
    const roomState = handleGetRoomState(dm);
    if (!roomState.success || !roomState.data?.room) return;
    const currentRoomName = (roomState.data.room as { name: string }).name;

    // Try to move to the room we're already in
    const result = handleMove(players[0], { direction_or_target: currentRoomName });
    expect(result.success).toBe(true);
    expect(result.data!.moved).toBe(false);
    expect(result.data!.message).toContain("already in");
  });

  test("handleMove to current room by second player after first player moved", () => {
    const party = getPartyForUser(players[0]);
    if (!party?.dungeonState) return;

    const roomState = handleGetRoomState(dm);
    if (!roomState.success || !roomState.data?.exits) return;
    const exits = roomState.data.exits as { name: string; id: string }[];
    if (exits.length === 0) return;

    // Player 1 moves to first exit
    const moveResult = handleMove(players[0], { direction_or_target: exits[0].id });
    if (!moveResult.success) return;

    // Player 2 tries to move to same room — should get "already here"
    const result = handleMove(players[1], { direction_or_target: exits[0].name });
    expect(result.success).toBe(true);
    expect(result.data!.moved).toBe(false);
    expect(result.data!.message).toContain("already in");
  });
});
