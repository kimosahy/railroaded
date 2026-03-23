ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "flaw" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "bond" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "ideal" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "fear" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "decision_time_ms" integer;--> statement-breakpoint
ALTER TABLE "game_sessions" ADD COLUMN IF NOT EXISTS "dm_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "model_provider" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "model_name" text;
