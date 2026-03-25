# Sprint G — CC Task File

> **BEFORE YOU START:** Read `CLAUDE.md` (game design spec), `docs/cc-patterns.md` (working patterns), and `docs/known-issues.md`. Tests use `test-runner.sh` (30s hard kill — no local Postgres, DB pool retries forever without it).

---

## Pre-Build Notes — Code Review Findings

Poormetheus filed 30+ items from playtesting. Code review found that **several "missing endpoint" bugs are actually DM skill doc gaps** — the endpoints exist but the DM agent doesn't know about them. This changes the sprint shape significantly:

| Spec Item | Poormetheus Said | Code Reality | Action |
|-----------|-----------------|-------------|--------|
| G0.1 — Locked doors | No unlock endpoint exists | `POST /dm/unlock-exit` exists (`src/api/rest.ts:335`, `src/game/game-manager.ts:3339`) | **Task 1: Add to DM skill doc** |
| G0.6 — No interact mechanism | No interact endpoint | `POST /dm/interact-feature` exists (`src/api/rest.ts:223`) AND is already in `skills/dm-skill.md:132` | **No code change needed** |
| G0.2 — Sneak Attack not firing | No +1d6 damage | `sneakAttackDice()` IS called on rogue attacks with ally check (`src/game/game-manager.ts:997-1009`) | **Task 1: Verify in skill doc; add logging** |
| G0.3 — Cunning Action missing | Disengage costs full action | IS implemented in `/bonus-action` handler (`src/game/game-manager.ts:2275-2278`). Rogue agent calling `/disengage` (full action) instead of `/bonus-action` with `action: "disengage"` | **Task 1: Clarify in player skill doc** |
| G0.5 — Sleep deadlock | Combat stuck when all monsters asleep | **REAL BUG.** `advanceTurnSkipDead` skips dead but not sleeping. Damage doesn't remove "asleep" condition. `/dm/monster-action` with "hold" works but DM doesn't know about it. | **Task 2: Code fix** |
| G2.2 — "models IS creative" | Grammar error in hero text | Current text: "their model is creative" (singular, correct) | **Already fixed — skip** |
| G2.3 — "Choose Your Path" broken | Nonsensical CTA copy | Currently a clean two-path CTA (Watch / Play) | **Already fixed — skip** |

---

## Task 1: DM + Player Skill Doc Updates (Fixes G0.1, G0.3 root cause, partially G0.5)

**Files:** `skills/dm-skill.md`, `skills/player-skill.md`

### 1a. Add `unlock-exit` to DM skill doc

In the DM tools table (around line 132 of `skills/dm-skill.md`), add a row for `unlock-exit`:

```
| Unlock exit | `POST /dm/unlock-exit` | `target_room_id` | Unlock a locked door after successful skill check |
```

Also add a section under the DM Decision Loop or Exploration guidance explaining **when to use it:**

```markdown
### Locked Doors

When players encounter a locked exit:
1. The room's `look()` response shows exits with `"type": "locked"`
2. Call for a skill check (Investigation, Thieves' Tools, Strength, etc.) at appropriate DC
3. If the check succeeds, call `POST /dm/unlock-exit` with `{"target_room_id": "<room_id>"}` to change the exit from locked to passage
4. Then narrate the door opening and let the player move

**Critical:** Do NOT just narrate the door opening without calling unlock-exit. The server still blocks movement until the exit type is changed.
```

### 1b. Add `monster-action` to DM skill doc

The DM skill doc only mentions `monster-attack` for monster turns. Add `monster-action` to the tools table:

```
| Monster non-attack action | `POST /dm/monster-action` | `monster_id`, `action` | Monster dodges, dashes, disengages, flees, or holds. Advances initiative. Valid actions: dodge, dash, disengage, flee, hold |
```

Add guidance for sleeping/incapacitated monsters:

```markdown
### Sleeping / Incapacitated Monsters

When a monster is asleep or otherwise incapacitated and cannot attack:
- Call `POST /dm/monster-action` with `{"monster_id": "<id>", "action": "hold"}` to skip its turn
- This advances initiative to the next combatant
- Do NOT call `monster-attack` — it will error with "is asleep and cannot attack"
```

### 1c. Clarify Cunning Action in player skill doc

In `skills/player-skill.md`, the Rogue class table (line 138) already mentions Cunning Action correctly. But ensure the Bonus Action endpoint docs (line 235) explicitly state the rogue workflow:

Add a note or example near the bonus action docs:

```markdown
**Rogue Cunning Action:** Rogues can Dash, Disengage, or Hide as a bonus action. Call `POST /api/v1/bonus-action` with `{"action": "disengage"}` — do NOT call `/disengage` directly (that costs your full action).
```

### 1d. Add Sneak Attack verification logging

In `src/game/game-manager.ts` around line 997-1010, add a log line when Sneak Attack triggers or fails to trigger on a rogue attack, so playtesting can verify:

```typescript
// After the allyInMelee check (around line 1005):
if (char.class === "rogue") {
  console.log(`[SNEAK] ${char.name}: allyInMelee=${allyInMelee}, critical=${result.critical}, triggered=${allyInMelee || result.critical}`);
}
```

This is temporary debug logging — we can remove it once Poormetheus confirms Sneak Attack works.

---

## Task 2: Sleep Spell Fixes (G0.5 — REAL BUG)

**Files:** `src/game/game-manager.ts`, `src/engine/combat.ts` (if needed)

### 2a. Auto-skip sleeping monster turns

In `advanceTurnSkipDead()` (line 379-410 of `src/game/game-manager.ts`), the function skips dead monsters and dead players. **Also skip sleeping monsters:**

Inside the `if (current.type === "monster")` block (around line 389), after the `!monster.isAlive` check, add:

```typescript
// Also skip sleeping (incapacitated) monsters — they can't act
if (monster && monster.isAlive && monster.conditions.includes("asleep")) {
  logEvent(party, "monster_action", monster.id, { 
    monsterName: monster.name, 
    action: "hold", 
    outcome: `${monster.name} is asleep and loses its turn.` 
  });
  party.session = nextTurn(party.session);
  continue;
}
```

**Important:** Don't `removeCombatant` — sleeping monsters are still in the fight, they just skip their turn. Use `nextTurn`, not `removeCombatant`.

### 2b. Damage wakes sleeping creatures

When a sleeping creature takes damage, remove the "asleep" condition. This is D&D 5e RAW (Sleep spell ends when the target takes damage).

Find all locations where monsters take damage and check for the "asleep" condition:

1. **`handleMonsterAttack` player-attack section** (around line 1014 where `damageMonster` is called): After damage is applied, if the target had "asleep" condition, remove it.
2. **`handleDealEnvironmentDamage`** (line 3150+): Same — after applying damage to a monster, check and remove "asleep".
3. **`handleCast`** for damage spells: Check the Sleep spell resolution and any AoE/damage spell paths.

Pattern to add after any `damageMonster()` call on a target that might be sleeping:

```typescript
// D&D 5e: damage wakes sleeping creatures
if (target.conditions.includes("asleep")) {
  target.conditions = removeCondition(target.conditions, "asleep");
  logEvent(party, "condition_removed", target.id ?? null, { 
    targetName: target.name, 
    condition: "asleep", 
    reason: "took_damage" 
  });
}
```

Also check `handlePlayerAttack` for when players attack sleeping monsters — same pattern applies.
