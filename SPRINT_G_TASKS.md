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


## Task 3: Half-Elf Race Support (G0.4)

**Files:** `src/types.ts`, `src/game/character-creation.ts`, `skills/player-skill.md`

### 3a. Add to VALID_RACES

In `src/types.ts` line 3:

```typescript
export const VALID_RACES = ["human", "elf", "dwarf", "halfling", "half-orc", "half-elf"] as const;
```

### 3b. Add race bonuses

In `src/game/character-creation.ts`, `applyRaceBonuses()` function (line 45+), add a case:

```typescript
case "half-elf":
  return { ...s, cha: s.cha + 2, dex: s.dex + 1, con: s.con + 1 };
  // D&D 5e: +2 CHA, +1 to two others. We pick DEX+CON as sensible defaults.
```

### 3c. Add racial features

In `racialFeatures()` (line 78+), add:

```typescript
case "half-elf":
  return ["Darkvision", "Fey Ancestry", "Skill Versatility"];
```

### 3d. Update player skill doc

In `skills/player-skill.md`, add half-elf to the races table with: +2 CHA / +1 DEX / +1 CON, Darkvision, Fey Ancestry, Skill Versatility.

### 3e. Starting equipment

Half-elves don't have special equipment rules — existing defaults apply. Also check `startingEquipment()` and `startingAC()` for any race-gated logic (currently only half-orc and elf have special cases). No changes needed unless those functions have a default fallthrough that would break.


---

## Task 4: Attack on Unconscious Player Returns Null (Session 5 Bug)

**File:** `src/game/game-manager.ts`

When an unconscious player calls `/attack`, the response returns `{"hit": null, "damage": null}` instead of a proper error. The `handleBonusAction` correctly returns "You are unconscious and cannot take that action."

The guard function `UNCONSCIOUS_ERROR` exists at line 415. A `requireConscious()` check exists at line 418. Verify it is called before the attack handler processes the request. If not, add an early return:

```typescript
if (char.conditions.includes("unconscious") || char.conditions.includes("dead")) {
  return { success: false, error: "You are unconscious and cannot take that action." };
}
```

Apply the same pattern to any other action endpoints that return null/undefined instead of a proper error when called by unconscious characters (check `/cast`, `/dash`, `/disengage`, `/hide`).

---

## Task 5: Session Summary Sanitization (G2.1)

**Files:** `src/api/spectator.ts`, `website/theater.html`

### 5a. Expand sanitization patterns

In `sanitizeSummaryForPublic()` (line 38 of `src/api/spectator.ts`), the function already catches exact strings "Automated session" and "Dungeon Exploration Session". Add regex-based filtering for variants:

```typescript
// After the exact string checks:
if (/automated session/i.test(cleaned)) return null;
if (/scheduled dungeon/i.test(cleaned)) return null;
if (/explored \d+ rooms?/i.test(cleaned) && cleaned.length < 80) return null;
```

### 5b. Frontend fallback for null summaries

In `website/theater.html` (and any other page rendering session cards), when the summary is null or empty, generate a meaningful fallback from available session data:

```javascript
function sessionSummary(session) {
  if (session.summary) return session.summary;
  const parts = [];
  if (session.partyName) parts.push(session.partyName);
  if (session.dungeonName) parts.push(`ventured into ${session.dungeonName}`);
  if (session.eventCount) parts.push(`${session.eventCount} events`);
  if (session.outcome) parts.push(session.outcome);
  return parts.length > 0 ? parts.join(' — ') : null;
}
```

### 5c. Hide ultra-short sessions

Sessions with fewer than 3 events should be excluded from public pages. In the spectator API sessions endpoint, add a filter or post-fetch exclusion so empty/trivial sessions don't appear on Theater or homepage.

---

## Task 6: Frontend Copy Fixes (G2.4, G2.5, G2.6)

**Files:** `website/characters.html`, `website/character.html`, `website/benchmark.html`, `website/theater.html`

### 6a. "A living legend of the realm" on every character (G2.4)

In `website/characters.html` and `website/character.html`, find where character bios are rendered. Replace the generic fallback with a hierarchy:

```javascript
function characterBio(char) {
  if (char.backstory && char.backstory.length > 10) return char.backstory;
  return `${capitalize(char.race)} ${capitalize(char.class)}, Level ${char.level}`;
}
// Never show "A living legend of the realm" — race/class/level is more informative
```

### 6b. Benchmark "No models have entered" (G2.5)

In `website/benchmark.html`, find the empty-state text. Replace "No models have entered the dungeon yet" with a dynamic count from the spectator API:

```javascript
// Fetch from /spectator/stats or /spectator/sessions and display:
// "${sessionCount} sessions. ${characterCount} characters. The data is building."
```

### 6c. Theater page contradiction (G2.6)

In `website/theater.html` line 274: "While the Stage is Dark, Meet the Cast" conflicts with line 252: "The dungeon never sleeps." Change line 274 to "Between Shows, Meet the Cast" or "Coming Up Next" — keep "The dungeon never sleeps" (more on-brand).

---

## Task 7: Frontend Visual — Leaderboard + Epic Moments (G3.3, G3.4)

**Files:** `website/leaderboard.html`, `website/index.html`, `website/theme.css`

### 7a. Leaderboard contrast (G3.3)

Character names and XP values have extremely low contrast (light text on dark background). Find the leaderboard table styles and increase text contrast to meet WCAG AA (4.5:1 minimum). Names should use `--text-light` or `--gold-light`, not `--text-dim`.

### 7b. Epic Moments broken images (G3.4)

In `website/index.html`, the "Epic Moments" section shows broken image placeholders (X icons). Check what URLs the `<img>` tags point to — if they're dead external URLs, either:
- Replace with real session screenshots/art from `website/assets/`
- Remove the image elements and make the cards text-only with event descriptions
- Use CSS-based placeholder illustrations

---

## Task 8: Character Avatar Display Fix (G3.1 — Sprint E Debt, 3rd Sprint)

**Files:** `website/characters.html`, `website/character.html`

This is the #1 visual debt item — third sprint requesting it.

Character cards show colored circles with letter initials instead of actual character art. The `avatar_url` field exists in the API. Many old characters have DiceBear URLs (generic cartoon faces) or no avatar at all.

### 8a. Avatar rendering with fallback

Ensure character cards:
1. If `avatar_url` exists and is NOT a DiceBear URL → display the image with `onerror` fallback
2. If `avatar_url` is missing, empty, or a DiceBear URL → display the class-colored initial circle (current behavior)

```javascript
function isValidAvatar(url) {
  if (!url) return false;
  if (url.includes('dicebear.com')) return false;
  return true;
}
```

Add `onerror` handlers to all `<img>` tags rendering avatars so dead URLs fall back gracefully to the initial circle instead of showing a broken image icon.

### 8b. Apply to all avatar locations

Check and fix avatar rendering on: character cards (`/characters`), character profiles (`/character?id=X`), Theater "Meet the Cast" section, leaderboard rows, and any homepage character displays.

---

## Task 9: Model Badge Display (G3.2 — Sprint E Debt, 3rd Sprint)

**Files:** `website/characters.html`, `website/character.html`, `website/theater.html`, `website/leaderboard.html`, `website/index.html`, `website/session.html`

The model identity system is fully built on the backend (Sprint D). The spectator API returns `model: { provider, name }` on characters and events. The frontend just needs to render it.

### 9a. Create a reusable badge component

```javascript
function modelBadge(model) {
  if (!model || !model.name) return '';
  const colors = {
    'anthropic': '#d97706',   // amber for Claude
    'openai': '#10b981',      // green for GPT
    'google': '#3b82f6',      // blue for Gemini
    'meta': '#8b5cf6',        // purple for Llama
  };
  const color = colors[model.provider?.toLowerCase()] || '#6b7280';
  return `<span class="model-badge" style="background:${color}20;color:${color};border:1px solid ${color}40;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">${model.name}</span>`;
}
```

### 9b. Add badges to all character/event displays

Insert `modelBadge(character.model)` or `modelBadge(event.model)` into:
- Character cards on `/characters`
- Character profile header on `/character?id=X`
- Session event feed on `/session?id=X`
- Leaderboard rows on `/leaderboard`
- Theater "Meet the Cast" section on `/theater`
- Quote cards / narration attribution wherever displayed
- Homepage character mentions if any

---

## Priority Order

1. **Task 2** — Sleep spell deadlock (P0, combat-breaking)
2. **Task 1** — Skill doc updates (root cause fix for G0.1 locked doors — P0)
3. **Task 4** — Unconscious attack null response
4. **Task 3** — Half-elf race
5. **Task 8** — Character avatars (Sprint E debt, 3rd sprint)
6. **Task 9** — Model badges (Sprint E debt, 3rd sprint)
7. **Task 5** — Session summary sanitization
8. **Task 6** — Frontend copy fixes
9. **Task 7** — Leaderboard contrast + Epic Moments

---

## Items NOT in This Sprint (Deferred)

| Spec Item | Reason |
|-----------|--------|
| G1.1 — DiceBear avatar URLs in DB | Data migration — needs a script to re-generate avatars for existing characters. Separate task. |
| G1.2, G5.3 — Auto-journal generation | Feature scope too large for this sprint. |
| G1.3 — Empty tavern posts | Content seeding task, not a code fix. |
| G1.4 — monstersKilled=0 | Needs investigation — may be legitimate (clerics don't kill). |
| G3.5-G3.8 — Stats labels, empty tabs, pagination, filtering | Polish — defer to Sprint H. |
| G4.1-G4.5 — Live indicator, replay embed, search, filters, reminders | Feature additions — defer to Sprint H. |
| G2.2, G2.3 — Hero text grammar, CTA copy | Already fixed in current codebase. |

---

## Testing Notes

- Use `./test-runner.sh` (not `bun test` directly) — hard 30s kill timer prevents DB pool hang
- No local Postgres — tests that need DB will skip/mock
- After Tasks 1-4 (backend), do a quick manual verification by reading the relevant handler code paths
- After Tasks 5-9 (frontend), open `website/` files in browser and verify visually
- Commit after each task, not at the end
