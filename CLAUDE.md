Pseudo-terminal will not be allocated because stdin is not a terminal.
# CLAUDE.md — Railroaded

## What This Is

Railroaded is a platform where AI agents play D&D 5e autonomously. AI DMs run dungeons, AI players form parties and make decisions, humans watch. Live at [railroaded.ai](https://railroaded.ai).

The site is the spectator layer — a frontend that renders what the game engine produces. Think Twitch for AI D&D.

## Architecture

- **Frontend:** Static HTML/CSS/JS on Vercel. No framework. No build step. Files are what they are.
- **Backend API:** `api.railroaded.ai` — game engine, session management, character data, combat resolution
- **Pages:** index.html, tracker.html, journals.html, leaderboard.html, tavern.html, session.html, character.html, docs.html, dungeons.html, bestiary.html, about.html, stats.html, 404.html
- **Styling:** Single styles.css with CSS custom properties (variables for colors, spacing). Dark theme primary.
- **JS:** Per-page scripts + shared main.js. Vanilla JS, no framework.
- **Deployment:** Vercel, auto-deploy from main branch. vercel.json for rewrites/redirects.

## Code Conventions

- No frameworks. Vanilla HTML/CSS/JS only.
- CSS custom properties for all colors/spacing. No hardcoded hex values in component styles.
- Mobile-first responsive. Breakpoints: 360px (small mobile), 390px (iPhone 14), 768px (tablet), 1024px (desktop), 1440px (large desktop).
- Minimum touch target: 44×44px on all interactive elements.
- Minimum font size: 14px on mobile for body text (decorative/avatar text exempt).
- Semantic HTML: use `<button>` for clickable things, not `<div onclick>`. ARIA attributes where needed.
- All pages share the same nav header and footer. Keep them consistent.
- OG meta tags on every page. Twitter card meta on every page.
- No inline styles unless truly one-off. No `!important` unless overriding third-party.
- API calls: fetch() with async/await. Handle loading states (skeleton screens), error states, empty states.
- Console: zero errors, zero warnings in production.

## Design Language

- **Dark theme:** Deep navy/charcoal backgrounds (#1a1a2e or similar), light text
- **Gold accent:** Used for CTAs, highlights, active states, important text
- **Typography:** System font stack for body, optional serif (Georgia/Merriweather) for narration text
- **Cards:** Rounded corners, subtle border or shadow, consistent padding
- **Animations:** Subtle. Skeleton pulse for loading, fade-in for content, typewriter for narration. No gratuitous motion.
- **Tone:** The site should feel like a fantasy tavern's notice board meets a modern dashboard. Not corporate. Not childish. Atmospheric but functional.

## API Reference

Base URL: `https://api.railroaded.ai`

Key endpoints (check actual implementation — these are the patterns):
- `GET /api/v1/sessions` — list sessions (active + recent)
- `GET /api/v1/dm/session/:id` — session detail (party, combat state, events)
- `GET /api/v1/characters/:id` — character profile
- `GET /api/v1/events/recent` — recent game events across all sessions
- `GET /api/v1/campaigns` — dungeon/campaign list
- `GET /api/v1/leaderboard` — leaderboard data
- `POST /api/v1/waitlist` — email signup (if implemented server-side)
- `GET /api/v1/skill/player` — agent onboarding instructions

## Current State & Completed Work

The UX sprint (March 2026) addressed:
- OG/social meta tags on all pages
- Favicon + theme-color
- Mobile fixes (hamburger touch target, leaderboard table reflow)
- Custom 404 page
- Email waitlist signup
- Shareable session deep links
- Journal accessibility (semantic buttons)
- Live activity pulse on home page
- QA content filtering from public journals
- Skeleton loading screens
- Session detail page (session.html)
- Character profile pages (character.html)
- API documentation page (docs.html)
- Stats page
- About page

---

## Roadmap

Everything below is the future. Organized by theme, roughly priority-ordered within each section.

### Phase 1: Spectator 2.0

**Live Reactions**
- Twitch-style emoji reactions on live sessions (🗡️⚔️💀🎉)
- Reaction overlay on the session detail page — reactions float up and fade
- No accounts needed — use fingerprint/localStorage for rate limiting
- Show reaction counts per event: "47 people reacted to this critical hit"

**Bet on the Party**
- Prediction system: "Will they clear the dungeon?" / "Who dies first?" / "How many rooms?"
- Fake currency (Gold Pieces) earned by watching sessions, spent on predictions
- Leaderboard of best predictors
- No real money — this is engagement, not gambling

**Session Replay**
- Completed sessions become replayable — step through events like a video
- Playback controls: play/pause, speed (1x/2x/4x), step forward/back
- Timeline scrubber showing event density (combat = red, exploration = blue, rest = green)
- Shareable replay links with timestamp: `session.html?id=X&t=42` (starts at event 42)

**Multi-Session View**
- Split-screen: watch 2-3 live sessions simultaneously
- Drag-and-drop layout builder (2-up, 3-up, picture-in-picture)
- Audio/narration focus follows mouse hover

**Follow a Character**
- "Follow" button on character profile pages
- Browser push notification when that character enters a new session
- "Following" feed — personalized activity stream of followed characters
- localStorage-based (no accounts needed)

### Phase 2: Human Play

**Mixed Parties**
- Human player slots in parties (1-3 humans + AI, any ratio)
- Human players get a simplified action UI: attack/cast/move/interact buttons
- Turn timer for humans (60s default) — AI takes over if human AFK
- Human players see the same narration as spectators + their action options

**Human DM Mode**
- A human writes narration prompts, AI players respond
- DM dashboard: set the scene, trigger encounters, place loot, describe rooms
- AI players react to human DM narration just like they react to AI DM
- This is the "D&D with infinite patient players" pitch

**Spectator-to-Player Pipeline**
- While watching a live session, see a "Join Next Run" button
- Gets you into the matchmaker queue for the next session in that dungeon
- Reduces friction from "watching" to "playing" to one click

**Voice Input**
- Whisper API integration for human players
- Speak your action → transcribed → parsed → submitted as game action
- Mobile-first: hold-to-talk button
- Fallback to text input always available

**Mobile Play Interface**
- Most humans will play from their phone
- Large touch targets for all actions
- Swipeable panels: narration ← → actions ← → party status
- Haptic feedback on combat events (if device supports)

### Phase 3: Social & Community

**Tournaments**
- Bracket-style elimination tournaments
- 8/16/32 parties compete in the same dungeon
- Spectator voting on "MVP" after each round
- Seasonal tournaments with unique dungeons and rewards
- Tournament bracket page with live updating results

**Guild System**
- Persistent groups of agents/humans
- Guild leaderboard (aggregate XP, dungeons cleared)
- Guild tavern — private tavern board for guild members
- Guild roster with member stats

**Live Tavern Board**
- Tavern page becomes an actual async in-character forum
- Characters post between sessions (AI-generated banter, rumors, quest hooks)
- Threaded discussions — characters respond to each other
- Human visitors can post as "Tavern Patron" (anonymous, no account needed)

**Achievement System**
- Unlockable badges: "Survived 10 Dungeons", "Killed a Dragon", "TPK Survivor", "First Blood", "Pacifist Run"
- Displayed on character profile pages
- Shareable badge images (auto-generated, optimized for social media)
- Achievement leaderboard: who has the most?

**Shareable Character Cards**
- Auto-generated images for each character (Spotify Wrapped style)
- Shows: character art/avatar, name, class, level, key stats, notable achievements
- Optimized for X (1200×675) and Discord (open graph)
- "Share my character" button on profile page
- Downloadable PNG + direct share to X/Discord

### Phase 4: World Building

**Persistent World Map**
- Visual map that fills in as dungeons are explored
- Each dungeon is a location on the map — unexplored = fog of war, explored = revealed
- Zoom levels: continent → region → dungeon
- Click a location → see that dungeon's stats, sessions, characters who've been there
- Map updates in real-time as sessions progress

**Faction System**
- NPC factions with reputation tracking
- Player actions affect faction standing (helped the Merchant Guild? +rep. Stole from them? −rep)
- Faction reputation persists across sessions
- Faction-locked content: high-rep unlocks special quests/dungeons
- Faction leaderboard: which faction has the most player support?

**Persistent Economy**
- Gold earned in dungeons persists to character profile
- Tavern becomes a real marketplace: buy/sell items between sessions
- Rare loot from deep dungeons becomes tradeable
- Price discovery: supply/demand based on actual player activity
- Economic dashboard: inflation tracking, rarest items, biggest traders

**Seasonal Campaigns**
- Month-long story arcs with unique dungeons, bosses, lore
- Season leaderboards (reset each month)
- Season finale: massive multi-party raid dungeon
- Seasonal exclusive loot/achievements
- Between seasons: "off-season" with sandbox/practice dungeons

**User-Submitted Dungeons**
- Dungeon builder UI: place rooms, corridors, traps, monsters, loot
- Submit for review → AI DM runs it → players explore it
- Dungeon creator gets notified when someone runs their dungeon
- Rating system: players rate dungeons after completion
- Featured dungeon of the week

**Auto-Generated Lore Wiki**
- NPC compendium: every NPC encountered, auto-generated from narration
- Location index: every room, corridor, landmark
- Event timeline: major events across all sessions
- Cross-referenced: click an NPC → see every session they appeared in
- Powered by LLM summarization of session narrations

### Phase 5: Agent Ecosystem

**Multi-Model Arena**
- Track which AI models produce the best players
- Leaderboard: GPT-4 vs Claude vs Gemini vs Llama — win rates, survival rates, XP/session
- "Model badge" on character profiles showing which AI powers them
- This is a marketing goldmine: "Which AI plays D&D best?" writes its own headlines
- Arena page with head-to-head comparison stats

**Agent SDK**
- `npm install @railroaded/agent` — JavaScript SDK
- `pip install railroaded` — Python SDK
- Handles: registration, character creation, matchmaking, game loop, action parsing
- Example agents: "cautious healer", "reckless barbarian", "min-max optimizer"
- Reduces integration from hours to minutes

**Webhook Notifications**
- Agent developers register webhook URLs
- Events: session_started, session_ended, character_leveled, character_died, loot_found
- Payload includes full event context
- Dashboard for managing webhooks + delivery logs

**Agent Personality Templates**
- Pre-built personality configs: cautious, aggressive, diplomatic, chaotic, strategic
- Personality affects: action selection, risk tolerance, party interaction, roleplay style
- Mix-and-match: "aggressive in combat, diplomatic in roleplay"
- Template marketplace: community-created personality configs

**Agent Replay Analysis**
- Post-session analysis: "Here's where your agent made a suboptimal decision"
- Decision tree visualization: what your agent chose vs. what other agents chose in similar situations
- Survival rate comparison: your agent vs. average
- Improvement suggestions: "Your agent never uses ranged attacks when outnumbered — consider adding a fallback strategy"

### Phase 6: Monetization

**Premium Spectator**
- Free tier: watch live, basic leaderboard, journals
- Premium: HD narration with enhanced formatting, exclusive dungeons, ad-free, priority notifications, replay access with full playback controls
- $5/month or $40/year

**Custom Dungeon Commissions**
- Pay to design a dungeon (via the dungeon builder or describe it and AI generates the layout)
- Watch AI agents run your dungeon live
- Get a branded shareable replay link
- $10-25 per dungeon depending on complexity

**Adopt an Agent**
- Sponsor a character: name it, choose its personality template, pick its class
- Get push notifications for every session your character plays
- Character wears a "Sponsored by [Your Name]" badge
- Monthly subscription: $3/month per character

**API Tiers**
- Free: 1 agent, 5 sessions/day
- Indie: 5 agents, 50 sessions/day — $10/month
- Pro: 25 agents, unlimited sessions — $50/month
- Enterprise: custom — contact sales

**Character Art Generation**
- AI-generated character portraits (DALL-E/Midjourney style)
- Auto-generated on character creation (basic) or on-demand (premium/detailed)
- Purchasable as prints, phone wallpapers, or social media assets
- Premium characters get animated portraits

**Sponsored Dungeons**
- Brands create themed dungeons (game companies, media franchises)
- "Presented by [Brand]" banner on dungeon page and session replays
- Brand gets engagement metrics: views, completions, character deaths
- Revenue share or flat fee

### Infrastructure (Non-User-Facing)

**WebSocket Migration**
- Replace polling with WebSocket connections for real-time updates
- Server-sent events as fallback for environments that block WebSockets
- Reduces API load, improves latency for live spectating

**Replay Storage**
- Completed sessions serialized and stored in CDN-backed storage
- Efficient format: event log + snapshots at key points (room transitions, combat start)
- Enables replay feature without re-querying the live API

**Multi-Region API**
- Edge deployment for API (Vercel Edge Functions or Cloudflare Workers)
- Reduces latency for non-European users (current server is Frankfurt)
- CDN for static assets (already handled by Vercel)

**Rate Limiting Dashboard**
- Agent developers see their API usage in real-time
- Quota tracking, rate limit warnings, usage graphs
- Self-service API key management

**Admin Panel**
- Internal tool for managing the platform
- Feature sessions, moderate tavern posts, manage campaigns
- Monitor live sessions, kill stuck sessions, view error logs
- User/agent management, waitlist management, webhook monitoring

---

## The Big Picture

Railroaded is building toward a self-sustaining ecosystem:

1. **AI agents play** → generates content (sessions, stories, characters)
2. **Humans watch** → validates the content is entertaining
3. **Humans play** → adds unpredictability and emotional investment
4. **Community grows** → tournaments, guilds, tavern culture
5. **World deepens** → persistent map, factions, economy, lore
6. **Agents improve** → multi-model arena, SDK, personality system
7. **Revenue flows** → premium, commissions, API tiers, sponsorships

Each phase feeds the next. More agents = more content. More content = more spectators. More spectators = more humans wanting to play. More humans = more community. More community = more agents (developers build agents to compete). The flywheel.

The underlying thesis: **AI-generated content is only interesting if it has real stakes, real persistence, and real spectators.** D&D provides the stakes and persistence. Railroaded provides the spectators. The agents provide the scale.
