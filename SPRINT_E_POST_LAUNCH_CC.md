# Sprint E — Post-Launch Features CC Task Document

**Source:** Poormetheus Sprint E Spec + Amendments (March 24, 2026)
**Reviewed by:** Prime (codebase-verified)
**For:** Atlas/Sonnet execution
**Scope:** Frontend bugs, copy overhaul, model badges, benchmark, theater, avatars. NO backend combat fixes (separate CC job per Karim directive).

**⚠️ TEST WARNING:** `bun test` hangs without local Postgres. Use `bun run test` (30s hard kill wrapper). NEVER run raw `bun test`.

---

## Voice Directive (APPLIES TO ALL TASKS BELOW)

**This is not a task group. It is a lens applied to every task in this document.**

Every user-facing string on this site must read like it was written by a storyteller, not a log parser. If text reads like a database entry, a debug message, or a template placeholder — rewrite it. This applies to: session summaries, activity ticker, card descriptions, empty states, error messages, button labels, meta descriptions.

**The test:** "Would a theater marquee print this?" If no, it's wrong.

**Patterns to kill globally:**
- "Session complete. N events" → dramatic one-liner from the session
- "Automated session: explored N rooms in a scheduled dungeon run" → use session summary or generate from party name + phase + event highlights
- "No data yet" / "Coming soon" → rewrite with personality and next-step guidance
- "Dungeon Exploration Session" → contextual fallback using party name, event count, phase
- Any raw event type names visible to spectators (room_override, dm_session_metadata, etc.) → filter or narrate
- Generic template combat text ("The party faces N monsters in a fierce battle!") → use actual event data with character names, monster names, outcomes

**When you encounter ANY user-facing string while working on a task, apply this test. Don't just fix the items listed — fix everything you touch.**
---

## Execution Rounds

### Round 1 — Bug Fixes + Foundation (ship first)

| # | Task | Files |
|---|------|-------|
| E4.1 | About page: sessions counter shows zero | `website/about.html` |
| E4.2 | About page: broken session link (`session#` → `session?id=`) | `website/about.html` |
| E4.3 | Leaderboard: empty `<tr>` rows between entries | `website/leaderboard.html` |
| E4.4 | Epic Moments: duplicate entries (dedup by sessionId + event type) | `website/index.html` |
| E4.5 | Homepage narrations: all from same session | `website/index.html` |
| E4.6 | Benchmark console error (`Benchmark: 0 []`) | `website/benchmark.html` |
| E4.7 | Theater "Best Of" generic descriptions | `website/theater.html` |
| E4.8 | OG image: SVG→PNG for social sharing | `website/*.html`, `website/og-share.svg` |

### Round 2 — The Thesis Round (model badges + benchmark + avatars)

| # | Task | Files |
|---|------|-------|
| E1.1 | Character avatars on characters page (use `avatarUrl` from `/spectator/characters`) | `website/characters.html` |
| E1.2 | Model badges on characters page + theater page (the 2 pages missing them) | `website/characters.html`, `website/theater.html` |
| E6.1 | Benchmark page: render live data from `/spectator/benchmark` endpoint | `website/benchmark.html` |

### Round 3 — Copy Overhaul + Theater Depth

| # | Task | Files |
|---|------|-------|
| E2.1 | Session descriptions: improve `SUMMARY_FALLBACK` + all template text | `src/api/spectator.ts`, `website/theater.html`, `website/tracker.html` |
| E2.2 | Epic Moments: replace template text with real dramatic events | `website/index.html` |
| E3.1 | Theater: character spotlight when no live session | `website/theater.html` |
| E3.2 | Theater: recent sessions archive below Best Of | `website/theater.html` |
| E5.1 | Happening Now ticker: show recent highlights when empty | `website/index.html` |
| E5.2 | Tracker page: fill empty state when no live sessions | `website/tracker.html` |
---

## Round 1 — Bug Fixes + Foundation

---

### E4.1: About Page — Sessions Counter Shows Zero

**Problem:** Homepage "The World So Far" shows "84 Sessions Played" (fetches `/spectator/stats`). About page "See It In Action" section shows "0 Sessions Played" (fetches `/spectator/leaderboard` and reads `data.totalSessions`).

**Root cause:** `loadAggregateStats()` in about.html (~line 325) fetches `/spectator/leaderboard` and reads `data.totalSessions`. The leaderboard endpoint returns `totalSessions` from the `game_sessions` count. But the function also tries `data.sessions?.length` as fallback — if the response shape varies, this could return 0.

**Fix:** Change `loadAggregateStats()` to fetch `/spectator/stats` instead (same endpoint the homepage uses). Read `data.totalSessions`, `data.totalCharacters`, `data.totalEvents`. This guarantees consistency with the homepage counter.

**File:** `website/about.html` (~line 325, `loadAggregateStats` function)

---

### E4.2: About Page — Broken Session Link

**Problem:** "Watch Full Replay →" links to `/session#f7d3d199-...` (hash). Should be `/session?id=f7d3d199-...` (query param). Currently shows "No session ID provided" error.

**Fix:** In `loadShowcaseSession()` (~line 318), change:
```
'/session#' + esc(best.id)
```
to:
```
'/session?id=' + encodeURIComponent(best.id)
```

**File:** `website/about.html` (~line 318)
---

### E4.3: Leaderboard — Empty Table Rows

**Problem:** Blank `<tr>` elements between actual leaderboard entries.

**Fix:** In the leaderboard rendering function, filter out any entries where the character name is null/empty/undefined before generating `<tr>` elements. Add: `rows = rows.filter(r => r.name && r.name.trim())` before the `.map()` call that generates HTML.

**File:** `website/leaderboard.html`

---

### E4.4: Epic Moments — Duplicate Entries

**Problem:** "Ambush! The party faces 3 monsters" appears twice for the same session + timestamp.

**Fix:** In `loadEpicMoments()` (`website/index.html` ~line 1703), after collecting all moments, dedup before rendering:
```javascript
const seen = new Set();
const unique = moments.filter(m => {
  const key = m.sessionId + '::' + m.title + '::' + m.desc;
  if (seen.has(key)) return false;
  seen.add(key);
  return true;
});
```
Use `unique` instead of `moments` for the final `.slice(0, 4)`.

**File:** `website/index.html` (~line 1703, `loadEpicMoments`)
---

### E4.5: Homepage Narrations — All From Same Session

**Problem:** All 8 narration entries in "Latest from the Dungeons" are from the same party + session ("The Stalwart Arcanum — 2h ago").

**Fix:** The narration ticker fetches from `/spectator/narrations`. If the API returns narrations sorted by recency (all from latest session), the frontend should distribute across sessions. After fetching narrations, group by `sessionId` or `partyName`, then interleave — take 1 from each session round-robin until 8 are collected. If only 1 session has narrations, show max 3 from it and fill the rest with a "More tales coming soon..." placeholder.

**File:** `website/index.html` (narration ticker loading function, search for `narration-ticker`)

---

### E4.6: Benchmark Console Error

**Problem:** `Benchmark: 0 []` logged on page load.

**Fix:** In `website/benchmark.html`, find the `console.log('Benchmark:', ...)` line (~line 277 area) and either remove it or wrap it: `if (models.length) console.log(...)`. The empty-state message should render without console noise.

**File:** `website/benchmark.html`

---

### E4.7: Theater "Best Of" — Generic Descriptions

**Problem:** Best Of gallery shows only 2 entries with "Dungeon Exploration Session" or similar mechanical copy.

**Fix:** The Best Of section pulls from `/spectator/sessions`. For each session card:
1. If `session.summary` exists and passes the Voice Directive test, use it
2. If not, construct: `"${partyName} — ${eventCount} events across ${phase}"`
3. Never show raw "Dungeon Exploration Session" — that's `SUMMARY_FALLBACK` leaking through

Also: if fewer than 3 Best Of sessions exist, show a styled empty slot: "The next great session hasn't been written yet."

**Apply Voice Directive:** While editing theater.html, find the "Automated sessions run three times daily" text (~line 210) and rewrite to something like: "New sessions begin throughout the day. The dungeon never sleeps."

**File:** `website/theater.html`

---

### E4.8: OG Image — Verify PNG Renders on Social Platforms

**Status:** Session 153 Track 2 already converted SVG→PNG and updated all meta tags. All `website/*.html` files point to `og-share.png`. The PNG file exists at 20KB (1200×630).

**Verify:** Share `https://railroaded.ai` on Twitter Card Validator or Discord. If the preview still shows blank, the issue is likely caching or the PNG itself (corrupted, wrong dimensions). Re-export from SVG if needed.

**Files:** `website/og-share.png` (verify renders), all `website/*.html` (already updated — confirm)

---

## Round 2 — The Thesis Round

These three tasks together transform the site from "D&D game" to "AI behavioral comparison platform." Ship them as one round.

---

### E1.1: Character Avatars on Characters Page

**Current state:** `characters.html` already has avatar rendering code (~line 248) using `avatarUrl` from `/spectator/characters`. The endpoint (`src/api/spectator.ts` line 660) already returns `avatarUrl` per character. Characters with catbox.moe URLs should render; others fall back to styled initials.

**What to verify/fix:**
1. Confirm `safeUrl()` function doesn't strip catbox.moe URLs
2. If avatars aren't rendering, check the `onerror` handler — it should gracefully fall back to the initial circle
3. Make sure the avatar `<img>` has proper dimensions (48-64px circle, `border-radius: 50%`, `object-fit: cover`)
4. Add a subtle border matching the model's provider color (if model badge exists on same card)

**File:** `website/characters.html` (~lines 79-83 CSS, ~lines 248-253 JS)

---

### E1.2: Model Badges — Verify + Fix Everywhere

**Step 0 (VERIFY FIRST):** Before writing any badge code, confirm the data pipe works:
1. `curl https://api.railroaded.ai/spectator/characters | jq '.[0].model'` — does `model` data exist?
2. `curl https://api.railroaded.ai/spectator/character-identities | jq '.[0]'` — does identity data exist?
3. Open `website/index.html` in browser, inspect the homepage quotes — do model badges render?

If badges are invisible everywhere (not just characters + theater), the issue is the data pipe, not missing code. Fix `charModelMap` population in `loadAvatars()` (~line 1408 in index.html) and equivalent functions on other pages. If badges work on some pages but not others, scope the fix to the broken pages only.

**Current state (claimed):** Model badges are on index, benchmark, leaderboard, session, tracker, journals, bestiary. Missing from `characters.html` and `theater.html`. Poormetheus's browser audit contradicts this — he saw zero badges anywhere. Verify before assuming 7/9 are done.

**For characters.html:**
The `/spectator/characters` endpoint already returns `model: { provider, name }` per character. Add a model badge pill below each character's name in the gallery card. Use the same color scheme already established:
- Anthropic/Claude = `#8b5cf6` (purple)
- Google/Gemini = `#3b82f6` (blue)
- OpenAI/GPT = `#22c55e` (green)
- Meta/Llama = `#f97316` (orange)
- DeepSeek = `#14b8a6` (teal)

CSS for the badge pill already exists in `index.html` (`.model-badge` ~line 926). Copy the same styles into `characters.html`'s `<style>` block, or extract to shared CSS if practical.
**For theater.html:**
Theater page shows session cards (Featured Production, Best Of, schedule). Each session involves a party with members. For each session card, show the model mix — e.g., "Claude + Gemini + GPT" as small badges. Data source: fetch `/spectator/parties` to get member model info, or `/spectator/character-identities` for the lightweight map.

**Files:** `website/characters.html`, `website/theater.html`

---

### E6.1: Benchmark Page — Render Live Data

**Current state:** The `/spectator/benchmark` endpoint (`src/api/spectator.ts` ~line 2765) is FULLY BUILT. It joins characters with users, groups by model, computes: characters, sessions, alive/dead, monstersKilled, totalDamageDealt, criticalHits, timesKnockedOut, dungeonsCleared, goldEarned, avgLevel, classChoices, raceChoices, personality trait counts. Returns sorted by character count.

The frontend (`website/benchmark.html`) already has `renderSummaryChart()`, `renderModelCards()`, `renderChoiceBars()` functions AND fetches from `/spectator/benchmark` (~line 383). But it shows "No benchmark data yet" — either the endpoint returns empty (no characters in DB have `modelProvider` set), or the frontend rendering has a bug.

**Debug + fix:**
1. `curl https://api.railroaded.ai/spectator/benchmark` — check if data exists
2. If empty: the issue is that characters in the DB don't have `userId` linked to users with `modelProvider`/`modelName`. This is a data problem, not a code problem. In that case, update the benchmark empty state per Voice Directive: "No models have entered the dungeon yet. The first to play writes history." Add a CTA: "Send your agent →" linking to `/docs`.
3. If data exists but doesn't render: debug the JS. Check the response parsing — the frontend expects `data.models` or `data` as array. Align with actual endpoint response shape.
4. Either way, fix "Coming soon — tracking across live sessions" badges on Character Authenticity and Response Time sections. Replace with: "Tracking begins once 100 sessions are recorded" with a progress bar showing current session count / 100. Fetch count from `/spectator/stats`.

**Apply Voice Directive:** Replace ALL generic copy on this page. The hero subtitle, section headers, empty states — everything should reflect "Which AI is the best D&D player?" not "Benchmark data visualization."

**File:** `website/benchmark.html`
---

## Round 3 — Copy Overhaul + Theater Depth

---

### E2.1: Session Descriptions — Kill "Dungeon Exploration Session"

**Problem:** `SUMMARY_FALLBACK` in `src/api/spectator.ts` (line 35) is `"Dungeon Exploration Session"`. This string appears everywhere a session lacks a summary. The contextual fallback (line 44-50) produces `"PartyName — 24 events — combat"` which is better but still mechanical.

**Backend fix** (`src/api/spectator.ts`):
1. Change `SUMMARY_FALLBACK` to `null` — never return a generic string. Let the frontend handle missing summaries with page-appropriate copy.
2. Improve the contextual fallback to be more narrative. Instead of `"The Stalwart Arcanum — 24 events — combat"`, try: `"The Stalwart Arcanum ventured into combat — 24 events recorded"` or let the frontend construct this.

**Frontend fix** (all pages that display session summaries):
- `website/theater.html`: When summary is null, show party name + dramatic framing: "${partyName}'s expedition awaits its chronicler."
- `website/tracker.html`: When summary is null, show "${partyName} — ${eventCount} moments, unwritten."
- `website/index.html`: Homepage session references — same treatment.

**Apply Voice Directive** across all touched files while making these changes.

**Files:** `src/api/spectator.ts` (line 35, lines 44-50), `website/theater.html`, `website/tracker.html`, `website/index.html`
---

### E2.2: Epic Moments — Real Dramatic Events

**Problem:** Template text: "The party faces N monsters in a fierce battle!", "An adventurer has fallen in battle.", "A warrior landed a devastating critical hit." All generic. No character names, no monster names, no specifics.

**Current code** (`website/index.html` ~line 1703): `loadEpicMoments()` fetches sessions, then events, and constructs moments from event data. The event data (`d.attackerName`, `d.characterName`, `d.damage`, `d.monsterCount`) IS available — the code just doesn't use it well.

**Fix the moment construction:**

```javascript
// Combat start — use monster names if available
if (t === 'combat_start' || t === 'encounter_start') {
  const monsters = d.monsters || [];
  const monsterNames = monsters.map(m => m.name || m.type).filter(Boolean);
  const count = d.monsterCount || monsters.length || 0;
  if (count >= 2) {
    const desc = monsterNames.length 
      ? `${partyName} stumbles into ${monsterNames.slice(0,2).join(' and ')}${count > 2 ? ` and ${count-2} more` : ''}.`
      : `${partyName} faces ${count} enemies in the dark.`;
    moments.push({ icon: '⚔️', title: 'Ambush', desc, sessionId: s.id, time: ts });
  }
}

// Character death — use the actual name
if (t === 'character_death' || t === 'death') {
  const name = d.characterName || d.name || 'A hero';
  moments.push({ icon: '💀', title: 'Fallen', desc: `${name} falls. The party carries on without them.`, sessionId: s.id, time: ts });
}

// Critical hit — name + damage
if ((t === 'attack' || t === 'combat_action') && d.critical) {
  const attacker = d.attackerName || d.actor || 'Someone';
  const dmg = d.damage ? ` for ${d.damage} damage` : '';
  moments.push({ icon: '💥', title: 'Critical Strike', desc: `${attacker} lands a devastating blow${dmg}.`, sessionId: s.id, time: ts });
}
```
Also add new moment types:
- **Near death** (HP drops to ≤5): `"${name} staggers at ${hp} HP."`
- **Dungeon cleared**: `"${partyName} emerges victorious."`
- **Boss kill** (if `d.isBoss` or monster name contains "boss/lord/king"): `"${attacker} fells the ${monsterName}."`

**File:** `website/index.html` (~line 1703-1770, `loadEpicMoments`)

---

### E3.1: Theater — Character Spotlight (No Live Session State)

**Problem:** When no session is live (95% of the time), the theater page shows a countdown and schedule. No engaging content to browse.

**Build:** Add a "Character Spotlight" section that appears when no session is live:
1. Fetch `/spectator/characters?limit=20` (or character-identities for lightweight)
2. Pick a random character with interesting stats (most kills, highest level, most sessions, or recently dead)
3. Render a spotlight card:
   - Avatar (or styled initial)
   - Model badge
   - Name, race, class, level
   - One notable stat ("Slayer of 12 monsters" / "Survived 8 dungeons" / "Fell in Session 47")
   - Link to character profile: `/character?id=${id}`
4. "Refresh" button to spotlight a different character
5. Tagline: "While the stage is dark, meet the cast."

**File:** `website/theater.html`
---

### E3.2: Theater — Recent Sessions Archive

**Problem:** Best Of shows 2-3 sessions. Below that, nothing. 84 sessions in the DB, invisible.

**Build:** Add "Recent Sessions" section below Best Of:
1. Fetch `/spectator/sessions?limit=10&offset=0`
2. Render as compact cards:
   - Party name
   - Date (relative: "2 days ago")
   - Outcome badge: ✅ Cleared / 💀 TPK / ⏸ Ended
   - Event count
   - Model mix (fetch character-identities, cross-reference)
   - 1-line summary (from API, or Voice Directive fallback)
   - Link to replay: `/session?id=${id}`
3. "Load More" button (increment offset by 10)

**File:** `website/theater.html`

---

### E5.1: Happening Now Ticker — Recent Highlights When Empty

**Problem:** When no session is live, the ticker is dead/empty.

**Fix:** When `isActive` is false for all sessions:
1. Fetch recent events from last 24h (from `/spectator/sessions` → pick most recent → fetch its events)
2. Show as ticker: "Earlier today: ${characterName} rolled a natural 20..." / "Last night: ${partyName} cleared the dungeon..."
3. Prefix with time context ("Earlier today", "Yesterday", "Last session")
4. If no events in 24h: "The dungeon sleeps. Next session: ${nextScheduledTime}"

**File:** `website/index.html` (Happening Now ticker section)

---

### E5.2: Tracker Page — Fill Empty State

**Problem:** The tracker is one of 5 primary nav items. When no session is live (95% of the time), it shows "No active parties yet" with a sad face emoji. Dead end. No guidance, no recent content, no reason to stay.

**Fix:** When no live parties exist:
1. Replace "No active parties yet 😶" with: "No live sessions right now. Next show: [countdown]. Browse recent sessions below."
2. Auto-load the most recent completed session in the center column (the session detail view) so there's always something to look at
3. Show the last 3 completed sessions as selectable entries in the left sidebar, styled as "Recent" with a dimmed indicator (not "Active")
4. Include a "Get notified when a session starts" link to the theater page schedule

**File:** `website/tracker.html`

---

## Done Criteria Per Round

### Round 1 Done:
- [ ] About page shows same session count as homepage
- [ ] About "Watch Full Replay" links work (query param, not hash)
- [ ] No blank rows in leaderboard
- [ ] No duplicate Epic Moments
- [ ] Narrations pulled from multiple sessions
- [ ] No console errors on benchmark page
- [ ] Theater Best Of descriptions are narrative, not mechanical
- [ ] OG image is PNG (not SVG) and renders in Twitter/Discord/Slack link previews
- [ ] All tests pass via `bun run test`

### Round 2 Done:
- [ ] Step 0 badge verification completed — data pipe confirmed working or fixed
- [ ] Character avatars render on Characters page (catbox URLs work, initials fallback)
- [ ] Model badges visible on Characters page cards
- [ ] Model badges visible on Theater page session cards
- [ ] Benchmark page renders model comparison data OR shows a compelling empty state with CTA
- [ ] Zero instances of "No benchmark data yet" without personality
- [ ] All tests pass via `bun run test`

### Round 3 Done:
- [ ] No instance of "Dungeon Exploration Session" visible anywhere on the site
- [ ] Epic Moments use real character/monster names from event data
- [ ] Theater has character spotlight section when no session is live
- [ ] Theater has recent sessions archive (10 sessions, compact cards)
- [ ] Happening Now ticker shows recent highlights when no session is live
- [ ] Tracker page shows recent sessions when no live session (not a dead end)
- [ ] All user-facing strings pass the Voice Directive test
- [ ] All tests pass via `bun run test`
---

## Global Rules

1. **Commit each round separately.** `Round 1: Sprint E bug fixes`, `Round 2: Model badges + benchmark + avatars`, `Round 3: Copy overhaul + theater depth`.
2. **Push after each round.** Deploy triggers automatically.
3. **Voice Directive is not optional.** Every string you touch, test it. If it reads like a log entry, fix it even if the task didn't explicitly mention it.
4. **No DiceBear.** If you encounter DiceBear avatar URLs, skip them (show initial fallback instead).
5. **Model badge colors are fixed.** Claude=purple (#8b5cf6), Gemini=blue (#3b82f6), GPT=green (#22c55e), Llama=orange (#f97316), DeepSeek=teal (#14b8a6). Same everywhere.