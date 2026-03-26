/**
 * Dungeon template loader — reads YAML files from data/templates/.
 *
 * Each template defines rooms, connections, encounters, loot tables, NPCs,
 * and story hooks. Templates are loaded once at startup and accessed by name.
 */

import { parse as parseYAML } from "yaml";
import { existsSync, readFileSync, readdirSync } from "fs";
import { join } from "path";
import type { RoomType, ConnectionType } from "../types.ts";
import type { LootTableEntry } from "../engine/loot.ts";

// --- Public types ---

export interface TemplateRoom {
  id: string;
  name: string;
  description: string;
  type: RoomType;
  features: string[];
  suggestedEncounter?: string;
  lootTable?: string;
}

export interface TemplateConnection {
  fromRoomId: string;
  toRoomId: string;
  type: ConnectionType;
}

export interface TemplateEncounter {
  id: string;
  name: string;
  monsters: { templateName: string; count: number }[];
  difficulty: string;
}

export interface TemplateLootTable {
  id: string;
  name: string;
  entries: LootTableEntry[];
}

export interface TemplateNPC {
  name: string;
  description: string;
  dialogue: string[];
  // ENA extensions (all optional for backward compat)
  disposition?: string;
  knowledge?: string[];
  goals?: string[];
  standingOrders?: string;
  relationships?: Record<string, string>;
}

export interface TemplateClock {
  name: string;
  description: string;
  turnsRemaining: number;
  visibility: "hidden" | "public";
  consequence: string;
}

export interface TemplateInfoItem {
  title: string;
  content: string;
  visibility: "hidden" | "available";
  source: string;
  freshnessTurns?: number;
}

export interface TemplateSecret {
  fact: string;
  surfaceCondition: string;
  dramaticWeight: "low" | "medium" | "high";
}

export interface TemplateConstraint {
  description: string;
  blocks: string;
  forces: string;
}

export interface DungeonTemplate {
  name: string;
  description: string;
  difficultyTier: string;
  estimatedSessions: number;
  storyHooks: string[];
  rooms: TemplateRoom[];
  connections: TemplateConnection[];
  encounters: TemplateEncounter[];
  lootTables: TemplateLootTable[];
  npcs: TemplateNPC[];
  entryRoomId: string;
  // ENA extensions
  clocks: TemplateClock[];
  infoItems: TemplateInfoItem[];
  secrets: TemplateSecret[];
  designedConstraints: TemplateConstraint[];
  narrativeHooks: string[];
}

// --- YAML shape ---

interface YAMLTemplate {
  name: string;
  description: string;
  difficulty_tier: string;
  estimated_sessions: number;
  story_hooks?: string[];
  rooms: {
    id: string;
    name: string;
    description: string;
    type: string;
    features: string[];
    suggested_encounter?: string;
    loot_table?: string;
  }[];
  connections: {
    from: string;
    to: string;
    type: string;
  }[];
  encounters?: {
    id: string;
    name: string;
    monsters: { template_name: string; count: number }[];
    difficulty: string;
  }[];
  loot_tables?: {
    id: string;
    name: string;
    entries: { item_name: string; weight: number; quantity: number }[];
  }[];
  npcs?: {
    name: string;
    description: string;
    dialogue: string[];
    disposition?: string;
    knowledge?: string[];
    goals?: string[];
    standing_orders?: string;
    relationships?: Record<string, string>;
  }[];
  clocks?: { name: string; description: string; turns_remaining: number; visibility?: string; consequence: string }[];
  info_items?: { title: string; content: string; visibility?: string; source?: string; freshness_turns?: number }[];
  secrets?: { fact: string; surface_condition: string; dramatic_weight?: string }[];
  designed_constraints?: { description: string; blocks: string; forces: string }[];
  narrative_hooks?: string[];
}

// --- In-memory store ---

const templates = new Map<string, DungeonTemplate>();

// --- Public API ---

export function getTemplate(name: string): DungeonTemplate | undefined {
  return templates.get(name);
}

export function listTemplates(): DungeonTemplate[] {
  return [...templates.values()];
}

export function getRandomTemplate(): DungeonTemplate | undefined {
  const all = listTemplates();
  if (all.length === 0) return undefined;
  return all[Math.floor(Math.random() * all.length)];
}

/** Load a single template programmatically (used by tests). */
export function loadTemplate(name: string, template: DungeonTemplate): void {
  templates.set(name, template);
}

// --- YAML parsing ---

function parseTemplate(raw: YAMLTemplate): DungeonTemplate {
  const rooms: TemplateRoom[] = raw.rooms.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description.trim(),
    type: r.type as RoomType,
    features: r.features ?? [],
    suggestedEncounter: r.suggested_encounter,
    lootTable: r.loot_table,
  }));

  const connections: TemplateConnection[] = raw.connections.map((c) => ({
    fromRoomId: c.from,
    toRoomId: c.to,
    type: c.type as ConnectionType,
  }));

  const encounters: TemplateEncounter[] = (raw.encounters ?? []).map((e) => ({
    id: e.id,
    name: e.name,
    monsters: e.monsters.map((m) => ({
      templateName: m.template_name,
      count: m.count,
    })),
    difficulty: e.difficulty,
  }));

  const lootTables: TemplateLootTable[] = (raw.loot_tables ?? []).map((lt) => ({
    id: lt.id,
    name: lt.name,
    entries: lt.entries.map((e) => ({
      itemName: e.item_name,
      weight: e.weight,
      quantity: e.quantity,
    })),
  }));

  const npcs: TemplateNPC[] = (raw.npcs ?? []).map((n) => ({
    name: n.name,
    description: n.description.trim(),
    dialogue: n.dialogue,
    disposition: n.disposition,
    knowledge: n.knowledge,
    goals: n.goals,
    standingOrders: n.standing_orders,
    relationships: n.relationships,
  }));

  const templateClocks: TemplateClock[] = (raw.clocks ?? []).map(c => ({
    name: c.name,
    description: c.description,
    turnsRemaining: c.turns_remaining,
    visibility: (c.visibility ?? "hidden") as "hidden" | "public",
    consequence: c.consequence,
  }));

  const templateInfoItems: TemplateInfoItem[] = (raw.info_items ?? []).map(i => ({
    title: i.title,
    content: i.content,
    visibility: (i.visibility ?? "hidden") as "hidden" | "available",
    source: i.source ?? "environment",
    freshnessTurns: i.freshness_turns,
  }));

  const secrets: TemplateSecret[] = (raw.secrets ?? []).map(s => ({
    fact: s.fact,
    surfaceCondition: s.surface_condition,
    dramaticWeight: (s.dramatic_weight ?? "medium") as "low" | "medium" | "high",
  }));

  const designedConstraints: TemplateConstraint[] = (raw.designed_constraints ?? []).map(dc => ({
    description: dc.description,
    blocks: dc.blocks,
    forces: dc.forces,
  }));

  // Entry room is the first room with type "entry", or just the first room
  const entryRoom = rooms.find((r) => r.type === "entry") ?? rooms[0];

  return {
    name: raw.name,
    description: raw.description.trim(),
    difficultyTier: raw.difficulty_tier,
    estimatedSessions: raw.estimated_sessions,
    storyHooks: raw.story_hooks ?? [],
    rooms,
    connections,
    encounters,
    lootTables,
    npcs,
    entryRoomId: entryRoom?.id ?? "",
    clocks: templateClocks,
    infoItems: templateInfoItems,
    secrets,
    designedConstraints,
    narrativeHooks: raw.narrative_hooks ?? raw.story_hooks ?? [],
  };
}

// --- Loader ---

function findTemplatesDir(): string {
  const candidates = [
    join(import.meta.dir, "../../data/templates"),
    join(process.cwd(), "data/templates"),
  ];
  for (const dir of candidates) {
    if (existsSync(dir)) return dir;
  }
  return candidates[0];
}

export function loadTemplatesFromDisk(dir?: string): number {
  const templatesDir = dir ?? findTemplatesDir();
  if (!existsSync(templatesDir)) {
    console.warn(`  Warning: Templates directory not found: ${templatesDir}`);
    return 0;
  }

  const files = readdirSync(templatesDir).filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"));
  let count = 0;

  for (const file of files) {
    try {
      const content = readFileSync(join(templatesDir, file), "utf-8");
      const raw = parseYAML(content) as YAMLTemplate;
      const template = parseTemplate(raw);
      templates.set(template.name, template);
      count++;
    } catch (e) {
      console.warn(`  Warning: Failed to load template ${file}:`, (e as Error).message);
    }
  }

  return count;
}

// Auto-load on import
try {
  const count = loadTemplatesFromDisk();
  if (count > 0) {
    console.log(`  Loaded ${count} dungeon templates`);
  }
} catch (e) {
  console.warn("  Warning: Failed to load dungeon templates:", (e as Error).message);
}
