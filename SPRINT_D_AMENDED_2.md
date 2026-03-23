# Sprint D Amended — Track 2: New Pages + Page Enhancements + 404

**For:** Atlas
**Priority:** P1 — can run in parallel with Track 1
**Context:** Sprint D original built Benchmark, Theater, About pages. This track adds the Open Source page, enhances existing pages with Mercury's content/share specs, adds 404 page, and improves bestiary.
**Dependency:** None on Track 1. These pages work independently.

**⚠️ TEST WARNING:** `bun test` hangs indefinitely — no local Postgres. Use `bun run test` (30s hard kill timer). NEVER run raw `bun test`.

---

## Task 1: Open Source Page (`/open-source`) — "The Open Dungeon"

**New page.** Standalone at `/open-source` (NOT a section in About).

**Nav label:** "The Open Dungeon" (with tooltip subtitle "Open Source" for discoverability)

**Layout sections:**

**1. Hero:** "The Open Dungeon" heading. Framing: Railroaded is open source. Every contribution makes the world richer.

**2. How Contributions Compound (4 blocks):**
- 🐉 **Monster Creation:** DMs create custom monsters with art, stats, lore. Other DMs reuse them. Creator earns karma every time their monster appears in a new session.
- 🌍 **World Building:** DMs create unique worlds. Great worlds get spotlighted on Theater page.
- 📝 **Session Content:** Every session produces narrations, diaries, dramatic moments. Best get featured.
- 🤖 **Agent Innovation:** Bring a new model, new personality, new playstyle. Your behavioral data contributes to the benchmark.

**3. Karma and the Ecosystem:** Brief explanation of how karma rewards contributions (link to future karma page).

**4. GitHub Link:** Link to github.com/kimosahy/railroaded. Frame as: "We believe the best AI benchmark should be transparent. Here's the code. Here's the data. Here's the methodology."

**5. "The Rules Are Open":** Links to API docs, game rules, architecture docs.

---

## Task 2: About Page Enhancements

The About page exists from Sprint D original. Add/enhance:

**A. Team Section — IMPORTANT: photos must be large enough to see clearly**

Team members with LARGE avatar images (not thumbnails — at least 200x200px display):
- **Karim Elsahy** — Creator. Use placeholder image for now (we'll provide headshot). Link to X: @Karim_Elsahy
- **Poormetheus** — AI show-runner, QA lead, narrator. Avatar at `assets/Poormetheus_512.jpg` in the poormetheus-prime repo. For the website, copy this image to `website/public/team/` or equivalent static assets dir. Link to X: @poormetheus
- **Mercury** — Marketing lead. Use a styled placeholder avatar.
- **Atlas** — Engineering. Use a styled placeholder avatar.

**B. Virality Principle — Segment-specific positioning (3 CTA blocks):**
- **For Agent Builders:** "Your creation lives in every campaign." CTA: "Contribute to the Open Dungeon" → `/open-source`
- **For AI Researchers:** "The data is open because the experiment demands it." CTA: "Explore the Benchmark" → `/benchmark`
- **For Spectators:** "Every show is different because the world keeps growing." CTA: "Watch Now" → `/theater`

**C. Open Source Note:** "The codebase is public on GitHub. Here's the code. Here's the data. Judge for yourself." Link to repo.

---

## Task 3: Share Buttons (Global Component)

Create a reusable share button component used across multiple pages.

**Buttons (in order):**
1. **X/Twitter** — Tweet intent URL: `https://twitter.com/intent/tweet?text=...&url=...`
2. **Copy Link** — Clipboard copy with "Copied!" toast confirmation
3. **Reddit** — `https://reddit.com/submit?url=...&title=...`
4. **LinkedIn** — `https://www.linkedin.com/sharing/share-offsite/?url=...`

**NO Discord button** (no native share API — rely on OG embed tags instead).
**NO Moltbook button** (server-side distribution only).

**Apply share buttons to:**
- Benchmark page: model comparison cards, stat highlights
- Theater page: session highlights, "Best Of" entries
- Session replay page (`/session?id=xxx`): "Share this session" button
- Character/agent profiles
- (Future: karma tier celebrations — stub the component, don't implement karma yet)

---

## Task 4: OG Embed Tags (All Pages)

Invest in Open Graph meta tags. When URLs are pasted into Discord, Slack, Twitter, or any chat app, they should render rich embed cards.

**Per-page OG tags:**
- `og:title` — page-specific title
- `og:description` — compelling description
- `og:image` — relevant image (character avatar, party art, or default site image)
- `og:url` — canonical URL
- `twitter:card` — "summary_large_image"
- `twitter:site` — "@poormetheus"

**Dynamic OG for session pages:** Party name, model badges in description, dramatic highlight as description text.

---

## Task 5: Benchmark Page Enhancements

The Benchmark page exists. Enhance with:

**A. Sanitization Scoring:** Add a "Character Authenticity" metric per model. This measures whether models stay in character or break character to be "safe." Display prominently on model cards. (The actual scoring backend doesn't exist yet — stub the UI with placeholder data: "Coming soon — tracking character authenticity across live sessions")

**B. Share buttons** on model comparison cards (use component from Task 3)

**C. Response time display** (stub): "How long each model takes to decide." Placeholder for now.

**D. Data source note:** "All data generated from live, unscripted AI gameplay. No synthetic benchmarks."

---

## Task 6: Theater Page Enhancements

The Theater page exists. Add:

**Dungeon Completion Rates** as "World Progress" — visual progress bars:
- Goblin Warren: 100%
- Bandit Fortress: ~70%
- Crypt of Whispers: ~60%

Pull from spectator API if available, or hardcode initial values. Make them visually prominent — gamified progress bars, not just numbers.

---

## Task 7: Bestiary Sort Enhancement

Current bestiary exists. Add 3-way sort dropdown:
1. **Newest** (default) — most recently created first
2. **Most Encountered** — highest reuse_count first
3. **A-Z** — alphabetical

The sort dropdown should be a simple select/toggle at the top of the bestiary grid.

Also: ensure "Created by [Model]" attribution and reuse count are visible on each monster card.

---

## Task 8: 404 Page Redesign

**Art provided:** `assets/404_art.png` in the poormetheus-prime repo. Copy to website static assets.

**Copy:**
- Heading: "You've Wandered Into Uncharted Territory"
- Subhead: "The dungeon doesn't extend this far. Yet."
- Body: "The map says there should be something here, but the corridor ends in darkness. Perhaps the cartographer was drunk. Perhaps the dungeon is still being built. Either way, this isn't where you meant to be."
- CTA buttons: "Return to the Surface →" (/) | "Check the Tracker →" (/tracker) | "Read the Journals →" (/journals)

**Tone:** Dark, atmospheric, theater-appropriate. NOT cute or funny.

---

## Done Criteria

- [ ] `/open-source` page renders with all sections
- [ ] About page has team section with large photos + virality positioning
- [ ] Share buttons work on benchmark, theater, session pages
- [ ] OG tags set on all pages (test with Twitter Card Validator or opengraph.dev)
- [ ] Benchmark has sanitization scoring placeholder + share buttons
- [ ] Theater has dungeon completion progress bars
- [ ] Bestiary has 3-way sort dropdown
- [ ] 404 page renders with custom art and themed copy
- [ ] All tests pass via `bun run test`
- [ ] Commit each task separately


---

## Task 9: CC → Atlas Rename in Docs (from Track 3)

Search all .md files in the repo for references to "CC" (as Claude Code), "Claude Code", or "cc" in the coding agent context, and rename to "Atlas".

**Files likely affected:** CLAUDE.md, docs/architecture.md, skills/player-skill.md, skills/dm-skill.md, production.md, CONTRIBUTING.md, README.md

**Rules:**
- "CC" → "Atlas" when referring to the coding agent
- "Claude Code" → "Atlas" when referring to the coding agent
- Do NOT rename generic uses (e.g., Creative Commons)
- Do NOT rename anything in source code (.ts, .js)

Commit as: `docs: rename CC → Atlas throughout documentation`
