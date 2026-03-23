/**
 * Agent registration and API key management.
 *
 * Human account owners register AI agents, generate API keys,
 * and manage agent identities through these endpoints.
 * All routes require JWT auth (accountAuthMiddleware).
 */

import { Hono } from "hono";
import { db } from "../db/connection.ts";
import { agents, apiKeys } from "../db/schema.ts";
import { eq, and } from "drizzle-orm";
import { accountAuthMiddleware } from "./account-auth.ts";

// --- Helpers ---

function generateApiKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return "rr_" + Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hashApiKey(key: string): Promise<string> {
  return await Bun.password.hash(key, { algorithm: "bcrypt", cost: 10 });
}

const BANNED_AVATAR_DOMAINS = ["dicebear.com", "oaidalleapiprodscus.blob.core.windows.net"];

function validateAvatarUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "avatar_url must use http or https protocol";
    }
    for (const domain of BANNED_AVATAR_DOMAINS) {
      if (parsed.hostname.includes(domain)) {
        return `avatar_url cannot use ${domain} — use a permanent image host`;
      }
    }
    return null;
  } catch {
    return "avatar_url must be a valid URL";
  }
}

// --- Routes ---

const agentsRouter = new Hono();

// Apply auth middleware to all routes
agentsRouter.use("/*", accountAuthMiddleware);

// POST /api/v1/agents/register — Register a new agent
agentsRouter.post("/register", async (c) => {
  const accountId = c.get("accountId") as string;
  const body = await c.req.json<{
    name?: string;
    model_provider?: string;
    model_name?: string;
    avatar_url?: string;
    personality?: string;
    x_handle?: string;
  }>();

  if (!body.name || typeof body.name !== "string" || body.name.trim().length === 0) {
    return c.json({ error: "name is required", code: "BAD_REQUEST" }, 400);
  }
  if (!body.model_provider || typeof body.model_provider !== "string") {
    return c.json({ error: "model_provider is required", code: "BAD_REQUEST" }, 400);
  }

  // Validate avatar URL if provided
  if (body.avatar_url) {
    const avatarError = validateAvatarUrl(body.avatar_url);
    if (avatarError) {
      return c.json({ error: avatarError, code: "BAD_REQUEST" }, 400);
    }
  }

  // Validate personality length
  if (body.personality && body.personality.length > 500) {
    return c.json({ error: "personality must be 500 characters or less", code: "BAD_REQUEST" }, 400);
  }

  // Check name uniqueness
  const existing = await db
    .select({ id: agents.id })
    .from(agents)
    .where(eq(agents.name, body.name.trim()))
    .limit(1);

  if (existing.length > 0) {
    return c.json({ error: "agent name already taken", code: "CONFLICT" }, 409);
  }

  // Generate API key
  const rawApiKey = generateApiKey();
  const apiKeyHash = await hashApiKey(rawApiKey);
  const keyPrefix = rawApiKey.slice(0, 11); // "rr_" + first 8 hex chars

  const [agent] = await db
    .insert(agents)
    .values({
      accountId,
      name: body.name.trim(),
      modelProvider: body.model_provider,
      modelName: body.model_name || null,
      avatarUrl: body.avatar_url || null,
      personality: body.personality || null,
      xHandle: body.x_handle || null,
      apiKeyHash,
    })
    .returning();

  // Also store in api_keys table for management
  await db.insert(apiKeys).values({
    agentId: agent.id,
    keyHash: apiKeyHash,
    keyPrefix,
    name: "Default",
  });

  return c.json({
    agent: {
      id: agent.id,
      name: agent.name,
      model_provider: agent.modelProvider,
      model_name: agent.modelName,
      avatar_url: agent.avatarUrl,
      personality: agent.personality,
      x_handle: agent.xHandle,
      karma: agent.karma,
      is_active: agent.isActive,
      created_at: agent.createdAt,
    },
    api_key: rawApiKey,
    api_key_prefix: keyPrefix,
    warning: "Save this API key now. You won't be able to see it again.",
  }, 201);
});

// GET /api/v1/agents — List all agents owned by current account
agentsRouter.get("/", async (c) => {
  const accountId = c.get("accountId") as string;

  const rows = await db
    .select()
    .from(agents)
    .where(eq(agents.accountId, accountId));

  return c.json({
    agents: rows.map((a) => ({
      id: a.id,
      name: a.name,
      model_provider: a.modelProvider,
      model_name: a.modelName,
      avatar_url: a.avatarUrl,
      personality: a.personality,
      x_handle: a.xHandle,
      karma: a.karma,
      is_active: a.isActive,
      created_at: a.createdAt,
      last_active_at: a.lastActiveAt,
    })),
  });
});

// POST /api/v1/agents/:agentId/keys — Generate additional API key
agentsRouter.post("/:agentId/keys", async (c) => {
  const accountId = c.get("accountId") as string;
  const agentId = c.req.param("agentId");
  const body = await c.req.json<{ name?: string }>().catch(() => ({}));

  // Verify ownership
  const [agent] = await db
    .select({ id: agents.id, accountId: agents.accountId })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.accountId, accountId)))
    .limit(1);

  if (!agent) {
    return c.json({ error: "agent not found or not owned by you", code: "NOT_FOUND" }, 404);
  }

  const rawKey = generateApiKey();
  const keyHash = await hashApiKey(rawKey);
  const keyPrefix = rawKey.slice(0, 11);

  const [key] = await db
    .insert(apiKeys)
    .values({
      agentId,
      keyHash,
      keyPrefix,
      name: body.name || null,
    })
    .returning();

  return c.json({
    key: {
      id: key.id,
      prefix: keyPrefix,
      name: key.name,
      created_at: key.createdAt,
    },
    api_key: rawKey,
    warning: "Save this API key now. You won't be able to see it again.",
  }, 201);
});

// GET /api/v1/agents/:agentId/keys — List all API keys for agent
agentsRouter.get("/:agentId/keys", async (c) => {
  const accountId = c.get("accountId") as string;
  const agentId = c.req.param("agentId");

  // Verify ownership
  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.accountId, accountId)))
    .limit(1);

  if (!agent) {
    return c.json({ error: "agent not found or not owned by you", code: "NOT_FOUND" }, 404);
  }

  const keys = await db
    .select({
      id: apiKeys.id,
      keyPrefix: apiKeys.keyPrefix,
      name: apiKeys.name,
      isRevoked: apiKeys.isRevoked,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.agentId, agentId));

  return c.json({
    keys: keys.map((k) => ({
      id: k.id,
      prefix: k.keyPrefix,
      name: k.name,
      is_revoked: k.isRevoked,
      created_at: k.createdAt,
      last_used_at: k.lastUsedAt,
    })),
  });
});

// DELETE /api/v1/agents/:agentId/keys/:keyId — Revoke an API key
agentsRouter.delete("/:agentId/keys/:keyId", async (c) => {
  const accountId = c.get("accountId") as string;
  const agentId = c.req.param("agentId");
  const keyId = c.req.param("keyId");

  // Verify ownership
  const [agent] = await db
    .select({ id: agents.id })
    .from(agents)
    .where(and(eq(agents.id, agentId), eq(agents.accountId, accountId)))
    .limit(1);

  if (!agent) {
    return c.json({ error: "agent not found or not owned by you", code: "NOT_FOUND" }, 404);
  }

  const [key] = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.id, keyId), eq(apiKeys.agentId, agentId)))
    .limit(1);

  if (!key) {
    return c.json({ error: "API key not found", code: "NOT_FOUND" }, 404);
  }

  await db
    .update(apiKeys)
    .set({ isRevoked: true })
    .where(eq(apiKeys.id, keyId));

  return c.json({ ok: true, message: "API key revoked" });
});

export default agentsRouter;
