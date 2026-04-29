/**
 * Tick-based rate limiting.
 *
 * One action per tick. Tick length varies by phase:
 * - Exploration: 60 seconds
 * - Combat: 30 seconds
 * - Roleplay: no hard limit
 * - Rest: no hard limit
 *
 * Returns 429 with Retry-After header if too fast.
 */

import { createMiddleware } from "hono/factory";
import type { SessionPhase } from "../types.ts";

// Track last action time per user
const lastActionByUser = new Map<string, number>();

// Track current phase per party
const partyPhase = new Map<string, SessionPhase>();

/**
 * Set the current phase for a party. Called by session management.
 */
export function setPartyPhase(partyId: string, phase: SessionPhase): void {
  partyPhase.set(partyId, phase);
}

/**
 * Get the tick duration in seconds for a phase.
 */
function getTickSeconds(phase: SessionPhase): number {
  switch (phase) {
    case "combat":
      return 30;
    case "exploration":
      return 60;
    case "roleplay":
    case "rest":
      return 0; // no rate limit
  }
}

/**
 * Check if a user can act. Returns seconds to wait, or 0 if they can act now.
 */
export function checkRateLimit(
  userId: string,
  partyId: string | null
): number {
  const phase = partyId ? partyPhase.get(partyId) : null;
  const tickSeconds = phase ? getTickSeconds(phase) : 0;

  if (tickSeconds === 0) return 0;

  const now = Date.now();
  const lastAction = lastActionByUser.get(userId);

  if (!lastAction) return 0;

  const elapsed = (now - lastAction) / 1000;
  if (elapsed >= tickSeconds) return 0;

  return Math.ceil(tickSeconds - elapsed);
}

/**
 * Record that a user took an action.
 */
export function recordUserAction(userId: string): void {
  lastActionByUser.set(userId, Date.now());
}

/**
 * Hono middleware for rate limiting.
 * Expects user to be in context (run after auth middleware).
 */
export const rateLimitMiddleware = createMiddleware(async (c, next) => {
  const user = c.get("user") as { userId: string } | undefined;
  if (!user) {
    // No user in context — skip rate limiting (auth middleware will catch this)
    await next();
    return;
  }

  // For now, we don't track party per request — rate limit is global per user
  const waitSeconds = checkRateLimit(user.userId, null);

  if (waitSeconds > 0) {
    c.header("Retry-After", String(waitSeconds));
    return c.json(
      {
        error: "Rate limited — one action per tick",
        retryAfter: waitSeconds,
      },
      429
    );
  }

  recordUserAction(user.userId);
  await next();
});

/**
 * Clear rate limit tracking (for testing).
 */
export function clearRateLimits(): void {
  lastActionByUser.clear();
  partyPhase.clear();
}

/**
 * IP-based rate limiting for unauthenticated endpoints (register, login, spectator).
 * Simpler than the tick-based user limiter — flat requests-per-window.
 * Default: 30 requests per 60 seconds per IP.
 */
const ipRequestLog = new Map<string, { count: number; windowStart: number }>();
const IP_RATE_WINDOW_MS = 60_000;
const IP_RATE_MAX_REQUESTS = parseInt(process.env.RAILROADED_IP_RATE_LIMIT ?? "30", 10);

export const ipRateLimitMiddleware = createMiddleware(async (c, next) => {
  const ip = c.req.header("X-Forwarded-For")?.split(",")[0]?.trim()
    ?? c.req.header("X-Real-IP")
    ?? "unknown";

  const now = Date.now();
  const entry = ipRequestLog.get(ip);

  if (!entry || (now - entry.windowStart) > IP_RATE_WINDOW_MS) {
    ipRequestLog.set(ip, { count: 1, windowStart: now });
    await next();
    return;
  }

  entry.count++;
  if (entry.count > IP_RATE_MAX_REQUESTS) {
    const retryAfter = Math.ceil((IP_RATE_WINDOW_MS - (now - entry.windowStart)) / 1000);
    c.header("Retry-After", String(retryAfter));
    return c.json({
      error: "Rate limited — too many requests",
      retryAfter,
      reason_code: "RATE_LIMITED",
    }, 429);
  }

  await next();
});

/** Clear IP rate limit tracking (for testing). */
export function clearIpRateLimits(): void {
  ipRequestLog.clear();
}
