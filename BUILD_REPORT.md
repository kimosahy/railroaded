# BUILD_REPORT — CC-260430 DM Promotion + Sprint P backend

**Branch:** `atlas/dm-promotion-sprint-p` (10 commits ahead of `origin/main` @ `390e4ea`)
**Spec:** CC-260430-DM-PROMOTION-SPRINT-P v2 + ATLAS-010 follow-up (15 fixes across 4 AR sources)
**Status:** All 7 tasks + all 15 follow-up fixes complete. Branch pushed. PR opened: #18.

---

## Commits

| # | Hash | Message |
|---|---|---|
| 1 | `ed73664` | Task 1 — DB migrations + type extensions (controllerType, isPublic, dmEligible) |
| 2 | `64e522a` | Task 2 — AA benchmark cache + model scoring |
| 3 | `7f4c4cf` | Task 3 — DM promotion + dm_handshake gate |
| 4 | `ebaa246` | Task 4 — isPublic character filter on spectator endpoints |
| 5 | `917a379` | Task 5 — narration session-scoping verified |
| 6 | `6e1db3f` | Task 6 — Character sessions endpoint |
| 7 | `84108cb` | Task 7 — ISO 8601 timestamps audit + fix |
| 8 | `3fef0d0` | Fixes from local smoke-test run (handshake-gate race, charactersByUser leak, comment rephrase) |
| 9 | `2ba21e6` | Follow-up: production-risk fixes (1.1 modelCount, 1.2 fetch timeout, 1.3 DB role persist + reconcile, 1.4 lastPromotionOutcome) |
| 10 | `ca0b1d3` | Follow-up: isPublic coverage gaps (2.1 parties/:id, 2.2 parties listing + leaderboard, 2.3 journals 404, 2.4 backfill WARNING) |

(Plus the in-progress observability + cleanup commit landing this BUILD_REPORT and Fix 3.1–3.5/3.7.)

---

## New tests added

| File | Tests | Coverage |
|---|---|---|
| `tests/dm-promotion.test.ts` | 12 | Cases (a)–(k) + score field + architectural-constraint comment for (h) |
| `tests/model-ranking.test.ts` | 9 | Exact match, fuzzy rejection, median fallback, small-sample guard, disk cache |
| `tests/spectator-is-public.test.ts` | 8 | All 5 affected endpoints + parties listing + parties detail |
| `tests/character-sessions.test.ts` | 3 | Input validation (UUID format, 404 for missing, limit clamp) |
| `tests/iso-timestamps.test.ts` | 2 | Format regex + endpoint smoke |

**Replaced:** `tests/auto-dm-trigger.test.ts` — deleted, was testing the old SYSTEM_DM_ID Conductor approach.

---

## Full-suite test diff (Fix 3.6)

Captured failures from `bun test` on each test file individually (file-by-file
isolation avoids in-process postgres pool flakiness that bites the full
`bun test` invocation).

```
$ diff /tmp/main-failures.txt /tmp/branch-failures.txt
(empty — identical sets)
```

Both branch and main have **9 pre-existing failures**, identical:

- `B016b: hyphenated template names resolve correctly > 'bandit-captain' resolves to Bandit Captain with correct stats`
- `NPC disposition > disposition labels cover full range`
- `NPC system > create_npc with all fields`
- `avatar_url and description fields > character creation with description but no avatar fails`
- `avatar_url and description fields > character creation without avatar_url fails`
- `tracker empty session handling > renderSessions filters out inactive sessions with 0 events`
- `tracker.html dead monster styling > dead monsters show skull emoji instead of monster emoji`
- `tracker.html responsive layout > default layout uses two-column grid (sidebar + content)`
- `tracker.html responsive layout > tablet breakpoint (768px) keeps two-column layout with narrower sidebar`

**Zero new failures introduced.** All 34 new tests + the touched-existing tests
(`admin-queue-state` 4/4, `tracker-narrator` 16/16) pass.

---

## Deviations from spec

These are intentional decisions made during implementation, with justification:

1. **`pendingPromotion` holds the QueueEntry off-queue** (not in `dmQueue`).
   The spec implied placing the promoted user in `dmQueue` immediately; that
   created a real race where the matchmaker's 30s wait-timer would form a
   party with the unconfirmed DM. Switched to holding the entry in
   `pendingPromotion` and pushing it to `dmQueue` only at handshake success.

2. **Per-wave `promotionWaveTried` set.** The spec's `attemptPromotion(attempt+1)`
   recursion would re-pick the same highest-scored candidate after a timeout
   instead of advancing. Added a wave-scoped Set so timed-out candidates
   don't get retried in the same wave.

3. **Sentinel ordering in `attemptPromotion`.** The spec set `pendingPromotion`
   before calling `promoteUserToDm`. We set it AFTER promotion succeeds so a
   failed promotion doesn't leave a dangling sentinel.

4. **`charactersByUser` exposed via `getState()`.** Required for test reset to
   work — without it, tests reusing user IDs hit the "character already exists"
   early-return on the second call.

5. **DB role persistence at handshake success ONLY** (Fix 1.3). Spec originally
   suggested persisting at promote/demote time. Eon AR + Atlas blocker: that
   creates orphan state on mid-handshake server kill. Persist only at handshake
   success; pre-handshake state recovers via `reconcileOrphanedDmRoles` startup
   sweep.

6. **`time_to_handshake_ms` field name retained** (not `time_to_first_dm_action_ms`
   per MF-035 §6). Decision: in this architecture, the handshake IS the first
   DM action. Spec to be updated separately.

---

## Smoke test results

| Check | Result |
|---|---|
| Migration adds 3 columns | ✅ `drizzle/0023_dm_promotion_sprint_p.sql` |
| AA ranking — exact slug match | ✅ `model-ranking.test.ts` (a, b) |
| AA ranking — unknown → median + log | ✅ `model-ranking.test.ts` (c) + log spam guard (Fix 3.1) |
| AA ranking — small-sample guard | ✅ `model-ranking.test.ts` (f) |
| AA cache persists / fail-stale | ✅ `model-ranking.test.ts` (d2) |
| AA fetch timeout (10s) | ✅ Fix 1.2 in `refreshFromAPI` |
| Promotion fires at 5 min | ✅ `AUTO_DM_DELAY_MS = 300_000` |
| Highest-scored player promoted | ✅ `dm-promotion.test.ts` (a) |
| Handshake gates party formation | ✅ `dm-promotion.test.ts` (a, h) |
| Handshake timeout → next candidate | ✅ `dm-promotion.test.ts` (b) |
| 3 failures → exhaustion | ✅ `dm-promotion.test.ts` (c) |
| Real DM joins → no auto-promotion | ✅ `dm-promotion.test.ts` (d) |
| No AA key → FIFO tiebreak | ✅ `dm-promotion.test.ts` (e) |
| Kill switch | ✅ `dm-promotion.test.ts` (f) |
| Race guard | ✅ `dm-promotion.test.ts` (i) |
| Handshake passes but no players → demote | ✅ `dm-promotion.test.ts` (j) |
| `PROMOTION_PENDING` redirect | ✅ `dm-promotion.test.ts` (k) |
| `lastPromotionOutcome` on every path | ✅ Fix 1.4 — handshake_timeout / no_players_after_handshake |
| `modelCount` reports actual entries (not doubled) | ✅ Fix 1.1 + test (e) updated |
| isPublic filter — 5 endpoints + 2 gaps | ✅ `spectator-is-public.test.ts` (8 cases) |
| Narrations session-scoped | ✅ Verified, no code change |
| Character sessions endpoint | ✅ `character-sessions.test.ts` |
| Timestamps ISO 8601 | ✅ `iso-timestamps.test.ts` |
| Startup reconciliation of orphaned DMs | ✅ Fix 1.3 — `reconcileOrphanedDmRoles` |
| `dmPromotionEnabled` rename | ✅ Fix 3.2 + admin-queue-state test updated |

---

## Pre-deploy checklist

1. **Run migration:** `drizzle/0023_dm_promotion_sprint_p.sql` against production
   DB. Adds `controller_type`, `is_public`, `dm_eligible` columns. Backfill
   statement uses name-based fallback — see WARNING block in the SQL file.

2. **Set `ARTIFICIAL_ANALYSIS_API_KEY`** environment variable on Render. Without
   it, all candidates fall back to median=0 and the longest-queued player wins
   (FIFO). Acceptable for v1 but loses the AA scoring signal.

3. **Run owner-based backfill** (Fix 2.4): use the SQL template inside the
   migration file's WARNING block to find production test-account UUIDs and
   set `is_public = false` for their characters. Muhammad runs this manually
   post-deploy.

4. **Verify `RAILROADED_DM_PROMOTION_ENABLED`** is unset or `true` in Render env.
   `=false` would short-circuit the entire promotion flow.

5. **Note Render filesystem ephemerality** (Fix 3.5): AA cache file is lost on
   redeploy. First startup post-deploy fetches from AA API; the 10s timeout
   prevents hang if AA is down.

---

## Files changed

| File | Action | ~Lines |
|---|---|---|
| `src/db/schema.ts` | MODIFY | +3 |
| `drizzle/0023_dm_promotion_sprint_p.sql` | NEW | +24 |
| `drizzle/meta/_journal.json` | MODIFY | +7 |
| `src/engine/model-ranking.ts` | NEW | +260 |
| `src/index.ts` | MODIFY | +9 |
| `src/api/auth.ts` | MODIFY | +145 |
| `src/api/mcp.ts` | MODIFY | +18 |
| `src/api/rest.ts` | MODIFY | +18 |
| `src/api/spectator.ts` | MODIFY | +180 |
| `src/game/game-manager.ts` | MODIFY | +480 |
| `src/tools/dm-tools.ts` | MODIFY | +17 |
| `skills/dm-skill.md` | MODIFY | +2 |
| `tests/dm-promotion.test.ts` | NEW | +345 |
| `tests/model-ranking.test.ts` | NEW | +145 |
| `tests/spectator-is-public.test.ts` | NEW | +200 |
| `tests/character-sessions.test.ts` | NEW | +38 |
| `tests/iso-timestamps.test.ts` | NEW | +35 |
| `tests/auto-dm-trigger.test.ts` | DELETE | −206 |
| `tests/admin-queue-state.test.ts` | MODIFY | +4 |
| `BUILD_REPORT.md` | REWRITE | this file |
| `.gitignore` | MODIFY | +1 |

---

## Out of scope (deferred to v1.5)

- **`time_to_handshake_ms` rename** — keep current name; spec to update.
- **Backoff after `all_candidates_exhausted`** — low-probability infinite-retry risk; accepted at current scale.
- **Render disk persistence for AA cache** — Fix 3.5 documents the constraint.
- **`best_dms` leaderboard isPublic on users** — isPublic is on characters, not users; separate ticket.
- **Frontend mobile (Sprint P §4–§7)** — separate CC doc.
- **DM audition system** — `dmEligible` ships open (default true).
