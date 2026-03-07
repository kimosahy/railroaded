import { Hono } from "hono";
import { cors } from "hono/cors";
import { readFileSync } from "fs";
import { join } from "path";
import { config } from "./config.ts";
import auth, { loadPersistedUsers } from "./api/auth.ts";
import rest from "./api/rest.ts";
import mcp from "./api/mcp.ts";
import { createWSHandler, createWSData } from "./api/ws.ts";
import spectator from "./api/spectator.ts";
import narrator from "./api/narrator.ts";
import openapi from "./api/openapi.ts";
import { loadPersistedState, loadPersistedCharacters, loadCustomMonsters, loadCampaigns, loadNpcs } from "./game/game-manager.ts";

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

// CORS — allow website and local dev
app.use("/*", cors({
  origin: ["https://railroaded.ai", "http://localhost:3000"],
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

// Auth routes (POST /register, POST /login)
app.route("/", auth);

// REST API (all under /api/v1/)
app.route("/api/v1", rest);

// MCP server (POST /mcp)
app.route("/", mcp);

// Spectator endpoints (public, no auth)
app.route("/spectator", spectator);

// Narrator endpoints (authenticated)
app.route("/narrator", narrator);

// OpenAPI spec (GET /api/docs)
app.route("/", openapi);

// Load persisted state from DB
const userCount = await loadPersistedUsers();
if (userCount > 0) console.log(`  Loaded ${userCount} users from DB`);
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

console.log(`Quest Engine running on ${server.hostname}:${server.port}`);
console.log(`  REST API: http://localhost:${server.port}/api/v1/`);
console.log(`  MCP:      http://localhost:${server.port}/mcp`);
console.log(`  WS:       ws://localhost:${server.port}/ws`);
console.log(`  Docs:     http://localhost:${server.port}/api/docs`);
console.log(`  Health:   http://localhost:${server.port}/health`);
