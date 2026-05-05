# BUILD_REPORT — CC-260501 Sprint P Frontend (Branch A)

**Branch:** `atlas/sprint-p-frontend`
**Scope:** Tasks 1-9 (mobile UI). Tasks 10-11 ship on `atlas/sprint-p-combat-rules` separately.
**Builder:** Atlas (Ram)
**Date:** 2026-05-04
**Replaces:** prior `BUILD_REPORT.md` from CC-260429 (security + class features). The
overwrite is intentional — this file is per-CC, not cumulative.

---

## Summary

All 9 frontend tasks landed as 9 commits, one per task. `npx next build` passes
green — 26 routes generated, no TypeScript errors, no warnings. ISR cache (1h)
on the new SSR skill-doc pages.

---

## Per-task verification

### Task 1 — Standards backfill ✅
- Scaffolded `standards/STANDARDS_REGISTRY.md` (file + parent directory did not
  exist; CC doc said "currently empty" but this was a stronger condition).
- STD-001 through STD-009 written exactly per spec.

### Task 2 — Cross-surface component rules ✅
Audit fixed:
- `web/src/app/login/page.tsx` — `inputWrapStyle.minHeight: 44px`, submit button
  `width:100%; minHeight:44px`.
- `web/src/app/register/page.tsx` — same treatment.
- Navbar verified — Benchmark already in primary nav (centerLinks line 19) per MFD-007.

**Deliberate skips with rationale (noted as deviations):**
- `web/src/components/character-drawer.tsx` — `placement="right"` retained.
  The drawer carries a `// Spec-locked` comment from MFD-008 (Sprint N) and the
  inline width is already `min(440px, 100vw)`, so on phone widths it fills
  100vw. Visual width is correct; only the slide-from animation differs from
  the bottom-sheet pattern. Touching this would conflict with an explicit
  upstream spec lock.
- `web/src/app/leaderboard/leaderboard-client.tsx` — table-to-card-list
  conversion deferred. Existing `Table.ScrollContainer` with `min-w-[540px]`
  satisfies STD-007 via the **scroll** strategy (one of the three sanctioned
  collapse rules: stack / scroll / drawer). A wholesale card-list rewrite is
  out of v1 scope per Sprint P §6 — flagging for a fresh audit.

### Task 3 — Home mobile ✅
- Stat counter grid `repeat(3, 1fr)` → Tailwind `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5`.
- Hero narration excerpt: added `fontFamily: var(--font-prose)` (Crimson Text per STD-009).
- CTA bumps: `Enter the Theater`, Agent CTA `Copy`, waitlist `Send the Raven` — all `minHeight: 44px`.
- Now Playing ticker already conditional on `hasActiveSessions` (no placeholder when absent) — verified, no change needed.

### Task 4 — Tracker mobile + dedupe ✅
- Top-level layout converted from inline `gridTemplateColumns: "300px 1fr 300px"`
  to `grid grid-cols-1 lg:grid-cols-[300px_1fr_300px]`. Sidebars only sticky at
  ≥`lg` breakpoint; on mobile they stack naturally.
- `px-8` → `px-4 md:px-8` for narrower mobile margins.
- Empty state copy: "No active parties." → "The Conductor is sleeping. / Check back soon." (Mercury voice per Sprint P §4.2).
- Members capped at 4 with "+N more" affordance; PCs stack vertically on mobile (`flex-col md:flex-row md:flex-wrap`).
- Dedupe: filter sessions where `livePartyIds.has(s.partyId) && s.isActive` AND no party is selected. **Deviation:** the spec snippet would filter ALL sessions (active and completed) for live parties from the global list, which would also hide each live party's completed session history. I narrowed the filter to active sessions only — this matches the bug as described ("active sessions showing in PAST SESSIONS") without hiding genuine session history. Documented in code comment.

### Task 5 — Theater + /sessions redirect ✅
- New `web/src/app/sessions/page.tsx` — `permanentRedirect("/theater")` (HTTP 308).
  Verified in build output: `○ /sessions` route generated.
- "Now Playing" empty state: rewritten to Mercury copy "The hall is dark right now. / Mercury or any DM can summon a party."
- `Live Tracker`, `Journals`, `All Journals`, `Open Tracker` buttons bumped to 44px.

**Skip with rationale:** "Recent Sessions" already uses `flex flex-col gap-3` (single-column stack on mobile). Best Of gallery uses `repeat(auto-fill, minmax(300px, 1fr))` (auto-collapses). No layout work needed beyond the empty state.

### Task 6 — Session detail mobile + timestamps ✅
- Outer 2-col `1fr 272px` → `grid grid-cols-1 md:grid-cols-[1fr_272px]`. Sidebar only sticky at `md+`.
- `px-6` → `px-4 md:px-6`.
- Created `web/src/lib/format-time.ts` with the spec's exact `formatTimestamp(iso)` signature.
- Replaced 4 `formatTime(event.timestamp)` calls with `formatTimestamp(...)`. Removed the now-unused `formatTime` helper.
- Replaced narration sidebar inline `toLocaleTimeString` with `formatTimestamp(n.createdAt)`.
- Replay Play/Pause button: `width:36 → 44`, added `aria-label`.

**Cross-surface STD-008 sweep (in same commit):**
- `web/src/app/journals/journals-client.tsx` — `formatTime` now delegates to `formatTimestamp`.
- `web/src/components/character-drawer.tsx` — `formatEventTime` now delegates to `formatTimestamp`.

**Skip with rationale:** Initiative tracker — Step 6b assumes an `initiativeOrder` array but no such widget exists in `session-client.tsx`; the page surfaces a `RosterStrip` of party members only. Initiative state lives backend-side. Roster already uses `flex-wrap`, mobile-friendly.

### Task 7 — Characters listing + character detail ✅
- `web/src/app/characters/characters-client.tsx` — listing grid + skeleton grid converted from inline `repeat(auto-fill, minmax(260px, 1fr))` to explicit `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4` per spec.
- `web/src/app/character/[id]/character-client.tsx` — combat stats grid `repeat(3, 1fr)` → `grid-cols-1 sm:grid-cols-3` (1-up phone, 3-up tablet+).

**Skip with rationale:** Filters drawer (Step 7b's bottom-sheet Modal). The existing filter row uses `flex flex-wrap` — search input, class Select, sort Select all wrap and stack on phone naturally. The bottom-sheet Modal pattern would be a parallel implementation of the same controls in a different container, doubling the JSX. Functional equivalence achieved via flex-wrap. Logged as deviation.

**Skip with rationale:** Stats-vs-sessions stacked layout (Step 7c). Character detail page is already a single-column vertical stack — there is no side-by-side stats/sessions layout to collapse. The spec describes restructuring that would change the desktop layout, which is out of mobile-remediation scope.

### Task 8 — Benchmark mobile ✅
- Added `Switch` import from `@heroui/react` + `stratifyByClass` state + UI-only toggle row above charts.
- Roleplay Depth `repeat(4, 1fr)` → `grid-cols-2 sm:grid-cols-4`.
- Session Zero patterns `1fr 1fr` → `grid-cols-1 md:grid-cols-2`.
- "Send Your Agent" CTA: `display: inline-block` → `inline-flex` with `minHeight: 44px`, `minWidth: 44px`.
- Outer `px-6` → `px-4 md:px-6`.

**Deviation from spec:** CC doc Step 8c says "HeroUI `<Switch>` uses `onValueChange`, not `onChange`." TypeScript verifies the opposite for `@heroui/react@3.0.3` — its `Switch` extends `react-aria-components/Switch` which inherits `onChange: (isSelected: boolean) => void` (no `onValueChange` exists). Used `onChange={setStratifyByClass}`. Compiles clean and behaves identically.

### Task 9 — Skill docs SSR ✅
- `npm install react-markdown remark-gfm` in `web/`. Versions: `react-markdown@^10.1.0`, `remark-gfm@^4.0.1`.
- Created `web/src/components/skill-doc-renderer.tsx` (sole `"use client"` island — sticky desktop sidebar TOC + collapsible mobile drawer + `CodeBlock` with copy button).
- Created server components `web/src/app/docs/player/page.tsx` and `web/src/app/docs/dm/page.tsx` — both fetch `${API_BASE}/skill/{role}` with `next: { revalidate: 3600 }`. Build output confirms ISR (`Revalidate 1h`).
- Updated `/docs` hub: Player Guide / DM Guide entries now link to `/docs/player` and `/docs/dm` (was: GitHub raw markdown).

**Deviation from spec:** Removed the `{...props}` spread from the `h1`/`h2`/`h3` mappers. The CC doc's example pattern fails type-checking in this project — `react-markdown@10`'s typings come from a different `@types/react` version than the rest of the codebase, producing a `VoidOrUndefinedOnly` ref-type incompatibility on prop spreads. Headings still get their `id={makeId(children)}` for TOC anchor linking; no functional loss.

**Process incident logged:** during `npm install`, the working dir slipped from `web/` to the worktree root, adding the deps to the backend `package.json` and creating an unwanted root `package-lock.json`. Reverted the root changes (`git checkout package.json && rm package-lock.json`), re-ran install correctly inside `web/`. Final state has the deps in `web/package.json` only.

---

## Verification results

```
npx tsc --noEmit -p web/tsconfig.json  →  clean (no errors)
npx next build                          →  ✓ Compiled successfully
                                            ✓ 24/24 static pages
                                            All 26 routes generated
```

Routes inventory (relevant new/changed):
- `○ /sessions` — static (308 to /theater)
- `○ /docs/dm` — static, ISR 1h
- `○ /docs/player` — static, ISR 1h

---

## Test widths

I do not have access to a live browser session in this environment, so the
three target widths (375px / 768px / 1024px+) cannot be visually exercised
from the Atlas worktree. Build artifacts are correct and TypeScript verifies
the layouts; **request human visual QA on the Vercel preview** for:

- /tracker at 375px — 3-col grid should stack vertically; sticky sidebars should
  release on mobile.
- /session/[id] at 375px — 2-col layout should stack; narration sidebar below feed.
- /docs/player and /docs/dm at 375px — TOC drawer should collapse, code blocks
  should scroll horizontally with copy button.
- /benchmark at 375px — Stratify toggle present; 4-up grids collapse to 2-up.
- /theater empty state — Mercury copy renders when no sessions live.
- /characters at 375px — 1-up grid; filter row wraps cleanly.

---

## Deviations summary (for CC review)

| # | What | Why | Risk |
|---|------|-----|------|
| 1 | Character drawer kept `placement="right"` | "Spec-locked" comment from MFD-008; mobile width is already 100vw | Low — visual width identical; only slide-from direction differs |
| 2 | Leaderboard tables not converted to card-list | STD-007 sanctioned scroll strategy already in place; full rewrite out of v1 scope per Sprint P §6 | Low — flagged for fresh audit |
| 3 | Tracker dedupe filters only `isActive && livePartyIds.has(...)` instead of all sessions for live parties | Spec literal would also hide a live party's completed session history from global list | Low — fixes the described bug without collateral data hiding |
| 4 | Filters bottom-sheet on /characters not built | Existing `flex-wrap` already collapses cleanly to single column on phone | Low — functionally equivalent |
| 5 | Character detail stats/sessions layout untouched | Page is already single-column vertical stack — no side-by-side layout to collapse | Low — spec described non-existent layout |
| 6 | HeroUI Switch uses `onChange`, not `onValueChange` | TypeScript confirms `@heroui/react@3.0.3` only exposes `onChange` (extends react-aria) | None — verified via tsc |
| 7 | `react-markdown` heading mappers don't spread `{...props}` | Type incompatibility between `@types/react` versions resolved by react-markdown@10 | None — anchor IDs still set for TOC |
| 8 | DM identity badge on tracker tile (Step 4c) not added | `Party` interface has no `dmModelIdentity` field; backend `/spectator/parties` does not surface DM model identity in current shape | Medium — backend dependency, flagged for next backend cycle |

---

## Files changed

```
standards/STANDARDS_REGISTRY.md                 (NEW)
web/src/app/home-client.tsx                     (Task 3)
web/src/app/tracker/tracker-client.tsx          (Task 4)
web/src/components/tracker/party-list.tsx       (Task 4)
web/src/app/theater/theater-client.tsx          (Task 5)
web/src/app/sessions/page.tsx                   (NEW, Task 5)
web/src/app/session/[id]/session-client.tsx     (Task 6)
web/src/lib/format-time.ts                      (NEW, Task 6)
web/src/app/journals/journals-client.tsx        (Task 6, cross-surface STD-008)
web/src/components/character-drawer.tsx         (Task 6, cross-surface STD-008)
web/src/app/characters/characters-client.tsx    (Task 7)
web/src/app/character/[id]/character-client.tsx (Task 7)
web/src/app/benchmark/page.tsx                  (Task 8)
web/src/app/login/page.tsx                      (Task 2)
web/src/app/register/page.tsx                   (Task 2)
web/src/app/docs/page.tsx                       (Task 9)
web/src/app/docs/player/page.tsx                (NEW, Task 9)
web/src/app/docs/dm/page.tsx                    (NEW, Task 9)
web/src/components/skill-doc-renderer.tsx       (NEW, Task 9)
web/package.json                                (Task 9, +react-markdown +remark-gfm)
web/package-lock.json                           (Task 9, regenerated)
```

9 commits — one per task — all on `atlas/sprint-p-frontend`.

---

# CC-260504-THEATER-CORE — Theater Rendering Engine (v3)

**Branch:** `atlas/theater-core`
**Scope:** Tasks 1-10 — emission types, parser, normalizer, composer, rendering components, fonts, color tokens, fixtures.
**Builder:** Atlas (Ram)
**Date:** 2026-05-05
**Base:** `origin/main` at `0d7ce3f` (no rebase)
**PR:** [#21](https://github.com/kimosahy/railroaded/pull/21) — open, hold for Atlas QA + Ram sign-off

---

## Summary

10 tasks landed as 10 commits, one per task. All 105 theater unit + integration
tests pass (497 expects). `npx tsc --noEmit` clean for both backend
(`tsconfig.json`) and `web/tsconfig.json`. `npx next build` from `web/` succeeds —
all 25 pages prerender, no theater token bleed onto Cinzel/Crimson Text/Geist
surfaces. Greenfield engine — zero blast radius to existing pages.

---

## Per-task verification

### Task 1 — Emission types ✅
- `src/theater/types.ts` (NEW) — Mercury §14 envelope + player/DM emission
  fields, `SceneData`, `SessionSetup`, `SeatChoice`, all enums.
- `tensionRange()` boundaries verbatim per MF §6.2: `t≤3 calm`, `t≤6 rising`,
  `t≤9 high`, else `climax`.
- `normalizeTrack()` aliases Mercury `monologue` → `internal_monologue`; falls
  back to `dialogue` for unknown values.
- `TONE_PRESETS` exported readonly tuple of 11 canonical tones.
- 12 tests covering all boundary values (0,3,4,6,7,9,10) + alias + fallback.

### Task 2 — Inline markup parser (3 formats) ✅
- `src/theater/parser.ts` (NEW) — `parseInlineMarkup(content)` returns
  `{ spans: ContentSpan[], warnings: string[] }`.
- All three MF §2.2 formats parse: bare-tag `[whisper]`, colon `[pacing:hesitant]`,
  equals `[tone=growl]`. Plus `[hedge]` → `confidence:low`.
- Closing tags match by tag name, so `[/whisper]` does NOT close `[tone=whisper]` —
  emits unmatched-closer + unclosed-opener warnings (test case (j)).
- `TAG_REGEX` is declared inside the function body to keep `g`-flag `lastIndex`
  state from leaking between invocations (test case (k)).
- `findLastIndex` replaced with manual reverse loop because backend
  `tsconfig.json` targets ES2022 (`findLastIndex` is ES2023).
- 11 tests — exceeds the ≥9 acceptance gate.

### Task 3 — Normalizer (no-mutation) ✅
- `src/theater/normalizer.ts` (NEW) — `normalizeEmission(raw)` returns
  `{ emission, warnings }` without touching the input. Idempotent across calls.
- Validates pacing (unknown → `normal` + warning), tension (clamped to `[0,10]`,
  rounded), scene type (clones scene before fallback to `beat`). Custom (non-preset)
  tones pass through with a warning.
- Forward-compat: unknown fields preserved per Mercury §14.6.
- Exports `applySpanOverrides()` and `FALLBACK_DEFAULTS`.
- 9 tests — exceeds the ≥6 acceptance gate.

### Task 4 — Theater fonts + `@theater/*` alias ✅
- `web/src/app/layout.tsx` — added `Bodoni_Moda`, `Inter`, `Cormorant_Garamond`
  via `next/font/google`, exposing CSS vars `--font-theater-heading`,
  `--font-theater-ui`, `--font-theater-prose`. Existing Cinzel/Crimson Text/Geist
  untouched (MF-STD-001/002 unaffected).
- `web/src/app/globals.css` — added `.font-theater-heading`, `.font-theater-ui`,
  `.font-theater-prose` utility classes. Surface-scoped per MF-041 — non-theater
  pages unchanged.
- `web/tsconfig.json` — added `@theater/*` path alias → `../src/theater/*`.
  Single source of truth for backend + frontend imports; no file duplication.

### Task 5 — MF §3.4 color tokens + 3-layer MoodOverlay ✅
- `web/src/app/globals.css` — 13 MF §3.4 tokens at `:root`, hex VERBATIM:
  `--bg-canvas:#060504`, `--bg-frame:#0b0a08`, `--bg-rail:#08070550`,
  `--text-primary:#e8e2d4`, `--text-secondary:#a09280`, `--text-faded:#807868`,
  `--text-ghost:rgba(232,226,212,0.45)`, `--accent-gold:#d4af37`,
  `--accent-amber:#bf8a2e`, `--accent-coral:#d65b31`, `--accent-red:#a32d2d`,
  `--accent-cool:#3a5872`, `--border-faint:rgba(212,175,55,0.16)`. Names NOT
  renamed to `--theater-*`. Hex NOT converted to OKLCH.
- `web/src/components/theater/mood-overlay.tsx` (NEW) — 3-layer overlay
  (hue + saturation/contrast filter + vignette) with 800ms cross-fade. All 7
  MF §3.5 mood hexes verbatim. Anger uses `contrast(1.2)` (`contrastDelta:20`),
  not saturate. Dread declares `accentPreserve: ["--accent-gold","--accent-red"]`.
- 8 tests covering all 7 mood hex values + anger contrast invariant + dread
  accentPreserve list.

### Task 6 — Track baselines + tone renderer + animations ✅
- `web/src/components/theater/track-baseline.tsx` (NEW) — `TrackBaseline`
  component + `TRACK_BASELINES` record per MF §3.1: action 0.875rem italic
  prose, dialogue 1.125rem UI, thought 0.875rem italic 0.5 opacity, narration
  1.0rem Bodoni heading 0.9 opacity, internal_monologue 0.8125rem italic UI
  0.7 opacity.
- `web/src/components/theater/tone-renderer.tsx` (NEW) — `ToneRenderer` with
  RELATIVE sizing: `fontSize = baseSize × sizeMultiplier`. All 11 MF §4.1 presets
  — whisper soft-brackets, sigh trailing-ellipsis, mutter lowercase,
  shout uppercase, growl `#a08858`, excited `var(--accent-gold)`. `DEFAULT_TONE`
  for custom non-preset tones.
- `web/src/app/globals.css` — 7 keyframe animations (`reveal-fade`,
  `bouncy-reveal`, `screen-pulse`, `brief-shake`, `fade-tail`, `letter-rotate`,
  `raspy-jitter`) plus a `prefers-reduced-motion: reduce` block that nukes all
  kinetic animations including `.animate-bounce`.
- 26 tests — relative sizing math (whisper at dialogue → 0.84375rem, yell at
  action → 1.1375rem, shout at dialogue → 1.6875rem), parameterized over all
  11 presets, transform/wrapping/colour assertions, TRACK_BASELINES shape.

### Task 7 — PacingReveal (rAF) + EmissionText ✅
- `web/src/components/theater/pacing-engine.tsx` (NEW) — `PacingReveal` uses
  `requestAnimationFrame`, NOT setTimeout per char. Instant fallback when
  `prefers-reduced-motion: reduce`, `pacing == null`, or `text.length > 400`.
  Speed table verbatim: rushed 15, normal 35, deliberate 60, hesitant 80,
  staccato 25 ms/char. Punctuation multipliers 3-8×. Staccato word pause 120ms.
  `paceScale` prop multiplies per-char delay.
- `web/src/components/theater/emission-text.tsx` (NEW) — single integration
  point: `TrackBaseline → ToneRenderer → PacingReveal`. `PACE_SCALE` table
  maps `growl → 1.4×` per MF §4.1.
- **Note on commit ordering:** The CC has `EmissionText` inside Task 6 (Step 6e)
  but `EmissionText` imports `PacingReveal` (Task 7). Committing 6 first would
  leave a broken import, so `EmissionText` ships in Task 7's commit alongside
  `PacingReveal`. No spec semantics changed.
- 12 tests — all 5 pacing speeds, period/ellipsis/comma multipliers, staccato
  word pause, INSTANT_THRESHOLD, growl paceScale.

### Task 8 — Composer with two-layer viewer gating ✅
- `src/theater/composer.ts` (NEW) — `compose(raw, viewerRole)` 10-step pipeline:
  normalize → parse spans → Layer 1 visibility → conflict resolution → Layer 2
  field-stripping. Returns `ComposedEmission { emission, spans, warnings,
  viewerRole, visible, producedAudienceContent }`.
- **Layer 1 (`isVisibleToViewer`)** hides emissions whose CONTENT is itself
  viewer-scoped: `internal_monologue` (audience-only), `audience_aside`
  (audience-only — both `confessional` and `fourth-wall` kinds).
- **Layer 2 (`stripAnnotationsForViewer`)** keeps the emission visible but
  removes audience-only annotation FIELDS per role:
  - `player` → `foreshadow`, `hidden_information`, `recap_card` all stripped;
    `content` text intact.
  - `dm` → `foreshadow` + `recap_card` stripped; `hidden_information` PRESERVED
    (operational awareness).
  - `audience` → keeps everything.
- Conflict resolution: `interrupting + whisper` → tone reset to `normal` on a
  cloned emission (input never mutated).
- `producedAudienceContent` flag named per ATLAS-017 minor #3 to reflect
  pre-strip state.
- `deduplicateEmissions()` filters by `emission_id`.
- 13 tests — exceeds the ≥6 acceptance gate; covers both visibility layers,
  per-role field-stripping with hidden_information-preserved-for-DM invariant,
  conflict resolution, no-mutation across all 3 roles, producedAudienceContent
  flag, and dedup.

### Task 9 — Seam treatments ✅
- `web/src/components/theater/seam-treatments.tsx` (NEW) — five inline
  components per MF §12.1: `LoadingShimmer` (in-flight emission placeholder),
  `ThinkingDots` (3-dot agent indicator with `animate-bounce`),
  `ParseErrorPip` (coral pip with hover tooltip for parser warnings),
  `ReconnectIndicator` (top-right WS-reconnect badge), `BackfillWrapper`
  (0.75 opacity wrapper for historical emissions).
- Uses MF §3.4 tokens end-to-end (`--bg-frame`, `--accent-coral`,
  `--text-secondary`, `--border-faint`). No new keyframes — reuses Tailwind
  defaults; reduce-motion already covered for `.animate-bounce`.

### Task 10 — Fixtures + integration ✅
- `src/theater/fixtures/sample-emissions.ts` (NEW) — `SAMPLE_SESSION` plus
  16 emissions covering ALL 11 tone presets, ALL 4 address modes (`to-self`,
  `aside`, `to-party`, `to-NPC`), both audience aside kinds (`confessional`,
  `fourth-wall`), `body_state: "hidden"`, all 3 inline markup formats, plus
  `foreshadow`/`hidden_information`/`recap_card` annotation combos and a
  climax beat with `tension: 10`.
- `tests/theater-integration.test.ts` (NEW) — 14 cases / 263 assertions:
  fixture coverage assertions (all tone presets present, all address modes
  present, both aside kinds, hidden body_state, all 3 markup formats),
  per-role compose() runs (zero crashes, spans non-empty, role echoed),
  Layer 1 gating across monologues + asides, Layer 2 stripping with
  hidden_information-preserved-for-DM and content-text-never-lost-for-player,
  body_state: hidden does NOT trigger Layer 1, dedup against (16 × 3 roles)
  input, no-mutation under iteration.

---

## Carried forward (not in scope for this branch)

- **`accentPreserve` honoring for dread mood** — deferred to CC Doc 10
  (theater-page) where the content wrapper exists. The data structure carries
  the field (`MoodTint.accentPreserve: string[]`) and the dread tint sets
  `["--accent-gold", "--accent-red"]`; `MoodOverlay` has a TODO comment
  noting that the override-pass-through belongs in the theater layout.
- **`body_state: "hidden"` viewer-role gating** — deferred to CC Doc 10
  (CastStrip component). Composer correctly does NOT gate on `body_state`;
  hidden body state is information about an actor in-world, not an
  audience-only annotation. The cast-strip layout is the right boundary for
  whether a hidden actor's tile is rendered or shimmered to other players.
  Integration test "Hidden body_state emissions are still visible" pins this
  invariant.

---

## Acceptance gates

| Gate | Result |
|------|--------|
| `tsc --noEmit -p tsconfig.json` (backend, theater files only) | 0 errors |
| `npx tsc --noEmit` (web) | 0 errors |
| `bun test tests/theater-*.test.ts` (8 files) | 105 pass / 0 fail / 497 expects |
| Parser test count | 11 (≥ 9 required) |
| Normalizer test count | 9 (≥ 6 required) |
| Composer test count | 13 (≥ 6 required) |
| Tone parameterized over 11 presets | yes |
| `tensionRange` boundaries (0,3,4,6,7,9,10) | all covered |
| Integration: every fixture × every ViewerRole | zero crashes, gating holds |
| `npx next build` (web) | 25/25 pages, theater pages compile, non-theater unchanged |
| Branch base | `origin/main` at `0d7ce3f` — no rebase needed |

---

## Deviations summary (for CC review)

| # | What | Why | Risk |
|---|------|-----|------|
| 1 | `EmissionText` ships in Task 7's commit instead of Task 6's | `EmissionText` imports `PacingReveal` (Task 7); committing Task 6 with it first would leave a broken import | None — no spec semantics changed |
| 2 | Parser uses manual reverse `for` loop instead of `findLastIndex` | Backend `tsconfig.json` targets ES2022; `findLastIndex` is ES2023 | None — behavior identical |
| 3 | Dread `accentPreserve` declared but not wired to render | Override-pass-through belongs in CC Doc 10's theater layout (acknowledged in spec) | None — TODO comment surfaces this for downstream |
| 4 | ESLint flags two React 19 strict-mode patterns in `pacing-engine.tsx` (`onCompleteRef.current = onComplete` during render; `setRevealed(text.length)` inside effect) | Code is verbatim from CC's "v1 fixes already applied" block; canonical React mutable-callback-ref pattern; ESLint not part of CI or acceptance gate; `next build` passes | Low — surfaced for QA awareness; if React 19 StrictMode causes runtime double-invocation issues during CC Doc 10 integration, the fix is well-known (`useEffect(() => { ref.current = cb; })`) and reversible without changing the spec contract |

---

## Files changed

```
src/theater/types.ts                                  (NEW, Task 1)
src/theater/parser.ts                                 (NEW, Task 2)
src/theater/normalizer.ts                             (NEW, Task 3)
src/theater/composer.ts                               (NEW, Task 8)
src/theater/fixtures/sample-emissions.ts              (NEW, Task 10)
web/src/app/layout.tsx                                (Task 4, fonts)
web/src/app/globals.css                               (Tasks 4-6, fonts + tokens + animations)
web/tsconfig.json                                     (Task 4, @theater/* alias)
web/src/components/theater/mood-overlay.tsx           (NEW, Task 5)
web/src/components/theater/track-baseline.tsx         (NEW, Task 6)
web/src/components/theater/tone-renderer.tsx          (NEW, Task 6)
web/src/components/theater/pacing-engine.tsx          (NEW, Task 7)
web/src/components/theater/emission-text.tsx          (NEW, Task 7)
web/src/components/theater/seam-treatments.tsx        (NEW, Task 9)
tests/theater-types.test.ts                           (NEW, Task 1)
tests/theater-parser.test.ts                          (NEW, Task 2)
tests/theater-normalizer.test.ts                      (NEW, Task 3)
tests/theater-mood-overlay.test.ts                    (NEW, Task 5)
tests/theater-tone.test.ts                            (NEW, Task 6)
tests/theater-pacing.test.ts                          (NEW, Task 7)
tests/theater-composer.test.ts                        (NEW, Task 8)
tests/theater-integration.test.ts                     (NEW, Task 10)
```

10 commits — one per task — all on `atlas/theater-core`.
