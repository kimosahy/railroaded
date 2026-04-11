# Sprint L — Bug Fixes & Defensive Guards

**Priority:** P0 combat fix + P1 defensive improvements
**Test runner:** Always use `./test-runner.sh` (30s hard kill). `bun test` hangs without local Postgres.
**Drizzle migrations:** Always create new migration files, never edit existing ones.

---

## Task 1: Fix NaN Initiative in spawn_encounter (B070 — P0)

**Problem:** `spawn_encounter` crashes with `Invalid dice notation: "1d20NaN"`. Combat is completely non-functional.

**Root cause chain:**
1. `src/game/game-manager.ts:3162` — builds player list: `c!.abilityScores.dex`
2. If `abilityScores` is undefined/malformed on any character, `.dex` is `undefined`
3. `src/engine/combat.ts:39` — `abilityModifier(undefined)` → `Math.floor((undefined - 10) / 2)` → `NaN`
4. `src/engine/dice.ts:177` — `rollD20(NaN)` → template literal produces `"1d20NaN"` → dice parser throws

**Fix (3 guards — defense in depth):**

**A. `src/engine/dice.ts` line 177 — guard rollD20 modifier:**
```typescript
export function rollD20(
  modifier: number = 0,
  randomFn?: (sides: number) => number
): DiceRollResult {
  if (!Number.isFinite(modifier)) modifier = 0;
  return roll(`1d20${modifier >= 0 ? "+" : ""}${modifier}`, randomFn);
}
```

**B. `src/engine/dice.ts` line 216 — guard abilityModifier:**
```typescript
export function abilityModifier(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.floor((score - 10) / 2);
}
```

**C. `src/game/game-manager.ts` line 3162 — ALREADY PARTIALLY FIXED upstream:**
Line now reads: `c!.abilityScores.dex ?? (c!.abilityScores as any).dexterity ?? 10`
This handles the `.dex` vs `.dexterity` mismatch and defaults to 10. BUT it doesn't guard against `abilityScores` itself being undefined. Add optional chaining:
```typescript
.map((c) => ({ id: c!.id, name: c!.name, dexScore: c!.abilityScores?.dex ?? (c!.abilityScores as any)?.dexterity ?? 10 }));
```

**Tests:** Add a test in the combat/encounters test file:
- `rollInitiative` with `dexScore: undefined` should NOT throw — should use modifier 0
- `rollD20` with `NaN` modifier should NOT throw — should use modifier 0
- `abilityModifier(undefined)` should return 0

---

## Task 2: Verify Spectator Session Lookup (B071 — P1)

**Problem:** Spectator endpoints return "Session not found" for active sessions. Reported by Poormetheus playtest.

**Analysis:** The spectator routes at `src/api/spectator.ts` (lines 1070-1082, 1220-1234) query the DB via `gameSessionsTable`, NOT in-memory state. This bug may have been caused by wrong session IDs during playtesting.

**Action — add defensive logging, NOT a code rewrite:**

In `src/api/spectator.ts`, at line 1082 (the first "Session not found" return), add a debug log:
```typescript
if (!session) {
  console.warn(`[spectator] Session not found in DB: ${sessionId}`);
  return c.json({ error: "Session not found", code: "NOT_FOUND" }, 404);
}
```

Apply the same pattern at lines 1234 and 1299 (the other "Session not found" returns).

**Verification:** After the fix, run a manual test:
1. Create a session via the normal DM flow
2. Note the session ID from party-state
3. Hit `GET /api/v1/spectator/sessions/{id}` — should return session data
4. If it returns 404, the console.warn will show what ID was looked up

Do NOT rewrite the spectator lookup logic. Just add logging so the next playtest gives us diagnostic data.

---
## Task 3: Audit ENA Tool Exposure — REST, DM Action Discovery, OpenAPI (B072 — P2)

**Problem:** Sprint J added ENA tools to MCP, but it's unclear whether all of them are properly exposed through REST routes AND through the DM action discovery system (`dmActionRoutes` / `getAllowedDMActions`). This is an audit task — do NOT blindly add routes.

**IMPORTANT: Most ENA tools already have REST equivalents under resource-style URLs.** For example:
- `update_info` → `PATCH /info/:infoId` (line ~470)
- `add_quest` → `POST /quest` (line ~415)
- `update_quest` → `PATCH /quest/:quest_id` (line ~420)
- `get_campaign` → `GET /campaign` (line ~343)
- `set_story_flag` → `POST /story-flag` (line ~345)

**Step 1 — Inventory MCP tools vs REST routes:**
Cross-reference every tool in `src/tools/dm-tools.ts` against `src/api/rest.ts`. Build a table:
| MCP Tool Name | REST Route | Exists? |
For each tool, note the REST path if it exists, even if the naming convention differs (e.g., MCP `add_quest` = REST `POST /quest`).

**Step 2 — Check DM action discovery:**
In `src/game/game-manager.ts`, check `dmActionRoutes` and `getAllowedDMActions`. Verify that all ENA tools appear in the action discovery response so the DM agent knows they exist. If any are missing from discovery, add them.

**Step 3 — Only add REST routes for genuinely missing tools:**
If any MCP tool has NO REST equivalent at all (not even under a different URL pattern), add a route following the resource-style convention already in use (`POST /resource`, `PATCH /resource/:id`, `GET /resources`). Do NOT create duplicate alias routes for tools that already have REST equivalents.

**Output:** Add a comment block at the top of your commit message listing the audit results (which tools have REST parity, which were missing, which were added).

---

## Verification Checklist

After all tasks:
1. `./test-runner.sh` — all existing tests pass
2. Manual test: spawn_encounter with 2 goblins — combat starts with valid initiative numbers
3. Manual test: spectator endpoint returns session data for an active session
4. Review git diff before committing — no unintended changes

## Commit Strategy

One commit per task:
1. `Sprint L Task 1: Fix NaN initiative — defensive guards in dice.ts + game-manager.ts`
2. `Sprint L Task 2: Add spectator session lookup logging`
3. `Sprint L Task 3: Audit ENA tool exposure — REST + DM action discovery`
