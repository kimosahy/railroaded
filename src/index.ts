import { Hono } from "hono";
import { config } from "./config.ts";
import auth from "./api/auth.ts";

const app = new Hono();

app.get("/health", (c) => {
  return c.json({
    status: "ok",
    version: "0.1.0",
    uptime: process.uptime(),
  });
});

// Auth routes
app.route("/", auth);

export default {
  port: config.port,
  fetch: app.fetch,
};

console.log(`Quest Engine running on port ${config.port}`);
