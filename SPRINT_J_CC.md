# Sprint J — From Game to Theater (CC Task File)

> **BEFORE YOU START:** Read `CLAUDE.md` (game design spec), `docs/cc-patterns.md`, and `docs/known-issues.md`. Tests use `test-runner.sh` (30s hard kill — no local Postgres, DB pool retries forever without it).

---

## Code Review Notes (Prime's audit of existing code)

| Spec Assumption | Code Reality | Impact |
|----------------|-------------|--------|
| "No NPC system exists" | **WRONG.** `GameNPC` interface at `game-manager.ts:178`, `npcsMap` at `:197`, full CRUD: `handleCreateNpc` (`:4592`), `handleGetNpc` (`:4659`), `handleListNpcs` (`:4683`), `handleUpdateNpc` (`:4708`), `handleUpdateNpcDisposition` (`:4757`). REST routes at `rest.ts:356-385`. DB table `npcs` in schema. | Sprint J **extends** the existing NPC system — adds `knowledge`, `goals`, `relationships`, `standingOrders` fields. Do NOT rebuild from scratch. |
| "No narration structure" | **PARTIALLY RIGHT.** `handleNarrate` at `:2914` logs `{text, style}`. `handleVoiceNpc` at `:3095` exists for NPC dialogue. `handleNarrateTo` at `:2924` for private narration. | Extend `handleNarrate` with `type` field. `voice_npc` already covers some of J3.1's NPC dialogue. |
| "Templates are just rooms + monsters" | **PARTIALLY RIGHT.** `TemplateNPC` in `templates.ts:53` is minimal (`name`, `description`, `dialogue[]`). Template YAML has `npcs` array but only those 3 fields. | Blueprint extension adds `knowledge`, `goals`, `disposition`, `relationships`, `standingOrders` to template NPCs. Backward compatible — new fields optional. |
| "Attack on dead monster returns success" (J0.3) | `handleAttack` at `:1065` already checks `m.isAlive` and returns error. `handleMonsterAttack` at `:1182` may have the bug — **verify both paths.** | CC should test both player→monster and monster→player attack paths for dead target handling. |
| "`SessionPhase` doesn't include conversation" | **CORRECT.** `types.ts:32`: `"exploration" | "combat" | "roleplay" | "rest"`. `sessionPhaseEnum` in `schema.ts` matches. | Must add `"conversation"` to both the TS type and Drizzle enum. |

---

## Task Sequence & Dependencies

```
TIER 0 (bug fixes) — independent, do anytime
  J0.1 → J0.2 → J0.3 → J0.4

TIER 1 (conversation engine) — sequential, core of sprint
  Task 1 (phase + conversation lifecycle)
  → Task 2 (NPC registry extension)
  → Task 3 (information items)

TIER 3 (DM empowerment) — depends on Tier 1
  Task 4 (structured narration) — after Task 1
  Task 5 (session blueprints) — after Tasks 2, 3, 6

TIER 2 (temporal mechanics) — parallel with Tier 3
  Task 6 (session clocks)
  → Task 7 (time passage) — after Task 6

TIER 5 (commentary) — independent
  Task 8 (meta-layer) — anytime after Task 1

TIER 4 (spectator) — depends on everything above
  Task 9 (conversation visualization) — after Task 1
  Task 10 (clock display) — after Task 6
  Task 11 (NPC cards) — after Task 2

DB migration — Task 12 (single migration for all schema changes)
DM Tools — Task 13 (MCP tool definitions for all new endpoints)
```

**Recommended build order:** 12 → 0.1–0.4 → 1 → 2 → 3 → 6 → 7 → 4 → 5 → 8 → 13 → 9 → 10 → 11

---

## Task 0.1: DM Force-Skip Turn (P0)

**Problem:** Combat deadlocks when a player disconnects or goes AFK. No recovery mechanism.

**Files:** `src/game/game-manager.ts`, `src/api/rest.ts`, `src/tools/dm-tools.ts`

### 0.1a. Add `handleForceSkipTurn` in game-manager.ts

Add a new export function near the other DM handlers (~line 3500 area, near `handleAdvanceScene`):

```typescript
export function handleForceSkipTurn(userId: string, params: { reason?: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };
  if (!party.session || party.session.phase !== "combat") {
    return { success: false, error: "Can only skip turns during combat." };
  }

  const current = getCurrentCombatant(party.session);
  if (!current) return { success: false, error: "No current combatant." };

  const skippedName = current.type === "player"
    ? (characters.get(current.entityId)?.name ?? current.entityId)
    : (party.monsters.find(m => m.id === current.entityId)?.name ?? current.entityId);

  // Reset turn resources for skipped entity
  resetTurnResources(party, current.entityId);

  // Advance to next turn
  party.session = nextTurn(party.session);
  advanceTurnSkipDead(party);

  logEvent(party, "dm_skip_turn", null, {
    skippedEntity: current.entityId,
    skippedName,
    skippedType: current.type,
    reason: params.reason ?? "DM force skip",
  });

  notifyTurnChange(party);

  return {
    success: true,
    data: {
      skipped: skippedName,
      skippedType: current.type,
      reason: params.reason ?? "DM force skip",
    },
  };
}
```

Import `nextTurn`, `getCurrentCombatant` from `../game/session.ts` if not already imported (check existing imports at top of file).

### 0.1b. Add REST route

In `src/api/rest.ts`, add after the `dm.post("/monster-action", ...)` block (~line 330):

```typescript
dm.post("/skip-turn", async (c) => {
  const body = await c.req.json<{ reason?: string }>().catch(() => ({}));
  return respond(c, gm.handleForceSkipTurn(c.get("user").userId, body));
});
```

### 0.1c. Add MCP tool definition

In `src/tools/dm-tools.ts`, add a new tool entry for `skip_turn` in the DM tools array. Description: "Force-skip the current entity's turn during combat. Use when a player disconnects or goes AFK. Advances initiative to the next combatant."

Input schema: `{ reason: { type: "string", description: "Why the turn is being skipped" } }`, required: `[]`.

**Test:** During combat, call `POST /api/v1/dm/skip-turn` → current combatant's turn ends → initiative advances → event logged with `dm_skip_turn` type.

---

## Task 0.2: Advantage on Sleeping/Unconscious Targets (P1)

**Problem:** Attacking a sleeping target doesn't grant advantage. D&D 5e PHB p.292: attacks against unconscious creatures have advantage, and melee hits within 5ft auto-crit.

**Files:** `src/game/game-manager.ts`

### 0.2a. Add advantage to player attack on sleeping/unconscious monsters

In `handleAttack` (~line 1080), after the `attackParams` are built and BEFORE `resolveAttack` is called, add condition detection:

```typescript
// D&D 5e: Attacks against unconscious/sleeping/paralyzed targets have advantage
const targetHasCondition = (cond: string) => target.conditions.includes(cond);
const targetIsIncapacitated = targetHasCondition("unconscious") || targetHasCondition("asleep") || targetHasCondition("paralyzed");
const hasAdvantage = targetIsIncapacitated;

const result = resolveAttack({ ...attackParams, targetAC: target.ac, advantage: hasAdvantage });

// Auto-crit on melee hits against unconscious/paralyzed within 5ft (all melee assumed within 5ft)
if (result.hit && targetIsIncapacitated && !isRanged) {
  result.critical = true;
  // Recalculate damage as critical (double dice)
  // The resolveAttack may have already handled this if natural 20, but force it for condition-based crits
}
```

**Note:** Check how `resolveAttack` in `src/engine/combat.ts` handles `advantage` — it already accepts `advantage?: boolean` at line 76. The `result.critical` forced override needs to double dice if `resolveAttack` didn't already roll a nat 20. Check if `resolveAttack` returns enough info to recalculate, or if you need to re-roll damage dice as critical.

### 0.2b. Also apply to monster attacks on unconscious players

In `handleMonsterAttack` (~line 1182), find where the monster attacks a player target. The existing code at ~line 1352 already has:

```typescript
const targetIsUnconscious = target.conditions.includes("unconscious");
```

And at ~line 1363 sets `advantage: targetIsUnconscious`. Verify this also handles `"asleep"` and `"paralyzed"` conditions. If not, extend the check:

```typescript
const targetIsIncapacitated = target.conditions.includes("unconscious") || target.conditions.includes("asleep") || target.conditions.includes("paralyzed");
```

And use `targetIsIncapacitated` instead of `targetIsUnconscious` in the advantage and auto-crit logic.

**Test:** Attack sleeping monster → roll shows advantage (2 d20s, takes higher). Melee hit → auto-crit damage. Attack unconscious player → same behavior.

---

## Task 0.3: Dead Monster Attack Returns Proper Error (P2)

**Problem:** `POST /api/v1/attack` targeting a dead monster returns `{success: true, target: null, damage: null}` instead of an error.

**Files:** `src/game/game-manager.ts`

### Investigation

`handleAttack` at line 1065 already checks `m.isAlive`. The bug may be in a different code path or may have been introduced when the target is killed mid-turn and another attack targets it. Also check `handleMonsterAttack` for the reverse case (monster targeting dead player).

Search for any code paths that could return `{success: true}` with null target/damage:

1. Check if `handleAttack` has an early-return path that bypasses the isAlive check
2. Check `handleMonsterAttack` for dead-player targeting
3. Check if there's a race condition where the monster dies between target selection and damage resolution

### Fix

If the `handleAttack` check is already correct, the bug may be in `handleMonsterAttack`. In `handleMonsterAttack`, ensure that:

1. Player targets with `hpCurrent <= 0` or `conditions.includes("dead")` return `{success: false, error: "Target is dead", code: "TARGET_DEAD"}`
2. Monster with `isAlive === false` returns `{success: false, error: "This monster is dead"}`

**Test:** Kill a monster → immediately `POST /api/v1/attack` targeting it → response is `{success: false, error: "...", code: "TARGET_DEAD"}`, NOT `{success: true, target: null}`.

---

## Task 0.4: DM set-session-metadata Persists Fields (P2)

**Problem:** `POST /api/v1/dm/set-session-metadata` returns `{success: true, dmMetadata: {}}` — title and description silently discarded.

**Files:** `src/game/game-manager.ts`

### Fix

Find `handleSetSessionMetadata` at ~line 4059. Check what fields it accepts vs what it persists. The endpoint body type in `rest.ts` is:
```typescript
{ worldDescription?: string; style?: string; tone?: string; setting?: string; decisionTimeMs?: number }
```

But the spec says `title` and `description` are being discarded. Either:
1. The REST handler doesn't pass `title`/`description` to the game-manager function, OR
2. The game-manager function doesn't store them in `session.dmMetadata`

**Fix both paths:**
1. In `rest.ts` (`dm.post("/set-session-metadata", ...)`), add `title?: string; description?: string` to the body type
2. In `handleSetSessionMetadata`, store ALL fields from the body into `dmMetadata`, including `title` and `description`
3. Return the persisted `dmMetadata` in the response

Also update the DB persistence — in the DB update call, make sure the `dmMetadata` JSON column includes the new fields.

**Test:** `POST /api/v1/dm/set-session-metadata` with `{title: "The Fall of Fort Treskel", description: "A political negotiation session"}` → response includes both fields. `GET /spectator/sessions/:id` → `dmMetadata` includes title and description.

---

## Task 1: Conversation Lifecycle (J1.1) — CORE

**Problem:** No way to mark "player is in a conversation with NPC X." No conversation state, no participant tracking, no phase transition.

**Files:** `src/types.ts`, `src/db/schema.ts`, `src/game/session.ts`, `src/game/game-manager.ts`, `src/api/rest.ts`, `src/tools/dm-tools.ts`

### 1a. Add "conversation" session phase

In `src/types.ts`, line 32, change:
```typescript
export type SessionPhase = "exploration" | "combat" | "roleplay" | "rest";
```
to:
```typescript
export type SessionPhase = "exploration" | "combat" | "roleplay" | "rest" | "conversation";
```

In `src/db/schema.ts`, the `sessionPhaseEnum` (line ~33), add `"conversation"` to the array. This requires a DB migration (see Task 12).

### 1b. Add conversation state tracking

In `src/game/session.ts`, add a new interface and helper:

```typescript
export interface ConversationState {
  id: string;
  participants: { type: "player" | "npc"; id: string; name: string }[];
  context: string;
  geometry?: string; // spatial note: "Syllus across from Josser"
  startedAt: Date;
  messageCount: number;
  outcome?: string;
  relationshipDelta?: Record<string, number>; // npcId → disposition change
}
```

Add a `conversations` array to `SessionState`:
```typescript
export interface SessionState {
  // ... existing fields ...
  conversations: ConversationState[];     // all conversations this session
  activeConversationId: string | null;    // currently active conversation
}
```

Update `createSession` to initialize:
```typescript
conversations: [],
activeConversationId: null,
```

Add phase transition:
```typescript
export function enterConversation(session: SessionState): SessionState {
  return { ...session, phase: "conversation" };
}
```

### 1c. Add conversation handlers in game-manager.ts

Add two new exports:

**`handleStartConversation`:**
```typescript
export function handleStartConversation(userId: string, params: {
  participants: { type: "player" | "npc"; id: string; name: string }[];
  context: string;
  geometry?: string;
}): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };
  if (!party.session) return { success: false, error: "No active session." };
  if (party.session.phase === "combat") return { success: false, error: "Cannot start conversation during combat." };

  const convId = nextId("conv");
  const conversation: ConversationState = {
    id: convId,
    participants: params.participants,
    context: params.context,
    geometry: params.geometry,
    startedAt: new Date(),
    messageCount: 0,
  };

  party.session.conversations.push(conversation);
  party.session.activeConversationId = convId;
  party.session.phase = "conversation";

  logEvent(party, "conversation_start", null, {
    conversationId: convId,
    participants: params.participants.map(p => ({ type: p.type, name: p.name })),
    context: params.context,
    geometry: params.geometry ?? null,
  });

  return {
    success: true,
    data: {
      conversationId: convId,
      participants: params.participants,
      geometry: params.geometry ?? null,
    },
  };
}
```

**`handleEndConversation`:**
```typescript
export function handleEndConversation(userId: string, params: {
  conversationId: string;
  outcome: string;
  relationshipDelta?: Record<string, number>;
}): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };
  if (!party.session) return { success: false, error: "No active session." };

  const conv = party.session.conversations.find(c => c.id === params.conversationId);
  if (!conv) return { success: false, error: `Conversation ${params.conversationId} not found.` };

  conv.outcome = params.outcome;
  conv.relationshipDelta = params.relationshipDelta;

  // If this was the active conversation, return to exploration
  if (party.session.activeConversationId === params.conversationId) {
    party.session.activeConversationId = null;
    party.session.phase = "exploration";
  }

  // Apply relationship deltas to NPCs
  if (params.relationshipDelta) {
    for (const [npcId, delta] of Object.entries(params.relationshipDelta)) {
      const npc = npcsMap.get(npcId);
      if (npc) {
        npc.disposition = Math.max(-100, Math.min(100, npc.disposition + delta));
        npc.dispositionLabel = dispositionLabel(npc.disposition);
      }
    }
  }

  logEvent(party, "conversation_end", null, {
    conversationId: params.conversationId,
    outcome: params.outcome,
    messageCount: conv.messageCount,
    relationshipDelta: params.relationshipDelta ?? null,
  });

  return {
    success: true,
    data: {
      conversationId: params.conversationId,
      outcome: params.outcome,
      messageCount: conv.messageCount,
    },
  };
}
```

### 1d. Tag chat messages with conversation context

In `handlePartyChat` (find it in game-manager.ts), if `party.session?.activeConversationId` is set, include it in the logged event data and increment the conversation's `messageCount`:

```typescript
if (party.session?.activeConversationId) {
  const conv = party.session.conversations.find(c => c.id === party.session!.activeConversationId);
  if (conv) conv.messageCount++;
  eventData.conversationId = party.session.activeConversationId;
}
```

### 1e. Add REST routes

In `src/api/rest.ts`, add DM routes:

```typescript
dm.post("/start-conversation", async (c) => {
  const body = await c.req.json<{
    participants: { type: "player" | "npc"; id: string; name: string }[];
    context: string;
    geometry?: string;
  }>();
  return respond(c, gm.handleStartConversation(c.get("user").userId, body));
});

dm.post("/end-conversation", async (c) => {
  const body = await c.req.json<{
    conversationId: string;
    outcome: string;
    relationshipDelta?: Record<string, number>;
  }>();
  return respond(c, gm.handleEndConversation(c.get("user").userId, body));
});
```

**Test:**
1. DM starts conversation with 2+ participants → phase changes to `conversation` → response has `conversationId`
2. Player sends `/chat` during conversation → event tagged with `conversationId` → `messageCount` increments
3. DM ends conversation with outcome → phase returns to `exploration` → event logged
4. Spectator: session detail includes `conversations[]` array (Task 9 handles display)

---

## Task 2: Extend NPC Registry with Knowledge, Goals, Relationships (J1.2)

**Problem:** NPCs exist but lack `knowledge`, `goals`, `relationships`, `standingOrders` — the fields that make them narrative agents, not just names.

**Files:** `src/game/game-manager.ts`, `src/db/schema.ts`, `src/api/rest.ts`

### 2a. Extend GameNPC interface

In `game-manager.ts` at line ~178, add fields to `GameNPC`:

```typescript
interface GameNPC {
  // ... existing fields ...
  knowledge: string[];           // things this NPC knows
  goals: string[];               // what this NPC wants
  relationships: Record<string, string>; // npcName → relationship description
  standingOrders: string | null; // current behavioral directives
}
```

### 2b. Update handleCreateNpc

In `handleCreateNpc` (~line 4592), accept the new fields in params and store them:

Add to params type:
```typescript
knowledge?: string[];
goals?: string[];
relationships?: Record<string, string>;
standingOrders?: string;
```

In the `GameNPC` object construction, add:
```typescript
knowledge: params.knowledge ?? [],
goals: params.goals ?? [],
relationships: params.relationships ?? {},
standingOrders: params.standingOrders?.trim() ?? null,
```

Include them in the `logEvent` data and the return `data` object.

### 2c. Update handleUpdateNpc

In `handleUpdateNpc` (~line 4708), accept the new fields:

```typescript
knowledge?: string[];
goals?: string[];
relationships?: Record<string, string>;
standingOrders?: string;
```

Apply them:
```typescript
if (params.knowledge !== undefined) npc.knowledge = params.knowledge;
if (params.goals !== undefined) npc.goals = params.goals;
if (params.relationships !== undefined) npc.relationships = params.relationships;
if (params.standingOrders !== undefined) npc.standingOrders = params.standingOrders.trim();
```

### 2d. Update REST route body types

In `rest.ts`, the `dm.post("/npc", ...)` handler (~line 357) — add `knowledge`, `goals`, `relationships`, `standingOrders` to the body type.

Similarly for `dm.patch("/npc/:npc_id", ...)` (~line 372).

### 2e. Update DB schema (done in Task 12 migration)

Add columns to `npcs` table:
- `knowledge: jsonb("knowledge").notNull().$type<string[]>().default([])`
- `goals: jsonb("goals").notNull().$type<string[]>().default([])`
- `relationships: jsonb("relationships").notNull().$type<Record<string, string>>().default({})`
- `standing_orders: text("standing_orders")`

### 2f. Update DB persistence in handleCreateNpc

In the `db.insert(npcsTable).values(...)` call, add the new fields.

### 2g. Update handleGetNpc and handleListNpcs return data

Include `knowledge`, `goals`, `relationships`, `standingOrders` in the response objects for both handlers.

**Test:** `POST /api/v1/dm/npc` with knowledge/goals/relationships → stored → `GET /api/v1/dm/npcs` returns them → `PATCH /api/v1/dm/npc/:id` updates them.

---

## Task 3: Information Items — Discoverable Knowledge (J1.3)

**Problem:** No concept of "the player learned something." No tracking of what info exists, who knows it, or when it was discovered.

**Files:** `src/game/game-manager.ts`, `src/api/rest.ts`, `src/tools/dm-tools.ts`

### 3a. Add in-memory data structure

In `game-manager.ts`, near the other Maps (~line 195):

```typescript
interface InfoItem {
  id: string;
  partyId: string;
  title: string;
  content: string;
  source: string;                // npcId, "environment", or "document"
  visibility: "hidden" | "available" | "discovered";
  discoveredBy: string[];        // characterIds
  discoveryMethod?: string;      // "told", "found", "overheard", "deduced"
  freshnessTurns: number | null; // turns until stale (null = never stale)
  turnsElapsed: number;          // how many turns have passed since creation
  isStale: boolean;
  createdAt: Date;
}

const infoItems = new Map<string, InfoItem>();
```

### 3b. Add handlers

**`handleCreateInfoItem`:**
```typescript
export function handleCreateInfoItem(userId: string, params: {
  title: string;
  content: string;
  source: string;
  visibility?: "hidden" | "available" | "discovered";
  discoveredBy?: string[];
  freshnessTurns?: number;
}): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  const infoId = nextId("info");
  const item: InfoItem = {
    id: infoId,
    partyId: party.id,
    title: params.title.trim(),
    content: params.content.trim(),
    source: params.source,
    visibility: params.visibility ?? "hidden",
    discoveredBy: params.discoveredBy ?? [],
    freshnessTurns: params.freshnessTurns ?? null,
    turnsElapsed: 0,
    isStale: false,
    createdAt: new Date(),
  };

  infoItems.set(infoId, item);
  logEvent(party, "info_created", null, { infoId, title: item.title, visibility: item.visibility });

  return {
    success: true,
    data: { infoId, title: item.title, visibility: item.visibility },
  };
}
```

**MCP tool description note:** The `freshnessTurns` field uses abstract ticks, NOT real time units. `advance_time` maps `amount` 1:1 to ticks regardless of unit — so "3 days" and "3 minutes" both tick freshness by 3. Tell the DM explicitly: "freshnessTurns are abstract ticks. Each call to advance_time ticks by amount regardless of unit. For precise decay control, coordinate freshnessTurns with your expected advance_time calls."

**`handleRevealInfo`:**
```typescript
export function handleRevealInfo(userId: string, params: {
  infoId: string;
  toCharacters: string[];
  method: "told" | "found" | "overheard" | "deduced";
}): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  const item = infoItems.get(params.infoId);
  if (!item || item.partyId !== party.id) return { success: false, error: `Info item ${params.infoId} not found.` };

  item.visibility = "discovered";
  item.discoveryMethod = params.method;
  for (const charId of params.toCharacters) {
    if (!item.discoveredBy.includes(charId)) {
      item.discoveredBy.push(charId);
    }
  }

  const charNames = params.toCharacters.map(id => characters.get(id)?.name ?? id);

  logEvent(party, "info_revealed", null, {
    infoId: params.infoId,
    title: item.title,
    toCharacters: params.toCharacters,
    toCharacterNames: charNames,
    method: params.method,
    isStale: item.isStale,
  });

  return {
    success: true,
    data: {
      infoId: params.infoId,
      title: item.title,
      discoveredBy: item.discoveredBy,
      method: params.method,
      isStale: item.isStale,
    },
  };
}
```

**`handleUpdateInfoItem`:**
```typescript
export function handleUpdateInfoItem(userId: string, params: {
  infoId: string;
  content?: string;
  visibility?: "hidden" | "available" | "discovered";
  freshnessTurns?: number;
}): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  const item = infoItems.get(params.infoId);
  if (!item || item.partyId !== party.id) return { success: false, error: `Info item ${params.infoId} not found.` };

  if (params.content !== undefined) item.content = params.content.trim();
  if (params.visibility !== undefined) item.visibility = params.visibility;
  if (params.freshnessTurns !== undefined) {
    item.freshnessTurns = params.freshnessTurns;
    item.isStale = false; // reset stale on refresh
    item.turnsElapsed = 0;
  }

  return { success: true, data: { infoId: item.id, title: item.title, visibility: item.visibility, isStale: item.isStale } };
}
```

**`handleListInfoItems`:**
```typescript
export function handleListInfoItems(userId: string): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  const items = [...infoItems.values()]
    .filter(i => i.partyId === party.id)
    .map(i => ({
      infoId: i.id,
      title: i.title,
      content: i.content,
      source: i.source,
      visibility: i.visibility,
      discoveredBy: i.discoveredBy,
      discoveryMethod: i.discoveryMethod ?? null,
      isStale: i.isStale,
      freshnessTurns: i.freshnessTurns,
      turnsElapsed: i.turnsElapsed,
    }));

  return { success: true, data: { items } };
}
```

### 3c. Add REST routes

In `rest.ts`, add:

```typescript
dm.post("/info", async (c) => {
  const body = await c.req.json();
  return respond(c, gm.handleCreateInfoItem(c.get("user").userId, body));
});

dm.post("/reveal-info", async (c) => {
  const body = await c.req.json();
  return respond(c, gm.handleRevealInfo(c.get("user").userId, body));
});

dm.patch("/info/:infoId", async (c) => {
  const body = await c.req.json();
  return respond(c, gm.handleUpdateInfoItem(c.get("user").userId, { infoId: c.req.param("infoId"), ...body }));
});

dm.get("/info", (c) => respond(c, gm.handleListInfoItems(c.get("user").userId)));
```

**Test:** DM creates hidden info → stored → DM reveals to specific character → `info_revealed` event logged → DM lists info → all items returned with discovery state.

---

## Task 4: Structured Narration (J3.1)

**Problem:** All DM narration is flat text. No distinction between scene-setting, NPC dialogue, atmosphere, transitions, or rulings.

**Files:** `src/game/game-manager.ts`, `src/api/rest.ts`

### 4a. Extend handleNarrate

At ~line 2914, update the function signature and body:

```typescript
export function handleNarrate(userId: string, params: {
  text: string;
  style?: string;
  type?: "scene" | "npc_dialogue" | "atmosphere" | "transition" | "intercut" | "ruling";
  npcId?: string;
  metadata?: Record<string, unknown>;
}): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "You are not a DM for any active party." };

  const narType = params.type ?? "scene"; // default to scene
  const eventData: Record<string, unknown> = {
    text: params.text,
    narrateType: narType,
  };
  if (params.style) eventData.style = params.style;
  if (params.npcId) eventData.npcId = params.npcId;
  if (params.metadata) eventData.metadata = params.metadata;

  // If conversation is active, tag narration with conversationId
  if (party.session?.activeConversationId) {
    eventData.conversationId = party.session.activeConversationId;
  }

  // If npc_dialogue type, validate NPC exists
  if (narType === "npc_dialogue" && params.npcId) {
    const npc = npcsMap.get(params.npcId);
    if (npc) eventData.npcName = npc.name;
  }

  logEvent(party, "narration", null, eventData);

  return {
    success: true,
    data: {
      narrated: true,
      text: params.text,
      type: narType,
      npcId: params.npcId ?? null,
      style: params.style ?? null,
    },
  };
}
```

### 4b. Update REST route

In `rest.ts`, update the `dm.post("/narrate", ...)` handler to pass through the new fields:

```typescript
dm.post("/narrate", async (c) => {
  const body = await c.req.json<{
    text?: string; message?: string; style?: string;
    type?: "scene" | "npc_dialogue" | "atmosphere" | "transition" | "intercut" | "ruling";
    npcId?: string; metadata?: Record<string, unknown>;
  }>();
  const text = body.text ?? body.message;
  if (!text) return respond(c, { success: false, error: "Missing 'text' (or 'message') field in narration body." });
  return respond(c, gm.handleNarrate(c.get("user").userId, { text, style: body.style, type: body.type, npcId: body.npcId, metadata: body.metadata }));
});
```

### 4c. Update MCP tool definition

In `dm-tools.ts`, update the `narrate` tool schema to include:
- `type`: enum of `["scene", "npc_dialogue", "atmosphere", "transition", "intercut", "ruling"]`, optional
- `npc_id`: string, optional (for npc_dialogue type)

**Test:** DM narrates with `type: "npc_dialogue"` + `npcId` → event data includes `narrateType` and `npcName`. DM narrates with `type: "transition"` → event logged with type. Default (no type) → `"scene"`.

---

## Task 5: Session Blueprints (J3.2)

**Problem:** DM agent starts sessions with only rooms + monsters. No pre-loaded NPCs, clocks, info items, or narrative hooks.

**Files:** `src/game/templates.ts`, `src/game/game-manager.ts`

### 5a. Extend template types

In `src/game/templates.ts`, update `TemplateNPC` and add new types:

```typescript
export interface TemplateNPC {
  name: string;
  description: string;
  dialogue: string[];
  // ENA extensions (all optional for backward compat)
  disposition?: string;       // "hostile" | "neutral" | "friendly" | "unknown"
  knowledge?: string[];
  goals?: string[];
  standingOrders?: string;
  relationships?: Record<string, string>;
}

export interface TemplateClock {
  name: string;
  description: string;
  turnsRemaining: number;
  visibility: "hidden" | "public";
  consequence: string;
}

export interface TemplateInfoItem {
  title: string;
  content: string;
  visibility: "hidden" | "available";
  source: string;           // "environment", "document", or NPC name
  freshnessTurns?: number;
}

export interface TemplateSecret {
  fact: string;
  surfaceCondition: string;
  dramaticWeight: "low" | "medium" | "high";
}

export interface TemplateConstraint {
  description: string;
  blocks: string;
  forces: string;
}
```

Update `DungeonTemplate`:
```typescript
export interface DungeonTemplate {
  // ... existing fields ...
  npcs: TemplateNPC[];
  // ENA extensions
  clocks: TemplateClock[];
  infoItems: TemplateInfoItem[];
  secrets: TemplateSecret[];
  designedConstraints: TemplateConstraint[];
  narrativeHooks: string[];  // already exists as storyHooks — alias or merge
}
```

### 5b. Update YAML parsing

In `parseTemplate`, add parsing for the new arrays (all optional — templates without them still work):

```typescript
const clocks: TemplateClock[] = (raw.clocks ?? []).map(c => ({
  name: c.name,
  description: c.description,
  turnsRemaining: c.turns_remaining,
  visibility: c.visibility ?? "hidden",
  consequence: c.consequence,
}));

const infoItemsTemplate: TemplateInfoItem[] = (raw.info_items ?? []).map(i => ({
  title: i.title,
  content: i.content,
  visibility: i.visibility ?? "hidden",
  source: i.source ?? "environment",
  freshnessTurns: i.freshness_turns,
}));

const secrets: TemplateSecret[] = (raw.secrets ?? []).map(s => ({
  fact: s.fact,
  surfaceCondition: s.surface_condition,
  dramaticWeight: s.dramatic_weight ?? "medium",
}));

const designedConstraints: TemplateConstraint[] = (raw.designed_constraints ?? []).map(dc => ({
  description: dc.description,
  blocks: dc.blocks,
  forces: dc.forces,
}));
```

Include them in the returned `DungeonTemplate` object. Default all to `[]` for backward compatibility.

### 5c. Auto-create blueprint entities on session start

In `game-manager.ts`, the `formParty` function at **line 5091** handles session creation from templates. The key block is at **~line 5134-5140**:

```typescript
const template = getRandomTemplate();
party.templateEncounters = template ? encountersFromTemplate(template) : new Map();
party.templateLootTables = template ? lootTablesFromTemplate(template) : new Map();
party.dungeonState = template
  ? dungeonStateFromTemplate(template)
  : createDungeonState(fallbackRooms(), fallbackConnections(), "room-1");
```

**After this block**, add blueprint entity creation:

1. For each template NPC → call `handleCreateNpc` internally (or directly create `GameNPC` objects and insert into `npcsMap`)
2. For each template clock → create via the clock system (Task 6)
3. For each template info item → create via the info system (Task 3)
4. Include `secrets`, `designedConstraints`, and `narrativeHooks` in the DM's context data (return them as part of the session start response or store in session metadata)

### 5d. Add YAML shape extensions

In the `YAMLTemplate` interface, add optional fields:
```typescript
clocks?: { name: string; description: string; turns_remaining: number; visibility?: string; consequence: string }[];
info_items?: { title: string; content: string; visibility?: string; source?: string; freshness_turns?: number }[];
secrets?: { fact: string; surface_condition: string; dramatic_weight?: string }[];
designed_constraints?: { description: string; blocks: string; forces: string }[];
```

**Test:** Create a template YAML with NPCs+clocks+info → load template → start session from it → NPCs created in `npcsMap`, clocks active, info items stored. Start session from existing template (no new fields) → works exactly as before.

---

## Task 6: Session Clocks (J2.1)

**Problem:** No concept of ticking deadlines. Sessions exist in a timeless void.

**Files:** `src/game/game-manager.ts`, `src/api/rest.ts`, `src/tools/dm-tools.ts`

### 6a. Add in-memory data structure

In `game-manager.ts`, near the other Maps:

```typescript
interface SessionClock {
  id: string;
  partyId: string;
  name: string;
  description: string;
  turnsRemaining: number;
  turnsTotal: number;          // original amount for display
  visibility: "hidden" | "public";
  consequence: string;
  isResolved: boolean;
  outcome?: string;
  createdAt: Date;
}

const clocks = new Map<string, SessionClock>();
```

### 6b. Add handlers

**`handleCreateClock`:**
```typescript
export function handleCreateClock(userId: string, params: {
  name: string;
  description: string;
  turnsRemaining: number;
  visibility?: "hidden" | "public";
  consequence: string;
}): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  const clockId = nextId("clock");
  const clock: SessionClock = {
    id: clockId,
    partyId: party.id,
    name: params.name.trim(),
    description: params.description.trim(),
    turnsRemaining: params.turnsRemaining,
    turnsTotal: params.turnsRemaining,
    visibility: params.visibility ?? "hidden",
    consequence: params.consequence,
    isResolved: false,
    createdAt: new Date(),
  };

  clocks.set(clockId, clock);
  logEvent(party, "clock_created", null, {
    clockId, name: clock.name, turnsRemaining: clock.turnsRemaining, visibility: clock.visibility,
  });

  return {
    success: true,
    data: { clockId, name: clock.name, turnsRemaining: clock.turnsRemaining, visibility: clock.visibility },
  };
}
```

**`handleAdvanceClock`:**
```typescript
export function handleAdvanceClock(userId: string, params: {
  clockId: string;
  turns?: number;
}): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  const clock = clocks.get(params.clockId);
  if (!clock || clock.partyId !== party.id) return { success: false, error: `Clock ${params.clockId} not found.` };
  if (clock.isResolved) return { success: false, error: "Clock is already resolved." };

  const ticks = params.turns ?? 1;
  clock.turnsRemaining = Math.max(0, clock.turnsRemaining - ticks);

  logEvent(party, "clock_advanced", null, {
    clockId: clock.id, name: clock.name, turnsRemaining: clock.turnsRemaining, tickedBy: ticks,
  });

  const hitZero = clock.turnsRemaining === 0;

  return {
    success: true,
    data: {
      clockId: clock.id, name: clock.name,
      turnsRemaining: clock.turnsRemaining,
      hitZero,
      consequence: hitZero ? clock.consequence : null,
    },
  };
}
```

**`handleResolveClock`:**
```typescript
export function handleResolveClock(userId: string, params: {
  clockId: string;
  outcome: string;
}): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  const clock = clocks.get(params.clockId);
  if (!clock || clock.partyId !== party.id) return { success: false, error: `Clock ${params.clockId} not found.` };

  clock.isResolved = true;
  clock.outcome = params.outcome;

  logEvent(party, "clock_resolved", null, {
    clockId: clock.id, name: clock.name, outcome: params.outcome,
    turnsRemaining: clock.turnsRemaining,
  });

  return {
    success: true,
    data: { clockId: clock.id, name: clock.name, outcome: params.outcome },
  };
}
```

**`handleListClocks`:**
Returns all clocks for the DM's party. Include both active and resolved.

### 6c. Add REST routes

```typescript
dm.post("/clock", async (c) => {
  const body = await c.req.json();
  return respond(c, gm.handleCreateClock(c.get("user").userId, body));
});

dm.post("/clock/:clockId/advance", async (c) => {
  const body = await c.req.json<{ turns?: number }>().catch(() => ({}));
  return respond(c, gm.handleAdvanceClock(c.get("user").userId, { clockId: c.req.param("clockId"), ...body }));
});

dm.post("/clock/:clockId/resolve", async (c) => {
  const body = await c.req.json<{ outcome: string }>();
  return respond(c, gm.handleResolveClock(c.get("user").userId, { clockId: c.req.param("clockId"), ...body }));
});

dm.get("/clocks", (c) => respond(c, gm.handleListClocks(c.get("user").userId)));
```

### 6d. Expose public clocks in player status

In `handleGetStatus`, if there are public clocks for the player's party, include them in the response:

```typescript
const publicClocks = [...clocks.values()]
  .filter(c => c.partyId === party.id && c.visibility === "public" && !c.isResolved)
  .map(c => ({ name: c.name, description: c.description, turnsRemaining: c.turnsRemaining }));
```

Add `clocks: publicClocks` to the return data.

**Test:** DM creates clock → listed in DM clocks. Public clock → visible in player status. Advance clock → turnsRemaining decreases. Hits 0 → `hitZero: true` with consequence. Resolve clock → marked resolved.

---

## Task 7: Time Passage Events (J2.2)

**Problem:** DM can't say "three days pass" in a structured way. No time-skip mechanic.

**Files:** `src/game/game-manager.ts`, `src/api/rest.ts`

### 7a. Add handler

```typescript
export function handleAdvanceTime(userId: string, params: {
  amount: number;
  unit: "minutes" | "hours" | "days" | "weeks";
  narrative: string;
}): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };

  // Convert to abstract "turns" for clock ticking
  // DESIGN NOTE: 1:1 mapping — "advance 3 days" = tick 3 turns, same as "advance 3 minutes" = tick 3 turns.
  // This is intentional. Clock granularity is set at clock creation time. For precise control, DM uses advance_clock directly.
  // The MCP tool description MUST state this clearly so the DM agent doesn't assume time-unit-aware decay.
  const turnEquivalent = params.amount;

  // Tick all active clocks for this party
  const tickedClocks: { name: string; turnsRemaining: number; hitZero: boolean }[] = [];
  for (const clock of clocks.values()) {
    if (clock.partyId !== party.id || clock.isResolved) continue;
    clock.turnsRemaining = Math.max(0, clock.turnsRemaining - turnEquivalent);
    tickedClocks.push({
      name: clock.name,
      turnsRemaining: clock.turnsRemaining,
      hitZero: clock.turnsRemaining === 0,
    });
  }

  // Tick info item freshness
  for (const item of infoItems.values()) {
    if (item.partyId !== party.id || item.freshnessTurns === null || item.isStale) continue;
    item.turnsElapsed += turnEquivalent;
    if (item.turnsElapsed >= item.freshnessTurns) {
      item.isStale = true;
    }
  }

  logEvent(party, "time_passage", null, {
    amount: params.amount,
    unit: params.unit,
    narrative: params.narrative,
    clocksUpdated: tickedClocks.length,
    clocksAtZero: tickedClocks.filter(c => c.hitZero).map(c => c.name),
  });

  return {
    success: true,
    data: {
      amount: params.amount,
      unit: params.unit,
      clocks: tickedClocks,
      clocksAtZero: tickedClocks.filter(c => c.hitZero),
    },
  };
}
```

### 7b. Add REST route

```typescript
dm.post("/advance-time", async (c) => {
  const body = await c.req.json<{ amount: number; unit: "minutes" | "hours" | "days" | "weeks"; narrative: string }>();
  return respond(c, gm.handleAdvanceTime(c.get("user").userId, body));
});
```

**Test:** DM creates 2 clocks (10 turns each) → DM advances time by 3 days → both clocks now at 7 → event logged with narrative. Advance by 8 more → one clock hits 0 → `clocksAtZero` includes it.

---

## Task 8: Commentary Track / Meta-Layer (J5.1)

**Problem:** No way for agents to explain *why* they made a decision. Every session is one product when it should be two (the show + the masterclass).

**Files:** `src/game/game-manager.ts`, `src/api/rest.ts`, `src/api/spectator.ts`

### 8a. Accept optional `meta` on all player and DM action endpoints

In `game-manager.ts`, update the `logEvent` function (~line 5188) to accept an optional meta parameter:

```typescript
function logEvent(
  party: GameParty | null,
  type: string,
  actorId: string | null,
  data: Record<string, unknown>,
  meta?: { intent?: string; reasoning?: string; references?: string[] }
): void {
  // ... existing logic ...
  // Add meta to the event data if provided
  if (meta && (meta.intent || meta.reasoning)) {
    event.data = { ...event.data, _meta: meta };
  }
  // ... rest of existing logic ...
}
```

For the REST layer, add a generic meta extraction. In `rest.ts`, create a helper:

```typescript
function extractMeta(body: Record<string, unknown>): { intent?: string; reasoning?: string; references?: string[] } | undefined {
  const meta = body.meta as { intent?: string; reasoning?: string; references?: string[] } | undefined;
  if (!meta || (!meta.intent && !meta.reasoning)) return undefined;
  return meta;
}
```

Then in key action endpoints (attack, cast, move, chat, narrate, end-turn, etc.), pass `body.meta` through to the game-manager handler, which forwards it to `logEvent`.

**The simplest approach (v1 — 3 endpoints only):** Rather than modifying every handler, scope v1 to the 3 highest-signal commentary moments:
- `handleNarrate` → DM narrative intent (why this scene, why this tone)
- `handleAttack` → player combat decisions (why this target, what's the strategy)
- `handlePartyChat` → dialogue intent (what are they trying to accomplish in this conversation)

Add meta extraction to these 3 handlers only. Each handler accepts optional `meta` in its params and passes it to `logEvent`. Mark as expandable to other endpoints in future sprints.

### 8b. Add spectator commentary endpoint

In `spectator.ts`, add:

```typescript
spectator.get("/sessions/:id/commentary", async (c) => {
  const sessionId = c.req.param("id");

  const events = await db.select({
    type: sessionEventsTable.type,
    actorId: sessionEventsTable.actorId,
    data: sessionEventsTable.data,
    createdAt: sessionEventsTable.createdAt,
  })
    .from(sessionEventsTable)
    .where(eq(sessionEventsTable.sessionId, sessionId))
    .orderBy(asc(sessionEventsTable.createdAt));

  // Filter to only events that have _meta
  const commentary = events
    .filter(e => (e.data as Record<string, unknown>)?._meta)
    .map(e => ({
      type: e.type,
      actorId: e.actorId,
      meta: (e.data as Record<string, unknown>)._meta,
      createdAt: e.createdAt.toISOString(),
    }));

  return c.json({ sessionId, commentary });
});
```

**Test:** Player sends `POST /api/v1/attack` with `{target_id: "...", meta: {intent: "Focus fire on wounded goblin", reasoning: "It's the lowest HP target"}}` → event stored with `_meta` → `GET /spectator/sessions/:id/commentary` returns it. Actions without `meta` → not in commentary.

---

## Task 9: Conversation Visualization (J4.1 — Spectator)

**Problem:** Spectators can't distinguish conversations from general gameplay.

**Files:** `src/api/spectator.ts`

### 9a. Add conversations to session detail

In the `spectator.get("/sessions/:id", ...)` handler (~line 1059), after fetching events, extract conversation data:

```typescript
// Extract conversations from events
const conversationStarts = events.filter(e => e.type === "conversation_start");
const conversationEnds = events.filter(e => e.type === "conversation_end");

const conversations = conversationStarts.map(start => {
  const startData = start.data as Record<string, unknown>;
  const convId = startData.conversationId as string;
  const end = conversationEnds.find(e => (e.data as Record<string, unknown>).conversationId === convId);
  const endData = end?.data as Record<string, unknown> | undefined;

  return {
    conversationId: convId,
    participants: startData.participants,
    context: startData.context,
    geometry: startData.geometry ?? null,
    messageCount: endData?.messageCount ?? 0,
    outcome: endData?.outcome ?? null,
    startedAt: start.createdAt.toISOString(),
    endedAt: end?.createdAt?.toISOString() ?? null,
  };
});
```

Add `conversations` to the response JSON.

**Test:** Session with conversations → `GET /spectator/sessions/:id` → response includes `conversations[]` with participants, outcome, message count.

---

## Task 10: Clock Display (J4.2 — Spectator)

**Problem:** Spectators can't see ticking deadlines.

**Files:** `src/api/spectator.ts`

### 10a. Add clocks to session detail

In the same `spectator.get("/sessions/:id", ...)` handler, extract clock data from events:

```typescript
// Extract clocks from events
const clockCreates = events.filter(e => e.type === "clock_created");
const clockAdvances = events.filter(e => e.type === "clock_advanced");
const clockResolves = events.filter(e => e.type === "clock_resolved");

const sessionClocks = clockCreates
  .filter(e => (e.data as Record<string, unknown>).visibility === "public")
  .map(create => {
    const d = create.data as Record<string, unknown>;
    const clockId = d.clockId as string;

    // Find last advance to get current turnsRemaining
    const advances = clockAdvances.filter(a => (a.data as Record<string, unknown>).clockId === clockId);
    const lastAdvance = advances[advances.length - 1];
    const currentTurns = lastAdvance
      ? (lastAdvance.data as Record<string, unknown>).turnsRemaining as number
      : d.turnsRemaining as number;

    const resolution = clockResolves.find(r => (r.data as Record<string, unknown>).clockId === clockId);

    return {
      clockId,
      name: d.name,
      description: d.description ?? null,
      turnsRemaining: currentTurns,
      isResolved: !!resolution,
      outcome: resolution ? (resolution.data as Record<string, unknown>).outcome : null,
    };
  });
```

Add `clocks: sessionClocks` to the response. Only public clocks shown — hidden clocks filtered out.

**Test:** Session with public clock → spectator sees clock name + turns remaining. Clock resolved → shows outcome.

---

## Task 11: NPC Cards (J4.3 — Spectator)

**Problem:** Spectators can't see the cast of characters.

**Files:** `src/api/spectator.ts`

### 11a. Add NPC endpoint to spectator — query DB directly

NPCs are already persisted to the `npcs` table (Task 2 extends it with ENA fields). Query the DB directly rather than reconstructing from events — it's simpler, more reliable, and survives event log truncation.

Add a new route:

```typescript
spectator.get("/sessions/:id/npcs", async (c) => {
  const sessionId = c.req.param("id");

  // Get the party for this session
  const [session] = await db.select({ partyId: gameSessionsTable.partyId })
    .from(gameSessionsTable)
    .where(eq(gameSessionsTable.id, sessionId));

  if (!session) return c.json({ error: "Session not found" }, 404);

  // Get the campaign for this party
  const [party] = await db.select({ campaignId: partiesTable.campaignId })
    .from(partiesTable)
    .where(eq(partiesTable.id, session.partyId));

  if (!party?.campaignId) return c.json({ sessionId, npcs: [] });

  // Query NPCs directly from DB
  const sessionNpcs = await db.select({
    id: npcsTable.id,
    name: npcsTable.name,
    description: npcsTable.description,
    disposition: npcsTable.disposition,
    dispositionLabel: npcsTable.dispositionLabel,
    location: npcsTable.location,
    tags: npcsTable.tags,
    knowledge: npcsTable.knowledge,
    goals: npcsTable.goals,
    isAlive: npcsTable.isAlive,
  })
    .from(npcsTable)
    .where(eq(npcsTable.campaignId, party.campaignId));

  // Count conversations per NPC from events (lightweight supplemental query)
  const convEvents = await db.select({ data: sessionEventsTable.data })
    .from(sessionEventsTable)
    .where(and(
      eq(sessionEventsTable.sessionId, sessionId),
      eq(sessionEventsTable.type, "conversation_start")
    ));

  const npcCards = sessionNpcs.map(npc => {
    const conversationCount = convEvents.filter(e => {
      const participants = (e.data as Record<string, unknown>).participants as { name: string }[];
      return participants?.some(p => p.name === npc.name);
    }).length;

    return {
      npcId: npc.id,
      name: npc.name,
      description: npc.description,
      disposition: npc.disposition,
      dispositionLabel: npc.dispositionLabel,
      location: npc.location,
      tags: npc.tags,
      knowledge: npc.knowledge,  // only public-facing knowledge
      goals: npc.goals,
      isAlive: npc.isAlive,
      conversationCount,
    };
  });

  return c.json({ sessionId, npcs: npcCards });
});
```

**Test:** Session with NPCs → `GET /spectator/sessions/:id/npcs` → returns NPC cards with name, disposition, conversation count, revealed knowledge.

---

## Task 12: Database Migration (Single Migration for All Schema Changes)

**Files:** `src/db/schema.ts`, new migration file `drizzle/0021_ena_sprint_j.sql`

### 12a. Create migration

Create `drizzle/0021_ena_sprint_j.sql`:

```sql
-- Sprint J: Emergent Narrative Architecture
-- Add "conversation" to session_phase enum
ALTER TYPE "session_phase" ADD VALUE IF NOT EXISTS 'conversation';

-- Extend npcs table with ENA fields
ALTER TABLE "npcs" ADD COLUMN IF NOT EXISTS "knowledge" jsonb NOT NULL DEFAULT '[]';
ALTER TABLE "npcs" ADD COLUMN IF NOT EXISTS "goals" jsonb NOT NULL DEFAULT '[]';
ALTER TABLE "npcs" ADD COLUMN IF NOT EXISTS "relationships" jsonb NOT NULL DEFAULT '{}';
ALTER TABLE "npcs" ADD COLUMN IF NOT EXISTS "standing_orders" text;
```

**CRITICAL:** Drizzle runner records migration as applied even on partial failure. Always create a NEW numbered migration — never edit an existing one. If this migration fails partway, create `0022_ena_fix.sql` with the remaining statements.

### 12b. Update schema.ts

In `src/db/schema.ts`:

1. Add `"conversation"` to `sessionPhaseEnum` array (~line 33)
2. Add columns to the `npcs` table definition:

```typescript
knowledge: jsonb("knowledge").notNull().$type<string[]>().default([]),
goals: jsonb("goals").notNull().$type<string[]>().default([]),
relationships: jsonb("relationships").notNull().$type<Record<string, string>>().default({}),
standingOrders: text("standing_orders"),
```

**Test:** Run migration on fresh DB → no errors. Run on existing DB with npcs data → new columns added with defaults, existing data preserved.

---

## Task 13: MCP Tool Definitions for All New Endpoints

**Files:** `src/tools/dm-tools.ts`

Add MCP tool definitions for every new DM endpoint. Follow the existing pattern in the file. Each tool needs: name, description, inputSchema, handler reference.

Tools to add:

| Tool Name | Endpoint | Key Params |
|-----------|----------|------------|
| `skip_turn` | POST /dm/skip-turn | `reason?: string` |
| `start_conversation` | POST /dm/start-conversation | `participants[], context, geometry?` |
| `end_conversation` | POST /dm/end-conversation | `conversationId, outcome, relationshipDelta?` |
| `create_info` | POST /dm/info | `title, content, source, visibility?, freshnessTurns?` |
| `reveal_info` | POST /dm/reveal-info | `infoId, toCharacters[], method` |
| `update_info` | PATCH /dm/info/:id | `content?, visibility?, freshnessTurns?` |
| `list_info` | GET /dm/info | (none) |
| `create_clock` | POST /dm/clock | `name, description, turnsRemaining, visibility?, consequence` |
| `advance_clock` | POST /dm/clock/:id/advance | `turns?` |
| `resolve_clock` | POST /dm/clock/:id/resolve | `outcome` |
| `list_clocks` | GET /dm/clocks | (none) |
| `advance_time` | POST /dm/advance-time | `amount, unit, narrative` |

Also update the existing `narrate` tool schema to include `type` and `npc_id` optional params.

Write clear, DM-facing descriptions. The DM agent reads these to know what tools are available. Examples:

- `start_conversation`: "Begin a structured conversation between players and NPCs. Sets the session phase to 'conversation' and tracks all messages exchanged. Use when players engage in meaningful dialogue with an NPC."
- `create_clock`: "Create a ticking deadline. Clocks count down turns and fire consequences when they hit zero. Use to create urgency — 'The Baron's army arrives in 20 turns.'"
- `create_info`: "Create a piece of discoverable information in the world. Hidden by default. Use reveal_info to let specific characters learn it."

**Test:** Connect as DM via MCP → tool list includes all new tools → tool schemas match the REST endpoints.

---

## Notes for CC

- **Build order matters.** Task 12 (migration) first, then Tier 0 bugs, then Task 1 (conversation lifecycle) — everything else builds on these.
- **Backward compatibility is critical.** Existing templates, sessions, and gameplay must work exactly as before. All new fields are optional. All new systems are additive.
- **The NPC system already exists.** Do NOT rebuild — extend. Read the existing `GameNPC` interface, `npcsMap`, and CRUD handlers before writing code.
- **The `logEvent` function is the backbone.** All new systems log through it. Keep event types consistent: `snake_case`, descriptive. Spectator UI and commentary track both read from the event log.
- **Tests:** Use `test-runner.sh` (30s hard kill). Write unit tests for the new systems in `tests/`. Focus on: conversation lifecycle transitions, clock advancement math, info item freshness decay, blueprint loading backward compat.
- **Frontend (Tasks 9-11):** These are spectator API changes only — the frontend HTML files render from API data. No need to modify `theater.html` or `tracker.html` in this sprint unless you want to add visual polish. The API changes are what matter.
- **Don't touch `session.ts` exports that combat depends on.** The session state changes (adding `conversations`, `activeConversationId`) must not break `enterCombat`, `nextTurn`, `exitCombat`, etc.
