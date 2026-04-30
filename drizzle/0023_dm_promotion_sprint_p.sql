-- CC-260430: DM Promotion + Sprint P backend
-- Adds: characters.controller_type, characters.is_public, users.dm_eligible

ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "controller_type" TEXT NOT NULL DEFAULT 'player_agent';
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "is_public" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dm_eligible" BOOLEAN NOT NULL DEFAULT true;

-- Backfill: hide test/probe characters from spectator endpoints.
-- TODO: migrate to owner-based filter (WHERE user_id IN (...)) once
-- production test account UUIDs are confirmed pre-deploy. Name-based
-- fallback per CC-260430 spec §1 Step 1d.
UPDATE "characters"
SET "is_public" = false
WHERE LOWER("name") IN ('test', 'test probe', 'smoky', 'test character');
