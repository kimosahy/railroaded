# BUILD_REPORT — CC-260428 Matchmaking + Bootstrap (Stage B)

**Branch:** `atlas/matchmaking-bootstrap` (10 commits ahead of `origin/main`)
**Spec:** `cc-spec-matchmaking-bootstrap.md` (committed at repo root)
**Status:** 7/7 tasks complete + Atlas QA follow-up landed. Ready for re-QA + merge.

---

## Commits

| Hash | Message |
|---|---|
| `92ede54` | Atlas build (Ram): scaffold matchmaking-bootstrap state declarations (Task 0/4a) |
| `ac0769f` | Atlas build (Ram): Task 1 — queue idempotency returns 409 with state |
| `c91e747` | Atlas build (Ram): Task 2 — queue-state feedback on GET /actions + leave_queue |
| `9627d82` | Atlas build (Ram): Task 3 — admin queue-state diagnostic endpoint |
| `7e07991` | Atlas build (Ram): Task 4 — auto-DM trigger + pluggable provisionConductor |
| `e142262` | Atlas build (Ram): Task 5 — GET /skill/dm/quickstart 5-command bootstrap |
| `209b985` | Atlas build (Ram): Task 6 — skill doc updates (player queue + DM Sections 2-3) |
| `a1a5a4c` | Atlas build (Ram): Task 7 — verification tests + P2-9 stale-party check |
| `1d2753c` | Atlas build (Ram): BUILD_REPORT for CC-260428 matchmaking-bootstrap |
| `631830c` | Atlas build (Ram): close autoDmLog telemetry gap on duplicate-guard path |

The leading "Task 0" commit (`92ede54`) covers Task 4 Step 4a state declarations
plus the B-telemetry array. Symbols declared there: `lastMatchAt`, `autoDmTimer`,
`autoDmFirstEligibleAt`, `AUTO_DM_DELAY_MS`, `AUTO_DM_MIN_PLAYERS`, `autoDmLog`
ring buffer + `pushAutoDmLog`. The CC spec doc was added in the same commit.
Subsequent commits import these as needed.

---

## Per-task tsc + test results

| Task | tsc (delta vs baseline=117) | Tests passing | Notes |
|---|---|---|---|
| 0 (4a) | 117 (0 new) | matchmaker (7) + matchmaking-flex (7) | Declarations only, no behavior change |
| 1 | 117 (0 new) | + queue-idempotency (2) + game-manager (45 + 2 todo) | 409 contract + helpers + queuedAt |
| 2 | 117 (0 new) | + queue-state-feedback (4) | DM contract change documented in skill doc Task 6 |
| 3 | 117 (0 new) | + admin-queue-state (4) | Required `(phase as string) !== "ended"` cast to match existing pattern |
| 4 | 117 (0 new) | + auto-dm-trigger (5) | All 5 Step 4g cases covered |
| 5 | 117 (0 new) | + dm-quickstart (4) | Route + base-URL + section count |
| 6 | 117 (0 new) | (docs only — no test changes) | Player Queue Status + DM §13/§14 |
| 7 | 117 (0 new) | + cc260428-verification (9) — P0-1, P2-10 (3), P2-9 (3) | Includes `party_formed` event in formParty |

**Baseline tsc:** verified 117 errors on `origin/main` HEAD `092406e` before any change.
**Final tsc:** 117 errors. Zero new TypeScript errors introduced.

---

## Full-suite test results

Run via `bun test --parallel=1` (sequential isolation; matches the project's
`test-runner.sh` semantics modulo timeouts):

```
Ran 1196 tests across 80 files. [8.94s]
1171 pass / 2 todo / 9 fail
```

Compared against `origin/main` (same command, same env): **1143 pass / 2 todo / 9 fail**.

Delta: **+28 passing tests**, **0 new failures**.

The 9 pre-existing failures (verified on `origin/main` head `092406e`):
- `tracker.html responsive layout > default layout uses two-column grid`
- `tracker.html responsive layout > tablet breakpoint (768px) keeps two-column layout`
- `NPC system > create_npc with all fields`
- `NPC disposition > disposition labels cover full range`
- `avatar_url and description fields > character creation without avatar_url fails`
- `avatar_url and description fields > character creation with description but no avatar fails`
- `tracker empty session handling > renderSessions filters out inactive sessions with 0 events`
- `tracker.html dead monster styling > dead monsters show skull emoji instead of monster emoji`
- `B016b: hyphenated template names resolve correctly > 'bandit-captain' resolves to Bandit Captain with correct stats`

Only the first two are referenced in the task statement as expected. The other
seven also exist on `origin/main`. None reference matchmaking, queueing, auth,
or the surfaces touched by this CC.

---

## §5 smoke tests — exercised by automated tests

All §5 smoke checks are covered by the new test files. Per-check coverage:

| §5 check | Test file | Result |
|---|---|---|
| **409:** POST `/queue` twice → 409 + `queue_status` | `tests/queue-idempotency.test.ts` | PASS |
| **Queue feedback:** queued player → `phase: "queued_waiting_dm"` | `tests/queue-state-feedback.test.ts` | PASS |
| **DM feedback:** queued DM → `phase: "queued"` (not NOT_DM error) | `tests/queue-state-feedback.test.ts` | PASS |
| **Admin:** valid `Bearer ADMIN_SECRET` → 200 with `player_queue` / `dm_queue` / `active_sessions` / `recent_auto_dm_events` | `tests/admin-queue-state.test.ts` | PASS |
| **Admin:** missing/wrong secret → 401; missing env → 503 | `tests/admin-queue-state.test.ts` | PASS |
| **Auto-DM (a):** `RAILROADED_AUTO_DM_PROVISION=true`, 3 players, 60s → conductor in dmQueue, party forms via `tryMatchPartyFallback`, telemetry "fired" + "provisioned" | `tests/auto-dm-trigger.test.ts` | PASS |
| **Auto-DM (b):** `RAILROADED_AUTO_DM_PROVISION=false` (default), 3 players, 60s → conductor NOT queued, telemetry "fired" + "skipped" | `tests/auto-dm-trigger.test.ts` | PASS |
| **Auto-DM (c):** real DM joins at 30s → trigger never fires | `tests/auto-dm-trigger.test.ts` | PASS |
| **Auto-DM (d):** 2 players (below threshold) → no trigger | `tests/auto-dm-trigger.test.ts` | PASS |
| **Auto-DM (e):** second `provisionConductor` call with Conductor already queued → guard pushes autoDmLog `type:"skipped"` `reason:"duplicate"`, dmQueue still has exactly 1 Conductor (delta = 1) | `tests/auto-dm-trigger.test.ts` | PASS |
| **Quickstart:** `GET /skill/dm/quickstart` → text/plain with 5 numbered sections | `tests/dm-quickstart.test.ts` | PASS |
| **P0-1:** 4 players + 0 DMs → no party formed | `tests/cc260428-verification.test.ts` | PASS |
| **P2-10:** `handleMonsterAttack` with `target_name`, `handleVoiceNpc` with `message` | `tests/cc260428-verification.test.ts` | PASS |

---

## Deviations from spec

1. **Task 0 scaffolding:** chose the explicit "Task 0" leading commit
   (`92ede54`) over folding declarations into the first hunk of Task 1.
   Reason: cleaner per-commit story; reviewers can see the state shell
   without the 409 contract change interleaved.

2. **Task 4 — `AUTO_DM_PROVISION_ENABLED` runtime read:**
   Spec declared this as a `const` evaluated at module load. Implemented as
   `isAutoDmProvisionEnabled()` that reads `process.env` at call time.
   Reason: tests must exercise both Step 4g (a) provisioned and (b) skipped
   paths in the same Bun process. Bun's test runner shares module state
   across files in the default mode, so a module-load `const` would freeze
   the value at first import. Operational behavior unchanged — the env var is
   read once per trigger fire, not once per HTTP request.

3. **Task 5 — quickstart uses `username` not `name`:**
   Spec quickstart used `{"name": "my-dm-agent"}` but the actual auth API in
   `src/api/auth.ts` requires the `username` field. The quickstart uses
   `username` so the curl commands are end-to-end correct. Step 2 also adds
   the missing `password` field (real `/login` requires both `username` and
   `password`).

4. **Task 6 — DM Sections 2/3 renumbered to §13/§14:**
   MF wrote Sections 2 and 3 in `skills/dm-skill-sections-2-3.md` for a
   restructured doc, but the existing `dm-skill.md` already has §1–§12.
   Numbering kept sequential with the existing doc to avoid breaking
   internal cross-references. MF's internal references (e.g., "see §3
   Tool Reference") were rewritten to point at §14.

5. **Task 6 — bootstrap docs:** spec asked to fix `username` → `name`,
   `/api/v1/register` → `/register`, `/api/v1/login` → `/login`. Docs
   already match the actual API (`username`, `/register`, `/login`). NO FIX
   needed for player-skill or dm-skill. Same for `award_loot` (already
   uses `player_id`, `item_name`, `gold`).

6. **Task 6 — DM tool count discrepancy:** existing doc says "49 MCP tools";
   MF audited and counted 50. Did not change the §1 preamble line — backend
   is source of truth and that's outside this CC's scope. Flagged for
   follow-up.

7. **Task 7c — empty-events guard:** spec asked to verify whether `formParty`
   logs a `party_formed` event before adding the staleness check. Grep
   confirmed `formParty` does NOT log such an event in baseline. Per spec
   options:
     - Added `logEvent(party, "party_formed", ...)` to formParty (so events
       array is never empty for a real party).
     - This makes the proposed empty-events guard unnecessary — the
       staleness comparison `lastEvent.timestamp` always has a real value.
   Documented in Task 7 commit body.

---

## Confirmation matrix (per Final deliverable §)

| Item | Status |
|---|---|
| `SYSTEM_DM_ID` reused (not parallel) | ✅ Imported from `matchmaker.ts`, not redefined. Verified via `grep -rn "SYSTEM_DM_ID"` in `src/`. |
| `tryMatchPartyFallback` called (not `tryMatchParty`) | ✅ `provisionConductor` (`src/game/game-manager.ts`) calls `tryMatchPartyFallback`. |
| Feature flag default false | ✅ `isAutoDmProvisionEnabled()` returns true ONLY when `process.env.RAILROADED_AUTO_DM_PROVISION === "true"`. Default branch: false. |
| B-telemetry array exposed via admin endpoint | ✅ `getQueueState()` includes `recent_auto_dm_events: autoDmLog.slice(-20)`. Visible at `GET /api/v1/admin/queue-state`. |
| DM skill doc `phase=queued` warning landed | ✅ Top of §13 Phase 1 (QUEUED) in `skills/dm-skill.md`: "When `phase` is `queued`, do NOT call narration tools…" |
| `formParty` event log status | logs `party_formed`: **YES** (added in commit `a1a5a4c`). Empty-events guard added: **NO** (not needed because party_formed is now always logged on form). |

---

## Files changed (vs `origin/main`)

```
 BUILD_REPORT.md                       | overwritten with new content
 cc-spec-matchmaking-bootstrap.md      | NEW
 skills/dm-skill.md                    | +199
 skills/player-skill.md                | +18
 src/api/rest.ts                       | +60 / -8
 src/game/game-manager.ts              | +302 / -10
 src/game/matchmaker.ts                | +5 / -3
 src/index.ts                          | +51
 src/types.ts                          | +1
 tests/admin-queue-state.test.ts       | NEW (135 lines)
 tests/auto-dm-trigger.test.ts         | NEW (200 lines)
 tests/cc260428-verification.test.ts   | NEW (210 lines)
 tests/dm-quickstart.test.ts           | NEW (87 lines)
 tests/matchmaker.test.ts              | +2 / -2
 tests/matchmaking-flex.test.ts        | +2 / -2
 tests/queue-idempotency.test.ts       | NEW (98 lines)
 tests/queue-state-feedback.test.ts    | NEW (132 lines)
```

---

## Notes for QA

- **Auto-DM live verification:** to see the trigger fire in production logs,
  set `RAILROADED_AUTO_DM_PROVISION=true` in env, queue 3+ players with no DM
  for 60s, and watch for `[AUTO-DM] The Conductor queued (system-dm)` followed
  by `[AUTO-DM] Party formed with The Conductor.` in stdout.
- **Auto-DM telemetry without provisioning:** keep the flag `false` (default).
  `GET /api/v1/admin/queue-state` will surface `recent_auto_dm_events` with
  `type: "skipped"` entries showing how often a Conductor would have
  provisioned. CoS uses this to size the actual provisioning solution.
- **Admin endpoint requires `ADMIN_SECRET`** env var. Without it, returns 503.
- **Quickstart endpoint** is unauthenticated (matches `/skill/player`,
  `/skill/dm`).
- **Test isolation:** new test files use `afterAll(resetState)` so subsequent
  test files (notably `tests/post-action-grace.test.ts` which doesn't reset)
  don't inherit dirty queue state.
- **DM contract change at queue:** `GET /api/v1/dm/actions` now returns
  `success: true` with `phase: "queued"` when the DM is queued (was: `success:
  false` with `NOT_DM`). Existing DM agents that switch on phase get a clear
  signal not to narrate. Skill doc §13 Phase 1 has the explicit warning.
- **409 vs 400:** double-queueing now returns HTTP 409 (was 400). The body
  contains `queue_status`. Agents that retry on 4xx should special-case 409
  as a status check, not a retry trigger.
