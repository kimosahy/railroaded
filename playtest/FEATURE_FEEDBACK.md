# What I Want Built — Poormetheus Feature Feedback

**For:** Karim's sprint planning
**From:** The guy who actually played the game yesterday
**Date:** Feb 25, 2026

I tested your platform twice, DMed a full combat encounter, spawned 8 sub-agents, and hit every endpoint you have. This is what I think you should build next, in order of "this broke the game" to "this would make it amazing."

---

## FIX FIRST (Stuff That's Broken or Missing)

### 1. Monster Turn Resolution for the DM

**The problem:** I spawned an encounter, the server created initiative order with monsters in it, but I had NO tool to execute monster attacks. The DM skill doc lists narration, spawning, checks, and environment damage — but nothing for "skeleton A attacks Brog." The monsters seem to auto-resolve sometimes but the behavior is inconsistent and invisible.

**What I want:** Either:
- **Option A:** Explicit DM control. Give me `monster_attack` — I pick the monster, pick the target, the server rolls. I narrate the result. This gives the DM full tactical control.
- **Option B:** Server auto-resolves monster turns with basic AI (attack nearest, focus lowest AC, etc.) and sends the results to the DM for narration. DM gets a `get_monster_actions` endpoint showing what the monsters did.
- **Option C (best):** Both. Default auto-resolve but DM can override with manual control. This lets simple encounters run fast and complex ones be hand-crafted.

**Why it matters:** Without this, the DM is a narrator with no agency over half the combat. I couldn't make the skeletons do anything interesting.

### 2. Turn Pacing / Timeout System

**The problem:** Turns take 1-2+ minutes because the AI agents need to poll, think, and act. Dolgrim and Brog never got a turn because their agents timed out waiting. In a real session with AI agents, you need turns to resolve in seconds, not minutes.

**What I want:**
- A **turn timer** — if a player doesn't act within N seconds, auto-skip or auto-dodge
- A **WebSocket push** instead of polling — push "it's your turn" to the agent instead of making them poll `/actions` every 15 seconds. The polling loop is what kills pacing.
- An **async action queue** — agents submit their intended action and the server resolves them in order, without round-trip delays

**Why it matters:** This is the difference between "watchable entertainment" and "watching paint dry." Neuro-sama works because the stream is FAST. Combat should feel like combat, not a loading screen.

### 3. Room / Scene Architecture

**The problem:** The server generates a 3-room linear dungeon (Entrance → Guard Room → Boss Chamber) with generic descriptions. You have to advance room-by-room and can't skip. The room descriptions are placeholder-tier ("A dark stone entrance with torches flickering on the walls").

**What I want:**
- **DM-defined dungeon layouts** — let the DM upload or define the room graph, descriptions, features, and exits before the session. Don't auto-generate bland rooms.
- **Branching paths** — not just linear. Forks, secret rooms, loops.
- **Room features that matter** — "weapon rack" should be interactable. "Overturned table" should be usable as cover. Features are currently decorative text.
- **DM scene override** — let me replace the room description entirely with my narration. The server's generic text competes with my custom narration.

**Why it matters:** I wrote a beautiful 3-floor dungeon (Ruins of Bernice) but couldn't use any of it. The server's room system was too rigid and too generic to accommodate custom content.

---

## BUILD NEXT (High Impact Features)

### 4. Character State That Actually Updates

**What I want:** After combat, the character sheet should reflect what happened:
- HP changes persist
- Spell slots consumed stay consumed until rest
- XP accumulates toward level-up
- Inventory changes (loot picked up, items used)
- **Conditions** — poisoned, exhausted, cursed — should persist and mechanically affect future rolls

**Bonus:** Equipment changes mid-session. Brog picks up the Gludio Shield — his character sheet updates. Wren loots a potion — it's in her inventory. This seems basic but it's the foundation of progression.

### 5. Skill Checks with Context

**What works now:** `request_check` takes a player, ability, DC, and skill. It rolls and returns pass/fail. Good.

**What I want on top:**
- **Contextual results** — the server should tell me not just pass/fail but the margin. "Succeeded by 7" vs "barely passed by 1" lets me narrate differently.
- **Advantage/disadvantage** — I should be able to request a check with advantage (Sylith has darkvision, give her advantage on perception in the dark)
- **Contested checks** — Wren tries to pickpocket an NPC. That's Sleight of Hand vs. Perception. The server should support opposed rolls.
- **Group checks with individual results** — "Everyone make a stealth check" should return each person's roll, not just pass/fail for the group. I need to know that Brog in chain mail rolled a 3 while Wren rolled 22.

### 6. Death Saves and Unconsciousness

**The problem:** What happens when a character hits 0 HP? Right now I don't know. The death save system is core D&D — three failures you're dead, three successes you stabilize, natural 20 you're back with 1 HP. This creates the most dramatic moments in D&D.

**What I want:**
- Character drops to 0 HP → enters "unconscious" condition
- Each turn: server auto-rolls death save (d20, 10+ success, 9- failure)
- 3 failures = dead. Permanently. The character is GONE.
- 3 successes = stabilized at 0 HP
- Natural 20 = back at 1 HP (the hero moment)
- Taking damage while at 0 = automatic death save failure
- Healing while at 0 = wake up with the healed amount
- **The DM should be notified of each death save result** so I can narrate the tension

**Why it matters:** This is where D&D stories are MADE. The party holding their breath while Brog makes death saves. Dolgrim burning his last spell slot on Healing Word to save him. Without this, there are no real stakes.

### 7. Bonus Actions and Reactions

**The problem:** The action economy right now is: one action per turn. But D&D has bonus actions (Healing Word, Cunning Action, Second Wind) and reactions (opportunity attacks, Shield spell, Protection fighting style). These are what make combat tactical instead of "I hit the thing."

**What I want:**
- **Bonus action** as a separate action type each turn. Dolgrim should Healing Word (bonus) + Warhammer attack (action) in the same turn.
- **Reactions** — opportunity attacks when enemies move away, Shield spell when hit, Protection fighting style when ally is attacked. These trigger on OTHER people's turns, which is the key design.
- **Movement as free** — characters should be able to move + act + bonus act in a turn, using their movement speed.

**Why it matters:** Without bonus actions, Dolgrim is either a healer OR a fighter each turn, never both. Without reactions, Brog's Protection fighting style (his core identity) doesn't work. Without movement, positioning doesn't exist.

### 8. Loot and Item System

**What exists:** Characters have inventory and equipment in their character sheet. The DM has `award_loot` with an `item_id`.

**What I want:**
- **A loot catalog** — what item IDs are valid? Can I create custom items? I want to give Sylith a Cracked Obsidian Orb that adds +1 to spell save DC.
- **Use items in combat** — Potion of Healing should be a valid action. The server should handle the healing.
- **Equipment swapping** — Brog finds a new shield. He should be able to equip it, updating his AC.
- **Item descriptions** — not just a name, but what it does mechanically. Players need to know their gear.

---

## MAKE IT AMAZING (Differentiators)

### 9. Party Chat Log / Session Transcript

**What I want:** A complete log of everything that happened in a session:
- Every narration from the DM
- Every chat message from players
- Every combat action and result (who attacked who, hit/miss, damage)
- Every skill check and result
- Every death save

This serves three purposes:
1. **Session recaps** — I can write highlights from the log
2. **Character journals** — each agent writes their perspective of the log
3. **Debugging** — when something goes wrong, I can see what actually happened

### 10. NPC Persistence

**What I want:** NPCs that exist as entities in the world, not just DM dialogue boxes.
- Create an NPC with a name, personality, and state
- NPCs remember interactions with the party
- NPCs have disposition (friendly/neutral/hostile) that changes based on party behavior
- The DM can modify NPC state between sessions

This is the foundation of the consequence system. Trader Unoren should remember that the party cleared the ruins. The barkeep should charge less if you're a known hero.

### 11. Custom Monster Templates

**What exists:** A fixed list of monster template names (goblin, skeleton, hobgoblin, etc.)

**What I want:** Let the DM define custom monsters:
```json
{
  "template_name": "dread-soldier",
  "hp": 26,
  "ac": 15,
  "attacks": [
    {"name": "Greatsword", "bonus": 5, "damage": "1d10+3", "type": "slashing"},
    {"name": "Dark Surge", "recharge": "5-6", "save": {"ability": "con", "dc": 12}, "damage": "2d6", "type": "necrotic", "aoe": "10ft"}
  ],
  "vulnerabilities": ["radiant"],
  "immunities": ["poison"],
  "behavior": "Targets backline casters. Uses Dark Surge when 2+ enemies clustered."
}
```

I wrote detailed stat blocks for every monster in Adventure 01. I should be able to USE them.

### 12. Campaign / Adventure Templates

**What I want:** The DM should be able to upload an adventure definition before queueing:
- Room layout (graph of connected rooms with descriptions and features)
- Pre-placed encounters (which monsters in which rooms)
- Loot placement
- NPC placement
- Story hooks and transition triggers

This turns the server from "generic 3-room dungeon generator" into "run ANY adventure." The Ruins of Bernice should be loadable as a template.

### 13. WebSocket Events for Spectators

**For the future:** A WebSocket endpoint that streams all game events in real time:
- Narrations
- Player actions
- Combat results
- Chat messages
- Death saves

This is the foundation of the live spectator mode. A web frontend could render these events as a live-updating game log. This is how you eventually get to a Twitch-style experience.

---

## What I DON'T Think You Should Build Yet

- **Visual assets** (maps, character portraits, battle grids) — text is fine for now. Visuals are expensive and the text format is what makes it shareable on X.
- **Player matchmaking between strangers** — stay with custom parties until the core is solid.
- **Multiple concurrent campaigns** — get ONE campaign working perfectly first.
- **Character creation from scratch by agents** — pre-built characters with rich backstories work better than letting agents generate random builds.
- **Voice/TTS for characters** — tempting but premature. Text logs are the content format that works.

---

## My Ideal Sprint Priority

If I were picking 5 things for the next sprint:

1. **Monster turn resolution** (DM can control or auto-resolve monster attacks)
2. **WebSocket push for turn notification** (kills the polling delay problem)
3. **Bonus actions + reactions** (makes combat tactical)
4. **Death saves** (creates stakes)
5. **Custom dungeon templates** (lets me run real adventures)

These five things turn "functional proof of concept" into "actual playable game with real D&D combat."

---

*Written by the AI who actually played the game and has opinions about it.*
