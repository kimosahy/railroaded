# Sprint F — CC Task Doc (Sonnet)

**Converted by:** Prime (Session 158)
**Spec by:** Poormetheus (Sprint F Spec, March 24, 2026)
**Mercury reviewed:** Yes — priority reorder + session visibility threshold + marquee concept
**Status:** AWAITING POORMETHEUS APPROVAL — do not execute until approved

---

## ⚠️ WARNINGS

1. **`bun test` hangs** without local Postgres. Always use `./test-runner.sh` (30s hard kill timer). If you run `bun test` directly, it will hang forever.
2. **Voice Directive (Sprint E, still active):** Every user-facing string must read like it was written by a storyteller, not a log parser. No template text, no database field names, no "Automated session" language.
3. **Do NOT touch WebSocket handler** (`src/api/ws.ts`) — it's fragile.
4. **Commit after each round.** Don't batch everything.

---

## Round 1: Combat Bugs (P0 — BLOCKING)

These are game-breaking. Nothing else matters until these work.

### F0.1: Fix Monster Attack Hit Calculation

**Root cause (verified):** In `src/game/game-manager.ts` ~line 1241, the monster attack path calls `resolveAttack` with a double-counted `to_hit`:

```typescript
attackerAbilityMod: attack.to_hit - proficiencyBonus(1),  // = to_hit - 2
proficiencyBonus: 0,
bonusToHit: attack.to_hit,                                 // = to_hit again
```

`resolveAttack` (`src/engine/combat.ts` ~line 98) sums all three: `totalAttackMod = attackerAbilityMod + proficiencyBonus + bonusToHit` = `(to_hit - 2) + 0 + to_hit` = `2 * to_hit - 2`. A goblin with `to_hit: 4` gets +6 instead of +4.

The double-count alone makes monsters hit MORE, but Poormetheus observed 0/10 hits including nat 18 vs AC 14. There may be an additional runtime issue — possibly the `attackRoll.kept[0]` (line 110 of combat.ts) returning unexpected values, or a type coercion issue with the attack object.

**Fix (two parts):**

**Part A — Fix the double-count:**
File: `src/game/game-manager.ts` ~line 1241 (inside the `// --- Standard attack roll path ---` section of `handleMonsterAttack`)

Change:
```typescript
const result = resolveAttack({
    attackerAbilityMod: attack.to_hit - proficiencyBonus(1),
    proficiencyBonus: 0,
    targetAC: target.ac,
    damageDice: attack.damage.replace(/[+-]\d+$/, ""),
    damageType: attack.type,
    damageAbilityMod: parseInt(attack.damage.match(/[+-]\d+$/)?.[0] ?? "0", 10),
    bonusToHit: attack.to_hit,
```
To:
```typescript
const result = resolveAttack({
    attackerAbilityMod: 0,
    proficiencyBonus: 0,
    targetAC: target.ac,
    damageDice: attack.damage.replace(/[+-]\d+$/, ""),
    damageType: attack.type,
    damageAbilityMod: parseInt(attack.damage.match(/[+-]\d+$/)?.[0] ?? "0", 10),
    bonusToHit: attack.to_hit,
```

This makes `totalAttackMod = 0 + 0 + to_hit` = the correct value from `monsters.yaml`. The `to_hit` field already includes ability mod + prof bonus per D&D 5e SRD convention.

**Part B — Add a unit test to verify monster hit calculation:**
File: new file `tests/monster-attack.test.ts`

Test that:
1. A goblin (to_hit: 4) with naturalRoll 18 vs AC 14 → `hit: true`
2. A goblin (to_hit: 4) with naturalRoll 1 → `hit: false` (fumble)
3. A goblin (to_hit: 4) with naturalRoll 20 → `hit: true` (natural 20)
4. A goblin (to_hit: 4) with naturalRoll 9 vs AC 14 → `hit: false` (9+4=13 < 14)
5. A goblin (to_hit: 4) with naturalRoll 10 vs AC 14 → `hit: true` (10+4=14 >= 14)

Use `resolveAttack` from `src/engine/combat.ts` directly with a deterministic `randomFn` to control the d20 roll.

**Done criteria:** Run the new test — all 5 cases pass. The monster attack total should be `naturalRoll + to_hit`, nothing more.

---

### F0.2: Implement Exit Unlocking (Locked Doors)

**Root cause (verified):** `unlockConnection()` exists in `src/game/dungeon.ts` line 155 — it changes a connection's type from `"locked"` to `"door"`. It is imported in `src/game/game-manager.ts` line 21. But **it is never called from any handler**. There is no way for the DM to unlock a locked door.

- `handleInteractWithFeature` (game-manager.ts line 2845) logs the feature interaction but does NOT check if the feature is a lock/puzzle and does NOT call `unlockConnection`.
- `handleAdvanceScene` (game-manager.ts line 3273) correctly blocks movement through locked exits (dungeon.ts line 125) but offers no unlock path.

**Fix — Add `unlock_exit` DM tool:**

**File: `src/tools/dm-tools.ts`** — Add a new tool definition after the `advance_scene` tool (~line 370):

```typescript
{
    name: "unlock_exit",
    description:
      "Unlock a locked door or passage so the party can proceed. Use this after the party " +
      "solves a puzzle, picks a lock, finds a key, or you decide to let them through. " +
      "Requires the room ID of the destination behind the locked exit.",
    inputSchema: {
      type: "object",
      properties: {
        target_room_id: {
          type: "string",
          description: "The room ID of the destination behind the locked exit (from get_room_state exits list).",
        },
      },
      required: ["target_room_id"],
    },
    handler: "handleUnlockExit",
},
```

**File: `src/game/game-manager.ts`** — Add handler function (near `handleAdvanceScene` around line 3305):

```typescript
export function handleUnlockExit(userId: string, params: { target_room_id: string }): { success: boolean; data?: Record<string, unknown>; error?: string } {
  const party = findDMParty(userId);
  if (!party) return { success: false, error: "Not a DM for any party." };
  if (!party.dungeonState) return { success: false, error: "No dungeon loaded." };

  const currentRoomId = party.dungeonState.currentRoomId;
  if (!params.target_room_id) return { success: false, error: "target_room_id is required." };

  // Verify the exit exists and is locked
  const exits = getAvailableExits(party.dungeonState);
  const exit = exits.find((e) => e.roomId === params.target_room_id);
  if (!exit) return { success: false, error: `No exit to room ${params.target_room_id} from current room.` };
  if (exit.connectionType !== "locked") return { success: false, error: `Exit to ${exit.roomName} is already unlocked (type: ${exit.connectionType}).` };

  party.dungeonState = unlockConnection(party.dungeonState, currentRoomId, params.target_room_id);
  logEvent(party, "exit_unlocked", null, { fromRoom: currentRoomId, toRoom: params.target_room_id, roomName: exit.roomName });

  return { success: true, data: { unlocked: true, roomName: exit.roomName, targetRoomId: params.target_room_id } };
}
```

**File: `src/api/mcp.ts`** — Add the `unlock_exit` case to the MCP tool dispatch switch. Follow the same pattern as other DM tools.

**File: `src/api/rest.ts`** — Add `POST /api/v1/dm/unlock-exit` route. Follow the same pattern as other DM routes.

**File: `src/game/game-manager.ts`** — Add to the `REST_ROUTES` map (~line 884):
```typescript
unlock_exit:                { method: "POST", path: "/api/v1/dm/unlock-exit" },
```

**Done criteria:** DM can call `unlock_exit` with a target_room_id → exit changes from "locked" to "door" → party can then `advance_scene` through it.

---

### F0.3: Implement Rogue Sneak Attack

**Root cause (verified):** `sneakAttackDice()` exists in `src/engine/combat.ts` line 236 — it returns the correct dice string (e.g., "1d6" at level 1). But **it is never called from `handleAttack`** (game-manager.ts line 955).

The player attack handler at line 955 resolves the attack via `resolveAttack()` and `damageMonster()` but never checks if the attacker is a rogue or whether Sneak Attack conditions are met.

**Fix:**

**File: `src/game/game-manager.ts`** — In `handleAttack`, after the `resolveAttack` call (~line 997) and before the `if (result.hit)` block (~line 999):

Add Sneak Attack bonus damage calculation:

```typescript
  // Rogue Sneak Attack: bonus damage if (a) ally adjacent or (b) attack had advantage
  let sneakAttackBonus = 0;
  if (result.hit && char.class === "rogue") {
    const allyInMelee = party.members.some((mid) => {
      if (mid === char.id) return false;
      const ally = characters.get(mid);
      return ally && ally.hpCurrent > 0 && !ally.conditions.includes("unconscious");
    });
    if (allyInMelee || result.critical) {
      const sneakDice = sneakAttackDice(char.level);
      const sneakRoll = roll(sneakDice);
      sneakAttackBonus = sneakRoll.total;
    }
  }
```

Then modify the damage application inside the `if (result.hit)` block:

Change:
```typescript
const { monster, killed } = damageMonster(target, result.totalDamage);
```
To:
```typescript
const totalDmg = result.totalDamage + sneakAttackBonus;
const { monster, killed } = damageMonster(target, totalDmg);
```

And update the stat tracking and event logging to use `totalDmg` instead of `result.totalDamage`:
```typescript
char.totalDamageDealt += totalDmg;
```

And in the logEvent and return data, include `sneakAttack: sneakAttackBonus > 0, sneakAttackDamage: sneakAttackBonus` so the DM narration and spectator data show when Sneak Attack fired.

**Import:** Add `sneakAttackDice` to the import from `../engine/combat.ts` (line ~48 of game-manager.ts) and `roll` from `../engine/dice.ts` if not already imported.

**Done criteria:** A rogue with an ally in the party deals 1d6 extra damage on hit at level 1. The event log shows `sneakAttack: true`.

---

**Round 1 commit message:** `Sprint F Round 1: Combat fixes — monster hit calc, locked doors, sneak attack`

---

## Round 2: Frontend Fixes + Copy Kills

### F1.2: Character Stats All Zeros on Profile

**File:** `website/character.html`

**Investigation needed:** The character profile page fetches from `/spectator/characters/:id` (spectator.ts line 738). The endpoint returns `monstersKilled`, `dungeonsCleared`, `sessionsPlayed`, etc. Check if:
1. The frontend is reading the correct field names from the response
2. The backend aggregation in `spectator.ts` lines 738-835 is summing stats correctly

If stats are zero in the API response, the issue is backend — character stats are tracked in-memory (`char.monstersKilled++` in game-manager.ts) but may not be persisted to the DB. The in-memory state resets on server restart. Check that `snapshotCharacters` (called at combat end / session end) persists these fields.

**Fix:** Ensure `snapshotCharacters` writes `monstersKilled`, `dungeonsCleared`, `sessionsPlayed`, `totalDamageDealt`, `criticalHits` to the DB. If these columns don't exist in the characters table schema (`src/db/schema.ts`), add them via a Drizzle migration.

### F1.3 + F4.2: Leaderboard Character Name Contrast

**File:** `website/leaderboard.html`

Character names in the leaderboard table rows have insufficient contrast against dark backgrounds. Find the CSS for leaderboard table row names and ensure the text color is a light color (e.g., `var(--text)` or `#e8dcc8`) on dark row backgrounds.

### F1.4: Leaderboard "Dungeons Cleared" Tab Empty

**File:** `src/api/spectator.ts` ~line 611

The endpoint filters `c.dungeonsCleared > 0`. The `dungeonsCleared` field only increments when `end_session` is called with `completed_dungeon: true` (game-manager.ts line 3874). Automated sessions from the scheduler may not be passing this flag.

**Fix (two parts):**
1. Check `src/game/autopilot.ts` (or wherever the session scheduler calls end_session) — ensure it passes `completed_dungeon: true` when the dungeon was actually completed (all rooms cleared or boss defeated).
2. If `dungeonsCleared` data is genuinely zero in the DB for all characters, the leaderboard tab is correctly showing empty. In that case, hide the tab when no data exists (show it only if the filtered list has entries).

### F1.5: Leaderboard "Best DMs" Tab — Show Stats or Hide

**File:** `website/leaderboard.html`

If no DM rating data exists, hide the "Best DMs" tab entirely rather than showing "No DM ratings yet." Alternatively, use the DM stats already being tracked (`sessionsAsDM`, `dungeonsCompletedAsDM`, `totalEncountersRun`, `totalMonsterSpawns` from `persistDmStats` in game-manager.ts) to populate the tab.

### F1.6: Session Event Count Mismatch

**Files:** `website/session.html`, `website/theater.html`, `website/tracker.html`

One page shows 77 events, another shows 67. Check which endpoint each page uses for event count:
- Session detail (session.html) likely counts events from `/spectator/sessions/:id` response
- Theater/tracker may count from `/spectator/sessions` list endpoint where `eventCount` is a summary field

Ensure both count sources use the same query. The discrepancy is likely that one counts ALL event types while the other filters some (e.g., excludes `system` or `heartbeat` events).

### F1.7: Party Roster Empty on Session Detail

**File:** `website/session.html` ~line 602

The rendering code (`renderSidebar(members)` at line 600) looks correct. The issue is likely that `data.members` is an empty array from the `/spectator/sessions/:id` endpoint. This happens when the session's `partyId` doesn't match any characters in the DB (characters weren't persisted, or party was dissolved before snapshot).

Check the API response for a known session with a non-empty party. If `members` is empty, the issue is in `spectator.ts` ~line 1080 where it queries characters by `partyId`.

### F2.1 + F2.2: Kill Template Summaries

**Files:** `website/theater.html` ~lines 449-450, 574-577, 610; `website/tracker.html` ~line 1400

Current fallback summaries: `"[partyName]'s expedition — unchronicled"` and `"awaits its chronicler"`.

**Fix:** Replace these fallbacks with a function that generates a summary from the session's event log. When no AI summary exists:
1. Count room_enter events → "explored N rooms"
2. Count combat_start events → "fought N encounters"
3. Get dungeon name from first event data → "in [Dungeon Name]"
4. Get outcome → "emerged victorious" / "fell in battle" / "retreated"

Example output: `"The Stalwart Covenant delved into the Goblin Warren — fought through 3 encounters across 5 rooms and emerged victorious."`

**Session visibility (Mercury addition):** Sessions with fewer than 3 events should be hidden from theater and tracker pages. Add a filter: `sessions.filter(s => (s.eventCount || 0) >= 3)` before rendering on theater.html, tracker.html, and index.html.

### F2.3: Theater "Meet the Cast" — Use Real Descriptions

**File:** `website/theater.html`

Find where the character spotlight says `"A living legend of the realm"` (search for this exact string). Replace with the character's `description` field from the API response. The `/spectator/characters` endpoint returns `description` for each character.

Fallback chain: `character.description` → `"[Race] [Class], level [Level]"` → remove the card entirely if no meaningful data.

### F2.4: Possessive Grammar Fix

**Files:** All website HTML files that form possessives from party names.

Search for `+ "'s "` or `+ "\'s "`. Add a helper function:
```javascript
function possessive(name) {
  return name.endsWith('s') ? name + "'" : name + "'s";
}
```
Replace all instances of `partyName + "'s"` with `possessive(partyName)`.

### F2.5: Character Quote Attribution

**Files:** `website/index.html` (homepage "Voices from the Dungeon"), any other page with character quotes.

Check that every quote card shows: character name, race, class. If any show "Unknown Adventurer" or just race/class without a name, trace back to the data source and ensure `characterName` is populated. The `/spectator/sessions/:id` endpoint includes character names in event data.

---

**Round 2 commit message:** `Sprint F Round 2: Frontend fixes, copy kills, leaderboard, session visibility`

---

## Round 3: Theater Upgrades + Benchmark + Model Identity

### F3.1: Benchmark Hero Text

**File:** `website/benchmark.html`

Find the hero section that says `"NO MODELS HAVE ENTERED THE DUNGEON YET"`. Replace with progress-focused copy:

`"86 sessions recorded. 14 to go before we unlock the first behavioral benchmark."`

Pull the actual session count from the stats endpoint. Show a prominent progress bar. Below: `"Every session brings us closer. Send your agent to help us cross the line."` with CTA to the agent docs.

### F5.2 + F5.3 + F1.1: Avatars and Model Badges on Characters Page

**File:** `website/characters.html` ~line 248

The avatar rendering code already handles `avatarUrl` (line 248-253). If avatars show as initials only, the issue is that `avatarUrl` is null for all characters in the DB.

**Check:** `curl https://api.railroaded.ai/spectator/characters | jq '.[0].avatarUrl'` — if null, the issue is backend data, not frontend rendering.

**Model badges:** The `/spectator/characters` endpoint (spectator.ts line 652) does return `model` data via the `getModelIdentity` lookup + DB join. But Session 156 confirmed `model` is null for all 122 characters. The in-memory model identity is only set during active sessions and lost on server restart.

**Root cause for null model data:** Model identity is stored per-user in the auth system (`src/api/auth.ts` line 241) during login/registration. But the `users` table columns `modelProvider` and `modelName` may not be populated by all agent connection flows. Check:
1. `src/api/auth.ts` — does the registration/login handler save model identity to DB?
2. `src/api/agents.ts` — does the MCP agent connection flow save model identity?

**Fix:** Ensure the agent connection flow writes `modelProvider` and `modelName` to the `users` table. The OpenClaw MCP connection includes model metadata — extract it and persist it. This fixes badges everywhere: characters page, session detail, theater spotlight, leaderboard.

### F6.2: Theater Page — Marquee Not Dashboard

**File:** `website/theater.html`

**Key changes:**
1. When no live session: make "Now Showing / Coming Up" the hero element with the countdown timer (already exists on index.html — reuse that pattern). Currently "Featured Production" (backward-looking) is the hero — swap priority.
2. "Best Of" section: convert from list to highlight reel cards. Each card shows: the quote/action text, character name + model badge, session name, dramatic context. Use the same card styling as the narration cards.
3. "Meet the Cast" spotlight: add model badges next to character names. Format: `"Kael Voidtouched — Claude Opus"`. The model data comes from the same API response.

### F6.3: Session Detail — Model Identity Per Character

**File:** `website/session.html`

The session detail page already has `modelBadge()` helper and renders model badges in the sidebar (line 614). The issue is the data — `m.model` is null for most characters.

**Quick fix:** The `/spectator/sessions/:id` endpoint (spectator.ts line 1050) does a left join with users to get `modelProvider`/`modelName`. If these are null in the DB, no badge shows. This is the same root cause as F5.3 above — fixing model identity persistence fixes this everywhere.

**Interim display fix:** In the event timeline, when showing character chat/action events, check if the event data includes `modelIdentity` (game-manager.ts line 4947 logs it on session_start events). If available, render it as a small model badge next to the character name in the event card.

---

**Round 3 commit message:** `Sprint F Round 3: Theater marquee, benchmark copy, model identity pipeline`

---

## Done Criteria Per Round

**Round 1 (BLOCKING):**
- [ ] Monster with to_hit: 4 hits AC 14 on a d20 roll of 10+ (unit test passes)
- [ ] Monster attack double-counting eliminated (totalAttackMod = to_hit, nothing extra)
- [ ] DM can call `unlock_exit` to transition a locked door → unlocked
- [ ] After unlocking, `advance_scene` succeeds through that exit
- [ ] Rogue deals bonus 1d6 on hit when ally is in the party
- [ ] Sneak Attack shows in event log data

**Round 2:**
- [ ] Character profile shows non-zero stats for characters who have played sessions
- [ ] Leaderboard character names are clearly visible on dark backgrounds
- [ ] Sessions with < 3 events hidden from public pages
- [ ] Template fallback summaries replaced with event-derived summaries
- [ ] Possessive grammar correct for names ending in 's'
- [ ] Character quote cards show full name + race + class

**Round 3:**
- [ ] Benchmark page shows progress text, not "no models" text
- [ ] Theater hero is forward-looking (countdown/next session) when nothing's live
- [ ] Model identity persists to DB through agent connection flow
- [ ] Model badges render on characters page where data exists
