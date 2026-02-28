# Quest Engine — CC Working Patterns

How Claude Code should work on this project. Updated as we learn what works.
Last updated: v1 build (Feb 2026).

---

## Commit Discipline

- Commit after completing each TODO item, not at the end of a session.
- Commit message format: `feat: [what]`, `fix: [what]`, `test: [what]`, `chore: [what]`.
- Never bundle unrelated changes in one commit.
- Run tests before committing: `bun test`.

## One Thing at a Time

- Complete one TODO item fully (code + test + commit) before starting the next.
- Don't scaffold multiple files then fill them in later — finish each file.
- If a TODO item is too big, break it into sub-steps and do those one at a time.

## Testing

- Every engine module (`src/engine/*.ts`) must have a corresponding test file.
- Tests live in `tests/` directory, named `[module].test.ts`.
- Test with `bun test` (runs all) or `bun test tests/[file].test.ts` (runs one).
- Write tests for edge cases, not just happy paths. D&D has many edge cases.
- Current test coverage: dice, combat, checks, spells, hp, rest, death.

## TypeScript Rules

- Strict mode. No `any` types.
- All function parameters and return types must be explicitly typed.
- Use the types from `src/types.ts` — don't redeclare.
- Drizzle schema types are the database source of truth.

## Working with Existing Code

This is NOT a greenfield project. v1 is fully built and deployed. Rules for working on existing code:

- **Read before writing.** Before modifying any file, read it fully first. Understand what's there.
- **Don't refactor unless asked.** If something works but looks ugly, leave it. Focus on the sprint task.
- **game-manager.ts is the big one.** 1265 lines, central orchestrator. Most new features touch this file. Be surgical — change only what's needed.
- **Engine modules are pure.** `src/engine/*.ts` files take inputs and return outputs. No database calls, no side effects. Keep them pure.
- **Tools are the API contract.** Adding/changing tools in `player-tools.ts` or `dm-tools.ts` changes what agents can do. This is a product decision — confirm with Karim before adding new tools.

## Error Handling

- Game engine functions should return result objects, not throw.
- API endpoints should catch errors and return proper HTTP status codes.
- WebSocket errors should not crash the connection — log and continue.
- Never swallow errors silently. Always log.

## Data Patterns

- YAML files in `data/` are seeded into PostgreSQL at startup via `src/db/seed.ts`.
- To add new monsters/items/spells: add to YAML → update seed.ts if needed → run migration.
- Campaign templates in `data/templates/` define dungeon layouts (rooms, connections, encounters, loot).

## Debugging

- Server logs to stdout. Check Render dashboard for production logs.
- Health check: `curl https://api.railroaded.ai/health`
- Local dev: `bun run src/index.ts` (needs DATABASE_URL or falls back to in-memory).
- Tests: `bun test` — all engine tests should pass before any commit.

## Session 2 Lessons (Bug Patterns to Avoid)

These bugs were found during first playtest. They represent common mistake patterns:

1. **Missing DM tools** — If the DM needs to do something, there must be a tool for it. Don't assume narrative tools cover mechanical actions.
2. **Phase-gating gaps** — `advance-scene` didn't check if combat was active. Every state-changing tool must validate current phase.
3. **Route-level auth confusion** — Player-only middleware was applied to DM routes. Check middleware chain when adding new endpoints.
4. **ID format inconsistency** — Some tools expected `char-X`, others `user-X`. The `resolveCharacter()` helper accepts both. Use it everywhere.
5. **Room state drift** — Room names changed unexpectedly because advance-scene logic was wrong. State mutations must be deterministic.
6. **Proficiency data gaps** — Racial weapon proficiencies weren't applied during character creation. Check all data flows end-to-end.
