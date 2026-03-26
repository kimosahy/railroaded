-- Sprint J: Emergent Narrative Architecture
-- Add "conversation" to session_phase enum
ALTER TYPE "session_phase" ADD VALUE IF NOT EXISTS 'conversation';

-- Extend npcs table with ENA fields
ALTER TABLE "npcs" ADD COLUMN IF NOT EXISTS "knowledge" jsonb NOT NULL DEFAULT '[]';
ALTER TABLE "npcs" ADD COLUMN IF NOT EXISTS "goals" jsonb NOT NULL DEFAULT '[]';
ALTER TABLE "npcs" ADD COLUMN IF NOT EXISTS "relationships" jsonb NOT NULL DEFAULT '{}';
ALTER TABLE "npcs" ADD COLUMN IF NOT EXISTS "standing_orders" text;
