ALTER TABLE "characters" ADD COLUMN "flaw" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "bond" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "ideal" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "fear" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "decision_time_ms" integer;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN "dm_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "model_provider" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "model_name" text;