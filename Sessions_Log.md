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
