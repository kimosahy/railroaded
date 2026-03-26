# Sprint J-Fix — Wire the Plumbing (CC Task File)

> **BEFORE YOU START:** Read `CLAUDE.md` (game design spec), `docs/cc-patterns.md`. Tests use `test-runner.sh` (30s hard kill — no local Postgres, DB pool retries forever without it). Run tests after EVERY task.

## Context

Sprint J shipped the ENA (Emergent Narrative Architecture) — conversations, NPC registry extensions, info items, clocks, time passage, structured narration. The **REST endpoints all work**. The **MCP bridge was never wired**. Since agents connect via MCP, they can't use ANY Sprint J feature. This sprint fixes that plus 6 other bugs found during playtest.

**Priority:** This is a bugfix/wiring sprint. No new features. Every change has a clear before/after.

---

## Task 1: Wire ALL Sprint J MCP Handlers (P0 — THE critical fix)

**Problem:** All 12 Sprint J MCP tools show up in `tools/list` but every call returns `"Tool has no handler implementation"`. The `executeToolCall` switch in `src/api/mcp.ts` has no `case` entries for them. The handler functions exist in `game-manager.ts` and work via REST.

**File:** `src/api/mcp.ts` — add cases to the `executeToolCall` switch (before the `default:` case, after `case "unlock_exit":`)

Add these cases:

```typescript
    // --- Sprint J: Conversations ---
    case "start_conversation":
      return gm.handleStartConversation(userId, {
        participants: args.participants as { name: string; type: "player" | "npc"; id: string }[],
        context: args.context as string | undefined,
        geometry: args.geometry as string | undefined,
        location: args.location as string | undefined,
      });
    case "end_conversation":
      return gm.handleEndConversation(userId, {
        conversationId: args.conversation_id as string,
        outcome: args.outcome as string | undefined,
      });

    // --- Sprint J: Information items ---
    case "create_info":
      return gm.handleCreateInfoItem(userId, {
        title: args.title as string,
        content: args.content as string,
        source: args.source as string | undefined,
        visibility: args.visibility as "public" | "hidden" | undefined,
        freshnessTurns: args.freshness_turns as number | undefined,
      });
    case "reveal_info":
      return gm.handleRevealInfo(userId, {
        infoId: args.info_id as string,
        characterId: args.character_id as string,
        method: args.method as "overheard" | "told" | "found" | "deduced" | undefined,
      });
    case "update_info":
      return gm.handleUpdateInfoItem(userId, {
        infoId: args.info_id as string,
        content: args.content as string | undefined,
        visibility: args.visibility as "public" | "hidden" | undefined,
      });
    case "list_info":
      return gm.handleListInfoItems(userId);

    // --- Sprint J: Clocks ---
    case "create_clock":
      return gm.handleCreateClock(userId, {
        name: args.name as string,
        description: args.description as string ?? "",
        turnsRemaining: args.turns_remaining as number,
        visibility: args.visibility as "hidden" | "public" | undefined,
        consequence: args.consequence as string,
      });
    case "advance_clock":
      return gm.handleAdvanceClock(userId, {
        clockId: args.clock_id as string,
        turns: args.turns as number | undefined,
      });
    case "resolve_clock":
      return gm.handleResolveClock(userId, {
        clockId: args.clock_id as string,
        outcome: args.outcome as string,
      });
    case "list_clocks":
      return gm.handleListClocks(userId);

    // --- Sprint J: Time & Turn ---
    case "advance_time":
      return gm.handleAdvanceTime(userId, {
        amount: args.amount as number,
        unit: args.unit as "minutes" | "hours" | "days" | "weeks",
        narrative: args.narrative as string,
      });
    case "skip_turn":
      return gm.handleForceSkipTurn(userId, {
        reason: args.reason as string | undefined,
      });
```

**IMPORTANT mapping notes:**
- MCP tool schemas in `dm-tools.ts` use snake_case (`info_id`, `clock_id`, `turns_remaining`, `conversation_id`, `character_id`, `freshness_turns`). The handler functions in `game-manager.ts` use camelCase (`infoId`, `clockId`, `turnsRemaining`, `conversationId`, `characterId`, `freshnessTurns`). The MCP cases above handle the translation. **Verify each mapping against the inputSchema in `dm-tools.ts` and the function signature in `game-manager.ts`.**
- `narrate` already has a handler in the switch — but verify it passes the Sprint J fields: `type`, `npcId`, `metadata`, `meta`. Current case only passes `text`. Update it:

```typescript
    case "narrate":
      return gm.handleNarrate(userId, {
        text: args.text as string,
        style: args.style as string | undefined,
        type: args.type as "scene" | "npc_dialogue" | "atmosphere" | "transition" | "intercut" | "ruling" | undefined,
        npcId: args.npc_id as string | undefined,
        metadata: args.metadata as Record<string, unknown> | undefined,
        meta: args.meta as { intent?: string; reasoning?: string; references?: string[] } | undefined,
      });
```

**Test:** Write `tests/mcp-sprint-j.test.ts` — unit test each new case to verify it calls the handler and returns success (mock the game state or use the test harness pattern from existing MCP tests). At minimum, verify no "no handler" error for each tool name.

---

## Task 2: Fix create_npc MCP Passthrough (P0)

**Problem:** The `case "create_npc"` in `src/api/mcp.ts` doesn't pass the ENA fields (`knowledge`, `goals`, `relationships`, `standingOrders`). The handler in `game-manager.ts:4733` accepts them and persists them correctly. The MCP case just doesn't forward them.

**File:** `src/api/mcp.ts` — find the existing `case "create_npc":` block and add the missing fields:

**Current (broken):**
```typescript
    case "create_npc":
      return gm.handleCreateNpc(userId, {
        name: args.name as string,
        description: args.description as string,
        personality: args.personality as string | undefined,
        location: args.location as string | undefined,
        disposition: args.disposition as number | undefined,
        tags: args.tags as string[] | undefined,
      });
```

**Fixed:**
```typescript
    case "create_npc":
      return gm.handleCreateNpc(userId, {
        name: args.name as string,
        description: args.description as string,
        personality: args.personality as string | undefined,
        location: args.location as string | undefined,
        disposition: args.disposition as number | undefined,
        tags: args.tags as string[] | undefined,
        knowledge: args.knowledge as string[] | undefined,
        goals: args.goals as string[] | undefined,
        relationships: args.relationships as Record<string, string> | undefined,
        standingOrders: args.standing_orders as string | undefined,
      });
```

**Note:** MCP schema uses `standing_orders` (snake_case), handler uses `standingOrders` (camelCase). Verify against `dm-tools.ts` schema.

**Test:** Add test to `tests/mcp-sprint-j.test.ts` verifying create_npc returns knowledge/goals in response.

---

## Task 3: Fix update_npc_disposition Validation (P1)

**Problem:** If an agent sends the wrong field name (e.g., `disposition` instead of `change`), the `change` param is `undefined`, cast to `NaN`, and the disposition becomes `null` in the DB.

**File:** `src/game/game-manager.ts` — in `handleUpdateNpcDisposition` (~line 4934), add validation after extracting params:

```typescript
  if (typeof params.change !== "number" || !isFinite(params.change)) {
    return { success: false, error: "Parameter 'change' must be a finite number (e.g., +10 or -5). It represents the delta, not the target value." };
  }
```

Add this right after the `if (!ctx)` check, before `const oldDisp = npc.disposition`.

**Test:** Add test case: call `handleUpdateNpcDisposition` with `change: undefined` — should return error, not corrupt data.

---

## Task 4: Fix Spectator NPC Endpoint (P1)

**Problem:** `GET /spectator/sessions/:id/npcs` returns `{"error": "Failed to fetch NPCs"}` (500). The query in `src/api/spectator.ts:1304` chains through `game_sessions → parties → npcs`. The likely issue: `parties.campaignId` is null for sessions that started before campaigns were created, OR the join doesn't find the party.

**File:** `src/api/spectator.ts` — in the `/sessions/:id/npcs` handler (~line 1304):

1. Add better error handling — log the actual error to console before returning 500.
2. Check if `party.campaignId` is null and return empty array gracefully instead of querying with null.
3. The `campaignId` column in `parties` table might be the **DB UUID** while `npcsTable.campaignId` also references the DB UUID — verify these are the same type. If the party was created before campaign support, `campaignId` will be null.

**Current code fragment (line 1320):**
```typescript
    if (!party?.campaignId) return c.json({ sessionId, npcs: [] });
```

This guard looks correct. The 500 is probably thrown BEFORE this line — in the session lookup or party lookup. Wrap each DB query in individual try/catch to isolate which query fails:

```typescript
    let session;
    try {
      [session] = await db.select({ partyId: gameSessionsTable.partyId })
        .from(gameSessionsTable)
        .where(eq(gameSessionsTable.id, sessionId));
    } catch (err) {
      console.error("[Spectator NPCs] Session lookup failed:", err);
      return c.json({ error: "Session lookup failed" }, 500);
    }
    if (!session) return c.json({ error: "Session not found" }, 404);

    let party;
    try {
      [party] = await db.select({ campaignId: partiesTable.campaignId })
        .from(partiesTable)
        .where(eq(partiesTable.id, session.partyId));
    } catch (err) {
      console.error("[Spectator NPCs] Party lookup failed:", err);
      return c.json({ error: "Party lookup failed" }, 500);
    }
```

Also check: if `sessionId` is an in-memory ID (like `session-1`) rather than a DB UUID, the `eq()` comparison will fail or throw. The spectator API typically translates between in-memory and DB IDs — make sure this endpoint does too.

**Test:** Write test in `tests/mcp-sprint-j.test.ts` that calls the NPC spectator endpoint with a valid session ID and with an invalid one.

---

## Task 5: Fix Spectator Narration Type (P2)

**Problem:** `handleNarrate` stores `narrateType` in event data (confirmed in game-manager.ts:3033), but the spectator event formatter (`src/api/spectator.ts:1533`) ignores it — all narrations render as generic `📜 [text]`.

**File:** `src/api/spectator.ts` — update the `case "narration":` block in the event formatter:

**Current:**
```typescript
    case "narration": {
      const text = data.text as string | undefined;
      if (!text) return null;
      return text.length > 100
        ? `📜 ${text.substring(0, 97)}...`
        : `📜 ${text}`;
    }
```

**Fixed:** Add type-specific emoji prefix:
```typescript
    case "narration": {
      const text = data.text as string | undefined;
      if (!text) return null;
      const narType = data.narrateType as string | undefined;
      const icon = narType === "intercut" ? "🎬"
        : narType === "npc_dialogue" ? "💬"
        : narType === "atmosphere" ? "🌫️"
        : narType === "transition" ? "🚪"
        : narType === "ruling" ? "⚖️"
        : "📜"; // default "scene"
      const truncated = text.length > 100 ? `${text.substring(0, 97)}...` : text;
      return `${icon} ${truncated}`;
    }
```

Also: in the detailed session endpoint (where full events are returned, not just formatted strings), ensure the `narrateType` field is included in the event data response so frontends can differentiate.

**Test:** Add test verifying narration events with different `narrateType` values produce different emoji prefixes.

---

## Task 6: Fix Clock Create Crash on Missing Fields (P2)

**Problem:** `POST /dm/clock` without `description` or `consequence` fields throws 500 because `handleCreateClock` calls `.trim()` on `undefined`.

**File:** `src/game/game-manager.ts` — in `handleCreateClock` (~line 5226):

Add defaults for optional-ish fields:
```typescript
  const clock: SessionClock = {
    id: clockId,
    partyId: party.id,
    name: params.name.trim(),
    description: (params.description ?? "").trim(),
    turnsRemaining: params.turnsRemaining,
    turnsTotal: params.turnsRemaining,
    visibility: params.visibility ?? "public",
    consequence: (params.consequence ?? "").trim(),
    isResolved: false,
    createdAt: new Date(),
  };
```

Changes:
- `params.description` → `(params.description ?? "").trim()` — prevent crash
- `params.consequence` → `(params.consequence ?? "").trim()` — prevent crash  
- Default visibility changed from `"hidden"` to `"public"` — matches what spectators expect

Also update the function signature to make `description` and `consequence` optional:
```typescript
  description?: string;
  consequence?: string;
```

**Test:** Call `handleCreateClock` with minimal params (just `name` + `turnsRemaining`) — should succeed, not 500.

---

## Task 7: Add Player Auto-Advance After All Resources Used (P2)

**Problem:** After a player attacks, their turn doesn't advance. The DM must call `skip_turn` after every player action. In D&D 5e this is correct (players have action + bonus + movement), but for AI agents it's poor ergonomics.

**File:** `src/game/game-manager.ts` — add a helper function and call it at the end of every player action handler.

**New helper (add near the turn resource functions):**
```typescript
function checkAutoAdvanceTurn(party: GameParty, characterId: string): void {
  if (!party.session || party.session.phase !== "combat") return;
  const current = getCurrentCombatant(party.session);
  if (!current || current.entityId !== characterId) return;
  
  const resources = getTurnResources(party, characterId);
  // Auto-advance if action AND bonus action are used (movement is free, don't gate on it)
  if (resources.actionUsed && resources.bonusUsed) {
    resetTurnResources(party, characterId);
    party.session = nextTurn(party.session);
    advanceTurnSkipDead(party);
    logEvent(party, "turn_auto_advanced", characterId, { reason: "all_resources_used" });
    notifyTurnChange(party);
  }
}
```

**Call it** at the end of these handlers (after the return data is prepared but before the final `return`):
- `handleAttack` — after logging the attack event
- `handleCast` — after logging the cast event  
- `handleDodge`, `handleDash`, `handleDisengage`, `handleHelp`, `handleHide` — after logging

**Do NOT call it** from `handleBonusAction` or `handleReaction` — those don't consume the main action.

Wait — `handleBonusAction` consumes `bonusUsed`, and `handleAttack` consumes `actionUsed`. So the auto-advance should fire when BOTH are used. This means you need to call `checkAutoAdvanceTurn` from BOTH action-consuming handlers AND bonus-action-consuming handlers. The check function already verifies both are used before advancing.

**Test:** Write test: attack (action used) → bonus action (bonus used) → turn should auto-advance. Also: attack only → turn should NOT auto-advance.

---

## Summary Checklist

| # | Task | File(s) | Priority |
|---|------|---------|----------|
| 1 | Wire 12 Sprint J MCP handlers + update narrate | `src/api/mcp.ts` | P0 |
| 2 | Fix create_npc to pass ENA fields | `src/api/mcp.ts` | P0 |
| 3 | Validate change param in update_npc_disposition | `src/game/game-manager.ts` | P1 |
| 4 | Fix spectator NPC endpoint error handling | `src/api/spectator.ts` | P1 |
| 5 | Spectator narration type differentiation | `src/api/spectator.ts` | P2 |
| 6 | Clock create crash on missing fields | `src/game/game-manager.ts` | P2 |
| 7 | Player auto-advance on resources exhausted | `src/game/game-manager.ts` | P2 |

**Estimated scope:** ~200 lines of code changes + ~150 lines of tests. All in 3 files. No new dependencies. No migrations.

**Run `./test-runner.sh` after EACH task.** Existing 1097 tests must continue to pass. No regressions.
