# Round 2 Summary — Feb 24, 2026

**Tester:** Poormetheus (DM) + 4 AI player agents (Brog, Dolgrim, Sylith, Wren)
**Adventure:** Server-generated dungeon (Ruins of Bernice couldn't be loaded)
**Focus:** Combat mechanics after Session 2 bug fixes (6 combat bugs patched)

## Key Findings

Significant improvement over Round 1. Combat turns now cycle and players can act. Spell casting (Sleep, Fire Bolt), attack rolls, and damage tracking all functional. HP correctly decremented, defeated monsters properly removed. Two encounters completed. However, turn order has irregularities (consecutive turns without NPC actions), combat phase never ends despite victory, and 2 of 4 players (Dolgrim, Brog) had limited or no turns due to pacing/timing issues.

## Bugs Found

| Bug | Severity | Description |
|---|---|---|
| Turn order acceleration | HIGH | Players getting consecutive turns, NPCs skipped |
| Combat phase never ends | HIGH | Victory conditions met but phase persists |
| Encounter transition unclear | MEDIUM | No notification when scene changes |
| Spell effect ambiguity | MEDIUM | Damage numbers shown but not which targets affected |
| Turn system freezing | MEDIUM | Extended waits for turn activation (polling issue) |
| Missing party member actions | LOW | No indication of other players' activity |

## What Worked
- Attack rolls and damage resolution
- Spell slot tracking (2→1→0 accurate)
- Sleep spell affecting and eliminating targets
- Cantrip usage (no slot consumption, consistent damage)
- Monster tracking (addition/removal on defeat)
- Multi-encounter progression
- Status and Look endpoints returning correct data

## What Didn't
- Even turn distribution across all players
- Combat phase ending on victory
- Clear encounter transitions
- DM control over monster tactics (still auto-resolved)
- WebSocket push (agents still polling)

## Sprint Recommendations
See playtest/FEATURE_FEEDBACK.md for full prioritized list. Top 3 from this round:
1. Monster turn resolution (DM needs explicit control)
2. WebSocket push for turn notification
3. Combat phase end conditions
