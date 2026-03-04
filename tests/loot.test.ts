import { describe, test, expect, beforeAll } from "bun:test";
import {
  initGameData,
  getItemDef,
  getAllItems,
  getItemsByCategory,
  loadItemDef,
  loadMonsterTemplate,
  loadSpellDef,
  handleCreateCharacter,
  handleGetInventory,
  handleUseItem,
  handleAwardLoot,
  handleEquipItem,
  handleUnequipItem,
  handleListItems,
  getCharacterForUser,
  type ItemDef,
} from "../src/game/game-manager.ts";
import { rollLootTable, type LootTableEntry } from "../src/engine/loot.ts";
import type { AbilityScores } from "../src/types.ts";

// --- Item Loading ---

describe("item loading", () => {
  test("itemDefs map is populated from items.yaml", () => {
    const all = getAllItems();
    expect(all.length).toBeGreaterThan(0);
  });

  test("getItemDef returns correct weapon data", () => {
    const dagger = getItemDef("Dagger");
    expect(dagger).toBeDefined();
    expect(dagger!.category).toBe("weapon");
    expect(dagger!.damage).toBe("1d4");
    expect(dagger!.damageType).toBe("piercing");
    expect(dagger!.properties).toContain("finesse");
  });

  test("getItemDef returns correct armor data", () => {
    const leather = getItemDef("Leather Armor");
    expect(leather).toBeDefined();
    expect(leather!.category).toBe("armor");
    expect(leather!.acBase).toBe(11);
    expect(leather!.acDexCap).toBe(99);
    expect(leather!.armorType).toBe("light");
  });

  test("getItemDef returns correct potion data", () => {
    const potion = getItemDef("Potion of Healing");
    expect(potion).toBeDefined();
    expect(potion!.category).toBe("potion");
    expect(potion!.healAmount).toBe("2d4+2");
  });

  test("getItemsByCategory filters correctly", () => {
    const weapons = getItemsByCategory("weapon");
    expect(weapons.length).toBeGreaterThan(0);
    for (const w of weapons) {
      expect(w.category).toBe("weapon");
    }

    const potions = getItemsByCategory("potion");
    expect(potions.length).toBe(2); // Healing + Greater Healing
    for (const p of potions) {
      expect(p.category).toBe("potion");
    }
  });

  test("getItemDef returns magic weapon with baseWeapon", () => {
    const magicSword = getItemDef("+1 Longsword");
    expect(magicSword).toBeDefined();
    expect(magicSword!.category).toBe("magic_item");
    expect(magicSword!.baseWeapon).toBe("Longsword");
    expect(magicSword!.magicBonus).toBe(1);
  });

  test("getItemDef returns scroll with spellName", () => {
    const scroll = getItemDef("Scroll of Magic Missile");
    expect(scroll).toBeDefined();
    expect(scroll!.category).toBe("scroll");
    expect(scroll!.spellName).toBe("Magic Missile");
  });
});

// --- handleListItems ---

describe("handleListItems", () => {
  test("returns all items when no category specified", () => {
    const result = handleListItems("dm-1", {});
    expect(result.success).toBe(true);
    expect((result.data!.items as unknown[]).length).toBeGreaterThan(0);
  });

  test("filters by category", () => {
    const result = handleListItems("dm-1", { category: "potion" });
    expect(result.success).toBe(true);
    const items = result.data!.items as { name: string; category: string }[];
    expect(items.length).toBe(2);
    for (const item of items) {
      expect(item.category).toBe("potion");
    }
  });
});

// --- handleAwardLoot validation ---

describe("handleAwardLoot validation", () => {
  const scores: AbilityScores = { str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 15 };

  test("rejects unknown items", () => {
    // Create a character for this test
    const createResult = handleCreateCharacter("loot-test-user-1", {
      name: "LootTester",
      race: "human",
      class: "fighter",
      ability_scores: scores,
    });
    expect(createResult.success).toBe(true);

    const result = handleAwardLoot("dm-1", {
      player_id: createResult.character!.id,
      item_id: "Nonexistent Magic Sword",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown item");
  });

  test("accepts valid items", () => {
    const char = getCharacterForUser("loot-test-user-1");
    const result = handleAwardLoot("dm-1", {
      player_id: char!.id,
      item_id: "Potion of Healing",
    });
    expect(result.success).toBe(true);
    expect(result.data!.item).toBe("Potion of Healing");
  });
});

// --- handleUseItem data-driven ---

describe("handleUseItem data-driven", () => {
  const scores: AbilityScores = { str: 14, dex: 14, con: 12, int: 10, wis: 8, cha: 10 };

  test("Potion of Healing heals via data lookup", () => {
    const createResult = handleCreateCharacter("use-item-user-1", {
      name: "PotionUser",
      race: "human",
      class: "fighter",
      ability_scores: scores,
    });
    expect(createResult.success).toBe(true);
    const char = createResult.character!;

    // Give the character a potion and deal damage
    handleAwardLoot("dm-1", { player_id: char.id, item_id: "Potion of Healing" });
    const liveChar = getCharacterForUser("use-item-user-1")!;
    liveChar.hpCurrent = 5; // take damage

    const result = handleUseItem("use-item-user-1", { item_id: "Potion of Healing" });
    expect(result.success).toBe(true);
    expect(result.data!.healed).toBeDefined();
    expect(result.data!.healed as number).toBeGreaterThanOrEqual(4); // min 2d4+2 = 4
    expect(result.data!.healed as number).toBeLessThanOrEqual(10); // max 2d4+2 = 10
  });

  test("Potion of Greater Healing heals via data lookup", () => {
    const char = getCharacterForUser("use-item-user-1")!;
    handleAwardLoot("dm-1", { player_id: char.id, item_id: "Potion of Greater Healing" });
    char.hpCurrent = 3;

    const result = handleUseItem("use-item-user-1", { item_id: "Potion of Greater Healing" });
    expect(result.success).toBe(true);
    expect(result.data!.healed as number).toBeGreaterThanOrEqual(8); // min 4d4+4 = 8
    expect(result.data!.healed as number).toBeLessThanOrEqual(20); // max 4d4+4 = 20
  });

  test("using non-existent item returns error", () => {
    const result = handleUseItem("use-item-user-1", { item_id: "Invisible Sword" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found in inventory");
  });
});

// --- Equipment swapping ---

describe("equipment swapping", () => {
  const scores: AbilityScores = { str: 16, dex: 14, con: 12, int: 10, wis: 8, cha: 10 };

  test("equip weapon: moves old weapon to inventory, updates equipment", () => {
    const createResult = handleCreateCharacter("equip-user-1", {
      name: "Equipper",
      race: "human",
      class: "fighter",
      ability_scores: scores,
    });
    expect(createResult.success).toBe(true);
    const char = getCharacterForUser("equip-user-1")!;
    const oldWeapon = char.equipment.weapon;

    // Give the character a Greatsword
    handleAwardLoot("dm-1", { player_id: char.id, item_id: "Greatsword" });

    const result = handleEquipItem("equip-user-1", { item_name: "Greatsword" });
    expect(result.success).toBe(true);
    expect(result.data!.slot).toBe("weapon");
    expect(char.equipment.weapon).toBe("Greatsword");

    // Old weapon should be in inventory
    if (oldWeapon) {
      expect(char.inventory).toContain(oldWeapon);
    }
    // Greatsword should NOT be in inventory anymore
    expect(char.inventory).not.toContain("Greatsword");
  });

  test("equip armor: recalculates AC", () => {
    const char = getCharacterForUser("equip-user-1")!;

    // Give leather armor
    handleAwardLoot("dm-1", { player_id: char.id, item_id: "Leather Armor" });
    const acBefore = char.ac;

    const result = handleEquipItem("equip-user-1", { item_name: "Leather Armor" });
    expect(result.success).toBe(true);
    expect(result.data!.slot).toBe("armor");
    expect(char.equipment.armor).toBe("Leather Armor");
    // AC should be recalculated (Leather = 11 + DEX mod 2 = 13, + shield if any)
    expect(result.data!.ac).toBeDefined();
  });

  test("unequip weapon: moves to inventory, slot becomes null", () => {
    const result = handleUnequipItem("equip-user-1", { slot: "weapon" });
    expect(result.success).toBe(true);

    const char = getCharacterForUser("equip-user-1")!;
    expect(char.equipment.weapon).toBeNull();
    expect(result.data!.unequipped).toBeDefined();
    expect(char.inventory).toContain(result.data!.unequipped as string);
  });

  test("equip item not in inventory returns error", () => {
    const result = handleEquipItem("equip-user-1", { item_name: "Phantom Blade" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("not found in inventory");
  });

  test("unequip empty slot returns error", () => {
    // weapon slot is now null from the previous test
    const result = handleUnequipItem("equip-user-1", { slot: "weapon" });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Nothing equipped");
  });
});

// --- handleGetInventory with details ---

describe("handleGetInventory with details", () => {
  test("returns item details for known items", () => {
    const char = getCharacterForUser("equip-user-1")!;
    // Character should have items in inventory from equip tests
    handleAwardLoot("dm-1", { player_id: char.id, item_id: "Potion of Healing" });

    const result = handleGetInventory("equip-user-1");
    expect(result.success).toBe(true);

    const inventory = result.data!.inventory as { name: string; category?: string }[];
    const potion = inventory.find((i) => i.name === "Potion of Healing");
    expect(potion).toBeDefined();
    expect(potion!.category).toBe("potion");
  });
});

// --- Loot tables ---

describe("loot tables", () => {
  test("rollLootTable returns items from weighted entries", () => {
    const entries: LootTableEntry[] = [
      { itemName: "Gold Coins", weight: 4, quantity: 1 },
      { itemName: "Dagger", weight: 2, quantity: 1 },
      { itemName: "Shortbow", weight: 1, quantity: 1 },
    ];

    // Use a deterministic random function
    const result = rollLootTable(entries, () => 1); // always roll 1 → first entry
    expect(result.items.length).toBe(1);
    expect(result.items[0]!.itemName).toBe("Gold Coins");
  });

  test("rollLootTable with high roll selects later entries", () => {
    const entries: LootTableEntry[] = [
      { itemName: "Gold Coins", weight: 2, quantity: 1 },
      { itemName: "Dagger", weight: 2, quantity: 1 },
      { itemName: "Shortbow", weight: 1, quantity: 1 },
    ];

    // Roll 5 on d5 → cumulative: Gold=2, Dagger=4, Shortbow=5 → Shortbow
    const result = rollLootTable(entries, () => 5);
    expect(result.items[0]!.itemName).toBe("Shortbow");
  });

  test("rollLootTable with empty entries returns nothing", () => {
    const result = rollLootTable([]);
    expect(result.items.length).toBe(0);
  });
});
