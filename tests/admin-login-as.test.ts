import { describe, test, expect, beforeAll } from "bun:test";

const BASE = "http://localhost:0"; // overridden by app
let app: any;

// Import and start server inline for testing
import authRoutes from "../src/api/auth.ts";
import { Hono } from "hono";

const testApp = new Hono();
testApp.route("/", authRoutes);

describe("POST /admin/login-as", () => {
  const originalEnv = process.env.ADMIN_SECRET;

  test("returns 503 when ADMIN_SECRET is not configured", async () => {
    delete process.env.ADMIN_SECRET;
    const res = await testApp.request("/admin/login-as", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer test-secret" },
      body: JSON.stringify({ username: "test-user" }),
    });
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("Admin endpoint not configured");
  });

  test("returns 401 without correct secret", async () => {
    process.env.ADMIN_SECRET = "correct-secret";
    const res = await testApp.request("/admin/login-as", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer wrong-secret" },
      body: JSON.stringify({ username: "test-user" }),
    });
    expect(res.status).toBe(401);
  });

  test("returns 401 without Authorization header", async () => {
    process.env.ADMIN_SECRET = "correct-secret";
    const res = await testApp.request("/admin/login-as", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "test-user" }),
    });
    expect(res.status).toBe(401);
  });

  test("returns 400 when username is missing", async () => {
    process.env.ADMIN_SECRET = "correct-secret";
    const res = await testApp.request("/admin/login-as", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer correct-secret" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
  });

  test("auto-registers new user and returns token", async () => {
    process.env.ADMIN_SECRET = "correct-secret";
    const res = await testApp.request("/admin/login-as", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer correct-secret" },
      body: JSON.stringify({ username: "scheduler-test-user", role: "player" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeTruthy();
    expect(body.userId).toBeTruthy();
    expect(body.role).toBe("player");
    expect(body.expiresAt).toBeTruthy();
  });

  test("returns token for existing user without re-registering", async () => {
    process.env.ADMIN_SECRET = "correct-secret";
    // First, register a user normally
    const regRes = await testApp.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "existing-admin-test", role: "dm" }),
    });
    expect(regRes.status).toBe(201);

    // Now login-as that user
    const res = await testApp.request("/admin/login-as", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer correct-secret" },
      body: JSON.stringify({ username: "existing-admin-test" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.token).toBeTruthy();
    expect(body.role).toBe("dm");
  });

  test("defaults role to player when not specified", async () => {
    process.env.ADMIN_SECRET = "correct-secret";
    const res = await testApp.request("/admin/login-as", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer correct-secret" },
      body: JSON.stringify({ username: "default-role-test" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.role).toBe("player");
  });

  // Cleanup
  test("cleanup", () => {
    if (originalEnv) {
      process.env.ADMIN_SECRET = originalEnv;
    } else {
      delete process.env.ADMIN_SECRET;
    }
  });
});
