# Sprint E — CC Task Document

**Source:** Poormetheus Sprint E Spec (March 24, 2026)
**Reviewed by:** Prime (codebase-verified)
**For:** CC/Sonnet execution
**Test runner:** `bun test` hangs without local Postgres. Use `./test-runner.sh` (30s hard kill wrapper). `package.json` `"test"` already points to it.

---

## Phase A — Backend Combat Fixes (Tier 0)

These are the blockers. An autonomous DM agent cannot run combat without these fixes. Do Phase A first, push, deploy, then move to Phase B.

---

### E-0a: Add `end_monster_turn` DM tool (P0 — THE combat blocker)

**Problem:** The DM has no way to end a monster's turn without attacking. `monster_attack` calls `advanceTurnSkipDead()` to advance initiative, but if the DM wants a monster to skip, move, use a non-attack ability, or pass — nothing. Initiative freezes on that monster forever.

Players already have `end_turn` (listed in `getAllowedActions` combat turn actions). Monsters need the same.

**What to build:**

1. **New DM tool definition** in `src/tools/dm-tools.ts`:
   - name: `end_monster_turn`
   - description: "End the current monster's turn and advance initiative to the next combatant. Use when a monster takes a non-attack action or passes."
   - inputSchema: `{ monster_id: string (required) }`
   - handler: `handleEndMonsterTurn`

2. **Implement `handleEndMonsterTurn`** in `src/game/game-manager.ts`:
   - Verify DM owns party, session is combat phase
   - Verify `monster_id` matches current combatant (`getCurrentCombatant`)
   - Verify monster is alive
   - Call `advanceTurnSkipDead(party)` (same function `monster_attack` uses, ~line 379)
   - Return `{ success: true, data: { monster: name, nextTurn: next.entityId } }`

3. **Wire in `src/api/mcp.ts`** — add `case "end_monster_turn"` in DM tool switch (~line 362 area)

4. **Wire in `src/api/rest.ts`** — add `POST /api/v1/dm/end-monster-turn`

5. **Add to `getAllowedDMActions`** in `src/game/turns.ts` — add `"end_monster_turn"` to combat phase array (~line 164)

**Files:** `src/tools/dm-tools.ts`, `src/game/game-manager.ts`, `src/api/mcp.ts`, `src/api/rest.ts`, `src/game/turns.ts`

---

### E-0b: Fix `deal_environment_damage` — advance initiative when used on monster turn

**Problem:** `handleDealEnvironmentDamage` (~line 3071 game-manager.ts) resolves damage but NEVER calls `advanceTurnSkipDead()`. Initiative stays stuck on the monster's turn.

**Fix:** At end of `handleDealEnvironmentDamage`, after damage resolved, check if session is in combat AND current combatant is a monster. If so, call `advanceTurnSkipDead(party)` and include `nextTurn` in response. Only auto-advance on monster turns — not when DM triggers a trap during a player's turn.

**Files:** `src/game/game-manager.ts` (handleDealEnvironmentDamage, ~line 3071)

---

### E-0c: Fix `advance_scene` — don't destroy encounters

**Problem:** `handleAdvanceScene` (~line 3192) unconditionally calls `exitCombat()` and `party.monsters = []`. Calling it during combat nukes the entire encounter.

**Fix:** Replace the combat-exit block with a refusal:
```typescript
if (party.session && party.session.phase === "combat") {
  return {
    success: false,
    error: "Cannot advance scene during combat. End the encounter first or use end_monster_turn to advance initiative."
  };
}
```

**Files:** `src/game/game-manager.ts` (handleAdvanceScene, ~line 3192)

---

### E-0d: Fix `award_xp` — handle MCP type coercion

**Problem:** `handleAwardXp` (~line 3310) checks `!Number.isFinite(params.amount)`. MCP sends `args.amount as number` which can pass a string like `"100"` — `Number.isFinite("100")` returns false. Rejects valid input.

**Fix:** Parse amount explicitly: `const amount = typeof params.amount === "string" ? parseInt(params.amount, 10) : params.amount;` Then check `amount < 1` (not `< 0` — awarding 0 XP is pointless, schema says `minimum: 1`). Use `amount` for the rest of the function.

**Files:** `src/game/game-manager.ts` (handleAwardXp, ~line 3310)

---

### E-0e: Implement `handleVoiceNpc`

**Problem:** `voice_npc` is defined in dm-tools.ts and wired in mcp.ts (~line 365) but `handleVoiceNpc` DOES NOT EXIST in game-manager.ts. Calling it crashes the server.

`create_npc` IS implemented and returns an `npc_id`. The NPC system exists; voicing isn't wired.

**What to build — `handleVoiceNpc` in `src/game/game-manager.ts`:**
- Verify DM owns party
- Look up NPC by `npc_id` in party's campaign NPCs
- If NPC not found: fallback — treat `npc_id` as an ad-hoc NPC name (lets DMs voice one-off characters without `create_npc`). Log a hint suggesting `create_npc` for persistent NPCs.
- Log event: `logEvent(party, "npc_dialogue", null, { npcId, npcName, dialogue })`
- Broadcast to party: `broadcastToParty(party.id, { type: "npc_dialogue", npcId, npcName, dialogue })`
- Return `{ success: true, data: { npc: name, dialogue } }`

**Verify:** Check how `handleCreateNpc` stores NPCs and use the same storage for lookup.

**Files:** `src/game/game-manager.ts`, `src/api/rest.ts` (add REST route if missing)

---
