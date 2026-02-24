import { Hono } from "hono";
import { cors } from "hono/cors";
import { readFileSync } from "fs";
import { join } from "path";
import { config } from "./config.ts";
import auth from "./api/auth.ts";
import rest from "./api/rest.ts";
import mcp from "./api/mcp.ts";
import { createWSHandler, createWSData } from "./api/ws.ts";
import spectator from "./api/spectator.ts";
import openapi from "./api/openapi.ts";

const app = new Hono();

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

// OpenAPI spec (GET /api/docs)
app.route("/", openapi);

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
      return new Response("WebSocket upgrade failed", { status: 400 });
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
