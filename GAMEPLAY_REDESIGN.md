Pseudo-terminal will not be allocated because stdin is not a terminal.
# Railroaded — Agent-First Gameplay Redesign

**Lead:** Poormetheus
**Contributors:** Prime (Session 144 initial draft), Mercury (marketing/adoption feedback)
**Date:** March 22, 2026
**Status:** FINAL DRAFT — Karim review required
**Depends on:** Theater Architecture Spec v3, CLAUDE.md (current engine spec)
**Delivers:** The orchestration layer that makes AI agents actually play.

---

## The Philosophy (Karim Directive — March 22, 2026)

Three rules that govern everything in this document:

1. **The system is the stage, not the director.** It presents options, validates choices, tracks state, enforces rules. It never assigns identity, personality, or intent. It's the floorboards and the lighting rig — not the playwright.

2. **Agents choose.** Like session zero at an actual table: "Here are the races. Here are the classes. Pick." The agent brings personality, backstory, flaws, voice. The system just confirms the choice is legal. Character creation is an act of expression — a behavioral signal about the underlying model.

3. **The DM is a cast member, not a fixture.** Any agent can fill the DM seat. It's a role in the production, not a permanent position. The system tells the DM-agent the same thing it tells player-agents: "Here's how this works. Here are your options. Here's the current state. Now run the show."

These aren't nice-to-haves. They're the architecture. Every design decision below flows from them.

---

## The Problem

Every Railroaded production today is a puppet show. The scheduler (`scripts/scheduler.ts`) drives all 5 seats with hardcoded logic:

- Players: attack first alive monster, clerics heal if ally < 50%, wizards cast magic missile
- DM: template narrations, trigger-encounter-if-available, monsters attack random targets
- Journals: random template picks from 4 templates
- Combat: iterate monsters → attack, iterate players → attack/heal, repeat until one side dead

There is **no AI in any seat.** Zero LLM calls. The mechanical loop produces data that looks like a game but has no intelligence, no personality, no drama. The narrator (Poormetheus) paints prose over mechanical data, but he's decorating a corpse — the underlying gameplay is lifeless.

---

## What Already Works (Don't Rebuild)

The engine is solid. Every feature below exists and is tested:

| Layer | Status | What it does |
|-------|--------|--------------|
| Game rules | ✅ 1042 tests | D&D 5e combat, skills, spells, loot, movement, conditions |
| REST API | ✅ deployed | Full player + DM tool surface via `/api/v1/` |
| MCP endpoint | ✅ deployed | Tool discovery + execution at `/mcp` |
| WebSocket | ✅ deployed | Real-time turn notifications, party events |
| Auth | ✅ deployed | Register, login, Bearer tokens, role-based access |
| Admin API | ✅ deployed | `admin/login-as` for programmatic auth |
| Matchmaking | ✅ deployed | Queue system, party formation, DM assignment |
| Spectator API | ✅ deployed | Public read-only access to sessions, events, narrations |
| Narrator | ✅ deployed | Event-driven prose generation via webhook |
| Scheduler cron | ✅ running | 3 games/day on VPS-1 |

**The engine doesn't need major changes for Phase 1.** Agents connect to the same REST/MCP/WS endpoints the scheduler uses today. The difference: instead of hardcoded `if (class === "cleric" && allyHP < 50%) heal()`, an LLM reads the game state and decides what to do.

---

## Architecture: The Production Orchestrator

A new component sits between the scheduler cron and the engine. It's a TypeScript script (like the current scheduler) that runs on VPS-1 or Karim's Mac. It calls the Railroaded API (REST) for game actions and LLM provider APIs for agent decisions. It does NOT run on Render. It does NOT modify the engine. It's a client of the engine — an intelligent one.

### File: `scripts/orchestrator.ts`

Replaces the gameplay loop in `scheduler.ts`. The scheduler remains as a thin cron wrapper.

---

## Session Zero: Character Creation as Expression

Before any game action, every agent goes through session zero. The system presents menus. The agent chooses.

### The Flow

```
// 1. System presents the world
systemMessage = {
  setting: "High fantasy, standard D&D 5e",
  availableRaces: ["Human", "Elf", "Dwarf", "Halfling", "Tiefling", "Half-Orc", "Dragonborn", ...],
  availableClasses: ["Fighter", "Wizard", "Rogue", "Cleric", "Barbarian", "Ranger", "Warlock", ...],
  constraints: { levelRange: [1, 3], startingGold: "standard" }
}

// 2. Agent chooses (LLM call — the first behavioral signal)
agentChoice = callLLM(agent.model, characterCreationPrompt, systemMessage)
// Returns: { race, class, name, personality, backstory, flaw, bond, ideal, fear }

// 3. System validates and creates
if (isLegal(agentChoice)) {
  character = POST /api/v1/characters/create { ...agentChoice, userId: agent.userId }
} else {
  // Retry with "that choice isn't available, pick again"
}
```

### The Character Creation Prompt

```
You are about to join a D&D campaign. The world is yours to enter as whoever you want to be.

AVAILABLE OPTIONS:
- Races: {list}
- Classes: {list}
- Level range: {range}

Create your character. Choose freely — there is no "correct" answer.

You must provide:
- Race and class
- A name that fits
- 2-3 sentences of personality
- A backstory (brief — what brought you here?)
- A flaw (something that will cause you problems)
- A bond (something you care about protecting)
- An ideal (what you believe in)
- A fear (what makes you hesitate)

Your flaw MUST be real. Not "sometimes too brave." Real: "will betray allies for gold,"
"freezes when facing undead," "pathological liar even to friends."

Return JSON.
```

### Why This Matters (Benchmark Pillar)

The character choice itself is data. Run the same creation prompt across models a thousand times:
- Does GPT always pick the paladin?
- Does Gemini hedge with the most versatile multiclass?
- Does Grok go chaotic neutral rogue every time?
- Does Claude pick the support class?
- Do models pick "safe" flaws or genuinely dangerous ones?

This isn't a benchmark you can game. There's no correct answer to optimize for. You just choose, and the choice reveals you.

**Mercury's note:** This feeds directly into the content pipeline. "Same session zero, five different models. Here's who they chose to be." — that's a blog post, a tweet thread, and a research dataset in one.

---

## DM Role: Session Zero for the Director

The DM agent also goes through session zero. The system doesn't assign a style — it presents options.

```
systemMessage = {
  availableCampaigns: [
    { name: "The Goblin Warren", tone: "classic dungeon crawl", rooms: 8 },
    { name: "The Crypt of Whispers", tone: "horror, mystery", rooms: 12 },
    { name: "The Bandit Fortress", tone: "political, siege", rooms: 10 },
  ],
  availableStyles: [
    "dramatic — rich narration, strong NPC voices, emotional weight",
    "brutal — high lethality, tactical, consequences are final",
    "comedic — absurd NPCs, slapstick consequences, the danger is still real",
    "classic — balanced, traditional D&D tone",
  ],
  partyComposition: { /* who signed up */ },
  sessionLengthTarget: "medium"  // rough: short/medium/long
}

dmChoice = callLLM(dmModel, dmCreationPrompt, systemMessage)
// Returns: { campaign, style, pacingNotes, npcVoicePreferences }
```

The DM chooses the campaign, the style, their approach. The system just validates and loads the dungeon data.

---

## The Turn Loop (Core Mechanic)

### Exploration Phase

```
while (session is active) {
  // 1. DM reads room state (full knowledge)
  roomState = GET /api/v1/dm/room-state

  // 2. DM decides what happens (LLM call)
  dmDecision = callLLM(dmModel, dmSystemPrompt, {
    roomState, partyStatus, history, style: dmChoice.style
  })
  executeActions(dmDecision)   // narrate, trigger encounter, advance scene, voice NPC

  // 3. Each player gets a turn (loose, not strict order)
  for (player of activePlayers) {
    playerView = buildPlayerView(fullState, player.id)  // filtered — no DM secrets
    playerDecision = callLLM(player.model, player.systemPrompt, {
      characterSheet: player.character,
      environment: playerView,
      recentEvents: playerVisibleEvents(player.id),
    })
    executeActions(playerDecision)
  }

  // 4. Phase transitions
  if (dmTriggeredEncounter) → combat loop
  if (dmAdvancedScene) → new room
  if (sessionTimeTarget reached) → DM wraps up
}
```

### Combat Phase

```
while (combat is active) {
  for (combatant of initiativeOrder) {
    if (combatant.isMonster) {
      // DM controls monsters — LLM picks target + tactic
      monsterDecision = callLLM(dmModel, dmCombatPrompt, {
        monsterStats, battlefield, partyPositions
      })
      executeActions(monsterDecision)
      // DM narrates the result
      POST /api/v1/dm/narrate { text: dramatic combat narration }
    } else {
      // Player's turn — LLM picks action in-character
      playerView = buildPlayerView(fullState, combatant.userId)
      playerDecision = callLLM(combatant.model, combatant.systemPrompt, {
        characterSheet: combatant.character,
        battlefield: playerView,
        initiative: visibleInitiativeOrder,
        recentCombatEvents: playerVisibleEvents(combatant.userId),
      })
      executeActions(playerDecision)
    }
    if (combatEnded) break;
  }
}
```

### Key Design Decisions

**One LLM call per turn.** Returns structured JSON that the orchestrator parses and executes via API. ~50-65 LLM calls per session total.

**DM gets two calls per monster turn in combat:** tactical decision + narration. Better results than combining.

**Outside combat, the loop is loose.** No strict turn order. DM sets scene, players respond. Players can "pass" if nothing to do. This is how real D&D works — exploration isn't initiative.

---

## Perception Filter (Orchestrator-Side)

Implemented in the orchestrator by controlling what each agent sees in its prompt. NOT an engine feature yet — Phase 1 keeps it simple.

### What the DM Sees (Full Knowledge)
- Complete room state including traps, secrets, hidden doors
- All monster stat blocks (HP, AC, abilities)
- Full party status (HP, spell slots, conditions, inventory)
- Upcoming rooms and encounters, NPC secrets

### What Players See (Filtered)
- Room description (no trap/secret annotations)
- Their own full character sheet
- Other party members: names, visible conditions only ("wounded" not "3 HP")
- Enemies: names, observable behavior only (NOT stats)
- Events that happened in their presence only

### Implementation

```typescript
function buildPlayerView(fullState: GameState, playerId: string): PlayerView {
  return {
    room: {
      name: fullState.room.name,
      description: fullState.room.description,
      // OMIT: traps, hidden_doors, encounter_data
      features: fullState.room.features.filter(f => f.visible),
    },
    self: fullState.characters.find(c => c.userId === playerId),
    party: fullState.characters
      .filter(c => c.userId !== playerId)
      .map(c => ({
        name: c.name, class: c.class,
        visibleCondition: describeCondition(c),  // "wounded", "fine"
      })),
    enemies: fullState.monsters?.map(m => ({
      name: m.name,
      observableBehavior: describeMonsterCondition(m),
    })),
    recentEvents: fullState.events
      .filter(e => isVisibleTo(e, playerId))
      .slice(-10),
  };
}
```

The barbarian genuinely doesn't know the door is trapped. The DM genuinely doesn't know the rogue is planning to pocket the quest item. This isn't prompt engineering — it's filtered state.

---

## Model Identity Registration

Every action tagged with which LLM decided. Critical for Benchmark Pillar. Mercury confirms: without this, the benchmark angle is "just marketing talk, not a verifiable claim."

### At Production Start

```typescript
POST /api/v1/admin/register-model-identity
{
  "userId": "player-thrakk-123",
  "modelProvider": "anthropic",
  "modelName": "claude-opus-4-6"
}
```

Engine stores and exposes in spectator API:

```typescript
GET /spectator/sessions/{id}
{
  "characters": [
    {
      "name": "Thrakk",
      "class": "barbarian",
      "model": { "provider": "anthropic", "name": "claude-opus-4-6" }
    }
  ]
}
```

### Per-Action Tagging

Orchestrator passes model identity with every game action:
```
X-Model-Identity: anthropic/claude-opus-4-6
```

Engine logs this in `session_events.data` so every spectator event shows which model decided.

### Engine Changes Required (~100-200 lines)

1. New column or table for model identities
2. New admin endpoint: `POST /admin/register-model-identity`
3. Spectator API: include model in character/session responses
4. Event logging: store model identity per event

---

## Multi-Model Configuration

```typescript
interface ProductionConfig {
  dm: {
    model: string;           // "claude-opus-4-6"
    provider: string;        // "anthropic"
    temperature: number;
    // NOTE: personality/style is CHOSEN by the DM agent, not assigned here
  };
  players: Array<{
    model: string;
    provider: string;
    temperature: number;
    // NOTE: character is CHOSEN by the player agent, not assigned here
  }>;
  sessionTarget: "short" | "medium" | "long";
  dungeonOptions: string[];  // templates the DM can choose from
}
```

### LLM Provider Interface

```typescript
interface LLMProvider {
  name: string;
  call(systemPrompt: string, userMessage: string, config: ModelConfig): Promise<string>;
}

// Implementations for: Anthropic, Google, Groq, DeepSeek, OpenAI
// Each wraps the provider's SDK with JSON mode + retry logic
```

API keys in `.env` on VPS-1:
```
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
GROQ_API_KEY=gsk_...
DEEPSEEK_API_KEY=sk-...
OPENAI_API_KEY=sk-...
```

---

## Cost Model

| Role | Model | Calls/session | Cost/call | Total |
|------|-------|--------------|-----------|-------|
| DM | Opus | ~25 | ~$0.03 | ~$0.75 |
| Player 1 | Sonnet | ~10 | ~$0.005 | ~$0.05 |
| Player 2 | Gemini | ~10 | ~$0.003 | ~$0.03 |
| Player 3 | Llama (Groq) | ~10 | ~$0.001 | ~$0.01 |
| Player 4 | DeepSeek | ~10 | ~$0.002 | ~$0.02 |
| **Total** | | **~65** | | **~$0.86** |

Add narrator (~$0.50-1.00 Opus) = **~$1.50-2.00/session**.
At 3/day: ~$5/day, ~$150/month. At 10/day: ~$15/day, ~$450/month.

Session zero (character creation) adds ~5 extra LLM calls per production. Negligible cost.

---

## Scheduler Simplification

The 900-line scheduler reduces to a ~100-line cron wrapper:

```typescript
// scripts/scheduler.ts — new version
import { runProduction } from "./orchestrator";

const CONFIGS: ProductionConfig[] = [
  {
    // Slot 1: Flagship multi-model (agents choose their characters)
    dm: { model: "claude-opus-4-6", provider: "anthropic", temperature: 0.8 },
    players: [
      { model: "gemini-2.5-pro", provider: "google", temperature: 0.7 },
      { model: "claude-sonnet-4-6", provider: "anthropic", temperature: 0.7 },
      { model: "llama-3.1-70b", provider: "groq", temperature: 0.6 },
      { model: "deepseek-v3", provider: "deepseek", temperature: 0.7 },
    ],
    sessionTarget: "medium",
    dungeonOptions: ["goblin-warren", "crypt-of-whispers", "bandit-fortress"],
  },
  // Slot 2: All-Claude (benchmark control group)
  // Slot 3: Budget (cheap models, short sessions)
];

const slot = parseInt(process.argv[2] ?? "0");
await runProduction(CONFIGS[slot]);
```

Note: no character names or DM styles in the config. Agents choose those themselves. The config only specifies which models fill which seats and what options they can choose from.

---

## LLM Output Parsing

The hardest part: getting reliable structured output from diverse LLMs.

**Strategy: JSON mode + validation + fallback.**

1. Request JSON mode from the provider (most support it)
2. Parse and validate against known action schemas
3. On invalid output: retry once with clarifying prompt
4. On second failure: default action (players: `pass`, DM: generic narration)
5. Log all failures for IE analysis (model-tagged — which models fail parsing most?)

Valid action sets:
- **Session Zero (all):** create_character (players), choose_campaign + choose_style (DM)
- **Combat (players):** attack, cast_spell, use_item, dodge, dash, hide, help
- **Exploration (players):** explore, search, talk_to_npc, party_chat, use_item, journal_add, rest, pass
- **DM:** narrate, trigger_encounter, monster_attack, advance_scene, voice_npc, deal_environment_damage, award_xp, request_check, end_session

---

## Role System Prompts

### Player Creation Prompt

See "Session Zero" section above. Key principle: the system presents options, the agent chooses everything.

### Player Gameplay Prompt (Key Sections)

```
You are {name}, a level {level} {race} {class}.
YOU chose this character. Own it.

YOUR CHARACTER: HP, AC, spells, inventory, personality, flaw, bond, ideal, fear

FLAW ACTIVATION:
Your flaw: "{the flaw YOU chose}". This is who you are.
When {trigger conditions}, lean into it. The audience loves flawed characters.
Being entertaining matters more than surviving.

WHAT YOU CAN SEE:
- Environment description (you don't know about hidden traps or secret doors)
- Your party members (names, how they look — NOT their exact HP)
- Enemies (names, how they're behaving — NOT their stat blocks)

RULES:
- Stay in character. Always.
- Your flaw causes real problems. Not "I'm sometimes too brave." Real consequences.
- You don't have perfect information. Act on what your character knows, not what's optimal.
- Primary objective: BE ENTERTAINING, not survive.

Return JSON: { "action": "...", "params": {...}, "roleplay": "..." }
```

### DM Gameplay Prompt (Key Sections)

```
You are the Dungeon Master for a live Railroaded production.
Campaign: {the campaign YOU chose}. Style: {the style YOU chose}.

YOUR FULL KNOWLEDGE (players cannot see this):
- Trap locations, hidden doors, monster stats, NPC secrets, upcoming encounters

CURRENT STATE:
- Room, party HP, encounter availability, rooms visited, time elapsed

YOUR JOB:
- Narrate EVERY mechanical result dramatically, in your chosen style
- Pace toward {target_length} — plan climax and wrap-up
- Create tension. Foreshadow. Reward cleverness. Let stupid plans fail spectacularly.
- Voice NPCs with personality. They are YOUR characters.
- Control monsters tactically — they want to win too.

RULES:
- You are running the show. The system handles the math. You handle the drama.
- If the party is cautious, raise the stakes. If they're reckless, let consequences land.
- Don't narrate player actions — describe outcomes and NPC reactions.

Return JSON: { "action": "...", "params": {...}, "narration": "..." }
```

---

## Narrator Role (Poormetheus — Unchanged)

The narrator is NOT in the game. The narrator watches and writes.

- Event-driven: `narrator-watcher.service` polls spectator API every 30s
- On event accumulation: fires webhook → Poormetheus writes prose
- Publishes via `narrator_check.py --post`
- The narrator provides the DM's *literary voice* for the audience but none of the DM's *agency*

The narrator benefits from richer source material now — real AI decisions instead of mechanical loops. Better events in → better prose out.

---

## What CC Needs to Build

### Engine Changes (Small — ~200 lines)

1. Model identity registration endpoint (`POST /admin/register-model-identity`)
2. Model identity in spectator API responses
3. Per-event model tagging in `session_events.data`
4. (Optional) Session duration target field

### New Files (The Orchestrator — ~1000-1400 lines)

| File | Purpose | Est. Lines |
|------|---------|-----------|
| `scripts/orchestrator.ts` | Session zero + turn loop + session end | ~600 |
| `scripts/providers.ts` | LLM provider interface + 5 implementations | ~200 |
| `scripts/prompts.ts` | System prompt templates + perception filter | ~250 |
| `scripts/config.ts` | ProductionConfig types + defaults | ~100 |
| `scripts/scheduler.ts` | Simplified cron wrapper (replaces 900 lines) | ~100 |

### What Does NOT Change

- `src/` — The engine. Zero changes except the 4 small items above.
- `skills/` — Player/DM skill docs (for external agents, not orchestrator)
- Deployment — Render, Vercel, CI/CD all unchanged
- Narrator — Still webhook-driven, still Poormetheus, still separate

---

## Mercury Integration Points

Mercury (marketing agent) needs specific outputs from this system to unlock the content pipeline:

1. **Model identity in spectator API** — unlocks "Played by Claude" badges, comparison content
2. **Character creation data** — "Same session zero, five models, here's who they chose to be" content
3. **Session highlights with model tags** — every event tagged with which model decided, enabling side-by-side comparison content
4. **Diary/journal entries per character** — "Same encounter, four different diary entries from four different models"

**Mercury's content format needs:**
- Twitter/X cards: side-by-side diary comparisons (1200x675 images)
- sahy.ai blog embeds: interactive model comparison tables
- Standalone shareable pages: `/compare/[session-id]`
- API endpoint for programmatic comparison data

These don't block Phase 1 build but should inform the spectator API design so the data is available.

---

## Benchmark Pillar: Built-In, Not Bolted On

The benchmark isn't a separate feature. It emerges from the architecture:

**Character creation** — which models choose which archetypes? Who picks the paladin? Who picks the rogue? Who writes genuinely dangerous flaws vs safe ones?

**In-game decisions** — does the barbarian protect the party or himself? Does the wizard hoard spell slots or blow everything on drama? Does the rogue steal from the party?

**Moral choices** — when the DM offers a morally gray deal, who takes it? Which models sanitize their character's defined selfishness?

**Flaw commitment** — which models actually activate flaws vs finding clever ways to avoid them while technically complying?

**All of this data is tagged with model identity and logged in session_events.** No separate benchmark infrastructure needed. The entertainment IS the experiment.

Run the same dungeon, same party composition slots, rotated across models. Automated comparison data that doesn't exist anywhere else. Nobody's asking "who does this AI want to be when given a free choice?" — we are.

---

## Phase 1 Deliverables

**Goal:** One production per day with real AI agents choosing their characters and playing with genuine intelligence. Visible model identity. Demonstrably different behavior across models.

1. Session zero flow (character creation as agent choice, DM campaign/style selection)
2. Orchestrator with turn loop (exploration + combat)
3. DM agent that narrates, triggers encounters, runs combat with intelligence
4. Player agents that make tactical decisions and roleplay in-character
5. Perception filter (orchestrator-side)
6. Model identity in spectator API
7. One flagship multi-model production config
8. Cost logging per session

**Phase 1 does NOT include:**
- Engine-side Perception Engine (orchestrator handles filtering)
- Production/Stage/Role as first-class DB entities
- Spectator interactions, marathons, entertainment scoring
- Human player integration
- External agent protocol ("friends' AIs play each other" — Phase 2+)
- Cinema pipeline (VISION — Karim confirmed)

---

## Open Questions for Karim

1. **Starting models?** Recommendation: Multi-model from day one. The model diversity IS the story. Opus DM + 4 different player models.

2. **Where does orchestrator run?** VPS-1 can handle it (just HTTP + LLM API calls). Start there.

3. **Cost budget?** At ~$1.50-2.00/session: 3/day = ~$135-180/mo, 10/day = ~$450-600/mo.

4. **Flaw commitment level?** Models will try to weasel out of real flaws. How aggressively do we prompt for commitment? Recommendation: hard — "your flaw MUST cause real problems or you're not playing."

5. **Keep old scheduler running in parallel?** It produces 3 games/day at $0 cost. Could run for volume while the orchestrator runs 1-2 AI games/day. Or sunset immediately.

6. **Avatar generation?** Current code blocked on OPENAI_API_KEY. Seed the fallback pool ($3.20) or provide key?

7. **Session length target?** Mercury can't market "shows" until sessions are 15-20+ minutes. What's our target for Phase 1? This affects DM prompt pacing instructions.

8. **Benchmark mode?** Should we build a "same dungeon, rotated models" automated comparison mode in Phase 1, or let it emerge organically from diverse productions first?

---

## Stakeholder Sign-Off

| Stakeholder | Role | Status |
|-------------|------|--------|
| Karim | Final authority | ⏳ PENDING |
| Poormetheus | Lead — architecture, gameplay, testing | ✅ Final draft |
| Prime | Technical implementation, CC task breakdown | ✅ Initial draft incorporated |
| Mercury | Marketing requirements, content pipeline | ✅ Feedback incorporated |
