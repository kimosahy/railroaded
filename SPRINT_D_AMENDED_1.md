# Sprint D Amended — Track 1: P0 Bug Fixes + Homepage Enhancements

**For:** Atlas
**Priority:** P0 — blocks all traffic and marketing launch
**Context:** Sprint D original shipped 15 commits. Live site audit found 3 new bugs + missing content. This track fixes them.

**⚠️ TEST WARNING:** `bun test` hangs indefinitely — no local Postgres means DB connection pool holds the process open. Use `bun run test` which calls `test-runner.sh` (30s hard kill timer). NEVER run raw `bun test`.

---

## Task 1: Fix SPA Routing (P0 — CRITICAL)

**Problem:** Every sub-page URL (`/tracker`, `/leaderboard`, `/bestiary`, `/journals`, `/characters`, `/worlds`) renders the homepage content. The router doesn't hydrate on direct URL access — every URL shows the same page.

**Root cause investigation:** The website uses static HTML files with Vercel `cleanUrls: true` — so `/tracker` should serve `tracker.html` on Vercel. Check if: (a) the HTML files are accidentally loading a JS client-side router that mounts the homepage component on all pages, (b) shared JS code overrides the page content on load, or (c) there's a missing page-specific JS initialization. Look at `index.html` vs `tracker.html` — if they share a `<script>` that renders the homepage, that's the bug. The website is in `website/` directory — static HTML, no build system.

**Fix:**
- Check how routes are defined in the website (likely `website/src/` or `website/index.html`)
- Ensure all defined routes render their own components on direct URL access
- Ensure Vercel config handles client-side routing (may need `vercel.json` with rewrites to index.html for SPA)
- Test: visit `https://railroaded.ai/tracker` directly — should NOT show homepage content

**Verification:** Each of these URLs must render different content: `/`, `/tracker`, `/leaderboard`, `/bestiary`, `/journals`, `/characters`, `/worlds`, `/benchmark`, `/theater`, `/about`

---

## Task 2: Fix Content Duplication (P0)

**Problem:** "Voices from the Dungeon" shows 12 unique quote cards, then repeats them (24 total). Same for "Latest from the Dungeons" — narrations appear twice.

**Fix:**
- Find where these sections fetch and render data in the homepage component
- Likely a double-fetch (data fetched in both mount and effect) or render loop
- Deduplicate: ensure each quote/narration appears exactly once
- Consider deduping by ID or content hash if the API returns duplicates

---

## Task 3: Waitlist Counter Reframe (P0)

**Problem:** "Join 2 others watching the future of D&D" is negative social proof.

**Fix:** Replace with one of:
- "Early access — be among the first agents to play"
- Or show aggregate stats instead: "82 sessions played. 118 characters created. Be part of what's next."
- Remove the counter entirely if waitlist count < 50

---

## Task 4: Model Identity Badges (P0 — benchmark credibility)

**Problem:** Model identity data exists in the API (`modelIdentity` field on events, characters) but no UI element shows which model is playing which character.

**Fix:**
- Add small tasteful model badges next to character names throughout the site
- Format: small pill/tag showing "Claude Opus" or "GPT-4" or "Gemini" etc.
- Apply to: "Voices from the Dungeon" quotes, "Latest from the Dungeons" narrations, tracker event feed, character pages, leaderboard rows
- Pull from `modelIdentity` or `model_provider` fields in spectator API responses
- If no model identity available, show nothing (don't show "Unknown")

---

## Task 5: "Why This Exists" Section (P0 — blocks first-time visitor conversion)

**Problem:** Homepage tells WHAT but not WHY anyone should care.

**Fix:** Add a section above the fold or just below the hero with:

**Headline:** "Every AI company tells you their model is creative. We let you watch it prove it — live, for hours, with no safety net."

**Subtitle:** "Railroaded is autonomous AI theater: real agents running real tabletop campaigns, improvising characters, building worlds, making decisions no one scripted. The entertainment is the benchmark."

**Three sub-points (with icons):**
- 🎭 **Theater** — Live, unscripted AI performances you can watch in real time
- 📊 **Benchmark** — The first behavioral AI comparison from naturalistic gameplay, not synthetic tests
- 🌐 **Platform** — Open ecosystem where any AI agent can play. Your agent. Any model. Real consequences.

---

## Task 6: Navigation Update

**Current nav is stale.** Update to:

**Top nav items:** Home, Theater, Benchmark, Bestiary, Characters, Worlds, Journals, Leaderboard, The Open Dungeon, About

**Remove:** Stats (merged into homepage), Tavern (renamed to Characters), Dungeons (renamed to Worlds)
**Add:** Theater, Benchmark, The Open Dungeon (with tooltip "Open Source"), About

**Footer:** Add `Terms of Service · Privacy Policy` links (pages don't exist yet — link to `/terms` and `/privacy`, they'll 404 for now and get built in a later sprint)

---

## Task 7: "Send This to Your Agent" Prominence

**Problem:** The agent onboarding flow (3-step: install skill, configure, play) should be MORE prominent, not hidden.

**Fix:** Make the agent onboarding steps a prominent CTA section on the homepage. Consider two paths:
- "I want to watch" → Theater/Tracker
- "I want my agent to play" → Agent onboarding steps with `clawhub install railroaded` command

The tweet-worthy framing: *"I told Claude to go play D&D. It signed up, created a half-orc barbarian, and got into a bar fight. I did nothing."* — include this or similar copy near the agent CTA.

---

## Done Criteria

- [ ] All sub-page URLs render their own content (not homepage)
- [ ] No duplicate cards in Voices/Narrations sections
- [ ] Waitlist shows appropriate social proof
- [ ] Model identity badges visible on quotes, narrations, tracker, characters, leaderboard
- [ ] "Why This Exists" section visible on homepage
- [ ] Nav updated with correct links
- [ ] Agent onboarding CTA prominent on homepage
- [ ] All tests pass via `bun run test`
- [ ] Commit each task separately
