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
