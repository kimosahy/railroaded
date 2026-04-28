# CC-260428-SESSION-SURVIVAL — Railroaded Session Survival (Bug Bundle v1)

**Commissioned by:** Muhammad (CTO) via Ram Prime
**Venture:** Railroaded
**Source specs:** MF-027 (`RAILROADED_BUG_BUNDLE_2026-04_REMEDIATION_SPEC.md`), MF-008 (F-5)
**Scope:** P0-2 (softlock), P0-3 (cast turn economy), P1-7 (phase gating), F-5 (room transition), P1-5 (skill-check contract)
**Repo:** `kimosahy/railroaded` — branch from latest `main`
**Branch name:** `atlas/session-survival`
**Commit format:** `Atlas build (Ram): [description]`

---

## 1. What You Are Building

Five fixes that address the two biggest causes of sub-60-minute sessions: state deadlocks and turn-economy bugs.

**P0-2 — All-PCs-Down Softlock Fix.** When all PCs are unconscious and stable with no hostiles, the session currently deadlocks forever — PCs can't long rest (requires consciousness), can't heal (healer also unconscious), and no auto-recovery exists. You are adding a two-part hybrid: (1) a DM narration interrupt giving the DM 60 seconds to narrate a rescue, (2) a wallclock auto-revive that wakes one PC at 1 HP after 60 seconds if the DM doesn't act.

**P0-3 — Cast Turn Economy Fix.** `checkAutoAdvanceTurn` auto-advances the turn the moment `actionUsed` becomes true. This means casting a spell burns the player's entire turn — no bonus action, no movement afterward. You are implementing a tiered autopilot: when the action is used, the existing 45s autopilot timer reschedules to a 10-second grace window. The agent has 10 seconds to use bonus action, move, or call `end_turn`. If both action and bonus are used, the turn advances immediately. No new timer mechanism — reuses CC Doc 1's autopilot infrastructure with a shorter fuse.

**P1-7 — Phase Gating Verification + Observability.** `shouldCombatEnd` already correctly checks for monsters. You are auditing all `exitCombat` call sites to verify none bypass this check, and adding an edge-triggered observability log for the all-PCs-down-with-hostiles state. This task is merged with P0-2 below.

**F-5 — Room Transition Block During Combat.** `handleMove` allows room transitions during combat with no phase check. You are adding a combat-phase guard.

**P1-5 — Skill-Check Contract.** No skill-check handler exists. Lockpicking, trap disarming, and other non-combat checks return no roll, DC, or result. You are adding a generalizable `handleSkillCheck` endpoint with a `{roll, dc, success, narrative}` response shape.

---

## 2. Architecture Overview

```
P0-2: Softlock Detection + Recovery
──────────────────────────────────────────────────────────────
After exitCombat / stabilizeUnconsciousCharacters:
  └─► check: all PCs unconscious + stable + no hostiles?
      └─► YES → start 60s DM grace timer
          └─► inject system event to DM: "narrate recovery"
          └─► if DM acts within 60s: DM narration is canonical, cancel timer
          └─► if DM silent after 60s: auto-revive one PC at 1 HP
              └─► pick PC with longest stable duration
              └─► clear unconscious condition, set HP to 1
              └─► log system narration: "[PC] stirs awake"
      └─► NO → normal flow, no intervention

P0-3: Turn Economy (Tiered Autopilot)
──────────────────────────────────────────────────────────────
Before (broken):
  handleCast/handleAttack/etc → setTurnResources(actionUsed: true)
    → checkAutoAdvanceTurn → actionUsed? → advanceTurnSkipDead
    → turn ends immediately, player loses bonus action + movement

After (fixed):
  handleCast/handleAttack/etc → setTurnResources(actionUsed: true)
    → markCharacterAction → cancel 45s autopilot timer
    → checkAutoAdvanceTurn:
        if actionUsed && bonusUsed → advanceTurnSkipDead (immediate)
        if actionUsed && !bonusUsed → cancel 45s timer, start 10s grace timer
    → agent has 10s to use bonus action / movement / end_turn
    → if agent acts within 10s: markCharacterAction cancels 10s timer,
      checkAutoAdvanceTurn re-evaluates
    → if nothing in 10s: grace timer fires, advanceTurnSkipDead

P1-7: Phase Gating
──────────────────────────────────────────────────────────────
shouldCombatEnd(session):
  Before: !initiativeOrder.some(s => s.type === "monster")
  After:  !initiativeOrder.some(s => s.type === "monster")
          AND initiativeOrder.some(s => s.type === "player")
          (combat continues if hostiles AND players both remain,
           even if all players are unconscious — DM drives monster turns)

F-5: Room Transition Guard
──────────────────────────────────────────────────────────────
handleMove:
  if (party?.session?.phase === "combat")
    → return { success: false, error: "Cannot move during combat." }

P1-5: Skill-Check Contract
──────────────────────────────────────────────────────────────
New POST /api/v1/skill-check endpoint
  → handleSkillCheck(userId, { skill, target_id?, dc? })
  → response: { roll, modifier, total, dc, success, narrative }
```

---

## 3. Preservation Requirement (from MF SPEC §3)

The `party_chat` → DM scene rewrite → encounter spawn loop is the product thesis. Any fix in this CC doc must NOT regress this loop. Specifically:

- Do NOT add stricter validation to DM tool calls (room rewrite, NPC spawn, encounter spawn)
- Do NOT gate DM narrative actions on PC consciousness state
- Do NOT restrict `handleAdvanceScene` beyond the existing combat-phase block

If any task risks this loop, add a comment: `// PRESERVATION: do not restrict DM narrative tools per MF SPEC §3`

---

## 4. Build Tasks

### Task 1 — P0-3: Tiered autopilot (cast burns whole turn)

**What:** Remove the `actionUsed`-alone auto-advance from `checkAutoAdvanceTurn`. Replace with a tiered autopilot: when a player uses their action, the existing 45s autopilot timer reschedules to 10s. The agent has 10 seconds to use bonus action/movement before the turn auto-advances. No new timer mechanism — reuses CC Doc 1's autopilot infrastructure.

**Three advance mechanisms after this change:**
- **(a) All resources used:** `checkAutoAdvanceTurn` auto-advances when `actionUsed && bonusUsed` (immediate).
- **(b) Tiered autopilot grace:** after action used, timer reschedules to 10s. If nothing happens, autopilot fires and advances turn.
- **(c) Explicit `end_turn`:** agent calls `handleEndTurn` (already exists). Immediate advance.

**File:** `src/game/game-manager.ts`

**Step 1a — Add tiered autopilot constant.**

Near the existing `AUTOPILOT_TIMEOUT_MS` declaration (grep for `const AUTOPILOT_TIMEOUT_MS`), add:

```ts
/** Post-action grace period. When a player uses their action but has bonus/movement remaining,
 *  the autopilot timer reschedules to this shorter window instead of the full 45s.
 *  Tunable: RAILROADED_POST_ACTION_GRACE_SECONDS env var. */
const POST_ACTION_GRACE_MS = parseInt(process.env.RAILROADED_POST_ACTION_GRACE_SECONDS ?? "10", 10) * 1000;
```

**Step 1b — Modify `checkAutoAdvanceTurn`.**

Grep for `function checkAutoAdvanceTurn`. Replace the ENTIRE function body:

```ts
function checkAutoAdvanceTurn(party: GameParty, characterId: string): void {
  if (!party.session || party.session.phase !== "combat") return;
  const current = getCurrentCombatant(party.session);
  if (!current || current.entityId !== characterId) return;

  const resources = getTurnResources(party, characterId);

  // Auto-advance immediately only when ALL combat resources are used.
  if (resources.actionUsed && resources.bonusUsed) {
    logEvent(party, "turn_auto_advanced", characterId, { reason: "all_resources_used" });
    advanceTurnSkipDead(party);
    return;
  }

  // If action is used but bonus remains, reschedule autopilot to short grace window.
  // Agent has POST_ACTION_GRACE_MS (default 10s) to use bonus action, move, or call end_turn.
  // If nothing happens, the rescheduled autopilot fires and advances the turn.
  if (resources.actionUsed && !resources.bonusUsed) {
    // Cancel existing 45s timer and start a 10s timer.
    cancelAutopilotTimer(party.id, characterId);
    const timerKey = `${party.id}:${characterId}:${party.session.currentTurn}:grace`;
    if (autopilotTimers.has(timerKey)) return; // already rescheduled

    const timer = setTimeout(() => {
      autopilotTimers.delete(timerKey);
      // Re-validate: still this character's turn?
      if (!party.session || party.session.phase !== "combat") return;
      const stillCurrent = getCurrentCombatant(party.session);
      if (!stillCurrent || stillCurrent.entityId !== characterId) return;

      logEvent(party, "turn_auto_advanced", characterId, { reason: "post_action_grace_expired" });
      advanceTurnSkipDead(party);
    }, POST_ACTION_GRACE_MS);

    autopilotTimers.set(timerKey, timer);
  }
}
```

**Why this works:** The existing `markCharacterAction(char)` (CC Doc 1) fires on every player action. It cancels the autopilot timer and updates `lastActionAt`. Then `checkAutoAdvanceTurn` runs. If `actionUsed && bonusUsed`, turn advances immediately. If only `actionUsed`, the 45s timer was just cancelled by `markCharacterAction` — we restart it as a 10s grace timer. If the agent uses their bonus action within 10s, `markCharacterAction` fires again, cancels the 10s timer, `checkAutoAdvanceTurn` sees `actionUsed && bonusUsed`, and advances immediately. If nothing happens in 10s, the grace timer fires and advances the turn.

**Sprint M safety:** Characters without bonus actions use their action, `checkAutoAdvanceTurn` sees `actionUsed && !bonusUsed`, starts a 10s grace timer. Timer fires after 10s — turn advances. No deadlock. Maximum 10s wait vs Sprint M's infinite deadlock.

**Step 1c — Update action handler responses to include turn status.**

Every player action handler that calls `checkAutoAdvanceTurn` should include turn status in its response. Add to the `data` object in each handler's success response:

```ts
turnStatus: {
  actionUsed: resources.actionUsed,
  bonusAvailable: !resources.bonusUsed,
  canEndTurn: true,
}
```

Grep for all `checkAutoAdvanceTurn(party, char.id)` call sites (~14 sites). At each one, ensure the handler's success return includes the `turnStatus` object. Error responses don't need it.

**Step 1d — Update tests.**

Grep for tests that assert `turn_auto_advanced` with `reason: "action_used"`. Update:
- Assert turn does NOT auto-advance immediately after action alone (new behavior)
- Assert turn auto-advances after 10s grace with `reason: "post_action_grace_expired"` (use Jest fake timers)
- Assert turn DOES auto-advance immediately after action + bonus used with `reason: "all_resources_used"`
- Assert `end_turn` still advances immediately

---

### Task 2 — P1-7 + P0-2: Phase gating + softlock recovery (merged)

**What:** (a) Audit all `exitCombat` call sites to verify phase gating is correct. (b) Add observability log with edge-trigger debounce for all-PCs-down-with-hostiles. (c) Detect and recover from the all-PCs-down-stable softlock.

**Note:** `shouldCombatEnd` in `session.ts` already checks `!initiativeOrder.some(s => s.type === "monster")` — combat only ends when no monsters remain. This is already correct. The audit (Step 2a) verifies no code path bypasses this check. The softlock (P0-2) happens AFTER combat correctly ends: all monsters dead, all PCs unconscious+stable, no way to recover.

**File:** `src/game/game-manager.ts` (primary), `src/game/session.ts` (verify only)

**Step 2a — Audit `exitCombat` call sites.**

Grep for `exitCombat(` in `game-manager.ts`. For each call site, verify it is gated on `shouldCombatEnd(party.session)`. The "all_players_dead" sites (grep for `reason: "all_players_dead"`) are already gated. The `checkCombatTimeout` stall handler (grep for `function checkCombatTimeout`) calls `exitCombat` unconditionally after 5 minutes — this is correct (safety-net timeout). If any other ungated `exitCombat` site is found, add the `shouldCombatEnd` gate. Log any findings in the commit message.

**Step 2b — Add edge-triggered observability log for all-PCs-down-with-hostiles.**

Add state tracking for debounce:

```ts
/** Per-party flag: last emitted all-PCs-down state. Only log on transition into the state. */
const lastAllPcsDownState = new Map<string, boolean>();
```

At each site where a PC goes to 0 HP or is removed from initiative (grep for `removeCombatant(party.session, char.id)` and `handleDropToZero`), add after the state change:

```ts
const allPCsDown = party.members.every(mid => {
  const m = characters.get(mid);
  return !m || m.hpCurrent <= 0 || m.conditions.includes("unconscious") || m.conditions.includes("dead");
});
const hasHostiles = party.session?.initiativeOrder.some(s => s.type === "monster") ?? false;
const wasDown = lastAllPcsDownState.get(party.id) ?? false;

if (allPCsDown && hasHostiles && !wasDown) {
  lastAllPcsDownState.set(party.id, true);
  logEvent(party, "all_pcs_down_hostiles_remain", null, {
    monstersRemaining: party.session!.initiativeOrder.filter(s => s.type === "monster").length,
  });
} else if (!allPCsDown && wasDown) {
  lastAllPcsDownState.set(party.id, false);
}
```

This only logs on TRANSITION into all-down state. Repeated HP ticks don't spam.

Clear the flag on combat end and session end: `lastAllPcsDownState.delete(party.id);`

---

### Task 3 — P0-2: All-PCs-down softlock fix

**What:** Detect the softlock state (all PCs unconscious + stable, no hostiles, phase = exploration) and resolve it automatically.

**Depends on:** Task 2 (P1-7) must be implemented first. Task 2 ensures combat doesn't exit prematurely. Task 3 handles the post-combat case where combat correctly ended (all monsters dead) but all PCs are unconscious.

**File:** `src/game/game-manager.ts`

**Step 3a — Add detection + recovery function.**

Place near the `stabilizeUnconsciousCharacters` function (grep for it). Add:

```ts
/** P0-2 softlock recovery state. Tracks per-party grace timer. */
const softlockRecoveryTimers = new Map<string, ReturnType<typeof setTimeout>>();

const SOFTLOCK_DM_GRACE_MS = 60_000; // 60 seconds — env var: RAILROADED_DM_NARRATION_GRACE_SECONDS
const SOFTLOCK_AUTO_REVIVE_HP = 1;

/**
 * Detect all-PCs-unconscious-stable-no-hostiles state and initiate recovery.
 * Called after exitCombat + stabilizeUnconsciousCharacters.
 */
function checkSoftlockRecovery(party: GameParty): void {
  if (!party.session) return;
  // Only fire in exploration phase (post-combat)
  if (party.session.phase === "combat") return;

  // Check: all PCs unconscious + stable
  const allPCsDownStable = party.members.every(mid => {
    const m = characters.get(mid);
    if (!m || !m.isAlive) return true; // dead characters don't block recovery
    return m.hpCurrent === 0
      && m.conditions.includes("unconscious")
      && m.conditions.includes("stable");
  });

  if (!allPCsDownStable) return;

  // Check: at least one PC alive (not all dead — TPK is handled separately)
  const hasAlivePC = party.members.some(mid => {
    const m = characters.get(mid);
    return m && m.isAlive && !m.conditions.includes("dead");
  });
  if (!hasAlivePC) return;

  // Check: no hostile combatants remaining
  const hasHostiles = party.monsters.some(m => m.isAlive);
  if (hasHostiles) return;

  // Already running a recovery timer for this party
  if (softlockRecoveryTimers.has(party.id)) return;

  // --- Softlock detected. Begin recovery. ---

  // Step 1: DM narration interrupt
  logEvent(party, "softlock_recovery_started", null, {
    reason: "all_pcs_unconscious_stable_no_hostiles",
    dmGraceSeconds: SOFTLOCK_DM_GRACE_MS / 1000,
  });

  // Inject prompt visible to DM via GET /actions response (reuse existing turn data mechanism).
  // Do NOT use a new "system_dm_prompt" event type — no frontend consumer exists for it.
  // Instead, set a flag on the party that the DM action handler checks.
  if (party.session) {
    (party.session as any).softlockDmPrompt = {
      message: "All party members are unconscious but stable. No threats remain. "
        + "Narrate the next 1 in-game hour — you may introduce a rescuer, a time-skip, "
        + "or any narrative resolution. If you do not act within 60 seconds, "
        + "the engine will auto-resolve via natural recovery.",
      deadline_seconds: SOFTLOCK_DM_GRACE_MS / 1000,
    };
  }

  // Step 2: Start grace timer
  const timer = setTimeout(() => {
    // Race guard: if cancelSoftlockRecovery fired after this callback was queued
    // but before it runs, the timer key is already deleted. Bail.
    if (!softlockRecoveryTimers.has(party.id)) return;
    softlockRecoveryTimers.delete(party.id);

    // Re-check: DM may have acted during the grace window
    const stillSoftlocked = party.members.every(mid => {
      const m = characters.get(mid);
      if (!m || !m.isAlive) return true;
      return m.hpCurrent === 0 && m.conditions.includes("unconscious");
    });

    if (!stillSoftlocked) {
      // DM resolved it. Log and exit.
      logEvent(party, "softlock_recovery_cancelled", null, { reason: "dm_acted" });
      return;
    }

    // Step 3: Auto-revive one PC
    // Pick the first alive-but-unconscious PC in party.members order.
    // (No stableSince timestamp exists on conditions — member order is the deterministic tiebreaker.)
    const reviveTarget = party.members
      .map(mid => characters.get(mid))
      .filter((m): m is GameCharacter =>
        m != null && m.isAlive && m.hpCurrent === 0
        && m.conditions.includes("unconscious")
        && m.conditions.includes("stable")
      )[0];

    if (!reviveTarget) {
      // All PCs are dead (not just unconscious) — TPK already handled separately.
      logEvent(party, "softlock_no_eligible_target", null, {
        reason: "all_pcs_dead_or_no_stable_candidates",
      });
      return;
    }

    // Revive: set 1 HP, clear unconscious + stable + prone
    reviveTarget.hpCurrent = SOFTLOCK_AUTO_REVIVE_HP;
    reviveTarget.conditions = reviveTarget.conditions.filter(
      c => c !== "unconscious" && c !== "stable" && c !== "prone"
    );
    reviveTarget.deathSaves = resetDeathSaves();

    logEvent(party, "softlock_auto_revive", reviveTarget.id, {
      characterName: reviveTarget.name,
      hpRestored: SOFTLOCK_AUTO_REVIVE_HP,
      reason: "natural_recovery_1_ingame_hour",
    });

    // Use existing "narration" event type — frontend event-feed already renders these.
    logEvent(party, "narration", null, {
      text: `${reviveTarget.name} stirs awake, weak but alive. An hour has passed in silence.`,
      source: "system",
    });

    broadcastToParty(party.id, {
      type: "narration",
      text: `${reviveTarget.name} stirs awake, weak but alive. An hour has passed in silence.`,
    });
  }, SOFTLOCK_DM_GRACE_MS);

  softlockRecoveryTimers.set(party.id, timer);
}

/**
 * Cancel softlock recovery if DM acts (narrates, heals, advances scene).
 * Call this from DM action handlers.
 */
function cancelSoftlockRecovery(partyId: string): void {
  const timer = softlockRecoveryTimers.get(partyId);
  if (timer) {
    clearTimeout(timer);
    softlockRecoveryTimers.delete(partyId);
  }
}
```

**Step 3b — Wire `checkSoftlockRecovery` into combat-end flow.**

Grep for `stabilizeUnconsciousCharacters(party)` — it's called after `exitCombat`. At every call site, add `checkSoftlockRecovery(party)` AFTER `stabilizeUnconsciousCharacters`:

```ts
stabilizeUnconsciousCharacters(party);
snapshotCharacters(party);
checkSoftlockRecovery(party);  // ← add this line
```

**Step 3c — Wire `cancelSoftlockRecovery` via `markDmActed` helper.**

When the DM acts during the grace window, cancel the auto-revive timer. Add a single chokepoint helper (same pattern as CC Doc 1's `markCharacterAction`):

```ts
/** Mark that the DM acted — cancels softlock recovery if active. */
function markDmActed(partyId: string): void {
  cancelSoftlockRecovery(partyId);
  // Also clear the DM prompt flag if it was set
  const party = parties.get(partyId);
  if (party?.session && (party.session as any).softlockDmPrompt) {
    delete (party.session as any).softlockDmPrompt;
  }
}
```

Call `markDmActed(party.id)` at the top of each DM action handler that produces a narrative outcome. Grep for DM handlers (functions called from `dm.post(...)` routes in `rest.ts`): `handleAdvanceScene`, `handleSpawnEncounter`, `handleNarrate`, `handleVoiceNpc`, `handleEndSession`. Do NOT add to read-only DM handlers like `handleDMGetStatus`.

Future DM handler additions automatically get coverage by calling `markDmActed` — single point to maintain.

**Step 3d — Cleanup on session end.**

Grep for `"session_end"` string literal. Before each session-end event, clear any softlock recovery timer:

```ts
cancelSoftlockRecovery(party.id);
```

**Step 3e — Env var override.**

The 60-second grace window is hardcoded as `SOFTLOCK_DM_GRACE_MS`. For production tuning, read from environment:

```ts
const SOFTLOCK_DM_GRACE_MS = parseInt(process.env.RAILROADED_DM_NARRATION_GRACE_SECONDS ?? "60", 10) * 1000;
```

Place this near the constant declaration. Same pattern for the auto-revive HP if desired:

```ts
const SOFTLOCK_AUTO_REVIVE_HP = parseInt(process.env.RAILROADED_AUTO_REVIVE_HP ?? "1", 10);
```

**Step 3f — Rehydration safety.**

On process restart, in-memory softlock recovery timers are lost. If the server restarts during the 60s grace window, the auto-revive never fires and the softlock returns.

Fix: after party state is rehydrated (inside `loadPersistedState` and `loadPersistedCharacters`), call `checkSoftlockRecovery(party)` for each party that has an active session. This re-detects the softlock condition and restarts the grace timer.

Grep for `loadPersistedState` and `loadPersistedCharacters`. At the end of each function (after all parties are loaded), add:

```ts
// Re-check for softlock state after rehydration
for (const [, party] of parties) {
  if (party.session) checkSoftlockRecovery(party);
}
```

This mirrors the CC Doc 1 pattern where `lastActionAt` is initialized to `new Date()` on rehydration — same principle: in-memory state must be reconstructed after restart.

**Step 3g — Fake-timer tests for P0-2 (MANDATORY).**

The 60s grace + auto-revive is a wallclock-driven recovery mechanism. Without deterministic tests, P0-2 is observably correct only in manual playtest. Add tests using Jest/Vitest fake timers:

```ts
// Test 1: Auto-revive fires after grace expiry
// Setup: all PCs unconscious+stable, no hostiles, combat ended
// Act: advance fake timers by 60s
// Assert: one PC has hpCurrent=1, conditions no longer include "unconscious"

// Test 2: DM action cancels timer
// Setup: same as test 1
// Act: call markDmActed(partyId) within 60s, then advance timers past 60s
// Assert: no PC revived, softlock_recovery_cancelled event logged

// Test 3: Restart re-detects softlock
// Setup: same as test 1
// Act: clear softlockRecoveryTimers (simulates restart), call checkSoftlockRecovery
// Assert: new timer starts, advance 60s, PC revived
```

---

### Task 4 — F-5: Room transition block during combat

**What:** Block player room transitions during combat.

**File:** `src/game/game-manager.ts`

**Step 4a — Add combat phase check to `handleMove`.**

Grep for `function handleMove`. In the current code, the function does: get char → `markCharacterAction(char)` → `requireConscious` → get party → movement logic. The combat guard must go BEFORE `markCharacterAction` to avoid updating `lastActionAt` on a rejected move (which would cancel the autopilot timer for no reason).

Add after the character null-check but BEFORE `markCharacterAction(char)`:

```ts
// F-5: Block room transitions during combat
const partyForPhaseCheck = getPartyForCharacter(char.id);
if (partyForPhaseCheck?.session?.phase === "combat") {
  return { success: false, error: "Cannot move to another room during combat. Finish the encounter first.", reason_code: "WRONG_PHASE" };
}
```

The `getPartyForCharacter` call will happen again later in the function for dungeon state — that's fine, it's a Map lookup (O(1)). The early call is specifically for the combat check.

**Step 4b — Verify `handleAdvanceScene` already blocks.**

Grep for `handleAdvanceScene`. Verify it already has a combat phase check. It should — the earlier source read showed "Cannot advance scene during combat." If present, no change needed. If missing, add the same guard.

**Step 4c — Test.** Write a test: player in combat calls `handleMove` with a valid exit. Assert: returns `{ success: false }` with error mentioning combat.

---

### Task 5 — P1-5: Skill-check contract (greenfield)

**What:** Add a new `handleSkillCheck` endpoint returning `{roll, dc, success, narrative}`.

**File:** `src/game/game-manager.ts` (handler) + `src/api/rest.ts` (route)

**Step 5a — Add `handleSkillCheck` handler.**

Place after the existing action handlers (near `handleMove`, `handleLook`, etc.):

```ts
export function handleSkillCheck(userId: string, params: {
  skill: string;
  target_id?: string;
  tool_proficiency?: string;
  dc?: number;
}): { success: boolean; data?: Record<string, unknown>; error?: string; reason_code?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found.", reason_code: "CHARACTER_NOT_FOUND" };
  if (requireConscious(char)) return { success: false, error: UNCONSCIOUS_ERROR, reason_code: "CHARACTER_UNCONSCIOUS" };

  const party = getPartyForCharacter(char.id);
  if (!party?.session) return { success: false, error: "Not in an active session.", reason_code: "WRONG_STATE" };

  // No combat-phase block. Perception (spot hidden), Athletics (grapple), Insight (read intent)
  // are valid mid-combat in 5e. DC + DM context handles gating.

  // Map skill name to ability score abbreviation (matches AbilityScores interface: str, dex, con, int, wis, cha)
  const skillAbilityMap: Record<string, keyof AbilityScores> = {
    // STR
    athletics: "str",
    // DEX
    acrobatics: "dex", sleight_of_hand: "dex", stealth: "dex",
    lockpicking: "dex", disarm_trap: "dex",
    // INT
    arcana: "int", history: "int", investigation: "int",
    nature: "int", religion: "int",
    // WIS
    animal_handling: "wis", insight: "wis", medicine: "wis",
    perception: "wis", survival: "wis",
    // CHA
    deception: "cha", intimidation: "cha", performance: "cha",
    persuasion: "cha",
  };

  const normalizedSkill = params.skill.toLowerCase().replace(/\s+/g, "_");
  const ability = skillAbilityMap[normalizedSkill];
  if (!ability) {
    const validSkills = Object.keys(skillAbilityMap).join(", ");
    return { success: false, error: `Unknown skill: ${params.skill}. Valid skills: ${validSkills}`, reason_code: "INVALID_ENUM_VALUE" };
  }

  // Roll the check
  const d20 = roll("1d20");
  const mod = abilityModifier(char.abilityScores[ability]);
  const profBonus = proficiencyBonus(char.level);

  // Check proficiency using char.proficiencies (string[]) — same pattern as L3777 in game-manager.ts
  const isProficient = char.proficiencies.some(
    (p) => p.toLowerCase().includes(normalizedSkill.replace(/_/g, " "))
  ) || (
    // Tool proficiency: rogue always has thieves' tools for lockpicking/disarm_trap
    (normalizedSkill === "lockpicking" || normalizedSkill === "disarm_trap")
    && (char.class.toLowerCase() === "rogue" || char.inventory?.some(i => i.toLowerCase().includes("thieves")))
  );

  const totalMod = mod + (isProficient ? profBonus : 0);
  const total = d20.total + totalMod;

  // DC: accept from params (DM sets it), default 15 (medium difficulty per 5e DMG)
  const dc = params.dc ?? 15;

  const success = total >= dc;

  // Generate a simple narrative
  const narrativeSuccess = `${char.name} succeeds at ${params.skill} (rolled ${d20.total} + ${totalMod} = ${total} vs DC ${dc}).`;
  const narrativeFail = `${char.name} fails at ${params.skill} (rolled ${d20.total} + ${totalMod} = ${total} vs DC ${dc}).`;

  logEvent(party, "skill_check", char.id, {
    characterName: char.name,
    skill: normalizedSkill,
    ability,
    roll: d20.total,
    modifier: totalMod,
    total,
    dc,
    success,
    proficient: isProficient,
    toolProficiency: params.tool_proficiency ?? null,
  });

  markCharacterAction(char);

  return {
    success: true,
    data: {
      skill: normalizedSkill,
      ability,
      roll: d20.total,
      modifier: totalMod,
      total,
      dc,
      success,
      proficient: isProficient,
      narrative: success ? narrativeSuccess : narrativeFail,
    },
  };
}
```

**Step 5b — Add route in `rest.ts`.**

Grep for the player route section (near `player.post("/attack", ...)`, `player.post("/cast", ...)`). Add:

```ts
player.post("/skill-check", async (c) => {
  const user = c.get("user");
  const body = await c.req.json();
  return respond(c, handleSkillCheck(user.userId, body));
});
```

**Step 5c — Add to `playerActionRoutes` map.**

Grep for `playerActionRoutes` or `const playerActionRoutes` in `game-manager.ts`. Add:

```ts
skill_check: { method: "POST", path: "/api/v1/skill-check" },
```

**Step 5d — Verify imports.** `roll`, `abilityModifier`, `proficiencyBonus` are already imported in `game-manager.ts`. `markCharacterAction` exists (CC Doc 1). `AbilityScores` type must be imported from `../types.ts` (may already be imported — grep for `import.*AbilityScores`; if not, add it). Verify `handleSkillCheck` is exported and `rest.ts` imports it.

**Step 5e — Test.** Write a test: rogue character calls `handleSkillCheck({ skill: "lockpicking", dc: 15 })`. Assert: response includes `roll` (number 1-20), `dc` (15), `success` (boolean), `narrative` (string containing character name). Second test: call without `dc` param → assert dc defaults to 15.

---

## 5. What You Do NOT Build

- **Wallclock tick infrastructure** — MF spec mentions a configurable wallclock ratio (1 IRL min = 6 in-game min). Out of scope. The 60-second grace timer + auto-revive is the full softlock fix. In-game time advancement is cosmetic narration, not a mechanical system.
- **P0-1 phantom DM** — verification only, covered in CC Doc 3.
- **P0-4 Live Tracker badge** — frontend, covered in CC Doc 4.
- **New combat actions** (Turn Undead, expanded spell list) — CC Doc 6.
- **DM scene-rewrite restrictions** — explicitly excluded per preservation requirement (§3).
- **Target-based DC lookup** — DC is accepted as an optional param (default 15). Target-object-based DC lookup (locked door has DC 20, trap has DC 12) where the DC is read from dungeon state is a follow-up when dungeon objects carry DC fields.
- **Positional movement during combat** — `handleMove` is blocked during combat (Task 4). In-combat movement (5e: 30ft per turn) is a separate feature.

---

## 6. Rollout

1. **Branch** from latest `main` → `atlas/session-survival`
2. **Implement** Tasks 1–5 in order. Each task is one commit.
3. **Smoke test** locally:
   - **P0-3 (tiered autopilot):** Cast a spell in combat → verify turn does NOT auto-advance immediately. Use bonus action within 10s → verify turn advances on `all_resources_used`. Cast spell without bonus action → wait 10s → verify turn advances on `post_action_grace_expired`. Call `end_turn` after cast → verify immediate advance.
   - **P1-7:** Kill one PC (0 HP, 3 death save failures) while 1 monster remains → verify phase stays `combat`. Kill all monsters → verify phase transitions to `exploration`.
   - **P0-2:** Put all PCs to 0 HP + stable, kill all monsters → verify `softlock_recovery_started` event fires. Wait 60s → verify one PC wakes at 1 HP with `softlock_auto_revive` event.
   - **F-5:** In combat, call `handleMove` with valid exit → verify `{ success: false }` with "Cannot move during combat."
   - **P1-5:** Outside combat, call `POST /api/v1/skill-check { skill: "lockpicking" }` → verify response includes `roll`, `dc`, `success`, `narrative`.
   - **Rehydration:** Put all PCs to unconscious+stable, kill all monsters → softlock detected. Restart server → verify softlock re-detected on rehydration, recovery timer restarts.
4. **Push** branch. Open PR against `main`.
5. **Report** in `OUTBOX_FOR_RAM_PRIME.md` with commit hashes and smoke test results.

---

## 7. Success Criteria

| Criterion | How to verify |
|---|---|
| Cast does not end turn | Cast a spell → `isYourTurn` still true after response. Bonus action available. Turn does NOT auto-advance for 10s. |
| Auto-advance fires on action + bonus | Use action + bonus action → turn auto-advances immediately with `reason: "all_resources_used"`. |
| Grace timer advances turn at 10s | Character uses action, doesn't call `end_turn` or use bonus → turn auto-advances at 10s with `reason: "post_action_grace_expired"`. |
| Autopilot catches fully idle turns | Character does nothing for 45s → autopilot fires (CC Doc 1, unchanged). |
| Combat stays combat with hostiles | All PCs unconscious, 1+ monster alive → `party.session.phase === "combat"`. |
| Softlock recovery fires | All PCs unconscious + stable, no hostiles, phase = exploration → `softlock_recovery_started` event within 1s of combat end. |
| DM grace window works | DM narrates during 60s window → auto-revive timer cancelled. |
| Auto-revive fires | DM silent for 60s → one PC revived at 1 HP, `softlock_auto_revive` event logged. |
| Room transition blocked in combat | `handleMove` during combat → `{ success: false, error: "Cannot move during combat..." }` |
| Skill check returns full contract | `POST /skill-check` returns `{ roll, dc, success, narrative }` with valid values. |
| Preservation test | `party_chat` → DM scene rewrite → encounter spawn loop still works. Run a full session after all fixes. |
| Softlock recovery survives restart | Restart server while all PCs are unconscious+stable with no hostiles. After rehydration, `softlock_recovery_started` fires again within 1s. |

---

## 8. File Inventory

| File | Action | What changes |
|---|---|---|
| `src/game/game-manager.ts` | MODIFY | `checkAutoAdvanceTurn` tiered autopilot (10s grace after action); turn status in action responses; `POST_ACTION_GRACE_MS` constant; `checkSoftlockRecovery` + `cancelSoftlockRecovery` + `markDmActed` + timer state; edge-triggered `all_pcs_down_hostiles_remain` log; combat phase guard in `handleMove`; `handleSkillCheck` using `char.proficiencies` |
| `src/game/session.ts` | VERIFY | `shouldCombatEnd` is already correct (checks monsters only). Verify no changes needed. If ungated `exitCombat` sites found in audit, modify. |
| `src/api/rest.ts` | MODIFY | Add `POST /skill-check` route |
| `tests/*.ts` | MODIFY | Update turn-auto-advance tests for new condition. Add tests for: phase gating, softlock recovery, room transition block, skill check endpoint. |
