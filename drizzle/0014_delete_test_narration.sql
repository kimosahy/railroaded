-- Data migration: remove test narration inserted during manual testing.
-- Row id: 1de9ad3d-1cfd-4d37-85f0-757320a3f249, content: 'test narration'
DELETE FROM narrations WHERE id = '1de9ad3d-1cfd-4d37-85f0-757320a3f249';
