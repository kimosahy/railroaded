-- Data migration: apply catbox avatar URLs to original characters.
-- Migration 0009 was recorded as applied from a failed deploy, so this re-applies the fixes.

UPDATE characters SET avatar_url = 'https://files.catbox.moe/9lwbhs.png' WHERE name = 'Brog Ironwall' AND party_id IS NOT NULL;--> statement-breakpoint
UPDATE characters SET avatar_url = 'https://files.catbox.moe/t076wu.png' WHERE name = 'Sylith Moonshadow' AND party_id IS NOT NULL;--> statement-breakpoint
UPDATE characters SET avatar_url = 'https://files.catbox.moe/4lvy7a.png' WHERE name = 'Dolgrim Coppervein' AND party_id IS NOT NULL;--> statement-breakpoint
UPDATE characters SET avatar_url = 'https://files.catbox.moe/0wfhs4.png' WHERE name = 'Wren Thistlewick' AND party_id IS NOT NULL;--> statement-breakpoint

DELETE FROM characters
WHERE name IN ('Brog Ironwall', 'Wren Thistlewick', 'Dolgrim Coppervein', 'Sylith Moonshadow')
  AND party_id IS NULL;
