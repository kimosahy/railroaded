# Railroaded World & Quality Sprint

Read CLAUDE.md and ROADMAP.md for context. ie-dev branch. Commit after each batch.

## BATCH 1: World Map Page (30 min)

**Create: website/map.html**

A visual SVG world map that fills in based on explored dungeons.

Fetch sessions `GET /spectator/sessions?limit=50&offset=0`. Group by dungeon/campaign name (extract from summary). Each unique dungeon becomes a location on the map.

**Map layout:** Generate an SVG map (~1000x600) with:
- Dark parchment background (#1a1816)
- Grid of dungeon locations as circles/icons, arranged in a rough grid or radial layout
- Explored dungeons (have sessions) = gold filled circle with name label
- Connect dungeons with faint paths
- Hover: tooltip with dungeon name, sessions count, completion rate
- Click: navigate to `dungeons.html` or show sessions for that dungeon

Each dungeon location position can be deterministic based on hashing the dungeon name to x,y coordinates within the map bounds.

Style the page like a fantasy map — aged paper aesthetic, gold text, compass rose decoration.

Add "Map" to nav on all pages.

**Acceptance:** map.html shows a visual SVG map with dungeon locations. Explored dungeons highlighted. Hoverable and clickable. Nav updated.

## BATCH 2: Lore Wiki Page (25 min)

**Create: website/wiki.html**

Auto-generated wiki aggregating data from across the game.

Sections:
1. **Characters** — fetch all characters from leaderboard data. Show alphabetical grid of character cards (mini: avatar, name, class, level, link to profile).
2. **Dungeons** — reuse dungeons data. Show each dungeon with session count and link.
3. **Monsters** — reuse bestiary data. Show each monster with encounter count.
4. **Timeline** — Reverse-chronological list of sessions with key events extracted.

Add search/filter at top — client-side text filter across all sections.

Style: dark theme matching site. Sidebar with section links (Characters, Dungeons, Monsters, Timeline). Main content area.

Add "Wiki" to nav on all pages.

**Acceptance:** wiki.html shows aggregated game data across characters, dungeons, monsters, and timeline. Searchable.

## BATCH 3: Character Comparison Page (20 min)

**Create: website/compare.html**

Side-by-side comparison of 2-4 characters. URL: `compare.html?ids=char-7,char-8,char-9`

Parse character IDs from URL params. Fetch each from `GET /spectator/characters/${id}`.

Display in columns:
- Character header (avatar, name, race/class)
- Stat block comparison: bar chart showing relative stats (highest stat gets full bar, others proportional)
- Combat stats comparison: horizontal bars for each metric
- Achievements comparison: which achievements each character has earned

Link from: character profile ("Compare with...") and leaderboard ("Compare selected").

**Acceptance:** compare.html shows side-by-side character comparison. Stat bars show relative differences.

## BATCH 4: Home Page Stat Counters Animation (10 min)

**File: website/index.html**

The home page stat counters (Total Sessions, Characters, etc.) should animate on scroll. When the stats section enters the viewport, count up from 0 to the final number over ~1.5 seconds.

Use Intersection Observer:
```javascript
const observer = new IntersectionObserver((entries) => {
  entries.forEach(e => {
    if (e.isIntersecting) { animateCounters(); observer.unobserve(e.target); }
  });
}, { threshold: 0.3 });
observer.observe(document.getElementById('stats-section'));

function animateCounters() {
  document.querySelectorAll('.stat-number').forEach(el => {
    const target = parseInt(el.dataset.target);
    const duration = 1500;
    const start = performance.now();
    function tick(now) {
      const progress = Math.min((now - start) / duration, 1);
      el.textContent = Math.floor(progress * target).toLocaleString();
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}
```

Store the target values in `data-target` attributes. Initially show "0" or "—".

**Acceptance:** Stat counters animate from 0 to final value when scrolled into view.

## BATCH 5: Global Search (15 min)

**Files: all pages (nav update)**

Add a search icon (🔍) in the nav that opens a search modal/overlay. The search queries across:
- Character names (from leaderboard data)
- Session summaries (from sessions data)
- Page names (static list of all pages)

Implementation: On click, show a modal with search input. Fetch leaderboard + sessions data. Filter client-side as user types. Show results grouped: Characters (link to profile), Sessions (link to session detail), Pages (link to page).

Debounce input (200ms). Show top 5 results per category.

**Acceptance:** Search icon in nav. Modal search across characters, sessions, pages. Results link to correct pages.

---

## NOTES
- ie-dev branch. Commit after each batch.
- Priority: 1 (map) > 4 (counters) > 5 (search) > 2 (wiki) > 3 (compare)
