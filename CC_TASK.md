# CC Task — 7 Bug Fixes (IE Round 1 Failures + CC Skips)

**CRITICAL RULE: DO NOT change any existing response field names, types, or structures. Only ADD new fields. Existing tests rely on current response shapes — changing them causes regressions. Run `bun test` after EACH bug fix before moving to the next.**

---

## B011 (P0): get_party returns null IDs for all party members

**File:** `src/game/game-manager.ts` — `handleGetParty()` (line ~624)

**Root cause:** The member mapping omits `id` and `characterId` fields entirely. Players can't target each other for whisper, help, or heals.

**Current code:**
```ts
.map((c) => ({
  name: c!.name,
  class: c!.class,
  race: c!.race,
  level: c!.level,
  condition: c!.hpCurrent > c!.hpMax / 2 ? "healthy" : c!.hpCurrent > 0 ? "wounded" : "unconscious",
}));
```

**Fix:** Add `id: c!.id` to the member mapping object. That's it. One line.

```ts
.map((c) => ({
  id: c!.id,
  name: c!.name,
  class: c!.class,
  race: c!.race,
  level: c!.level,
  condition: c!.hpCurrent > c!.hpMax / 2 ? "healthy" : c!.hpCurrent > 0 ? "wounded" : "unconscious",
}));
```

**Test:** Write one test — form party, call handleGetParty, assert every member has a non-null `id` field.

**DO NOT** rename any existing fields or change the response wrapper structure.

---

## B015 (P1): Spell cast response lacks hit/miss information

**File:** `src/game/game-manager.ts` — `handleCast()` (line ~1052)

**Root cause:** For damage spells targeting monsters, `handleCast` applies damage without rolling to hit. Attack spells (Fire Bolt, Sacred Flame) should check hit/miss like `handleAttack` does. The response only returns `{spell, effect, remainingSlots}` — agents have no idea if the spell connected.

**Current behavior:** `castSpell()` in `src/engine/spells.ts` rolls damage dice but not an attack roll. `handleCast` then applies that damage directly to the target monster — it always hits.

**Fix (two parts):**

1. **Add attack roll for non-save, non-healing damage spells.** In `handleCast`, after `castSpell()` succeeds and before applying damage to a monster target, roll a spell attack: d20 + ability modifier (INT for wizard, WIS for cleric) + proficiency bonus vs target AC. Only apply damage on hit. This matches how `handleAttack` works for weapons.

   Use the existing `resolveAttack` function from `src/engine/combat.ts` if it accepts custom to-hit values. Otherwise compute inline:
   ```ts
   const abilityMod = abilityModifier(char.abilityScores[spell.abilityForDamage ?? 'int']);
   const toHit = abilityMod + proficiencyBonus(char.level);
   const attackRoll = roll("1d20");
   const naturalRoll = attackRoll.total;
   const totalToHit = naturalRoll + toHit;
   const critical = naturalRoll === 20;
   const hit = critical || totalToHit >= target.ac;
   ```

   **Exception:** Save-based spells (e.g., Sacred Flame — save_ability defined on spell) should NOT use attack rolls. They use saving throws, which the current auto-hit behavior approximates. Leave save-based spells as-is for now. Only add attack rolls for spells that have `spell.abilityForDamage` but NOT `spell.save_ability`.

2. **Enrich the response for damage spells.** Keep existing fields (`spell`, `effect`, `remainingSlots`) but ADD new fields when a monster was targeted:
   ```ts
   data: {
     spell: params.spell_name,
     effect: result.totalEffect,
     remainingSlots: result.remainingSlots,
     // NEW fields (only present for damage spells targeting monsters):
     hit: boolean,
     naturalRoll: number,
     targetName: string,
     targetHP: number,
     killed: boolean,
   }
   ```

**Test:** Write tests for: (a) attack spell hits monster — damage applied, response has hit/naturalRoll/targetHP; (b) attack spell misses — no damage, response has hit:false; (c) healing spell — unchanged behavior, no attack roll; (d) save-based spell — unchanged behavior.

**DO NOT** change the `castSpell()` function in `spells.ts`. All attack roll logic goes in `handleCast` in `game-manager.ts`.

---

## B016 (P1): spawn-encounter with flat params crashes with internal error

**File:** `src/game/game-manager.ts` — `handleSpawnEncounter()` (line ~1972)

**Root cause:** Function signature expects `params.monsters` as an array. When agent sends flat format `{monster_type: "bandit", count: 3}`, `params.monsters` is undefined → `.map()` crashes → unhandled error leaks to client as "undefined is not an object".

**Fix:** At the top of `handleSpawnEncounter`, normalize the input:
```ts
// Normalize flat format to array format
let monsterList = params.monsters;
if (!monsterList && (params as any).monster_type) {
  monsterList = [{ template_name: (params as any).monster_type, count: (params as any).count ?? 1 }];
}
if (!monsterList || !Array.isArray(monsterList) || monsterList.length === 0) {
  return { success: false, error: "Expected 'monsters' array (e.g., [{template_name: 'goblin', count: 2}]) or flat format {monster_type: 'goblin', count: 2}" };
}
```

Then use `monsterList` instead of `params.monsters` for the rest of the function.

**Test:** (a) flat format `{monster_type: "goblin", count: 2}` spawns 2 goblins; (b) array format still works; (c) empty/missing params returns 400 with helpful error message.

---

## B017 (P1): spawn-encounter creates "unknown" monsters — template lookup misses agent param names

**File:** `src/game/game-manager.ts` — `handleSpawnEncounter()` (line ~1981)

**Root cause:** Line reads `m.template_name ?? (m as Record<string, unknown>).name`. But agents send `type` (from the old `{type: "bandit", count: 2}` format). Neither `template_name` nor `name` matches `type`, so `rawName` defaults to `"unknown"`.

**Fix:** Add `type` to the fallback chain:
```ts
const rawName = m.template_name ?? (m as any).type ?? (m as any).name ?? "unknown";
```

That's it. One line change.

**Test:** Spawn with `{monsters: [{type: "goblin", count: 1}]}` — monster should be named "Goblin A" not "unknown A".

---

## B020 (P2): Narration text not persisted in session events

**File:** `src/game/game-manager.ts` — `handleNarrate()` (line ~1947)

**Root cause:** The handler expects `params.text` but agents may send `params.message`. When `params.text` is undefined, `logEvent` stores `{ text: undefined }` which serializes as `{}` in JSON (undefined values are stripped).

The code itself is correct IF the agent sends `text`. But since this is an agent-facing API, it should accept both.

**Fix:** At the top of `handleNarrate`, normalize the param:
```ts
const text = params.text ?? (params as any).message;
if (!text || typeof text !== 'string' || text.trim().length === 0) {
  return { success: false, error: "Narration text is required. Send {text: '...'}" };
}
```

Then use `text` (the local variable) instead of `params.text` for `logEvent` and the return value.

**Also fix `handleNarrateTo`** the same way — accept `params.text ?? (params as any).message`.

**Test:** (a) narrate with `{text: "hello"}` — event data has text; (b) narrate with `{message: "hello"}` — same result; (c) narrate with empty body — 400 error.

---

## B022 (P2): DM queue endpoint undiscoverable — unhelpful 403 error

**File:** `src/api/rest.ts` — player queue route (line ~147)

**Root cause:** Player queue is at `player.post("/queue")` which has `requireRole("player")` middleware. DMs hitting `/api/v1/queue` get "Forbidden — requires 'player' role, you are 'dm'" with no guidance.

**Fix (minimal, don't restructure routes):** In the `requireRole` middleware or in the player queue handler specifically, when a DM hits the player queue endpoint, return a more helpful error:

Option A (preferred — in rest.ts, add a catch-all at the player router level):
Before the player routes, add:
```ts
// Helpful redirect for DMs hitting player endpoints
player.post("/queue", async (c, next) => {
  const user = c.get("user");
  if (user.role === "dm") {
    return c.json({ error: "DMs use /api/v1/dm/queue to join matchmaking.", code: "WRONG_ENDPOINT" }, 400);
  }
  await next();
});
```

Wait — this would conflict with the existing route. Instead, modify the existing player queue handler to check role first:
```ts
player.post("/queue", (c) => {
  const user = c.get("user");
  if (user.role === "dm") {
    return c.json({ error: "DMs use POST /api/v1/dm/queue to join matchmaking.", code: "WRONG_ENDPOINT" }, 400);
  }
  return respond(c, gm.handleQueueForParty(user.userId));
});
```

Actually — the `requireRole("player")` middleware on the player router will reject DMs before reaching this handler. So the fix needs to be in the middleware itself, OR add a parallel route on the DM router.

**Simplest fix:** The `/api/v1/dm/queue` route already exists (line 327). The fix is documentation, not code. Update `skills/dm-skill.md` to clearly show DMs use `/api/v1/dm/queue`. And improve the `requireRole` error message to include the user's actual role and suggest the correct path prefix:

In `src/api/auth.ts` or wherever `requireRole` is defined, change the error message from:
```
"Forbidden — requires 'player' role, you are 'dm'"
```
to:
```
"This endpoint requires '${required}' role. You are '${actual}'. DM endpoints are at /api/v1/dm/*"
```

**Test:** DM calling player queue gets helpful error mentioning /api/v1/dm/queue.

---

## B023 (P2): monster-attack on dead/out-of-turn monster returns empty 200

**File:** `src/game/game-manager.ts` — `handleMonsterAttack()` (line ~808)

**Root cause unclear:** The code at lines 818-822 DOES return proper errors for wrong turn and dead monsters. The empty 200 response suggests the code is taking a path that returns `{ success: true }` with no data, which `respond()` in rest.ts sends as `c.json(undefined)` → empty body.

Most likely scenario: the monster_id passed by the agent didn't match exactly (e.g., "monster1" vs "monster-1"), so the `getCurrentCombatant` check passed (didn't match, fell through to a different branch) or the request hit a try-catch that swallowed the error.

**Fix:** Add a catch-all at the end of `handleMonsterAttack` to ensure every code path returns a meaningful response. Also add input validation at the top:

```ts
if (!params.monster_id) return { success: false, error: "monster_id is required." };
if (!params.target_id) return { success: false, error: "target_id is required." };
```

Also check: does the monster-attack function have a path that falls through without returning? Scan for any early returns that might return `undefined`. Add `console.error` logging before every error return so we can diagnose via server logs if it happens again.

**Test:** (a) monster-attack with dead monster returns error "not found or dead"; (b) monster-attack with wrong-turn monster returns "not X's turn"; (c) monster-attack with empty params returns validation error.

---

## Priority Order

1. **B011** — one-line fix, P0, unblocks player coordination
2. **B017** — one-line fix, P1, unblocks spawn-encounter with `type` param
3. **B016** — small fix, P1, unblocks flat-format spawn-encounter
4. **B015** — medium fix, P1, spell combat feedback (most complex)
5. **B020** — small fix, P2, narration persistence
6. **B022** — small fix, P2, better error message
7. **B023** — investigation + fix, P2, empty response diagnosis

Run `bun test` after each fix. Commit after each fix passes. Do NOT batch.
