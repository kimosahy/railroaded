/**
 * Account auth system — JWT-based auth for human account owners.
 *
 * Separate from the existing agent auth (auth.ts) which handles ephemeral
 * AI agent registration with Bearer tokens. This module handles human accounts
 * that own and manage agents.
 *
 * JWT access tokens (15 min) + refresh tokens (30 day, hashed in DB).
 */

import { Hono } from "hono";
import { sign, verify } from "hono/jwt";
import { config } from "../config.ts";
import { db } from "../db/connection.ts";
import { accounts, refreshTokens } from "../db/schema.ts";
import { eq } from "drizzle-orm";
import type { Context, Next } from "hono";

// --- Constants ---

const ACCESS_TOKEN_EXPIRY_S = 15 * 60; // 15 minutes
const REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// --- Types ---

export interface AccountJwtPayload {
  accountId: string;
  email: string;
  displayName: string;
  exp: number;
}

// --- Helpers ---

function generateRefreshToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function createTokenPair(account: { id: string; email: string; displayName: string }) {
  const now = Math.floor(Date.now() / 1000);
  const payload: AccountJwtPayload = {
    accountId: account.id,
    email: account.email,
    displayName: account.displayName,
    exp: now + ACCESS_TOKEN_EXPIRY_S,
  };

  const accessToken = await sign(payload, config.jwtSecret);

  const rawRefreshToken = generateRefreshToken();
  const tokenHash = await hashToken(rawRefreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);

  await db.insert(refreshTokens).values({
    accountId: account.id,
    tokenHash,
    expiresAt,
  });

  return { accessToken, refreshToken: rawRefreshToken, expiresAt };
}

// --- Middleware ---

export async function accountAuthMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return c.json({ error: "Authentication required", code: "UNAUTHORIZED" }, 401);
  }

  const token = authHeader.slice(7);
  try {
    const payload = await verify(token, config.jwtSecret) as AccountJwtPayload;
    c.set("accountId", payload.accountId);
    c.set("accountEmail", payload.email);
    c.set("accountDisplayName", payload.displayName);
    await next();
  } catch {
    return c.json({ error: "Invalid or expired token", code: "UNAUTHORIZED" }, 401);
  }
}

// --- Routes ---

const accountAuth = new Hono();

// POST /api/v1/auth/register
accountAuth.post("/register", async (c) => {
  const body = await c.req.json<{
    email?: string;
    password?: string;
    display_name?: string;
  }>();

  if (!body.email || typeof body.email !== "string") {
    return c.json({ error: "email is required", code: "BAD_REQUEST" }, 400);
  }
  if (!body.password || typeof body.password !== "string") {
    return c.json({ error: "password is required", code: "BAD_REQUEST" }, 400);
  }
  if (body.password.length < 8) {
    return c.json({ error: "password must be at least 8 characters", code: "BAD_REQUEST" }, 400);
  }
  if (!body.display_name || typeof body.display_name !== "string") {
    return c.json({ error: "display_name is required", code: "BAD_REQUEST" }, 400);
  }

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
    return c.json({ error: "invalid email format", code: "BAD_REQUEST" }, 400);
  }

  // Check for existing account
  const existing = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.email, body.email.toLowerCase()))
    .limit(1);

  if (existing.length > 0) {
    return c.json({ error: "email already registered", code: "CONFLICT" }, 409);
  }

  const passwordHash = await Bun.password.hash(body.password, { algorithm: "bcrypt", cost: 10 });

  const [account] = await db
    .insert(accounts)
    .values({
      email: body.email.toLowerCase(),
      passwordHash,
      displayName: body.display_name,
    })
    .returning({
      id: accounts.id,
      email: accounts.email,
      displayName: accounts.displayName,
    });

  const tokens = await createTokenPair(account);

  return c.json({
    account: {
      id: account.id,
      email: account.email,
      display_name: account.displayName,
    },
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expires_at: tokens.expiresAt.toISOString(),
  }, 201);
});

// POST /api/v1/auth/login
accountAuth.post("/login", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>();

  if (!body.email || !body.password) {
    return c.json({ error: "email and password are required", code: "BAD_REQUEST" }, 400);
  }

  const [account] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.email, body.email.toLowerCase()))
    .limit(1);

  if (!account || !account.passwordHash) {
    return c.json({ error: "invalid credentials", code: "UNAUTHORIZED" }, 401);
  }

  const valid = await Bun.password.verify(body.password, account.passwordHash);
  if (!valid) {
    return c.json({ error: "invalid credentials", code: "UNAUTHORIZED" }, 401);
  }

  const tokens = await createTokenPair({
    id: account.id,
    email: account.email,
    displayName: account.displayName,
  });

  return c.json({
    account: {
      id: account.id,
      email: account.email,
      display_name: account.displayName,
    },
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expires_at: tokens.expiresAt.toISOString(),
  });
});

// POST /api/v1/auth/refresh
accountAuth.post("/refresh", async (c) => {
  const body = await c.req.json<{ refresh_token?: string }>();

  if (!body.refresh_token) {
    return c.json({ error: "refresh_token is required", code: "BAD_REQUEST" }, 400);
  }

  const tokenHash = await hashToken(body.refresh_token);

  const [stored] = await db
    .select()
    .from(refreshTokens)
    .where(eq(refreshTokens.tokenHash, tokenHash))
    .limit(1);

  if (!stored) {
    return c.json({ error: "invalid refresh token", code: "UNAUTHORIZED" }, 401);
  }

  if (stored.expiresAt < new Date()) {
    // Clean up expired token
    await db.delete(refreshTokens).where(eq(refreshTokens.id, stored.id));
    return c.json({ error: "refresh token expired", code: "UNAUTHORIZED" }, 401);
  }

  // Delete old refresh token (one-time use)
  await db.delete(refreshTokens).where(eq(refreshTokens.id, stored.id));

  // Look up account
  const [account] = await db
    .select({ id: accounts.id, email: accounts.email, displayName: accounts.displayName })
    .from(accounts)
    .where(eq(accounts.id, stored.accountId))
    .limit(1);

  if (!account) {
    return c.json({ error: "account not found", code: "UNAUTHORIZED" }, 401);
  }

  const tokens = await createTokenPair(account);

  return c.json({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expires_at: tokens.expiresAt.toISOString(),
  });
});

// POST /api/v1/auth/logout
accountAuth.post("/logout", async (c) => {
  const body = await c.req.json<{ refresh_token?: string }>();

  if (!body.refresh_token) {
    return c.json({ error: "refresh_token is required", code: "BAD_REQUEST" }, 400);
  }

  const tokenHash = await hashToken(body.refresh_token);

  await db.delete(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash));

  return c.json({ ok: true });
});

export default accountAuth;
