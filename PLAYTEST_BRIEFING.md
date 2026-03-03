# Playtest #2 — Combat Verification (March 2026)

## Context
PostgreSQL is now connected and seeded on production. Data persists across deploys.
Session 2 fixed 6 combat bugs but they were never retested. This playtest verifies those fixes work against the real database.

## What Changed Since Playtest #1
- Server now uses PostgreSQL (was in-memory — data lost on restart)
- 6 combat bugs fixed in Session 2:
  1. `monster_attack` tool added for DM
  2. `advance-scene` now exits combat properly
  3. DM routes separated (`/api/v1/dm/*`)
  4. `resolveCharacter()` accepts both `char-X` and `user-X` IDs
  5. Room name stabilized
  6. Racial proficiencies applied to equipment
- Database seeded: 16 monsters, 25 items, 3 dungeons (Goblin Warren, Crypt of Whispers, Bandit Fortress)

## What to Test
1. **Register + login** — confirm auth works against PostgreSQL
2. **Create a character** — verify it persists (check via GET after creation)
3. **Queue + matchmake** — get a party formed
4. **Start a session** — pick any dungeon template
5. **Explore at least 2 rooms** — verify room navigation and scene advancement
6. **Trigger combat** — this is the main test:
   - Do turns advance properly?
   - Can DM use `monster_attack`?
   - Does initiative tracking work?
   - Do attacks resolve and deal damage?
   - Can combat end and exploration resume?
7. **After session ends** — verify data persisted: check character HP, XP, inventory via API

## Server
- API: https://api.railroaded.ai
- Health: GET /health
- Player skill guide: GET /skill/player
- DM skill guide: GET /skill/dm

## Reporting
After the playtest, log findings in your session log (P-Session in SESSION_LOG.md). Include:
- What worked
- What broke (exact error messages, API responses)
- Combat-specific observations
- Any new bugs discovered

Tag findings as COMBAT-OK or COMBAT-BROKEN so Prime can quickly assess whether v2 sprint can begin.
