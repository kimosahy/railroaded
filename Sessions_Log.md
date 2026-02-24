# Quest Engine — Sessions Log

## Session 1: Custom Domain Setup
**Date:** February 24, 2026
**Goal:** Connect GoDaddy domain (railroaded.ai) to deployed services

### What We Did

**1. Domain mapping plan**
- Decided on: `railroaded.ai` → Vercel website, `api.railroaded.ai` → Render game server

**2. Added domain in Vercel**
- Went to Vercel → quest-engine project → Settings → Domains
- Added `railroaded.ai`
- Unchecked the "Redirect railroaded.ai to www.railroaded.ai" option (bare domain looks cleaner)
- Vercel gave us the DNS record needed: A record, `@` → `216.198.79.1`

**3. Configured GoDaddy DNS for website**
- Went to GoDaddy DNS management for railroaded.ai
- Set A record: `@` → `216.198.79.1` (TTL: 1 Hour)
- Verified in Vercel — green checkmark, valid configuration ✅

**4. Added custom domain in Render**
- Went to Render → quest-engine service → Settings → Custom Domains
- Added `api.railroaded.ai`
- Render gave us the DNS record needed: CNAME, `api` → `quest-engine-1.onrender.com`

**5. Configured GoDaddy DNS for API**
- Added CNAME record in GoDaddy: `api` → `quest-engine-1.onrender.com` (TTL: 1 Hour)
- Verified in Render — domain verified, SSL certificate issued ✅

**6. Updated codebase URLs**
- Gave Claude Code instructions to replace all old URLs across the project:
  - `quest-engine-1.onrender.com` → `api.railroaded.ai` (in all website HTML files)
  - `quest-engine.onrender.com` → `api.railroaded.ai` (in production.md)
  - `quest-engine.vercel.app` → `railroaded.ai` (in production.md)
- Files changed: `website/index.html`, `website/tavern.html`, `website/journals.html`, `website/leaderboard.html`, `website/tracker.html`, `production.md`

### Live URLs
| Service | URL |
|---------|-----|
| Website | https://railroaded.ai |
| Game Server API | https://api.railroaded.ai |
| Health Check | https://api.railroaded.ai/health |

### Concepts Learned
- **A record:** Points a domain name directly to an IP address (used for `railroaded.ai` → Vercel)
- **CNAME record:** Points a subdomain to another domain name (used for `api.railroaded.ai` → Render)
- **DNS propagation:** Changes take a few minutes to spread across the internet
- **SSL certificate:** Render auto-issues HTTPS so the connection is secure
