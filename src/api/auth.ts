/**
 * Auth system — in-memory user and session storage with DB persistence.
 *
 * Users and sessions live in Maps for fast runtime access.
 * User rows are also persisted to PostgreSQL for FK chains.
 */

import { Hono } from "hono";
import type { UserRole } from "../types.ts";
import { eq, lt } from "drizzle-orm";
import { db } from "../db/connection.ts";
import { users as usersTable, sessions as sessionsTable } from "../db/schema.ts";

// --- In-memory stores ---

interface StoredUser {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  dbUserId: string | null; // UUID from users table
  modelProvider: string | null;
  modelName: string | null;
  dmEligible: boolean;
}

interface StoredSession {
  userId: string;
  expiresAt: Date;
}

const usersByUsername = new Map<string, StoredUser>();
const usersById = new Map<string, StoredUser>();
const sessionsByToken = new Map<string, StoredSession>();
const sessionRenewalTimestamps = new Map<string, number>();

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
  const id = `user-${userIdCounter++}`;

  // Reserve slot synchronously before async hash — prevents TOCTOU race
  // where concurrent registrations with the same username both pass the check above
  const user: StoredUser = { id, username: body.username, passwordHash: "", role, dbUserId: null, modelProvider: null, modelName: null, dmEligible: true };
  usersByUsername.set(body.username, user);
  usersById.set(id, user);

  let passwordHash: string;
  try {
    passwordHash = await hashPassword(password);
  } catch (err) {
    // Roll back reservation on hash failure
    usersByUsername.delete(body.username);
    usersById.delete(id);
    return c.json({ error: "registration failed", code: "INTERNAL_ERROR" }, 500);
  }
  user.passwordHash = passwordHash;

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

  // Auto-detect model identity from X-Model-Identity header or User-Agent
  const modelHeader = c.req.header("x-model-identity") ?? "";
  const userAgent = c.req.header("user-agent") ?? "";
  if (modelHeader) {
    const [provider, ...nameParts] = modelHeader.split("/");
    const name = nameParts.join("/") || modelHeader;
    persistModelIdentity(user.id, provider, name);
  } else if (!user.modelProvider) {
    const detected = detectModelFromUA(userAgent);
    if (detected) persistModelIdentity(user.id, detected.provider, detected.name);
  }

  // Persist session to DB (fire-and-forget)
  if (user.dbUserId) {
    db.insert(sessionsTable).values({
      userId: user.dbUserId,
      token,
      expiresAt,
    }).catch((err) => console.error("[DB] Failed to persist session:", err));
  }

  return c.json({
    token,
    expiresAt: expiresAt.toISOString(),
    userId: user.id,
    role: user.role,
  });
});

// POST /admin/login-as — scheduler/admin can log in as any user (auto-registers if needed)
auth.post("/admin/login-as", async (c) => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) return c.json({ error: "Admin endpoint not configured" }, 503);

  const authHeader = c.req.header("Authorization");
  if (!authHeader || authHeader !== `Bearer ${adminSecret}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json<{ username: string; role?: string }>();
  if (!body.username) return c.json({ error: "username is required" }, 400);

  let user = usersByUsername.get(body.username);
  if (!user) {
    const role = (body.role as UserRole) ?? "player";
    const password = generatePassword();
    const passwordHash = await hashPassword(password);
    const id = `user-${userIdCounter++}`;
    user = { id, username: body.username, passwordHash, role, dbUserId: null, modelProvider: null, modelName: null, dmEligible: true };
    usersByUsername.set(body.username, user);
    usersById.set(id, user);
    try {
      const [row] = await db.insert(usersTable).values({ username: body.username, passwordHash, role })
        .returning({ id: usersTable.id });
      user.dbUserId = row.id;
    } catch (err) { console.error("[DB] Failed to persist auto-registered user:", err); }
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  sessionsByToken.set(token, { userId: user.id, expiresAt });

  if (user.dbUserId) {
    db.insert(sessionsTable).values({ userId: user.dbUserId, token, expiresAt })
      .catch((err) => console.error("[DB] Failed to persist admin session:", err));
  }

  return c.json({ token, expiresAt: expiresAt.toISOString(), userId: user.id, role: user.role });
});

// POST /admin/register-model-identity — declare the AI model behind a user
auth.post("/admin/register-model-identity", async (c) => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) return c.json({ error: "Admin endpoint not configured" }, 503);

  const authHeader = c.req.header("Authorization");
  if (!authHeader || authHeader !== `Bearer ${adminSecret}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json<{ userId: string; modelProvider: string; modelName: string }>();
  if (!body.userId || !body.modelProvider || !body.modelName) {
    return c.json({ error: "userId, modelProvider, and modelName are required" }, 400);
  }

  const user = usersById.get(body.userId);
  if (!user) return c.json({ error: "User not found" }, 404);

  user.modelProvider = body.modelProvider;
  user.modelName = body.modelName;

  // Persist to DB
  if (user.dbUserId) {
    db.update(usersTable).set({ modelProvider: body.modelProvider, modelName: body.modelName })
      .where(eq(usersTable.id, user.dbUserId))
      .catch((err) => console.error("[DB] Failed to update model identity:", err));
  }

  return c.json({ ok: true, userId: body.userId, modelProvider: body.modelProvider, modelName: body.modelName });
});

function detectModelFromUA(ua: string): { provider: string; name: string } | null {
  const lower = ua.toLowerCase();
  if (lower.includes("claude")) return { provider: "anthropic", name: "claude" };
  if (lower.includes("gpt-4")) return { provider: "openai", name: "gpt-4" };
  if (lower.includes("gpt")) return { provider: "openai", name: "gpt" };
  if (lower.includes("gemini")) return { provider: "google", name: "gemini" };
  if (lower.includes("mistral")) return { provider: "mistral", name: "mistral" };
  if (lower.includes("llama")) return { provider: "meta", name: "llama" };
  if (lower.includes("deepseek")) return { provider: "deepseek", name: "deepseek" };
  return null;
}

export default auth;

// Middleware: extract authenticated user from Bearer token
// --- DB lookup helpers ---

export function getDbUserId(userId: string): string | null {
  return usersById.get(userId)?.dbUserId ?? null;
}

/**
 * Persist model identity from X-Model-Identity header to both in-memory and DB.
 * Called from REST middleware when header is present and differs from stored value.
 */
export function persistModelIdentity(userId: string, provider: string, name: string): void {
  const user = usersById.get(userId);
  if (!user) return;
  if (user.modelProvider === provider && user.modelName === name) return; // no change
  user.modelProvider = provider;
  user.modelName = name;
  if (user.dbUserId) {
    db.update(usersTable).set({ modelProvider: provider, modelName: name })
      .where(eq(usersTable.id, user.dbUserId))
      .catch((err) => console.error("[DB] Failed to persist model identity from header:", err));
  }
}

export function getModelIdentity(userId: string): { provider: string; name: string } | null {
  const user = usersById.get(userId);
  if (!user?.modelProvider || !user?.modelName) return null;
  return { provider: user.modelProvider, name: user.modelName };
}

export function getModelIdentityByDbId(dbUserId: string): { provider: string; name: string } | null {
  for (const user of usersById.values()) {
    if (user.dbUserId === dbUserId) {
      if (!user.modelProvider || !user.modelName) return null;
      return { provider: user.modelProvider, name: user.modelName };
    }
  }
  return null;
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
  modelIdentity: { provider: string; name: string } | null;
} | null> {
  if (!token) return null;

  const raw = token.startsWith("Bearer ") ? token.slice(7) : token;

  const session = sessionsByToken.get(raw);
  if (!session) return null;

  // Check expiry
  if (session.expiresAt < new Date()) {
    sessionsByToken.delete(raw);
    // Delete expired session from DB (fire-and-forget)
    db.delete(sessionsTable).where(eq(sessionsTable.token, raw))
      .catch((err) => console.error("[DB] Failed to delete expired session:", err));
    return null;
  }

  // Renew on activity
  session.expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  // T-4: temporary diagnostic — confirms renewal fires for every authenticated
  // request. TODO: remove after one playtest confirms no mid-session 401s.
  console.log(`[AUTH-RENEW] Token renewed for user=${session.userId}, new expiry=${session.expiresAt.toISOString()}`);

  // Update DB if >1 min since last renewal (throttle)
  const lastRenewal = sessionRenewalTimestamps.get(raw);
  const now = Date.now();
  if (!lastRenewal || now - lastRenewal > 60_000) {
    sessionRenewalTimestamps.set(raw, now);
    db.update(sessionsTable).set({ expiresAt: session.expiresAt })
      .where(eq(sessionsTable.token, raw))
      .catch((err) => console.error("[DB] Failed to renew session:", err));
  }

  const user = usersById.get(session.userId);
  if (!user) return null;

  const modelIdentity = (user.modelProvider && user.modelName)
    ? { provider: user.modelProvider, name: user.modelName }
    : null;

  return { userId: user.id, username: user.username, role: user.role, modelIdentity };
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
        modelProvider: row.modelProvider ?? null,
        modelName: row.modelName ?? null,
        dmEligible: row.dmEligible ?? true,
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

export async function loadPersistedSessions(): Promise<number> {
  try {
    const now = new Date();

    // Delete expired sessions
    await db.delete(sessionsTable).where(lt(sessionsTable.expiresAt, now));

    // Load remaining valid sessions
    const rows = await db.select().from(sessionsTable);
    let loaded = 0;
    for (const row of rows) {
      // Find in-memory user by dbUserId
      const userId = findUserIdByDbId(row.userId);
      if (!userId) continue; // user not loaded — skip

      sessionsByToken.set(row.token, {
        userId,
        expiresAt: row.expiresAt,
      });
      loaded++;
    }
    return loaded;
  } catch (err) {
    console.error("[DB] Failed to load persisted sessions:", err);
    return 0;
  }
}

/** Exposed for testing — clears in-memory session maps */
export function _clearSessionsForTest(): void {
  sessionsByToken.clear();
  sessionRenewalTimestamps.clear();
}

/** Test-only: register a user directly in the in-memory store without
 *  going through the /register HTTP flow. Used by promotion tests. */
export function _registerTestUser(opts: {
  userId: string; username: string; role: UserRole;
  modelProvider?: string | null; modelName?: string | null; dmEligible?: boolean;
}): void {
  const user: StoredUser = {
    id: opts.userId,
    username: opts.username,
    passwordHash: "",
    role: opts.role,
    dbUserId: null,
    modelProvider: opts.modelProvider ?? null,
    modelName: opts.modelName ?? null,
    dmEligible: opts.dmEligible ?? true,
  };
  usersById.set(opts.userId, user);
  usersByUsername.set(opts.username, user);
}

/** Test-only: clear all in-memory users. */
export function _clearUsersForTest(): void {
  usersById.clear();
  usersByUsername.clear();
}

// === INTERNAL HELPERS — DM promotion only. Do not import in request handlers. ===
// The `_internal_` prefix signals these mutate or expose private state for the
// promotion flow (CC-260430 MF-035) and must not be wired into user-facing
// endpoints. They access the in-memory `usersById` / `usersByUsername` Maps and
// must live in this file.

/**
 * Mutate a user's role in memory. Used by promoteUserToDm / demoteUserToPlayer
 * in game-manager.ts. Returns username, model identity, and dbUserId for
 * telemetry and downstream DB persistence at handshake success time. Returns
 * null if the user does not exist.
 *
 * NOTE: this only mutates IN-MEMORY state. DB role persistence happens ONLY
 * at handshake success (Eon AR + Atlas BLOCKER on Fix 1.3) — pre-handshake
 * state must remain undoable by restart-as-player fallback.
 */
export function _internal_mutateUserRole(userId: string, newRole: UserRole): {
  username: string; modelProvider: string | null; modelName: string | null; dbUserId: string | null;
} | null {
  const user = usersById.get(userId);
  if (!user) return null;
  user.role = newRole;
  const byName = usersByUsername.get(user.username);
  if (byName) byName.role = newRole;
  return {
    username: user.username,
    modelProvider: user.modelProvider,
    modelName: user.modelName,
    dbUserId: user.dbUserId,
  };
}

/** Whether a user can be promoted to DM (default true; flag for v1.5 audition gate). */
export function _internal_isUserDmEligible(userId: string): boolean {
  const user = usersById.get(userId);
  return user ? (user.dmEligible ?? true) : false;
}

/** Get model identity for AA ranking. Returns null if user does not exist. */
export function _internal_getUserModelInfo(userId: string): {
  modelProvider: string | null; modelName: string | null;
} | null {
  const user = usersById.get(userId);
  if (!user) return null;
  return { modelProvider: user.modelProvider, modelName: user.modelName };
}

/**
 * Startup reconciliation: any user with role="dm" but no active party they
 * lead is a stale promotion (server killed mid-handshake, manual DB edit,
 * or any other drift). Reset to player in memory and DB. Belt-and-suspenders
 * for Fix 1.3 — DB role persistence happens only at handshake success, but
 * restart edge cases still need a sweep.
 *
 * MUST be called AFTER both loadPersistedUsers() and loadPersistedState()
 * so that `usersById` and `parties` are both populated.
 */
export function reconcileOrphanedDmRoles(
  parties: Map<string, { dmUserId: string | null; session: { isActive: boolean } | null }>,
): number {
  let reset = 0;
  for (const [id, user] of usersById) {
    if (user.role !== "dm") continue;
    const hasActiveParty = [...parties.values()].some(
      (p) => p.dmUserId === id && p.session?.isActive,
    );
    if (hasActiveParty) continue;
    console.warn(`[STARTUP] Orphaned DM role for user ${user.username} — resetting to player`);
    user.role = "player";
    const byName = usersByUsername.get(user.username);
    if (byName) byName.role = "player";
    if (user.dbUserId) {
      db.update(usersTable).set({ role: "player" })
        .where(eq(usersTable.id, user.dbUserId))
        .execute()
        .catch((err) => console.error("[STARTUP] DB role reset failed:", err));
    }
    reset++;
  }
  return reset;
}
