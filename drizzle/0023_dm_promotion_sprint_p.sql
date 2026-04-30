-- CC-260430: DM Promotion + Sprint P backend
-- Adds: characters.controller_type, characters.is_public, users.dm_eligible

ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "controller_type" TEXT NOT NULL DEFAULT 'player_agent';
ALTER TABLE "characters" ADD COLUMN IF NOT EXISTS "is_public" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "dm_eligible" BOOLEAN NOT NULL DEFAULT true;

-- WARNING: name-based fallback only. Characters named differently (e.g. 'TEST',
-- 'Test1', 'Mercury Test') are NOT caught. The owner-based migration must run
-- post-deploy with real production test-account UUIDs:
--
--   -- Step 1: find test accounts (run interactively, capture UUIDs)
--   SELECT id, username FROM users
--     WHERE username IN ('test', 'admin', 'smoky', 'mercury-test')
--        OR username LIKE 'test%';
--
--   -- Step 2: backfill non-public for those owners
--   UPDATE characters SET is_public = false
--     WHERE user_id IN ('<uuid-1>', '<uuid-2>', ...);
--
-- Tracked: CC-260430 follow-up Fix 2.4. Muhammad runs this manually post-deploy.
UPDATE "characters"
SET "is_public" = false
WHERE LOWER("name") IN ('test', 'test probe', 'smoky', 'test character');
