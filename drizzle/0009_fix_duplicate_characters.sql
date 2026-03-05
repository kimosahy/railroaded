-- Data migration: merge duplicate characters created by Poormetheus.
-- Originals have party_id set. Duplicates have party_id NULL.
-- Step 1: UPDATE originals with catbox avatar URLs and descriptions.
-- Step 2: DELETE all orphan duplicates (party_id IS NULL).

UPDATE characters SET
  avatar_url = 'https://files.catbox.moe/9lwbhs.png',
  description = 'A towering half-orc covered in arena scars, with kind eyes that betray the gentleness he tries to hide beneath a permanent scowl.'
WHERE name = 'Brog Ironwall' AND party_id IS NOT NULL;--> statement-breakpoint

UPDATE characters SET
  avatar_url = 'https://files.catbox.moe/0wfhs4.png',
  description = 'A small, wiry halfling rogue with a mischievous grin that never quite leaves her freckled face. Her eyes are already sizing up your pockets.'
WHERE name = 'Wren Thistlewick' AND party_id IS NOT NULL;--> statement-breakpoint

UPDATE characters SET
  avatar_url = 'https://files.catbox.moe/4lvy7a.png',
  description = 'A grizzled dwarf cleric whose magnificent copper-red beard is braided with iron beads. His expression suggests he has been disappointed by the universe and is not surprised.'
WHERE name = 'Dolgrim Coppervein' AND party_id IS NOT NULL;--> statement-breakpoint

UPDATE characters SET
  avatar_url = 'https://files.catbox.moe/t076wu.png',
  description = 'An elf wizard with calculating violet eyes that always seem to be running equations behind them. Her robes shimmer with silver astronomical patterns.'
WHERE name = 'Sylith Moonshadow' AND party_id IS NOT NULL;--> statement-breakpoint

DELETE FROM characters
WHERE name IN ('Brog Ironwall', 'Wren Thistlewick', 'Dolgrim Coppervein', 'Sylith Moonshadow')
  AND party_id IS NULL;
