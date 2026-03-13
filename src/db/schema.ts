import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  boolean,
  real,
  uuid,
  pgEnum,
} from "drizzle-orm/pg-core";

// --- Enums ---

export const raceEnum = pgEnum("race", [
  "human",
  "elf",
  "dwarf",
  "halfling",
  "half-orc",
]);

export const classEnum = pgEnum("character_class", [
  "fighter",
  "rogue",
  "cleric",
  "wizard",
]);

export const partyStatusEnum = pgEnum("party_status", [
  "forming",
  "in_session",
  "between_sessions",
  "disbanded",
]);

export const sessionPhaseEnum = pgEnum("session_phase", [
  "exploration",
  "combat",
  "roleplay",
  "rest",
]);

export const roomTypeEnum = pgEnum("room_type", [
  "entry",
  "corridor",
  "chamber",
  "boss",
  "treasure",
  "trap",
  "rest",
]);

export const connectionTypeEnum = pgEnum("connection_type", [
  "door",
  "passage",
  "hidden",
  "locked",
]);

export const difficultyTierEnum = pgEnum("difficulty_tier", [
  "starter",
  "intermediate",
  "advanced",
]);

export const campaignStatusEnum = pgEnum("campaign_status", [
  "active",
  "completed",
  "abandoned",
]);

export const userRoleEnum = pgEnum("user_role", ["player", "dm"]);

// --- Users & Auth ---

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: userRoleEnum("role").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const sessions = pgTable("sessions_auth", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --- Characters ---

export const characters = pgTable("characters", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  race: raceEnum("race").notNull(),
  class: classEnum("class").notNull(),
  level: integer("level").notNull().default(1),
  xp: integer("xp").notNull().default(0),
  gold: integer("gold").notNull().default(0),
  abilityScores: jsonb("ability_scores").notNull().$type<{
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  }>(),
  hpCurrent: integer("hp_current").notNull(),
  hpMax: integer("hp_max").notNull(),
  hpTemp: integer("hp_temp").notNull().default(0),
  ac: integer("ac").notNull(),
  spellSlots: jsonb("spell_slots")
    .notNull()
    .$type<{
      level_1: { current: number; max: number };
      level_2: { current: number; max: number };
    }>()
    .default({ level_1: { current: 0, max: 0 }, level_2: { current: 0, max: 0 } }),
  hitDice: jsonb("hit_dice")
    .notNull()
    .$type<{ current: number; max: number; die: string }>(),
  inventory: jsonb("inventory").notNull().$type<string[]>().default([]),
  equipment: jsonb("equipment")
    .notNull()
    .$type<{ weapon: string | null; armor: string | null; shield: string | null }>()
    .default({ weapon: null, armor: null, shield: null }),
  proficiencies: jsonb("proficiencies").notNull().$type<string[]>().default([]),
  features: jsonb("features").notNull().$type<string[]>().default([]),
  conditions: jsonb("conditions").notNull().$type<string[]>().default([]),
  deathSaves: jsonb("death_saves")
    .notNull()
    .$type<{ successes: number; failures: number }>()
    .default({ successes: 0, failures: 0 }),
  backstory: text("backstory").notNull().default(""),
  personality: text("personality").notNull().default(""),
  playstyle: text("playstyle").notNull().default(""),
  avatarUrl: text("avatar_url"),
  description: text("description"),
  partyId: uuid("party_id").references(() => parties.id),
  isAlive: boolean("is_alive").notNull().default(true),
  // Lifetime stats
  monstersKilled: integer("monsters_killed").notNull().default(0),
  dungeonsCleared: integer("dungeons_cleared").notNull().default(0),
  sessionsPlayed: integer("sessions_played").notNull().default(0),
  totalDamageDealt: integer("total_damage_dealt").notNull().default(0),
  criticalHits: integer("critical_hits").notNull().default(0),
  timesKnockedOut: integer("times_knocked_out").notNull().default(0),
  goldEarned: integer("gold_earned").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --- Campaigns (multi-session arcs) ---

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  partyId: uuid("party_id"), // set when a party is assigned
  storyFlags: jsonb("story_flags").notNull().$type<Record<string, unknown>>().default({}),
  completedDungeons: jsonb("completed_dungeons").notNull().$type<string[]>().default([]),
  sessionCount: integer("session_count").notNull().default(0),
  status: campaignStatusEnum("status").notNull().default("active"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --- Parties ---

export const parties = pgTable("parties", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  dmUserId: uuid("dm_user_id").references(() => users.id),
  campaignId: uuid("campaign_id").references(() => campaigns.id),
  campaignTemplateId: uuid("campaign_template_id").references(
    () => campaignTemplates.id
  ),
  currentRoomId: uuid("current_room_id"),
  sessionCount: integer("session_count").notNull().default(0),
  status: partyStatusEnum("status").notNull().default("forming"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --- Game Sessions ---

export const gameSessions = pgTable("game_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  partyId: uuid("party_id")
    .notNull()
    .references(() => parties.id),
  campaignId: uuid("campaign_id").references(() => campaigns.id),
  phase: sessionPhaseEnum("phase").notNull().default("exploration"),
  currentTurn: integer("current_turn").notNull().default(0),
  initiativeOrder: jsonb("initiative_order")
    .notNull()
    .$type<{ entityId: string; initiative: number; type: "player" | "monster" }[]>()
    .default([]),
  isActive: boolean("is_active").notNull().default(true),
  featured: boolean("featured").notNull().default(false),
  summary: text("summary"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  endedAt: timestamp("ended_at"),
});

// --- Session Events (log) ---

export const sessionEvents = pgTable("session_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => gameSessions.id),
  type: text("type").notNull(),
  actorId: text("actor_id"),
  data: jsonb("data").notNull().$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --- Narrations (dramatic prose from raw events) ---

export const narrations = pgTable("narrations", {
  id: uuid("id").primaryKey().defaultRandom(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => gameSessions.id),
  eventId: uuid("event_id").references(() => sessionEvents.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --- Campaign Templates ---

export const campaignTemplates = pgTable("campaign_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  difficultyTier: difficultyTierEnum("difficulty_tier").notNull(),
  storyHooks: jsonb("story_hooks").notNull().$type<string[]>().default([]),
  estimatedSessions: integer("estimated_sessions").notNull().default(1),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --- Rooms ---

export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignTemplateId: uuid("campaign_template_id")
    .notNull()
    .references(() => campaignTemplates.id),
  name: text("name").notNull(),
  description: text("description").notNull(),
  type: roomTypeEnum("type").notNull(),
  features: jsonb("features").notNull().$type<string[]>().default([]),
  suggestedEncounterId: uuid("suggested_encounter_id"),
  lootTableId: uuid("loot_table_id"),
});

// --- Room Connections ---

export const roomConnections = pgTable("room_connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignTemplateId: uuid("campaign_template_id")
    .notNull()
    .references(() => campaignTemplates.id),
  fromRoomId: uuid("from_room_id")
    .notNull()
    .references(() => rooms.id),
  toRoomId: uuid("to_room_id")
    .notNull()
    .references(() => rooms.id),
  type: connectionTypeEnum("type").notNull(),
});

// --- Monsters (templates / stat blocks) ---

export const monsterTemplates = pgTable("monster_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  hpMax: integer("hp_max").notNull(),
  ac: integer("ac").notNull(),
  abilityScores: jsonb("ability_scores").notNull().$type<{
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
  }>(),
  attacks: jsonb("attacks")
    .notNull()
    .$type<{ name: string; to_hit: number; damage: string; type: string }[]>(),
  specialAbilities: jsonb("special_abilities")
    .notNull()
    .$type<string[]>()
    .default([]),
  xpValue: integer("xp_value").notNull(),
  challengeRating: real("challenge_rating").notNull(),
});

// --- Monster Instances (spawned in combat) ---

export const monsterInstances = pgTable("monster_instances", {
  id: uuid("id").primaryKey().defaultRandom(),
  templateId: uuid("template_id")
    .notNull()
    .references(() => monsterTemplates.id),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => gameSessions.id),
  name: text("name").notNull(),
  hpCurrent: integer("hp_current").notNull(),
  hpMax: integer("hp_max").notNull(),
  conditions: jsonb("conditions").notNull().$type<string[]>().default([]),
  isAlive: boolean("is_alive").notNull().default(true),
});

// --- Items (templates) ---

export const itemTemplates = pgTable("item_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  type: text("type").notNull(), // weapon, armor, potion, scroll, misc
  subtype: text("subtype"), // light, medium, heavy, shield, etc.
  damage: text("damage"), // e.g. "1d8"
  damageType: text("damage_type"), // slashing, piercing, etc.
  properties: jsonb("properties").notNull().$type<string[]>().default([]),
  acBase: integer("ac_base"), // for armor
  acDexCap: integer("ac_dex_cap"), // max DEX bonus for armor
  healAmount: text("heal_amount"), // for potions, e.g. "2d4+2"
  spellName: text("spell_name"), // for scrolls
  description: text("description").notNull().default(""),
  isMagic: boolean("is_magic").notNull().default(false),
  magicBonus: integer("magic_bonus").notNull().default(0),
});

// --- Encounter Templates ---

export const encounterTemplates = pgTable("encounter_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignTemplateId: uuid("campaign_template_id")
    .notNull()
    .references(() => campaignTemplates.id),
  name: text("name").notNull(),
  monsters: jsonb("monsters")
    .notNull()
    .$type<{ templateName: string; count: number }[]>(),
  difficulty: text("difficulty").notNull().default("medium"),
});

// --- Loot Tables ---

export const lootTables = pgTable("loot_tables", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignTemplateId: uuid("campaign_template_id")
    .notNull()
    .references(() => campaignTemplates.id),
  name: text("name").notNull(),
  entries: jsonb("entries")
    .notNull()
    .$type<{ itemName: string; weight: number; quantity: number }[]>(),
});

// --- Journal Entries ---

export const journalEntries = pgTable("journal_entries", {
  id: uuid("id").primaryKey().defaultRandom(),
  characterId: uuid("character_id")
    .notNull()
    .references(() => characters.id),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => gameSessions.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --- Matchmaking Queue ---

export const matchmakingQueue = pgTable("matchmaking_queue", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  characterId: uuid("character_id")
    .notNull()
    .references(() => characters.id),
  role: userRoleEnum("role").notNull(),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

// --- Tavern Board (forum) ---

export const tavernPosts = pgTable("tavern_posts", {
  id: uuid("id").primaryKey().defaultRandom(),
  characterId: uuid("character_id")
    .notNull()
    .references(() => characters.id),
  title: text("title").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const tavernReplies = pgTable("tavern_replies", {
  id: uuid("id").primaryKey().defaultRandom(),
  postId: uuid("post_id")
    .notNull()
    .references(() => tavernPosts.id),
  characterId: uuid("character_id")
    .notNull()
    .references(() => characters.id),
  content: text("content").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --- Custom Monster Templates (DM-created at runtime) ---

export const customMonsterTemplates = pgTable("custom_monster_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  statBlock: jsonb("stat_block").notNull().$type<{
    hpMax: number;
    ac: number;
    abilityScores: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
    attacks: { name: string; to_hit: number; damage: string; type: string; recharge?: number; aoe?: boolean; save_dc?: number; save_ability?: string }[];
    specialAbilities: string[];
    xpValue: number;
    lootTable?: { itemName: string; weight: number; quantity: number }[];
    vulnerabilities?: string[];
    immunities?: string[];
    resistances?: string[];
  }>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --- NPC Templates ---

export const npcTemplates = pgTable("npc_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignTemplateId: uuid("campaign_template_id")
    .notNull()
    .references(() => campaignTemplates.id),
  name: text("name").notNull(),
  description: text("description").notNull(),
  dialogue: jsonb("dialogue").notNull().$type<string[]>().default([]),
});

// --- Persistent NPCs (campaign-scoped, DM-created at runtime) ---

export const npcs = pgTable("npcs", {
  id: uuid("id").primaryKey().defaultRandom(),
  campaignId: uuid("campaign_id")
    .notNull()
    .references(() => campaigns.id),
  name: text("name").notNull(),
  description: text("description").notNull(),
  personality: text("personality").notNull().default(""),
  location: text("location"),
  disposition: integer("disposition").notNull().default(0),
  dispositionLabel: text("disposition_label").notNull().default("neutral"),
  isAlive: boolean("is_alive").notNull().default(true),
  tags: jsonb("tags").notNull().$type<string[]>().default([]),
  memory: jsonb("memory").notNull().$type<{
    sessionId: string;
    event: string;
    summary: string;
    dispositionAtTime: number;
  }[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// --- DM Stats (lifetime stats for Dungeon Masters) ---

export const dmStats = pgTable("dm_stats", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id).unique(),
  username: text("username").notNull(),
  sessionsAsDM: integer("sessions_as_dm").notNull().default(0),
  dungeonsCompletedAsDM: integer("dungeons_completed_as_dm").notNull().default(0),
  totalPartiesLed: integer("total_parties_led").notNull().default(0),
  totalEncountersRun: integer("total_encounters_run").notNull().default(0),
  totalMonsterSpawns: integer("total_monster_spawns").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --- Push Subscriptions (browser push notifications) ---

export const pushSubscriptions = pgTable("push_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  endpoint: text("endpoint").notNull().unique(),
  p256dh: text("p256dh").notNull(),
  auth: text("auth").notNull(),
  preferences: jsonb("preferences")
    .notNull()
    .$type<{
      session_start: boolean;
      combat_end: boolean;
      character_death: boolean;
      dungeon_cleared: boolean;
      level_up: boolean;
    }>()
    .default({
      session_start: true,
      combat_end: true,
      character_death: true,
      dungeon_cleared: true,
      level_up: true,
    }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --- Waitlist Signups ---

export const waitlistSignups = pgTable("waitlist_signups", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  referralCode: text("referral_code").notNull().unique(),
  referredBy: text("referred_by"),  // referral_code of the person who referred them
  referralCount: integer("referral_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// --- NPC Interactions (log of all NPC interactions) ---

export const npcInteractions = pgTable("npc_interactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  npcId: uuid("npc_id")
    .notNull()
    .references(() => npcs.id),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => gameSessions.id),
  characterId: uuid("character_id").references(() => characters.id),
  interactionType: text("interaction_type").notNull(),
  description: text("description").notNull(),
  dispositionChange: integer("disposition_change").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});
