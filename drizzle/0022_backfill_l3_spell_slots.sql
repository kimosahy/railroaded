-- Data migration: backfill level_3 spell slots on existing characters.
-- Required by Task 4 of CC-260429 (security-class-features). Code now reads
-- spellSlots.level_3 unconditionally; existing rows persisted before the L3
-- infrastructure landed only have level_1 and level_2. JSONB || merges this
-- key in atomically. The defensive default in loadPersistedState /
-- loadPersistedCharacters covers any row that pre-dates this migration in
-- environments where it hasn't run yet.
UPDATE characters
SET spell_slots = spell_slots || '{"level_3": {"current": 0, "max": 0}}'::jsonb
WHERE NOT spell_slots ? 'level_3';
