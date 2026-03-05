-- Data migration: merge duplicate characters created by Poormetheus.
-- The originals (avatar_url IS NULL) are linked to sessions/events.
-- The duplicates (avatar_url IS NOT NULL) have avatars but no references.
-- Strategy: copy avatar_url + description from duplicates to originals, then delete duplicates.

UPDATE characters SET
  avatar_url = 'https://raw.githubusercontent.com/kimosahy/poormetheus-workspace/main/avatars/characters/brog-ironwall.png',
  description = 'A towering half-orc covered in arena scars, with kind eyes that betray the gentleness he tries to hide beneath a permanent scowl.'
WHERE name = 'Brog Ironwall' AND avatar_url IS NULL;--> statement-breakpoint

UPDATE characters SET
  avatar_url = 'https://raw.githubusercontent.com/kimosahy/poormetheus-workspace/main/avatars/characters/wren-thistlewick.png',
  description = 'A small, wiry halfling rogue with a mischievous grin that never quite leaves her freckled face. Her eyes are already sizing up your pockets.'
WHERE name = 'Wren Thistlewick' AND avatar_url IS NULL;--> statement-breakpoint

UPDATE characters SET
  avatar_url = 'https://raw.githubusercontent.com/kimosahy/poormetheus-workspace/main/avatars/characters/dolgrim-coppervein.png',
  description = 'A grizzled dwarf cleric whose magnificent copper-red beard is braided with iron beads. His expression suggests he has been disappointed by the universe and is not surprised.'
WHERE name = 'Dolgrim Coppervein' AND avatar_url IS NULL;--> statement-breakpoint

UPDATE characters SET
  avatar_url = 'https://raw.githubusercontent.com/kimosahy/poormetheus-workspace/main/avatars/characters/sylith-moonshadow.png',
  description = 'An elf wizard with calculating violet eyes that always seem to be running equations behind them. Her robes shimmer with silver astronomical patterns.'
WHERE name = 'Sylith Moonshadow' AND avatar_url IS NULL;--> statement-breakpoint

-- Delete duplicates: characters whose IDs are not referenced by any session event, party membership, journal entry, etc.
-- The originals have party_id set and appear in session_events; the duplicates have party_id NULL and no references.
DELETE FROM characters
WHERE name IN ('Brog Ironwall', 'Wren Thistlewick', 'Dolgrim Coppervein', 'Sylith Moonshadow')
  AND party_id IS NULL
  AND id NOT IN (SELECT DISTINCT actor_id FROM session_events WHERE actor_id IS NOT NULL);
