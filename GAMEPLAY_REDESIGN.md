# Railroaded — Agent-First Gameplay Redesign

**Owner:** Poormetheus (final draft authority)
**Contributors:** Prime (Session 144 — initial draft), Mercury (marketing impact review)
**Date:** March 22, 2026
**Status:** DRAFT — Poormetheus owns final version. Karim approves.
**Depends on:** Theater Architecture Spec v3, CLAUDE.md (current engine spec)
**Delivers:** The orchestration layer that makes AI agents actually play.

---

## The Problem

Every Railroaded production today is a puppet show. The scheduler (`scripts/scheduler.ts`) drives all 5 seats with hardcoded logic:

- Players: attack first alive monster, clerics heal if ally < 50%, wizards cast magic missile
- DM: template narrations, trigger-encounter-if-available, monsters attack random targets
- Journals: random template picks from 4 templates
- Combat: iterate monsters → attack, iterate players → attack/heal, repeat until one side dead

There is **no AI in any seat.** Zero LLM calls. The mechanical loop produces data that looks like a game but has no intelligence, no personality, no drama. The narrator (Poormetheus) paints prose over mechanical data, but he's decorating a corpse — the underlying gameplay is lifeless.

**The Theater Architecture Spec says:** "Roles are independent execution contexts. Each role has its own system prompt, context window, and decision-making." That's the vision. This document is the bridge — what CC actually needs to build to make AI agents play for real.

---

## What Already Works (Don't Rebuild)

The engine is solid. Every feature below exists and is tested:

| Layer | Status | What it does |
|-------|--------|--------------|
| Game rules | ✅ 1042 tests | D&D 5e combat, skills, spells, loot, movement, conditions |
| REST API | ✅ deployed | Full player + DM tool surface via `/api/v1/` |
| MCP endpoint | ✅ deployed | Tool discovery + execution at `/mcp` |
| WebSocket | ✅ deployed | Real-time turn notifications, party events |
| Auth | ✅ deployed | Register, login, Bearer tokens, role-based access || Admin API | ✅ deployed | `admin/login-as` for programmatic auth |
| Matchmaking | ✅ deployed | Queue system, party formation, DM assignment |
| Spectator API | ✅ deployed | Public read-only access to sessions, events, narrations |
| Narrator | ✅ deployed | Event-driven prose generation via webhook |
| Scheduler cron | ✅ running | 3 games/day on VPS-1 |

**The engine doesn't need to change for Phase 1.** Agents connect to the same REST/MCP/WS endpoints the scheduler uses today. The difference: instead of hardcoded `if (class === "cleric" && allyHP < 50%) heal()`, an LLM reads the game state and decides what to do.

---

## Architecture: The Production Orchestrator

A new component sits between the scheduler cron and the engine. It is a TypeScript script (like the current scheduler) that runs on VPS-1 or Karim's Mac. It calls the Railroaded API (REST) for game actions and LLM provider APIs for agent decisions. It does NOT run on Render. It does NOT modify the engine. It's a client of the engine — but an intelligent one.

### File: `scripts/orchestrator.ts`

Replaces the gameplay loop in `scheduler.ts`. The scheduler remains as a thin cron wrapper.

---

## The Turn Loop (Core Mechanic)

### Exploration Phase

```
while (session is active) {
  // 1. DM reads room state
  roomState = GET /api/v1/dm/room-state

  // 2. DM decides what happens (LLM call)
  dmDecision = callLLM(dmModel, dmSystemPrompt, { roomState, partyStatus, history })
  executeActions(dmDecision)   // narrate, trigger encounter, advance scene, voice NPC

  // 3. Each player gets a turn
  for (player of activePlayers) {
    playerState = GET /api/v1/status         // player's own view
    playerDecision = callLLM(player.model, player.systemPrompt, {
      characterSheet: playerState,
      environment: filtered view,            // NO DM-private info
      recentEvents: player-visible only
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
      monsterDecision = callLLM(dmModel, dmSystemPrompt, { monsterStats, battlefield })
      executeActions(monsterDecision)     // monster_attack
      // DM narrates the result
      POST /api/v1/dm/narrate { text: dramatic narration }
    } else {
      // Player's turn — LLM picks action in-character
      playerDecision = callLLM(player.model, player.systemPrompt, {
        characterSheet, battlefield, initiative, recentCombatEvents
      })
      executeActions(playerDecision)     // attack, cast_spell, dodge, etc.
    }
    if (combatEnded) break;
  }
}
```

### Key Design Decisions

**One LLM call per turn.** The LLM returns a structured JSON action that the orchestrator parses and executes via API. ~50 LLM calls per session total, not hundreds.

**DM gets two calls per monster turn in combat:** tactical decision + narration. Separating these produces better results than combining.

**Outside combat, the loop is loose.** No strict turn order. DM sets scene, players respond. Players can "pass" if nothing to do.

---

## Perception Filter (Orchestrator-Side)

The filter is NOT an engine feature yet. It's implemented in the orchestrator by controlling what each agent sees in its prompt.

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
    recentEvents: fullState.events.filter(e => isVisibleTo(e, playerId)).slice(-10),
  };
}
```
---

## Model Identity Registration

Every action must be tagged with which LLM made the decision. Critical for the Benchmark Pillar.

### At Production Start

```typescript
// New engine endpoint needed:
POST /api/v1/admin/register-model-identity
{
  "userId": "curated-thrakk-123",
  "modelProvider": "anthropic",
  "modelName": "claude-opus-4-6"
}
```

Engine stores this and exposes in spectator API:

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

Orchestrator passes model identity with every game action via header:
```
X-Model-Identity: anthropic/claude-opus-4-6
```

Engine logs this in `session_events.data` so every spectator event shows which model decided.

### Engine Changes Required (~100 lines)

1. New column or table for model identities
2. New admin endpoint: `POST /admin/register-model-identity`
3. Spectator API update: include model in character/session responses
4. Event logging: store model identity per event

---

## Multi-Model Configuration

```typescript
interface ProductionConfig {
  dm: {
    model: string;           // "claude-opus-4-6"
    provider: string;        // "anthropic"
    personality: string;     // "the-bard"
    temperature: number;
  };
  players: Array<{
    character: string;       // name or "auto" for random
    model: string;
    provider: string;
    temperature: number;
  }>;
  sessionTarget: "short" | "medium" | "long";
  dungeonTemplate: string;   // template name or "random"
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

### Cost Model (Estimates)

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

---

## Scheduler Simplification

The 900-line scheduler reduces to a ~100-line cron wrapper:

```typescript
// scripts/scheduler.ts — new version
import { runProduction } from "./orchestrator";

const CONFIGS: ProductionConfig[] = [
  {
    // Slot 1: Flagship multi-model
    dm: { model: "claude-opus-4-6", provider: "anthropic", personality: "the-bard", temperature: 0.8 },
    players: [
      { character: "Thrakk", model: "gemini-2.5-pro", provider: "google", temperature: 0.7 },
      { character: "Silk", model: "claude-sonnet-4-6", provider: "anthropic", temperature: 0.7 },
      { character: "Brother Ash", model: "llama-3.1-70b", provider: "groq", temperature: 0.6 },
      { character: "Elara", model: "deepseek-v3", provider: "deepseek", temperature: 0.7 },
    ],
    sessionTarget: "medium",
    dungeonTemplate: "random",
  },
  // Slot 2: All-Claude (benchmark control group)
  // Slot 3: Budget (cheap models, short sessions)
];

const slot = parseInt(process.argv[2] ?? "0");
await runProduction(CONFIGS[slot]);
```

Cron becomes three one-liners:
```
0 8 * * *   bun run scripts/scheduler.ts 0
0 14 * * *  bun run scripts/scheduler.ts 1
0 20 * * *  bun run scripts/scheduler.ts 2
```
---

## LLM Output Parsing

The hardest part: getting reliable structured output from diverse LLMs.

**Strategy: JSON mode + validation + fallback.**

1. Request JSON mode from the provider (most support it)
2. Parse and validate against known action schemas
3. On invalid output: retry once with clarifying prompt
4. On second failure: default action (players: `pass`, DM: generic narration)
5. Log all failures for IE analysis

Valid action sets:
- **Combat (players):** attack, cast_spell, use_item, dodge, dash, hide, help
- **Exploration (players):** explore, search, talk_to_npc, party_chat, use_item, journal_add, rest, pass
- **DM:** narrate, trigger_encounter, monster_attack, advance_scene, voice_npc, deal_environment_damage, award_xp, request_check, end_session

---

## Role-Specific System Prompts

### DM Prompt (Key Sections)

```
You are the Dungeon Master for a live Railroaded production.
Campaign: {briefing}. Style: {personality profile}.

YOUR FULL KNOWLEDGE (players cannot see this):
- Trap locations, hidden doors, monster stats, NPC secrets, upcoming encounters

CURRENT STATE:
- Room, party HP, encounter availability, rooms visited, time elapsed

RULES:
- Narrate EVERY mechanical result dramatically
- Pace toward {target_length} — plan climax and wrap-up
- Create tension. Foreshadow. Reward cleverness. Let stupid plans fail spectacularly.

Return JSON: { "action": "...", "params": {...}, "narration": "..." }
```
### Player Prompt (Key Sections)

```
You are {name}, a level {level} {race} {class}.

YOUR CHARACTER: HP, AC, spells, inventory, personality, flaw, bond, ideal, fear

FLAW ACTIVATION:
Your flaw: "{description}". When {trigger}, you have {probability}% chance
of acting on it instead of the optimal choice. The audience loves flawed characters.

WHAT YOU CAN SEE (filtered — no DM-private info):
- Environment description (no traps/secrets)
- Party members (names, visible conditions — NOT exact HP)
- Enemies (names, behavior — NOT stats)

RULES:
- Stay in character always
- Your flaw MUST cause problems sometimes
- Primary objective: BE ENTERTAINING, not survive

Return JSON: { "action": "...", "params": {...}, "roleplay": "..." }
```

---

## What CC Needs to Build

### Engine Changes (Small — ~200 lines)

1. Model identity registration endpoint
2. Model identity in spectator API responses
3. Per-event model tagging in session_events.data
4. (Optional) Session duration target field

### New Files (The Orchestrator — ~800-1200 lines)

| File | Purpose | Est. Lines |
|------|---------|-----------|
| `scripts/orchestrator.ts` | Main production runner: setup, turn loop, session end | ~500 |
| `scripts/providers.ts` | LLM provider interface + 5 implementations | ~200 |
| `scripts/prompts.ts` | System prompt templates + perception filter functions | ~200 |
| `scripts/config.ts` | ProductionConfig types, defaults, DM personalities | ~100 |
| `scripts/scheduler.ts` | Simplified cron wrapper (replaces current 900 lines) | ~100 |
### What Does NOT Change

- `src/` — The engine. Zero changes except the 4 small items above.
- `skills/` — Player/DM skill docs (for external agents, not orchestrator)
- Deployment — Render, Vercel, CI/CD all unchanged
- Narrator — Still webhook-driven, still Poormetheus, still separate

---

## Phase 1 Deliverables

**Goal:** One production per day with real AI agents. Visible model identity. Demonstrably different behavior across models.

1. Orchestrator with turn loop (exploration + combat)
2. DM agent that narrates, triggers encounters, runs combat with intelligence
3. Player agents that make tactical decisions and roleplay in-character
4. Perception filter (orchestrator-side)
5. Model identity in spectator API
6. One flagship multi-model production config
7. Cost logging per session

**Phase 1 does NOT include:**
- Engine-side Perception Engine (orchestrator handles filtering)
- Production/Stage/Role as first-class DB entities
- Spectator interactions, marathons, entertainment scoring
- Human player integration
- External agent coordination (needs production API first)

---

## Open Questions for Karim

1. **Starting models?** Option A: Opus DM + Sonnet players (single provider, simplest). Option B: Multi-model from day one (maximum demo impact). Recommendation: B — the model diversity IS the story.

2. **Where does orchestrator run?** VPS-1 can handle it (just HTTP + LLM API calls). Start there, scale if needed.

3. **Cost budget?** At ~$1.50/session: 3/day = ~$135/mo, 10/day = ~$450/mo.

4. **DM personalities — how many?** Start with 2 (Bard + Wargamer), iterate.

5. **Flaw activation aggressiveness?** Spec says 70-90%. Recommend starting at 50% and tuning up.

6. **Keep old scheduler running?** It produces 3 games/day at $0. Could run in parallel for volume while orchestrator runs 1-2 AI games/day. Or sunset immediately.

7. **Avatar generation dependency?** The orchestrator needs characters with avatars. Current avatar code is blocked on OPENAI_API_KEY. Seed the fallback pool first ($3.20) to unblock?
