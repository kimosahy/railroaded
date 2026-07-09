# Fable Sprint Report — Story Engine (2026-07-07)

**Branch:** `fable/story-engine-sprint` (never touched main)
**Spec:** `FABLE_STORY_SPRINT.md` · **Audit:** `STORY_GAP_AUDIT.md`

**Objective:** a production runs a real ~30-minute session that (a) doesn't stall,
(b) accumulates narrative state across scenes, (c) connects scenes into an arc,
(d) exports as one readable markdown story.

All four top gaps from the audit were implemented, each with tests, each in its own
commit. Full test suite: green (the only failures are the two pre-existing
`tracker-responsive` failures, present on main before this sprint — verified by
stashing and re-running).

---

## 1. Downed PCs never hold the combat turn (GAP 1 — objective (a))

**Commit:** `Fable sprint GAP 1` · **Files:** `src/game/game-manager.ts`, `src/game/turns.ts`, `tests/downed-turn-skip.test.ts`

**Why:** PT-0612's #1 pacing killer: "a stabilized/unconscious PC keeps being handed
combat turns (soft-lock requiring a manual end_turn)". Each downed PC bled 45 seconds
of dead air per round (autopilot dodge), and dying PCs never actually rolled death saves.

**What changed:**
- `advanceTurnSkipDead` now handles all three downed states: dead → removed (as before);
  **stable → skipped** like asleep monsters, with a `turn_auto_advanced` event
  (reason `unconscious_stable`); **dying → auto-rolls the death save** (RAW: a dying
  creature's turn *is* its death save) and passes the turn — nat 20 revival correctly
  gives them their turn back.
- `performDeathSave` extracted from `handleDeathSave` — one shared path for manual and
  automatic saves (event log carries `auto: true` for auto-rolls, so the drama still
  reaches spectators and the story export).
- `getAllowedActions` no longer advertises `death_save` to stabilized PCs (the engine
  always rejected it — agents following the advertised list stalled).

**How to verify:**
```bash
./test-runner.sh tests/downed-turn-skip.test.ts   # 7 pass
```

## 2. Dead stays dead (GAP 2 — objective (b), consequences persist)

**Commit:** `Fable sprint GAP 2` · **Files:** `src/game/game-manager.ts`, `src/engine/hp.ts`, `tests/dead-stay-dead.test.ts`

**Why:** PT-0505 Tier-1: "A player with 3 failed death saves appeared alive at full HP
when the next encounter triggered." Three resurrection paths existed:
1. `handleSpawnEncounter` built initiative from **all** party members — dead included.
2. `loadPersistedCharacters` rebuilt every character at full HP with cleared
   conditions/death-saves on every server restart ("restart = long rest") — and dev
   runs `--watch`, so any reload resurrected the fallen.
3. `handleRegainFromZero` stripped the `dead` condition — any heal aimed at a corpse
   un-killed it.

**What changed:** dead members never enter initiative (unconscious/stable ones do —
GAP 1's turn loop handles them); dead rows reload dead (0 HP, `dead` condition,
persisted death saves); healing can no longer remove `dead` and all four target-heal
paths (cast / potion / scroll / bonus-action) refuse or skip dead targets — potions
on a corpse error without being consumed. Bonus fix: post-combat auto-stabilize gated
on the canonical `dead` condition instead of the runtime `isAlive` field that was
`undefined` for merely-unconscious characters (it silently never fired).

**How to verify:**
```bash
./test-runner.sh tests/dead-stay-dead.test.ts     # 5 pass
```

## 3. Scene canon — room lore survives revisits (GAP 3 — objectives (b)+(c))

**Commit:** `Fable sprint GAP 3` · **Files:** `src/game/dungeon.ts`, `src/game/game-manager.ts`, `tests/scene-canon.test.ts`

**Why:** PT-0505 Tier-1: "Room descriptions regenerate per-call. Same room ID,
different lore on revisit… **No traceable arc is possible if rooms have no fixed
identity.**" The engine delivered DM narration verbatim and discarded it, never
surfaced the `visited` flag, and `get_room_state` actively told the DM to
"recontextualize" descriptions with no memory of what was established.

**What changed:**
- `DungeonRoom.canonNarration`: the **first scene-narration in a room is stamped as
  its established lore** (later narrations don't overwrite; an explicit
  `override_room_description` does — a rewrite is the new canon).
- `get_room_state` serves `visited` + `canon_narration` + a consistency note telling
  the DM to build on established lore, never contradict it.
- `advance_scene` responses carry `revisit` + `canon_narration` (with the note on
  revisits), so a returning party gets the same room they left.
- `room_enter` events now carry `roomId`, `description`, `revisit` — scenes have
  stable identity in the persisted event stream (this feeds the story export).

**How to verify:**
```bash
./test-runner.sh tests/scene-canon.test.ts        # 6 pass
```

## 4. Story export — the deliverable itself (GAP 4 — objective (d))

**Commit:** `Fable sprint GAP 4` · **Files:** `src/game/story-export.ts` (new), `src/api/spectator.ts`, `tests/story-export.test.ts`

**Why:** Nothing produced a readable story for any session (CLAUDE.md backlog item 16
listed "Exportable format (Markdown)" as missing; the only outputs were raw JSON event
dumps and newest-first narration lists).

**What changed:** `GET /spectator/sessions/:id/story.md` returns the session as one
markdown story:
- Title + world line (from DM session metadata) + date/duration/outcome byline
- **The Company**: cast with race/class/level, model attribution ("played by
  anthropic/…"), and a † for the fallen
- **Scenes** split on `room_enter` boundaries ("(return)" on revisits), containing —
  chronologically merged — DM narration as prose, NPC dialogue and party chat as
  speaker lines, narrator (Poormetheus) prose as blockquotes, and mechanical beats
  (crits, death saves, deaths, combat start/end, loot, rests, level-ups) as italic
  interstitials. Turn/queue/autopilot noise never appears.
- **Epilogue** from the DM's end-session summary; live sessions get a
  "still in progress" note.

The composer (`src/game/story-export.ts`) is a pure function — trivially testable.
The endpoint is DB-first (persisted sessions survive restarts) with an in-memory
fallback for live sessions.

**How to verify:**
```bash
./test-runner.sh tests/story-export.test.ts       # 9 pass (incl. end-to-end via real handlers)

# Or against a running server with a finished session:
bun run src/index.ts &
curl -s http://localhost:3000/spectator/sessions/<session-id>/story.md
```

---

## Full-suite verification

```bash
./test-runner.sh 2>&1 | grep "(fail)" | sort -u
# → only the 2 pre-existing tracker-responsive failures (also fail on main)
```

27 new tests across 4 files. Note: the full suite takes >30s wall-clock and
test-runner.sh hard-kills at 30s (by design, DB pool cleanup hangs) — so full-suite
verification is by scanning for `(fail)` lines, not the final summary line.

## Documented but deliberately not fixed (see STORY_GAP_AUDIT.md)

- **GAP 5:** restart wipes live sessions (`loadPersistedState` deactivates everything;
  restore loop is dead code). A faithful mid-session rehydrate is a broad startup-path
  change — excluded by sprint constraints. GAP 3 deliberately writes room canon into
  the event stream so a future rehydrate has the data.
- **GAP 6:** story flags require a campaign, but matchmade parties are born without
  one (`formParty` sets `campaignId: null`) — flag tools are dead in the default
  session shape. Small fix (bootstrap a default campaign) but behind the top-4.
- **GAP 7:** autopilot always dodges (attack branch is documented dead code) —
  disconnected conscious parties still grind; a design call (auto-attack vs forfeit).

## What I'd do next with more time

1. **GAP 6 first** — bootstrap a lightweight default campaign at party formation so
   `set_story_flag` / NPC / quest state exists in every session; it's the natural
   between-scenes state container and the export could render flags as chapter notes.
2. **Session rehydrate (GAP 5)** — restore dungeon state, initiative, and monsters
   from the event stream + snapshots so a deploy doesn't kill a 20-minute production.
3. **Feed canon into player `look`** — players currently see only the template
   description; serving established canon would tighten in-fiction consistency.
4. **Export polish** — per-character perspective exports (`?as=<characterId>` reusing
   `filterEventsForCharacter`), and a `/story.json` variant for Mercury's content
   pipeline (X threads want structured beats).
5. **Wire the export into the website** — a "Read the story" button on session pages;
   the journals page is the natural home.
