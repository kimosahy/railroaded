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

## Current Sprint: v2 — Combat & Real-Time

Goal: Make combat actually work well. Fix the turn-by-turn experience so playtesting produces fun games, not frustrated agents.

### Sprint Backlog (in priority order)

**P0 — Must fix (combat is broken without these)**

1. **Monster turn resolution flow**
   - Problem: DM has `monster_attack` but no structured flow for "it's the goblin's turn."
   - Goal: When initiative reaches a monster, server notifies DM explicitly. DM can auto-resolve (server picks target + attacks) or manually control each action.
   - Files: `src/game/turns.ts`, `src/tools/dm-tools.ts`, `src/game/game-manager.ts`
   - See: known-issues.md #1

2. **WebSocket push for turn notifications**
   - Problem: Agents poll to check if it's their turn. Delay can be 1-2+ minutes.
   - Goal: Server pushes `your_turn` event via WebSocket when initiative reaches a player/DM. Agent acts immediately.
   - Files: `src/api/ws.ts`, `src/game/turns.ts`
   - See: known-issues.md #2

3. **Bonus actions + reactions**
   - Problem: No Cunning Action, no Healing Word as bonus action, no Shield as reaction, no opportunity attacks.
   - Goal: Turn structure becomes: bonus action (optional) + action + reaction (triggered). Implement for existing class features and spells.
   - Files: `src/game/turns.ts`, `src/tools/player-tools.ts`, `src/engine/combat.ts`, `src/engine/spells.ts`
   - See: known-issues.md #4

**P1 — Should fix (combat is dull without these)**

4. **Death saves with drama**
   - Problem: Death saves happen invisibly. No party awareness, no DM notification per roll.
   - Goal: Each death save broadcasts to party via WebSocket. DM gets explicit notification. Natural 20 revival is announced. Build tension.
   - Files: `src/engine/death.ts`, `src/api/ws.ts`, `src/game/turns.ts`
   - See: known-issues.md #5

5. **Character state persistence audit**
   - Problem: Unclear if HP, spell slots, XP, inventory, conditions survive session boundaries and server restarts.
   - Goal: Verify all character state round-trips through DB correctly. Add tests. Fix any gaps.
   - Files: `src/db/schema.ts`, `src/game/session.ts`, `src/game/game-manager.ts`
   - See: known-issues.md #3

**P2 — Nice to have (improves depth)**

6. **Skill checks with context**
   - Advantage/disadvantage, contested rolls, context-aware DCs, margin-of-success feedback.
   - Files: `src/engine/checks.ts`, `src/tools/dm-tools.ts`
   - See: known-issues.md #6

7. **Loot flow end-to-end**
   - Find → pick up → equip → use in combat → swap gear. Smooth item lifecycle.
   - Files: `src/engine/loot.ts`, `src/tools/player-tools.ts`, `src/game/game-manager.ts`
   - See: known-issues.md #7

**P3 — Future sprints (don't build yet)**
- Custom dungeon templates (DM-authored layouts)
- Custom monster templates
- Campaign/adventure arcs (multi-session)
- Party chat log / session transcript
- NPC persistence

> **KARIM'S NOTES SLOT:** [Karim has additional sprint priorities to add here. Leave this section for his input.]

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

**Problem: Nothing persists.** Game data (journals, rankings, party names, session summaries) is generated during gameplay but lost — likely held in memory and never written to PostgreSQL, or lost on server restart. Every spectator-facing page appears empty. This is the #1 credibility killer and the foundation blocker for everything else.

**Problem: Parties have no names.** Unnamed parties feel procedural. DM agent should generate a thematic party name at formation based on composition and store it in the DB. One prompt addition, displayed everywhere.

**Problem: The site isn't alive.** The spectator experience needs to feel like watching a live performance, not reading logs. Three layers to solve this:

1. **Narrator Layer** — A post-processing LLM that takes raw game events (turn orders, HP changes, skill checks) and produces dramatic prose commentary. Runs after each event resolves. Not part of game logic — purely a presentation layer. Architectural decision needed: where does this LLM call live? Options: server-side (adds cost + external API dependency), dedicated narrator agent on OpenClaw, or post-session batch job.

2. **Homepage Heartbeat** — A scrolling feed on the landing page of curated highlights from recent and live games. Not full logs — dramatic moments generated by the narrator. This is what makes a first-time visitor think the site is alive and click in.

3. **Worldbuilding as Byproduct** — Every session generates lore (locations, NPCs, factions). Accumulate into a living world that grows with each session rather than resetting to empty.

**Priority sequence:**
1. Fix persistence (audit what writes to DB vs what stays in memory)
2. Party names (ship alongside persistence fix)
3. Narrator layer (once events persist reliably)
4. Homepage heartbeat (narrator output surfaced on landing page)

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
