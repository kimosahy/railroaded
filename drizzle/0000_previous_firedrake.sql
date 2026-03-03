CREATE TYPE "public"."character_class" AS ENUM('fighter', 'rogue', 'cleric', 'wizard');--> statement-breakpoint
CREATE TYPE "public"."connection_type" AS ENUM('door', 'passage', 'hidden', 'locked');--> statement-breakpoint
CREATE TYPE "public"."difficulty_tier" AS ENUM('starter', 'intermediate', 'advanced');--> statement-breakpoint
CREATE TYPE "public"."party_status" AS ENUM('forming', 'in_session', 'between_sessions', 'disbanded');--> statement-breakpoint
CREATE TYPE "public"."race" AS ENUM('human', 'elf', 'dwarf', 'halfling', 'half-orc');--> statement-breakpoint
CREATE TYPE "public"."room_type" AS ENUM('entry', 'corridor', 'chamber', 'boss', 'treasure', 'trap', 'rest');--> statement-breakpoint
CREATE TYPE "public"."session_phase" AS ENUM('exploration', 'combat', 'roleplay', 'rest');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('player', 'dm');--> statement-breakpoint
CREATE TABLE "campaign_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"difficulty_tier" "difficulty_tier" NOT NULL,
	"story_hooks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"estimated_sessions" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "characters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"race" "race" NOT NULL,
	"class" character_class NOT NULL,
	"level" integer DEFAULT 1 NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"ability_scores" jsonb NOT NULL,
	"hp_current" integer NOT NULL,
	"hp_max" integer NOT NULL,
	"hp_temp" integer DEFAULT 0 NOT NULL,
	"ac" integer NOT NULL,
	"spell_slots" jsonb DEFAULT '{"level_1":{"current":0,"max":0},"level_2":{"current":0,"max":0}}'::jsonb NOT NULL,
	"hit_dice" jsonb NOT NULL,
	"inventory" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"equipment" jsonb DEFAULT '{"weapon":null,"armor":null,"shield":null}'::jsonb NOT NULL,
	"proficiencies" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"death_saves" jsonb DEFAULT '{"successes":0,"failures":0}'::jsonb NOT NULL,
	"backstory" text DEFAULT '' NOT NULL,
	"personality" text DEFAULT '' NOT NULL,
	"playstyle" text DEFAULT '' NOT NULL,
	"party_id" uuid,
	"is_alive" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "encounter_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_template_id" uuid NOT NULL,
	"name" text NOT NULL,
	"monsters" jsonb NOT NULL,
	"difficulty" text DEFAULT 'medium' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "game_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"party_id" uuid NOT NULL,
	"phase" "session_phase" DEFAULT 'exploration' NOT NULL,
	"current_turn" integer DEFAULT 0 NOT NULL,
	"initiative_order" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"summary" text,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "item_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"subtype" text,
	"damage" text,
	"damage_type" text,
	"properties" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ac_base" integer,
	"ac_dex_cap" integer,
	"heal_amount" text,
	"spell_name" text,
	"description" text DEFAULT '' NOT NULL,
	"is_magic" boolean DEFAULT false NOT NULL,
	"magic_bonus" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "loot_tables" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_template_id" uuid NOT NULL,
	"name" text NOT NULL,
	"entries" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matchmaking_queue" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"role" "user_role" NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monster_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"name" text NOT NULL,
	"hp_current" integer NOT NULL,
	"hp_max" integer NOT NULL,
	"conditions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_alive" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monster_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"hp_max" integer NOT NULL,
	"ac" integer NOT NULL,
	"ability_scores" jsonb NOT NULL,
	"attacks" jsonb NOT NULL,
	"special_abilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"xp_value" integer NOT NULL,
	"challenge_rating" real NOT NULL
);
--> statement-breakpoint
CREATE TABLE "npc_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_template_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"dialogue" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dm_user_id" uuid,
	"campaign_template_id" uuid,
	"current_room_id" uuid,
	"session_count" integer DEFAULT 0 NOT NULL,
	"status" "party_status" DEFAULT 'forming' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_template_id" uuid NOT NULL,
	"from_room_id" uuid NOT NULL,
	"to_room_id" uuid NOT NULL,
	"type" "connection_type" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_template_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"type" "room_type" NOT NULL,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"suggested_encounter_id" uuid,
	"loot_table_id" uuid
);
--> statement-breakpoint
CREATE TABLE "session_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"type" text NOT NULL,
	"actor_id" text,
	"data" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions_auth" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_auth_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "tavern_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"character_id" uuid NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" ADD CONSTRAINT "characters_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "encounter_templates" ADD CONSTRAINT "encounter_templates_campaign_template_id_campaign_templates_id_fk" FOREIGN KEY ("campaign_template_id") REFERENCES "public"."campaign_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_party_id_parties_id_fk" FOREIGN KEY ("party_id") REFERENCES "public"."parties"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loot_tables" ADD CONSTRAINT "loot_tables_campaign_template_id_campaign_templates_id_fk" FOREIGN KEY ("campaign_template_id") REFERENCES "public"."campaign_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchmaking_queue" ADD CONSTRAINT "matchmaking_queue_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matchmaking_queue" ADD CONSTRAINT "matchmaking_queue_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monster_instances" ADD CONSTRAINT "monster_instances_template_id_monster_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."monster_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monster_instances" ADD CONSTRAINT "monster_instances_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "npc_templates" ADD CONSTRAINT "npc_templates_campaign_template_id_campaign_templates_id_fk" FOREIGN KEY ("campaign_template_id") REFERENCES "public"."campaign_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_dm_user_id_users_id_fk" FOREIGN KEY ("dm_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parties" ADD CONSTRAINT "parties_campaign_template_id_campaign_templates_id_fk" FOREIGN KEY ("campaign_template_id") REFERENCES "public"."campaign_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_connections" ADD CONSTRAINT "room_connections_campaign_template_id_campaign_templates_id_fk" FOREIGN KEY ("campaign_template_id") REFERENCES "public"."campaign_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_connections" ADD CONSTRAINT "room_connections_from_room_id_rooms_id_fk" FOREIGN KEY ("from_room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "room_connections" ADD CONSTRAINT "room_connections_to_room_id_rooms_id_fk" FOREIGN KEY ("to_room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_campaign_template_id_campaign_templates_id_fk" FOREIGN KEY ("campaign_template_id") REFERENCES "public"."campaign_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions_auth" ADD CONSTRAINT "sessions_auth_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tavern_posts" ADD CONSTRAINT "tavern_posts_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;