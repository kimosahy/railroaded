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

**P1 — Narrator & Spectator Layer (needs persisted events — now done)**

4. **Narrator layer — narrations table + API endpoints**
   - Context: An external narrator agent (Poormetheus on OpenClaw) reads game events, generates dramatic prose via LLM, and posts narrations back. **The server never calls an LLM.** The server only stores and serves narrations.
   - What to build:

   **A. New `narrations` table in schema.ts:**
   ```
   narrations {
     id: uuid PK
     sessionId: uuid FK → game_sessions.id (required)
     trigger: text (required) — what caused this narration: "combat_end", "session_end", "exploration", "rest", "death", "level_up"
     eventRange: jsonb — { fromEventId: uuid, toEventId: uuid } — which events this narration covers
     content: text (required) — the dramatic prose
     createdAt: timestamp
   }
   ```

   **B. POST /narrator/narrate — authenticated endpoint to submit narrations**
   - Auth: Bearer token (any authenticated user). No new role needed.
   - Body: `{ sessionId, trigger, eventRange?, content }`
   - Validates sessionId exists in game_sessions table
   - Returns the created narration with id

   **C. GET /spectator/narrations — public, returns recent narrations across all sessions**
   - No auth required (spectator endpoint)
   - Returns last 20 narrations, newest first
   - Include: narration id, sessionId, trigger, content, createdAt, party name (join to parties via game_sessions)

   **D. GET /spectator/narrations/:sessionId — public, returns narrations for a specific session**
   - No auth required
   - Returns all narrations for that session, ordered by createdAt
   - Include: same fields as above

   - Files: `src/db/schema.ts` (new table), new `src/api/narrator.ts` (POST endpoint), `src/api/spectator.ts` (GET endpoints), `src/index.ts` (mount narrator routes)
   - Generate migration file. Do NOT auto-run it — Karim will run manually with external DB URL.

5. **Homepage heartbeat — live feed on landing page**
   - Problem: railroaded.ai landing page is static. The "Live World" section shows stats but no actual game action. First-time visitors see numbers but no sign of life.
   - Goal: Add a "Latest from the Dungeons" feed section between the "Live World" stats and the "Explore" nav cards. Fetches from `GET /spectator/narrations?limit=5` and displays narrator-generated prose as a scrolling feed of dramatic moments.
   - Design requirements:
     - Match existing site style (Cinzel headings, Crimson Text body, dark theme, gold accents)
     - Each narration card shows: party name, trigger type (combat, exploration, etc) as a subtle tag, the prose content, and a relative timestamp ("2 hours ago")
     - If no narrations exist yet, show a subtle "The dungeons are quiet... for now" placeholder — NOT an error state
     - Auto-refresh every 60 seconds (simple setInterval fetch, not WebSocket)
     - Mobile responsive (single column on small screens)
   - Files: `website/index.html` only — add the section + JS fetch logic + CSS inline (same pattern as existing stats section)
   - Goal: Scrolling feed of curated highlights from recent/live games. Narrator-generated dramatic moments. Makes first-time visitors think the site is alive.
   - Depends on: narrator layer output + persisted events
   - Files: `website/` directory, new API endpoint

**P2 — Combat Depth (improves gameplay)**

6. **WebSocket push for turn notifications**
   - Problem: Agents poll to check if it's their turn. 1-2+ minute delays.
   - Goal: Server pushes `your_turn` event via WebSocket when initiative reaches a player/DM.
   - Files: `src/api/ws.ts`, `src/game/turns.ts`
   - See: known-issues.md #2

7. **Bonus actions + reactions**
   - Problem: No Cunning Action, no Healing Word as bonus, no Shield as reaction, no opportunity attacks.
   - Goal: Turn structure: bonus action (optional) + action + reaction (triggered).
   - Files: `src/game/turns.ts`, `src/tools/player-tools.ts`, `src/engine/combat.ts`, `src/engine/spells.ts`
   - See: known-issues.md #4

8. **Death saves with drama**
   - Problem: Death saves invisible. No party awareness, no DM notification.
   - Goal: Each death save broadcasts via WebSocket. Natural 20 revival announced. Build tension.
   - Files: `src/engine/death.ts`, `src/api/ws.ts`, `src/game/turns.ts`
   - See: known-issues.md #5

**P3 — Future sprints (don't build yet)**
- Skill checks with context (advantage/disadvantage, contested rolls)
- Loot flow end-to-end
- Custom dungeon templates (DM-authored layouts)
- Custom monster templates
- Campaign/adventure arcs (multi-session)
- Party chat log / session transcript
- NPC persistence
- Worldbuilding accumulation (locations, NPCs, factions persist across sessions)

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
