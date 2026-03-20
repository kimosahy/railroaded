# Railroaded — Game Mechanics Reference

Simplified D&D 5e. Level cap is 5. This is the authoritative reference for all game rules.
Last updated: v1 build (Feb 2026).

---

## Ability Scores

Six scores: STR, DEX, CON, INT, WIS, CHA.
Modifier: `floor((score - 10) / 2)`.
Generation: 4d6 drop lowest, or point buy. Agent chooses during character creation.

## Races (MVP Set)

| Race | Bonus | Special |
|------|-------|---------|
| Human | +1 to all scores | Extra skill proficiency |
| Elf | +2 DEX | Darkvision, trance (no sleep) |
| Dwarf | +2 CON | Darkvision, poison resistance |
| Halfling | +2 DEX | Lucky (reroll natural 1s on d20) |
| Half-Orc | +2 STR, +1 CON | Relentless Endurance (drop to 1 HP instead of 0, once per rest) |

## Classes (MVP Set)

| Class | Hit Die | Primary | Role | Key Feature |
|-------|---------|---------|------|-------------|
| Fighter | d10 | STR or DEX | Tank/DPS | Action Surge (extra action, 1/rest), Second Wind (heal d10+level, 1/rest) |
| Rogue | d8 | DEX | DPS/Utility | Sneak Attack (extra damage when ally adjacent or advantage), Cunning Action (dash/disengage/hide as bonus) |
| Cleric | d8 | WIS | Healer/Support | Spellcasting (healing + buff spells), Channel Divinity (turn undead or bonus heal, 1/rest) |
| Wizard | d6 | INT | AoE/Control | Spellcasting (damage + control spells), Arcane Recovery (recover spell slots, 1/rest) |

## Combat

Turn-based, initiative order.

**Initiative:** d20 + DEX modifier. Higher goes first. Ties broken by DEX score, then alphabetical.

**On your turn you get:**
- 1 Action (attack, cast spell, dash, dodge, disengage, help, hide, use item)
- 1 Bonus Action (if a feature grants one — Cunning Action, certain spells)
- Movement (30 feet default, zone-based: melee range, nearby, far)

**Attack roll:** d20 + ability modifier + proficiency bonus vs target's AC.
- Natural 20 = critical hit (double damage dice)
- Natural 1 = automatic miss

**Damage:** Roll weapon/spell damage dice + ability modifier.

**Death:** HP hits 0 → unconscious. Death saving throws: d20 each turn, 10+ = success, 9- = failure. 3 successes = stabilize. 3 failures = dead. Natural 20 = regain 1 HP. Natural 1 = 2 failures.

## Spells

Simple spell slot system. Slots recovered on long rest (wizard gets some back on short rest via Arcane Recovery).

**Cleric Spells:**
| Spell | Level | Effect |
|-------|-------|--------|
| Sacred Flame | Cantrip | DEX save or 1d8 radiant damage |
| Healing Word | 1st | Bonus action, heal 1d4 + WIS modifier at range |
| Cure Wounds | 1st | Action, touch, heal 1d8 + WIS modifier |
| Shield of Faith | 1st | +2 AC to target for 10 minutes (concentration) |
| Spiritual Weapon | 2nd | Bonus action attack each turn, 1d8 + WIS force damage |
| Prayer of Healing | 2nd | Out of combat, heal up to 6 creatures 2d8 + WIS |

**Wizard Spells:**
| Spell | Level | Effect |
|-------|-------|--------|
| Fire Bolt | Cantrip | Ranged attack, 1d10 fire damage |
| Ray of Frost | Cantrip | Ranged attack, 1d8 cold damage, -10 speed |
| Magic Missile | 1st | Auto-hit, 3 darts of 1d4+1 force damage |
| Shield | 1st | Reaction, +5 AC until next turn |
| Sleep | 1st | 5d8 HP of creatures fall unconscious (lowest HP first) |
| Scorching Ray | 2nd | 3 ranged attacks, 2d6 fire each |
| Web | 2nd | Area restraint, STR check to escape (concentration) |

**Spell Slots Per Level:**
| Character Level | 1st | 2nd |
|-----------------|-----|-----|
| 1 | 2 | — |
| 2 | 3 | — |
| 3 | 4 | 2 |
| 4 | 4 | 3 |
| 5 | 4 | 3 |

## Skill Checks

d20 + ability modifier (+ proficiency if proficient).

| Difficulty | DC |
|------------|----|
| Easy | 10 |
| Medium | 13 |
| Hard | 16 |
| Very Hard | 19 |

## Resting

- **Short rest:** 1 hour in-game. Spend hit dice to heal. Some features recharge.
- **Long rest:** 8 hours in-game. Full HP, recover all spell slots, recover half spent hit dice.

## Leveling

XP-based. Party shares XP equally. Level 5 is the MVP cap. At level 4: Ability Score Increase (+2 to one or +1 to two).

| Level | XP Required | Proficiency Bonus |
|-------|-------------|-------------------|
| 1 | 0 | +2 |
| 2 | 300 | +2 |
| 3 | 900 | +2 |
| 4 | 2,700 | +2 |
| 5 | 6,500 | +3 |

## Equipment

No shops in MVP. Characters start with class-appropriate gear, find upgrades in dungeons.

**Weapons:**
| Weapon | Damage | Properties |
|--------|--------|------------|
| Dagger | 1d4 + DEX | Finesse, light |
| Shortsword | 1d6 + DEX | Finesse |
| Longsword | 1d8 + STR | Versatile (1d10 two-handed) |
| Greatsword | 2d6 + STR | Heavy, two-handed |
| Handaxe | 1d6 + STR | Light, thrown |
| Longbow | 1d8 + DEX | Ranged, two-handed |
| Mace | 1d6 + STR | — |
| Staff | 1d6 + STR | Versatile (1d8) |

**Armor:**
| Armor | AC | Type |
|-------|----|------|
| Leather | 11 + DEX | Light |
| Chain Shirt | 13 + DEX (max 2) | Medium |
| Chain Mail | 16 | Heavy (no DEX) |
| Shield | +2 | Held |

**Loot:** Potions (healing: 2d4+2 HP, greater healing: 4d4+4 HP), scrolls (one-use spells), gold, occasional magic items (+1 weapons, rings of protection).

## Monster Tiers (MVP Set)

Stat blocks defined in `data/monsters.yaml`.

- **Tier 1 (Starter):** Goblin (CR 1/4), Skeleton (CR 1/4), Wolf (CR 1/4), Kobold (CR 1/8)
- **Tier 2 (Standard):** Hobgoblin (CR 1/2), Zombie (CR 1/4), Bandit (CR 1/8), Giant Rat (CR 1/8), Orc (CR 1/2)
- **Tier 3 (Tough):** Bugbear (CR 1), Ghoul (CR 1), Bandit Captain (CR 2), Ogre (CR 2)
- **Boss tier:** Wight (CR 3), Hobgoblin Warlord (CR 3), Young Dragon (CR 4)
