# CC-260429-SECURITY-CLASS-FEATURES — Security + Class Features + Progression Fix

**Commissioned by:** Muhammad (CTO) via Ram Prime
**Venture:** Railroaded
**Source specs:** MF-024 (T-1, T-4), MF-027 (P1-6, P1-8, P2-12, P2-13), MF-008 (F-4)
**Scope:** Rate limiting, token renewal audit, 6 wizard spells + L3 infrastructure, Turn Undead + creature_type, XP partial award fix, level verification, move docs fix
**Repo:** `kimosahy/railroaded` — branch from latest `main`
**Branch name:** `atlas/security-class-features`
**Commit format:** `Atlas build (Ram): [description]`

---

## 0. Context for Atlas

**Rate limiting (T-1):** `src/api/rate-limit.ts` exists — 110 lines, fully implemented, never imported anywhere. Mercury's Apr 27 test showed 516 unauthenticated 401s on `/api/v1/actions` in 40 minutes. The module is dead code. Task 1 wires it + adds IP-based limiting for unauthenticated routes.

**Fireball + L3 infrastructure (P1-8):** Eon confirmed highest character level ever reached is 2. No character has been close to L5 (where L3 slots unlock). At ~150 XP/session best case, L5 requires ~40 successful sessions. But MF confirmed "all 6 in v1" and the infrastructure is small (~40-60 lines across 10 files per Atlas's blast radius analysis). Ship it — future-proofs the spell catalog. Skip deep Fireball-specific tests; one sanity test is enough.

**creature_type visibility (P1-6):** Atlas identified 6 response shapes that include monster data. Agent-visible (option b) chosen because: (1) cleric agents make informed Turn Undead decisions, (2) future typed-targeting spells (Hold Person = humanoid, Charm Person = humanoid, Dispel Evil = fey/fiend/undead) just work, (3) marginal cost (+20 lines over internal-only).

**XP pipeline (F-4):** XP is awarded ONLY at `combat_end` (all monsters dead). Three non-normal exit paths (timeout, session-end, TPK) award 0 XP. This is the bottleneck for the entire progression system. Without it, L3 spell slots are permanently unreachable. `calculateEncounterXP` sums ALL monsters' xpValue. Fix: filter to dead monsters only for partial award at non-normal exits.

---

## 1. Build Tasks

### Task 1 — T-1: Rate limiting (IP-based for unauthenticated endpoints)

**What:** Add IP-based rate limiting for unauthenticated endpoints (register, login, spectator). The existing `rateLimitMiddleware` in `rate-limit.ts` is game-action pacing ("one action per tick"), NOT API request rate limiting — do NOT wire it globally. It stays unwired for now. If authenticated request-rate limiting is needed, it requires a separate design that distinguishes read endpoints from mutation endpoints.

**File:** `src/api/rate-limit.ts`

**Step 1a — Add IP-based rate limiter.**

**File:** `src/api/rate-limit.ts`

Add at the end of the file:

```ts
/**
 * IP-based rate limiting for unauthenticated endpoints (register, login, spectator).
 * Simpler than the tick-based user limiter — flat requests-per-window.
 * Default: 30 requests per 60 seconds per IP.
 */
const ipRequestLog = new Map<string, { count: number; windowStart: number }>();
const IP_RATE_WINDOW_MS = 60_000;
const IP_RATE_MAX_REQUESTS = parseInt(process.env.RAILROADED_IP_RATE_LIMIT ?? "30", 10);

export const ipRateLimitMiddleware = createMiddleware(async (c, next) => {
  // Extract IP from standard headers, fall back to socket address
  const ip = c.req.header("X-Forwarded-For")?.split(",")[0]?.trim()
    ?? c.req.header("X-Real-IP")
    ?? "unknown";

  const now = Date.now();
  const entry = ipRequestLog.get(ip);

  if (!entry || (now - entry.windowStart) > IP_RATE_WINDOW_MS) {
    // New window
    ipRequestLog.set(ip, { count: 1, windowStart: now });
    await next();
    return;
  }

  entry.count++;
  if (entry.count > IP_RATE_MAX_REQUESTS) {
    const retryAfter = Math.ceil((IP_RATE_WINDOW_MS - (now - entry.windowStart)) / 1000);
    c.header("Retry-After", String(retryAfter));
    return c.json({
      error: "Rate limited — too many requests",
      retryAfter,
      reason_code: "RATE_LIMITED",
    }, 429);
  }

  await next();
});

/** Clear IP rate limit tracking (for testing). */
export function clearIpRateLimits(): void {
  ipRequestLog.clear();
}
```

**Step 1b — Wire IP rate limiter on unauthenticated routes.**

**File:** `src/index.ts`

```ts
import { ipRateLimitMiddleware } from "./api/rate-limit.ts";

// IP-based rate limiting for unauthenticated endpoints
app.use("/register", ipRateLimitMiddleware);
app.use("/login", ipRateLimitMiddleware);
app.use("/api/v1/spectate/*", ipRateLimitMiddleware);
app.use("/api/v1/spectator/*", ipRateLimitMiddleware);
app.use("/spectator/*", ipRateLimitMiddleware);
```

Do NOT apply to `/health`, `/skill/*`, `/ws`, or `/` — these are informational endpoints that shouldn't be rate limited.

**Step 1c — Add `RATE_LIMITED` to ReasonCode enum.**

**File:** `src/types.ts`

Add to the ReasonCode const:

```ts
RATE_LIMITED: "RATE_LIMITED",
```

**Step 1d — Test.** (a) Hit `/register` 31 times in 60s from same IP → assert 31st returns 429 with `Retry-After` header. (b) Different IPs are independent — IP-A at limit, IP-B still succeeds. (c) After window expires (60s), requests succeed again.

---

### Task 2 — T-4: Token renewal audit

**What:** Verify token auto-renewal works and identify why Mercury saw 401s mid-session.

**File:** `src/api/auth.ts`

**Step 2a — Trace the renewal path.**

Grep for `session.expiresAt` in `auth.ts`. The renewal happens at L330:

```ts
session.expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
```

Verify this line executes on EVERY authenticated request by tracing:
1. `requireAuth` middleware calls `getAuthUser(header)`
2. `getAuthUser` calls `validateSession(token)`
3. `validateSession` finds the session, checks `expiresAt > now`, and if valid, calls the renewal at L330

Check: is L330 inside `validateSession` or inside `getAuthUser`? If it's inside `validateSession` and `validateSession` returns the session BEFORE renewing, the renewal is a race condition (session validated but expiry not extended before next request).

**Step 2b — Check for header-stripping.**

Grep for `Authorization` in `rest.ts` and `index.ts`. Verify no middleware strips or modifies the Authorization header before it reaches `requireAuth`. Check: does the admin middleware bypass (CC Doc 3, Task 3) interfere with the auth header for non-admin routes?

**Step 2c — Add renewal logging + specify fix branch.**

Add a log line inside the renewal path so we can verify it fires in the next playtest:

```ts
// In validateSession, at the renewal site:
console.log(`[AUTH-RENEW] Token renewed for user=${session.userId}, new expiry=${session.expiresAt.toISOString()}`);
```

**If the audit confirms renewal works (expected):** Ship the temporary log line + the fake-timer test (Step 2d). Mark the log with `// TODO: remove after one playtest confirms renewal works`. The test stays as a permanent guard.

**If the audit finds renewal IS broken (e.g., renewal fires but expiresAt isn't persisted, or a race between validation and renewal):** Fix the regression in this same commit. Keep the test as a permanent guard (not temporary). Document the bug and fix in the commit message.

**Step 2d — Test.** Create a session, wait 25 minutes (fake timers), make a request → assert token still valid (renewal fired). Wait 31 minutes without a request → assert token expired.

---

### Task 3 — F-4: XP partial award on non-normal combat exits

**What:** Award XP for monsters killed so far when combat exits via timeout, session-end, or TPK — not just on clean combat-end.

**File:** `src/game/game-manager.ts`

**Step 3a — Add `awardPartialXP` helper.**

Place near `calculateEncounterXP` usage (grep for `calculateEncounterXP`):

```ts
/**
 * Award XP for monsters killed so far. Used at non-normal combat exits
 * (timeout, session-end, TPK) where shouldCombatEnd didn't fire.
 * Only counts dead monsters (isAlive === false), not surviving ones.
 * F-4 fix: XP was 0 on TPK because calculateEncounterXP summed all monsters.
 */
function awardPartialXP(party: GameParty): { xpAwarded: number; levelUps: { name: string; newLevel: number; hpGain: number; newFeatures: string[] }[] } {
  const deadMonsters = party.monsters.filter(m => !m.isAlive);
  if (deadMonsters.length === 0) return { xpAwarded: 0, levelUps: [] };

  const xp = deadMonsters.reduce((sum, m) => sum + (m.xpValue ?? 0), 0);
  if (xp === 0) return { xpAwarded: 0, levelUps: [] };

  const aliveMembers = party.members.filter(mid => {
    const m = characters.get(mid);
    return m && m.isAlive && !m.conditions.includes("dead");
  });
  if (aliveMembers.length === 0) {
    // All party members dead — award to all members anyway (they earned it before dying)
    const xpEach = Math.floor(xp / party.members.length);
    const levelUps: { name: string; newLevel: number; hpGain: number; newFeatures: string[] }[] = [];
    for (const mid of party.members) {
      const m = characters.get(mid);
      if (m) {
        m.xp += xpEach;
        const lu = checkLevelUp(m);
        if (lu) levelUps.push({ name: m.name, ...lu });
      }
    }
    return { xpAwarded: xp, levelUps };
  }

  const xpEach = Math.floor(xp / aliveMembers.length);
  const levelUps: { name: string; newLevel: number; hpGain: number; newFeatures: string[] }[] = [];
  for (const mid of aliveMembers) {
    const m = characters.get(mid);
    if (m) {
      m.xp += xpEach;
      const lu = checkLevelUp(m);
      if (lu) levelUps.push({ name: m.name, ...lu });
    }
  }
  return { xpAwarded: xp, levelUps };
}
```

**Step 3b — Wire into `checkCombatTimeout`.**

Grep for `function checkCombatTimeout`. Before the `exitCombat` call (~L1010), add:

```ts
    // F-4: Award partial XP for monsters killed before timeout
    const { xpAwarded, levelUps } = awardPartialXP(party);
    if (xpAwarded > 0) {
      logEvent(party, "partial_xp_awarded", null, { xpAwarded, reason: "combat_timeout", monstersKilled: party.monsters.filter(m => !m.isAlive).length });
    }
    for (const lu of levelUps) {
      logEvent(party, "level_up", null, lu);
      broadcastToParty(party.id, { type: "level_up", ...lu });
    }
```

**Step 3c — Wire into `handleEndSession`.**

Grep for `function handleEndSession`. If the party is currently in combat when the DM ends the session, award partial XP. Add BEFORE `party.session = endSessionState(party.session)`:

```ts
  // F-4: Award partial XP if ending session mid-combat
  if (party.session && party.session.phase === "combat") {
    const { xpAwarded, levelUps } = awardPartialXP(party);
    if (xpAwarded > 0) {
      logEvent(party, "partial_xp_awarded", null, { xpAwarded, reason: "session_end_mid_combat", monstersKilled: party.monsters.filter(m => !m.isAlive).length });
    }
    for (const lu of levelUps) {
      logEvent(party, "level_up", null, lu);
      broadcastToParty(party.id, { type: "level_up", ...lu });
    }
  }
```

**Step 3d — Wire into ALL remaining non-normal combat exit paths.**

Atlas identified 3 additional sites that exit combat with 0 XP:

1. **L2113 (canonical TPK path):** All PCs dead, `shouldCombatEnd` returns true (monsters also dead). Currently awards 0 XP. This is the most important — TPK where players DID kill some monsters should still award XP.

2. **L3655 (second all_players_dead site):** Same pattern, different code path (cast-triggered player death). Currently awards 0 XP.

3. **L4575 (environment damage kills last monster):** Hardcoded `xpAwarded: 0` in the `combat_end` log. The monster died from environment damage but the party gets no XP.

For each site: grep for the `combat_end` log event at that approximate location. Add `awardPartialXP` call BEFORE the `exitCombat` call, same pattern as Step 3b:

```ts
// Before each exitCombat call at these sites:
const { xpAwarded, levelUps } = awardPartialXP(party);
if (xpAwarded > 0) {
  logEvent(party, "partial_xp_awarded", null, {
    xpAwarded,
    reason: "combat_exit_non_normal", // or specific: "tpk" / "environment_kill"
    monstersKilled: party.monsters.filter(m => !m.isAlive).length,
  });
}
for (const lu of levelUps) {
  logEvent(party, "level_up", null, lu);
  broadcastToParty(party.id, { type: "level_up", ...lu });
}
```

**NOTE:** L2113 and L3655 are gated on `shouldCombatEnd` (all monsters dead). In these cases, `awardPartialXP` gives FULL encounter XP (all monsters dead = all counted). This is correct — it's functionally identical to the normal combat_end XP path, just reached via a different code route (TPK where monsters also died). The word "partial" is misleading for this case but the function handles it correctly.

**L4575 specifically:** grep for `xpAwarded: 0` in a `combat_end` log near environment-damage handling. Replace the hardcoded 0 with the `awardPartialXP` result.

**Step 3e — Test.** (a) Kill 2 of 3 monsters → combat timeout → assert partial XP awarded for 2 killed monsters. (b) Kill 1 monster → DM calls end_session → assert partial XP for 1 monster. (c) Kill all 3 monsters → normal combat_end → assert full XP (existing behavior unchanged). (d) Kill 0 monsters → timeout → assert 0 XP.

---

### Task 4 — P1-8: 6 wizard spells + L3 slot infrastructure

**What:** Add Mage Armor, Misty Step, Burning Hands, Fireball, Detect Magic, Identify to spell catalog. Extend spell slot system to support Level 3.

**Step 4a — Extend SpellSlots type.**

**File:** `src/types.ts`

Grep for `interface SpellSlots`. Add:

```ts
  level_3: { current: number; max: number };
```

**Step 4b — Update spell slot functions.**

**File:** `src/engine/spells.ts`

Grep for `function getMaxSpellSlots`. Update the slot table:

```ts
const slotTable: Record<number, { l1: number; l2: number; l3: number }> = {
  1: { l1: 2, l2: 0, l3: 0 },
  2: { l1: 3, l2: 0, l3: 0 },
  3: { l1: 4, l2: 2, l3: 0 },
  4: { l1: 4, l2: 3, l3: 0 },
  5: { l1: 4, l2: 3, l3: 2 },
};

const slots = slotTable[level] ?? slotTable[5]!;
return {
  level_1: { current: slots.l1, max: slots.l1 },
  level_2: { current: slots.l2, max: slots.l2 },
  level_3: { current: slots.l3, max: slots.l3 },
};
```

Grep for `function hasSpellSlot`. Add L3 branch:

```ts
if (spellLevel === 3) return slots.level_3.current > 0;
```

Grep for `function expendSpellSlot`. Add L3 branch:

```ts
const newSlots = {
  level_1: { ...slots.level_1 },
  level_2: { ...slots.level_2 },
  level_3: { ...slots.level_3 },
};

// ... existing L1/L2 branches ...
} else if (spellLevel === 3) {
  if (newSlots.level_3.current <= 0) return null;
  newSlots.level_3.current -= 1;
}
```

Grep for `function arcaneRecovery`. Update to include L3 recovery:

```ts
// SIMPLIFICATION: greedy recovery — recovers highest-level slots first (L3 → L2 → L1).
// 5e RAW allows player choice of which slots to recover. Greedy is correct for most agent
// decisions (highest slot = most valuable). Follow-up for agent slot-preference param if needed.
const newSlots = {
  level_1: { ...slots.level_1 },
  level_2: { ...slots.level_2 },
  level_3: { ...slots.level_3 },
};

let levelsRemaining = maxRecoverLevels;

// Recover level 3 slots first (most valuable)
while (levelsRemaining >= 3 && newSlots.level_3.current < newSlots.level_3.max) {
  newSlots.level_3.current++;
  levelsRemaining -= 3;
}
// Then level 2...
// Then level 1...
```

**Step 4c — Fix short rest to preserve level_3 slots.**

**File:** `src/engine/rest.ts`

The `shortRest` function creates `newSpellSlots` with explicit `level_1` and `level_2` deep-copies only (L88). If `spellSlots` has `level_3`, it gets shallow-copied via spread but then `arcaneRecovery` returns a new object dropping it. Also `spellSlotsRecovered` only compares L1 and L2.

Grep for `let newSpellSlots = { ...spellSlots` in `shortRest`. Replace:

```ts
// Before:
let newSpellSlots = { ...spellSlots, level_1: { ...spellSlots.level_1 }, level_2: { ...spellSlots.level_2 } };

// After:
let newSpellSlots = {
  level_1: { ...spellSlots.level_1 },
  level_2: { ...spellSlots.level_2 },
  level_3: { ...spellSlots.level_3 },
};
```

Also update the `spellSlotsRecovered` check:

```ts
// Before:
spellSlotsRecovered =
  newSpellSlots.level_1.current !== spellSlots.level_1.current ||
  newSpellSlots.level_2.current !== spellSlots.level_2.current;

// After:
spellSlotsRecovered =
  newSpellSlots.level_1.current !== spellSlots.level_1.current ||
  newSpellSlots.level_2.current !== spellSlots.level_2.current ||
  newSpellSlots.level_3.current !== spellSlots.level_3.current;
```

**Long rest does NOT need changes.** `doLongRest` calls `getMaxSpellSlots(characterLevel, characterClass)` which returns the full slot object. Updating `getMaxSpellSlots` in Step 4b automatically gives long rest L3 recovery. No edits to `longRest()` function.

**Step 4d — Also update level-up spell slot assignment.**

Grep for `char.spellSlots = {` inside `checkLevelUp` (game-manager.ts). The level-up function assigns new spell slots when leveling:

```ts
// Before:
char.spellSlots = {
  level_1: { current: char.spellSlots.level_1.current + Math.max(0, l1Gain), max: newSlots.level_1.max },
  level_2: { current: char.spellSlots.level_2.current + Math.max(0, l2Gain), max: newSlots.level_2.max },
};

// After — add level_3:
const l3Gain = newSlots.level_3.max - char.spellSlots.level_3.max;
char.spellSlots = {
  level_1: { current: char.spellSlots.level_1.current + Math.max(0, l1Gain), max: newSlots.level_1.max },
  level_2: { current: char.spellSlots.level_2.current + Math.max(0, l2Gain), max: newSlots.level_2.max },
  level_3: { current: char.spellSlots.level_3.current + Math.max(0, l3Gain), max: newSlots.level_3.max },
};
```

Also add `l3Gain` declaration near `l1Gain` and `l2Gain`.

**Step 4e — DB migration for existing characters.**

**File:** Create a new migration file or add to existing migration runner.

Existing characters have `spell_slots` as JSONB with only `level_1` and `level_2`. Add `level_3` with default `{ current: 0, max: 0 }`:

```sql
UPDATE characters
SET spell_slots = spell_slots || '{"level_3": {"current": 0, "max": 0}}'::jsonb
WHERE NOT spell_slots ? 'level_3';
```

If the migration runner doesn't exist, add the SQL as a comment in the commit message with instructions: "Run this SQL against the production database before deploying."

Also: in `loadPersistedCharacters` and `loadPersistedState`, when rehydrating character spell slots, default `level_3` if missing:

```ts
// After reading spell_slots from DB/persistence:
if (!char.spellSlots.level_3) {
  char.spellSlots.level_3 = { current: 0, max: 0 };
}
```

**Step 4f — Add 6 spells to data/spells.yaml.**

Append to the Wizard Spells section:

```yaml
- name: Mage Armor
  level: 1
  casting_time: action
  effect: "Target's AC becomes 13 + DEX modifier for 8 hours. Cannot wear armor."
  damage_or_healing: null
  ability_for_damage: null
  saving_throw: null
  spell_attack_type: null
  is_healing: false
  is_concentration: false
  range: touch
  classes: [wizard]

- name: Burning Hands
  level: 1
  casting_time: action
  effect: "Each creature in 15-foot cone makes DEX save. 3d6 fire damage on fail, half on success."
  damage_or_healing: "3d6"
  ability_for_damage: null
  saving_throw: dex
  spell_attack_type: null
  is_healing: false
  is_concentration: false
  range: self
  classes: [wizard]

- name: Detect Magic
  level: 1
  casting_time: action
  effect: "Sense magic within 30 feet for 10 minutes. Can see aura and determine school."
  damage_or_healing: null
  ability_for_damage: null
  saving_throw: null
  spell_attack_type: null
  is_healing: false
  is_concentration: true
  range: self
  classes: [wizard, cleric]

- name: Identify
  level: 1
  casting_time: action
  effect: "Learn properties of one magic item or object you touch."
  damage_or_healing: null
  ability_for_damage: null
  saving_throw: null
  spell_attack_type: null
  is_healing: false
  is_concentration: false
  range: touch
  classes: [wizard]

- name: Misty Step
  level: 2
  casting_time: bonus_action
  effect: "Teleport up to 30 feet to an unoccupied space you can see."
  damage_or_healing: null
  ability_for_damage: null
  saving_throw: null
  spell_attack_type: null
  is_healing: false
  is_concentration: false
  range: self
  classes: [wizard]

- name: Fireball
  level: 3
  casting_time: action
  effect: "Each creature in 20-foot-radius sphere makes DEX save. 8d6 fire damage on fail, half on success."
  damage_or_healing: "8d6"
  ability_for_damage: null
  saving_throw: dex
  spell_attack_type: null
  is_healing: false
  is_concentration: false
  range: ranged
  classes: [wizard]
```

**Note on Detect Magic:** Added `cleric` to classes — Detect Magic is on both cleric and wizard spell lists in 5e.

**Step 4g — Test.** (a) Sanity: Fireball uses L3 slot, fails if none available. (b) L3 infrastructure: wizard at L5 has 2 L3 slots via `getMaxSpellSlots`. (c) Long rest recovers L3 slots. (d) Arcane Recovery recovers L3 slots (capped by half wizard level). (e) Cast Mage Armor → verify no damage, effect string present. (f) Cast Misty Step → verify bonus_action casting time accepted. (g) DB rehydration: character without `level_3` field → defaults to `{ current: 0, max: 0 }`.

---

### Task 5 — P1-6: Turn Undead + creature_type (agent-visible)

**What:** Add `creature_type` field to monster data (agent-visible in 6 response shapes). Add `handleChannelDivinity` handler for Turn Undead.

**Step 5a — Add creature_type to MonsterInstance.**

**File:** `src/game/encounters.ts`

Grep for `interface MonsterInstance`. Add:

```ts
  creatureType: string; // "humanoid" | "beast" | "undead" | "monstrosity" | "dragon" | "fey" | "fiend"
```

**Step 5b — Add creature_type to monster YAML.**

**File:** `data/monsters.yaml`

Add `creature_type:` to each monster entry:

```yaml
- name: Goblin
  creature_type: humanoid
  # ... rest unchanged

- name: Skeleton
  creature_type: undead

- name: Wolf
  creature_type: beast

- name: Kobold
  creature_type: humanoid

- name: Hobgoblin
  creature_type: humanoid

- name: Zombie
  creature_type: undead

- name: Bandit
  creature_type: humanoid

- name: Giant Rat
  creature_type: beast

- name: Orc
  creature_type: humanoid

- name: Bugbear
  creature_type: humanoid

- name: Ghoul
  creature_type: undead

- name: Bandit Captain
  creature_type: humanoid

- name: Ogre
  creature_type: humanoid

- name: Wight
  creature_type: undead

- name: Hobgoblin Warlord
  creature_type: humanoid

- name: Young Dragon
  creature_type: dragon
```

**Step 5c — Update YAML loader.**

**File:** `src/game/game-manager.ts`

Grep for `interface YAMLMonster`. Add:

```ts
  creature_type: string;
```

Grep for the `monsterTemplates.set(m.name, {` call inside the YAML loader. Add:

```ts
  creatureType: m.creature_type ?? "humanoid",
```

**Step 5d — Update `loadMonsterTemplate` export.**

Grep for `function loadMonsterTemplate`. Add `creatureType` to params:

```ts
export function loadMonsterTemplate(name: string, template: {
  hpMax: number; ac: number;
  abilityScores: AbilityScores;
  attacks: { name: string; to_hit: number; damage: string; type: string }[];
  specialAbilities: string[];
  xpValue: number;
  lootTable?: LootTableEntry[];
  creatureType?: string;
}): void {
  monsterTemplates.set(name, { ...template, creatureType: template.creatureType ?? "humanoid" });
}
```

**Step 5e — Update encounter spawn to copy creature_type.**

Grep for where `MonsterInstance` objects are created from templates (likely inside `spawnEncounter` or `createMonsterFromTemplate`). Add `creatureType: template.creatureType ?? "humanoid"` to the object literal.

**Step 5f — Add creature_type to 6 response shapes (agent-visible).**

Atlas identified these sites. For each, add `creatureType: monster.creatureType` to the monster data in the response:

1. **Spectator party combat snapshot** — grep for `spectator.ts` where monster data is serialized for spectators. Add `creatureType`.
2. **`handleGetAvailableActions` combat data** — grep for where monsters are listed in combat action responses. Add `creatureType`.
3. **`handleSpawnEncounter` return** — grep for the return data after spawning. Add `creatureType`.
4. **Encounter persistence write-back** — grep for where monster state is saved. Add `creatureType`.
5. **Encounter snapshot** — grep for `templateName, count` patterns. Add `creatureType` if monster-level data is present.
6. **`handleGetPartyState` monsters** — grep for where party state includes monster details. Add `creatureType`.

For each site: find the object literal that includes monster fields (id, name, hp, ac, etc.) and add `creatureType: m.creatureType ?? "humanoid"`.

**Step 5f-extra — Add creature_type to customMonsterTemplates DB schema + DM handler.**

**File:** `src/db/schema.ts`

Grep for `customMonsterTemplates` or `statBlock` in schema.ts. The `statBlock` JSONB type does NOT include `creatureType`. Add it:

```ts
// Inside the statBlock $type definition, add:
creatureType?: string;
```

Default: `"humanoid"` if not supplied. Existing rows read defensively — `statBlock.creatureType ?? "humanoid"` everywhere the field is read. No SQL migration needed for JSONB additions.

**File:** `src/game/game-manager.ts`

Grep for `handleCreateCustomMonster` or `create_custom_monster`. In the handler, add `creature_type` as an optional parameter:

```ts
// In params type:
creature_type?: string;

// In the template object creation:
creatureType: params.creature_type ?? "humanoid",
```

**File:** `src/api/mcp.ts`

Grep for `create_custom_monster` in the MCP tool switch. Add `creature_type` to the args pass-through:

```ts
creature_type: args.creature_type as string | undefined,
```

This ensures DM-created custom undead (Lich, Death Knight, etc.) are Turn-able.

**Step 5g — Add channelDivinityUses to GameCharacter.**

**File:** `src/game/game-manager.ts`

Grep for `interface GameCharacter extends CharacterSheet`. Add:

```ts
  /** Channel Divinity uses remaining. Clerics get 1 at L1, 2 at L6. Resets on short/long rest. */
  channelDivinityUses: number;
```

Set to 1 in all character creation / rehydration sites. The 3 main sites (verified against `main@6988f87`):

1. **L1222** — `handleCreateCharacter` object literal. Add `channelDivinityUses: params.class === "cleric" ? 1 : 0`
2. **L7628** — `loadPersistedState` rehydration. Add `channelDivinityUses: (row.class === "cleric") ? 1 : 0` (or read from DB if persisted)
3. **L7773** — `loadPersistedCharacters` rehydration. Same pattern.

Also grep test setup files for `characters.set(` or direct `GameCharacter` construction — each must include `channelDivinityUses`. Missing any site = cleric loaded from that path has `undefined` channelDivinityUses → `<= 0` returns `true` → Channel Divinity permanently unusable.

Reset on rest: grep for the short rest and long rest handlers. Add:

```ts
if (char.class === "cleric") {
  char.channelDivinityUses = 1; // L1 gets 1 use per rest. Update to 2 at L6.
}
```

**Step 5h — Add `handleChannelDivinity` handler.**

```ts
export function handleChannelDivinity(userId: string, params: {
  ability: string; // "turn_undead" — extensible for future Channel Divinity options
}): { success: boolean; data?: Record<string, unknown>; error?: string; reason_code?: string } {
  const char = getCharacterForUser(userId);
  if (!char) return { success: false, error: "No character found.", reason_code: "CHARACTER_NOT_FOUND" };
  if (requireConscious(char)) return { success: false, error: UNCONSCIOUS_ERROR, reason_code: "CHARACTER_UNCONSCIOUS" };
  if (char.class !== "cleric") return { success: false, error: "Only clerics can use Channel Divinity.", reason_code: "WRONG_STATE" };

  const party = getPartyForCharacter(char.id);
  if (!party?.session || party.session.phase !== "combat") {
    return { success: false, error: "Channel Divinity can only be used during combat.", reason_code: "WRONG_PHASE" };
  }

  if (char.channelDivinityUses <= 0) {
    return { success: false, error: "No Channel Divinity uses remaining. Take a short or long rest to regain uses.", reason_code: "ABILITY_ON_COOLDOWN" };
  }

  if (params.ability !== "turn_undead") {
    return { success: false, error: `Unknown Channel Divinity ability: ${params.ability}. Available: turn_undead`, reason_code: "INVALID_ENUM_VALUE" };
  }

  // Turn Undead: each undead within 30ft makes WIS save vs cleric's spell save DC.
  // On fail: frightened condition applied for 1 minute (10 rounds).
  const dc = spellSaveDC(char.abilityScores, char.class, proficiencyBonus(char.level));
  const undead = party.monsters.filter(m => m.isAlive && m.creatureType === "undead");

  if (undead.length === 0) {
    return { success: false, error: "No undead creatures present to turn.", reason_code: "TARGET_INVALID" };
  }

  char.channelDivinityUses--;
  markCharacterAction(char);

  const results: { monsterName: string; roll: number; dc: number; saved: boolean }[] = [];
  for (const monster of undead) {
    const wisMod = abilityModifier(monster.abilityScores.wis);
    const saveRoll = roll("1d20");
    const total = saveRoll.total + wisMod;
    const saved = total >= dc;

    if (!saved) {
      if (!monster.conditions.includes("frightened")) {
        monster.conditions.push("frightened");
      }
      // Turned undead must use movement to move away — handled by DM on monster's turn.
      // Engine marks the condition; DM narrates the flee behavior.
    }

    results.push({
      monsterName: monster.name,
      roll: saveRoll.total,
      dc,
      saved,
    });
  }

  const turned = results.filter(r => !r.saved);
  const resisted = results.filter(r => r.saved);

  logEvent(party, "channel_divinity", char.id, {
    characterName: char.name,
    ability: "turn_undead",
    dc,
    undeadTargeted: undead.length,
    turned: turned.map(r => r.monsterName),
    resisted: resisted.map(r => r.monsterName),
    usesRemaining: char.channelDivinityUses,
  });

  // Consume action — use setTurnResources pattern (matches handleAttack/handleCast/handleDodge)
  const resources = getTurnResources(party, char.id);
  setTurnResources(party, char.id, { ...resources, actionUsed: true });
  checkAutoAdvanceTurn(party, char.id);

  return {
    success: true,
    data: {
      ability: "turn_undead",
      dc,
      results,
      turned: turned.length,
      resisted: resisted.length,
      usesRemaining: char.channelDivinityUses,
      turnStatus: makeTurnStatus(party, char.id),
    },
  };
}
```

**Step 5i — Add route + MCP tool.**

**File:** `src/api/rest.ts`

Add to player routes:

```ts
player.post("/channel-divinity", async (c) => {
  const body = await c.req.json();
  return respond(c, gm.handleChannelDivinity(c.get("user").userId, body));
});
```

**File:** `src/api/mcp.ts`

Add to the player tools switch:

```ts
case "channel_divinity":
  return gm.handleChannelDivinity(userId, {
    ability: args.ability as string,
  });
```

Add to `playerActionRoutes` in game-manager.ts:

```ts
channel_divinity: { method: "POST", path: "/api/v1/channel-divinity" },
```

**Step 5j — Test.** (a) Cleric uses Turn Undead against 2 skeletons → assert WIS saves rolled, `frightened` condition applied to failures. (b) Non-cleric tries Channel Divinity → assert error. (c) Cleric with 0 uses → assert ABILITY_ON_COOLDOWN. (d) No undead present → assert TARGET_INVALID. (e) Short rest resets channelDivinityUses to 1. (f) Verify creature_type appears in spectator API and GET /actions combat response.

---

### Task 6 — P2-12: Level field verification

**What:** Confirm no level field exists in the create_character API. Documentation only.

**Step 6a — Verify.**

Grep for `level` in: `handleCreateCharacter` params, MCP tool `create_character` args, REST route `/api/v1/character` body parsing, player skill doc `create_character` section.

Expected: no `level` parameter anywhere. `createCharacter` (character-creation.ts) hardcodes `const level = 1`.

**Step 6b — If any reference found, remove it.** If the skill doc or MCP schema mentions a level field, remove it and note in the commit message. If code accepts but ignores it, remove the parameter.

**Step 6c — Log result.** Commit message: "P2-12: Verified — no level field in create_character API. Characters start at L1 (hardcoded). No changes needed." Or: "P2-12: Removed stale level field reference from [location]."

---

### Task 7 — P2-13: Move docs fix

**What:** Clarify that `move` only accepts exit/room names from the available exits list, not free-text positional descriptions.

**File:** `skills/player-skill.md`

**Step 7a — Update move description.**

Grep for `direction_or_target` in the player skill doc. The current example:

```
"direction_or_target": "north door"  // compass, named exit, zone, or relative target
```

Replace with:

```
"direction_or_target": "north door"  // named exit from the exits list shown in `look` response
```

Remove "relative target" — the engine doesn't support positional descriptions like "step behind pillar."

**Step 7b — Add clarification note.**

After the move tool entry, add:

```markdown
**Important:** `move` only accepts exit names from the `exits` list in your `look` response. Free-text positional descriptions ("move behind the pillar", "step to the left") are not supported. Use the exact exit name or room name.
```

---

## 2. What You Do NOT Build

- **AoE targeting for Burning Hands / Fireball** — the engine has no spatial grid. AoE spells apply their save to all enemies (simplified). Do NOT implement positional targeting or grid-based AoE.
- **Concentration tracking** — Mage Armor and Detect Magic are concentration spells. The `isConcentration` flag exists on SpellDefinition but the engine doesn't enforce "casting a new concentration spell drops the previous one." Ship the flag as documentation; enforcement is a follow-up.
- **Turn Undead: Destroy Undead** — at cleric L5+, turned undead below certain CR are destroyed outright. Not implemented (characters are L1-L2). Follow-up when progression system matures.
- **Frightened condition mechanical enforcement** — the `frightened` condition is applied by Turn Undead. The engine doesn't currently enforce "frightened creatures must use movement to move away" — the DM handles this narratively. Follow-up for mechanical enforcement.
- **Level 4+ spell slots** — infrastructure extends to L3 only. L4+ follows the same pattern when needed.
- **Sprint P Mobile items** — blocked on MF spec.
- **XP-per-kill (individual)** — we add partial XP at combat exit. 5e awards XP per encounter, not per kill. The partial award covers the TPK/timeout gap without changing the standard model.

---

## 3. Rollout

1. **Branch** from latest `main` → `atlas/security-class-features`
2. **Implement** Tasks 1–7 in order. Each task is one commit.
3. **Smoke test:**
   - **Rate limit (IP):** 31 requests to `/register` from same IP → assert 429 on 31st
   - **XP partial:** Kill 1 of 2 monsters → combat timeout → assert partial XP awarded
   - **Spells:** Cast Mage Armor → assert success. Cast Fireball with 0 L3 slots → assert failure. Wizard at L5 → assert 2 L3 slots.
   - **Turn Undead:** Cleric vs 2 skeletons → assert frightened condition on failed saves
   - **creature_type:** GET /actions in combat → assert monsters have `creatureType` field
4. **Push** branch. Open PR against `main`.
5. **Report** in `OUTBOX_FOR_RAM_PRIME.md`.

---

## 4. Success Criteria

| Criterion | How to verify |
|---|---|
| IP rate limit fires | 31 requests from same IP to `/register` in 60s → 429 with Retry-After |
| Different IPs independent | IP-A at limit, IP-B still succeeds |
| Token renewal works | Session active at 25 min (renewed). Expired at 31 min (no activity). |
| Partial XP on timeout | Kill monsters → timeout → `partial_xp_awarded` event with correct count |
| Partial XP on session end | Kill monsters → DM ends session → partial XP awarded |
| Partial XP on TPK | All PCs die → partial XP for killed monsters |
| Normal combat XP unchanged | All monsters killed → full encounter XP via existing path |
| 6 new spells castable | Mage Armor, Burning Hands, Detect Magic, Identify (L1), Misty Step (L2), Fireball (L3) all in spell catalog |
| L3 slots exist at wizard L5 | `getMaxSpellSlots(5, "wizard")` → `level_3: { current: 2, max: 2 }` |
| Fireball fails without L3 slot | L1 wizard casts Fireball → "No level 3 spell slots remaining" |
| DB rehydration safe | Character without `level_3` field → defaults to `{ current: 0, max: 0 }` |
| creature_type in combat response | GET /actions during combat → monsters include `creatureType` |
| creature_type in spectator | Spectator API → monsters include `creatureType` |
| Turn Undead works | Cleric uses Channel Divinity → undead make WIS saves → failed saves get `frightened` condition applied. **Note: mechanical enforcement of frightened (disadvantage on attacks, can't approach source) is deferred. Test asserts condition IS applied, NOT that the engine enforces frightened behavior.** |
| Channel Divinity depletes | 1 use at L1 → second attempt returns ABILITY_ON_COOLDOWN |
| Rest resets Channel Divinity | Short rest → uses back to 1 |
| No level field in API | create_character has no level parameter |
| Move docs accurate | Player skill doc says exit names only, no positional descriptions |

---

## 5. File Inventory

| File | Action | What changes |
|---|---|---|
| `src/api/rate-limit.ts` | MODIFY | Add `ipRateLimitMiddleware` + `clearIpRateLimits` export |
| `src/api/rest.ts` | MODIFY | Add `POST /channel-divinity` route |
| `src/index.ts` | MODIFY | Wire `ipRateLimitMiddleware` on register/login/spectator routes |
| `src/types.ts` | MODIFY | `level_3` on SpellSlots; `RATE_LIMITED` on ReasonCode |
| `src/engine/spells.ts` | MODIFY | L3 branches in `getMaxSpellSlots`, `hasSpellSlot`, `expendSpellSlot`, `arcaneRecovery` |
| `src/engine/rest.ts` | MODIFY | `shortRest`: deep-copy `level_3` in newSpellSlots + include in `spellSlotsRecovered` check. `longRest` unchanged (uses `getMaxSpellSlots` which auto-includes L3). |
| `src/game/encounters.ts` | MODIFY | `creatureType: string` on MonsterInstance |
| `src/db/schema.ts` | MODIFY | `creatureType?: string` added to customMonsterTemplates.statBlock JSONB type |
| `src/game/game-manager.ts` | MODIFY | `awardPartialXP` helper; wired at 3 non-normal exit paths; `channelDivinityUses` on GameCharacter; `handleChannelDivinity`; creature_type in YAML loader + 6 response shapes; `channel_divinity` in action routes; rest handler resets Channel Divinity; `checkLevelUp` adds `level_3` to spell slot assignment; DB rehydration defaults `level_3` |
| `src/api/mcp.ts` | MODIFY | `channel_divinity` tool case |
| `src/api/auth.ts` | MODIFY | Renewal logging (temporary) |
| `src/api/spectator.ts` | MODIFY | `creatureType` in monster combat snapshots |
| `data/spells.yaml` | MODIFY | 6 new spell entries |
| `data/monsters.yaml` | MODIFY | `creature_type` on all 16 monster entries |
| `skills/player-skill.md` | MODIFY | Move description clarified (exit names only) |
| `tests/*.ts` | NEW/MODIFY | Rate limit tests, XP partial tests, spell L3 tests, Turn Undead tests, creature_type visibility tests |
