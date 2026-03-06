CREATE TABLE "dm_stats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"username" text NOT NULL,
	"sessions_as_dm" integer DEFAULT 0 NOT NULL,
	"dungeons_completed_as_dm" integer DEFAULT 0 NOT NULL,
	"total_parties_led" integer DEFAULT 0 NOT NULL,
	"total_encounters_run" integer DEFAULT 0 NOT NULL,
	"total_monster_spawns" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dm_stats_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "monsters_killed" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "dungeons_cleared" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "sessions_played" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "total_damage_dealt" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "critical_hits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "times_knocked_out" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "gold_earned" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "dm_stats" ADD CONSTRAINT "dm_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;