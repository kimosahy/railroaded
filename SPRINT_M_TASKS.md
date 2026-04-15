# SPRINT M — Story-First Continuity Sprint

**Context:** Operation Cinematic Marathon (Apr 11) ran 65 minutes but story died in the first 2 minutes. Combat stalled after one successful attack, looping 132 times with "You've already used your action this turn." while narration kept cycling 4 canned lines. The infrastructure stayed alive; the story did not.

**Goal:** Make Railroaded capable of producing a real 30-minute game that progresses through multiple scenes, survives combat, and leaves behind a structured event spine for story generation.

**Test runner:** Always use `./test-runner.sh` (30s hard kill), never raw `bun test` — no local Postgres means the connection pool retries forever.

**Commit after EVERY task.** `git add -A && git commit -m "Sprint M Task N: [title]"`. Do not batch commits.

---

## Task 1 — Fix combat turn auto-advance deadlock

**Priority:** P0 — this is the root cause of the marathon failure.

### Root cause

`checkAutoAdvanceTurn()` at `src/game/game-manager.ts` line 475-486:

```typescript
function checkAutoAdvanceTurn(party: GameParty, characterId: string): void {
  if (!party.session || party.session.phase !== "combat") return;
  const current = getCurrentCombatant(party.session);
  if (!current || current.entityId !== characterId) return;

  const resources = getTurnResources(party, characterId);
  // Auto-advance if action AND bonus action are both used
  if (resources.actionUsed && resources.bonusUsed) {
    logEvent(party, "turn_auto_advanced", characterId, { reason: "all_resources_used" });
    advanceTurnSkipDead(party);
  }
}
```

The gate requires `actionUsed && bonusUsed`. Most player turns only consume the action (attack, spell). The agent never explicitly uses a bonus action, so `bonusUsed` stays `false`, and the turn NEVER advances. The agent retries, gets "already used your action," and loops forever.

**Contrast with monster attacks:** `handleMonsterAttack()` (lines ~1389, 1444, 1544, 1604) calls `advanceTurnSkipDead(party)` directly after every attack — no resource check. Monsters always advance. Players don't. That's the asymmetry.

### Fix

Change `checkAutoAdvanceTurn` to advance when the action is used, regardless of bonus action state. The bonus action is optional — most classes at low levels have no bonus action to use. Gating on it traps every character without a relevant bonus action.

**New logic at line 482:**
```typescript
if (resources.actionUsed) {
  logEvent(party, "turn_auto_advanced", characterId, { reason: "action_used" });
  advanceTurnSkipDead(party);
}
```

**Important design note:** This is an intentional temporary bias toward continuity over tactical completeness. Characters who DO have bonus actions (rogue Cunning Action, cleric Healing Word) won't get a chance to use them after their main action in the same auto-advance tick. That's acceptable — the agent can call bonus action BEFORE the main action, or call `end_turn` manually. The alternative (keeping the deadlock) is far worse. Do NOT try to engineer a bonus-action window or delay in this sprint. If this becomes a problem in later playtests, we'll revisit.

### Verification
- Test: character attacks, turn auto-advances to next combatant
- Test: character casts a spell (action), turn auto-advances
- Test: multi-round combat completes without stalling (at least 3 rounds, multiple combatants taking turns)
- Test: character with bonus action can use it before main action and both register

### Files changed
- `src/game/game-manager.ts` line 482: change `resources.actionUsed && resources.bonusUsed` → `resources.actionUsed`

---

## Task 2 — Add combat stall detection and recovery

**Priority:** P0 — defense in depth against any future deadlock variant.

### Problem

Even after fixing Task 1, there's no detection for when combat stops progressing. The marathon ran 63 minutes in a dead loop with no alert, no abort, no recovery. The engine should never silently spin on a dead state.

### Where to add

`src/game/game-manager.ts` — add stall tracking to the session state and check it in the combat action handlers.

### Implementation

**A) Add stall counters to session state.**

In `src/game/session.ts`, add to `SessionState` interface (currently at line ~32):
```typescript
combatStallCount: number;      // consecutive loops with no state-changing action accepted
lastStateChangeAt: Date | null; // timestamp of last accepted state-changing action
```

Initialize both in `enterCombat()` (session.ts line 75) and reset in `exitCombat()` (line 152). Also add default values (`combatStallCount: 0`, `lastStateChangeAt: null`) to `createSession()` (line 55) so existing sessions don't break on the optional-chain access.

**B) Increment stall counter when combat actions are rejected. Reset on success.**

Add two helpers in `game-manager.ts`:
```typescript
export function incrementStallCounter(userId: string): void {
  const party = findPlayerParty(userId) ?? findDMParty(userId);
  if (party?.session && party.session.phase === "combat") {
    party.session.combatStallCount = (party.session.combatStallCount ?? 0) + 1;
  }
}

function resetStallCounter(party: GameParty): void {
  if (party.session) {
    party.session.combatStallCount = 0;
    party.session.lastStateChangeAt = new Date();
  }
}
```

**WHERE TO INCREMENT (preferred — central dispatch):** In `src/api/mcp.ts` at line ~253, the `handleToolsCall` function. After `const result = await executeToolCall(...)`, if `!result.success`, call `gm.incrementStallCounter(userId)`. This covers all 8 "already used your action" rejection paths in one place:
- handleAttack (line 1170)
- handleCast (line 1716)
- handleDodge (line 1957)
- handleDash (line 1973)
- handleDisengage (line 1989)
- handleHelp (line 2005)
- handleHide (line 2021)
- handleBonusAction (line 2234)

Import `incrementStallCounter` from game-manager in mcp.ts. The function is a no-op when not in combat, so calling it on every error is safe.

**Note:** This only covers the MCP path. REST calls (`src/api/rest.ts`) also call the same game-manager handlers but the stall counter won't trigger there. This is fine — agents connect via MCP, not REST. If REST stall tracking is needed later, move the increment into the game-manager handler error paths instead.

**WHERE TO RESET** — call `resetStallCounter(party)` after every successful combat action:
- `handleAttack` — after hit (line ~1268) and miss (line ~1285), before `checkAutoAdvanceTurn`
- `handleMonsterAttack` — after each `advanceTurnSkipDead` call (lines ~1389, 1444, 1544, 1604)
- `handleCast` (line 1686) — after successful spell resolution
- `handleDodge` (line 1948), `handleDash` (line 1964), `handleDisengage` (line 1980) — after successful action
- `handleEndTurn` (line 2352) — after successful turn end
- `handleHelp` and `handleHide` — after successful action

**C) Stall threshold and recovery.**

Add a check after incrementing `combatStallCount`. Threshold: **10 consecutive rejected actions from the same actor**.

When threshold is hit:
1. Log a `combat_stalled` event with full context (current turn, stall count, last successful action timestamp)
2. Force `advanceTurnSkipDead(party)` — skip the stuck actor's turn
3. Reset the stall counter
4. Log `combat_stall_recovered` with the new current combatant

This is NOT an abort — it's a skip. The actor who was stuck gets passed over, and the next combatant in initiative gets their turn. This handles the exact marathon failure mode: Mirelle stuck → after 10 retries, skip to next combatant → combat continues.

**D) Hard abort: 5-minute no-progress timeout (continuity-safe).**

If `lastStateChangeAt` is more than 5 minutes old during combat phase, force-exit combat — but do it cleanly, not just a phase flip. The timeout is a story mutation, so it must be treated as one:

1. Remove all surviving monsters from initiative order
2. Reset all turn resources
3. Do NOT grant XP or loot (this is a failure, not a victory)
4. Log `combat_timeout` as a first-class event with full context:
```typescript
logEvent(party, "combat_timeout", null, {
  reason: "no_state_change_5_minutes",
  stallCount: party.session.combatStallCount,
  survivingMonsters: party.monsters.filter(m => m.isAlive).map(m => m.name),
  currentTurn: getCurrentCombatant(party.session)?.entityId ?? null
});
```
5. THEN call `exitCombat(party.session)` to set phase = exploration
6. Call `stabilizeUnconsciousCharacters(party)` and `snapshotCharacters(party)` for clean state

Check this in `handleGetAvailableActions` (line 1098) — agents call this every loop iteration, so it's the natural polling point. When the timeout fires here, the function should trigger the cleanup THEN return the newly-available exploration actions.

**Why continuity-safe matters:** a forced combat exit that doesn't clean up monster state, resources, or aggro trades a frozen story for a corrupt one. The timeout must produce a state that exploration actions can proceed from cleanly.

### Verification
- Test: simulate 10 consecutive rejected actions from same actor → turn skips to next combatant
- Test: after a stall-skip, combat continues normally
- Test: 5-minute timeout exits combat to exploration phase
- Test: successful actions reset the stall counter

### Files changed
- `src/game/session.ts`: add `combatStallCount`, `lastStateChangeAt` to `SessionState`, initialize in `enterCombat`, reset in `exitCombat`
- `src/game/game-manager.ts`: add `resetStallCounter` helper, call it after successful actions, add stall increment + threshold check, add timeout check

---

## Task 3 — Gate narration on real state change

**Priority:** P1 — prevents fake progress masking engine failures.

### Problem

In the marathon, narration cycled 4 canned combat flavor texts every ~2.5 minutes for 63 minutes while the game state was completely frozen. The narration system (`handleNarrate` at line 3093) accepts any text the DM sends and logs it unconditionally. There's no check for whether the game state has actually changed since the last narration.

This creates the illusion of progress when there is none. Spectators, story artifacts, and the DM agent itself are all misled.

### Fix: duplicate narration suppression

Add a lightweight check in `handleNarrate()` (line 3093 of `game-manager.ts`):

**A) Track recent narration hashes on the session.**

In `SessionState` (session.ts), add:
```typescript
recentNarrationHashes: string[];  // last N narration text hashes
lastEventCountAtNarration: number; // party.events.length at last narration
```

**B) In `handleNarrate`, before logging:**

1. Compute a simple hash of `params.text` (first 100 chars lowercase trimmed — doesn't need to be cryptographic, just dedup)
2. If the hash matches any of the last 5 entries in `recentNarrationHashes`, reject with `{ success: false, error: "Duplicate narration suppressed." }`
3. If `party.events.length === session.lastEventCountAtNarration` (no new events since last narration), and the session is in combat phase, and `combatStallCount > 0`, reject with `{ success: false, error: "No state change since last narration." }`
4. On successful narration, push hash to `recentNarrationHashes` (keep last 5), update `lastEventCountAtNarration`

**Important:** Do NOT suppress narration during exploration or scene transitions — those can legitimately have atmospheric narration without state changes. The suppression only fires during combat when the stall counter is positive. **Non-goal:** do not build a general-purpose narration quality filter. This is strictly a stall-aware dedup gate for combat, not a content moderation layer.

### Verification
- Test: identical narration text submitted twice in a row → second is rejected
- Test: narration during stalled combat (stall count > 0, no new events) → rejected
- Test: narration during normal combat after successful actions → accepted
- Test: narration during exploration → always accepted regardless of event count

### Files changed
- `src/game/session.ts`: add `recentNarrationHashes`, `lastEventCountAtNarration` to `SessionState`. Initialize defaults in `createSession()`: `recentNarrationHashes: []`, `lastEventCountAtNarration: 0`
- `src/game/game-manager.ts`: add dedup + stall-aware gating in `handleNarrate` (line ~3093)

---

## Task 4 — Verify and harden combat exit → exploration transitions

**Priority:** P1 — if combat ends but exploration doesn't resume, the game still dies.

### Problem

The marathon never reached combat resolution, so we can't confirm the transition path works under real conditions. `exitCombat()` in `session.ts` (line 152) sets phase to `exploration`, clears initiative, resets turn resources. But:

1. After `exitCombat`, is the party actually in a state where `move_party` and other exploration actions work? We need to verify the full path: combat end → XP award → level ups → phase = exploration → DM can narrate → DM can move party → next room.

2. `shouldCombatEnd` (session.ts line 206) only checks `!session.initiativeOrder.some(s => s.type === "monster")`. This is correct (combat ends when all monsters are gone from initiative), but what if a monster is dead but not removed from initiative? Check that `removeCombatant` is called on every monster kill path.

### What to do

**A) Trace all monster-kill paths and verify `removeCombatant` is called:**

In `handleAttack` (line ~1240): ✅ `removeCombatant` is called when `killed` is true.

Check these additional kill paths:
- `handleCastSpell` damage spells that kill monsters
- `handleMonsterAttack` (AoE friendly fire? unlikely but check)
- `handleEnvironmentalDamage` if it exists
- Any "instant kill" or condition-based death paths

For each path where a monster can die, verify `removeCombatant(party.session, target.id)` is called AND `shouldCombatEnd` is checked after.

**B) Write an integration test for the full combat lifecycle:**

```
spawn encounter → initiative rolls → player attacks → monster dies →
shouldCombatEnd → exitCombat → phase = exploration → move_party succeeds
```

This test must cover at least 2 combat rounds with multiple actors taking turns. Use `handleAttack`, `handleMonsterAttack`, and `handleEndTurn` to drive the sequence.

### Verification
- Test: full combat lifecycle from spawn to resolution to exploration
- Test: after combat ends, `move_party` to next room succeeds
- Test: after combat ends, DM can narrate (phase is exploration, not stuck in combat)
- Test: multi-kill encounter (3 monsters, kill all) → combat ends correctly
- Test: after combat ends, at least one full post-combat beat works (narrate + move to next room + new encounter can trigger)

### Files changed
- `src/game/game-manager.ts`: fix any missing `removeCombatant` calls on kill paths (if found)
- `tests/`: new integration test for full combat lifecycle

---

## Task 5 — Define and persist the minimum viable story event spine

**Priority:** P2 — needed for post-run story artifact generation. This sprint: internal extraction + tests only. Spectator endpoints deferred to later sprint.

### Problem

Events are logged to `party.events` array and to `session_events` DB table, but they include everything: chat, narration, turn advances, stall counters, etc. There's no way to extract just the story-meaningful beats without filtering through noise.

### What to build (v1 — minimum viable)

**A) Define a `STORY_SPINE_EVENTS` constant** — the event types that constitute a real story beat:

```typescript
const STORY_SPINE_EVENTS = new Set([
  "room_entered",        // scene change
  "combat_start",        // encounter begins
  "attack",              // player combat action (hit or miss)
  "monster_attack",      // monster combat action
  "spell_cast",          // magic used
  "combat_end",          // encounter resolved
  "combat_timeout",      // encounter forcibly ended (Task 2)
  "combat_stalled",      // stall detected (Task 2)
  "character_down",      // dramatic moment
  "death_save",          // tension
  "level_up",            // progression
  "monster_killed",      // victory beat
  "loot_found",          // reward
  "quest_added",         // story hook
  "quest_updated",       // story progress
  "rest_complete",       // recovery beat
  "npc_created",         // new character introduction
]);
```

**Note:** `narration` is intentionally EXCLUDED from the default spine. Raw narration was part of the marathon failure mode (fake progress). Only include narration events that survived Task 3's gating AND were tagged as non-duplicate. If needed, add a `trusted_narration` flag to narration events post-Task 3, and only include those in the spine conditionally.

**B) Add a `extractStorySpine(events)` helper function** in `src/game/game-manager.ts`:

- Filter `party.events` to only `STORY_SPINE_EVENTS` types
- Return them in chronological order
- This is an internal utility, not an API endpoint

**What NOT to build in this sprint:**
- No new spectator endpoints (`/story-spine`, `/story-markdown`) — defer to Sprint N
- No one-line summary generation
- No markdown formatting

The goal is to prove the spine exists and is clean enough to reconstruct a session arc. The presentation layer comes later.

This is a read-only extraction endpoint — it does not modify game state.

### Verification
- Test: after a simulated session with room changes, combat, and narration, `extractStorySpine()` returns only story events in order
- Test: stall/timeout events (from Task 2) appear in the spine as failure beats
- Test: duplicate/suppressed narration events do NOT appear in story spine
- Test: spine is sufficient to reconstruct a chronological session arc (room → encounter → combat beats → resolution → next room)

### Files changed
- `src/game/game-manager.ts`: add `STORY_SPINE_EVENTS` constant and `extractStorySpine()` helper
- `tests/`: test for story spine extraction

---

## Task 6 — Update DM and player skill docs with turn-ending guidance

**Priority:** P2 — prevents agent-side recurrence of the stall pattern.

### Problem

The player skill doc (`skills/player-skill.md`) lists `end_turn` as a tool but doesn't explain when to use it. The DM skill doc (`skills/dm-skill.md`) doesn't mention that player turns auto-advance after action use (post-Task 1 fix). Neither doc warns about the stall pattern.

### What to add

**A) In `skills/player-skill.md`**, in the combat actions section (near line 395 where `end_turn` is documented):

Add a note:
```
**Turn flow:** Your turn auto-ends after you use your action (attack, spell, etc.).
If you want to use a bonus action, use it BEFORE your main action.
If you take no action and want to pass, call `end_turn` explicitly.
Never retry an action that returned an error — call `end_turn` instead.
```

**B) In `skills/dm-skill.md`**, in the combat section (near line 1090):

Add a note:
```
**Combat health:** If a player's turn appears stuck (same error repeated),
the engine will auto-skip after 10 failed attempts. If combat stalls for
5 minutes with no state change, combat auto-exits to exploration.
Monitor for `combat_stalled` and `combat_timeout` events.
```

### Verification
- Manual review: skill docs contain the new guidance
- The text is accurate relative to Tasks 1 and 2 behavior

### Files changed
- `skills/player-skill.md`: add turn flow note near `end_turn` docs
- `skills/dm-skill.md`: add combat health note near combat section

---

## Build order

Tasks 1 → 2 → 3 → 4 → 5 → 6. Strict sequence — each depends on the prior.

Task 1 is the critical fix. If only one task ships, it must be Task 1.
Tasks 2-3 are defense-in-depth. Task 4 is verification. Task 5 is the story artifact layer. Task 6 is documentation.

**After all tasks:** run `./test-runner.sh` to confirm all tests pass.

---

## Acceptance criterion

**Sprint M passes only if a live post-deploy playtest produces at least one multi-scene session with a resolved combat and continued post-combat progression, plus enough trustworthy event spine to write a markdown story artifact from it.**

Unit tests plus prettier logs are not sufficient. The real verification is a live session that moves.
