# Quest Engine — TODO

## Phase 1: Foundation
- [x] Project setup (package.json, tsconfig, Hono server, /health endpoint)
- [x] Database schema (Drizzle ORM — characters, parties, sessions, rooms, monsters, items)
- [x] Auth system (register, login, session tokens)
- [x] Dice engine (parse notation, roll, handle advantage/disadvantage, keep highest/lowest)
- [x] Tests for dice engine

## Phase 2: Rules Engine
- [x] Ability checks and saving throws
- [x] Combat: initiative, attack rolls, damage, critical hits
- [x] HP tracking, conditions (unconscious, poisoned, stunned, restrained)
- [x] Death saves
- [x] Spell casting and slot management
- [x] Short rest and long rest mechanics
- [x] Tests for all rules engine components

## Phase 3: Game Data
- [x] Monster stat blocks (YAML → database seed)
- [x] Item definitions (weapons, armor, potions, scrolls)
- [x] Spell definitions
- [x] Campaign templates (3 dungeons with rooms, encounters, loot)
- [x] Character creation (race bonuses, class features, starting equipment)

## Phase 4: Session System
- [x] Party matchmaker (queue, matching algorithm, party creation)
- [x] Session lifecycle (create, start, run, end)
- [x] Tick/turn system (exploration ticks, combat turns, phase transitions)
- [x] Room navigation and dungeon state
- [x] Encounter spawning and monster turns

## Phase 5: Agent Interface
- [x] Player tools (all MCP tools listed above)
- [x] DM tools (all MCP tools listed above)
- [x] MCP server setup with tool discovery and JSON schemas
- [x] REST API endpoints (mirror all tools)
- [x] WebSocket handler (session events, narration push, chat)
- [x] Rate limiting (tick-based)

## Phase 6: Self-Play Testing
- [x] Reference CLI client
- [x] Claude plays as a player agent — create character, queue, explore, fight, rest
- [x] Claude plays as a DM agent — narrate, spawn encounters, voice NPCs, run a session
- [x] Full session test: 4 players + 1 DM complete a dungeon
- [x] Fix everything that breaks

## Phase 7: Spectator & Distribution

_Note: CC built v1 implementations of all original Phase 7 items. However, game data (journals, rankings, party names) is generated during sessions but does not persist — spectator-facing pages appear empty. Phase 7 restructured into sub-phases to fix this properly._

### 7a — Persistence & Identity (Foundation)
- [ ] Audit all game outputs: which write to PostgreSQL vs stay in-memory only
- [ ] Fix persistence for journals, rankings, party data, session summaries
- [ ] DM agent generates party names at formation (stored in DB, displayed everywhere)

### 7b — Narrator Layer (Make It Alive)
- [ ] Design decision: where does narrator LLM live (server / OpenClaw agent / batch job)
- [ ] Narrator post-processor: raw game events → dramatic prose commentary
- [ ] Homepage heartbeat: scrolling feed of curated highlights from live/recent games
- [ ] Worldbuilding accumulation: sessions generate persistent lore (locations, NPCs, factions)

### 7c — Spectator Features (v1 code exists, needs persistence fix first)
- [x] Adventure journal generation from session logs
- [x] Tavern board (forum CRUD)
- [x] Live tracker (WebSocket-fed activity stream)
- [x] Leaderboards

### 7d — Distribution & Packaging
- [x] Static website (Vercel)
- [x] ClawHub skill file — player agent
- [x] ClawHub skill file — DM agent
- [x] Ralph loop client
- [x] Auto-generated OpenAPI spec
- [x] Production setup (Render, GitHub Actions, production.md)
- [x] README with setup and play instructions
