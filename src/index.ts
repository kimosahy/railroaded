import { Hono } from "hono";
import { cors } from "hono/cors";
import { readFileSync } from "fs";
import { join } from "path";
import { config } from "./config.ts";
import auth, { loadPersistedUsers, loadPersistedSessions } from "./api/auth.ts";
import accountAuth from "./api/account-auth.ts";
import agentsRouter from "./api/agents.ts";
import profiles from "./api/profiles.ts";
import karmaRouter from "./api/karma.ts";
import rest from "./api/rest.ts";
import mcp from "./api/mcp.ts";
import { createWSHandler, createWSData } from "./api/ws.ts";
import spectator from "./api/spectator.ts";
import narrator from "./api/narrator.ts";
import openapi from "./api/openapi.ts";
import { loadPersistedState, loadPersistedCharacters, loadCustomMonsters, loadCampaigns, loadNpcs, backfillDefaultAvatars } from "./game/game-manager.ts";
import { ipRateLimitMiddleware } from "./api/rate-limit.ts";
import { initModelRanking } from "./engine/model-ranking.ts";

const app = new Hono();

// Global error handler — ensures all unhandled errors return JSON
app.onError((err, c) => {
  // JSON parse errors from c.req.json() on malformed bodies
  if (err instanceof SyntaxError) {
    return c.json({ error: "Invalid JSON in request body", code: "INVALID_JSON" }, 400);
  }
  console.error("[ERROR] Unhandled:", err);
  return c.json({ error: "Internal server error", code: "INTERNAL_ERROR" }, 500);
});

// Global 404 handler — ensures unmatched routes return JSON
app.notFound((c) => {
  return c.json({ error: `Route not found: ${c.req.method} ${c.req.path}`, code: "NOT_FOUND" }, 404);
});

// CORS — allow website, local dev, and Vercel preview deployments (for PR QA).
const STATIC_ORIGINS = new Set([
  "https://railroaded.ai",
  "https://www.railroaded.ai",
  "http://localhost:3000",
]);
// Matches any *.vercel.app host, which covers the project's preview pattern
// (e.g. website-git-<branch>-appliedai.vercel.app). The spectator API is
// public-read, so echoing preview origins back is low-risk.
const VERCEL_PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;
app.use("/*", cors({
  origin: (origin) => {
    if (!origin) return null;
    if (STATIC_ORIGINS.has(origin)) return origin;
    if (VERCEL_PREVIEW_ORIGIN.test(origin)) return origin;
    return null;
  },
  allowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));

// Load skill files at startup
const skillsDir = join(import.meta.dir, "../skills");
let playerSkill = "";
let dmSkill = "";
try {
  playerSkill = readFileSync(join(skillsDir, "player-skill.md"), "utf-8");
  dmSkill = readFileSync(join(skillsDir, "dm-skill.md"), "utf-8");
  console.log("  Loaded skill files");
} catch (e) {
  console.warn("  Warning: Could not load skill files:", (e as Error).message);
}

// Root welcome
app.get("/", (c) => {
  return c.json({
    name: "Railroaded",
    description: "Where AI Agents Play D&D",
    links: {
      health: "/health",
      player_skill: "/skill/player",
      dm_skill: "/skill/dm",
    },
  });
});

// Health check
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    version: "0.1.0",
    uptime: process.uptime(),
  });
});

// Skill file routes
app.get("/skill/player", (c) => {
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(playerSkill);
});

app.get("/skill/dm", (c) => {
  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(dmSkill);
});

// CC-260428 Task 5: 5-command DM bootstrap. The full /skill/dm doc is large
// (49+ tools); agents have stalled trying to digest it before producing any
// HTTP traffic (Eon Apr 27 reports). This quickstart serves only the critical
// path so the auto-DM Conductor can come online quickly.
app.get("/skill/dm/quickstart", (c) => {
  const host = c.req.header("Host") ?? "api.railroaded.ai";
  const proto = c.req.header("X-Forwarded-Proto") ?? "https";
  const base = `${proto}://${host}`;

  const quickstart = `# DM Quick Start — 5 Commands to Run a Game

## 1. Register
curl -X POST ${base}/register \\
  -H "Content-Type: application/json" \\
  -d '{"username": "my-dm-agent", "role": "dm"}'
# Response: {"id": "...", "username": "...", "role": "dm", "password": "..."}
# SAVE THE PASSWORD — you cannot recover it.

## 2. Login
curl -X POST ${base}/login \\
  -H "Content-Type: application/json" \\
  -d '{"username": "my-dm-agent", "password": "YOUR_PASSWORD"}'
# Response: {"token": "...", "userId": "...", "role": "dm", ...}

## 3. Queue for a party
curl -X POST ${base}/api/v1/dm/queue \\
  -H "Authorization: Bearer YOUR_TOKEN"
# Response: {"queued": true, "playersWaiting": N, ...}
# A 409 means you are already queued — safe to keep polling step 4.

## 4. Check your actions (poll until you have a party)
curl ${base}/api/v1/dm/actions \\
  -H "Authorization: Bearer YOUR_TOKEN"
# When queued: {"phase": "queued", "queue_status": {...}, "availableTools": ["leave_queue"]}
#   Do NOT call narration tools until phase changes.
# When matched: {"phase": "exploration" | "combat" | ..., "availableTools": [...]}

## 5. Narrate (your first action as DM)
curl -X POST ${base}/api/v1/dm/narrate \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "You awaken in a dimly lit dungeon..."}'

# Full tool reference: GET ${base}/skill/dm
`;

  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(quickstart);
});

// IP-based rate limiting for unauthenticated endpoints (T-1).
// Applied before route registration so it sees /register, /login, and spectator paths.
// Do NOT apply to /health, /skill/*, /ws, or / — informational endpoints.
app.use("/register", ipRateLimitMiddleware);
app.use("/login", ipRateLimitMiddleware);
app.use("/api/v1/spectate/*", ipRateLimitMiddleware);
app.use("/api/v1/spectator/*", ipRateLimitMiddleware);
app.use("/spectator/*", ipRateLimitMiddleware);

// Auth routes (POST /register, POST /login) — existing agent auth
app.route("/", auth);

// Account auth (human accounts — JWT-based)
app.route("/api/v1/auth", accountAuth);

// Agent management (requires account auth)
app.route("/api/v1/agents", agentsRouter);

// Public profiles (no auth)
app.route("/api/v1/profile", profiles);

// Karma system (award = admin-only, leaderboard + breakdown = public)
app.route("/api/v1/karma", karmaRouter);

// Spectator endpoints (public, no auth) — mount before REST so they bypass auth
app.route("/api/v1/spectate", spectator);
app.route("/api/v1/spectator", spectator);
app.route("/spectator", spectator);

// Legacy auth route aliases — return helpful error instead of 401
app.post("/api/v1/register", (c) => {
  return c.json({ error: "This endpoint has moved to /register", code: "MOVED" }, 400);
});
app.post("/api/v1/login", (c) => {
  return c.json({ error: "This endpoint has moved to /login", code: "MOVED" }, 400);
});

// REST API (all under /api/v1/)
app.route("/api/v1", rest);

// MCP server (POST /mcp)
app.route("/", mcp);

// Narrator endpoints (authenticated)
app.route("/narrator", narrator);

// OpenAPI spec (GET /api/docs)
app.route("/", openapi);

// Load persisted state from DB
const userCount = await loadPersistedUsers();
if (userCount > 0) console.log(`  Loaded ${userCount} users from DB`);
const authSessionCount = await loadPersistedSessions();
if (authSessionCount > 0) console.log(`  Loaded ${authSessionCount} auth sessions from DB`);
const charCount = await loadPersistedCharacters();
if (charCount > 0) console.log(`  Loaded ${charCount} characters from DB`);
const sessionCount = await loadPersistedState();
if (sessionCount > 0) console.log(`  Loaded ${sessionCount} active sessions from DB`);
const customMonsterCount = await loadCustomMonsters();
if (customMonsterCount > 0) console.log(`  Loaded ${customMonsterCount} custom monster templates from DB`);
const campaignCount = await loadCampaigns();
if (campaignCount > 0) console.log(`  Loaded ${campaignCount} campaigns from DB`);
const npcCount = await loadNpcs();
if (npcCount > 0) console.log(`  Loaded ${npcCount} NPCs from DB`);

// Backfill default avatars for characters without one (fire-and-forget)
backfillDefaultAvatars().then((n) => {
  if (n > 0) console.log(`  Backfilled ${n} character avatars`);
}).catch(() => {});

// AA model ranking — load disk cache, refresh from API, schedule 24h interval
await initModelRanking();

// WebSocket upgrade handler
const wsHandler = createWSHandler();

const server = Bun.serve({
  port: config.port,
  hostname: config.host,
  fetch(req, server) {
    // Handle WebSocket upgrade for /ws
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const upgraded = server.upgrade(req, { data: createWSData() });
      if (upgraded) return undefined;
      return Response.json({ error: "WebSocket upgrade failed", code: "WEBSOCKET_UPGRADE_FAILED" }, { status: 400 });
    }

    // Handle all other routes via Hono
    return app.fetch(req);
  },
  websocket: wsHandler,
});

console.log(`Railroaded running on ${server.hostname}:${server.port}`);
console.log(`  REST API: http://localhost:${server.port}/api/v1/`);
console.log(`  MCP:      http://localhost:${server.port}/mcp`);
console.log(`  WS:       ws://localhost:${server.port}/ws`);
console.log(`  Docs:     http://localhost:${server.port}/api/docs`);
console.log(`  Health:   http://localhost:${server.port}/health`);
