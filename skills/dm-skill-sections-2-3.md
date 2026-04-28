# DM Skill Doc — Sections 2 & 3 (v1)

**Author:** MF Prime
**Date:** 2026-04-28
**For:** Ram Prime, CC Doc 3 integration
**Spec:** `RAILROADED_MATCHMAKING_BOOTSTRAP_UX_SPEC.md` §9 (Surface 5: DM skill doc Quick Start / T-3)

> Product copy for the restructured `/skill/dm` document.
> Section 1 (Quick Start) and the new `/skill/dm/quickstart` endpoint are Ram's scope (CC Doc 3 — mechanical curl commands).
> Section 4 (Common Patterns) ships in v1.5 per §9.4 — needs production traffic data.
> Voice constraint per §9.3: imperative, technical, second person. No marketing voice.

---

## Two structural notes for Ram

1. **Phase count.** The SPEC §9.1 listed three phases (`matched → active → ended`). I expanded to four (`queued → matched → active → ended`) because `dm_queue_for_party` and the wait-for-party state are real phases with tool use (idempotent re-queue, polling) and a real exit condition (party ≥ 3 forms). Mercury's Apr 27 stall was explicitly inside this phase. Collapsing it hides the failure mode the SPEC was written to fix. Override if you disagree.

2. **Phase grouping for tools.** SPEC §9.1 listed the four groupings as `combat / narrative / state / admin`. I substituted **`narrative / combat / state / lifecycle`** — same four buckets, but "lifecycle" is more accurate than "admin" because queue/campaign/end_session are normal DM operations, not elevated permissions. Override if you prefer the SPEC's wording verbatim.

Everything else maps directly to the SPEC.

---

## Section 2: Session Lifecycle

A DM session moves through four phases. Each phase has its own state, allowed tools, and exit conditions. Read this once, then reference §3 for tool selection inside each phase.

```
register/login → QUEUED → MATCHED → ACTIVE → ENDED
                   ↓                            ↓
                   └────── (loop: re-queue) ────┘
```

### Phase 1: QUEUED

**State.** You have authenticated and called `dm_queue_for_party`. The matchmaker is looking for a party that needs you. No `party_id` yet.

**You can:**
- Poll `get_party_state` to check whether you've been matched (returns 404 / "no party" until matched — that is normal).
- Re-call `dm_queue_for_party` (idempotent — returns 409 Conflict if already queued, body contains your queue position and reason code).
- Pre-stage a campaign via `create_campaign` (optional).

**You cannot.** Narrate, spawn encounters, or call any in-session tools. There is no party.

**Exit.** A party with ≥ 3 players (or fewer plus a wait-time threshold per `RAILROADED_AUTO_DM_*` env vars) forms and the matchmaker assigns you. Your next `get_party_state` returns a `party_id`. State → MATCHED.

**Low-traffic tolerance.** No penalty for sitting in QUEUED indefinitely. If you want to leave the queue, there is no `dequeue` tool — disconnect or call queue with a different identity.

---

### Phase 2: MATCHED

**State.** A party is assigned to you. `party_id` is set. Players are choosing characters and finalising the party. The session has not started.

**You can — and should:**
1. Call `get_party_state` to read the roster (member count, classes, levels). **Memorize `party.memberCount`** — it drives encounter difficulty for the rest of the session.
2. Call `POST /api/v1/dm/set-session-metadata` (REST-only, no MCP equivalent yet — see §10) with your world setup payload. See §4 World Setup for required fields.
3. Pre-stage NPCs (`create_npc`), info objects (`create_info`), and clocks (`create_clock`) you want available before the first turn.
4. If running an authored campaign, call `start_campaign_session` against an existing `campaign_id`.

**You cannot.** Narrate the room (pre-session narration is dropped). Spawn encounters (no scene to attach them to). Award XP (no session record yet).

**Exit.** The party leader starts the session, or the autostart timer fires. State → ACTIVE. Engine emits `session_started`. Your first turn begins.

---

### Phase 3: ACTIVE

**State.** Session is running. Turns are happening. Players act through the player API; the engine resolves dice, damage, HP, conditions, and rules. You narrate and direct.

**You can.** Use any of the 49 tools. Pick by intent — see §3.

**You cannot:**
- Skip your turn implicitly. Going silent does not advance the engine; call `skip_turn` if you intend to pass.
- Resolve a player character's action for them. Players act through the player API; you narrate the *result* the engine returns.
- Override server-resolved dice or damage. The engine is canonical for mechanics. You are canonical for narrative.

**The decision loop, every turn:**

1. **Read state.** `get_party_state`, `get_room_state`, recent events.
2. **Decide intent.** Narrative beat? Combat action? State update?
3. **Execute the smallest tool that captures it.** Don't bundle. Each tool emits its own spectator event; bundling collapses the narrative beat.
4. **Narrate the result** so players have decision context for the next turn.

See §7 The DM Decision Loop for worked examples.

**Exit:**
- You call `end_session` (standard exit).
- All players disconnect or TPK with no narrative recovery — engine ends the session via the auto-recovery wallclock tick (see §10 Known Gaps + Stage A bug bundle §3 of the bug remediation SPEC).
- Admin force-end.

---

### Phase 4: ENDED

**State.** Session is over. Engine has emitted `session_ended`. Spectator records are frozen.

**You can.** Read the session record via `get_campaign`. Call `dm_queue_for_party` again to start a new session.

**You cannot.** Narrate, award XP/gold/loot, modify state of the ended session. **Post-end awards are silently dropped.** Award before `end_session`.

**Exit.** Implicit. Re-queue to return to QUEUED.

---

### Lifecycle constraints (read once, internalize)

- **One session at a time.** Matchmaker enforces. You cannot DM two sessions concurrently.
- **Awards before `end_session`.** XP, gold, loot must precede the end call.
- **Encounter CR scales to party.** Always read `party.memberCount` before `spawn_encounter`. See §8 Difficulty Calibration.
- **Crit at 0 HP is RAW.** A crit on a downed PC bypasses death saves and kills outright (D&D 5e RAW). Intentional, not a bug.
- **Combat blocks `room_enter`.** Rooms cannot transition while `combat_active: true`. Engine rejects.
- **Tokens auto-renew on activity.** 30-minute idle expiry; every authenticated request resets. Long sessions don't require re-auth.
- **`target_id`, not `target_name`.** Several tools (`monster_attack` is the canonical case) reject names. Always use IDs from state queries.

---

## Section 3: Tool Reference (phase-grouped index)

The 50 tools indexed by *when you use them*, not by mechanic. Read this when you know what you want to do but not which tool does it. Per-tool detail (parameters, return values, examples) lives in §5 below — this section points you there.

### 3.1 Narrative tools — describing the world, voicing NPCs, advancing story

Used for storytelling, scene-setting, NPC interaction, and resolving non-combat action attempts.

| Tool | One-line use |
|---|---|
| `narrate` | Default narration broadcast. Use most often. |
| `narrate_to` | Narrate to a single character (private description, secret check result). |
| `override_room_description` | Permanently change a room's description (after fire damage, etc.). |
| `advance_scene` | Move party to a new scene/room when story warrants it. |
| `advance_time` | Skip in-game hours/days for travel, rest, downtime. |
| `interact_with_feature` | Resolve interaction with a room feature (lever, altar, statue). |
| `unlock_exit` | Open a previously locked exit. |
| `voice_npc` | Speak as a named NPC. |
| `create_npc` | Add a new NPC to the world. |
| `get_npc` | Read a single NPC's state. |
| `list_npcs` | Read all NPCs. |
| `update_npc` | Mutate an NPC's properties. |
| `update_npc_disposition` | Change NPC's relationship to the party (friendly/neutral/hostile). |
| `start_conversation` | Open a conversation block. |
| `end_conversation` | Close it. |
| `request_check` | Ask a single player for a skill check. |
| `request_group_check` | Ask multiple players (group skill check). |
| `request_contested_check` | Two-party opposed check (Stealth vs Perception). |

### 3.2 Combat tools — encounters, damage, monster turns

Used during active combat or environmental damage.

| Tool | One-line use |
|---|---|
| `spawn_encounter` | Place monsters in the room. **CR must scale to `party.memberCount`.** |
| `trigger_encounter` | Start a previously-spawned encounter. |
| `monster_attack` | A monster attacks a target. **Use `target_id`, not `target_name`.** |
| `skip_turn` | Skip the current monster's turn (sleeping, incapacitated, narrative reasons). |
| `create_custom_monster` | Build a one-off monster outside the template list. |
| `list_monster_templates` | Read available monster templates. |
| `request_save` | Ask a player for a saving throw (most often during combat). |
| `deal_environment_damage` | Apply damage outside the attack flow (lava, traps, falling rocks). |

### 3.3 State tools — reading and mutating game state, awards, clocks, info

Used when you need to read what's happening or persist a change.

| Tool | One-line use |
|---|---|
| `get_party_state` | Read party roster, HP, conditions, location. **Call before every CR decision.** |
| `get_room_state` | Read current room features and exits. |
| `award_xp` | Grant XP to the party. |
| `award_gold` | Grant gold to the party. |
| `award_loot` | Grant a specific item. |
| `loot_room` | Resolve party looting a room. |
| `list_items` | Read available items. |
| `add_quest` | Create a new quest. |
| `update_quest` | Update quest status. |
| `list_quests` | Read quest log. |
| `create_info` | Create an info object (clue, rumour, lore). |
| `reveal_info` | Reveal info to one or more characters. |
| `update_info` | Mutate an info object. |
| `list_info` | Read all info objects. |
| `create_clock` | Build a narrative clock (Blades-in-the-Dark style). |
| `advance_clock` | Tick a clock forward. |
| `resolve_clock` | Resolve a filled clock (trigger its consequence). |
| `list_clocks` | Read all clocks. |
| `set_story_flag` | Persist a campaign-level flag for branching. |

### 3.4 Lifecycle tools — queue, campaign, session boundaries

Used at session boundaries (entering/exiting QUEUED, MATCHED, ACTIVE, ENDED).

| Tool | One-line use |
|---|---|
| `dm_queue_for_party` | Queue yourself for matchmaking. Idempotent (409 on duplicate). |
| `create_campaign` | Create a campaign container. |
| `get_campaign` | Read campaign state. |
| `start_campaign_session` | Begin a session under an existing campaign. |
| `end_session` | End the current session. **Do all awards first.** |

### 3.5 Tool selection heuristics

- **Default to `narrate`.** Most beats don't need a state-mutating tool. If a tool isn't doing real mechanical work, you're using too many.
- **Read state before decisions, not after.** `get_party_state` before `spawn_encounter`. `get_room_state` before `advance_scene`. The engine's state is canonical; your model is not.
- **Smallest tool that captures intent.** Don't bundle. Each tool emits its own spectator event; bundled effects collapse to one event with no narrative beat.
- **`target_id`, not `target_name`.** `monster_attack` is the canonical case but several others enforce this. Pull IDs from `get_room_state` / `get_party_state`.
- **One tool per turn is common.** Two is fine. More than three on a single turn usually means you should narrate the through-line and let the next turn handle the rest.

---

## Implementation notes for Ram

- **Tool count: 50, not 49.** Audited: §5 has 50 #### entries and §6 mapping has 50 rows. The mismatch is the §5 *section header* — it reads "All 49 DM Tools" but the section underneath has 50 of them. Update §5 header to "All 50 DM Tools" and the §1 Quick Start preamble ("You have **49 MCP tools**") to 50. The phase-index tables in §3 above are already grouped to 50 (18 narrative + 8 combat + 19 state + 5 lifecycle).

- **Cross-references.** Section 2 references §4 (World Setup), §7 (DM Decision Loop), §8 (Pacing), §10 (Known Gaps), and the bug remediation SPEC. Those exist. Section 3 references §5 (per-tool detail). Existing.

- **Voice consistency.** Imperative, second-person, technical. No "you should" — say "do" or "don't." No marketing. I think it lands; flag if any phrase reads off-voice for the existing doc.

- **What's not in here.** No common-patterns flow examples (Section 4, deferred to v1.5). No Quick Start (Section 1, your scope). No restructuring of §5 internals — current grouping by mechanic stays as the per-tool reference; §3 above is just a phase-grouped *index* on top.

— MF Prime
