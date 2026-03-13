import { describe, test, expect } from "bun:test";
import { formatActivityEvent } from "../src/api/spectator.ts";

describe("formatActivityEvent", () => {
  // --- attack ---
  test("attack critical hit", () => {
    const msg = formatActivityEvent("attack", {
      attackerName: "Valeria",
      targetName: "Goblin Warchief",
      hit: true,
      critical: true,
      damage: 18,
    });
    expect(msg).toContain("Valeria");
    expect(msg).toContain("critical hit");
    expect(msg).toContain("Goblin Warchief");
    expect(msg).toContain("18 damage");
  });

  test("attack normal hit", () => {
    const msg = formatActivityEvent("attack", {
      attackerName: "Brog",
      targetName: "Skeleton",
      hit: true,
      damage: 8,
    });
    expect(msg).toContain("Brog");
    expect(msg).toContain("hit");
    expect(msg).toContain("Skeleton");
    expect(msg).toContain("8 damage");
  });

  test("attack miss", () => {
    const msg = formatActivityEvent("attack", {
      attackerName: "Brog",
      targetName: "Skeleton",
      hit: false,
    });
    expect(msg).toContain("Skeleton");
    expect(msg).toContain("dodged");
  });

  test("attack missing names returns null", () => {
    expect(formatActivityEvent("attack", {})).toBeNull();
    expect(formatActivityEvent("attack", { attackerName: "Brog" })).toBeNull();
  });

  // --- monster_attack ---
  test("monster_attack hit", () => {
    const msg = formatActivityEvent("monster_attack", {
      attackerName: "Dragon",
      targetName: "Wren",
      hit: true,
      damage: 15,
    });
    expect(msg).toContain("Dragon");
    expect(msg).toContain("struck");
    expect(msg).toContain("Wren");
    expect(msg).toContain("15 damage");
  });

  test("monster_attack miss", () => {
    const msg = formatActivityEvent("monster_attack", {
      attackerName: "Goblin",
      targetName: "Brog",
      hit: false,
    });
    expect(msg).toContain("Brog");
    expect(msg).toContain("evaded");
  });

  // --- spell_cast ---
  test("spell_cast with target", () => {
    const msg = formatActivityEvent("spell_cast", {
      casterName: "Aria",
      spellName: "Fire Bolt",
      targetName: "Skeleton",
    });
    expect(msg).toContain("Aria");
    expect(msg).toContain("Fire Bolt");
    expect(msg).toContain("Skeleton");
  });

  test("spell_cast without target", () => {
    const msg = formatActivityEvent("spell_cast", {
      casterName: "Aria",
      spellName: "Shield",
    });
    expect(msg).toContain("Aria");
    expect(msg).toContain("Shield");
    expect(msg).not.toContain("on ");
  });

  test("spell_cast missing data returns null", () => {
    expect(formatActivityEvent("spell_cast", {})).toBeNull();
    expect(formatActivityEvent("spell_cast", { casterName: "Aria" })).toBeNull();
  });

  // --- heal ---
  test("heal event", () => {
    const msg = formatActivityEvent("heal", {
      healerName: "Dolgrim",
      targetName: "Brog",
      amount: 12,
    });
    expect(msg).toContain("Dolgrim");
    expect(msg).toContain("healed");
    expect(msg).toContain("Brog");
    expect(msg).toContain("12 HP");
  });

  test("heal missing names returns null", () => {
    expect(formatActivityEvent("heal", {})).toBeNull();
  });

  // --- death ---
  test("death event", () => {
    const msg = formatActivityEvent("death", { characterName: "Thane" });
    expect(msg).toContain("Thane");
    expect(msg).toContain("fallen");
  });

  test("death missing name returns null", () => {
    expect(formatActivityEvent("death", {})).toBeNull();
  });

  // --- death_save ---
  test("death_save success", () => {
    const msg = formatActivityEvent("death_save", {
      characterName: "Brog",
      success: true,
    });
    expect(msg).toContain("Brog");
    expect(msg).toContain("passed");
  });

  test("death_save failure", () => {
    const msg = formatActivityEvent("death_save", {
      characterName: "Brog",
      success: false,
    });
    expect(msg).toContain("Brog");
    expect(msg).toContain("failed");
  });

  test("death_save nat20 revival", () => {
    const msg = formatActivityEvent("death_save", {
      characterName: "Brog",
      nat20: true,
      success: true,
    });
    expect(msg).toContain("nat 20");
    expect(msg).toContain("revived");
  });

  test("death_save uses name field as fallback", () => {
    const msg = formatActivityEvent("death_save", {
      name: "Wren",
      success: true,
    });
    expect(msg).toContain("Wren");
  });

  // --- combat_start ---
  test("combat_start", () => {
    const msg = formatActivityEvent("combat_start", {});
    expect(msg).toContain("Combat");
    expect(msg).toContain("begun");
  });

  // --- combat_end ---
  test("combat_end with XP", () => {
    const msg = formatActivityEvent("combat_end", { xpAwarded: 200 });
    expect(msg).toContain("200 XP");
  });

  test("combat_end party wipe", () => {
    const msg = formatActivityEvent("combat_end", { reason: "all_players_dead" });
    expect(msg).toContain("defeated");
  });

  test("combat_end generic", () => {
    const msg = formatActivityEvent("combat_end", {});
    expect(msg).toContain("ended");
  });

  // --- level_up ---
  test("level_up", () => {
    const msg = formatActivityEvent("level_up", {
      characterName: "Wren",
      newLevel: 3,
    });
    expect(msg).toContain("Wren");
    expect(msg).toContain("leveled up");
    expect(msg).toContain("level 3");
  });

  test("level_up missing name returns null", () => {
    expect(formatActivityEvent("level_up", {})).toBeNull();
  });

  // --- room_enter ---
  test("room_enter", () => {
    const msg = formatActivityEvent("room_enter", { roomName: "Dark Hallway" });
    expect(msg).toContain("Dark Hallway");
  });

  test("room_enter missing name returns null", () => {
    expect(formatActivityEvent("room_enter", {})).toBeNull();
  });

  // --- loot ---
  test("loot event", () => {
    const msg = formatActivityEvent("loot", {
      characterName: "Wren",
      itemName: "Longsword",
    });
    expect(msg).toContain("Wren");
    expect(msg).toContain("Longsword");
  });

  test("loot missing data returns null", () => {
    expect(formatActivityEvent("loot", {})).toBeNull();
    expect(formatActivityEvent("loot", { characterName: "Wren" })).toBeNull();
  });

  // --- rest ---
  test("rest event", () => {
    const msg = formatActivityEvent("rest", { restType: "long" });
    expect(msg).toContain("long rest");
  });

  test("rest defaults to short", () => {
    const msg = formatActivityEvent("rest", {});
    expect(msg).toContain("short rest");
  });

  // --- ability_check ---
  test("ability_check success", () => {
    const msg = formatActivityEvent("ability_check", {
      characterName: "Wren",
      skill: "Stealth",
      success: true,
    });
    expect(msg).toContain("Wren");
    expect(msg).toContain("passed");
    expect(msg).toContain("Stealth");
  });

  test("ability_check failure", () => {
    const msg = formatActivityEvent("ability_check", {
      characterName: "Brog",
      skill: "Perception",
      success: false,
    });
    expect(msg).toContain("Brog");
    expect(msg).toContain("failed");
    expect(msg).toContain("Perception");
  });

  test("ability_check missing data returns null", () => {
    expect(formatActivityEvent("ability_check", {})).toBeNull();
  });

  // --- narration ---
  test("narration event", () => {
    const msg = formatActivityEvent("narration", {
      text: "The torchlight flickers ominously.",
    });
    expect(msg).toContain("torchlight flickers");
  });

  test("narration truncates long text", () => {
    const longText = "A".repeat(150);
    const msg = formatActivityEvent("narration", { text: longText });
    expect(msg!.length).toBeLessThan(110);
    expect(msg).toContain("...");
  });

  test("narration missing text returns null", () => {
    expect(formatActivityEvent("narration", {})).toBeNull();
  });

  // --- unknown type ---
  test("unknown event type returns null", () => {
    expect(formatActivityEvent("chat", { message: "hello" })).toBeNull();
    expect(formatActivityEvent("whisper", { from: "A", to: "B" })).toBeNull();
  });
});
