# CLAUDE.md — Project Agent Instructions

## Project overview

Railroaded is an autonomous AI D&D platform where AI agents play Dungeons & Dragons with no humans in the loop during gameplay. AI players + AI Dungeon Master, server handles all rules and dice. Humans design the agents, deploy them, and watch what happens.

This repo contains both the **backend** (game server) and the **frontend** (spectator website). You work in `web/` — the frontend.

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · HeroUI v3.0.3 (component library) · Tailwind CSS v4 · Vercel deployment

**Monorepo layout:**
- `web/` — Next.js frontend (**this is where you work**)
- `src/` — Backend game server (Bun + Hono + PostgreSQL). Do NOT modify.
- `website/` — Legacy static HTML site (deprecated, being replaced by `web/`)
- `data/` — YAML game content (monsters, items, spells, dungeon templates)
- `tests/` — Backend test suite (70 files, ~14,500 lines). Not your concern.
- `DESIGN.md` — CPO-controlled design system. Read before any UI work. Do NOT modify without CPO approval.

**Backend API:** `https://api.railroaded.ai` — the spectator API is public (no auth). ~30 endpoints under `/spectator/*`. The frontend consumes this API — you do NOT modify backend code.

## Key directories

```
web/
├── src/
│   ├── app/              # Next.js App Router pages
│   │   ├── layout.tsx    # Root layout (providers, navbar, footer, fonts)
│   │   ├── providers.tsx # HeroUI RouterProvider + Toast.Provider
│   │   ├── globals.css   # OKLCH theme tokens, typography, overrides
│   │   ├── not-found.tsx # 404 page (in-voice narrator copy — reference pattern)
│   │   ├── error.tsx     # 500 page (create if missing)
│   │   ├── page.tsx      # Home (server component, delegates to home-client.tsx)
│   │   ├── home-client.tsx # Home client components (9 named exports)
│   │   ├── tracker/      # Live party tracker (3-column layout)
│   │   ├── leaderboard/  # Podium + table rankings
│   │   ├── journals/     # Session journal viewer
│   │   ├── characters/   # Character browser
│   │   ├── benchmark/    # AI model comparison — core product pillar, stays top-nav
│   │   ├── bestiary/     # Creature catalog
│   │   ├── worlds/       # World browser
│   │   ├── theater/      # Featured sessions, now playing
│   │   ├── session/[id]/ # Session detail with event timeline
│   │   ├── character/[id]/ # Character detail
│   │   ├── agent/[name]/ # Agent profile
│   │   ├── player/[username]/ # Player profile
│   │   └── ... (about, docs, terms, privacy, login, register, dashboard, open-source, tavern)
│   ├── components/
│   │   ├── navbar.tsx     # Top navigation (5 items + Explore dropdown + Play CTA)
│   │   ├── footer.tsx     # 4-column footer (Watch/Explore/Build/Company)
│   │   └── tracker/       # Tracker sub-components (event-feed, party-list, session-list, narrator-panel)
│   └── lib/
│       └── api.ts         # API_BASE constant + fetchSpectator<T>() typed wrapper
├── public/               # Static assets (logo.svg, favicons)
├── next.config.ts
├── postcss.config.mjs
├── package.json
└── tsconfig.json
```

## Architecture pattern

Pages follow the Next.js App Router recommended pattern:
- `page.tsx` — **server component** (exports metadata, wraps client component in Suspense)
- `xxx-client.tsx` — **client component** (`"use client"`, handles data fetching via useEffect, renders interactive UI)

Exceptions: Benchmark, Login, Register have `"use client"` directly on page.tsx. About, Terms, Privacy, Docs, Open Source are server components with no client counterpart (static content).

## Design system standards

Read `DESIGN.md` at repo root before any UI work. CPO-controlled — do not modify.

- **MF-STD-001 (Cinzel headings):** All H1-H4, navbar brand, footer sign-off render in Cinzel. Applied globally via `globals.css`: `h1, h2, h3, h4 { font-family: var(--font-heading) }`. No exceptions.
- **MF-STD-002 (Crimson prose):** Narrative prose (narrations, journals, session feeds, DM vision) uses Crimson Text via `.prose-narrative` class. UI chrome stays system sans (Geist).
- **MF-STD-003 (In-voice errors):** All error/empty states on narrative pages use authored Mercury copy. No "Oops!" or generic messages. See `not-found.tsx` as reference.
- **MF-STD-004 (Dark only):** Dark mode only. No light toggle. `<html className="dark">`. HeroUI dark theme tokens.
- **MF-STD-005 (Authored explicit):** Authored surfaces are named in the sprint thesis. Everything else defaults to stock HeroUI.

**Gold accent:** Primary brand color `#c9a84c`. OKLCH token `--accent: oklch(0.73 0.13 85)` in globals.css. Full 100-900 ramp pending generation (see active MFB).

**Icons:** Phosphor Icons only. Regular weight (`ph`) for UI, Duotone (`ph-duotone`) for emphasis. No other weights. See DESIGN.md for rules.

**Benchmark is a top-nav item.** Do NOT move it to a dropdown or sub-menu regardless of what other docs say. This is an active override (MFD-006).

## API reference (spectator endpoints used by frontend)

Base URL: `https://api.railroaded.ai`

Key endpoints the frontend consumes:
- `GET /spectator/parties` — live parties with members, phase, current room
- `GET /spectator/parties/:id` — detailed party view with recent events
- `GET /spectator/sessions` — session list
- `GET /spectator/sessions/:id` — session detail with events
- `GET /spectator/narrations` — narrator prose feed
- `GET /spectator/characters` — character roster
- `GET /spectator/characters/:id` — character detail
- `GET /spectator/bestiary` — monster catalog
- `GET /spectator/leaderboard` — rankings (top chars, most dungeons, best DMs, etc.)
- `GET /spectator/journals` — returns `{journals: [{partyId, partyName, memberNames, summary, eventCount}]}` — NOTE: top-level key is `journals`, no `events` array, no `sessionId`
- `GET /spectator/stats` — aggregate stats (total sessions, characters, events)
- `GET /spectator/activity` — recent activity feed
- `GET /spectator/featured` — featured sessions
- `GET /spectator/benchmark` — AI model benchmark data
- `POST /spectator/waitlist/signup` — waitlist signup

**Critical:** The API shape is the source of truth. If the frontend expects a field the API does not return, fix the frontend. Do not invent API fields.

## Code standards

### Commits
- One logical change per commit
- Commit message format: `Atlas build (Ram): [concise description]` (e.g., `REQ-8 Reorder Theater sections`). Per AGENTS.md.
- No multi-task commits. No generic "fix" or "batch" messages.

### Components
- HeroUI v3 compound components are the default (Card, Card.Content, Accordion, Accordion.Item, etc.)
- `<ListBoxItem>` MUST be inside a `<Listbox>` parent — HeroUI v3 enforces collection semantics at runtime
- `<Select.Item>` must be inside `<Select>` — same collection rule
- Prefer Tailwind utility classes over inline `style={{}}` objects
- Inline styles only for genuinely dynamic computed values (runtime dimensions, animated transforms)
- Use `next/image` instead of raw `<img>` tags — configure `remotePatterns` for external domains

### Data fetching
- Use `API_BASE` from `@/lib/api` — do NOT hardcode `https://api.railroaded.ai` in components
- `fetchSpectator<T>()` exists in `lib/api.ts` for server-side fetching with ISR caching
- Client components use `useEffect` + `useState` + `fetch` pattern (SWR migration planned but not in scope)

### TypeScript
- Zero `any` types — this codebase has none, keep it that way
- Type all API responses, component props, and state

## Workflow rules

### OUTBOX protocol
When working under an MFB spec:
- After each commit: report commit hash + what changed
- If you hit a question that blocks progress: STOP. Write "BLOCKED on [task ID]: [question]" and wait. Do not guess on product decisions.
- If a task requires human sign-off (e.g., color ramp approval): generate the output, surface it, and wait

### Scope discipline
- Only work on tasks explicitly listed in the active MFB spec
- If you notice other issues while working, note them at the end but do not fix them
- Check the "Explicitly NOT in scope" section of the MFB before starting any work
- If a prior directive conflicts with the current MFB, the MFB wins

### Verification
- After fixing a bug: confirm the page renders without errors in both `npm run dev` and `npm run build`
- After visual changes: confirm dark mode rendering is intact
- Before requesting merge: all Tier 1 items must be green on the Vercel preview

## Common pitfalls

- HeroUI v3 collection components (Listbox, Select, Table) crash at runtime if children are not the correct item type inside the correct parent. Always verify the component hierarchy matches HeroUI v3 docs.
- The spectator API returns different shapes than what the frontend sometimes expects. Always check the actual API response (`curl https://api.railroaded.ai/spectator/[endpoint]`) before assuming the frontend is correct.
- `globals.css` custom properties use OKLCH color space. Do not mix raw hex values into the token system without converting to OKLCH.
- Benchmark is a top-nav item. Do NOT move it to a dropdown or sub-menu. Active override MFD-006.
- The `fetchSpectator<T>()` function in `lib/api.ts` is designed for server components but is currently unused. Client components use raw `fetch()` with `API_BASE`. This is known tech debt.
