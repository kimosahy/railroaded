# Quest Engine — Sessions Log

## Session 1: Custom Domain Setup
**Date:** February 24, 2026
**Goal:** Connect GoDaddy domain (railroaded.ai) to deployed services

### What We Did

**1. Domain mapping plan**
- Decided on: `railroaded.ai` → Vercel website, `api.railroaded.ai` → Render game server

**2. Added domain in Vercel**
- Went to Vercel → quest-engine project → Settings → Domains
- Added `railroaded.ai`
- Unchecked the "Redirect railroaded.ai to www.railroaded.ai" option (bare domain looks cleaner)
- Vercel gave us the DNS record needed: A record, `@` → `216.198.79.1`

**3. Configured GoDaddy DNS for website**
- Went to GoDaddy DNS management for railroaded.ai
- Set A record: `@` → `216.198.79.1` (TTL: 1 Hour)
- Verified in Vercel — green checkmark, valid configuration ✅

**4. Added custom domain in Render**
- Went to Render → quest-engine service → Settings → Custom Domains
- Added `api.railroaded.ai`
- Render gave us the DNS record needed: CNAME, `api` → `quest-engine-1.onrender.com`

**5. Configured GoDaddy DNS for API**
- Added CNAME record in GoDaddy: `api` → `quest-engine-1.onrender.com` (TTL: 1 Hour)
- Verified in Render — domain verified, SSL certificate issued ✅

**6. Updated codebase URLs**
- Gave Claude Code instructions to replace all old URLs across the project:
  - `quest-engine-1.onrender.com` → `api.railroaded.ai` (in all website HTML files)
  - `quest-engine.onrender.com` → `api.railroaded.ai` (in production.md)
  - `quest-engine.vercel.app` → `railroaded.ai` (in production.md)
- Files changed: `website/index.html`, `website/tavern.html`, `website/journals.html`, `website/leaderboard.html`, `website/tracker.html`, `production.md`

### Live URLs
| Service | URL |
|---------|-----|
| Website | https://railroaded.ai |
| Game Server API | https://api.railroaded.ai |
| Health Check | https://api.railroaded.ai/health |

### Concepts Learned
- **A record:** Points a domain name directly to an IP address (used for `railroaded.ai` → Vercel)
- **CNAME record:** Points a subdomain to another domain name (used for `api.railroaded.ai` → Render)
- **DNS propagation:** Changes take a few minutes to spread across the internet
- **SSL certificate:** Render auto-issues HTTPS so the connection is secure


---

## Session 2: First Live Playtest & Bug Fixes
**Date:** February 24, 2026
**Goal:** Fix deployment issues, run first live agent playtest, fix combat bugs

### What We Did

**1. Vercel deployment debugging**
- After pushing URL updates, Vercel wasn't auto-deploying from GitHub pushes
- Tried deploy hooks, Vercel CLI, and reconnecting the Git repo
- CC ultimately deleted the old Vercel project and redeployed fresh with the correct code
- Lesson: Vercel's Git webhook can get stale — sometimes a clean reconnect is needed

**2. Added skill file routes**
- Agent reported `/skill/player` returning 404
- The skill markdown files existed in `skills/` but no route served them
- CC added `GET /skill/player` and `GET /skill/dm` routes to serve the files
- Also added a root `GET /` welcome route

**3. First live agent playtest (Poormetheus)**
- 4 AI players + 1 AI DM entered The Cursed Crypt of Ashenvault
- Party: Dolgrim Stonehew (dwarf cleric), Brog Ironwall (half-orc fighter), Sylith Dra'kenn (drow warlock), Wren Ashvale (halfling rogue)
- Exploration and roleplay worked great — characters had real personality
- **Combat broke completely** — turns never advanced, players stuck with `isYourTurn: false`

**4. Combat bug fixes (6 bugs)**
CC fixed all 6 issues from the agent's bug report:

| # | Bug | Fix |
|---|-----|-----|
| 1 | No DM tool for monster turns | Added `monster_attack` tool — DM calls it with `monster_id` + `target_id`, auto-advances initiative |
| 2 | `advance-scene` stuck in combat | Now exits combat phase, clears monsters, returns error for invalid room moves |
| 3 | DM endpoints returning "requires player role" | Path issue — DM routes now live under `/api/v1/dm/*` |
| 4 | `environment-damage` ID confusion | All DM tools accept both `char-X` and `user-X` IDs via `resolveCharacter()` helper |
| 5 | Room name fluctuation | Root cause: `advance-scene` silently succeeded without moving rooms. Fixed. |
| 6 | Equipment ignores race proficiencies | Dwarf clerics get Warhammer, half-orc fighters get Greatsword, elves get racial weapons |

**5. Added CORS middleware**
- Website at `railroaded.ai` couldn't fetch data from `api.railroaded.ai` — browser blocked cross-origin requests
- CC added Hono's `cors()` middleware allowing `https://railroaded.ai` and `http://localhost:3000`

**6. Journals page empty — data loss on restart**
- Journals page showed "No adventure journals yet" despite a full session having been played
- Root cause: server uses **in-memory storage** — Render restarting the server (on each deploy) wipes all data
- The journal data from the first playtest was lost when the bug fix deploy restarted the server
- Long-term fix: connect PostgreSQL via `DATABASE_URL` so data survives restarts

### Bugs Found by Agent (Full List)
**Critical:** Combat turns never advance, no monster attack tool, attack targeting broken
**High:** `/api/v1/actions` incomplete during combat, 404s on documented endpoints, JSON parameter parsing errors, room state desync
**Medium:** Equipment ignores proficiencies, message length limits, `player_id` parameter inconsistency

### Current State
- Website live at railroaded.ai ✅
- API live at api.railroaded.ai ✅
- CORS working ✅
- Combat system fixed (untested with new fixes)
- Data is ephemeral (in-memory) — lost on every deploy/restart
- Next: run agent playtest #2 with combat fixes, then connect PostgreSQL for persistence

### Concepts Learned
- **CORS (Cross-Origin Resource Sharing):** Browsers block requests between different domains by default. The server must explicitly allow it with headers.
- **In-memory storage:** Data lives in the server's RAM. Fast but disappears on restart. Opposite of a database.
- **Deploy hooks:** A URL you can hit to trigger a deployment. Useful for manual or CI-triggered deploys.
- **Vercel CLI:** Command-line tool to deploy directly from your machine, bypassing the Git-based auto-deploy.


---

## Session 3 — March 3, 2026 (PostgreSQL Connected + Seeded)

### Goal
Connect the Render PostgreSQL database so game data survives deploys and restarts. Prerequisite for v2 sprint.

### What was done

**1. Resumed quest-engine-db on Render**
- DB already existed (created 7 days ago during v1 setup) but was suspended
- Resumed via Render dashboard — PostgreSQL 18, Oregon (same region as web service)

**2. Verified DATABASE_URL already set**
- Environment variable was already configured on quest-engine-1 web service
- Connection string pointed to the correct internal DB hostname

**3. Added pre-deploy migration command**
- Set Pre-Deploy Command to `bun run src/db/migrate.ts` in Render Settings > Build & Deploy
- This runs Drizzle migrations automatically before each deploy

**4. Generated Drizzle migration files**
- First deploy failed: `Can't find meta/_journal.json file`
- Root cause: `drizzle-kit generate` was never run — schema existed in code but no SQL migration files were committed
- Ran `bun run db:generate` locally → created `drizzle/0000_previous_firedrake.sql` (18 tables)
- Committed and pushed → auto-deploy succeeded

**5. Seeded production database**
- Ran `bun run db:seed` via Render Shell
- Seeded: 16 monsters, 25 items, 3 campaign templates (Goblin Warren, Crypt of Whispers, Bandit Fortress — 8 rooms each)

**6. Upgraded DB to paid plan**
- Free tier expired March 26 — would have deleted all data
- Upgraded to Basic-256mb: $6/month + $0.30/month storage (1 GB) = $6.30/month total
- Storage at 8.32% used after seed

**7. Verified end state**
- `curl https://api.railroaded.ai/health` → status ok, uptime stable
- DB status: Available, Basic-256mb, 256 MB RAM, 0.1 CPU, 1 GB storage

### Current State
- Website live at railroaded.ai ✅
- API live at api.railroaded.ai ✅
- PostgreSQL connected and seeded ✅
- Data persists across deploys and restarts ✅
- Pre-deploy migrations run automatically ✅
- DB on paid plan ($6.30/month) — no expiry ✅
- Combat fixes from Session 2 still untested with new DB

### Monthly Hosting Costs
| Service | Platform | Plan | Cost |
|---------|----------|------|------|
| quest-engine-1 | Render Web Service | Starter | $7/month |
| quest-engine-db | Render PostgreSQL | Basic-256mb + 1GB | $6.30/month |
| railroaded.ai | Vercel | Free | $0 |
| **Total** | | | **$13.30/month** |

### Concepts Learned
- **Drizzle migrations:** Schema changes in code need to be turned into SQL migration files via `drizzle-kit generate`. These files must be committed to the repo. The `migrate()` function reads them at deploy time and applies them to the database.
- **Pre-deploy commands:** Render can run a command after building but before starting your app. Perfect for database migrations — runs every deploy but only applies new changes.
- **Free tier DB expiry:** Render's free PostgreSQL expires after 30 days. Data is deleted permanently. Paid plan ($6/month) removes the expiry.


## Session 4 — Mar 3, 2026

### Goal
v2 persistence sprint — ship P0 (persistence) and P1 (narrator + homepage heartbeat)

### What Was Done
1. Installed event persistence: `logEvent()` now writes to both in-memory array and `session_events` DB table
2. Added character snapshots at session-end and combat-end
3. Added procedural party name generator (race/class composition), stored in DB, surfaced in all 4 party endpoints
4. Built `loadPersistedState()` — rebuilds characters/parties/events from DB at server startup
5. Fixed monster naming bug: case-insensitive template lookup ("undefined A" → "Skeleton A")
6. Ran Drizzle migration on production DB (parties.name column)
7. Built narrator layer: new `narrations` table, POST /narrator/narrate (auth'd), GET /spectator/narrations (public)
8. Ran second migration on production DB (narrations table)
9. Built homepage heartbeat: "Latest from the Dungeons" narration feed on index.html with auto-refresh

### Bugs Found/Fixed
| Bug | Cause | Fix |
|-----|-------|-----|
| DNS ENOTFOUND on migration | Used internal Render DB URL from Mac | Switched to external URL (*.oregon-postgres.render.com) |
| SSL/TLS required | External Render DB connections require SSL | Added ?sslmode=require to connection string |
| "undefined A" monster names | Case-sensitive template lookup; DM sends lowercase, templates stored capitalized | Case-insensitive matching + fallback for missing field |

### Current State
- All P0 and P1 items shipped (6 commits on main, auto-deployed)
- 147 tests passing
- Production DB has both migrations applied
- Homepage shows live narration feed (empty until Poormetheus starts narrating)

### Concepts Learned
- **Render internal vs external DB URLs:** Internal hostname (dpg-...-a) only resolves inside Render's network. External hostname (dpg-...-a.oregon-postgres.render.com) works from anywhere but requires ?sslmode=require
- **Claude Code workflow:** CC reads CLAUDE.md automatically, works through tasks autonomously. Karim's role: approve edits, provide env context (DB URLs, secrets) CC can't access
- **Architecture: server never calls LLM.** Narrator is an external agent (Poormetheus on OpenClaw) that reads events via spectator API and POSTs prose back


## Session 5 — Mar 3, 2026

### Goal
Complete P2 combat depth (WebSocket turn notifications, bonus actions + reactions, death saves)

### What Was Done
1. Recovered P2 #6 (WebSocket turn notifications) from cut-off — code survived uncommitted in working tree, committed and pushed
2. Built P2 #7: bonus actions + reactions — TurnResources tracking, 3 new tools (bonus_action, reaction, end_turn), 154 tests passing
3. Built P2 #8: death saves with drama — WebSocket broadcasts on every save, nat 20 revival, character death/stabilize notifications
4. Integrated Poormetheus's RAILROADED_P3_SPEC.md into CLAUDE.md as P3-P5 backlog (9 fully specced items)
5. Entire v2 sprint complete: P0 (3) + P1 (2) + P2 (3) = 8/8 items shipped

### Current State
- All P0, P1, P2 items shipped and deployed
- 154 tests passing across 8 files
- P3-P5 backlog specced in CLAUDE.md (9 items with file paths, complexity, sprint sequence)
- Homepage narration feed is built but empty — needs Poormetheus narrator config

### Concepts Learned
- **Turn resources:** Per-turn tracking (actionUsed, bonusUsed, reactionUsed) resets each turn. Players must explicitly end_turn — attacks no longer auto-advance
- **Death save broadcasts:** WebSocket push to entire party + DM on every save result. Creates tension even for spectators

## Session 6 — Mar 4, 2026 (P3 Sprint A — Gameplay Depth)

### Goal
Complete Sprint A: skill checks with context + loot flow end-to-end

### What Was Done
1. Fixed group check skill proficiency bug + added margin field to all check results (6 new tests)
2. Wired advantage/disadvantage through all check handlers + new contested check tool (10 new tests)
3. Loot flow end-to-end: item catalog from items.yaml, data-driven items, equip/unequip with stat recalc, loot drops on monster death (23 new tests)

### Current State
- 193 tests passing
- Items 9 + 10 shipped. Sprint A complete

### Concepts Learned
- **Margin of success:** Returning `margin` (roll - DC) on every check lets the DM calibrate narrative response
- **Contested checks:** Both sides roll, higher wins — used for grapple, stealth vs perception, etc.

## Session 7 — Mar 4, 2026 (P3 Sprint B — Content Creation)

### Goal
Complete Sprint B: custom dungeon templates + custom monsters

### What Was Done
1. Template loader: `src/game/templates.ts` reads YAML from `data/templates/`, exposes `getTemplate()`, `listTemplates()`, `getRandomTemplate()`. Parties now get real 8-room dungeons with branching paths
2. Pre-placed encounters: `trigger_encounter` DM tool spawns the room's template encounter automatically. Tracked so it can't fire twice
3. Pre-placed loot: `loot_room` DM tool rolls from the room's template loot table and awards items
4. Feature interaction: `interact_with_feature` DM tool validates features exist in current room, logs event
5. Scene override: `override_room_description` DM tool for dynamic description changes mid-session
6. Custom monster creation: `create_custom_monster` DM tool builds runtime monster templates with full stat blocks
7. Monster ability model expanded: recharge abilities, AoE attacks with saves, save-or-suck attacks
8. Custom monster persistence: `custom_monster_templates` DB table, `list_monster_templates` tool, loaded on startup

### Current State
- 238 tests passing (45 new across Sprint B)
- Items 11 + 12 shipped. Sprint B complete
- CLAUDE.md updated with full Sprint C spec (from Poormetheus) — 5 phases, campaign shell through world codex

### Concepts Learned
- **Template-driven dungeons:** YAML templates define complete adventures (rooms, connections, encounters, loot, NPCs). Server loads and uses them at runtime instead of hardcoded rooms
- **Recharge mechanics:** 5e pattern — ability fires once, then needs d6 >= recharge value each turn to restore. Data model supports it even before monster AI is smart enough to use it
- **Runtime vs persistent templates:** Custom monsters exist in-memory for the session AND persist to DB for reuse. Dual-layer pattern

## Session 8 — Mar 4, 2026 (Sprint C — Persistence & World, All 4 Phases)

### Goal
Complete Sprint C: multi-session campaigns with persistent characters, NPCs, quests, and world state

### What Was Done

**Phase 1 — Campaign Shell (5 commits):**
1. `campaigns` table + Drizzle migration (0004). campaign_id FK on parties and game_sessions
2. `create_campaign`, `get_campaign`, `set_story_flag` DM tools
3. `end_session` updated to track session count + completed dungeons per campaign
4. Spectator endpoints: `GET /spectator/campaigns`, `GET /spectator/campaigns/:id`
5. `loadCampaigns()` restores from DB on startup, re-links to in-memory parties

**Phase 2 — Character Persistence (4 commits):**
6. Fixed character snapshot (deathSaves + death handling)
7. Gold currency: starting gold by class, `award_gold` DM tool (per-player or party split), persists via snapshot
8. XP-based level-up: auto-level on XP award, HP/spell slots/hit dice/features all scale, cap at level 5
9. Campaign reconvening: `start_campaign_session` tool loads all character state (level, gold, XP, inventory, equipment) from previous session

**Phase 3 — NPC System (2 commits):**
10. `npcs` + `npc_interactions` tables (migration 0006)
11. 5 DM tools: `create_npc`, `get_npc`, `list_npcs`, `update_npc`, `update_npc_disposition`
12. Disposition system: -100 (hostile) → +100 (devoted), 7 labels, auto-computed from interactions
13. NPC memory: last 20 interactions with reasons, `voice_npc` logs persistent interactions
14. Campaign briefing returns full NPC roster

**Phase 4 — Between-Session Phase (1 commit):**
15. Quest tracking: `add_quest`, `update_quest`, `list_quests` with active/completed/failed status
16. Session history: `end_session` records summaries + completed dungeons across sessions
17. Enriched campaign briefing: full character details, NPC personality/memory, quests, session history
18. `start_campaign_session` returns full briefing — everything a new DM needs to continue

### Current State
- 322 tests passing across 15 files (282 → 322, +40 new)
- Sprint C complete (all 4 phases). All planned sprints shipped (A + B + C)
- 6 Drizzle migrations total (0001–0006)
- 12 commits across Sprint C

### Concepts Learned
- **Campaign as container:** Everything hangs off campaign_id — sessions, characters, parties, NPCs, quests. Simple FK pattern scales well
- **Reconvening pattern:** Snapshot character state on session end → reload on next session start. Handles death, gold, XP, equipment across sessions
- **Disposition as derived state:** Store raw interaction scores, compute human-readable label (hostile/wary/neutral/friendly/devoted) at read time. More flexible than storing the label
- **Briefing as onboarding:** The campaign briefing endpoint is designed so a brand-new DM agent can pick up a campaign mid-stream with zero context loss


---

## Session 84 — Mar 8, 2026
**Goal:** Fix IE Round 1 failed bugs

### What was done
1. Fixed flaky CI test: "rogue bonus action hide" shared turn state with preceding dash test — added handleEndTurn() call between them
2. B011: Added `id` field to handleGetParty member mapping (was omitted from response)
3. B017: Added `type` to spawn-encounter template lookup fallback chain (agents send `type`, handler only checked `template_name`)
4. B016: Added flat params normalization in handleSpawnEncounter — `{monster_type, count}` now converts to array format
5. Wrote dedicated ie-bugfixes.test.ts for new regression tests
6. Root cause analysis for remaining 4 bugs (B015, B020, B022, B023) — CC_TASK.md written with targeted prompts

### Bugs Fixed

| Bug | Description | Fix |
|-----|-------------|-----|
| Flaky CI | bonus action hide test failed when run after dash test | Added handleEndTurn() between tests |
| B011 | Party members missing `id` in GET response | Added `id: c!.id` to member mapping |
| B017 | Spawn encounter ignores `type` param | Added `type` to template lookup fallback chain |
| B016 | Spawn encounter crashes on flat params | Added normalization from `{monster_type, count}` to array |

### Current State
- 580 tests passing across 27 files
- 4 remaining Round 1 bugs (B015, B020, B022, B023) need CC attention via CC_TASK.md

## Session 107 — Mar 8, 2026 (Session Persistence to DB)

**Goal:** Fix auth sessions dying on every deploy, breaking IE loop playtests.

**What was done:**
1. Identified that auth sessions (`sessionsByToken` Map) were in-memory only — every deploy killed all active tokens
2. `sessions_auth` DB table already existed in schema but wasn't wired up
3. CC implemented: persist on login, load on restart, throttled renewal (1 min debounce), expired cleanup
4. 711 tests pass, 0 fail. Deployed to Render.

**Bugs fixed:**
| Bug | Description | Fix |
|---|---|---|
| Session loss on deploy | In-memory tokens die on server restart | Persist to sessions_auth table, load on startup |

**Current state:** 711 pass, 0 fail, 2 todo. IE loop running with session persistence active.

**Concepts learned:** Fire-and-forget DB writes with `.catch(console.error)` for non-blocking persistence. Throttled renewal to avoid DB hammering on every request.
