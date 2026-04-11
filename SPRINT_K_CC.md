# Sprint K — Stabilization Pass (CC Task File)

> **BEFORE YOU START:** Read `CLAUDE.md` (game design spec) and `docs/cc-patterns.md`. Tests use `./test-runner.sh` (30s hard kill — no local Postgres, DB pool retries forever without it). **Never use raw `bun test`.**

---

## Context

Sprint J delivered the Emergent Narrative Architecture (ENA) — conversations, clocks, info items, NPC extensions. A follow-up J-Fix wired the 12 missing MCP handlers, improved spectator NPC error handling, added narration type icons, clock defaults, disposition validation, and auto-advance turn logic. **J-Fix is committed but never deployed** because CI hangs (Task K0 fixes this).

Poormetheus playtested on Mar 29 against the pre-J-Fix server (`0c11072`). Some bugs he found are already fixed by J-Fix code that's in the repo but not deployed. This sprint fixes the **remaining** issues — the ones J-Fix didn't cover — plus the CI blocker.

**After this sprint, push to main. CI will pass, deploy will trigger, and ALL fixes (J-Fix + Sprint K) deploy together.**

---

## Task Sequence

```
K0: CI timeout fix (BLOCKER — nothing deploys without this)
K1: Combat NaN regression (P0 — spawn_encounter broken)
K2: Phase corruption safety guard (P1 — conversation phase recovery)
K3: update_npc MCP wiring gap (P1 — ENA fields not forwarded)
K4: Disposition string-to-number coercion (P2 — "friendly" → NaN)
K5: standing_orders array coercion (P2 — array input crashes)
K6: Spectator /clocks route (P1 — 404, route missing)
K7: Spectator /conversations route (P1 — 404, route missing)
```

Build order: K0 → K1 → K2 → K3 → K4 → K5 → K6 → K7. Commit after each task.

---

## Task K0: Fix CI Timeout (BLOCKER)

**Problem:** GitHub Actions runs `bun test` which hangs indefinitely on DB pool cleanup (no local Postgres). The deploy job depends on test success, so nothing deploys.

**File:** `.github/workflows/deploy.yml`

Replace the test step:

```yaml
      - name: Run tests
        run: bun test
```

With:

```yaml
      - name: Run tests
        run: |
          timeout 60 bun test || EXIT=$?
          if [ "${EXIT:-0}" -eq 124 ] || [ "${EXIT:-0}" -eq 137 ]; then
            echo "Tests completed (killed hanging DB pool cleanup)"
            exit 0
          fi
          exit ${EXIT:-0}
```

This mirrors the local `test-runner.sh` pattern — tests finish in <5s, the hang is DB pool cleanup. Exit codes 124 (timeout) and 137 (SIGKILL) mean tests passed but process hung on cleanup.

**Acceptance:** Push to main → GitHub Actions completes → Render deploy hook fires.

**Commit:** `K0: Fix CI timeout — bun test hangs without Postgres`

---

## Task K1: Fix Combat NaN Regression (P0 — B065)

**Problem:** `spawn_encounter` fails with `"Invalid dice notation: 1d20NaN"`. Initiative roll modifier is NaN because a player's DEX score resolves to `undefined`.

**Root cause:** In `src/game/game-manager.ts` at line ~3163, the spawn_encounter handler builds the players array:

```typescript
const players = party.members
  .map((mid) => characters.get(mid))
  .filter(Boolean)
  .map((c) => ({ id: c!.id, name: c!.name, dexScore: c!.abilityScores.dex }));
```

The `AbilityScores` interface uses short names (`dex`), and the MCP tool schema requires them (`required: ["str", "dex", "con", "int", "wis", "cha"]`). But if any character was created with an agent that sent long names (`dexterity` instead of `dex`), or if `abilityScores.dex` is somehow `undefined` or `null`, the value becomes `NaN` which propagates into `rollD20` via `abilityModifier(NaN)` → `Math.floor((NaN - 10) / 2)` → `NaN` → dice notation `"1d20NaN"`.

**Fix:** Add a defensive fallback. In `src/game/game-manager.ts`, find the line (around line 3163):

```typescript
.map((c) => ({ id: c!.id, name: c!.name, dexScore: c!.abilityScores.dex }));
```

Replace with:

```typescript
.map((c) => ({ id: c!.id, name: c!.name, dexScore: c!.abilityScores.dex ?? c!.abilityScores.dexterity ?? 10 }));
```

The `?? 10` ensures a fallback to the D&D default (modifier +0) if both are missing. TypeScript may warn about `dexterity` not existing on `AbilityScores` — cast if needed: `(c!.abilityScores as any).dexterity`.

**Acceptance:** `spawn_encounter` with any monsters succeeds. Initiative order shows numeric values, no NaN.

**Commit:** `K1: Fix combat NaN — defensive DEX score fallback in initiative`

---

## Task K2: Phase Corruption Safety Guard (P1 — B067)

**Problem:** If `start_conversation` crashes mid-execution, the session phase gets set to `"conversation"` but no conversation object is created. The session is permanently stuck — `end_conversation` can't find the non-existent conversation, and no other action can proceed because phase is wrong.

**Note:** The J-Fix wired the `start_conversation` handler (it was returning "no handler" before), so the crash itself is likely fixed. But we still need a safety guard against future phase corruption.

**File:** `src/game/game-manager.ts` — `handleStartConversation` (line ~5040)

**Fix 1 — Make phase transition atomic:** Move the phase change AFTER conversation creation succeeds. Find:

```typescript
  party.session.conversations.push(conversation);
  party.session.activeConversationId = convId;
  party.session.phase = "conversation";
```

This is already in the right order (create, then set phase), so this is fine. But wrap the whole block in a safety pattern — if the push fails or anything throws, phase must not change:

```typescript
  try {
    party.session.conversations.push(conversation);
    party.session.activeConversationId = convId;
    party.session.phase = "conversation";
  } catch (err) {
    // Rollback: remove conversation if push succeeded but later line failed
    const idx = party.session.conversations.findIndex(c => c.id === convId);
    if (idx !== -1) party.session.conversations.splice(idx, 1);
    party.session.activeConversationId = null;
    party.session.phase = "exploration";
    return { success: false, error: `Failed to start conversation: ${(err as Error).message}` };
  }
```

**Fix 2 — Recovery in `handleEndConversation`:** In `handleEndConversation` (line ~5081), after the `conv` lookup fails, add orphan recovery:

Find the line:
```typescript
  const conv = party.session.conversations.find(c => c.id === params.conversationId);
  if (!conv) return { success: false, error: `Conversation ${params.conversationId} not found.` };
```

Replace with:
```typescript
  const conv = party.session.conversations.find(c => c.id === params.conversationId);
  if (!conv) {
    // Orphan recovery: if phase is stuck on "conversation" but no matching conversation exists, reset
    if (party.session.phase === "conversation") {
      party.session.phase = "exploration";
      party.session.activeConversationId = null;
      return { success: true, data: { recovered: true, message: "Orphaned conversation phase reset to exploration." } };
    }
    return { success: false, error: `Conversation ${params.conversationId} not found.` };
  }
```

**Acceptance:** If phase is "conversation" with no active conversation, calling `end_conversation` with any ID resets to "exploration" gracefully.

**Commit:** `K2: Phase corruption guard — atomic conversation transitions + orphan recovery`

---

## Task K3: Wire ENA Fields in update_npc MCP Handler (P1 — B069)

**Problem:** `update_npc` silently drops `knowledge`, `goals`, `relationships`, and `standing_orders`. The MCP handler in `mcp.ts` doesn't forward these fields to the game-manager handler, even though the game-manager handler (`handleUpdateNpc` at line ~4898) already supports them.

**File:** `src/api/mcp.ts` — find `case "update_npc":` (line ~472)

Current code:
```typescript
    case "update_npc":
      return gm.handleUpdateNpc(userId, {
        npc_id: args.npc_id as string,
        description: args.description as string | undefined,
        personality: args.personality as string | undefined,
        location: args.location as string | undefined,
        tags: args.tags as string[] | undefined,
        is_alive: args.is_alive as boolean | undefined,
      });
```

Replace with:
```typescript
    case "update_npc":
      return gm.handleUpdateNpc(userId, {
        npc_id: args.npc_id as string,
        description: args.description as string | undefined,
        personality: args.personality as string | undefined,
        location: args.location as string | undefined,
        tags: args.tags as string[] | undefined,
        is_alive: args.is_alive as boolean | undefined,
        knowledge: args.knowledge as string[] | undefined,
        goals: args.goals as string[] | undefined,
        relationships: args.relationships as Record<string, string> | undefined,
        standingOrders: args.standing_orders as string | undefined,
      });
```

**Acceptance:** `update_npc` with `knowledge`, `goals`, `relationships`, or `standing_orders` fields persists them. Verified via `get_npc`.

**Commit:** `K3: Wire ENA fields in update_npc MCP handler`

---

## Task K4: Disposition String-to-Number Coercion (P2 — B074)

**Problem:** `create_npc` with `disposition: "friendly"` (string) produces `disposition: null, disposition_label: "devoted"`. The MCP tool schema defines disposition as `type: "integer"`, but agents sometimes send strings. When a string like `"friendly"` hits `Math.max(-100, Math.min(100, "friendly" ?? 0))`, it becomes `NaN`, which then gets clamped incorrectly.

**File:** `src/game/game-manager.ts` — `handleCreateNpc` (line ~4780)

Find the line:
```typescript
  const disp = Math.max(-100, Math.min(100, params.disposition ?? 0));
```

Replace with:
```typescript
  // Coerce string dispositions to numbers
  let rawDisp = params.disposition ?? 0;
  if (typeof rawDisp === "string") {
    const dispMap: Record<string, number> = {
      hostile: -100, unfriendly: -50, wary: -25,
      neutral: 0, friendly: 50, allied: 75, devoted: 100,
    };
    rawDisp = dispMap[(rawDisp as string).toLowerCase()] ?? 0;
  }
  const disp = Math.max(-100, Math.min(100, rawDisp));
```

Also update the `disposition` param type in the function signature from `disposition?: number` to `disposition?: number | string` (cast appropriately).

**Acceptance:** `create_npc` with `disposition: "friendly"` → `disposition: 50, disposition_label: "friendly"`. String and number inputs both work.

**Commit:** `K4: Coerce disposition strings to numeric values in create_npc`

---

## Task K5: standing_orders Array Coercion (P2 — B068)

**Problem:** `create_npc` with `standing_orders: ["patrol north gate", "report intruders"]` (array) crashes because the handler expects a string. The DM tool schema defines it as `type: "string"`, but agents may send arrays.

**File:** `src/game/game-manager.ts` — `handleCreateNpc` (line ~4799)

Find the line where `standingOrders` is stored:
```typescript
    standingOrders: params.standingOrders?.trim() ?? null,
```

Replace with:
```typescript
    standingOrders: (Array.isArray(params.standingOrders) ? params.standingOrders.join("; ") : params.standingOrders)?.trim() ?? null,
```

Do the same in `handleUpdateNpc` (line ~4924):
```typescript
  if (params.standingOrders !== undefined) npc.standingOrders = params.standingOrders.trim() || null;
```
Replace with:
```typescript
  if (params.standingOrders !== undefined) {
    const so = Array.isArray(params.standingOrders) ? params.standingOrders.join("; ") : params.standingOrders;
    npc.standingOrders = so?.trim() || null;
  }
```

Update both function signatures to accept `standingOrders?: string | string[]`.

**Acceptance:** Both string and array inputs for `standing_orders` work without crashing.

**Commit:** `K5: Coerce standing_orders arrays to semicolon-joined strings`

---

## Task K6: Spectator /clocks Route (P1 — B072)

**Problem:** `GET /spectator/sessions/:id/clocks` returns 404. The route was never registered.

**File:** `src/api/spectator.ts` — add after the `/sessions/:id/npcs` route (ends around line 1387, before `/sessions/:id/events`)

**Implementation:**

```typescript
// GET /spectator/sessions/:id/clocks — active clocks for a session
spectator.get("/sessions/:id/clocks", (c) => {
  const sessionId = c.req.param("id");
  const state = gm.getState();

  // Find the party for this session
  let targetParty: (typeof state.parties)[number] | null = null;
  for (const p of state.parties) {
    if (p.session?.id === sessionId) {
      targetParty = p;
      break;
    }
  }

  if (!targetParty) {
    return c.json({ sessionId, clocks: [], error: "Session not found or not active" });
  }

  // Clocks are stored in a module-level Map keyed by clock ID.
  // Filter to this party's clocks and only return public ones.
  const partyClocks = state.clocks
    ?.filter((ck: any) => ck.partyId === targetParty!.id && ck.visibility === "public")
    .map((ck: any) => ({
      clockId: ck.id,
      name: ck.name,
      description: ck.description,
      turnsRemaining: ck.turnsRemaining,
      turnsTotal: ck.turnsTotal,
      isResolved: ck.isResolved,
      outcome: ck.outcome ?? null,
    })) ?? [];

  return c.json({ sessionId, clocks: partyClocks });
});
```

**IMPORTANT — `getState()` prerequisite:** The current `getState()` at line 6600 of `game-manager.ts` only returns `{ characters, parties, playerQueue, dmQueue, campaigns }`. It does NOT include `clocks`, `infoItems`, or `npcsMap`. Before writing the spectator route, update `getState()`:

Find:
```typescript
export function getState() {
  return { characters, parties, playerQueue, dmQueue, campaigns: campaignsMap };
}
```

Replace with:
```typescript
export function getState() {
  return { characters, parties, playerQueue, dmQueue, campaigns: campaignsMap, clocks, infoItems, npcs: npcsMap };
}
```

The `clocks` Map is defined at line ~236, `infoItems` at line ~221, `npcsMap` at line ~209. All are module-level `Map` objects.

Now for the spectator route: since clocks are keyed by `clockId` (not by session or party), the route must:
1. Find the party whose `session.id` matches the URL param
2. Filter clocks by that party's `partyId`
3. Return only public clocks

The code above does this. If `state.clocks` is a Map (not an array), convert it: `[...state.clocks.values()]` before filtering.

**Acceptance:** `GET /spectator/sessions/:id/clocks` returns public clocks with `clockId`, `name`, `description`, `turnsRemaining`, `turnsTotal`, `isResolved`.

**Commit:** `K6: Add spectator /clocks endpoint + expose clocks in getState`

---

## Task K7: Spectator /conversations Route (P1 — B073)

**Problem:** `GET /spectator/sessions/:id/conversations` returns 404. Route was never registered.

**File:** `src/api/spectator.ts` — add after the `/sessions/:id/clocks` route (added in K6)

**Implementation:** Conversations live on `party.session.conversations` (an array on the `SessionState` object), so we access them via `getState().parties`:

```typescript
// GET /spectator/sessions/:id/conversations — conversation history for a session
spectator.get("/sessions/:id/conversations", (c) => {
  const sessionId = c.req.param("id");
  const state = gm.getState();

  let targetSession: any = null;
  for (const p of state.parties) {
    if (p.session?.id === sessionId) {
      targetSession = p.session;
      break;
    }
  }

  if (!targetSession) {
    return c.json({ sessionId, conversations: [], error: "Session not found or not active" });
  }

  const convos = (targetSession.conversations ?? []).map((conv: any) => ({
    conversationId: conv.id,
    participants: conv.participants?.map((p: any) => ({ type: p.type, name: p.name })) ?? [],
    context: conv.context,
    status: conv.outcome ? "ended" : "active",
    startedAt: conv.startedAt,
    outcome: conv.outcome ?? null,
  }));

  return c.json({ sessionId, conversations: convos });
});
```

**Acceptance:** `GET /spectator/sessions/:id/conversations` returns conversation list with `conversationId`, `participants`, `context`, `status`, `startedAt`.

**Commit:** `K7: Add spectator /conversations endpoint`

---

## Final Testing Checklist

Run `./test-runner.sh` after each task. All existing tests must pass. After all tasks:

1. ✅ Push to main — CI passes (K0 fix), deploy triggers
2. ✅ `spawn_encounter` works — no NaN errors (K1)
3. ✅ `start_conversation` → `end_conversation` — clean phase transitions (K2)
4. ✅ Stuck "conversation" phase — `end_conversation` recovers gracefully (K2)
5. ✅ `update_npc` with `knowledge`/`goals`/`relationships`/`standing_orders` — persists (K3)
6. ✅ `create_npc` with `disposition: "friendly"` — maps to 50, label "friendly" (K4)
7. ✅ `create_npc` with `standing_orders: ["a", "b"]` — joins to "a; b" (K5)
8. ✅ `GET /spectator/sessions/:id/clocks` — returns public clocks (K6)
9. ✅ `GET /spectator/sessions/:id/conversations` — returns conversation list (K7)

---

## What NOT to Touch

These were already fixed by J-Fix (committed but not yet deployed):

- **MCP handler wiring** for all 12 Sprint J tools (create_info, start_conversation, etc.) — DONE in `fc43067`
- **Spectator /npcs UUID validation + error isolation** — DONE in `044d1be`
- **Narration type icons** (atmosphere, dialogue, etc.) — DONE in `044d1be`
- **Clock `description`/`consequence` optional + visibility default** — DONE in `044d1be`
- **Auto-advance turn** when action+bonus both used — DONE in `044d1be`
- **Disposition `change` param validation** — DONE in `044d1be`

Do not duplicate these fixes. They deploy with this sprint automatically.
