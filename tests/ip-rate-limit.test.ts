/**
 * T-1: IP-based rate limiting on unauthenticated endpoints.
 * Default: 30 requests per 60s per IP. Different IPs are independent.
 */
import { describe, test, expect, beforeEach } from "bun:test";
import { Hono } from "hono";
import { ipRateLimitMiddleware, clearIpRateLimits } from "../src/api/rate-limit.ts";

function buildApp(): Hono {
  const app = new Hono();
  app.use("/register", ipRateLimitMiddleware);
  app.post("/register", (c) => c.json({ ok: true }));
  return app;
}

describe("IP-based rate limiting (T-1)", () => {
  beforeEach(() => {
    clearIpRateLimits();
  });

  test("31st request from same IP returns 429 with Retry-After", async () => {
    const app = buildApp();
    const ip = "203.0.113.42";

    for (let i = 0; i < 30; i++) {
      const res = await app.request("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
    }

    const res = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    const body = await res.json() as { reason_code: string; retryAfter: number };
    expect(body.reason_code).toBe("RATE_LIMITED");
    expect(body.retryAfter).toBeGreaterThan(0);
  });

  test("different IPs are independent", async () => {
    const app = buildApp();
    const ipA = "203.0.113.10";
    const ipB = "203.0.113.20";

    for (let i = 0; i < 30; i++) {
      const res = await app.request("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": ipA },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
    }

    const limitedA = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": ipA },
      body: JSON.stringify({}),
    });
    expect(limitedA.status).toBe(429);

    const okB = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": ipB },
      body: JSON.stringify({}),
    });
    expect(okB.status).toBe(200);
  });

  test("X-Forwarded-For comma-separated list uses first IP", async () => {
    const app = buildApp();

    for (let i = 0; i < 30; i++) {
      const res = await app.request("/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": "203.0.113.55, 10.0.0.1, 10.0.0.2",
        },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
    }

    const limited = await app.request("/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Forwarded-For": "203.0.113.55, 10.0.0.1, 10.0.0.2",
      },
      body: JSON.stringify({}),
    });
    expect(limited.status).toBe(429);
  });

  test("X-Real-IP fallback when X-Forwarded-For absent", async () => {
    const app = buildApp();
    const ip = "203.0.113.99";

    for (let i = 0; i < 30; i++) {
      const res = await app.request("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Real-IP": ip },
        body: JSON.stringify({}),
      });
      expect(res.status).toBe(200);
    }

    const limited = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Real-IP": ip },
      body: JSON.stringify({}),
    });
    expect(limited.status).toBe(429);
  });

  test("clearIpRateLimits resets counters", async () => {
    const app = buildApp();
    const ip = "203.0.113.77";

    for (let i = 0; i < 30; i++) {
      await app.request("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
        body: JSON.stringify({}),
      });
    }

    const limited = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
      body: JSON.stringify({}),
    });
    expect(limited.status).toBe(429);

    clearIpRateLimits();

    const ok = await app.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Forwarded-For": ip },
      body: JSON.stringify({}),
    });
    expect(ok.status).toBe(200);
  });
});
