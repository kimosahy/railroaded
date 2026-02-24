/**
 * Database seeder: load YAML data files into PostgreSQL.
 */

import { readFileSync } from "fs";
import YAML from "yaml";
import { db } from "./connection.ts";
import {
  monsterTemplates,
  itemTemplates,
  campaignTemplates,
  rooms,
  roomConnections,
  encounterTemplates,
  lootTables,
  npcTemplates,
} from "./schema.ts";

interface MonsterYAML {
  name: string;
  challenge_rating: number;
  xp_value: number;
  hp_max: number;
  ac: number;
  ability_scores: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
  attacks: { name: string; to_hit: number; damage: string; type: string }[];
  special_abilities: string[];
}

interface ItemWeaponYAML {
  name: string;
  damage: string;
  damage_type: string;
  properties: string[];
  description: string;
}

interface ItemArmorYAML {
  name: string;
  ac_base: number;
  ac_dex_cap: number | null;
  type: string;
  description: string;
}

interface ItemPotionYAML {
  name: string;
  heal_amount: string;
  description: string;
}

interface ItemScrollYAML {
  name: string;
  spell_name: string;
  description: string;
}

interface ItemMagicYAML {
  name: string;
  base_weapon?: string;
  type?: string;
  magic_bonus: number;
  description: string;
}

interface TemplateYAML {
  name: string;
  description: string;
  difficulty_tier: "starter" | "intermediate" | "advanced";
  estimated_sessions: number;
  story_hooks: string[];
  rooms: {
    id: string;
    name: string;
    description: string;
    type: "entry" | "corridor" | "chamber" | "boss" | "treasure" | "trap" | "rest";
    features: string[];
    suggested_encounter?: string;
    loot_table?: string;
  }[];
  encounters: {
    id: string;
    name: string;
    monsters: { template_name: string; count: number }[];
    difficulty: string;
  }[];
  loot_tables: {
    id: string;
    name: string;
    entries: { item_name: string; weight: number; quantity: number }[];
  }[];
  connections: {
    from: string;
    to: string;
    type: "door" | "passage" | "hidden" | "locked";
  }[];
  npcs: {
    name: string;
    description: string;
    dialogue: string[];
  }[];
}

async function seedMonsters() {
  console.log("Seeding monsters...");
  const raw = readFileSync("data/monsters.yaml", "utf-8");
  const monsters: MonsterYAML[] = YAML.parse(raw);

  for (const m of monsters) {
    await db.insert(monsterTemplates).values({
      name: m.name,
      hpMax: m.hp_max,
      ac: m.ac,
      abilityScores: m.ability_scores,
      attacks: m.attacks,
      specialAbilities: m.special_abilities,
      xpValue: m.xp_value,
      challengeRating: m.challenge_rating,
    }).onConflictDoNothing();
  }
  console.log(`  Seeded ${monsters.length} monsters`);
}

async function seedItems() {
  console.log("Seeding items...");
  const raw = readFileSync("data/items.yaml", "utf-8");
  const data = YAML.parse(raw) as {
    weapons: ItemWeaponYAML[];
    armor: ItemArmorYAML[];
    potions: ItemPotionYAML[];
    scrolls: ItemScrollYAML[];
    magic_items: ItemMagicYAML[];
    misc: { name: string; description: string }[];
  };

  let count = 0;

  for (const w of data.weapons) {
    await db.insert(itemTemplates).values({
      name: w.name,
      type: "weapon",
      damage: w.damage,
      damageType: w.damage_type,
      properties: w.properties,
      description: w.description,
    }).onConflictDoNothing();
    count++;
  }

  for (const a of data.armor) {
    await db.insert(itemTemplates).values({
      name: a.name,
      type: a.type === "shield" ? "shield" : "armor",
      subtype: a.type,
      acBase: a.ac_base,
      acDexCap: a.ac_dex_cap,
      description: a.description,
    }).onConflictDoNothing();
    count++;
  }

  for (const p of data.potions) {
    await db.insert(itemTemplates).values({
      name: p.name,
      type: "potion",
      healAmount: p.heal_amount,
      description: p.description,
    }).onConflictDoNothing();
    count++;
  }

  for (const s of data.scrolls) {
    await db.insert(itemTemplates).values({
      name: s.name,
      type: "scroll",
      spellName: s.spell_name,
      description: s.description,
    }).onConflictDoNothing();
    count++;
  }

  for (const m of data.magic_items) {
    await db.insert(itemTemplates).values({
      name: m.name,
      type: m.base_weapon ? "weapon" : (m.type ?? "misc"),
      isMagic: true,
      magicBonus: m.magic_bonus,
      description: m.description,
    }).onConflictDoNothing();
    count++;
  }

  for (const misc of data.misc) {
    await db.insert(itemTemplates).values({
      name: misc.name,
      type: "misc",
      description: misc.description,
    }).onConflictDoNothing();
    count++;
  }

  console.log(`  Seeded ${count} items`);
}

async function seedTemplate(filePath: string) {
  const raw = readFileSync(filePath, "utf-8");
  const t: TemplateYAML = YAML.parse(raw);

  // Create campaign template
  const [template] = await db.insert(campaignTemplates).values({
    name: t.name,
    description: t.description,
    difficultyTier: t.difficulty_tier,
    storyHooks: t.story_hooks,
    estimatedSessions: t.estimated_sessions,
  }).returning();

  if (!template) throw new Error(`Failed to insert template: ${t.name}`);

  // Map YAML room IDs to DB UUIDs
  const roomIdMap = new Map<string, string>();

  // Create rooms
  for (const r of t.rooms) {
    const [room] = await db.insert(rooms).values({
      campaignTemplateId: template.id,
      name: r.name,
      description: r.description,
      type: r.type,
      features: r.features,
    }).returning();
    if (room) roomIdMap.set(r.id, room.id);
  }

  // Create connections
  for (const c of t.connections) {
    const fromId = roomIdMap.get(c.from);
    const toId = roomIdMap.get(c.to);
    if (fromId && toId) {
      await db.insert(roomConnections).values({
        campaignTemplateId: template.id,
        fromRoomId: fromId,
        toRoomId: toId,
        type: c.type,
      });
    }
  }

  // Create encounters
  for (const e of t.encounters) {
    await db.insert(encounterTemplates).values({
      campaignTemplateId: template.id,
      name: e.name,
      monsters: e.monsters.map((m) => ({
        templateName: m.template_name,
        count: m.count,
      })),
      difficulty: e.difficulty,
    });
  }

  // Create loot tables
  for (const lt of t.loot_tables) {
    await db.insert(lootTables).values({
      campaignTemplateId: template.id,
      name: lt.name,
      entries: lt.entries.map((e) => ({
        itemName: e.item_name,
        weight: e.weight,
        quantity: e.quantity,
      })),
    });
  }

  // Create NPCs
  for (const npc of t.npcs) {
    await db.insert(npcTemplates).values({
      campaignTemplateId: template.id,
      name: npc.name,
      description: npc.description,
      dialogue: npc.dialogue,
    });
  }

  console.log(`  Seeded template: ${t.name} (${t.rooms.length} rooms)`);
}

async function seedTemplates() {
  console.log("Seeding campaign templates...");
  await seedTemplate("data/templates/goblin-warren.yaml");
  await seedTemplate("data/templates/crypt-of-whispers.yaml");
  await seedTemplate("data/templates/bandit-fortress.yaml");
}

async function main() {
  console.log("Starting database seed...\n");

  await seedMonsters();
  await seedItems();
  await seedTemplates();

  console.log("\nSeed complete!");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
