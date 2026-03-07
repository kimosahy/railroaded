/**
 * Auth system — in-memory user and session storage with DB persistence.
 *
 * Users and sessions live in Maps for fast runtime access.
 * User rows are also persisted to PostgreSQL for FK chains.
 */

import { Hono } from "hono";
import type { UserRole } from "../types.ts";
import { db } from "../db/connection.ts";
import { users as usersTable } from "../db/schema.ts";

// --- In-memory stores ---

interface StoredUser {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  dbUserId: string | null; // UUID from users table
}

interface StoredSession {
  userId: string;
  expiresAt: Date;
}

const usersByUsername = new Map<string, StoredUser>();
const usersById = new Map<string, StoredUser>();
const sessionsByToken = new Map<string, StoredSession>();

let userIdCounter = 1;

// --- Helpers ---

function generateToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function generatePassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password, { algorithm: "bcrypt", cost: 10 });
}

async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}

const SESSION_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// --- Routes ---

const auth = new Hono();

// POST /register — create a new user, return generated password
auth.post("/register", async (c) => {
  const body = await c.req.json<{ username?: string; role?: string }>();

  if (!body.username || typeof body.username !== "string") {
    return c.json({ error: "username is required", code: "BAD_REQUEST" }, 400);
  }

  const role = body.role as UserRole | undefined;
  if (!role || (role !== "player" && role !== "dm")) {
    return c.json({ error: "role must be 'player' or 'dm'", code: "BAD_REQUEST" }, 400);
  }

  if (usersByUsername.has(body.username)) {
    return c.json({ error: "username already taken", code: "CONFLICT" }, 409);
  }

  const password = generatePassword();
  const passwordHash = await hashPassword(password);
  const id = `user-${userIdCounter++}`;

  const user: StoredUser = { id, username: body.username, passwordHash, role, dbUserId: null };
  usersByUsername.set(body.username, user);
  usersById.set(id, user);

  // Persist to DB (fire-and-forget)
  db.insert(usersTable).values({
    username: body.username,
    passwordHash,
    role,
  }).returning({ id: usersTable.id })
    .then(([row]) => { user.dbUserId = row.id; })
    .catch((err) => console.error("[DB] Failed to persist user:", err));

  return c.json({ id, username: body.username, role, password }, 201);
});

// POST /login — authenticate and return session token
auth.post("/login", async (c) => {
  const body = await c.req.json<{ username?: string; password?: string }>();

  if (!body.username || !body.password) {
    return c.json({ error: "username and password are required", code: "BAD_REQUEST" }, 400);
  }

  const user = usersByUsername.get(body.username);
  if (!user) {
    return c.json({ error: "invalid credentials", code: "UNAUTHORIZED" }, 401);
  }

  const valid = await verifyPassword(body.password, user.passwordHash);
  if (!valid) {
    return c.json({ error: "invalid credentials", code: "UNAUTHORIZED" }, 401);
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  sessionsByToken.set(token, { userId: user.id, expiresAt });

  return c.json({
    token,
    expiresAt: expiresAt.toISOString(),
    userId: user.id,
    role: user.role,
  });
});

export default auth;

// Middleware: extract authenticated user from Bearer token
// --- DB lookup helpers ---

export function getDbUserId(userId: string): string | null {
  return usersById.get(userId)?.dbUserId ?? null;
}

export function findUserIdByDbId(dbUserId: string): string | null {
  for (const user of usersById.values()) {
    if (user.dbUserId === dbUserId) return user.id;
  }
  return null;
}

export async function getAuthUser(
  token: string | undefined
): Promise<{
  userId: string;
  username: string;
  role: "player" | "dm";
} | null> {
  if (!token) return null;

  const raw = token.startsWith("Bearer ") ? token.slice(7) : token;

  const session = sessionsByToken.get(raw);
  if (!session) return null;

  // Check expiry
  if (session.expiresAt < new Date()) {
    sessionsByToken.delete(raw);
    return null;
  }

  // Renew on activity
  session.expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  const user = usersById.get(session.userId);
  if (!user) return null;

  return { userId: user.id, username: user.username, role: user.role };
}

// --- Restart loading ---

export async function loadPersistedUsers(): Promise<number> {
  try {
    const rows = await db.select().from(usersTable);
    for (const row of rows) {
      const id = `user-${userIdCounter++}`;
      const user: StoredUser = {
        id,
        username: row.username,
        passwordHash: row.passwordHash,
        role: row.role,
        dbUserId: row.id,
      };
      usersByUsername.set(row.username, user);
      usersById.set(id, user);
    }
    return rows.length;
  } catch (err) {
    console.error("[DB] Failed to load persisted users:", err);
    return 0;
  }
}
