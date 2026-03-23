# Sprint D-3: Documentation + Session Replay Redesign

**WARNING: No local Postgres. Tests pass but hang on DB cleanup. Use ./test-runner.sh instead of bun test — it auto-kills after 30s.**

**Priority:** P1 (docs), P2 (session replay)
**Depends on:** Sprint D-1 and D-2 complete
**Context:** Read `CLAUDE.md` and `docs/architecture.md`. By this point, all frontend pages are overhauled, new pages (Benchmark, Theater, About) exist, monster avatar system is live, DiceBear is banned, newest-first is global.

---

## Task 1: CLAUDE.md Updates

Update the main spec file to reflect all Sprint D changes:

1. Add new frontend pages to the project structure section: `benchmark.html`, `theater.html`, `characters.html` (renamed from tavern), `worlds.html` (renamed from dungeons)
2. Remove references to deleted pages: `stats.html`, old `tavern.html`, old `dungeons.html`
3. Document avatar requirements: no DiceBear URLs, validation rule, silhouette fallback system
4. Document `create_custom_monster` avatar_url field (required), lore field (optional), created_by_model field
5. Add Session Zero spectator endpoint if new one was created
6. Document model identity flow end-to-end (header → DB → spectator API → frontend badges)
7. Update nav structure to match new reality

## Task 2: Player Agent Guide (`website/api/skill/player/index.html` or `skills/player-skill.md`)

1. Add flaw/bond/ideal/fear field descriptions with examples
2. Add avatar generation requirement — must provide a real image URL, not DiceBear
3. Add model identity self-registration via `X-Model-Identity` header
4. Remove any references to old scheduler (sessions are now agent-initiated)

## Task 3: DM Agent Guide (`skills/dm-skill.md`)

1. Document `create_custom_monster` with required `avatar_url` and optional `lore` fields
2. Document Session Zero metadata flow: when to call `set-session-metadata` (must be AFTER party formation)
3. Document DM creative freedom philosophy — DM chooses world, tone, style, setting
4. Add monster avatar requirement with DiceBear rejection note
5. Remove any references to old scheduler

## Task 4: Architecture Docs (`docs/architecture.md`)

1. Update to reflect agent-first redesign (no scheduler, agents initiate)
2. Add perception filter architecture section
3. Add model identity system section (header → storage → spectator display)
4. Document Session Zero flow end-to-end
5. Add custom monster persistence (template table, avatar storage, lore, creator model)
6. Update full API endpoint list to include all new endpoints from Sprint C + D

## Task 5: Known Issues (`docs/known-issues.md`)

1. Add bonus action spell casting bug if not yet fixed: "Healing Word via `/bonus-action` endpoint fails with 'Unknown bonus action: undefined'"
2. Add DM session metadata ordering note: "Can only set after party formation; guide previously said 'before or after'"
3. Review and clear any issues that were fixed in Sprint C or D-1/D-2

## Task 6: Session Replay Redesign (`website/session.html`) — P2

This is the "watch the recording" experience. Must read like a show transcript, not a data log.

**Header section:**
1. Party name, DM model badge, session date and duration
2. Player roster: character avatars in a row, each with name and model identity badge
3. DM World Setup: display `worldDescription`, `style`, `tone`, `setting` in a styled "Playbill" card — visually distinct from the event feed

**Event feed (main content):**
Default sort: newest first. Add toggle button: "Chronological (replay mode)" which flips to oldest-first for watching like a recording.

Event type styling:
1. **Narrations:** Full-width prose blocks. Italic, larger font, dramatic styling. Not event rows.
2. **Dialogue/chat:** Speech bubble layout with character avatar on left, name above, model badge (small). In-character speech visually distinct from OOC.
3. **Combat:** Dramatic prose beats — "Ruk's greatsword cleaves through the zombie — *15 slashing damage*. It falls." NOT a table or `{hit: true, damage: 15}`.
4. **Skill checks:** Tension format — "Thane attempts to sneak past (DC 13)... rolls 14. *Barely.*" Show character, challenge, DC, roll, result, margin.
5. **Session end:** Epilogue-styled summary text. Visually distinct as a "curtain call."

**Sidebar (right side, sticky):**
1. Party roster with current HP bars, conditions, equipment
2. Updates contextually as you scroll through events (if in chronological/replay mode)
3. Collapses to a floating roster on mobile

**Other:**
- Auto-scroll to newest events if in newest-first mode
- "Pause auto-scroll" toggle if watching a live session
- Model identity badges on EVERY actor throughout the feed
- Link back to Theater and Tracker from session page

## Task 7: Sitemap + SEO Meta Tags

1. Update `website/sitemap.xml` to include all new pages (benchmark, theater, characters, worlds) and remove deleted pages (stats, old tavern, old dungeons)
2. Each page should have proper `<title>`, `<meta description>`, and Open Graph tags (`og:title`, `og:description`, `og:image`)
3. Benchmark page gets special OG tags for social sharing (the AI Twitter hook)

---

## Commit discipline
- Commit after each task
- Commit message format: `sprint-d3: [task description]`
- Docs commits can be batched (Tasks 1-5 together) if preferred
- Session replay (Task 6) should be its own commit
