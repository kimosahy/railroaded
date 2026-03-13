# Railroaded UX Sprint — Round 2

Continue the UX sprint on the Railroaded website. Round 1 shipped 16 batches of frontend work, then the IE loop added backend support. This round covers remaining features.

Read CLAUDE.md for full project context. Work inside `website/` for frontend, `src/` for backend. Static HTML/CSS/JS on Vercel, API at `https://api.railroaded.ai`.

## BATCH A: Featured Session / "Story of the Week" on home page (20 min)

**File: website/index.html**

Add a "This Week's Featured Adventure" section on the home page between the stats grid and the Explore cards. Shows a card with: party name, narration excerpt (~200 chars), "Read the full adventure" link to journals.

Auto-select: fetch `GET /spectator/sessions?limit=10&offset=0`, pick the completed session (`isActive:false`) with highest `eventCount`. Fetch narrations from `GET /spectator/narrations/${sessionId}`, show first narration truncated. Fallback: most recent completed session summary.

Style: dark card, gold heading (Cinzel), body text (Crimson Text). Clickable → journals.

**Acceptance:** Home page shows featured session card with narration excerpt.

## BATCH B: Enhanced narration with typewriter effect (25 min)

**Files: website/tracker.html, website/session.html**

1. Typewriter effect for NEW narrations only (not initial load). Reveal chars at ~25ms:
```javascript
function typewriter(el, text, speed=25) { el.textContent=''; let i=0; (function t(){if(i<text.length){el.textContent+=text[i];i++;setTimeout(t,speed);}})(); }
```

2. Style variants: `.narration-dm` = serif italic with subtle bg, `.narration-combat` = bold red, `.narration-dialogue` = italic.

3. Mood indicator at top of narration panel from session phase field: combat→⚔️ Combat, exploration→🗺️ Exploring.

**Acceptance:** New narrations typewrite in. Styled variants. Mood indicator.

## BATCH C: Campaign / Dungeon overview page (30 min)

**Create: website/dungeons.html**

"The Dungeon Board" — grid of dungeon cards. Fetch sessions `GET /spectator/sessions?limit=50&offset=0`. Group by summary patterns to find unique dungeons. Each card: dungeon name, sessions attempted, completion count, total events. Links to journals. Add "Dungeons" to nav on all pages.

**Acceptance:** dungeons.html shows dungeon grid with stats. Nav updated.

## BATCH D: Bestiary / Monster compendium page (25 min)

**Create: website/bestiary.html**

Grid of monsters from combat events. Fetch sessions then events for each. Filter combat events, extract monster names from event data. Each card: monster name, encounter count, danger icon (💀🐺👹🐉). Sortable by name/count. Add "Bestiary" to nav.

**Acceptance:** bestiary.html shows monster grid with stats. Sortable. Nav updated.

## BATCH E: Session filtering and search (20 min)

**Files: website/tracker.html, website/journals.html**

**tracker.html:** Status dropdown (All/Live/Completed) filtering by `isActive`. Client-side on loaded data.

**journals.html:** Text search input filtering by character name or summary keywords. Clear button.

Style filter bars: dark bg, gold border on focus, flex row above content.

**Acceptance:** Tracker has status filter. Journals have text search. Client-side filtering.

## BATCH F: Loading states for new pages (10 min)

**Files: website/session.html, website/character.html, website/stats.html, website/dungeons.html, website/bestiary.html**

Add skeleton CSS + themed error messages ("This dungeon seems empty..." / "The scrying orb is cloudy...") to all new pages.

**Acceptance:** All new pages have loading skeletons and themed errors.

## BATCH G: PWA service worker (15 min)

**Create: website/sw.js**

Cache-first service worker for static assets. Register in all pages. Check existing site.webmanifest has proper PWA fields.

**Acceptance:** "Add to Home Screen" works on mobile.

## BATCH H: Dark/light mode toggle (20 min)

**All pages**

Toggle button (🌙/☀️) in nav. `[data-theme="light"]` CSS overrides: --bg-dark:#f5f3ef, --bg-card:#fff, --text:#2a2a2a, --border:#ddd. Save to localStorage. Respect prefers-color-scheme.

**Acceptance:** Theme toggle works. Preference persists.

---

## NOTES
- Standalone HTML, inline styles, no framework, mobile responsive.
- Commit after every 2-3 batches.
- Update nav on ALL pages when adding items.
- **Priority if short:** A > E > C > B > rest
- Work on `ie-dev` branch.
