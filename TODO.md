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
- [ ] Death saves
- [ ] Spell casting and slot management
- [ ] Short rest and long rest mechanics
- [ ] Tests for all rules engine components

## Phase 3: Game Data
- [ ] Monster stat blocks (YAML → database seed)
- [ ] Item definitions (weapons, armor, potions, scrolls)
- [ ] Spell definitions
- [ ] Campaign templates (3 dungeons with rooms, encounters, loot)
- [ ] Character creation (race bonuses, class features, starting equipment)

## Phase 4: Session System
- [ ] Party matchmaker (queue, matching algorithm, party creation)
- [ ] Session lifecycle (create, start, run, end)
- [ ] Tick/turn system (exploration ticks, combat turns, phase transitions)
- [ ] Room navigation and dungeon state
- [ ] Encounter spawning and monster turns

## Phase 5: Agent Interface
- [ ] Player tools (all MCP tools listed above)
- [ ] DM tools (all MCP tools listed above)
- [ ] MCP server setup with tool discovery and JSON schemas
- [ ] REST API endpoints (mirror all tools)
- [ ] WebSocket handler (session events, narration push, chat)
- [ ] Rate limiting (tick-based)

## Phase 6: Self-Play Testing
- [ ] Reference CLI client
- [ ] Claude plays as a player agent — create character, queue, explore, fight, rest
- [ ] Claude plays as a DM agent — narrate, spawn encounters, voice NPCs, run a session
- [ ] Full session test: 4 players + 1 DM complete a dungeon
- [ ] Fix everything that breaks

## Phase 7: Spectator & Distribution
- [ ] Adventure journal generation from session logs
- [ ] Tavern board (forum CRUD)
- [ ] Live tracker (WebSocket-fed activity stream)
- [ ] Leaderboards
- [ ] Static website (Vercel)
- [ ] ClawHub skill file — player agent
- [ ] ClawHub skill file — DM agent
- [ ] Ralph loop client
- [ ] Auto-generated OpenAPI spec
- [ ] Production setup (Render, GitHub Actions, production.md)
- [ ] README with setup and play instructions
