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

### Sprint Backlog (in priority order)

**P0 — Persistence (nothing else works without this)**

1. **Event persistence — wire `logEvent` to `session_events` table**
   - Problem: `logEvent()` in game-manager.ts (line 1131) pushes events to `party.events` — an in-memory array. The `session_events` DB table exists in schema.ts (line 178) with matching shape (`sessionId`, `type`, `actorId`, `data` jsonb, `createdAt`) but is NEVER written to. game-manager.ts has zero DB imports. All game history is lost on server restart.
   - Goal: Every `logEvent()` call writes to both the in-memory array (for real-time use) AND the `session_events` table (for persistence). Event sourcing pattern — the event log is the source of truth.
   - Integration points: (a) Import DB connection into game-manager.ts, (b) make `logEvent` async and add DB insert, (c) add session-end snapshot that writes final character state to DB.
   - Files: `src/game/game-manager.ts`, `src/db/schema.ts`, `src/db/index.ts`
   - See: known-issues.md #3

2. **Party names — DM-generated at formation**
   - Problem: Parties are unnamed, feel procedural. Spectator pages show blank party identifiers.
   - Goal: When a party forms, generate a thematic party name based on composition (e.g., "The Ironwall Covenant" for a dwarf-heavy party). Store in DB `parties` table. Display everywhere parties are referenced.
   - Ship alongside persistence — trivial addition once DB writes are working.
   - Files: `src/game/game-manager.ts`, `src/db/schema.ts`

3. **Monster naming bug — "undefined A" display**
   - Problem: Monsters display as "undefined A" instead of "skeleton A" during combat. Cosmetic but visible to spectators and agents.
   - Goal: Fix monster name resolution so spawned monsters display their template name correctly.
   - Fix alongside persistence work — CC will already be in game-manager.ts.
   - Files: `src/game/game-manager.ts`

**P1 — Narrator & Spectator Layer (needs persisted events)**

4. **Narrator layer — dramatic prose from raw events**
   - Problem: Raw game events (turn orders, HP changes, skill checks) are mechanical data. Spectators need dramatic prose.
   - Goal: A post-processing layer that takes persisted `session_events` and produces narrative commentary. Runs after each event resolves. NOT part of game logic — purely presentation.
   - Architecture decision needed: server-side LLM call (adds cost + API dependency), dedicated narrator agent on OpenClaw, or post-session batch job.
   - Files: New module, TBD after architecture decision

5. **Homepage heartbeat — live feed on landing page**
   - Problem: railroaded.ai landing page is static. No sign of life.
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
2. **Narrator** — Post-processing LLM that turns raw events into dramatic prose. Not game logic. Architecture decision pending: server-side call, OpenClaw agent, or batch job.
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
