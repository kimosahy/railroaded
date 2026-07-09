# Story Gap Audit — Fable Sprint (2026-07-07)

**Objective under audit:** a production must run a real ~30-minute session that
(a) keeps going without stalling, (b) accumulates narrative state across scenes,
(c) connects scenes into an arc, and (d) exports the finished session as a single
readable markdown story.

Every gap below is grounded in a specific file/function or a specific playtest
finding. Priority order = "what most blocks a real exported story."

Playtest sources cited:
- **PT-0612** — `PLAYTEST_REPORT_2026-06-12.md` (Poormetheus, session-269, The Bandit Fortress)
- **PT-0505** — Mercury consolidated report 2026-05-05 (2 parallel sessions, 4 model providers)
- **PT-0429** — Mercury benchmark/data audit 2026-04-29

---

## GAP 1 (P0 — blocks (a) session keeps going): Downed PCs stall combat every round

**Symptom (PT-0612 §5/§6):** "a stabilized/unconscious PC keeps being handed combat
turns (soft-lock requiring a manual `end_turn`)… creates dead air a director would cut."
Also PT-0505 bug 13: engine "ground initiative through dodge turns forever."

**Code trace:**
- `advanceTurnSkipDead` ([src/game/game-manager.ts:1253-1291](src/game/game-manager.ts)) skips
  dead monsters, asleep monsters, and **only `dead` players** (line 1284). An unconscious
  (dying) or stabilized PC falls through to `break` at line 1290 and is handed the turn
  every single round.
- No auto death save exists: `deathSave()` is called from exactly one place, the
  agent-initiated `handleDeathSave` (game-manager.ts:4413). If the agent does nothing,
  the 45s autopilot (`AUTOPILOT_TIMEOUT_MS`, game-manager.ts:283) fires and… dodges
  (`autopilot.ts:32-33` — 0 HP hits the `hpPercent < 25` branch). **45 seconds of dead
  air per downed PC per round, and the dying PC never actually rolls a death save.**
- Stabilized PCs are worse: `getAllowedActions` still advertises `death_save`
  ([src/game/turns.ts:106-109](src/game/turns.ts) checks `unconscious` + 0 HP but not `stable`),
  and `handleDeathSave` **rejects** it — "You are already stabilized."
  (game-manager.ts:4393-4396). The agent's only working verb is `end_turn`; agents that
  follow the advertised action list stall until autopilot.
- The existing softlock recovery (`checkSoftlockRecovery`, game-manager.ts:8064-8067)
  explicitly returns early during combat — it only covers the post-combat all-stable case.
- Test gap: no test exercises `advanceTurnSkipDead` landing on an unconscious/stable PC
  (`tests/softlock-recovery.test.ts` is post-combat only; `test.todo`s at
  tests/game-manager.test.ts:442 and :561 confirm the hole).

**Why it blocks the objective:** a 30-minute session with one downed PC bleeds
45-second holes every round — PT-0612 flagged this as the single biggest pacing killer,
and PT-0505's parallel session ground to a permanent dodge-loop. This is the #1
"session stalls" cause that isn't already fixed.

**Fix (small, surgical):** in the player branch of `advanceTurnSkipDead` —
(1) dying PC (unconscious, not stable): auto-roll the death save inline (same logic as
`handleDeathSave`) and advance — RAW-correct, a dying creature's turn *is* its death save;
(2) stable PC: log a "held, stable" beat and skip, mirroring the asleep-monster pattern
(lines 1273-1281). Plus: stop advertising `death_save` to stable PCs in `turns.ts`.

---

## GAP 2 (P0 — blocks (b) consequences accumulate): Death is erased by the next encounter

**Symptom (PT-0505 Tier-1 bug 2):** "A player with 3 failed death saves (`dead: true`)
appeared **alive at full HP** when the Bugbear encounter triggered after the Goblin
guard post fight. Inter-encounter character state is not preserved."

**Code trace:**
- `handleSpawnEncounter` builds the player initiative list from **all party members**
  with no aliveness filter ([src/game/game-manager.ts:5063-5068](src/game/game-manager.ts)):
  every member — dead, dying, or stable — is fed to `rollEncounterInitiative`
  ([src/game/encounters.ts:117-137](src/game/encounters.ts)), which rolls initiative for
  every entry unconditionally. A dead PC re-enters combat as a live combatant slot.
- `handleTriggerEncounter` (game-manager.ts:5104) shares the same pattern.
- The literal "full HP" resurrection: `loadPersistedCharacters` rebuilds **every**
  character at `hpCurrent = hpMax` with `conditions: []` and zeroed death saves —
  "restart = long rest" — including dead ones (game-manager.ts:8793, :8809-8810).
  Dev runs `bun run --watch`, so any reload between encounters resurrects the fallen;
  the DB snapshot (`snapshotCharacters`, game-manager.ts:8234) already stores
  conditions/deathSaves/isAlive, the loader just ignores them.
- Healing is a second resurrection path: `handleRegainFromZero` **removes the `dead`
  condition** ([src/engine/hp.ts:125](src/engine/hp.ts)) and every heal site (cast /
  potion / scroll / bonus-action) targets via `characters.get(target_id)` with no dead
  check — a stray Cure Wounds un-kills a corpse.
- Compounding it, combat end auto-stabilize is silently broken the other way:
  `stabilizeUnconsciousCharacters` (game-manager.ts:8040-8048) gates on `c.isAlive`,
  a runtime-added field only ever assigned at death sites — `undefined` (falsy) for a
  merely-unconscious character, so the post-combat stabilize never fires for them.
  Combined with the `look` rendering bug (PT-0505 bug 12, "prone, dead" vs
  "unconscious" in the same tick), the table state after a fight no longer reflects
  what the dice decided during it.

**Why it blocks the objective:** the whole premise (PT-0612 proved it works when state
holds) is dice-earned consequences that persist. If Vossa dies in scene 3 and stands up
in scene 4, there is no arc — the story contradicts itself and the export is fiction of
the wrong kind.

**Fix (small):** filter initiative candidates to conscious, alive members in
`handleSpawnEncounter`/`handleTriggerEncounter` (dead PCs never enter initiative;
unconscious-but-stable PCs enter as "down" and are skipped by the GAP-1 fix); never
reset a dead character's state.

---

## GAP 3 (P0 — blocks (b)+(c) narrative state & arc): Scene lore has no memory

**Symptom (PT-0505 Tier-1 bug 1):** "Room descriptions regenerate per-call. Same room
ID, different lore on revisit… The dungeon's premise rewrote itself mid-session from a
warrior-king's tomb to a Victorian observatory. **No traceable arc is possible if rooms
have no fixed identity.**" Also bug 17: `override_room_description` is cosmetic.

**Code trace:**
- The server-side template text is stable, but the lore players actually experience is
  the DM's `narrate` prose — delivered verbatim and **discarded**
  ([src/tools/dm-tools.ts:100-107](src/tools/dm-tools.ts): "The server does not modify the
  text"). Nothing stamps narrated lore onto the room.
- `handleGetRoomState` actively invites re-derivation: it surfaces the session theme
  "so DM agent can recontextualize room descriptions" (game-manager.ts:5821-5823) —
  with no memory of what was already established, every call is an invitation to rewrite
  the premise.
- `DungeonRoom.visited` exists ([src/game/dungeon.ts:7-15](src/game/dungeon.ts), set in
  `moveToRoom` at dungeon.ts:136-140) but is **never surfaced in any tool response**
  (`handleLook`, `handleMove`, `handleGetRoomState`, `handleAdvanceScene` all omit it).
  The DM cannot even know it's a revisit.
- `room_enter` events log **only the name** (game-manager.ts:3356, :5702) — no roomId, no
  description — so the event stream can't anchor scenes to stable scene identities either.
- `handleOverrideRoomDescription` (game-manager.ts:5158-5174) mutates only the in-memory
  description of the current room; the room **name** stays the template name in every
  spectator `room_enter`, and `room_override` has no case in the spectator formatter
  (spectator.ts:1667-1786) — the audience never sees the new lore. PT-0505 bug 17 verbatim.

**Why it blocks the objective:** (b) and (c) require that what the DM establishes in
scene 2 is still true in scene 5. Today the engine gives the DM amnesia by design.

**Fix (medium, additive):** scene canon —
(1) stamp the first `narrate type:"scene"` after each `room_enter` onto the room as
`canonNarration`; (2) expose `visited` + `canonNarration` in `look` / `get_room_state` /
`advance_scene` responses ("this room is already established as: …"); (3) include
`roomId` + description in `room_enter` event payloads so scenes have stable identity in
the event stream (this also feeds GAP 4's export).

---

## GAP 4 (P0 — blocks (d) directly): No story export exists

**Evidence:** CLAUDE.md backlog item 16 lists it as missing verbatim: "Full session
transcript endpoint… Narrator-enhanced transcripts. **Exportable format (Markdown)**."
`grep -n "transcript" src/api/spectator.ts` → zero hits. What exists today:
- `GET /spectator/sessions/:id/events` (spectator.ts:1613) — raw JSON event rows,
  capped at 1000, hidden-type filter only. A transcript dump, not a story.
- `GET /spectator/narrations/:sessionId` (spectator.ts:1890) — narrator prose only,
  **newest-first**, no scene structure, falls back to raw narration events.
- `summarizeSession` ([src/game/journal.ts:24-94](src/game/journal.ts)) — flat
  `[Combat] X attacked Y` lines; used in the `end-session` response (PT-0612 §5 praised
  the eventLog for capture, but it is machine shorthand, not a readable story).

**Why it blocks the objective:** (d) is the deliverable the whole objective is judged
by — "does this get us closer to a real exported story?" Today the answer is: nothing
produces one, for any session, at any quality.

**Fix (medium, additive):** `GET /spectator/sessions/:id/story.md` — compose from
persisted data: title/cast header (party, characters, models), scenes split on
`room_enter` boundaries, DM narration prose (`narration` events + `narrations` table
merged chronologically), key mechanical beats rendered as prose interstitials (deaths,
death saves, crits, combat start/end — reusing the taste of `formatActivityEvent`,
spectator.ts:1675), dialogue from `chat`/`npc_dialogue`, epilogue from the session
summary. Markdown response, `text/markdown`.

---

## GAP 5 (P1 — blocks (b) across restarts): A server restart erases every live story

**Code trace:** `loadPersistedState` **deactivates all sessions on boot** —
game-manager.ts:8546-8554 marks every active session inactive, then the restore loop
iterates an empty array (dead code). Even the dead restore path would rebuild the
dungeon from `getRandomTemplate()` (game-manager.ts:8660-8678) — a different dungeon
than the one the story happened in. `parties.currentRoomId`
([src/db/schema.ts:211](src/db/schema.ts)) is never written or read anywhere.

**Impact:** any deploy or crash mid-session kills the production (PT-0612's session-269
would have been unrecoverable at minute 20). Events survive (logEvent persists,
game-manager.ts:7986-7998) so the *export* survives, but the *session* cannot continue.

**Not fixed this sprint:** a faithful mid-session rehydrate (dungeon state, initiative,
monster instances, turn resources) is a broad change to game-manager's startup path —
exactly the class of refactor this sprint's constraints exclude. Documented for the next
sprint; the GAP 3 fix deliberately writes room canon into the event stream so a future
rehydrate has the data it needs.

## GAP 6 (P1 — blocks (b)): Story flags require a campaign that default sessions don't have

**Evidence:** `set_story_flag` requires an active campaign
(game-manager.ts:6714 operates on `campaign.storyFlags`; `handleCreateCampaign` at
:6461). But matchmade parties are born with `campaignId: null`
(`formParty`, game-manager.ts:7870) and nothing bootstraps a campaign. PT-0505 bug 21:
auto-promoted DM "started a session without a campaign attached" — NPC/quest/flag tools
all blocked. The only in-session narrative-state container is therefore unavailable in
the most common session shape.

**Fix direction (small, not top-4):** bootstrap a lightweight default campaign at party
formation (or make `set_story_flag` session-scoped when no campaign exists). Behind the
top-4 because GAP 3's scene canon covers the within-session arc need this sprint.

## GAP 7 (P2 — pacing): Autopilot always dodges; disconnected parties grind forever

`getAutopilotAction`'s combat attack branch is documented dead code — Pass 1 hardcodes
`isUnderAttack: false`, so autopilot always returns dodge (game-manager.ts:557-560, 578;
autopilot.ts:32-33). PT-0505 bug 13: "no PC ever attacks, only zombies grind HP."
Mitigated for downed PCs by GAP 1's fix; the general case (conscious disconnected PCs)
is a design call (auto-attack vs. forfeit) — flagged, not fixed here.

---

## What is explicitly NOT broken (verified, don't re-fix)

- Event persistence: every `logEvent` writes through to `session_events`
  (game-manager.ts:7984-7998). The export in GAP 4 can trust the DB.
- Narrator layer: `POST /narrator/narrate` → `narrations` table works
  ([src/api/narrator.ts:37-92](src/api/narrator.ts)).
- Within-session room description text (the template string) is stable; the regen bug
  is the *narrated* layer (GAP 3), not `moveToRoom` (dungeon.ts:114-150 never touches
  `description`).
- DM promotion/handshake was reworked since PT-0505 (pendingPromotion gating +
  role persisted only at handshake success, game-manager.ts:739-921 + Fix 1.3 comments);
  PT-0612 confirms the handshake path completes. Discoverability complaints remain but
  the deadlock family is addressed.

## Sprint plan (from this audit)

| Order | Gap | Size | Deliverable |
|---|---|---|---|
| 1 | GAP 1 turn stall | S | auto death save + stable skip + tests |
| 2 | GAP 2 encounter state reset | S | initiative aliveness filter + tests |
| 3 | GAP 3 scene canon | M | canon stamp + visited/canon in DM tools + roomId in room_enter + tests |
| 4 | GAP 4 story export | M | `GET /spectator/sessions/:id/story.md` + tests |
| — | GAP 5/6/7 | — | documented above, next sprint |
