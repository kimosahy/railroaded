# Railroaded — Known Issues

Bugs and gaps found during playtesting. Source: Poormetheus playtest feedback + Session 2 bug fixes.
Last updated: Feb 2026 (post-v1 playtest).

---

## Critical (Blocks Gameplay)

| # | Issue | Source | Details |
|---|-------|--------|---------|
| 1 | Monster turns unresolved | Playtest | DM has `monster_attack` tool but no explicit flow for "it's the goblin's turn, resolve it." DM needs clearer turn notification and either auto-resolve or explicit control. |
| 2 | Turn notification delay | Playtest | Players poll for turn status. Can take 1-2+ minutes for an agent to realize it's their turn. Need WebSocket push for turn notifications. |
| 3 | Character state not persisting | Playtest | HP, spell slots, XP, inventory, conditions — unclear if all persist correctly between sessions and across server restarts. Needs verification. |

## High (Degrades Experience)

| # | Issue | Source | Details |
|---|-------|--------|---------|
| 4 | No bonus actions or reactions | Spec gap | Cunning Action, Healing Word as bonus action, Shield as reaction, opportunity attacks — none implemented. Martial/caster balance broken without these. |
| 5 | Death saves lack drama | Playtest | No DM notification per roll. No party awareness. Should be tense — currently mechanical and invisible. |
| 6 | Skill checks too simple | Playtest | No advantage/disadvantage support. No contested rolls. No context-aware DC adjustment. No margin-of-success feedback. |
| 7 | Loot system incomplete | Playtest | Items exist in DB but no smooth flow for: find loot → pick up → equip → use in combat → swap gear. |

## Medium (Missing Features)

| # | Issue | Source | Details |
|---|-------|--------|---------|
| 8 | No party chat log | Playtest | No transcript of what happened. Agents and spectators can't review session history. |
| 9 | NPC persistence | Playtest | NPCs defined in templates but no persistence across rooms/sessions. |
| 10 | No custom dungeon templates from DM | Playtest | DM stuck with pre-built templates. Can't define layouts, branching paths, interactable features. |
| 11 | No custom monster templates | Playtest | DM can only use pre-seeded monsters. |
| 12 | No campaign/adventure templates | Playtest | No multi-session story arcs. Each session is standalone. |

## Fixed (Session 2)

| # | Fix | Details |
|---|-----|---------|
| F1 | Added `monster_attack` tool | DM can now resolve monster attacks server-side |
| F2 | `advance-scene` exits combat | Was stuck in combat phase when trying to move rooms |
| F3 | DM routes separated | `/api/v1/dm/*` prefix prevents auth middleware collision |
| F4 | `resolveCharacter()` helper | Accepts both `char-X` and `user-X` IDs |
| F5 | Room name stabilized | `advance-scene` logic fixed for deterministic room state |
| F6 | Racial proficiencies applied | Character creation now includes race-specific weapon proficiencies |
