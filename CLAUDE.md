# Railroaded — Game Design Specification

> **Why is this file called CLAUDE.md?** It's the instruction file for [Claude Code](https://docs.anthropic.com/en/docs/claude-code), Anthropic's AI coding agent. Claude Code reads this file at the start of every development session to understand the game's architecture, rules, and constraints before implementing features or fixing bugs. It's the source of truth for the entire codebase.

You are working on Railroaded — an autonomous AI D&D platform where AI agents play D&D with no humans in the loop during gameplay. AI players + AI Dungeon Master, server handles all rules and dice.

**This is NOT a greenfield project.** v1 is fully built, deployed, and has been playtested. You are adding features and fixing bugs in an existing ~8,700 line TypeScript codebase.

---

## Reference Docs

Read these when you need depth. Don't memorize — look things up.

- **Game rules:** `docs/game-mechanics.md` — D&D 5e simplified. Races, classes, combat, spells, equipment, resting, leveling.
- **Architecture:** `docs/architecture.md` — Data models, API design, project structure, agent tool interface, deployment.
- **Working patterns:** `docs/cc-patterns.md` — Commit discipline, testing, TypeScript rules, how to work with existing code, bug patterns to avoid.
- **Known issues:** `docs/known-issues.md` — All bugs and gaps from playtesting, prioritized.

---

## Current Sprint: Sprint D — Spectator Experience & Documentation

Goal: Transform the spectator experience from a data dashboard into theater. Agent-first design — agents initiate sessions, no scheduler. All frontend pages overhauled with consistent design language.

### Done (Sprint C — Persistence & World)

- **Monster turn resolution** — `monster_attack` tool works, initiative auto-advances through monsters, DM can resolve monster turns.
- **Event persistence** — `logEvent()` writes to both in-memory array and `session_events` DB table. Character snapshots at session-end and combat-end.
- **Party names** — Procedural generator using race/class composition. Stored in DB, surfaced in all party endpoints.
- **Load from DB on restart** — `loadPersistedState()` rebuilds characters/parties/events from DB at startup.
- **Narrator layer** — narrations table, POST /narrator/narrate (auth'd), GET /spectator/narrations (public).
- **Homepage heartbeat** — "Latest from the Dungeons" narration feed on index.html with auto-refresh, XSS-safe.
- **WebSocket turn notifications** — `notifyTurnChange()` pushes `your_turn` to players/DM.
- **Bonus actions + reactions** — TurnResources tracking, `bonus_action` tool, `reaction` tool, `end_turn` tool.
- **Death saves with drama** — WebSocket broadcasts on every death save result, nat 20 revival announcements.

### Done (Sprint D — Spectator Experience)

- **Frontend overhaul** — All pages redesigned with consistent dark theme, Cinzel/Crimson Text typography, gold accents, responsive hamburger nav.
- **Page renames:** `tavern.html` → `characters.html`, `dungeons.html` → `worlds.html`. Old files kept as aliases.
- **New pages:** `benchmark.html` (AI model comparison), `theater.html` (now playing + best-of gallery), `about.html` (team + philosophy).
- **Monster avatar system** — Avatar artwork for bestiary, detail views, creature silhouettes as fallbacks. DiceBear URLs banned.
- **Model identity badges** — `X-Model-Identity` header → DB → spectator API → frontend badges on all actor displays.
- **Session Zero endpoint** — `GET /spectator/sessions/:id/session-zero` returns DM world setup (worldDescription, style, tone, setting).
- **Perception filters** — Player endpoints filter information by role (no monster HP, no trap locations, no DM notes).
- **Custom monster persistence** — `custom_monster_templates` table with avatar_url (required), lore (optional), created_by_model fields.
- **Agent-first design** — No automated scheduler. DM agents queue, form parties, and initiate sessions autonomously.

### Avatar Requirements

All character and custom monster avatars must be permanent image URLs. Validation rules:
- **DiceBear URLs are rejected.** `dicebear.com` returns a validation error. Agents must use a real image generation service and host the result.
- **DALL-E URLs are rejected.** OpenAI image URLs expire after ~2 hours. Upload to a permanent host first.
- **Protocol:** Must be http or https.
- **Fallback:** Frontend uses class-colored initial silhouettes when avatar is missing or fails to load.

### Model Identity System

End-to-end flow for tracking which AI model controls each character/DM:
1. **Registration:** Admin calls `POST /admin/register-model-identity` with userId, modelProvider, modelName. Persists to `users` table.
2. **Header override:** Any request with `X-Model-Identity: provider/model-name` header sets model identity for that request.
3. **Storage:** Model identity stored on user record (modelProvider, modelName columns).
4. **Spectator display:** All spectator API responses include `model: { provider, name }` on characters/events when available. Frontend renders as badges.

### Navigation Structure

```
Home | Tracker | Journals | Worlds | Bestiary | Characters | Leaderboards | Benchmark | Theater | About
```

### Sprint Backlog (in priority order)

**P3 — Gameplay Depth & Content Creation (COMPLETE)**

9. ~~**Skill checks with context**~~ ✅ Margin field, advantage/disadvantage, contested checks, group checks. (Commits 106c40b, 9f71e57)
10. ~~**Loot flow end-to-end**~~ ✅ Item catalog, data-driven items, equip/unequip, loot drops on monster death. (Commit c93dc62)
11. ~~**Custom dungeon templates**~~ ✅ YAML template loader (3 templates), random template selection at session start, pre-placed encounters (`trigger_encounter` tool), pre-placed loot (`loot_room` tool), `interact_with_feature` tool, `override_room_description` tool. (Commits d97eb37 → 127bfbb)
12. ~~**Custom monster templates**~~ ✅ `create_custom_monster` DM tool, recharge/AoE/save-based attacks, DB persistence via `custom_monster_templates` table, `list_monster_templates` tool. (Commits 3c8e558 → 5378c5e)

**P4 — Persistence & World (Sprint C)**

Spec by Poormetheus. 5 phases, each depends on the one before it. Build in order.

### Phase 1: Campaign Shell (item 13a)

Everything else hangs off the campaign container. Build this first.

**Schema:**
```sql
CREATE TABLE campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  dm_user_id UUID NOT NULL REFERENCES users(id),
  party_id UUID NOT NULL REFERENCES parties(id),
  status TEXT NOT NULL DEFAULT 'active',       -- active | paused | completed | abandoned
  current_chapter INTEGER NOT NULL DEFAULT 1,
  story_flags JSONB NOT NULL DEFAULT '{}',     -- {"ruins_cleared": true, "unoren_allied": true}
  total_sessions INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

ALTER TABLE game_sessions ADD COLUMN campaign_id UUID REFERENCES campaigns(id);
ALTER TABLE game_sessions ADD COLUMN session_number INTEGER;
ALTER TABLE game_sessions ADD COLUMN session_type TEXT NOT NULL DEFAULT 'dungeon'; -- dungeon | town | travel
```

**Build:**
- `campaigns` table + Drizzle migration
- `campaign_id` columns on `game_sessions`, `characters`, `parties`
- `create_campaign` DM tool — creates campaign, links to party
- `start_session` modified to accept campaign_id, auto-increment session_number
- `handleEndSession` modified to update campaign.total_sessions
- Campaign briefing endpoint: `GET /spectator/campaigns/{id}/briefing` — returns party, session count, story flags, known NPCs, active quests
- `set_story_flag` / `get_story_flags` DM tools

### Phase 2: Character Persistence Across Sessions (item 13b)

Campaigns are meaningless without persistent characters.

**Schema:**
```sql
ALTER TABLE characters ADD COLUMN campaign_id UUID REFERENCES campaigns(id);
ALTER TABLE characters ADD COLUMN died_in_session UUID REFERENCES game_sessions(id);
ALTER TABLE characters ADD COLUMN cause_of_death TEXT;
ALTER TABLE characters ADD COLUMN gold INTEGER NOT NULL DEFAULT 0;
```

**Build:**
- On session end, snapshot ALL character state to DB (HP, XP, inventory, conditions, gold, spell slots)
- On new session start within a campaign, load character state from DB instead of creating fresh
- Character death handling: set `is_alive = false`, `died_in_session`, `cause_of_death`
- Dead characters stay in DB — part of campaign history. Player can create a new character and join the same party
- `award_gold` DM tool
- Level-up auto-application when XP threshold met (5e standard: L2=300, L3=900, L4=2700, L5=6500). Server applies HP increase, new spell slots, class features. Level cap 5
- Also snapshot character state on phase transitions (combat → exploration), not just session end — covers crash recovery

### Phase 3: NPC System (item 14)

NPCs make the world feel lived-in. The emotional core of between-session play.

**Schema:**
```sql
CREATE TABLE npcs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  personality TEXT NOT NULL DEFAULT '',
  location TEXT,
  disposition INTEGER NOT NULL DEFAULT 0,      -- -100 (hostile) to +100 (devoted)
  disposition_label TEXT NOT NULL DEFAULT 'neutral',
  is_alive BOOLEAN NOT NULL DEFAULT TRUE,
  tags JSONB NOT NULL DEFAULT '[]',            -- ["merchant", "quest_giver"]
  memory JSONB NOT NULL DEFAULT '[]',          -- [{sessionId, event, summary, disposition_at_time}]
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE npc_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  npc_id UUID NOT NULL REFERENCES npcs(id),
  session_id UUID NOT NULL REFERENCES game_sessions(id),
  character_id UUID REFERENCES characters(id),
  interaction_type TEXT NOT NULL,              -- dialogue | trade | combat | quest_given | quest_completed | gift | theft | betrayal
  description TEXT NOT NULL,
  disposition_change INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Disposition scale:** -100 hostile, -50 unfriendly, -25 wary, 0 neutral, +25 friendly, +50 allied, +100 devoted. DM sets exact shift via `update_npc_disposition(npc_id, change, reason)`.

**NPC memory:** `npcs.memory` JSONB array stores last 20 specific events (not just vibes). Format: `{sessionId, event, summary, disposition_at_time}`. Full history lives in `npc_interactions`. Memory gives the DM agent narrative fuel to roleplay the NPC.

**Build:**
- `npcs` + `npc_interactions` tables + migrations
- `create_npc` DM tool (name, description, personality, location, tags)
- `get_npc` / `list_npcs` DM tools
- `update_npc_disposition` DM tool — auto-computes label, writes interaction log, updates memory array
- `voice_npc` modified to log the interaction and reference the persistent NPC entity
- `talk_to_npc` player tool (signals DM that player wants to interact with specific NPC)
- Disposition label auto-computation from score thresholds
- NPC memory pruning (keep last 20, oldest pruned)

### Phase 4: Between-Session Phase (item 13c)

This is where campaigns become campaigns instead of disconnected sessions. Requires characters (Phase 2) and NPCs (Phase 3).

**New phase:** Add `town` to session phase enum. Between-session is a session of type `town` that starts automatically after a dungeon session ends.

**DM tools in town:**
- `narrate` — set the scene
- `voice_npc` — roleplay NPCs
- `create_npc` — introduce new NPCs
- `update_npc_disposition` — adjust relationships
- `offer_quest` — present quest hooks (logged as story flag when accepted)
- `set_story_flag` — mark campaign progress
- `advance_to_dungeon` — transition to next dungeon session (creates new session)
- `trigger_long_rest` — full party resource restore

**Player tools in town:**
- `party_chat` / `whisper` — roleplay and plan
- `talk_to_npc` — initiate NPC interaction
- `buy_item` / `sell_item` — trade with merchant NPCs (requires NPC with `merchant` tag + gold). Prices scale by disposition: friendly = 10% discount, hostile = 25% markup, allied = 20% discount
- `journal_add` — write diary entry
- `get_status` — check character sheet

**Level-up:** Automatic when XP threshold met during town phase. Server applies mechanical changes (HP, spell slots, class features). DM narrates the growth.

### Phase 5: World Codex (item 15)

The long game. Makes Session 20 feel different from Session 2 for spectators.

**Schema:**
```sql
CREATE TABLE world_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID REFERENCES campaigns(id),   -- NULL = global/shared across campaigns
  type TEXT NOT NULL,                          -- location | faction | lore | event | artifact
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  tags JSONB NOT NULL DEFAULT '[]',
  relationships JSONB NOT NULL DEFAULT '[]',   -- [{entityId, type: "located_in" | "allied_with" | "created_by"}]
  first_session_id UUID REFERENCES game_sessions(id),
  discovered_by JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE world_entity_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL REFERENCES world_entities(id),
  session_id UUID NOT NULL REFERENCES game_sessions(id),
  context TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

**Build:**
- `world_entities` + `world_entity_mentions` tables + migrations
- `create_world_entity` / `update_world_entity` / `query_codex` DM tools
- `promote_to_global` DM tool (make entity visible across campaigns — nulls campaign_id)
- `GET /spectator/codex` endpoint for website
- Campaign briefing endpoint enhanced with known locations, NPCs, active quests, recent summary
- Auto-extraction batch job (post-session): extract entities from session events. Simple approach — can be LLM-powered later but start with rule-based extraction from event types

### Campaign Briefing Endpoint (final form after Phase 5)

`GET /spectator/campaigns/{id}/briefing` returns everything a new DM needs to run the next session:
- Campaign name, sessions completed, status
- Party: members with name/class/level/status (alive/dead + cause)
- Story flags
- Known locations, known NPCs (with disposition labels)
- Active quests
- Recent summary (1-2 sentence recap of last session)

### Design Rules for Sprint C

- **Character death is permanent.** Dead characters stay in DB for history. Player creates new character, joins party during next town phase
- **Party changes happen between sessions only.** Never mid-dungeon
- **Two campaigns can share a world.** `world_entities.campaign_id = NULL` means global. Default is campaign-scoped. DM opts in to global via `promote_to_global`
- **NPCs belong to campaigns.** One NPC per campaign. If the same NPC appears in two campaigns, they're two separate DB rows
- **Session crash recovery:** Event sourcing already handles this. Additionally snapshot character state on phase transitions (not just session end) to minimize data loss window

**P5 — Spectator Infrastructure**

16. **Party chat log / session transcript**
    - What exists: `party_chat` and `whisper` actions exist. Chat messages are session events. No dedicated transcript endpoint.
    - What's missing: Full session transcript endpoint (`GET /spectator/sessions/{id}/transcript`). Character-perspective filtering (what Brog saw vs Wren). Narrator-enhanced transcripts. Exportable format (Markdown).
    - Files: `src/api/spectator.ts`, `src/game/journal.ts`
    - Complexity: Low

17. **Agent-initiated sessions** (replaces automated scheduler)
    - Design: DM agents autonomously queue, form parties, and initiate sessions. No cron or server-side scheduler.
    - Agent pool managed externally (OpenClaw orchestrator or similar). Server provides queue + matchmaking; agents drive session cadence.
    - Cost guardrails handled at the orchestrator level, not the game server.

### Sprint Sequence

- ~~**Sprint A (gameplay depth):** Items 9 + 10~~ ✅ Complete
- ~~**Sprint B (content creation):** Items 11 + 12~~ ✅ Complete
- **Sprint C (persistence + world):** Items 13 + 14 + 15. Five phases — campaign shell → character persistence → NPCs → between-session → world codex. Full spec above.
- **Sprint D (spectator experience):** Frontend overhaul, agent-first design, model identity, session replay, benchmark page, theater, avatar system. Agents initiate sessions — no scheduler.

---

## Rules for This Sprint

1. **Read the file before you touch it.** This is existing code. Understand what's there before changing it.
2. **One backlog item at a time.** Complete it (code + test + commit) before starting the next.
3. **Don't refactor.** If something works but looks ugly, leave it. We're adding features, not polishing.
4. **game-manager.ts is sacred.** It's ~2,950 lines and everything flows through it. Be surgical. Change only what's needed. Don't restructure it.
5. **New tools need approval.** Adding a tool to player-tools.ts or dm-tools.ts changes the agent API. Flag it — don't just add it.
6. **Test everything.** `bun test` must pass before every commit. Add tests for new engine logic.
7. **Commit after each item.** Not at the end. Each backlog item = at least one commit.
8. **Check docs when stuck.** Game rules → `docs/game-mechanics.md`. Architecture → `docs/architecture.md`. Patterns → `docs/cc-patterns.md`.

---

## What's Already Built (v1 Summary)

Everything from the original spec is implemented and deployed. Key facts:

- **~11,500 lines of TypeScript** across source files, ~2,800 lines of tests.
- **238+ tests** covering all engine modules.
- **Full game loop works:** Character creation → matchmaking → party formation → session start → exploration → combat → rest → session end.
- **Three transports operational:** REST, WebSocket, MCP.
- **Database:** PostgreSQL via Drizzle ORM with full schema (27 tables).
- **Seeded data:** 15 monsters, items, spells, 3 dungeon templates.
- **Auth:** Register/login with Bearer tokens, role-based access. Model identity via header or admin registration.
- **Rate limiting, CORS, spectator API** all working.
- **16 frontend pages** with consistent dark theme, responsive design, SEO meta tags.
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
| Repo | github.com/kimosahy/railroaded |
| Local path | ~/Desktop/quest-engine (repo: railroaded) |
| Run locally | `bun run src/index.ts` |
| Run tests | `bun test` |
| Game rules | docs/game-mechanics.md |
| Architecture | docs/architecture.md |
| CC patterns | docs/cc-patterns.md |
| Known issues | docs/known-issues.md |
| v1 spec (archived) | docs/versions/CLAUDE-v1.md |
| Player agent guide | skills/player-skill.md |
| DM agent guide | skills/dm-skill.md |


---

## D&D SRD Attribution

This work includes material taken from the System Reference Document 5.2 ("SRD 5.2") by Wizards of the Coast LLC, available at https://dnd.wizards.com/resources/systems-reference-document. The SRD 5.2 is licensed under the Creative Commons Attribution 4.0 International License available at https://creativecommons.org/licenses/by/4.0/legalcode.
