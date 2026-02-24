import { Hono } from "hono";
import { eq, and, gt } from "drizzle-orm";
import { db } from "../db/connection.ts";
import { users, sessions } from "../db/schema.ts";
import type { UserRole } from "../types.ts";

const auth = new Hono();

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

// POST /register — create a new user, return generated password
auth.post("/register", async (c) => {
  const body = await c.req.json<{ username?: string; role?: string }>();

  if (!body.username || typeof body.username !== "string") {
    return c.json({ error: "username is required" }, 400);
  }

  const role = body.role as UserRole | undefined;
  if (!role || (role !== "player" && role !== "dm")) {
    return c.json({ error: "role must be 'player' or 'dm'" }, 400);
  }

  // Check if username already exists
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, body.username))
    .limit(1);

  if (existing.length > 0) {
    return c.json({ error: "username already taken" }, 409);
  }

  const password = generatePassword();
  const passwordHash = await hashPassword(password);

  const [user] = await db
    .insert(users)
    .values({
      username: body.username,
      passwordHash,
      role,
    })
    .returning({ id: users.id, username: users.username, role: users.role });

  return c.json(
    {
      id: user!.id,
      username: user!.username,
      role: user!.role,
      password,
    },
    201
  );
});

// POST /login — authenticate and return session token
auth.post("/login", async (c) => {
  const body = await c.req.json<{ username?: string; password?: string }>();

  if (!body.username || !body.password) {
    return c.json({ error: "username and password are required" }, 400);
  }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.username, body.username))
    .limit(1);

  if (!user) {
    return c.json({ error: "invalid credentials" }, 401);
  }

  const valid = await verifyPassword(body.password, user.passwordHash);
  if (!valid) {
    return c.json({ error: "invalid credentials" }, 401);
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.insert(sessions).values({
    userId: user.id,
    token,
    expiresAt,
  });

  return c.json({
    token,
    expiresAt: expiresAt.toISOString(),
    userId: user.id,
    role: user.role,
  });
});

export default auth;

// Middleware: extract authenticated user from Bearer token
export async function getAuthUser(
  token: string | undefined
): Promise<{
  userId: string;
  username: string;
  role: "player" | "dm";
} | null> {
  if (!token) return null;

  // Strip "Bearer " prefix
  const raw = token.startsWith("Bearer ") ? token.slice(7) : token;

  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.token, raw), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!session) return null;

  // Renew the session on activity
  const newExpiry = new Date(Date.now() + SESSION_DURATION_MS);
  await db
    .update(sessions)
    .set({ expiresAt: newExpiry })
    .where(eq(sessions.id, session.id));

  const [user] = await db
    .select({ id: users.id, username: users.username, role: users.role })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);

  if (!user) return null;

  return { userId: user.id, username: user.username, role: user.role };
}
