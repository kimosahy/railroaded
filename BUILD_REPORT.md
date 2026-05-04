# BUILD_REPORT — Sprint P combat rules (Tasks 10–11)

**Branch:** `atlas/sprint-p-combat-rules` (2 commits ahead of `origin/main` @ `390e4ea`)
**Spec:** `cc-delivery/CC-260501-SPRINT-P-FRONTEND.md` §1 Tasks 10–11 (Scope B — combat enforcement)
**PR:** https://github.com/kimosahy/railroaded/pull/19
**Status:** Both tasks complete. Branch pushed. PR opened against `main`.

PR-split sister branch `atlas/sprint-p-frontend` (Tasks 1–9 mobile UI) is independent — was not part of this build.

---

## Commits

| # | Hash | Message |
|---|---|---|
| 1 | `cb37b1f` | Atlas build (Ram): Task 10 — concentration enforcement |
| 2 | `7a7f1a0` | Atlas build (Ram): Task 11 — frightened condition enforcement |

---

## Task 10 — Concentration enforcement

**Files modified:**
- `src/game/game-manager.ts` — `activeConcentration` field, `reverseConcentrationEffect` helper, `handleCast` drops previous on new cast, CON save at all 4 PC-damage sites, drop at 0 HP at all 4 sites, rest reset, `concentrating` field in player action response
- `tests/concentration.test.ts` — new (11 tests)

**Grep audit:**
- `characters.set(` → 3 sites confirmed (handleCreateCharacter, loadPersistedState rehydration, loadPersistedCharacters rehydration). All 3 initialize `activeConcentration: null`. No test files create GameCharacter literals — verified via `grep "as GameCharacter\|: GameCharacter" tests/`.
- `\.hpCurrent = hp\.current` → 10 matches in game-manager.ts. Audit per-site:
  - 4 PC-damage sites (AoE save `t`, single-target save `target`, standard attack `target`, env damage `char`) → wired.
  - 6 healing or scroll sites (potion, scroll healing, second-wind, bonus-action heal/cast, etc.) → not damage, skipped per spec.
- `handleDropToZero` → exactly 4 call sites as the spec expected. All 4 wrapped with concentration drop logic.

**Step ordering:** Concentration save block placed AFTER `target.hpCurrent = hp.current` and BEFORE `droppedToZero` / `handleDropToZero`. The `target.hpCurrent > 0` guard skips the save when the character drops to 0 (Step 10e handles unconscious separately).

**`damageDealt`** computed as `hpBefore - target.hpCurrent` (damage TAKEN, capped by remaining HP) per spec — not the rolled damage.

**`reverseConcentrationEffect`** is a no-op for v1 (Mage Armor / Detect Magic are informational only).

**Test results:**
```
tests/concentration.test.ts:
 11 pass / 0 fail / 71 expect() calls
```

---

## Task 11 — Frightened condition enforcement

**Files modified:**
- `src/game/encounters.ts` — `frightenedRoundsRemaining` field on MonsterInstance, init 0 in spawnMonsters
- `src/game/game-manager.ts` — Channel Divinity sets timer to 10 (outside the if-guard so re-application refreshes), `disadvantage: isFrightened` wired into the standard attack-roll path, `frightened` + `disadvantageApplied` added to monster_attack logEvents (3 sites: 0HP-hit, normal-hit, miss), duration decrement in `advanceTurnSkipDead` after current combatant resolves
- `tests/frightened.test.ts` — new (5 tests)

**Grep audit:**
- `function spawnMonsters` → 1 site, init wired.
- `resolveAttack({` inside `handleMonsterAttack` → 1 match (the standard attack-roll path). AoE / single-target save paths use `savingThrow`, NOT `resolveAttack` — left untouched as spec requires.
- `removeCondition` import already present at line 54 of game-manager.ts; used (no raw `filter()`).

**Fallback:** All reads use `?? 10` (not `?? 0`) so legacy/migrated monsters with missing `frightenedRoundsRemaining` keep their condition intact through the first turn.

**Re-application semantics:** `monster.frightenedRoundsRemaining = 10` is set OUTSIDE the `if (!conditions.includes("frightened"))` guard — refreshes timer on every fresh failed save per 5e RAW.

**Test results:**
```
tests/frightened.test.ts:
 5 pass / 0 fail / 25 expect() calls
```

---

## Type-check results

`bun x tsc --noEmit -p .` — both pre-existing strict-mode errors and the codebase's existing `Condition[]` vs `string[]` issue.

| Surface | Baseline | After Task 10 | After Task 11 |
|---|---|---|---|
| `game-manager.ts` errors | 52 | 52 | 53 |
| `encounters.ts` errors | 0 | 0 | 0 |

The 1 new error introduced is at line 976 (frightened decrement using `removeCondition(monster.conditions, "frightened")` against `string[]`) — same pattern as 8 existing call sites in the file (asleep removal, etc.). Pre-existing strict-mode issue with MonsterInstance.conditions typing; runtime correct.

---

## Regression test runs

Targeted run across 45 test files (1759 assertions):

```
504 pass / 2 todo / 3 fail
```

**The 3 failures are pre-existing on baseline `main`** — verified by stashing my changes and re-running:
- `tests/avatar.test.ts` — character creation without avatar_url (2 fails) — pre-existing avatar validation regression unrelated to combat rules
- `tests/ie-bugfixes.test.ts` — `'bandit-captain'` hyphenated template resolution (1 fail) — pre-existing template loader issue unrelated to combat rules

The `bun test` whole-suite run hangs on DB connection retries (no Postgres running locally) — these are infrastructure side-effects (ECONNREFUSED), not assertion failures. Targeted runs of all combat-, damage-, spell-, and condition-relevant test files complete cleanly.

---

## Deviations from the spec

None. All spec steps implemented as written.

The spec mentions "Mage Armor and Detect Magic are concentration spells." In `data/spells.yaml`, only **Detect Magic**, **Web**, and **Shield of Faith** carry `is_concentration: true`. Mage Armor is `is_concentration: false` in the data. Tests use Detect Magic for the active-concentration manipulation; Web is referenced in the new-cast-drops-previous test. No spell data was modified — out of scope and the implementation does not depend on which specific spells carry the flag.

---

## What's NOT in this build (per spec §2)

- Concentration on monsters — v1 tracks PCs only.
- Concentration reversal effects — `reverseConcentrationEffect` is a documented no-op until mechanical concentration spells (Hold Person, Bless) ship.
- Frightened movement restriction ("must move away") — DM handles narratively, only attack disadvantage enforced.
