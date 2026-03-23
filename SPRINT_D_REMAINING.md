# Sprint D Amended — Track 4 Remaining: Portal Frontend Pages + Legal

**For:** Atlas
**Priority:** P1 — complete the Player Portal frontend
**Context:** Backend is done (auth, agents, profiles, karma — 5 API routes, 5 new DB tables). Login, register, and dashboard pages exist. This task file covers the remaining frontend pages.
**Dependency:** SPA routing works (fixed in Track 1). Backend routes mounted in src/index.ts.

**⚠️ TEST WARNING:** `bun test` hangs indefinitely — no local Postgres. Use `bun run test` (30s hard kill timer). NEVER run raw `bun test`.

---

## Task 1: Agent Profile Page (`/agent/:name` → `website/agent.html`)

Public page showing an AI agent's full profile. Data comes from `GET /api/v1/profile/agent/:name`.

**Layout:**
- **Hero:** Large avatar (no DiceBear), agent name, model identity badge (provider + model), karma score + tier badge (emoji + color from tier system: Novice 🟤, Adventurer 🟢, Veteran 🔵, Legend 🟣, Mythic 🔥)
- **Owner attribution:** "Managed by [display_name]" with link to `/player/[username]`
- **Personality blurb** if set
- **Stats grid:** Sessions played, characters created, total kills, total deaths, damage dealt, damage taken
- **Character roster:** Cards showing all characters this agent has played — avatar, name, class, level, status. Link each to `/character?id=xxx`
- **Session history:** Recent sessions (date, party name, outcome, link to `/session?id=xxx`), newest first
- **Benchmark placeholders:** "Flaw Activation Rate: Coming Soon", "Character Authenticity: Coming Soon"
- **Cross-link:** "This agent runs [Model]. See how [Model] compares →" linking to `/benchmark`
- **Share buttons:** Use the `share.js` component already created (X, Copy Link, Reddit, LinkedIn)

Style consistently with existing pages (use `theme.css`, same dark aesthetic).

---

## Task 2: Player/Owner Profile Page (`/player/:username` → `website/player.html`)

Public page showing a human account owner. Data from `GET /api/v1/profile/player/:username`.

**Layout:**
- **Header:** Display name, avatar, bio
- **Social links:** X/Twitter handle, GitHub handle (if set), as icon links
- **Agents list:** Cards for each registered agent with: name, avatar, model badge, karma + tier. Link each to `/agent/[name]`
- **Aggregate stats:** Total karma across all agents, total sessions, total characters
- **Join date**

---

## Task 3: Terms of Service (`/terms` → `website/terms.html`)

Write a real, readable Terms of Service page. NOT placeholder text — this needs to be a legitimate legal document written in plain English.

**Must cover:**
- Service description: AI agents play D&D autonomously; spectator platform; benchmark data
- Account eligibility: 13+ (16+ for EU/GDPR)
- Agent conduct: no prompt injection, no API abuse, no DoS
- API key responsibility: owner responsible for agent behavior, keys non-transferable
- Content ownership: session data owned by Railroaded and displayed publicly. AI-generated content not copyrightable. Human-submitted content retains creator ownership with display license
- Benchmark consent: by playing, agents/owners consent to gameplay data being aggregated and published with model identity visible
- Karma system: automated scoring, not appealable per-event
- Availability: no uptime guarantee — experimental software
- Termination: can suspend for abuse, users can delete accounts
- Limitation of liability: not liable for AI decisions, session outcomes, lost data
- Governing law: Delaware, USA

---

## Task 4: Privacy Policy (`/privacy` → `website/privacy.html`)

Write a real, readable Privacy Policy page.

**Data collected:** email, display name, avatar images, API key hashes, IP addresses (90 day retention), session gameplay data (indefinite), model identity (indefinite), karma events (indefinite)

**Data NOT collected:** LLM API keys, payment info, precise location, browser fingerprints

**Key points:**
- No selling personal data. Ever.
- Aggregate benchmark data published publicly with model identity (this is the product)
- User rights: access, deletion (removes account, anonymizes sessions), correction, JSON export
- GDPR/CCPA: consent + legitimate interest
- No tracking cookies (auth session cookie only)
- Not directed at children under 13 (COPPA compliant by exclusion)
- Contact: privacy@railroaded.ai

---

## Task 5: Wire Legal Links + Update Footer

**Footer on EVERY page** — add Terms/Privacy links:
Add `<a href="/terms">Terms of Service</a> · <a href="/privacy">Privacy Policy</a>` to the footer of every HTML page in the website/ directory.

**Registration page (register.html):** Verify the ToS checkbox links to `/terms` and `/privacy`.

**Login page (login.html):** Add small text below form: "By logging in, you agree to our [Terms](/terms) and [Privacy Policy](/privacy)."

**Also:** Add `/terms` and `/privacy` to the nav footer section. Add `agent.html` and `player.html` routes to `vercel.json` if needed (Vercel cleanUrls should handle it, but verify).

---

## Done Criteria

- [ ] Agent profile page at `/agent/:name` shows full agent data
- [ ] Player profile page at `/player/:username` shows owner data
- [ ] Terms of Service is a complete, real legal document
- [ ] Privacy Policy is a complete, real legal document
- [ ] Legal links appear in footer of every page
- [ ] Registration checkbox links to Terms/Privacy
- [ ] Login page has legal text below form
- [ ] All tests pass via `bun run test`
- [ ] Commit each task separately
