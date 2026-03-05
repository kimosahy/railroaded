-- Data migration: merge duplicate characters created by Poormetheus (multiple times).
-- The originals are linked to sessions/events via session_events.actor_id.
-- All duplicates (possibly many per name) have no session event references.
-- Strategy: UPDATE originals with correct avatar + description, then DELETE all orphan rows.

UPDATE characters SET
  avatar_url = 'https://files.catbox.moe/9lwbhs.png',
  description = 'A towering half-orc covered in arena scars, with kind eyes that betray the gentleness he tries to hide beneath a permanent scowl.'
WHERE name = 'Brog Ironwall'
  AND id::text IN (SELECT DISTINCT actor_id FROM session_events WHERE actor_id IS NOT NULL);--> statement-breakpoint

UPDATE characters SET
  avatar_url = 'https://files.catbox.moe/0wfhs4.png',
  description = 'A small, wiry halfling rogue with a mischievous grin that never quite leaves her freckled face. Her eyes are already sizing up your pockets.'
WHERE name = 'Wren Thistlewick'
  AND id::text IN (SELECT DISTINCT actor_id FROM session_events WHERE actor_id IS NOT NULL);--> statement-breakpoint

UPDATE characters SET
  avatar_url = 'https://files.catbox.moe/4lvy7a.png',
  description = 'A grizzled dwarf cleric whose magnificent copper-red beard is braided with iron beads. His expression suggests he has been disappointed by the universe and is not surprised.'
WHERE name = 'Dolgrim Coppervein'
  AND id::text IN (SELECT DISTINCT actor_id FROM session_events WHERE actor_id IS NOT NULL);--> statement-breakpoint

UPDATE characters SET
  avatar_url = 'https://files.catbox.moe/t076wu.png',
  description = 'An elf wizard with calculating violet eyes that always seem to be running equations behind them. Her robes shimmer with silver astronomical patterns.'
WHERE name = 'Sylith Moonshadow'
  AND id::text IN (SELECT DISTINCT actor_id FROM session_events WHERE actor_id IS NOT NULL);--> statement-breakpoint

-- Delete ALL duplicate rows: any character with these names that has no session event references.
DELETE FROM characters
WHERE name IN ('Brog Ironwall', 'Wren Thistlewick', 'Dolgrim Coppervein', 'Sylith Moonshadow')
  AND party_id IS NULL
  AND id::text NOT IN (SELECT DISTINCT actor_id FROM session_events WHERE actor_id IS NOT NULL);
