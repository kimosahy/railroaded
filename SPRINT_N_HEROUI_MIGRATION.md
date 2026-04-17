# SPRINT N — HeroUI v3 Migration

**Lead:** Fekry (CPO)
**Builder:** Atlas → CC
**Status:** SPEC — awaiting CPO approval before build
**Created:** April 17, 2026
**Target:** Weekend of April 18-19, 2026

---

## Goal

Rewrite the Railroaded spectator website from static HTML to Next.js + HeroUI v3. Same features, same data (spectator API), modern component architecture. All UI from HeroUI's component library — zero custom component recreation.

---

## What We Have Now

| Aspect | Current |
|--------|---------|
| Stack | 24 static HTML files, vanilla JS, inline `<style>` per page |
| Framework | None |
| Build step | None — files served directly |
| Components | Hand-written HTML/CSS |
| Theming | CSS custom properties, manually maintained |
| Hosting | Vercel (static) |
| API | `https://api.railroaded.ai` (spectator endpoints, ~30 routes) |
| Icons | Phosphor Icons via CDN |

## What We're Moving To

| Aspect | Target |
|--------|--------|
| Stack | Next.js 15 + React 19 + HeroUI v3.0.3 + Tailwind CSS v4 |
| Framework | Next.js (App Router, SSR/SSG) |
| Build step | `next build` |
| Components | HeroUI compound components exclusively |
| Theming | HeroUI OKLCH tokens, CSS-first theming |
| Hosting | Vercel (Next.js) |
| API | Same — `https://api.railroaded.ai` |
| Icons | Phosphor Icons (kept — HeroUI doesn't ship icons) |
| AI tooling | HeroUI MCP server + Agent Skills for CC |

---

## AI Tooling Setup (Pre-Build)

Before any CC invocation, configure these:

### 1. HeroUI MCP Server

Add to `.mcp.json` in the new `web/` directory:

```json
{
  "mcpServers": {
    "heroui-react": {
      "command": "npx",
      "args": ["-y", "@heroui/react-mcp@latest"]
    }
  }
}
```

CC gets: component search, full props/docs, source code, theme variables, style inspection — all live during builds.

### 2. HeroUI Agent Skills

Install in repo:
```bash
curl -fsSL https://heroui.com/install | bash -s heroui-react
```

Creates `skills/heroui-react/` with SKILL.md + utility scripts:
- `list_components.mjs` — all available components
- `get_component_docs.mjs` — props, examples, usage
- `get_source.mjs` — component source code
- `get_styles.mjs` — CSS for any component
- `get_theme.mjs` — theme tokens and variables
- `get_docs.mjs` — general documentation

CC reads SKILL.md at session start for component patterns and conventions.

---

## Phase 1 — Scaffold (Task 1)

**Branch:** `atlas/heroui-scaffold`
**Deliverable:** Empty Next.js app with HeroUI configured, deployable to Vercel preview

### Task 1.1: Initialize Next.js app

```bash
mkdir web && cd web
npx create-next-app@latest . --ts --tailwind --app --src-dir --eslint
```

### Task 1.2: Install HeroUI v3

```bash
npm install @heroui/react
```

Configure in `src/app/providers.tsx`:
```tsx
import { HeroUIProvider } from "@heroui/react";

export function Providers({ children }: { children: React.ReactNode }) {
  return <HeroUIProvider>{children}</HeroUIProvider>;
}
```

### Task 1.3: Configure Tailwind CSS v4 for HeroUI

Per HeroUI v3 docs — add HeroUI plugin to Tailwind config, configure content paths.

### Task 1.4: Theme tokens

Map our current design language to HeroUI OKLCH tokens:

| Current | Value | HeroUI token target |
|---------|-------|-------------------|
| `--bg-dark` | `#0a0a0f` | `background` |
| `--bg-card` | `#12121a` | `content1` |
| `--gold` | `#c9a84c` | `primary` |
| `--gold-dim` | `#8a7033` | `primary-200` |
| `--gold-light` | `#e8d5a3` | `primary-300` |
| `--text` | `#d4d0c8` | `foreground` |
| `--text-dim` | `#8a8780` | `default-500` |
| `--border` | `#2a2a3a` | `divider` |
| `--red-glow` | `#c0392b` | `danger` |
| `--green-light` | `#4caf50` | `success` |

Fonts: Cinzel (headings), Crimson Text (prose), system sans-serif (UI).

### Task 1.5: MCP + Skills setup

- Add `.mcp.json` with HeroUI MCP server config
- Install HeroUI agent skills via curl
- Verify CC can query components

### Task 1.6: Vercel preview

- Add `vercel.json` in `web/` or configure monorepo build
- Deployable to preview URL without touching current live site

### Verification

- `npm run dev` boots without errors
- HeroUI provider wraps the app
- Theme tokens render dark background with gold accents
- Vercel preview deploys successfully

---

## Phase 2 — Layout Shell (Task 2)

**Branch:** `atlas/heroui-layout`
**Deliverable:** Shared nav + footer + page shell matching current site structure

### Task 2.1: Navigation bar

Use HeroUI `Navbar` component:
- Logo (SVG, `logo.svg`)
- Links: Home, Theater, Benchmark, Leaderboard, Tracker, About
- Dropdowns: Explore (Bestiary, Characters, Journals, Worlds), Build (Docs, Agent, Dashboard, Register, Login)
- Responsive hamburger menu
- Fixed position, dark background, gold accents

### Task 2.2: Footer

Use HeroUI `Footer` or custom layout:
- Social links (X @poormetheus, Discord, GitHub) with Phosphor icons
- "Built by Karim Elsahy & Poormetheus"
- MIT license note

### Task 2.3: Root layout

`src/app/layout.tsx`:
- HeroUIProvider
- Navbar
- `{children}` (page content)
- Footer
- Google Fonts: Cinzel, Crimson Text

### Task 2.4: API client utility

`src/lib/api.ts`:
```ts
const API_BASE = "https://api.railroaded.ai";

export async function fetchSpectator<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
```

### Verification

- Nav renders all links with correct routing
- Hamburger works on mobile
- Footer shows on all pages
- Dark theme with gold accents matches current site feel

---

## Phase 3 — Page Migration (Tasks 3-12)

**One branch per page. One PR per page. Independently deployable.**

Each page follows the same pattern:
1. Create `src/app/[page]/page.tsx`
2. Fetch from spectator API (server component or client with SWR)
3. Build with HeroUI components — map old HTML to HeroUI equivalents
4. Match current features exactly (filters, live updates, detail views)

### HeroUI Component Mapping

| Current HTML | HeroUI v3 Component |
|-------------|-------------------|
| Cards (party, session, character) | `Card`, `Card.Header`, `Card.Body`, `Card.Footer` |
| Dropdowns/selects (filters) | `Select`, `SelectItem` |
| Buttons | `Button` |
| Nav bar | `Navbar`, `NavbarBrand`, `NavbarContent`, `NavbarItem` |
| Tables (leaderboard) | `Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell` |
| Badges (model identity, status) | `Badge`, `Chip` |
| Skeleton loading | `Skeleton` |
| Modals/detail panels | `Modal` or `Drawer` |
| Tabs (leaderboard categories) | `Tabs`, `Tab` |
| Tooltips | `Tooltip` |
| Avatars (characters, narrator) | `Avatar` |
| Progress bars (XP, HP) | `ProgressBar` |
| Pagination | `Pagination` |
| Input fields (login, register) | `TextField`, `Input` |
| Accordion/expandable | `Accordion`, `AccordionItem` |
| Links | `Link` |
| Dividers | `Separator` |

---

### Task 3: Tracker Page (`/tracker`)

**Priority: P0 — most complex page, validates the architecture**

3-column layout:
- Col1: Party list sidebar (sticky, scrollable)
- Col2: Session detail feed (main content)
- Col3: Narrator panel (sticky)

Components:
- `Card` for party cards + session cards
- `Badge` for live/completed status
- `Chip` for model identity
- `Skeleton` for loading states
- `Select` for status/party filters
- `Avatar` for characters in party detail
- Auto-refresh via `setInterval` + client component

Data: `GET /spectator/parties`, `GET /spectator/sessions`, `GET /spectator/narrations`

### Task 4: Leaderboard Page (`/leaderboard`)

- `Tabs` for categories (Top Characters, Most Dungeons, Best DMs, Longest Parties, Achievements)
- `Table` for rankings
- `Avatar` + `Chip` for character/model display
- `Badge` for podium ranks
- Search/expand functionality

Data: `GET /spectator/leaderboard`

### Task 5: Journals Page (`/journals`)

- Session list with expand/collapse (`Accordion`)
- Event feed rendering (combat, narration, dialogue, loot)
- Character filter (`Select`)
- Session filter
- RSS link

Data: `GET /spectator/journals`, `GET /spectator/sessions`

### Task 6: Session Detail Page (`/session/[id]`)

- Session replay feed
- Reaction buttons
- Sidebar with session info
- Event type icons (Phosphor)
- Playbill / DM vision panel
- Narration sidebar

Data: `GET /spectator/sessions/:id`, `GET /spectator/sessions/:id/events`

### Task 7: Home Page (`/`)

- Hero section with logo + tagline
- "Latest from the Dungeons" narration feed
- Feature cards (Why Railroaded)
- Stats (sessions, characters, events)
- Waitlist signup form
- "How it works" section

Data: `GET /spectator/stats`, `GET /spectator/narrations`, `GET /spectator/activity`

### Task 8: Characters Page (`/characters`) + Character Detail (`/character/[id]`)

- Character roster grid
- `Card` per character with avatar, class, level, model badge
- Detail view: full sheet, equipment, journal, adventure log

Data: `GET /spectator/characters`, `GET /spectator/characters/:id`

### Task 9: Bestiary Page (`/bestiary`)

- Monster grid with avatars
- Expand for stat blocks
- "Undiscovered" section (collapsed)

Data: `GET /spectator/bestiary`

### Task 10: Theater Page (`/theater`)

- "Now Playing" hero
- Schedule
- Best-of gallery
- Featured production

Data: `GET /spectator/featured`, `GET /spectator/sessions`

### Task 11: About Page (`/about`)

- Team section with photos
- Philosophy ("The Three Pillars")
- Tech stack
- Cost transparency
- Mostly static content

### Task 12: Remaining Pages

- Benchmark (`/benchmark`) — model comparison charts + tables
- Worlds (`/worlds`) — dungeon templates
- Docs (`/docs`) — documentation links
- Open Source (`/open-source`) — open dungeon page
- Auth pages (`/login`, `/register`, `/dashboard`) — forms + API key management
- Legal (`/terms`, `/privacy`) — static content
- 404 — custom error page

---

## Phase 4 — Cutover (Task 13)

**Branch:** `atlas/heroui-cutover`

### Task 13.1: Final QA pass

- All pages render correctly
- All spectator API calls work
- Responsive on mobile (360px, 768px, 1024px, 1440px)
- Dark theme consistent
- Lighthouse performance check

### Task 13.2: Vercel config swap

- Point `railroaded.ai` to the new Next.js app
- Keep old `website/` directory as reference (or delete)

### Task 13.3: Update docs

- Update CLAUDE.md with new frontend architecture
- Update DESIGN.md with HeroUI component conventions
- Update README.md quick start

---

## Build Order

```
Task 1  → Scaffold (blocks everything)
Task 2  → Layout shell (blocks all pages)
Task 3  → Tracker (validates architecture)
Task 4  → Leaderboard
Task 5  → Journals
Task 6  → Session detail
Task 7  → Home
Task 8  → Characters
Task 9  → Bestiary
Task 10 → Theater
Task 11 → About
Task 12 → Remaining pages
Task 13 → Cutover
```

Tasks 3-12 can parallelize after Task 2 ships — but sequencing lets us learn from each page and avoid repeating mistakes.

---

## Constraints

1. **Zero feature regression.** Every feature on the current site must exist in the new one.
2. **Same API.** No backend changes. The spectator API is stable.
3. **HeroUI components only.** No custom card/button/table implementations. If HeroUI has it, use it.
4. **Phosphor Icons stay.** HeroUI doesn't ship icons. Keep Phosphor.
5. **DESIGN.md governs theming.** CPO approval for any theme token changes.
6. **One PR per task.** Always a new branch off main.
7. **CC uses HeroUI MCP + Skills.** Every CC invocation must have access to the MCP server for component lookups.

---

## CoS Prime Dependencies

Before build starts, we need on the VPS:
- `bun` (or `node 22+` — Next.js needs it for local dev/preview)
- `unzip` (bun prerequisite)

Already requested in OUTBOX_FOR_COS_PRIME.md as ATLAS-REQ-001 items 4-5.

---

## Acceptance Criteria

Sprint N passes when:
1. `railroaded.ai` serves the Next.js + HeroUI app
2. All 24 current pages have equivalents
3. Zero visual regression on core pages (tracker, leaderboard, home)
4. HeroUI MCP server configured and functional for future CC builds
5. DESIGN.md updated with HeroUI component conventions
