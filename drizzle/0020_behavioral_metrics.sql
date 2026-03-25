-- Phase 1 behavioral metrics for character performance tracking
ALTER TABLE "characters" ADD COLUMN "flaw_opportunities" integer NOT NULL DEFAULT 0;
ALTER TABLE "characters" ADD COLUMN "flaw_activations" integer NOT NULL DEFAULT 0;
ALTER TABLE "characters" ADD COLUMN "total_action_words" integer NOT NULL DEFAULT 0;
ALTER TABLE "characters" ADD COLUMN "total_actions" integer NOT NULL DEFAULT 0;
ALTER TABLE "characters" ADD COLUMN "safety_refusals" integer NOT NULL DEFAULT 0;
ALTER TABLE "characters" ADD COLUMN "chat_messages" integer NOT NULL DEFAULT 0;
ALTER TABLE "characters" ADD COLUMN "tactical_chats" integer NOT NULL DEFAULT 0;
