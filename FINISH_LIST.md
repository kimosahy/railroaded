# FINISH_LIST — Railroaded launch audit (2026-07-07)

Audit by CoS-Prime CC (spec: `cos-prime/specs/CC_RAILROADED_FINISH_AUDIT.md`), branch `cc/finish-audit-20260707`.
**Read time ~5 min. Section 3 is the ranked list; everything above it is evidence.**

A parallel story-engine sprint runs on `fable/story-engine-sprint` (unpushed, so its diff is
unverifiable). Anything touching that surface — `src/theater/*`, the emission handlers inside
`game-manager.ts`, `ws.ts` broadcast plumbing, `spectator.ts` emission endpoints, `narrator.ts`,
`src/tools/*`, and `web/src/components/theater/*` — is tagged **DEFERRED-TO-SPRINT** here and was
not built on this branch, per the spec's parallel-work boundary.

---

## 1. State of the world

| Check | Result |
|---|---|
| Backend installs/runs | ✅ `bun install` clean (bun 1.3.9) |
| Backend typecheck | ❌ **116 `tsc --noEmit` errors** in 12 files (53 in `game-manager.ts`) — nothing runs tsc, so nobody noticed. **Now 79** after this branch's fixes; all 79 sit on the story-engine sprint surface |
| Backend tests | ⚠️ **The full suite never runs anywhere.** `test-runner.sh:13` kills at 30s and reports success; CI (`deploy.yml:25-28`) kills at 60s and reports success. Raw `bun test` hangs on DB-pool cleanup after the summary. Known failures: `tests/tracker-responsive.test.ts` (stale — asserts old `.container` CSS, page now uses `.page-with-narrator`), `tests/theater-pacing.test.ts` (fails unless `web/` deps are installed — CI never installs them). Exact counts in §1a. |
| Web (`web/`) build | ✅ `next build` clean, 20 routes; `tsc` 0 errors |
| CI | ⚠️ Green but decorative: push-to-main only (no PR checks), no typecheck, no web build, timeout-kill counted as pass, deploy hook `curl -s` never checked (`.github/workflows/deploy.yml`) |
| Deploys | Render (backend) + Vercel (web). Config is dashboard-only (no render.yaml). Last deploy **May 10** — two months idle. `production.md` documents 4 of ~22 env vars and still describes deploying the dead `website/` dir |
| Database | **Migration `drizzle/0021_ena_sprint_j.sql` is orphaned** — on disk, absent from `drizzle/meta/_journal.json`, so `db:migrate` never applies it. `schema.ts` already uses its columns (`npcs.knowledge/goals/relationships/standing_orders`, `session_phase='conversation'`) → a fresh DB breaks every NPC/ENA path. Prod presumably got 0021 by hand; unverified. Also: snapshot baseline stuck at 0016 → running `db:generate` would emit a spurious re-apply of 0017–0023 |
| Open PRs | [#17](https://github.com/kimosahy/railroaded/pull/17) navbar change (MF, Apr 30) — awaiting Karim |

### 1a. Test counts (full run, this branch, web deps installed)

First-ever complete run of the suite (the old runner killed it at 30s; CI at
60s; a bare `bun test` hangs mid-run on cross-file state): **110 test files.**
As found on main: 5 files failing (avatar, ie-bugfixes, npcs,
tracker-dead-monsters, tracker-empty-sessions — all asserting dead contracts;
they had never actually executed) plus 2 visible failures in
tracker-responsive. After this branch's fixes: **110 files pass, 0 fail,
0 hang** via the new per-file `test-runner.sh`.

## 2. Core loop — walked legs (citations in parentheses)

| Leg | Status | Note |
|---|---|---|
| Agent register/login (Bearer) | **WORKS** | `src/api/auth.ts:73,122`; token auto-renew on every request |
| Human account → agent API key → play | **BROKEN (disconnected)** | Account JWT + `rr_` API keys exist (`account-auth.ts`, `agents.ts:98-122`) but **no transport ever verifies an API key** — an account-registered agent cannot play; only legacy `/register`+`/login` works |
| Character → queue → party formation | **WORKS, with B015 race** | `game-manager.ts:4585,7844`. Root cause (moderate confidence): fire-and-forget user/party/session DB inserts; if `dbSessionId` loses the race, every `logEvent` silently no-ops (`game-manager.ts:7989`) — session "dissolves" from the DB/spectator view |
| Session → turns → DM/player tools | **WORKS** | 50 DM tools + player tools fully dispatched over MCP (`mcp.ts:300-635`); autopilot timer real (`game-manager.ts:531`) |
| Event persistence + snapshots | **WORKS** | `logEvent` → `session_events` (`game-manager.ts:7987-7998`); snapshots at end/TPK |
| Resume after server restart | **BROKEN (dead code)** | `loadPersistedState` hardcodes `activeSessions = []` (`game-manager.ts:8554`) — the ~150-line rehydration block below it is unreachable. Any Render restart kills all live sessions, and campaigns can't resume (`handleStartCampaignSession` needs an in-memory party, `:6607`) |
| Transports | **MCP ✅ REST ✅ WS partial** | WS `handleAction` is an echo stub (`ws.ts:335-340`) but gameplay rides REST/MCP |
| Spectator web | **PARTIAL** | Pages render, but: live theater likely subscribes with sessionId where backend broadcasts on party.id (`theater-client.tsx:160` vs `ws.ts:381`) → live view can show nothing; human login/register always 400 (§3); RSS/robots/sitemap/OG lost vs legacy site |

## 3. The ranked finish-list

Ordered by launch-blocking severity, then dependency. Tags: **MECHANICAL** (CC can build) /
**KARIM** (product/design/copy/pricing call) / **DEFERRED-TO-SPRINT** (mechanical but on the
story-engine sprint's surface — build after that branch lands).

### Launch blockers

1. **[MECHANICAL — DONE] Fix orphaned migration 0021** — journal entry added (plus monotonic `when` fixes for 0011/0014/0015, same silent-skip hazard); regression test `tests/migrations-journal.test.ts` asserts file↔journal parity and ordering. Prod DBs already past 0022 are untouched; a one-time `psql -f drizzle/0021_ena_sprint_j.sql` check is documented in production.md.
2. **[MECHANICAL — DONE] Make the test suite actually run and pass** — per-file `test-runner.sh` with real failure propagation (hangs become named failures); 6 stale test files fixed (they had never executed). Suite: **111 files pass, 0 fail, 0 hang.**
3. **[MECHANICAL — DONE] CI that gates** — PR trigger, backend per-file tests (with web deps), web `tsc --noEmit` + `next build` job, deploy job checks the Render hook's HTTP status. Backend `tsc` gate still pending items 20 → post-sprint.
4. **[MECHANICAL — DONE] Fix human auth on the site** — `/login`/`/register` now call `/api/v1/auth/*` with the account contract and store `rr_*` tokens. (The `railroaded-token` WS cookie turned out to be moot: WS auth only accepts agent tokens — account JWTs have no WS consumer today.) Combined with item 10's `verify()` fix, the account system now works end to end.
5. **[DEFERRED-TO-SPRINT] Live theater shows nothing** — `/theater/[id]` subscribes `{partyId: sessionId}` but backend broadcasts keyed by `party.id`; session id ≠ party id for DB sessions. One-line-ish fix but sits on theater surface. (`web/src/app/theater/[id]/theater-client.tsx:160`, `src/api/ws.ts:381`)
6. **[DEFERRED-TO-SPRINT] Sessions die on restart + B015 dissolve race** — rehydration dead code (`game-manager.ts:8554`) and the fire-and-forget persistence chain (`:7903-7930`, `auth.ts:110-116`). Both fixes live inside `game-manager.ts` (a file the sprint plausibly edits). Highest-value mechanical work after the sprint lands.
7. **[KARIM] Real Terms of Service + Privacy Policy** — pages exist as placeholders; launch needs real documents. (SPRINT_D_REMAINING; `web/src/app/terms`, `/privacy`)
8. **[KARIM] Launch call: what does "launched" mean?** — pricing/monetization absent by design (server never pays for LLMs); is launch = announce + open agent registration? Drives items 12–14 priority.

### High — degraded but technically launchable

9. **[MECHANICAL — DONE] Broken spectator API calls (non-theater)** — RSS link → `/spectator/feed.xml`; `/worlds` calls `/spectator/dungeons` directly; session narrations use `/narrations/:sessionId` (was showing the global feed); dead viewer-count poller removed.
10. **[MECHANICAL — DONE] Backend tsc errors in non-sprint files** — `account-auth.ts`(7), `agents.ts`(20), `auth.ts`(3), `push.ts`(4), `rate-limit.ts`(1), `templates.ts`(1), `autopilot.ts`(1). Two were live bugs: hono `verify()` with 2 args throws, so **every account-JWT request 401'd** (the whole `/api/v1/agents` surface was dead), and autopilot returned `undefined` in the `conversation` phase (caller crash). Remaining 79 errors (`game-manager.ts` 53, `spectator.ts` 13, `dm-tools.ts` 5, `narrator.ts` 5, `turns.ts` 3) → DEFERRED-TO-SPRINT (item 20).
11. **[MECHANICAL — DONE] JWT_SECRET production guard** — server refuses to boot in production on the dev default; tested. **Deploy note: Render needs `JWT_SECRET` set before this merges.**
12. **[MECHANICAL — DONE] Web API base configurable** — `NEXT_PUBLIC_API_BASE` override, prod default unchanged; docs "View API" card uses it (the agent-CTA command string stays literal — it's canonical copy).
13. **[MECHANICAL — DONE] SEO/meta parity with legacy** — robots.ts + sitemap.ts routes, `metadataBase` + OpenGraph + Twitter card, manifest/og-share.png/llms.txt/192+512 icons ported to `web/public`.
14. **[BLOCKED → KARIM] Complete the account→agent→play chain** — verify `rr_` API keys in gameplay auth so account-registered agents can actually play. **Blocker found while scoping: the `agents` table has no role column** — nothing says whether an account-registered agent is a player or a DM, and role drives all tool gating. Deciding how agents declare role (at registration? per queue-join?) is an agent-API design call (repo rule: agent-API changes need approval). The wiring after that decision is mechanical: prefix-indexed lookup on `api_keys.key_prefix`, bcrypt verify, map to a game user. (`src/api/agents.ts:98-122`, `src/api/auth.ts:324`, `src/db/schema.ts:616`)
15. **[MECHANICAL — DONE] production.md + docs truth pass** — full env-var table, Vercel section now documents `web/`, per-file test runner documented, drizzle 0016-snapshot trap + 0021 one-time check written down, architecture.md corrected.
16. **[KARIM] PR #17 (Tracker in top nav, from MF)** — one-file navbar change, mergeable; product/nav call.
17. **[KARIM] Legacy `website/` Vercel project** — `website/vercel.json` still live-shaped; is a stale Vercel project still serving it? Kill or keep (dashboard access needed).
18. **[KARIM] Tavern fake posts** — `/tavern` renders hardcoded `SEED_POSTS` when the API is empty; show mock content, an empty state, or seed real content? (`tavern-client.tsx:59,277`)
19. **[KARIM] Dashboard page scope** — `/dashboard` is "coming soon"; ship it, hide it, or cut it for launch? (`dashboard/page.tsx:49`)

### Medium — post-launch quality

20. **[DEFERRED-TO-SPRINT] J-Fix remaining T3–T7** — NPC disposition validation, spectator NPC 500, clock crash, auto-advance-turn; all in `game-manager.ts`/`spectator.ts`. (SPRINT_JFIX_REMAINING.md)
21. **[DEFERRED-TO-SPRINT] known-issues #1 bonus-action spell cast bug**, `hp` vs `hpCurrent` dead gating (`game-manager.ts:2145`), dead `phase === "ended"` checks (`:649` etc.), WS `handleAction` stub (`ws.ts:335`).
22. **[MECHANICAL] Drizzle snapshot baseline regen** — unblock `db:generate` (currently emits spurious re-applies). Needs a careful, DB-verified pass; do after sprint merge to avoid migration collisions.
23. **[MECHANICAL] Dead/orphan cleanup** — `scripts/seed-avatars.ts` (writes to a tombstone), 13 orphaned theater components (sprint may revive — check first), stale `mcp.ts:7` "stub" comment, "Quest Engine" branding in reference client.
24. **[KARIM] Theater-setup product calls** — avatar generation provider + DM key verification are stubbed UI (`avatar-panel.tsx:36,44`, `dm-verify.tsx:27`); needs a provider/flow decision before the mechanical wiring.
25. **[KARIM] Engine depth backlog** — concentration enforcement, frightened condition, Destroy Undead, town/codex phases (CLAUDE.md specs Phase 4/5 that were never built — the spec doc itself is stale). Product-priority call, then mechanical.
26. **[KARIM] PWA/ambient-audio parity with legacy** — service worker, offline, audio.js existed on the old site; want them back?

---

## Outcome of this branch (Part B)

**DONE (each its own commit, each tested):** items 1, 2, 3, 4, 9, 10, 11, 12, 13, 15.
**BLOCKED:** item 14 — needs the agent-role design call (see item text); everything mechanical after that call is scoped.
**DEFERRED-TO-SPRINT:** items 5, 6, 20, 21, and the 79 remaining tsc errors — all on files the `fable/story-engine-sprint` branch plausibly modifies (unpushed, so unverifiable); highest-value mechanical work once it lands.
**KARIM decisions queued (also pointed to from cos-prime `PENDING_FOR_KARIM.md`):** items 7, 8, 16, 17, 18, 19, 24, 25, 26.

Verification state at branch tip: backend suite 111 files / 0 fail / 0 hang; web `tsc --noEmit` clean; `next build` clean (26 routes incl. new robots/sitemap); backend tsc 79 errors, all on the sprint surface.

*Generated by the finish-audit CC, 2026-07-07 (spec: `cos-prime/specs/CC_RAILROADED_FINISH_AUDIT.md`). Branch `cc/finish-audit-20260707`, PR on HOLD — no deploy.*
