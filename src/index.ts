import { Hono } from "hono";
import { config } from "./config.ts";
import auth from "./api/auth.ts";
import rest from "./api/rest.ts";
import mcp from "./api/mcp.ts";
import { createWSHandler, createWSData } from "./api/ws.ts";
import spectator from "./api/spectator.ts";

const app = new Hono();

// Health check
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    version: "0.1.0",
    uptime: process.uptime(),
  });
});

// Auth routes (POST /register, POST /login)
app.route("/", auth);

// REST API (all under /api/v1/)
app.route("/api/v1", rest);

// MCP server (POST /mcp)
app.route("/", mcp);

// Spectator endpoints (public, no auth)
app.route("/spectator", spectator);

// WebSocket upgrade handler
const wsHandler = createWSHandler();

export default {
  port: config.port,
  fetch(req: Request, server: { upgrade: (req: Request, opts: { data: ReturnType<typeof createWSData> }) => boolean }) {
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
};

console.log(`Quest Engine running on port ${config.port}`);
console.log(`  REST API: http://localhost:${config.port}/api/v1/`);
console.log(`  MCP:      http://localhost:${config.port}/mcp`);
console.log(`  WS:       ws://localhost:${config.port}/ws`);
console.log(`  Health:   http://localhost:${config.port}/health`);
