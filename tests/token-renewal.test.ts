/**
 * T-4: Token auto-renewal audit + permanent guard.
 * Spec: every authenticated request renews session.expiresAt.
 * Audit confirmed: getAuthUser (auth.ts:330) renews after expiry check
 * and before returning the user. This test guards against regressions.
 */
import { describe, test, expect, beforeAll, beforeEach, afterEach, jest } from "bun:test";
import auth, { getAuthUser, _clearSessionsForTest } from "../src/api/auth.ts";

describe("Token auto-renewal (T-4 permanent guard)", () => {
  let token: string;
  const username = `renewal-test-user-${Date.now()}`;
  const password = "renewal-test-password-XYZ";

  beforeAll(async () => {
    const regRes = await auth.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, role: "player" }),
    });
    expect(regRes.status).toBeLessThan(300);
    const reg = await regRes.json() as { password: string };

    const loginRes = await auth.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password: reg.password }),
    });
    expect(loginRes.status).toBe(200);
    const login = await loginRes.json() as { token: string };
    token = login.token;
  });

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  test("getAuthUser returns the user when called within session window", async () => {
    const user = await getAuthUser(`Bearer ${token}`);
    expect(user).not.toBeNull();
    expect(user?.username).toBe(username);
  });

  test("active use across 25-min intervals keeps session alive past base 30-min expiry", async () => {
    // Each call to getAuthUser must renew expiresAt to now + 30min.
    // If renewal doesn't fire, the session would expire 30 min after login regardless of activity.

    // T+25min: still within original 30-min window, getAuthUser succeeds and renews
    jest.setSystemTime(Date.now() + 25 * 60 * 1000);
    const u1 = await getAuthUser(`Bearer ${token}`);
    expect(u1).not.toBeNull();

    // T+50min: 25 min past first renewal. Without renewal at T+25min, this would
    // be 50 min past login → past the original 30-min expiry → returns null.
    jest.setSystemTime(Date.now() + 25 * 60 * 1000);
    const u2 = await getAuthUser(`Bearer ${token}`);
    expect(u2).not.toBeNull();
    expect(u2?.username).toBe(username);

    // T+75min: another 25min hop. Continues to work only if every prior call renewed.
    jest.setSystemTime(Date.now() + 25 * 60 * 1000);
    const u3 = await getAuthUser(`Bearer ${token}`);
    expect(u3).not.toBeNull();
  });

  test("31-min idle period without activity expires the session", async () => {
    // Register + login a fresh user so we have a clean session
    const idleUsername = `idle-test-user-${Date.now()}`;
    _clearSessionsForTest();

    const regRes = await auth.request("/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: idleUsername, role: "player" }),
    });
    const reg = await regRes.json() as { password: string };

    const loginRes = await auth.request("/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: idleUsername, password: reg.password }),
    });
    const login = await loginRes.json() as { token: string };

    // No intermediate getAuthUser calls — pure idle. Advance 31 min.
    jest.setSystemTime(Date.now() + 31 * 60 * 1000);
    const result = await getAuthUser(`Bearer ${login.token}`);
    expect(result).toBeNull();
  });
});
