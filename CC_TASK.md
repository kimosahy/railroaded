You are fixing a flaky test caused by a real application bug. The codebase is a TypeScript/Bun/Hono server with PostgreSQL (Drizzle ORM).

Read CLAUDE.md for full architecture context. Read docs/cc-patterns.md for coding standards.

## Bug: handleEndTurn doesn't allow DM to end monster turns — causes flaky test

### Root Cause (App Bug)
`handleEndTurn` in `src/game/game-manager.ts` (line ~1627) does:
1. `getCharacterForUser(userId)` — fails for DM because DMs don't have characters
2. Even if it found a char, checks `current.entityId !== char.id` — would fail for monsters

DMs control monsters in combat. When it's a monster's turn, the DM should be able to call `end_turn` to advance. Currently impossible — returns "No character found."

### Root Cause (Test Bug)
`tests/game-integration.test.ts` has a helper `advanceToPlayerTurn(players, dm)` (line ~83) that loops calling `handleEndTurn(dm)` to skip monster turns. Since `handleEndTurn(dm)` silently fails (DM has no character), monster turns are never skipped. When a goblin wins initiative (~10% of runs), the dodge test fails with `advanceToPlayerTurn` returning null.

### Fix Required (TWO PARTS)

**Part 1 — Fix handleEndTurn for DM (src/game/game-manager.ts):**
When `getCharacterForUser(userId)` returns null, check if the user is the party's DM. If they are, and the current combatant is a monster (type === "monster"), allow ending the turn. The DM userId is stored on `party.dmUserId`.

Approach:
- If no character found, look up party by DM userId: iterate parties to find one where `party.dmUserId === userId`
- If found and in combat, check if current combatant is a monster
- If so, advance the turn (same logic as the existing success path)
- This is NOT a test-only fix — DM agents need to end monster turns during real gameplay

**Part 2 — No test helper changes needed if Part 1 is done correctly.** The existing `advanceToPlayerTurn` calls `handleEndTurn(dm)` which will now work.

**Part 3 — Add a test specifically for DM ending monster turn:**
Add a test in the "A. Combat Actions" describe block:
```
test("DM can end monster turn", () => {
  // advance to a monster turn
  const party = getPartyForUser(players[0]);
  const session = party?.session;
  if (!session || session.phase !== "combat") return;
  // find if any monster is in initiative, advance to it
  // then call handleEndTurn(dm) and verify success
});
```

### Verification
Run `bun test` 10 times consecutively. The handleDodge test should pass every time (it currently fails ~10% of runs). Command to verify:
```
for i in $(seq 1 10); do bun test 2>&1 | grep -E "handleDodge succeeds|fail$"; done
```
All 10 runs should show 0 fail.

## Instructions
1. Read CLAUDE.md first
2. Fix `handleEndTurn` in `src/game/game-manager.ts` — add DM monster turn logic
3. Add a test for DM ending monster turns
4. Run `bun test` and ensure ALL tests pass
5. Run the 10x verification loop above to confirm flakiness is gone
6. Commit: "fix: handleEndTurn allows DM to end monster turns — fixes flaky dodge test [ie-handleDodge]"

Do NOT modify: CLAUDE.md, TODO.md, Sessions_Log.md, any .env files, any deployment config.
Do NOT push. 
