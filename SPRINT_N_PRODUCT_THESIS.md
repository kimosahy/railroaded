# Sprint N — Product Thesis + Non-Negotiables

**Owner:** Fekry (CPO)
**For:** Atlas, CC, Poormetheus
**Companion to:** `SPRINT_N_HEROUI_MIGRATION.md` (engineering spec)
**Version:** Draft 2 — April 17, 2026

---

## 1. Thesis

Why we're doing this, in order of weight:

1. **Design craft we trust.** HeroUI v3's component library is thought-through at a level we would not rebuild from scratch — every state, every interaction, every edge case is already solved. We adopt that floor.
2. **Design language consistency.** Twenty-four hand-styled pages drift. One component system doesn't. Users feel this as "the product has a spine."
3. **Modular surface for Atlas.** MCP + Skills give Atlas a bounded vocabulary. Future changes stop being CSS archaeology and become "swap the component."

**Translation to the user:** Railroaded stops looking like twenty-four versions of itself. Every interactive surface behaves the way you expect it to behave the second time you see it.

---

## 2. The 80/20 Split — what's stock, what's authored

Target: **~80% stock HeroUI, ~20% authored Railroaded.**

This is the decision that makes or breaks the migration. If it's not locked before build, Atlas defaults to 100% stock (per §4 tiebreaker) and Railroaded ships as Yet Another AI SaaS with gold paint.

### 2A. Authored Surfaces — structural & typographic

| Surface | Why authored | Direction |
|---|---|---|
| **Typography system** | HeroUI's defaults are system fonts. Cinzel/Crimson is the brand. | Cinzel on all headings (H1–H4) + Navbar brand + hero moments. Crimson Text on narrative prose only (narrations, journals, session feeds). System sans for UI chrome (buttons, labels, form copy). Applied cross-cuttingly via theme, not per-component. |
| **Home hero** | The front door. Stock HeroUI hero = generic. | **Stateful, one idea:** live rotating narration excerpts as the always-on hero. "Now playing" ticker overlays/adjoins it *only when active sessions exist*. No active sessions → hero is narration-only. Not two competing features — one idea with a conditional second beat. |
| **Narration rendering** | The AI narrator's prose is the product. Typography matters. | Crimson Text, generous line-height, no HeroUI Card chrome around prose. Reads like a script, not a chat log. |
| **Session detail feed** | This is a playbook/script, not a Slack feed. | Timeline with event-type typography shifts. HeroUI Accordion for structure is fine; prose inside is authored. |
| **Empty / loading / error states (narrative pages)** | HeroUI "No results" + default Skeleton = soulless. | Rendered in HeroUI primitives but copy and micro-interactions are authored. Full copy surface list in **§2B — Mercury Brief** below. |
| **404 + error pages** | Last impression moment. Copy lives in 2B. | In-voice. Railroaded-specific. Not "Oops!" |
| **Brand footer sign-off** | One line that reminds you whose work this is. | "A Karim Elsahy × Poormetheus production" — Cinzel, gold, small. |

### 2B. Mercury Brief — authored copy surfaces

Copy for every authored-voice moment below is drafted by Mercury before Atlas touches Sprint N. Fekry approves Mercury's output; Atlas ports verbatim. Atlas does not "improve" copy during build.

**Voice anchor:** Railroaded's in-world narrator — the house dungeon master. Not marketing-we, not customer-success. The product has a voice; Mercury already knows it.

| # | Surface | Trigger condition | Shape |
|---|---|---|---|
| 1 | Bestiary — empty | No monsters discovered | 1–2 sentences, anticipatory. ("The parties are still exploring.") |
| 2 | Characters — empty | No characters registered | 1–2 sentences, inviting. |
| 3 | Journals — empty | No sessions logged | 1–2 sentences, anticipatory. |
| 4 | Worlds — empty | No dungeons live | 1–2 sentences. ("The halls are quiet.") |
| 5 | Narration stream — loading | Waiting for next beat | Micro. Cursor + "The narrator considers…" or equivalent. |
| 6 | Session detail — loading | Full session load | One line, in-voice. |
| 7 | Tracker feed — paused | Auto-refresh interval | Sub-line, minimal. |
| 8 | 404 | Route not found | Short paragraph. Lost-in-dungeon framing, not confused-user framing. |
| 9 | Server error / 500 | API down | Short paragraph. "The narrator has stepped away" or similar. |
| 10 | Footer sign-off | Every page | One line, Cinzel. |

**Deliverable:** Mercury commits one doc (format up to her) that Fekry can approve in one read. Once approved, it's the source of truth Atlas pulls from.

### The 80% Stock — HeroUI, no argument

- All forms (login, register, waitlist, dashboard, API keys)
- Navbar structural shell, Footer structural shell (brand typography authored inside them)
- All filters, selects, dropdowns, tabs, pagination, tooltips, toggles, buttons, chips
- Character roster grid, character sheets (Card + Avatar + Badge + Table)
- Leaderboard tables + tab switching
- Bestiary grid cards
- Worlds list, Docs page, About page body, Benchmark charts
- All legal, terms, privacy

**Rule:** if a surface appears in the Authored table above, Atlas builds it per this doc. If it doesn't, Atlas defaults to stock HeroUI. No judgment calls.

---

## 3. Non-Negotiables (the quality bar that survives HeroUI)

These override "stick to HeroUI" when they conflict. If Atlas can't satisfy both, that's a tiebreaker case (§4).

1. **Cinzel is the brand.** Every H1–H4, every logo instance, every footer sign-off, every navbar brand mark. Zero exceptions. This is non-negotiable across stock and authored surfaces.
2. **Gold is not a swap.** `#c9a84c` needs a full 100–900 ramp that survives every HeroUI primary state — hover, focus ring, disabled, pressed, selected, invalid-but-primary-action. A single "primary" token assignment is not a theme; it's a color change. Atlas generates the ramp via HeroUI's OKLCH utilities and Fekry signs off before Task 2 ships. *(Note: no existing DESIGN.md. This gold ramp is the first artifact of the design system. Every subsequent token decision in this sprint lands in the same doc as we go.)*
3. **Narrative prose is Crimson Text or it's wrong.** Narrations, journals, session replays, DM vision panels. HeroUI Card/Tooltip/Chip inside these renders system font — that's fine, the prose itself is Crimson.
4. **No "Oops!" copy.** Error and empty states on narrative pages are in-voice. UI chrome (form validation, API errors, 500 pages) can be stock.
5. **Dark is default and only.** No light-mode toggle. HeroUI supports both; we ship one. Removes an entire axis of inconsistency.
6. **Home hero is one idea, not three.** Live narration excerpts are the always-on hero. "Now playing" ticker is a conditional second beat, shown only when active sessions exist. When no active sessions, the hero degrades gracefully to narration-only. Two features can't share the hero; one feature can have state.

---

## 4. Tiebreaker Protocol

When HeroUI default conflicts with authored feel:

1. **Check §2 authored list.** Is this surface in the table? → build authored.
2. **Not in the table?** → default to stock HeroUI.
3. **Conflict with §3 non-negotiable?** → non-negotiable wins. Flag to Fekry with one-line rationale.
4. **Genuinely uncertain?** → Ask Fekry via Telegram (Atlas channel). One ask, not a thread. Default decision while waiting: stock HeroUI.

**Atlas default bias:** when in doubt, stock. Authored is explicit.

---

## 5. Scope — What Ships This Weekend

Fekry's call: everything ships this weekend. Both Atlas and Poormetheus know.

**My honest CPO insight — take it as input, not gate:**

- **Feasibility read:** aggressive but not reckless, provided §2 and §3 are locked before Task 1 starts. The risk is not the 24 pages. The risk is Atlas freezing on "is this authored?" on every page and defaulting to stock on narrative surfaces. That's what this doc prevents.
- **Order matters more than parallelism.** Task 3 (Tracker) is the pattern validator. It's the page where authored-meets-stock happens most densely (live narration feed inside HeroUI layout primitives). If Tracker feels right, every other page inherits the pattern. If Tracker feels like a dashboard, the whole migration feels like a SaaS. **Do not parallelize Tasks 4–12 until Tracker ships and I've reviewed it.**
- **Copy is not a rewrite job.** Keep existing copy verbatim. Only restructure markup. **New authored copy (per §2B) flows: Fekry sends this thesis to Mercury → Mercury drafts the copy doc → Fekry approves → Atlas reads the approved copy and ports verbatim. Atlas does not draft or edit copy during build.** If Atlas starts "improving" anything, pause him.
- **Sunday parallel batch:** About, Docs, Legal (Terms/Privacy), Worlds, Open Source. These are static/low-risk and can run in parallel after Tracker validates on Saturday.
- **Cutover hold:** Task 13 (DNS/Vercel swap) only fires if Tracker + Leaderboard + Home all pass a Fekry visual review. If any one fails, we ship Next.js as a `/v2` preview path and leave live site up. A half-migrated generic site is worse than the current one. **Fekry notifies Karim before DNS flips live — courtesy heads-up, not a sign-off gate.**

---

## 6. Decisions Log

All open questions from Draft 1 resolved in Fekry call (Session 2, Apr 17):

| # | Decision | Ruled by |
|---|---|---|
| 1 | No existing `DESIGN.md`. This thesis + the Sprint N theme work **is** the starting design system. Doc grows through the sprint, not before. | Fekry |
| 2 | Home hero = live narration excerpts (A) always-on, "now playing" ticker (B) conditional on active sessions. Option C (hand-set typographic statement) dropped. | Fekry |
| 3 | Authored copy (§2B) written by Mercury. Thesis ships to Mercury first → Mercury drafts → Fekry approves → Atlas builds against approved copy. | Fekry |
| 4 | Gold ramp (100–900) gate confirmed. Atlas generates via HeroUI OKLCH; Fekry signs off before Task 2 ships. | Fekry |
| 5 | DNS cutover is Fekry's authority. Karim gets a pre-deploy heads-up, not a gate. | Fekry |

---

## Sign-off

When this draft is green:
1. Commit to `/home/mf/railroaded/` as `SPRINT_N_PRODUCT_THESIS.md` (companion to the engineering spec).
2. **Fekry sends thesis to Mercury.** Mercury drafts §2B copy. Fekry approves. Mercury commits approved copy doc alongside the thesis in the railroaded repo.
3. Notify Ram Prime via `mf-prime/OUTBOX_FOR_RAM_PRIME.md` — SPEC layer now has a product companion (this doc + Mercury's approved copy). Both docs together form the full brief.
4. Atlas reads thesis + copy doc before Task 1.

— MF Prime (Draft 2)
