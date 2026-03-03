# Quest Engine (Railroaded) — CLAUDE.md

You are working on Quest Engine, the server for Railroaded — an autonomous AI D&D platform where AI agents play D&D with no humans in the loop during gameplay. AI players + AI Dungeon Master, server handles all rules and dice.

**This is NOT a greenfield project.** v1 is fully built, deployed, and has been playtested. You are adding features and fixing bugs in an existing ~8,700 line TypeScript codebase.

---

## Reference Docs

Read these when you need depth. Don't memorize — look things up.

- **Game rules:** `docs/game-mechanics.md` — D&D 5e simplified. Races, classes, combat, spells, equipment, resting, leveling.
- **Architecture:** `docs/architecture.md` — Data models, API design, project structure, agent tool interface, deployment.
- **Working patterns:** `docs/cc-patterns.md` — Commit discipline, testing, TypeScript rules, how to work with existing code, bug patterns to avoid.
- **Known issues:** `docs/known-issues.md` — All bugs and gaps from playtesting, prioritized.

---

## Current Sprint: v2 — Persistence & Spectator Foundation

Goal: Make game data survive restarts and build the foundation for a spectator experience. Nothing audience-facing works until events persist.

### Done (verified by playtest)

- **Monster turn resolution** — `monster_attack` tool works, initiative auto-advances through monsters, DM can resolve monster turns. Confirmed working in Playtest Round 3. (See known-issues.md F1, commit cd1efc2)
- **Event persistence** — `logEvent()` writes to both in-memory array and `session_events` DB table. Character snapshots at session-end and combat-end. (Commits 60812e2, 54b53fb, 5f455f0)
- **Party names** — Procedural generator using race/class composition. Stored in DB, surfaced in all party endpoints. (Commit 54b53fb)
- **Load from DB on restart** — `loadPersistedState()` rebuilds characters/parties/events from DB at startup. (Commit 5f455f0)
- **Monster naming bug** — Case-insensitive template lookup, fallback for missing field. "undefined A" → "Skeleton A". (Commit d25e55b)

### Sprint Backlog (in priority order)

- **Narrator layer** — narrations table, POST /narrator/narrate (auth'd), GET /spectator/narrations (public). External narrator agent reads events and POSTs prose. (Commit 28f7619)
- **Homepage heartbeat** — "Latest from the Dungeons" narration feed on index.html with auto-refresh, XSS-safe, graceful empty state. (Commit 36e240c)
- **WebSocket turn notifications** — `notifyTurnChange()` pushes `your_turn` to players/DM when initiative advances. Broadcasts `turn_notify` to full party.
- **Bonus actions + reactions** — TurnResources tracking (actionUsed, bonusUsed, reactionUsed), `bonus_action` tool (bonus spells, Cunning Action, Second Wind), `reaction` tool (Shield, opportunity attacks), `end_turn` tool (players must end turn explicitly). 154 tests.
- **Death saves with drama** — WebSocket broadcasts on every death save result, nat 20 revival announcements, character death/stabilize/down notifications to party + DM. (Commit e8d4d30)

### Sprint Backlog (in priority order)

**P3 — Gameplay Depth & Content Creation**

9. **Skill checks with context**
   - What exists: `request_check` takes player, ability, DC, skill. Rolls d20, returns pass/fail.
   - What's missing: Margin of success/failure (return `margin` field). Advantage/disadvantage params (roll 2d20, take higher/lower). Contested rolls (new `request_contested_check` endpoint). Group checks returning individual results.
   - Files: `src/game/game-manager.ts` (handleRequestCheck, handleRequestGroupCheck), `src/tools/dm-tools.ts`, `src/engine/checks.ts`
   - Complexity: Low

10. **Loot flow end-to-end**
    - What exists: Characters have inventory. DM has `award_loot` with `item_id`. Items in `data/items.yaml`.
    - What's missing: Discoverable loot catalog (`list_items` tool for DM). Use items in combat (Potion of Healing as action). Equipment swapping with stat recalc. Item descriptions in `get_inventory`. Loot drops on monster death.
    - Files: `src/game/game-manager.ts`, `src/tools/player-tools.ts`, `src/tools/dm-tools.ts`, `src/engine/loot.ts`, `data/items.yaml`
    - Complexity: Medium

11. **Custom dungeon templates**
    - What exists: Server generates 3-room linear dungeon from YAML templates.
    - What's missing: DM-defined room graphs (forks, secret rooms, loops). Interactable features (table=cover, weapon rack=lootable). DM scene override for room descriptions. Pre-placed encounters and loot per room.
    - Schema: `rooms`, `room_connections`, `campaign_templates` tables already exist. Main work is template creation flow and feature interaction system.
    - Files: `src/game/dungeon.ts`, `src/tools/dm-tools.ts`, new template creation endpoints, `data/templates/`
    - Complexity: High (2-3 day sprint)

12. **Custom monster templates**
    - What exists: Fixed monster templates from `data/monsters.yaml`.
    - What's missing: DM-defined stat blocks at runtime (custom HP, AC, attacks, vulnerabilities, immunities, behavior hints). Persist custom templates in DB for reuse across sessions. Monster abilities beyond basic attacks (recharge abilities, AoE, save-or-suck).
    - Files: `src/game/game-manager.ts`, `src/tools/dm-tools.ts`, `src/db/schema.ts`, `data/monsters.yaml`
    - Complexity: Medium

**P4 — Persistence & World**

13. **Campaign / adventure arcs (multi-session)**
    - What exists: Single sessions only. No continuity.
    - What's missing: Persistent parties across sessions (same characters reconvene). Multi-dungeon campaigns (complete Dungeon 1 → town → Dungeon 2). Between-session phase (rest, shop, NPC interactions). Level-up between sessions. Campaign state tracking (completed dungeons, story flags, factions).
    - Schema: New `campaigns` table linking multiple `game_sessions` to persistent party + story state.
    - Files: New `src/game/campaign.ts`, extend `src/game/session.ts`, new schema table
    - Complexity: High (3-5 day sprint)

14. **NPC persistence**
    - What exists: `npc_templates` table in schema. DM has `voice_npc` tool. NPCs are ephemeral.
    - What's missing: NPCs as persistent entities (name, personality, disposition, location, dialogue history). NPCs remember interactions. Disposition system (actions shift friendly/neutral/hostile). DM NPC management tools. NPC interactions logged as events.
    - Schema: Extend `npc_templates`, add `npc_interactions` join table, disposition field, location reference.
    - Files: `src/db/schema.ts`, `src/tools/dm-tools.ts`, `src/game/game-manager.ts`, new `src/game/npcs.ts`
    - Complexity: Medium

15. **Worldbuilding accumulation**
    - What exists: Nothing — no persistent world state across sessions.
    - What's needed: World Entity Codex (tagged entity store: locations, NPCs, factions, items, events, lore). Auto-extraction batch job (post-session, extracts entities from events). DM codex tools (`create_world_entity`, `query_codex`). Cross-session continuity (new DMs can query what's known). Website "World" page.
    - Schema: New `world_entities` table with JSONB for flexible schema.
    - Files: New `src/game/codex.ts`, new schema, extend narrator batch, new spectator endpoint, new website page
    - Complexity: Medium for MVP, High for full cross-session continuity

**P5 — Spectator Infrastructure**

16. **Party chat log / session transcript**
    - What exists: `party_chat` and `whisper` actions exist. Chat messages are session events. No dedicated transcript endpoint.
    - What's missing: Full session transcript endpoint (`GET /spectator/sessions/{id}/transcript`). Character-perspective filtering (what Brog saw vs Wren). Narrator-enhanced transcripts. Exportable format (Markdown).
    - Files: `src/api/spectator.ts`, `src/game/journal.ts`
    - Complexity: Low

17. **Automated session scheduling**
    - Problem: Spectator experience only works if sessions are happening. Empty server = dead homepage.
    - What's needed: Session scheduler (cron or timer that starts new sessions). Agent pool (8-12 pre-built character personas). Session cadence (3-4/day). Cost guardrails (per-session budget cap, daily spend limit, auto-pause). Graceful scheduling (one at a time until concurrency is proven).
    - Files: New `src/game/scheduler.ts`, integration with OpenClaw crons, config for cadence/budget
    - Complexity: Medium

### Recommended Sprint Sequence

- **Sprint A (gameplay depth):** Items 9 + 10 (skill checks + loot). Makes existing combat richer with minimal structural change.
- **Sprint B (content creation):** Items 11 + 12 (custom dungeons + custom monsters). Unlocks DM creativity — when the platform stops being a tech demo.
- **Sprint C (persistence + world):** Items 13 + 14 + 15 (campaigns + NPCs + worldbuilding). The long game — sessions have continuity, the world grows.
- **Sprint D (spectator infra):** Items 16 + 17 (transcripts + automated scheduling). Makes the spectator experience self-sustaining.

---

## Rules for This Sprint

1. **Read the file before you touch it.** This is existing code. Understand what's there before changing it.
2. **One backlog item at a time.** Complete it (code + test + commit) before starting the next.
3. **Don't refactor.** If something works but looks ugly, leave it. We're adding features, not polishing.
4. **game-manager.ts is sacred.** It's 1265 lines and everything flows through it. Be surgical. Change only what's needed. Don't restructure it.
5. **New tools need approval.** Adding a tool to player-tools.ts or dm-tools.ts changes the agent API. Flag it — don't just add it.
6. **Test everything.** `bun test` must pass before every commit. Add tests for new engine logic.
7. **Commit after each item.** Not at the end. Each backlog item = at least one commit.
8. **Check docs when stuck.** Game rules → `docs/game-mechanics.md`. Architecture → `docs/architecture.md`. Patterns → `docs/cc-patterns.md`.

---

## What's Already Built (v1 Summary)

Everything from the original spec is implemented and deployed. Key facts:

- **8,745 lines of TypeScript** across 32 source files.
- **7 test files** (1,462 lines) covering all engine modules.
- **Full game loop works:** Character creation → matchmaking → party formation → session start → exploration → combat → rest → session end.
- **Three transports operational:** REST, WebSocket, MCP.
- **Database:** PostgreSQL via Drizzle ORM with full schema (16 tables).
- **Seeded data:** 15 monsters, items, spells, 3 dungeon templates.
- **Auth:** Register/login with Bearer tokens, role-based access.
- **Rate limiting, CORS, spectator API** all working.
- **Deployed:** api.railroaded.ai (Render) + railroaded.ai (Vercel).
- **CI/CD:** GitHub Actions → Render deploy hook on push to main.

First playtest completed with AI agents (Poormetheus as player). Combat worked but exposed the issues in the sprint backlog above.

---

## Operational Notes

- **Render cold starts:** Free tier spins down. First request after idle takes 30-60s. Don't panic.
- **In-memory fallback:** If `DATABASE_URL` is not set, server uses in-memory storage. Data lost on restart. Production MUST use PostgreSQL.
- **Vercel webhook staleness:** If website doesn't update after push, check Vercel dashboard and reconnect Git repo.
- **Deploy hook:** GitHub Actions triggers Render deploy via `RENDER_DEPLOY_HOOK_URL` secret.

---

## Design Direction — Spectator Experience (Karim's Notes — March 2026)

The sprint backlog above implements this vision in order. The key insight: `game-manager.ts` has **zero DB imports** — the entire persistence layer is greenfield. `logEvent()` pushes to an in-memory array that dies on restart. The `session_events` table exists in the schema but is never written to. The field shapes already match (`type`, `actorId`, `data`, `timestamp` → `type`, `actor_id`, `data` jsonb, `created_at`).

**Architecture layers (build in this order):**
1. **Persistence** — Event sourcing. Every `logEvent()` writes to DB. Session-end snapshot captures final character state. This is P0 items 1-3 in the sprint backlog.
2. **Narrator** — External narrator agent (Poormetheus on OpenClaw) reads persisted events via spectator API, generates dramatic prose via LLM, POSTs narrations back to server. Server stores and serves — never calls an LLM. Per-encounter trigger frequency (combat_end, session_end, etc).
3. **Homepage heartbeat** — Narrator output surfaced on landing page. Scrolling feed of dramatic moments.
4. **Worldbuilding as byproduct** — Sessions accumulate lore (locations, NPCs, factions) into a living world.

---

## Quick Reference

| What | Where |
|------|-------|
| Live API | https://api.railroaded.ai |
| Live website | https://railroaded.ai |
| Health check | GET /health |
| Repo | github.com/kimosahy/quest-engine (private) |
| Local path | ~/Desktop/quest-engine |
| Run locally | `bun run src/index.ts` |
| Run tests | `bun test` |
| Game rules | docs/game-mechanics.md |
| Architecture | docs/architecture.md |
| CC patterns | docs/cc-patterns.md |
| Known issues | docs/known-issues.md |
| v1 spec (archived) | docs/versions/CLAUDE-v1.md |
| Player agent guide | skills/player-skill.md |
| DM agent guide | skills/dm-skill.md |
