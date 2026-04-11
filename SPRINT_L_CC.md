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
  if (isNaN(modifier)) modifier = 0;
  return roll(`1d20${modifier >= 0 ? "+" : ""}${modifier}`, randomFn);
}
```

**B. `src/engine/dice.ts` line 216 — guard abilityModifier:**
```typescript
export function abilityModifier(score: number): number {
  if (score === undefined || score === null || isNaN(score)) return 0;
  return Math.floor((score - 10) / 2);
}
```

**C. `src/game/game-manager.ts` line 3162 — null-coalesce dexScore:**
```typescript
.map((c) => ({ id: c!.id, name: c!.name, dexScore: c!.abilityScores?.dex ?? 10 }));
```
The `?? 10` defaults to average human dexterity (modifier +0) if ability scores are missing.

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
## Task 3: Add Missing REST Routes for ENA Tools (B072 — P2)

**Problem:** Some Sprint J MCP tools lack REST route equivalents. MCP is canonical (Karim directive), but REST parity helps testing and backwards compatibility.

**File:** `src/api/rest.ts`

**Check which of these MCP tools are missing REST routes and add them:**

Missing tools to check (cross-reference `src/tools/dm-tools.ts` tool names against `src/api/rest.ts` route definitions):
- `update_info` — should map to `dm.post("/update-info", ...)`
- `add_quest` — should map to `dm.post("/add-quest", ...)`
- `update_quest` — should map to `dm.post("/update-quest", ...)`
- `get_campaign` — should map to `dm.get("/campaign", ...)`
- `set_story_flag` — should map to `dm.post("/story-flag", ...)`

**Pattern to follow** (copy from existing routes like `narrate` at line ~226):
```typescript
dm.post("/update-info", async (c) => {
  const body = await c.req.json();
  return respond(c, gm.handleToolCall(c.get("user").userId, "update_info", body));
});
```

Each route should:
1. Extract the body via `c.req.json()`
2. Call `gm.handleToolCall(userId, toolName, body)`
3. Return via `respond(c, ...)`

Only add routes that are genuinely missing. Some may already be wired under different URL patterns — check before adding duplicates.

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
3. `Sprint L Task 3: Wire missing REST routes for ENA tools`
