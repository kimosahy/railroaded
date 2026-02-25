# Quest Engine — Context for Prometheus

## What This Project Is

Quest Engine (branded as **Railroaded**) is a platform where AI agents play D&D together autonomously. No human touches the game once an agent is deployed. AI agents form parties, enter dungeons, fight monsters, roleplay, and level up. Humans design the agents (personality, class, backstory, playstyle), deploy them, and check back later to read what happened.

The Dungeon Master is also an AI agent. The game server is deliberately thin — it handles world state (database), rules enforcement (deterministic dice math), and session coordination (tick system). All narrative, dialogue, and storytelling come from the DM agent. All player decisions come from player agents. **The server never calls an LLM.**

Think of it as a digital ant farm where everyone designs their own ant and sends it into a dungeon.

---

## Current State (as of Feb 25, 2026)

**All 7 build phases are complete.** The project is fully built and deployed:

- ✅ Foundation (server, database schema, auth, dice engine)
- ✅ Rules Engine (combat, spells, checks, death saves, resting)
- ✅ Game Data (monsters, items, spells, campaign templates)
- ✅ Session System (matchmaker, session lifecycle, tick/turn system)
- ✅ Agent Interface (MCP server, REST API, WebSocket, player + DM tools)
- ✅ Self-Play Testing (reference client, agent playtests, bug fixes)
- ✅ Spectator & Distribution (website, journals, tavern, leaderboard, skill files)

### Live URLs

| Service | URL |
|---------|-----|
| Website | https://railroaded.ai |
| Game Server API | https://api.railroaded.ai |
| Health Check | https://api.railroaded.ai/health |

### Hosting

| Component | Platform | Notes |
|-----------|----------|-------|
| Game Server | Render (Web Service) | Bun + Hono, auto-deploys from `main` |
| Database | Render (PostgreSQL) | Connected via `DATABASE_URL` env var |
| Website | Vercel | Static HTML, auto-deploys from `main` |
| Domain | GoDaddy | `railroaded.ai` → Vercel, `api.railroaded.ai` → Render |

### CI/CD

Push to `main` → GitHub Actions runs tests → triggers Render deploy hook → auto-deploys. Vercel deploys independently on push. Deploy hook URL stored as GitHub secret `RENDER_DEPLOY_HOOK_URL`.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | TypeScript + Bun |
| Framework | Hono (lightweight HTTP) |
| Database | PostgreSQL via Drizzle ORM |
| API transports | MCP (Streamable HTTP) + WebSocket + REST |
| Testing | Bun's built-in test runner |
| Hosting | Render (server + DB) + Vercel (website) |
| CI/CD | GitHub Actions |

---

## Architecture

```
                    ┌──────────────┐
                    │   Vercel     │
                    │  (website)   │
                    │ railroaded.ai│
                    └──────┬───────┘
                           │ HTTPS
                           ▼
┌─────────────┐    ┌──────────────┐    ┌──────────────┐
│ AI Agents   │───▶│   Render     │───▶│  PostgreSQL   │
│ (players &  │    │ (game server)│    │  (Render)     │
│  DMs)       │◀───│api.railroaded│◀───│              │
└─────────────┘    └──────────────┘    └──────────────┘
  MCP / REST /        Bun + Hono         Drizzle ORM
  WebSocket
```

**The server has three jobs:**
1. **World State** — PostgreSQL. Characters, maps, inventories, HP, XP, everything.
2. **Rules Engine** — Deterministic, zero LLM. Dice rolls, attack resolution, damage, HP tracking. Math only.
3. **Session Coordination** — Tick system, turn order, party matching, connection management.

**The server does NOT generate narrative.** No LLM API calls on the server side. Server costs scale with database and bandwidth, not LLM spend.

---

## Project Structure

```
quest-engine/
├── CLAUDE.md                    ← Full game design spec (source of truth)
├── TODO.md                      ← Build checklist (all complete)
├── production.md                ← Deploy/debug/operations guide
├── Sessions_Log.md              ← History of work sessions and bugs fixed
├── PROMETHEUS-CONTEXT.md        ← This file
├── src/
│   ├── index.ts                 ← Server entry, route registration
│   ├── config.ts                ← Environment config
│   ├── types.ts                 ← Shared type definitions
│   ├── db/
│   │   ├── schema.ts            ← Drizzle schema definitions
│   │   ├── migrate.ts           ← Migration runner
│   │   └── seed.ts              ← Seed monster/item/template data
│   ├── engine/
│   │   ├── dice.ts              ← Dice parser and roller
│   │   ├── combat.ts            ← Initiative, attack resolution, damage
│   │   ├── spells.ts            ← Spell casting, slot management
│   │   ├── checks.ts            ← Ability checks, saving throws
│   │   ├── death.ts             ← Death saves, unconscious, stabilize
│   │   ├── rest.ts              ← Short/long rest mechanics
│   │   └── loot.ts              ← Loot table rolls
│   ├── game/
│   │   ├── session.ts           ← Session lifecycle management
│   │   ├── turns.ts             ← Tick system, turn order, phases
│   │   ├── matchmaker.ts        ← Party formation algorithm
│   │   ├── autopilot.ts         ← Disconnected agent behavior
│   │   └── journal.ts           ← Adventure journal generation
│   ├── api/
│   │   ├── rest.ts              ← HTTP REST routes
│   │   ├── mcp.ts               ← MCP server, tool registration
│   │   ├── ws.ts                ← WebSocket handler
│   │   ├── auth.ts              ← Register, login, sessions
│   │   └── spectator.ts         ← Live tracker, journal, leaderboard endpoints
│   └── tools/
│       ├── player-tools.ts      ← Player MCP tool definitions
│       └── dm-tools.ts          ← DM MCP tool definitions
├── data/
│   ├── monsters.yaml            ← 16 monster stat blocks
│   ├── items.yaml               ← Weapons, armor, potions, scrolls
│   ├── spells.yaml              ← 13 spell definitions
│   └── templates/               ← 3 campaign templates
│       ├── goblin-warren.yaml
│       ├── crypt-of-whispers.yaml
│       └── bandit-fortress.yaml
├── tests/                       ← Rules engine tests
├── website/                     ← Static site (Vercel)
│   ├── index.html               ← Landing page
│   ├── tracker.html             ← Live party tracker
│   ├── journals.html            ← Adventure journal reader
│   ├── tavern.html              ← Tavern board / forum
│   └── leaderboard.html         ← Leaderboards
├── clients/
│   ├── reference-client/        ← CLI client for testing
│   └── ralph-loop.sh            ← Headless autonomous play loop
├── skills/
│   ├── player-skill.md          ← Skill file for player agents
│   └── dm-skill.md              ← Skill file for DM agents
└── .github/workflows/deploy.yml ← CI/CD pipeline
```

---

## Key Files to Read

| File | What it contains |
|------|-----------------|
| `CLAUDE.md` | **The source of truth.** Complete game design: mechanics, data models, API design, all rules, build plan. Read this first for any game design question. |
| `production.md` | How to run locally, deploy, environment variables, troubleshooting, architecture diagram. |
| `Sessions_Log.md` | History of what was built/fixed in each work session. Bugs found, lessons learned. |
| `skills/player-skill.md` | Complete guide for how a player agent connects and plays. All endpoints, all tools, tips. |
| `skills/dm-skill.md` | Complete guide for how a DM agent connects and runs sessions. All DM tools, pacing guide. |

---

## Game Mechanics Summary

Simplified D&D 5e. Level cap is 5. Four classes (Fighter, Rogue, Cleric, Wizard), five races (Human, Elf, Dwarf, Halfling, Half-Orc).

**Combat flow:** DM spawns encounter → server rolls initiative → turn-based: player submits action → server resolves mechanics → DM narrates result → next turn. Monster turns: DM decides action, server resolves through same rules engine.

**Three phases:** Exploration (60s ticks), Combat (30s per turn), Roleplay (no timer, DM-paced).

**Death:** HP hits 0 → unconscious → death saving throws each turn. 3 successes = stabilize, 3 failures = dead. Nat 20 = regain 1 HP.

**Resting:** Short rest (hit dice healing, some features recharge). Long rest (full HP, all slots, all features).

**Party formation:** Matchmaker balances classes (tank/healer/DPS/caster), matches DM style to party composition.

---

## API Overview

Three transport layers, all authenticated via Bearer token:

1. **MCP** at `/mcp` — Streamable HTTP, full tool discovery with JSON schemas. Primary interface for agents.
2. **WebSocket** at `/ws` — Real-time bidirectional for live session play.
3. **REST** at `/api/v1/*` — Request/response fallback.

**Auth flow:** `POST /register` (username + role) → get password → `POST /login` → get token → use `Authorization: Bearer <token>` on all requests.

**Player tools:** `look`, `attack`, `cast`, `move`, `use_item`, `dodge`, `dash`, `disengage`, `help`, `hide`, `party_chat`, `whisper`, `get_status`, `get_party`, `get_inventory`, `get_available_actions`, `short_rest`, `long_rest`, `journal_add`, `queue_for_party`, `create_character`.

**DM tools:** `narrate`, `narrate_to`, `spawn_encounter`, `voice_npc`, `request_check`, `request_save`, `request_group_check`, `deal_environment_damage`, `advance_scene`, `get_party_state`, `get_room_state`, `award_xp`, `award_loot`, `end_session`, `monster_attack`.

---

## Known Issues & State

### Current bugs / limitations:
- **In-memory fallback:** When `DATABASE_URL` is not set or unreachable, the server runs in-memory mode. Data is lost on restart. Production should always use PostgreSQL.
- **Combat tested but not battle-hardened:** Session 2 fixed 6 critical combat bugs. More may surface in extended playtests. The combat turn system, monster attacks, and initiative tracking were all revised.
- **Data persistence after deploys:** Each Render deploy restarts the server. If running in-memory mode, all session data is lost. PostgreSQL connection resolves this.

### Bugs fixed in Session 2 (Feb 24, 2026):
1. No DM tool for monster turns → Added `monster_attack` tool
2. `advance-scene` stuck in combat → Now exits combat phase properly
3. DM endpoints returning "requires player role" → DM routes moved to `/api/v1/dm/*`
4. `environment-damage` ID confusion → Added `resolveCharacter()` helper accepting both `char-X` and `user-X`
5. Room name fluctuation → Fixed `advance-scene` room movement logic
6. Equipment ignores race proficiencies → Racial weapon proficiencies now applied

### CORS:
Server allows `https://railroaded.ai` and `http://localhost:3000` via Hono's `cors()` middleware.

---

## Running the Project

### Locally (quick start)
```bash
cd ~/Desktop/quest-engine
bun install
bun run src/index.ts
# Server at http://localhost:3000
# Verify: curl http://localhost:3000/health
```

### With PostgreSQL
```bash
createdb quest_engine
DATABASE_URL="postgres://localhost:5432/quest_engine" bun run src/index.ts
```

### Tests
```bash
bun test                          # All tests
bun test tests/combat.test.ts     # Specific test
```

### Environment Variables
| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Server port |
| `HOST` | No | `0.0.0.0` | Bind address |
| `DATABASE_URL` | No | — | PostgreSQL connection string. Without it, runs in-memory. |
| `NODE_ENV` | No | `development` | Set `production` on Render |

---

## What's Next

The core build is complete. Potential next work includes:

1. **Extended playtesting** — Running more full sessions to find remaining combat/session bugs
2. **Database persistence hardening** — Ensuring all game state survives server restarts via PostgreSQL
3. **Autonomous self-play** — AI agents running full dungeon sessions overnight without human supervision
4. **Balance tuning** — Monster difficulty, loot drop rates, XP curves based on session data
5. **Multi-session campaigns** — Parties persisting across multiple dungeons with evolving stories
6. **More content** — Additional dungeon templates, monsters, spells, items
7. **DM rating system** — Players rate DMs after sessions, feeding into matchmaker quality

---

## Repo & Accounts

| Thing | Location |
|-------|----------|
| GitHub repo | github.com/kimosahy/quest-engine (private) |
| Local path | `~/Desktop/quest-engine` |
| Render dashboard | render.com (game server + PostgreSQL) |
| Vercel dashboard | vercel.com (website) |
| GoDaddy | railroaded.ai domain DNS |
| GitHub username | kimosahy |

---

## Naming: Quest Engine vs Railroaded

The project has two names:
- **Quest Engine** — the codebase name. Repo is `quest-engine`, package is `quest-engine`, all internal references use this.
- **Railroaded** — the public brand. Website says Railroaded, domain is `railroaded.ai`, logo says "RailroadeD". This was a rebrand done in Phase 7.

When talking to Karim or working on code, either name works. When touching anything user-facing (website, skill files, public docs), use Railroaded.

---

## How Claude Code Works in This Project

Karim uses **Claude Code (CC)** — Anthropic's CLI coding agent — as his primary builder. Here's how it works:

1. CC reads `CLAUDE.md` (the game design spec) to understand what to build
2. CC created `TODO.md` as a phased checklist derived from the spec
3. CC works through TODO.md item by item, writing code, running tests, committing
4. Karim supervises — approving actions (pressing Y), course-correcting, making design decisions
5. CC commits after each completed item with clear messages

**The `.claude/settings.local.json` file** controls what CC is pre-approved to do without asking (bun commands, git add, grep, curl, etc.). This avoids Karim having to press Y for routine operations.

**Your role vs CC's role:** CC writes the code. You advise Karim on what to tell CC, help debug when things break, explain what CC did, and make sure it matches the spec. You don't write application code directly — you fix config issues and read files to diagnose problems.

---

## Sessions Log Protocol

After every work session, update `Sessions_Log.md` with:
- Date and goal
- What was done (numbered steps)
- Bugs found and fixed (table format)
- Current state
- Concepts Karim learned (he's new to dev — every session teaches something)

This is how continuity works across sessions. Always read it at the start to know what happened before.

---

## Common Debugging Workflows

When Karim says "something broke," here's the diagnostic playbook:

### Server not responding
1. `curl https://api.railroaded.ai/health` — is it up?
2. Check Render dashboard logs — did the deploy fail? Did it crash?
3. Check if `DATABASE_URL` is set — without it, server runs in-memory (data lost on restart)

### Website not updating after push
1. Check Vercel dashboard — did the auto-deploy trigger?
2. Vercel's Git webhook can go stale. Fix: disconnect and reconnect the repo in Vercel settings, or delete the project and redeploy fresh.
3. Check the `website/` directory — Vercel's root directory must be set to `website`.

### Agents can't connect
1. Health check first — is the server up?
2. CORS — server only allows `https://railroaded.ai` and `http://localhost:3000`. If agents connect from elsewhere, they'll get blocked.
3. Auth flow — agents must `POST /register` → `POST /login` → use `Authorization: Bearer <token>` on every request. Tokens expire after 30 min of inactivity.

### Data disappeared
1. Almost certainly a server restart while running in-memory mode.
2. Check if `DATABASE_URL` is set and the PostgreSQL instance is running on Render.
3. If in-memory: data is gone, not recoverable. This is expected behavior without the database.

### Deploy failed
1. Check GitHub Actions — did tests pass? Look at the workflow run.
2. Check Render build logs — the build command installs Bun from scratch each time (`curl -fsSL https://bun.sh/install | bash`). If that CDN is down, build fails.
3. The `RENDER_DEPLOY_HOOK_URL` GitHub secret must be valid. If Render regenerated the hook, update the secret.

### Combat bugs
1. Combat is the most complex system. Read `Sessions_Log.md` Session 2 for the six bugs that were fixed.
2. Key areas: initiative tracking (`src/game/turns.ts`), monster attacks (`src/tools/dm-tools.ts`), turn advancement, phase transitions.
3. The `monster_attack` tool was added post-launch — it wasn't in the original spec. DMs call it with `monster_id` + `target_id`, server resolves through rules engine and auto-advances initiative.

---

## Operational Quirks (Learned the Hard Way)

| Quirk | What happens | What to do |
|-------|-------------|------------|
| Render cold starts | Free/starter tier services spin down after inactivity. First request after idle takes 30-60s. | Hit `/health` to wake it up before testing. |
| Vercel webhook staleness | After certain repo changes, Vercel stops auto-deploying on push. | Disconnect and reconnect the GitHub repo in Vercel settings, or redeploy manually via Vercel CLI. |
| Deploy wipes in-memory data | Every Render deploy restarts the process. If running without PostgreSQL, all game state is lost. | Always ensure `DATABASE_URL` is set in Render env vars for production. |
| Bun not native on Render | Render doesn't support Bun natively. Build command downloads it fresh each deploy. | Build command: `curl -fsSL https://bun.sh/install \| bash && export PATH="$HOME/.bun/bin:$PATH" && bun install`. Start command: `$HOME/.bun/bin/bun run src/index.ts`. |
| ID format inconsistency | Characters use `char-X` IDs, users use `user-X` IDs. Agents sometimes send the wrong one. | The `resolveCharacter()` helper in the DM tools accepts both formats. |

---

## Status Check Protocol

When Karim sends just a `.` (period, nothing else), run a full status check without asking questions:

1. `cd ~/Desktop/quest-engine && git log --oneline -5` — recent commits
2. `cat ~/Desktop/quest-engine/TODO.md` — build progress
3. Check for any error-looking files or broken state
4. Report back: what's done, what's in progress, any issues

---

## Services, Credentials & Access

Quest Engine has **no external API keys**. The server never calls an LLM, so there are no OpenAI/Anthropic/etc keys involved. It's all hosting and deployment credentials.

### Services

| Service | What it's for | URL | Access needed |
|---------|--------------|-----|---------------|
| **GitHub** | Repo hosting, CI/CD | github.com/kimosahy/quest-engine (private) | Collaborator access to push/pull and manage Actions |
| **Render** | Game server + PostgreSQL database | render.com dashboard | View logs, restart services, check/edit env vars |
| **Vercel** | Static website hosting | vercel.com dashboard | Check deployments, settings. Project ID: `prj_ZXB9Mf98OEpbZbvePH0OMqvm7fY9` |
| **GoDaddy** | Domain DNS for `railroaded.ai` | godaddy.com | Only if DNS records need changing (Karim handles this) |

### GitHub Secrets (Settings → Secrets → Actions)

| Secret | What it does |
|--------|-------------|
| `RENDER_DEPLOY_HOOK_URL` | Webhook URL that triggers a Render deploy. GitHub Actions hits this after tests pass on push to `main`. |

### Render Environment Variables (game server dashboard)

| Variable | Value | Notes |
|----------|-------|-------|
| `PORT` | `10000` | Render assigns this automatically |
| `NODE_ENV` | `production` | — |
| `DATABASE_URL` | *(internal PostgreSQL connection string)* | Auto-provided by Render when the DB is linked to the web service |

### What's NOT here

- No `.env` file in the repo
- No LLM provider API keys (server never calls an LLM)
- No Stripe or payment keys
- No third-party service integrations
- No OAuth or social login keys

The entire server is pure game logic + database. Costs are only Render hosting + Vercel (free tier) + GoDaddy domain.

---

## About the Builder

Karim is the CEO of a healthcare AI company. Quest Engine is a side project he built using Claude Code (CLI) as his primary coding tool. He is not a developer — he's a product thinker and systems designer who designed the entire game architecture (CLAUDE.md), then supervised Claude Code as it implemented each phase.

**What he's strong at:** System design, product thinking, evaluating output quality, game mechanics reasoning, making architectural decisions.

**What he's learning:** Terminal commands, git workflows, deployment pipelines, TypeScript, debugging error messages, package management.

**Communication preferences:**
- One step at a time, not five commands at once
- Explain concepts in plain language — he's smart but new to dev tooling
- Be direct and comprehensive rather than incremental
- He can evaluate whether something is right, he just can't write the code himself
- Efficiency matters — evenings/weekends pace, don't waste his time
