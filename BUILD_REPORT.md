# BUILD_REPORT — CC-260428-SESSION-SURVIVAL

**Branch:** `atlas/session-survival` (off `origin/main` @ `73f530a`)
**Spec:** `cc-spec-session-survival.md` (saved at repo root)
**Status:** 5/5 tasks complete + Task 1 fake-timer follow-up. Branch on origin, ready for Atlas QA. **No PR opened.**

---

## Commits

| Hash | Task | Title |
|---|---|---|
| `5b74e8c` | Task 1 | Atlas build (Ram): P0-3 tiered autopilot — cast no longer burns whole turn |
| `ecefc43` | Task 2 | Atlas build (Ram): P1-7 audit + observability — edge-triggered all_pcs_down log |
| `4618cf5` | Task 3 | Atlas build (Ram): P0-2 softlock recovery — 60s DM grace + auto-revive |
| `402ec2f` | Task 4 | Atlas build (Ram): F-5 block room transitions during combat |
| `811c51d` | Task 5 | Atlas build (Ram): P1-5 skill-check contract — handleSkillCheck + /skill-check route |
| `12b09a3` | Task 1 follow-up | Atlas build (Ram): P0-3 fake-timer tests for tiered autopilot grace |

---

## Per-task gate results

The repo had a **117-error pre-existing tsc baseline** on `origin/main` (`73f530a`). The "tsc must pass" gate is interpreted as "no NEW errors introduced." Every task verified via `bun x tsc --noEmit` and `./test-runner.sh`.

The repo's `./test-runner.sh` kills `bun test` at 30s (DB pool cleanup hangs). Result is exit 0 from the runner whether tests passed or were killed mid-summary; pass/fail must be read from the per-test `(fail) ...` lines and from per-file isolated runs. Two pre-existing failures live in `tests/tracker-responsive.test.ts` (CSS rule assertions against `website/tracker.html`); they were verified pre-existing on a clean checkout via `git stash && bun test tests/tracker-responsive.test.ts` (4 pass / 2 fail on baseline, identical post-build).

| Task | tsc errors | New tsc errors | New test failures | Notes |
|---|---|---|---|---|
| Baseline (`73f530a`) | 117 | — | — | tracker-responsive 2 fail pre-existing |
| Task 1 | 117 | 0 | 0 | flipped 2 pre-existing failing tests to pass (game-manager.test.ts:691 + mcp-sprint-j.test.ts:321) |
| Task 2 | 117 | 0 | 0 | rewired one game-manager.test.ts loop that relied on the now-removed actionUsed-alone advance (Step 1d follow-up — see deviations) |
| Task 3 | 117 | 0 | 0 | added 3 fake-timer tests in tests/softlock-recovery.test.ts, all pass |
| Task 4 | 117 | 0 | 0 | added 2 cases in tests/move-combat-block.test.ts, all pass |
| Task 5 | 117 | 0 | 0 | added 4 cases in tests/skill-check.test.ts, all pass |
| Task 1 follow-up | 117 | 0 | 0 | added 3 fake-timer cases in tests/post-action-grace.test.ts, all pass |

**Final isolated run** of the 10 files most likely to be affected:
```
bun test tests/post-action-grace.test.ts tests/softlock-recovery.test.ts \
         tests/move-combat-block.test.ts tests/skill-check.test.ts \
         tests/game-manager.test.ts tests/mcp-sprint-j.test.ts \
         tests/game-integration.test.ts tests/playtest-bugfix.test.ts \
         tests/playtest-bugfix-r2.test.ts tests/combat.test.ts
```
→ **280 pass / 2 todo / 0 fail** (755 expect() calls).

---

## Deviations from spec

1. **`m.isAlive` switched to `m.conditions.includes("dead")` (Task 3).** The spec's softlock check uses `m.isAlive` on `GameCharacter`. That field is set at runtime on PC death (`target.isAlive = false`) but is **not declared** on the `GameCharacter` or `CharacterSheet` type — under strict TS it would not compile. Switched both the precondition check, the still-softlocked recheck, and the revive-target filter to use `m.conditions.includes("dead")` (the canonical dead marker on the Condition[] array). Same semantics: dead PCs do not block recovery, dead PCs are not revive candidates, and the softlock fires only when at least one PC is alive-but-unconscious-and-stable.

2. **`handleEndSession` already calls `markDmActed` at the top (Step 3c) and again `cancelSoftlockRecovery` before the `session_end` log (Step 3d).** Both are in spec. The double-cancel is harmless (second call is a no-op if the timer was already cleared), but kept both per spec literal text.

3. **Step 1d test fix landed in the Task 2 commit, not Task 1.** The pre-existing test "killing a monster removes it from initiative and ends combat" (`tests/game-manager.test.ts:442`) iterated `playerUserIds[i % 4]` and relied on the old actionUsed-alone auto-advance to walk initiative. Under the new tiered autopilot, the second iteration's player is not yet current and the loop deadlocks. Fixed by walking initiative explicitly via `getCurrentCombatant` + `handleEndTurn`. Since Task 1 was already committed when this was discovered, the fix is bundled with Task 2 with a header note in the commit body. Per repo guidance ("create NEW commits rather than amending"), I did not amend `5b74e8c`.

4. **`tsc` and test runner.** The spec literal said `npx tsc --noEmit` and `npm test`. The project is bun-only (`package.json` declares `"test": "./test-runner.sh"`, no npm install lock). Used `bun x tsc --noEmit` and `./test-runner.sh` (which already calls `bun test` under the hood) instead. Spec intent — "TypeScript must compile, tests must pass" — preserved.

---

## Smoke-test coverage (per spec §6)

Each smoke item was verified by an automated test rather than manual playtest (no live DB / agents available in this environment).

| § | Smoke check | Verified by |
|---|---|---|
| P0-3 | Cast/attack does NOT auto-advance immediately when only action used | `tests/game-manager.test.ts` "action only → turn does NOT advance; action + bonus → turn auto-advances" — was failing on baseline, passes now |
| P0-3 | Action + bonus auto-advances with `reason: "all_resources_used"` | Same test (continues into the bonus-action branch and asserts the next combatant changed) |
| P0-3 | Attack alone does not auto-advance | `tests/mcp-sprint-j.test.ts` "attack alone does NOT auto-advance turn" — was failing on baseline, passes now |
| P0-3 | Attack + bonus does auto-advance | `tests/mcp-sprint-j.test.ts` "attack + bonus action DOES auto-advance turn" |
| P0-3 | `end_turn` still advances immediately | Existing `handleEndTurn` path unchanged; covered by `tests/game-manager.test.ts` "killing a monster removes it from initiative and ends combat" (rewired to walk initiative via end_turn under new contract) |
| P0-3 | Grace timer fires at 10s with `reason: "post_action_grace_expired"` | `tests/post-action-grace.test.ts` (3 fake-timer cases): grace expiry advances with `post_action_grace_expired`, bonus-within-grace cancels grace and advances via `all_resources_used`, `end_turn`-within-grace cancels grace with no late fire |
| P1-7 | All `exitCombat` sites are gated by `shouldCombatEnd` | Manual audit — 9 sites; 8 gated, 1 (`checkCombatTimeout`, line 758) intentionally unguarded per spec. Findings in commit `ecefc43` body. |
| P1-7 | Edge-triggered `all_pcs_down_hostiles_remain` event fires only on transition | `checkAllPcsDownObservability` debounces via `lastAllPcsDownState` Map; flag cleared on combat / session end via `cancelAllAutopilotTimersForParty` (which both code paths exercise) |
| P0-2 | `softlock_recovery_started` fires when all PCs unconscious+stable + no hostiles + non-combat phase | `tests/softlock-recovery.test.ts` Test 1 |
| P0-2 | DM grace cancels via `markDmActed` | `tests/softlock-recovery.test.ts` Test 2 — `softlock_auto_revive` event NOT emitted |
| P0-2 | Auto-revive fires after 60s, one PC at 1 HP, conditions cleared | `tests/softlock-recovery.test.ts` Test 1 — exactly one PC ends at hpCurrent=1 with unconscious removed; `softlock_auto_revive` event present |
| P0-2 | Rehydration re-detects softlock | `tests/softlock-recovery.test.ts` Test 3 — `cancelSoftlockRecovery` simulates lost in-memory timer; second `checkSoftlockRecovery` re-arms; revive happens after the next 60s tick |
| F-5 | `handleMove` during combat → `success: false`, error mentions "combat" | `tests/move-combat-block.test.ts` case 1 — also asserts `reason_code === "WRONG_PHASE"` |
| F-5 | Rejected move does NOT bump `lastActionAt` | `tests/move-combat-block.test.ts` case 2 — verifies the BEFORE-`markCharacterAction` ordering required by the pitfall |
| P1-5 | `POST /api/v1/skill-check { skill: "lockpicking" }` returns `{ roll, dc, success, narrative }` | `tests/skill-check.test.ts` "rogue + lockpicking" — also asserts proficiency wiring via tool fallback and `skill_check` event log |
| P1-5 | DC defaults to 15 when omitted | `tests/skill-check.test.ts` "dc defaults to 15 when omitted" |
| Preservation | DM scene-rewrite loop unrestricted | `markDmActed` only cancels the softlock recovery timer + clears the prompt flag; it does NOT validate or block DM tool execution. Each handler with `markDmActed` is tagged with the `// PRESERVATION: do not restrict DM narrative tools per MF SPEC §3` comment. |

---

## File inventory (actual)

| File | Status | Lines added/changed |
|---|---|---|
| `cc-spec-session-survival.md` | NEW | spec saved at repo root (Task 1 commit) |
| `src/game/game-manager.ts` | MODIFIED | constants (POST_ACTION_GRACE_MS, SOFTLOCK_DM_GRACE_MS, SOFTLOCK_AUTO_REVIVE_HP), state Maps (lastAllPcsDownState, softlockRecoveryTimers), helpers (makeTurnStatus, checkAllPcsDownObservability, checkSoftlockRecovery, cancelSoftlockRecovery, markDmActed), tiered checkAutoAdvanceTurn rewrite, turnStatus on 13 handler responses, F-5 guard in handleMove, handleSkillCheck, all 6 stabilize-and-checkSoftlockRecovery wires, all 5 markDmActed wires in DM handlers, both session_end cancelSoftlockRecovery sites, both rehydration loops, playerActionRoutes skill_check entry |
| `src/api/rest.ts` | MODIFIED | new `POST /skill-check` route |
| `src/game/session.ts` | UNCHANGED | audited per spec; `shouldCombatEnd` already correct, no changes needed |
| `tests/softlock-recovery.test.ts` | NEW | 3 fake-timer tests for P0-2 (mandatory per spec §3g) |
| `tests/move-combat-block.test.ts` | NEW | 2 tests for F-5 |
| `tests/skill-check.test.ts` | NEW | 4 tests for P1-5 |
| `tests/post-action-grace.test.ts` | NEW | 3 fake-timer tests for P0-3 grace timer (Task 1 follow-up — spec §1d) |
| `tests/game-manager.test.ts` | MODIFIED | one test rewired for new tiered-autopilot contract (added handleEndTurn + getCurrentCombatant imports) |

---

## Stop conditions

None hit. No grep target was missing; no task required 3 retries; branch stayed on `atlas/session-survival` throughout.

---

## Branch state

```
$ git status
On branch atlas/session-survival
Your branch is up to date with 'origin/atlas/session-survival'.
nothing to commit, working tree clean

$ git log origin/main..HEAD --oneline
12b09a3 Atlas build (Ram): P0-3 fake-timer tests for tiered autopilot grace
811c51d Atlas build (Ram): P1-5 skill-check contract — handleSkillCheck + /skill-check route
402ec2f Atlas build (Ram): F-5 block room transitions during combat
4618cf5 Atlas build (Ram): P0-2 softlock recovery — 60s DM grace + auto-revive
ecefc43 Atlas build (Ram): P1-7 audit + observability — edge-triggered all_pcs_down log
5b74e8c Atlas build (Ram): P0-3 tiered autopilot — cast no longer burns whole turn
```

Branch is on origin (`atlas/session-survival`). **No PR opened.** Awaiting Atlas QA.
