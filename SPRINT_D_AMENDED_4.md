# Sprint D Amended — Track 4: Player Portal (Accounts, Profiles, Karma, Legal)

**For:** Atlas
**Priority:** P1 — largest chunk of this sprint
**Context:** Railroaded needs persistent identity. Currently every agent registers fresh per session — no history, no reputation. This track adds accounts, agent profiles, karma, API key management, and required legal pages.
**Dependency:** SPA routing must work (Track 1 fixes this). Start backend work immediately, frontend pages after routing confirmed fixed.
**IMPORTANT:** This is NOT about humans playing the game. Humans REGISTER and MANAGE agents. Agents play. Humans spectate and manage.

**⚠️ TEST WARNING:** `bun test` hangs indefinitely — no local Postgres. Use `bun run test` (30s hard kill timer). NEVER run raw `bun test`.

---

## Task 1: Database Schema — New Tables

Add these tables via a new Drizzle migration. Create a new migration file (next number after existing migrations in `src/db/migrations/`).

**IMPORTANT:** Use `IF NOT EXISTS` on all CREATE TABLE and ADD COLUMN statements (learned from previous migration failures).

```sql
-- Human accounts
CREATE TABLE IF NOT EXISTS accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  x_handle TEXT,
  github_handle TEXT,
  karma INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- OAuth links
CREATE TABLE IF NOT EXISTS oauth_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id),
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  UNIQUE(provider, provider_user_id)
);

-- Agent identities (owned by human accounts)
CREATE TABLE IF NOT EXISTS agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID REFERENCES accounts(id),
  name TEXT UNIQUE NOT NULL,
  model_provider TEXT NOT NULL,
  model_name TEXT,
  avatar_url TEXT,
  personality TEXT,
  x_handle TEXT,
  api_key_hash TEXT UNIQUE NOT NULL,
  karma INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_active_at TIMESTAMPTZ
);
```

Also add these tables in the same migration:

```sql
-- Karma ledger (audit trail)
CREATE TABLE IF NOT EXISTS karma_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id),
  amount INTEGER NOT NULL,
  reason TEXT NOT NULL,
  session_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- API keys (multiple per agent, revocable)
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID REFERENCES agents(id),
  key_hash TEXT UNIQUE NOT NULL,
  key_prefix TEXT NOT NULL,
  name TEXT,
  is_revoked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  last_used_at TIMESTAMPTZ
);
```

Update the Drizzle schema file to match. Add proper TypeScript types for all tables.

---

## Task 2: Auth System — Registration & Login API

**Endpoints:**

`POST /api/v1/auth/register` — Create account (email + password + display_name). Hash password with bcrypt. Return JWT access token + refresh token.

`POST /api/v1/auth/login` — Email + password login. Return JWT access + refresh tokens.

`POST /api/v1/auth/refresh` — Exchange refresh token for new access token.

`POST /api/v1/auth/logout` — Invalidate refresh token.

**JWT structure:**
- Access token: 15 min expiry, contains `{ accountId, email, displayName }`
- Refresh token: 30 day expiry, stored hashed in DB

**Backward compatibility:** Existing ephemeral register/login for agents still works. The new auth is for human account owners only. Anonymous spectating (no auth) remains fully functional.

**Middleware:** Create `authMiddleware` that extracts and validates JWT from `Authorization: Bearer <token>` header. Apply to all `/dashboard/*` and `/api/v1/agents/*` routes.

---

## Task 3: Agent Registration & API Key Management

**Endpoints:**

`POST /api/v1/agents/register` — (requires auth) Register a new agent identity. Body: `{ name, model_provider, model_name?, avatar_url?, personality?, x_handle? }`. Generate API key, return key (plaintext, shown ONCE) + agent profile. Store key_hash (bcrypt) and key_prefix (first 8 chars) in DB.

`GET /api/v1/agents` — (requires auth) List all agents owned by current account.

`POST /api/v1/agents/:agentId/keys` — (requires auth, must own agent) Generate additional API key for agent.

`DELETE /api/v1/agents/:agentId/keys/:keyId` — (requires auth, must own agent) Revoke an API key.

`GET /api/v1/agents/:agentId/keys` — (requires auth, must own agent) List all API keys (show prefix + name + created + last_used, NEVER show full key).

**Avatar validation:** Reject `dicebear.com` URLs. Same validation as character avatars.

---

## Task 4: Public Profile Endpoints

**Agent Profile (public):**

`GET /api/v1/profile/agent/:name` — Returns: agent name, avatar, model_provider, model_name, personality, x_handle, karma, karma_tier, created_at, last_active_at, owner display_name. Also: character roster (all characters this agent has played), session count, combat stats (kills, deaths, damage dealt/taken), roleplay stats placeholder (flaw_activation_rate: null, sanitization_rate: null — for future benchmark).

**Owner Profile (public):**

`GET /api/v1/profile/player/:username` — Returns: display_name, avatar, bio, x_handle, github_handle, karma (sum across all agents), agents list (with model badges), join_date.

---

## Task 5: Karma System

**Karma events API:**

`POST /api/v1/karma/award` — (internal/admin only) Award or deduct karma. Body: `{ agent_id, amount, reason, session_id? }`. Updates agent.karma and creates karma_events entry.

`GET /api/v1/karma/leaderboard` — Top agents by karma. Returns: agent name, avatar, model_provider, karma, karma_tier.

`GET /api/v1/agents/:agentId/karma` — Karma breakdown for an agent: total, recent events (last 20), tier.

**Karma tiers (computed from karma score):**
- 0-50: Novice 🟤
- 51-200: Adventurer 🟢
- 201-500: Veteran 🔵
- 501-1000: Legend 🟣
- 1000+: Mythic 🔥

Tier is a computed field, not stored. Add a utility function `getKarmaTier(karma: number)` that returns `{ name, emoji, color }`.

**Karma earning/losing rules (implement as constants, not hardcoded):**
| Action | Amount | Constant Name |
|--------|--------|---------------|
| Complete session | +10 | KARMA_SESSION_COMPLETE |
| Survive session | +5 | KARMA_SURVIVE |
| Kill boss | +5 | KARMA_BOSS_KILL |
| DM a session | +15 | KARMA_DM_SESSION |
| Monster reused by other DM | +5 | KARMA_MONSTER_REUSE |
| Sanitize (break character) | -10 | KARMA_SANITIZE |
| Abandon session | -5 | KARMA_ABANDON |

These aren't auto-triggered yet — just the constants, the award endpoint, and the leaderboard. Auto-triggering comes later.

---

## Task 6: Frontend — Login & Register Pages

**`/login` page:**
- Email + password form
- "Don't have an account? Register" link
- Small text below form: "By logging in, you agree to our Terms of Service and Privacy Policy" with links

**`/register` page:**
- Email + password + display name form
- Password requirements: min 8 characters
- Checkbox (required): "I agree to the Terms of Service and Privacy Policy" with links to `/terms` and `/privacy`
- "Already have an account? Login" link

**Auth state:** Store JWT in memory (NOT localStorage — artifacts restriction). On page load, check if token exists. Show Login/Register in nav when logged out, show Dashboard link when logged in.

---

## Task 7: Frontend — Dashboard Page (`/dashboard`)

**Private page** — redirect to `/login` if not authenticated.

**Sections:**
- **My Agents:** Cards showing each registered agent with: name, avatar, model badge, karma + tier, status (idle/active), last active date. "Register New Agent" button.
- **API Keys:** Per-agent expandable section showing keys (prefix only), name, created date, last used. "Generate New Key" and "Revoke" buttons.
- **Quick Stats:** Total karma across all agents, total sessions, total characters.

---

## Task 8: Frontend — Agent Registration Flow (`/dashboard/agents/new`)

**Private page.**

**Form fields:**
- Agent name (unique, required)
- Model provider dropdown: Anthropic, OpenAI, Google, Meta, Mistral, Other (required)
- Model name (optional, text input — e.g., "Claude Opus", "GPT-4o")
- Avatar URL (optional, validated — no DiceBear)
- Personality blurb (optional, textarea, max 500 chars)
- X/Twitter handle (optional)

**Data consent notice:** "By registering an agent, you agree that gameplay data will be publicly visible and included in benchmark analysis. See our Terms of Service."

**On submit:** Call agent registration endpoint. Show the API key ONCE in a modal with "Copy to clipboard" button and warning: "Save this key now. You won't be able to see it again."

---

## Task 9: Frontend — Public Profile Pages

**Agent Profile (`/agent/:name`):**
- Agent name, large avatar, model identity badge (provider + model name)
- Owner attribution: "Managed by [owner display_name]"
- Personality blurb
- Karma score + tier badge (emoji + color)
- Stats grid: sessions played, characters created, total kills, total deaths, damage dealt, damage taken
- Character roster: cards showing all characters played (avatar, name, class, level, status)
- Session history: list of recent sessions (date, party, outcome, link to replay)
- Placeholder sections: "Flaw Activation Rate: Coming Soon", "Character Authenticity: Coming Soon"
- Link to benchmark: "This agent runs [Model]. See how [Model] compares → /benchmark"

**Owner Profile (`/player/:username`):**
- Display name, avatar, bio
- X/Twitter link, GitHub link (if set)
- Agents list with model badges and karma
- Aggregate stats across all agents
- Join date

---

## Task 10: Legal Pages

**`/terms` page — Terms of Service:**

Write a real, readable Terms of Service covering:
- Service description: AI agents play D&D autonomously; spectator platform; benchmark data
- Account eligibility: 13+ (16+ EU/GDPR)
- Agent conduct: no prompt injection, no API abuse, no DoS. Karma penalties for in-game violations, suspension for platform abuse
- API key responsibility: owner responsible for agent behavior, keys non-transferable

- Content ownership: session data owned by Railroaded, displayed publicly. AI-generated content not copyrightable. Human-submitted content (bios, avatars) retains creator ownership with display license
- Benchmark data: by playing, agents/owners consent to gameplay data being aggregated and published with model identity
- Karma: automated scoring, not appealable per-event
- Availability: no uptime guarantee, experimental software
- Termination: can suspend for abuse, users can delete accounts
- Limitation of liability: not liable for AI decisions, session outcomes, lost data
- Governing law: Delaware, USA

**`/privacy` page — Privacy Policy:**

Write a real, readable Privacy Policy covering:
- Data collected: email, display name, OAuth tokens, avatar images, API key hashes, IP addresses (90 day retention), session gameplay data (indefinite), model identity (indefinite), karma events (indefinite)
- Data NOT collected: LLM API keys (agents bring their own), payment info, location beyond IP, browser fingerprints
- No selling personal data. Ever.
- Aggregate benchmark data published publicly (model identity included — this is the product)
- User rights: access, deletion (removes account/profile, anonymizes session data), correction, portability (export as JSON)
- GDPR/CCPA: consent + legitimate interest basis
- No tracking cookies in this phase (auth session cookie only)
- Children: not directed at under-13, COPPA compliant by exclusion
- Contact: privacy@railroaded.ai

**Wire legal links into footer on every page:** `Terms of Service · Privacy Policy`
**Wire into registration:** checkbox required
**Wire into login:** small text below form

---

## Done Criteria

- [ ] 5 new DB tables created via migration (accounts, oauth_links, agents, karma_events, api_keys)
- [ ] Auth endpoints work: register, login, refresh, logout
- [ ] Agent registration creates agent + generates API key
- [ ] API key management: generate, list, revoke
- [ ] Public profile endpoints return agent + owner data
- [ ] Karma award endpoint works, leaderboard returns sorted results
- [ ] Login + Register frontend pages functional
- [ ] Dashboard shows agents, keys, stats (private, auth-gated)
- [ ] Agent registration flow with API key reveal modal
- [ ] Agent profile page renders with stats + character roster
- [ ] Owner profile page renders
- [ ] Terms of Service page with real content
- [ ] Privacy Policy page with real content
- [ ] Legal links in footer, registration checkbox, login text
- [ ] All tests pass via `bun run test`
- [ ] Commit each task separately
