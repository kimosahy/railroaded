# Sprint J-Fix — Remaining Tasks (3–7)

> **BEFORE YOU START:** Read `CLAUDE.md`, `docs/cc-patterns.md`. Tests: `./test-runner.sh` (30s hard kill). Run after EACH task. Tasks 1+2 (MCP handler wiring + create_npc ENA fields) are DONE and committed. This file covers the remaining 5 tasks.

---

## Task 3: Validate change param in update_npc_disposition (P1)

**File:** `src/game/game-manager.ts` — `handleUpdateNpcDisposition` (~line 4934)

Add validation after the NPC lookup, before `const oldDisp = npc.disposition`:

```typescript
  if (typeof params.change !== "number" || !isFinite(params.change)) {
    return { success: false, error: "Parameter 'change' must be a finite number (e.g., +10 or -5). It represents the delta, not the target value." };
  }
```

**Test:** In `tests/game-manager.test.ts`, add a test in the NPC section: call `handleUpdateNpcDisposition` with `change: undefined as any` — should return error, disposition unchanged.

**Commit after this task.**

---

## Task 4: Fix spectator NPC endpoint error handling (P1)

**File:** `src/api/spectator.ts` — handler at `GET /sessions/:id/npcs` (~line 1304)

The endpoint throws 500 "Failed to fetch NPCs". Replace the single giant try/catch with isolated error handling per query:

```typescript
spectator.get("/sessions/:id/npcs", async (c) => {
  const sessionId = c.req.param("id");

  try {
    // Step 1: Get session's party
    const [session] = await db.select({ partyId: gameSessionsTable.partyId })
      .from(gameSessionsTable)
      .where(eq(gameSessionsTable.id, sessionId));

    if (!session) return c.json({ sessionId, npcs: [], error: "Session not found" }, 404);

    // Step 2: Get party's campaign
    const [party] = await db.select({ campaignId: partiesTable.campaignId })
      .from(partiesTable)
      .where(eq(partiesTable.id, session.partyId));

    if (!party?.campaignId) return c.json({ sessionId, npcs: [] });

    // Step 3: Query NPCs
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

    // Step 4: Count conversations per NPC
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
        knowledge: npc.knowledge,
        goals: npc.goals,
        isAlive: npc.isAlive,
        conversationCount,
      };
    });

    return c.json({ sessionId, npcs: npcCards });
  } catch (err) {
    console.error("[Spectator NPCs] Failed:", err);
    return c.json({ sessionId, npcs: [], error: "Failed to fetch NPCs" }, 500);
  }
});
```

The key fix: add `console.error` with actual error details so we can debug, and return 404 for missing session instead of 500.

**Commit after this task.**

---

## Task 5: Spectator narration type differentiation (P2)

**File:** `src/api/spectator.ts` — find the `case "narration":` in the event formatter function.

Replace:
```typescript
    case "narration": {
      const text = data.text as string | undefined;
      if (!text) return null;
      return text.length > 100
        ? `📜 ${text.substring(0, 97)}...`
        : `📜 ${text}`;
    }
```

With:
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
        : "📜";
      const truncated = text.length > 100 ? `${text.substring(0, 97)}...` : text;
      return `${icon} ${truncated}`;
    }
```

**Commit after this task.**

---

## Task 6: Clock create crash on missing fields + default visibility (P2)

**File:** `src/game/game-manager.ts` — `handleCreateClock` (~line 5226)

Two changes:

1. Make `description` and `consequence` optional in the function signature:
```typescript
export function handleCreateClock(userId: string, params: {
  name: string;
  description?: string;
  turnsRemaining: number;
  visibility?: "hidden" | "public";
  consequence?: string;
}): { success: boolean; data?: Record<string, unknown>; error?: string } {
```

2. In the `SessionClock` object creation, add null-safe defaults:
```typescript
    description: (params.description ?? "").trim(),
    ...
    visibility: params.visibility ?? "public",
    consequence: (params.consequence ?? "").trim(),
```

The `visibility` default was `"hidden"` — change to `"public"` so spectators see clocks by default.

**Commit after this task.**

---

## Task 7: Auto-advance turn when all combat resources used (P2)

**File:** `src/game/game-manager.ts`

**Step 1:** Add helper function near the turn resource functions (after `resetTurnResources` or `setTurnResources`):

```typescript
function checkAutoAdvanceTurn(party: GameParty, characterId: string): void {
  if (!party.session || party.session.phase !== "combat") return;
  const current = getCurrentCombatant(party.session);
  if (!current || current.entityId !== characterId) return;

  const resources = getTurnResources(party, characterId);
  if (resources.actionUsed && resources.bonusUsed) {
    resetTurnResources(party, characterId);
    party.session = nextTurn(party.session);
    advanceTurnSkipDead(party);
    logEvent(party, "turn_auto_advanced", characterId, { reason: "all_resources_used" });
    notifyTurnChange(party);
  }
}
```

**Step 2:** Call `checkAutoAdvanceTurn(party, char.id)` at the END of these handler functions (after their `logEvent` calls, before the final `return`):
- `handleAttack` — after the hit/miss logging
- `handleCast` — after cast logging
- `handleDodge` — after logging
- `handleDash` — after logging
- `handleDisengage` — after logging
- `handleHelp` — after logging
- `handleHide` — after logging
- `handleBonusAction` — after logging (because it sets `bonusUsed`, which might complete the pair)

**IMPORTANT:** The check is safe to call everywhere because it only advances when BOTH `actionUsed` AND `bonusUsed` are true. If only one is used, nothing happens.

**Test:** Add test in `tests/game-manager.test.ts`:
1. Set up combat (spawn encounter)
2. Player attacks (actionUsed=true, bonusUsed=false) → turn should NOT advance
3. Player uses bonus action (actionUsed=true, bonusUsed=true) → turn SHOULD auto-advance
4. Verify current combatant changed

**Commit after this task.**

---

## Final: Run full test suite

Run `./test-runner.sh` one final time. All 1097+ tests must pass (4 pre-existing failures are OK). No new failures.
