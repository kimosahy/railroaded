# Combat & DM Tool Bugs — CC Task Document

**Source:** Poormetheus deep playtest, March 24, 2026
**For:** Prime → CC execution
**Scope:** Backend combat bugs and DM tool fixes. Separate from Sprint E frontend work.
**Priority:** These block theatrical combat. Fix before next playtest cycle.

**⚠️ TEST WARNING:** `bun test` hangs without local Postgres. Use `bun run test` (30s hard kill wrapper). NEVER run raw `bun test`.

---

## Bug 1 (P1): `voice-npc` requires `npc_id` that can't be created

**Problem:** `POST /api/v1/dm/voice-npc` requires an `npc_id` parameter, but there is no endpoint to create NPCs or obtain NPC IDs. The DM cannot voice any NPCs.

**Reproduction:**
```bash
curl -X POST https://api.railroaded.ai/api/v1/dm/voice-npc \
  -H "Authorization: Bearer $TOKEN_DM" \
  -H "Content-Type: application/json" \
  -d '{"name": "Captain Voss", "message": "Surrender!"}'
```
**Returns:** `{"error":"npc_id is required.","code":"BAD_REQUEST"}`

**Fix:** Make `npc_id` optional. When omitted, accept `name` + `message` directly. Create an ad-hoc NPC record if needed, or just emit the event with the name string. The DM should be able to voice anyone on the fly.

**Files:** `src/api/rest.ts` (route handler), `src/game/game-manager.ts` (NPC logic)

---

## Bug 2 (P1): `deal-environment-damage` rejects monster IDs

**Problem:** `POST /api/v1/dm/deal-environment-damage` only accepts player character IDs (`char-XXX`). Monster IDs (`monster-XXX`) return an error. DM cannot use environmental hazards on monsters.

**Reproduction:**
```bash
curl -X POST https://api.railroaded.ai/api/v1/dm/deal-environment-damage \
  -H "Authorization: Bearer $TOKEN_DM" \
  -H "Content-Type: application/json" \
  -d '{"target_id": "monster-1", "damage": 5, "damage_type": "bludgeoning", "description": "wall collapse"}'
```
**Returns:** `{"error":"Player monster-1 not found. Use character IDs from get_party_state (e.g. char-1).","code":"BAD_REQUEST"}`

**Fix:** The target lookup should check both player characters AND monsters. Environmental damage affects anything in the room.

**Files:** `src/api/rest.ts` or `src/game/game-manager.ts` — wherever `deal-environment-damage` resolves `target_id`

---

## Bug 3 (P2): Dead characters can still chat

**Problem:** A character with conditions `['prone', 'dead']` can successfully `POST /api/v1/chat`. Dead characters should not communicate.

**Reproduction:** Kill a character (3 death save failures), then send a chat message with their token. It succeeds.

**Fix:** Add a guard in the chat handler: if character has `dead` condition, reject with `"Your character is dead."` Same guard should apply to `unconscious` condition (unconscious characters can't speak either).

**Files:** `src/api/rest.ts` (chat route)

---

## Bug 4 (P2): No stabilization for unconscious characters outside combat

**Problem:** When combat ends (via `advance_scene` or encounter resolution), characters at 0 HP stay permanently unconscious. No death saves continue, no auto-stabilization. They're stuck.

**Fix:** When combat phase ends, any character at 0 HP who isn't dead should auto-stabilize (per D&D 5e: unconscious and stable at 0 HP). Or: continue death saves on a timer. Auto-stabilize is simpler and more spectator-friendly.

**Files:** `src/game/game-manager.ts` (phase transition logic)

---

## Bug 5 (P2): `advance_scene` destroys active encounters

**Problem:** Calling `advance_scene` during combat moves the party AND completely destroys the encounter. Monsters vanish, initiative clears, phase flips to exploration. Dead characters teleport to the new room.

**Fix:** Either:
- Block `advance_scene` during combat (return error: "End combat first")
- Or add a `force: true` parameter that explicitly acknowledges encounter destruction

The first option is safer. DM should resolve combat before moving.

**Files:** `src/game/game-manager.ts` (advance_scene handler)

---

## Bug 6 (P2): DM session metadata doesn't affect dungeon rooms

**Problem:** `POST /api/v1/dm/set-session-metadata` stores worldDescription, style, tone, setting — but dungeon rooms ignore it entirely. Set "Ashfall Catacombs — volcanic library ruins" but got "Bandit Fort" rooms (The Approach, Gatehouse, Courtyard, Barracks).

**Fix:** This is a bigger architectural issue. Short-term: include session metadata in room description generation prompts so the theme bleeds through. Long-term: let DM override dungeon template entirely.

**Files:** `src/game/dungeon-templates.ts`, `src/game/game-manager.ts`
**Complexity:** Complex — touches dungeon generation pipeline

---

## Bug 7 (P3): Bandit Captain HP inflated (65 vs D&D standard 39)

**Problem:** Bandit Captain spawns with 65 HP. Standard D&D 5e Bandit Captain is 39 HP (6d8+12). Against 2 level-1 characters, this is a guaranteed TPK.

**Fix:** Verify monster stat blocks against 5e SRD. Bandit Captain: 65 HP → 39 HP, or implement party-size scaling.

**Files:** `src/game/monsters.ts` or monster data file

---

## Feature: Monster non-attack actions (P1)

**Problem:** `monster_attack` is the only way to resolve a monster's turn (it auto-advances initiative). If a monster should dodge, dash, flee, or hold action, there's no tool.

**Fix:** Add `POST /api/v1/dm/monster-action` accepting:
```json
{
  "monster_id": "monster-3",
  "action": "dodge" | "dash" | "disengage" | "flee" | "hold"
}
```
Should resolve the action and advance initiative, same as `monster_attack` does.

**Files:** `src/api/rest.ts` (new route), `src/game/game-manager.ts`

---

## Execution Priority

1. **voice-npc fix** — blocks ALL NPC dialogue (P1)
2. **monster non-attack actions** — blocks tactical combat (P1)
3. **deal-environment-damage monster targeting** — blocks environmental storytelling (P1)
4. **Dead character chat guard** — immersion break (P2)
5. **Post-combat stabilization** — state corruption (P2)
6. **advance_scene combat guard** — encounter destruction (P2)
7. **Session metadata → room generation** — DM creativity blocked (P2, complex)
8. **Monster HP audit** — balance (P3)
