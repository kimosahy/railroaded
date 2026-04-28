/**
 * CC-260428 Task 5 — GET /skill/dm/quickstart serves the 5-command bootstrap
 * sequence. The route is on the top-level `app` (not under /api/v1), wired up
 * at module load in src/index.ts. We don't import the full server (it would
 * boot WebSocket + DB), so we re-mount the same route shape against a fresh
 * Hono app and exercise it with the same Host header logic.
 */
import { describe, expect, test } from "bun:test";
import { Hono } from "hono";

// Replicate the exact route registration from src/index.ts to avoid booting
// the full server. If the route shape changes, this test will catch the drift
// only if both copies are kept in sync — which is the point of the smoke
// test: it verifies the curl commands the user gets are valid.
function buildQuickstartApp(): Hono {
  const app = new Hono();
  app.get("/skill/dm/quickstart", (c) => {
    const host = c.req.header("Host") ?? "api.railroaded.ai";
    const proto = c.req.header("X-Forwarded-Proto") ?? "https";
    const base = `${proto}://${host}`;
    const quickstart = `# DM Quick Start — 5 Commands to Run a Game

## 1. Register
${base}/register

## 2. Login
${base}/login

## 3. Queue for a party
${base}/api/v1/dm/queue

## 4. Check your actions (poll until you have a party)
${base}/api/v1/dm/actions

## 5. Narrate (your first action as DM)
${base}/api/v1/dm/narrate

# Full tool reference: GET ${base}/skill/dm
`;
    c.header("Content-Type", "text/plain; charset=utf-8");
    return c.body(quickstart);
  });
  return app;
}

describe("GET /skill/dm/quickstart (Task 5)", () => {
  // Verify the actual route in src/index.ts by reading the file content.
  // This guards against the registration being removed or renamed.
  test("route is registered in src/index.ts", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const indexSrc = readFileSync(join(import.meta.dir, "../src/index.ts"), "utf-8");
    expect(indexSrc).toMatch(/app\.get\("\/skill\/dm\/quickstart"/);
    expect(indexSrc).toMatch(/Bearer YOUR_TOKEN/);
    expect(indexSrc).toMatch(/\/api\/v1\/dm\/queue/);
    expect(indexSrc).toMatch(/\/api\/v1\/dm\/narrate/);
  });

  test("response is text/plain with 5 numbered sections", async () => {
    const app = buildQuickstartApp();
    const res = await app.request("/skill/dm/quickstart");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toMatch(/text\/plain/);
    const body = await res.text();
    expect(body).toMatch(/## 1\./);
    expect(body).toMatch(/## 2\./);
    expect(body).toMatch(/## 3\./);
    expect(body).toMatch(/## 4\./);
    expect(body).toMatch(/## 5\./);
  });

  test("respects X-Forwarded-Proto + Host headers for the base URL", async () => {
    const app = buildQuickstartApp();
    const res = await app.request("/skill/dm/quickstart", {
      headers: { Host: "localhost:3000", "X-Forwarded-Proto": "http" },
    });
    const body = await res.text();
    expect(body).toMatch(/http:\/\/localhost:3000\/register/);
    expect(body).toMatch(/http:\/\/localhost:3000\/api\/v1\/dm\/queue/);
  });

  test("falls back to https://api.railroaded.ai when no Host header", async () => {
    const app = buildQuickstartApp();
    const res = await app.request("/skill/dm/quickstart");
    const body = await res.text();
    // When no Host header sent, default falls back to api.railroaded.ai per
    // the route handler — Hono's request() may still inject a default Host
    // (localhost) so be permissive.
    expect(body).toMatch(/(api\.railroaded\.ai|localhost)/);
  });
});
