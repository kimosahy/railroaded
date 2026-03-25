# Sprint H — Closing the Backend-Frontend Delta (CC Task File)

> **BEFORE YOU START:** Read `CLAUDE.md` (game design spec), `docs/cc-patterns.md`, and `docs/known-issues.md`. Tests use `test-runner.sh` (30s hard kill — no local Postgres, DB pool retries forever without it).

## QA Review Notes (Poormetheus + Mercury, March 25)

Changes from Prime's original doc after Poormetheus review + Mercury co-review:

1. **Reordered priorities:** Task 4 (model auto-detect) moved to #2 — it's the strategic unlock for badges + benchmark. Task 7 (tracker in nav) moved to #5 — best page, worst discoverability.
2. **New Task 14:** DM metadata surfacing on session detail page. Tone, style, setting, worldDescription already in the API — just invisible on frontend. Core marketing hook.
3. **Task 6 expanded:** Social links now include X (@poormetheus) alongside Discord + GitHub.
4. **Task 13 expanded:** Mobile responsiveness pass added for Theater, Characters, and Docs pages (all broken at 390px).
5. **Verification checklist updated** with new items.

Prime's four corrections to our spec are acknowledged and accepted — all valid.

---

## Code Review Notes (Prime ≠ Poormetheus's Spec)

Poormetheus and Mercury filed 15+ items. Code review found some claims are wrong:

| Spec Claim | Code Reality | Impact |
|-----------|-------------|--------|
| Mercury: "Model identity NOT IN API" | **WRONG.** `spectator.ts` already joins `usersTable.modelProvider/modelName` on characters, leaderboard, sessions. `getModelIdentity()` in `auth.ts` works. | The problem is DATA — 134 chars in prod have 0 model data because most users have null `modelProvider`/`modelName` in the DB |
| P: "Model badges missing from characters, leaderboard, tracker" | **PARTIALLY WRONG.** `modelBadge()` exists in `leaderboard.html:475`, `tracker.html:838`. `characters.html:254` reads `c.model.name`. `theater.html:358` has `modelBadgePill()`. | Rendering code is largely there. Some pages may not show it because API returns no model data for DB-only characters |
| P: "Social links broken" | Footer on every page has X links to @Karim_Elsahy and @poormetheus. They work. | Missing: GitHub link, Discord link in footer. Not "broken" — incomplete |
| P: "The TBA on theater" | Cannot find "TBA" string anywhere in codebase. Countdown JS (`theater.html:504`) shows "Next show in: Xh Ym". | May be a transient runtime issue. Task 8 addresses the schedule section regardless |

---

## Task 1: Make `avatar_url` Optional + Server-Side Fallback (P0)

**Problem:** `src/game/game-manager.ts:531-533` requires `avatar_url` on character creation. Agents without image generation can't create characters.

**Files:** `src/game/game-manager.ts`

### 1a. Remove the hard requirement

In `handleCreateCharacter` (~line 530), replace the `avatar_url` required block with:

```typescript
// Validate avatar URL if provided; generate fallback if not
let finalAvatarUrl = params.avatar_url ?? null;
if (params.avatar_url) {
  const avatarCheck = await validateAvatarUrl(params.avatar_url);
  if (!avatarCheck.valid) {
    return { success: false, error: avatarCheck.error };
  }
  finalAvatarUrl = params.avatar_url;
} else {
  finalAvatarUrl = generateDefaultAvatar(params.name, params.class, params.race);
}
```

Then use `finalAvatarUrl` instead of `params.avatar_url` when building the character sheet.

### 1b. Add `generateDefaultAvatar()` function

Add above `handleCreateCharacter` — generates a deterministic SVG data URI from name + class. Runs on server, costs nothing, never expires:

```typescript
function generateDefaultAvatar(name: string, charClass: string, race: string): string {
  const classColors: Record<string, { bg: string; accent: string }> = {
    fighter:  { bg: "#8B0000", accent: "#FFD700" },
    wizard:   { bg: "#191970", accent: "#9370DB" },
    rogue:    { bg: "#2F4F4F", accent: "#98FB98" },
    cleric:   { bg: "#DAA520", accent: "#FFFACD" },
    ranger:   { bg: "#228B22", accent: "#90EE90" },
    paladin:  { bg: "#4169E1", accent: "#FFD700" },
    barbarian:{ bg: "#8B4513", accent: "#FF6347" },
    bard:     { bg: "#800080", accent: "#FF69B4" },
    druid:    { bg: "#006400", accent: "#7CFC00" },
    monk:     { bg: "#CD853F", accent: "#FFDEAD" },
    sorcerer: { bg: "#4B0082", accent: "#FF4500" },
    warlock:  { bg: "#301934", accent: "#00FF7F" },
  };
  const colors = classColors[charClass.toLowerCase()] ?? { bg: "#333", accent: "#CCC" };
  const initials = name.split(" ").map(w => w[0]?.toUpperCase() ?? "").join("").slice(0, 2);
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash + name.charCodeAt(i)) | 0;
  const rotation = (Math.abs(hash) % 60) - 30;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
    <rect width="200" height="200" fill="${colors.bg}"/>
    <rect x="20" y="20" width="160" height="160" rx="12" fill="none" stroke="${colors.accent}" stroke-width="2" opacity="0.4" transform="rotate(${rotation} 100 100)"/>
    <text x="100" y="115" text-anchor="middle" font-family="serif" font-size="72" font-weight="bold" fill="${colors.accent}">${initials}</text>
    <text x="100" y="175" text-anchor="middle" font-family="sans-serif" font-size="14" fill="${colors.accent}" opacity="0.6">${charClass}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}
```

### 1c. Backfill existing characters with null/DiceBear avatars

Add a one-time startup backfill: for any character in DB with null `avatarUrl` or a DiceBear URL, generate a default avatar and persist it. Run on server startup (fire-and-forget):

```typescript
const nullAvatarChars = await db.select({ id: charactersTable.id, name: charactersTable.name, class: charactersTable.class, race: charactersTable.race, avatarUrl: charactersTable.avatarUrl })
  .from(charactersTable)
  .where(or(isNull(charactersTable.avatarUrl), like(charactersTable.avatarUrl, '%dicebear%')));
for (const ch of nullAvatarChars) {
  const fallback = generateDefaultAvatar(ch.name, ch.class, ch.race ?? "human");
  await db.update(charactersTable).set({ avatarUrl: fallback }).where(eq(charactersTable.id, ch.id));
}
```

**Test:** `POST /api/v1/character` without `avatar_url` → succeeds → response has non-null avatarUrl. `GET /spectator/characters` → all characters have avatarUrl.

---

## Task 2: Add `outcome` Column + Persist on Session End (P1)

**Problem:** No `outcome` column in `game_sessions` table. `handleEndSession` sets `isActive: false, summary` but no outcome. Schema has no "completed" phase either.

**Files:** `src/db/schema.ts`, `src/game/game-manager.ts`, `src/api/spectator.ts`, new migration

### 2a. Schema change

In `src/db/schema.ts`, add enum after the existing `sessionPhaseEnum`:

```typescript
export const sessionOutcomeEnum = pgEnum("session_outcome", [
  "victory",
  "tpk",
  "retreat",
  "abandoned",
]);
```

In `gameSessions` table, add after `summary`:

```typescript
outcome: sessionOutcomeEnum("outcome"),
```

### 2b. Create migration

New file in `drizzle/` (next number in sequence):

```sql
CREATE TYPE "session_outcome" AS ENUM ('victory', 'tpk', 'retreat', 'abandoned');
ALTER TABLE "game_sessions" ADD COLUMN "outcome" "session_outcome";
```

**CRITICAL:** Drizzle runner records migration as applied even on partial failure. Always create a NEW numbered migration — never edit an existing one.

### 2c. Accept outcome in `handleEndSession`

In `src/game/game-manager.ts` (~line 3941), update the function signature and body:

- Add `outcome?: string` to params type
- Validate: `const validOutcomes = ["victory", "tpk", "retreat", "abandoned"]; const validOutcome = validOutcomes.includes(params.outcome ?? "") ? params.outcome : null;`
- In the DB update (~line 3977), change `.set({ isActive: false, endedAt: new Date(), summary: cleanSummary })` to `.set({ isActive: false, endedAt: new Date(), summary: cleanSummary, outcome: validOutcome ?? null })`
- Include outcome in the `logEvent` call: `logEvent(party, "session_end", null, { summary: cleanSummary, outcome: validOutcome })`

### 2d. Expose outcome in spectator API

In `src/api/spectator.ts`:

**Sessions list** (~line 1012): Add `outcome: gameSessionsTable.outcome` to the select. Add `outcome: r.outcome ?? null` to the response map.

**Session detail** (~line 1056): Same — add outcome to select and response.

### 2e. Update DM skill doc

In `skills/dm-skill.md`, update `end-session` docs:

```
POST /dm/end-session
Body: { summary: "...", outcome: "victory" | "tpk" | "retreat" | "abandoned" }
The outcome field is optional but strongly recommended for accurate session history.
```

**Test:** End session with `outcome: "victory"` → `GET /spectator/sessions` shows `outcome: "victory"`.

---

## Task 3: Fix Character Creation Response (P1)

**Problem:** `POST /api/v1/character` may return null fields despite successful creation.

**Files:** `src/api/rest.ts`

### Fix

In `src/api/rest.ts` (~line 88), replace the raw character return with an explicit response shape:

```typescript
const result = await gm.handleCreateCharacter(c.get("user").userId, body);
if (!result.success) return c.json({ error: result.error, code: "BAD_REQUEST" }, 400);
const ch = result.character!;
return c.json({
  character: {
    id: ch.id,
    name: ch.name,
    class: ch.class,
    race: ch.race,
    level: ch.level,
    hpCurrent: ch.hpCurrent,
    hpMax: ch.hpMax,
    ac: ch.ac,
    avatarUrl: ch.avatarUrl,
    description: ch.description,
    abilityScores: ch.abilityScores,
    inventory: ch.inventory,
    equipment: ch.equipment,
    features: ch.features,
    proficiencies: ch.proficiencies,
  }
}, 201);
```

This prevents serialization surprises from internal fields like `dbCharId` (set async, null at response time).

**Test:** `POST /api/v1/character` → response has non-null `id`, `name`, `class`, `race`, `hpCurrent`, `hpMax`, `ac`.

---

## Task 4: Model Identity Auto-Detect (THE KEY TASK)

**Problem:** 134 characters, 0 with model data. The API code and frontend rendering already exist. The gap is that users register without providing model info, and nothing auto-detects it.

**Files:** `src/api/auth.ts`, `skills/player-skill.md`, `skills/dm-skill.md`

### 4a. Auto-detect model on login via User-Agent

In `src/api/auth.ts`, after successful login, sniff the User-Agent or a custom `X-Model-Identity` header:

```typescript
// After successful login, auto-detect model identity
const modelHeader = c.req.header("x-model-identity") ?? "";
const userAgent = c.req.header("user-agent") ?? "";

if (modelHeader) {
  const [provider, ...nameParts] = modelHeader.split("/");
  const name = nameParts.join("/") || modelHeader;
  autoSetModelIdentity(user, provider, name);
} else {
  const detected = detectModelFromUA(userAgent);
  if (detected) autoSetModelIdentity(user, detected.provider, detected.name);
}
```

Add helper function:

```typescript
function detectModelFromUA(ua: string): { provider: string; name: string } | null {
  const lower = ua.toLowerCase();
  if (lower.includes("claude")) return { provider: "anthropic", name: "claude" };
  if (lower.includes("gpt-4")) return { provider: "openai", name: "gpt-4" };
  if (lower.includes("gemini")) return { provider: "google", name: "gemini" };
  if (lower.includes("mistral")) return { provider: "mistral", name: "mistral" };
  if (lower.includes("llama")) return { provider: "meta", name: "llama" };
  return null;
}
```

The existing `autoSetModelIdentity` function (line ~247) already handles persistence.

### 4b. Document `X-Model-Identity` header

In `skills/player-skill.md` and `skills/dm-skill.md`, add a section:

```markdown
### Model Identity (Recommended)
Set the `X-Model-Identity` header on login to identify your AI model:
  X-Model-Identity: anthropic/claude-3.5-sonnet
Format: `provider/model-name`. Enables model comparison on leaderboard and benchmark.
```

### 4c. Verify model badges render on `/characters` page

In `website/characters.html` at line 254, `c.model.name` is read but verify the badge HTML is rendered in the character grid card. If missing, add a model pill after the character name using the same pattern as `leaderboard.html:475`:

```javascript
function modelBadgeHtml(c) {
  if (!c.model || !c.model.name) return '';
  const name = c.model.name;
  const colors = { anthropic: '#D97706', openai: '#10B981', google: '#3B82F6', meta: '#8B5CF6', mistral: '#F59E0B' };
  const color = colors[c.model.provider] || '#888';
  return ' <span style="font-size:0.65rem;padding:1px 5px;border-radius:3px;background:'+color+'22;color:'+color+';border:1px solid '+color+'44">'+name+'</span>';
}
```

Render next to character name in the grid card HTML.

**Test:** After deploying with model data populated, `/characters` grid shows model pills next to names.

---

## Task 5: Session Outcome Badges on Frontend

**Depends on:** Task 2

**Files:** `website/theater.html`, `website/tracker.html`

Add outcome badge rendering to session cards:

```javascript
function outcomeBadge(outcome) {
  if (!outcome) return '';
  const map = { victory: '⚔️ Victory', tpk: '💀 TPK', retreat: '🏃 Retreat', abandoned: '⏸ Abandoned' };
  const colors = { victory: '#FFD700', tpk: '#FF4444', retreat: '#88AAFF', abandoned: '#888' };
  return '<span style="font-size:0.7rem;padding:2px 6px;border-radius:3px;background:'+(colors[outcome]||'#888')+'22;color:'+(colors[outcome]||'#888')+'">'+(map[outcome]||outcome)+'</span>';
}
```

Render on each session card in theater's "Recent Sessions" and tracker's session feed where `session.outcome` is available.

---

## Task 6: Social Links in Footer (All Pages)

**Files:** ALL `.html` files in `website/` with a `<footer>`

Add a social links row to every page footer, above the "Created by" line:

```html
<p style="margin-bottom: 0.5rem;">
  <a href="https://x.com/poormetheus" target="_blank">𝕏 @poormetheus</a> &middot;
  <a href="https://discord.gg/railroaded" target="_blank">Discord</a> &middot;
  <a href="https://github.com/kimosahy/railroaded" target="_blank">GitHub</a>
</p>
```

The existing X links for Karim and Poormetheus in the "Created by" line stay. This adds a prominent social row above with all three community links.

Apply to ALL pages: `index.html`, `theater.html`, `characters.html`, `leaderboard.html`, `tracker.html`, `benchmark.html`, `docs.html`, `about.html`, `journals.html`, `bestiary.html`, `worlds.html`, `dungeons.html`, `character.html`, `session.html`, `tavern.html`, `open-source.html`, `player.html`, `agent.html`.

---

## Task 7: Promote Tracker to Top-Level Nav

**Files:** ALL `.html` files with the nav bar

Move `/tracker` from the Explore dropdown to primary nav, between Leaderboard and About:

```html
<a href="/leaderboard">Leaderboard</a>
<a href="/tracker">Tracker</a>
<a href="/about">About</a>
```

Remove "Tracker" from the Explore dropdown (keep Characters, Journals, Bestiary, Worlds).

Apply to ALL pages with the nav bar.

---

## Task 8: Theater Page — Replace Placeholder Schedule

**Files:** `website/theater.html`

Replace the hardcoded schedule grid (3 cards: 08:00, 15:00, 22:00 UTC) and countdown JS with:

```html
<div id="coming-up-section">
  <h2 class="section-title">The Show Goes On</h2>
  <p style="color:var(--text-dim)">AI parties venture into dungeons around the clock. Check back for live sessions or browse the archives below.</p>
</div>
```

Remove the `.schedule-grid` div, `.schedule-card` elements, and countdown JavaScript (`document.getElementById('countdown')...`). Keep the "Now Showing" live session section untouched.

---

## Task 9: Leaderboard Text Contrast Fix

**Files:** `website/leaderboard.html`

Find the table row text styling and bump contrast. Target the character name cells:

```css
.lb-row .lb-cell { color: #F5E6C8; }
.lb-row a { color: #F5E6C8; }
```

Also check the expanded detail panel — ensure text is readable against the row background. If `--text-bright` CSS var exists, use it. If not, define it in `:root` as `#F5E6C8`.

---

## Task 10: Benchmark Page — Layout + Preview Data

**Files:** `website/benchmark.html`

### 10a. Center content

Page content is left-aligned using ~25% viewport. Fix:

```css
main, .benchmark-content, .container {
  max-width: 900px;
  margin: 0 auto;
  padding: 0 2rem;
}
```

### 10b. Show model participation

Add a "Models in the Arena" section showing which models have played and session counts. Fetch `/spectator/characters`, group by `model.provider`, count unique characters and sessions per model:

```javascript
const resp = await fetch(API + '/spectator/characters');
const chars = (await resp.json()).characters || [];
const models = {};
chars.forEach(c => {
  if (c.model && c.model.provider) {
    const key = c.model.provider;
    if (!models[key]) models[key] = { provider: key, name: c.model.name, chars: 0, sessions: 0 };
    models[key].chars++;
    models[key].sessions += c.sessionsPlayed || 0;
  }
});
```

Render as a simple table even before the 100-session benchmark unlocks.

---

## Task 11: Narrations as Session Card Fallback

**Files:** `website/theater.html`

When rendering session cards, if `session.summary` is null or a placeholder ("Automated session", "Unchronicled"), fetch narrations and use as fallback:

```javascript
// After fetching sessions, also fetch narrations
const narrResp = await fetch(API + '/spectator/narrations?limit=30');
const narrations = (await narrResp.json()).narrations || [];
const narrBySession = {};
narrations.forEach(n => { if (!narrBySession[n.sessionId]) narrBySession[n.sessionId] = n.content; });

// In card rendering — use narration if no real summary
const isPlaceholder = !s.summary || s.summary.includes('Automated') || s.summary.includes('Unchronicled') || s.summary.includes('awaits');
const description = isPlaceholder ? (narrBySession[s.id] || 'An adventure awaits its chronicler...') : s.summary;
```

Truncate narration text to ~150 chars with ellipsis for card display.

---

## Task 12: Template/Placeholder Copy Cleanup

**Files:** Various frontend files

### 12a. Fix possessive apostrophe
Search all HTML/JS for party names with double possessive (`'s` after trailing s). Fix programmatically:

```javascript
// When rendering party names with possessive
function possessive(name) {
  return name.endsWith('s') ? name + "'" : name + "'s";
}
```

### 12b. Character bio fallback
In `website/character.html`, if description is exactly "A living legend of the realm" or empty, show a class-based fallback instead of the generic text.

### 12c. "Unchronicled" sessions
Handled by Task 11 (narration fallback). If no narration either, generate: `"${partyName} ventured forth (${eventCount} events)"`.

---

## Task 13: Docs Page Updates + Mobile Responsiveness

**Files:** `website/docs.html`

### 13a. Add new endpoints
Document Sprint G endpoints:
- `POST /dm/unlock-exit` — `{ target_room_id }` — Unlocks a locked door
- `POST /dm/monster-action` — `{ monster_id, action }` — Non-attack actions: dodge, dash, disengage, flee, hold

### 13b. Document X-Model-Identity header
Add to Authentication section.

### 13c. Add error codes section
```
{ "error": "message", "code": "BAD_REQUEST" | "UNAUTHORIZED" | "NOT_FOUND" | "FORBIDDEN" }
```

### 13d. Fix mobile responsiveness (Docs)
Code blocks: `min-font-size: 12px`, `overflow-x: auto`, `max-width: 100%`.
Tables: wrap in scrollable container or switch to card layout on viewports < 768px.

### 13e. Mobile responsiveness pass (Theater, Characters, Docs)

These three pages are severely broken at 390px (mobile viewport). Since social/X traffic is predominantly mobile, this is not optional.

**Theater (`theater.html`):** Content overflows horizontally. Cards stack but text/buttons clip. Fix: ensure all sections use `max-width: 100%; overflow-x: hidden;` and cards use `flex-wrap: wrap`.

**Characters (`characters.html`):** Character grid doesn't reflow to single column. Fix: grid should go to `grid-template-columns: 1fr` below 640px.

**Docs (`docs.html`):** Code blocks overflow, tables break layout. Covered in 13d above.

General rule for all three: test at 390px width. No horizontal scroll. No clipped text. No overlapping elements.

---

## Task 14: DM Metadata on Session Detail Page

**Problem:** The session detail API already returns DM metadata — tone, style, setting, worldDescription — but none of it is visible on the frontend. This is some of the best content on the site ("every AI DM builds a different world" is a core marketing hook) and it's sitting invisible in API responses.

**Files:** `website/session.html`

### 14a. Fetch and display DM metadata

On the session detail page, after loading session data, check if DM metadata exists in the response. If present, render a metadata card below the session content:

```html
<div id="dm-world" style="margin-top:1.5rem;padding:1rem;border:1px solid var(--border);border-radius:8px;background:var(--bg-card);">
  <h3 style="margin:0 0 0.75rem;font-size:0.9rem;color:var(--text-dim);">🎭 The Dungeon Master's World</h3>
  <div id="dm-meta-content"></div>
</div>
```

```javascript
// After fetching session detail
const dm = sessionData.dm || sessionData.dungeonMaster || {};
const metaEl = document.getElementById('dm-meta-content');
if (dm.worldDescription || dm.tone || dm.style || dm.setting) {
  let html = '';
  if (dm.worldDescription) html += '<p style="margin:0 0 0.5rem;color:var(--text-bright);">' + dm.worldDescription + '</p>';
  const tags = [dm.tone, dm.style, dm.setting].filter(Boolean);
  if (tags.length) {
    html += '<div style="display:flex;gap:0.5rem;flex-wrap:wrap;">';
    tags.forEach(t => {
      html += '<span style="font-size:0.75rem;padding:2px 8px;border-radius:12px;background:var(--accent-dim);color:var(--accent);">' + t + '</span>';
    });
    html += '</div>';
  }
  metaEl.innerHTML = html;
} else {
  document.getElementById('dm-world').style.display = 'none';
}
```

**Test:** Open a session detail page for a session with DM metadata → world description and tone/style/setting tags visible. Sessions without DM metadata → card hidden.

---

## Priority Order

Run in this order (dependencies noted):

1. **Task 1** — Avatar fallback (P0, unblocks character creation)
2. **Task 4** — Model identity auto-detect (P0 strategic — unlocks badges + benchmark)
3. **Task 2** — Outcome column + persistence (P1, schema migration)
4. **Task 3** — Character creation response fix (P1)
5. **Task 7** — Tracker in primary nav (quick HTML, outsized discoverability impact)
6. **Task 9** — Leaderboard contrast (quick CSS)
7. **Task 6** — Social links footer (quick HTML across pages — now includes X + Discord + GitHub)
8. **Task 8** — Theater schedule cleanup
9. **Task 5** — Outcome badges on frontend (depends on Task 2)
10. **Task 14** — DM metadata on session detail page
11. **Task 10** — Benchmark layout + preview data
12. **Task 11** — Narrations on session cards
13. **Task 12** — Template copy cleanup
14. **Task 13** — Docs updates + mobile responsiveness (Theater, Characters, Docs)

---

## Verification Checklist

- [ ] `POST /api/v1/character` without `avatar_url` succeeds, returns non-null avatarUrl
- [ ] `POST /api/v1/character` returns non-null id, name, class, race, hp, ac
- [ ] `POST /dm/end-session` with `outcome: "victory"` persists correctly
- [ ] Login with `X-Model-Identity` header populates model data
- [ ] `/characters` page shows model badges where data exists
- [ ] `/leaderboard` table text is readable (contrast fix)
- [ ] `/tracker` is in top-level nav on all pages
- [ ] Footer on all pages has X + Discord + GitHub links
- [ ] `/theater` has no fake schedule grid
- [ ] `/benchmark` content is centered, shows model participation
- [ ] `/docs` includes unlock-exit, monster-action, error codes
- [ ] Session detail page shows DM world/tone/style metadata when available
- [ ] Session cards use narration text when summary is placeholder
- [ ] No "A living legend of the realm" generic bios
- [ ] Mobile: docs code blocks readable at 390px
- [ ] Mobile: theater and characters pages usable at 390px (no horizontal scroll)
