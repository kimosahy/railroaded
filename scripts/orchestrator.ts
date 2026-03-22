/**
 * Production Orchestrator — the core gameplay loop.
 * Replaces hardcoded scheduler logic with real LLM-driven agent decisions.
 *
 * This is a pure API client — it does NOT import from src/.
 */

import { type ProductionConfig, type ModelConfig, PRODUCTIONS, estimateCost } from "./config.ts";
import { getProvider, type LLMResponse } from "./providers.ts";
import * as prompts from "./prompts.ts";

export { PRODUCTIONS };

// --- Types ---

interface ParsedAction {
  action: string;
  params: Record<string, unknown>;
  roleplay?: string;
  narration?: string;
}

interface AgentSlot {
  config: ModelConfig;
  username: string;
  token: string;
  userId: string;
  characterId?: string;
  characterName?: string;
}

interface SessionCostLog {
  sessionId: string;
  startedAt: string;
  calls: Array<{
    role: string;
    model: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    estimatedCost: number;
  }>;
  totalEstimatedCost: number;
}

// --- Helpers ---

const API = process.env.API_URL ?? "https://api.railroaded.ai";
const ADMIN_SECRET = process.env.ADMIN_SECRET;

async function api(
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {}
): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => null) as Record<string, unknown> | null;
  return { status: res.status, data };
}

async function adminLogin(username: string, role: "player" | "dm" = "player"): Promise<{ token: string; userId: string }> {
  if (!ADMIN_SECRET) throw new Error("ADMIN_SECRET not set");
  const { status, data } = await api("/admin/login-as", {
    token: ADMIN_SECRET,
    body: { username, role },
  });
  if (status !== 200 || !data?.token) {
    throw new Error(`Admin login failed for ${username}: ${status} ${JSON.stringify(data)}`);
  }
  return { token: data.token as string, userId: data.userId as string };
}

async function registerModelIdentity(userId: string, provider: string, modelName: string): Promise<void> {
  if (!ADMIN_SECRET) return;
  await api("/admin/register-model-identity", {
    token: ADMIN_SECRET,
    body: { userId, modelProvider: provider, modelName },
  });
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

// --- LLM Output Parsing ---

export function parseLLMResponse(raw: string, validActions: string[]): ParsedAction | null {
  let parsed: Record<string, unknown> | null = null;

  // 1. Try JSON.parse directly
  try {
    parsed = JSON.parse(raw);
  } catch {
    // 2. Try extracting from markdown code fences
    const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
    if (fenceMatch) {
      try {
        parsed = JSON.parse(fenceMatch[1]);
      } catch { /* fall through */ }
    }
  }

  if (!parsed || typeof parsed !== "object") return null;

  const action = parsed.action as string | undefined;
  if (!action || !validActions.includes(action)) return null;

  return {
    action,
    params: (parsed.params as Record<string, unknown>) ?? {},
    roleplay: parsed.roleplay as string | undefined,
    narration: parsed.narration as string | undefined,
  };
}

// --- Action Execution ---

export async function executePlayerAction(
  decision: ParsedAction,
  token: string
): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const actionMap: Record<string, { path: string; bodyBuilder: (p: Record<string, unknown>) => unknown }> = {
    attack:       { path: "/api/v1/attack",     bodyBuilder: p => ({ target_id: p.targetId, weapon: p.weapon }) },
    cast_spell:   { path: "/api/v1/cast",       bodyBuilder: p => ({ spell_name: p.spellName, target_id: p.targetId }) },
    use_item:     { path: "/api/v1/use-item",    bodyBuilder: p => ({ item_name: p.itemName, target_id: p.targetId }) },
    dodge:        { path: "/api/v1/dodge",       bodyBuilder: () => ({}) },
    dash:         { path: "/api/v1/dash",        bodyBuilder: () => ({}) },
    hide:         { path: "/api/v1/hide",        bodyBuilder: () => ({}) },
    help:         { path: "/api/v1/help",        bodyBuilder: p => ({ target_id: p.targetId }) },
    explore:      { path: "/api/v1/move",        bodyBuilder: p => ({ direction_or_target: p.target }) },
    search:       { path: "/api/v1/move",        bodyBuilder: () => ({ direction_or_target: "search" }) },
    talk_to_npc:  { path: "/api/v1/chat",        bodyBuilder: p => ({ message: p.message }) },
    party_chat:   { path: "/api/v1/chat",        bodyBuilder: p => ({ message: p.message }) },
    journal_add:  { path: "/api/v1/journal",     bodyBuilder: p => ({ entry: p.entry }) },
    rest:         { path: "/api/v1/short-rest",   bodyBuilder: () => ({}) },
    pass:         { path: "/api/v1/end-turn",     bodyBuilder: () => ({}) },
  };

  const mapping = actionMap[decision.action];
  if (!mapping) {
    log(`[WARN] Unknown player action: ${decision.action}`);
    return { status: 400, data: { error: `Unknown action: ${decision.action}` } };
  }

  const result = await api(mapping.path, {
    token,
    body: mapping.bodyBuilder(decision.params),
  });

  if (result.status >= 400) {
    log(`[WARN] Player action ${decision.action} failed: ${result.status} ${JSON.stringify(result.data)}`);
  }

  return result;
}

export async function executeDMAction(
  decision: ParsedAction,
  token: string
): Promise<{ status: number; data: Record<string, unknown> | null }> {
  const actionMap: Record<string, { path: string; bodyBuilder: (p: Record<string, unknown>) => unknown }> = {
    narrate:                 { path: "/api/v1/dm/narrate",                bodyBuilder: p => ({ text: p.text ?? decision.narration ?? "" }) },
    trigger_encounter:       { path: "/api/v1/dm/trigger-encounter",      bodyBuilder: () => ({}) },
    monster_attack:          { path: "/api/v1/dm/monster-attack",         bodyBuilder: p => ({ monster_id: p.monsterId, target_id: p.targetId }) },
    advance_scene:           { path: "/api/v1/dm/advance-scene",          bodyBuilder: p => ({ direction: p.direction }) },
    voice_npc:               { path: "/api/v1/dm/voice-npc",              bodyBuilder: p => ({ npc_name: p.npcName, dialogue: p.dialogue }) },
    deal_environment_damage: { path: "/api/v1/dm/deal-environment-damage", bodyBuilder: p => ({ target_id: p.targetId, damage: p.damage, type: p.damageType, description: p.description }) },
    award_xp:                { path: "/api/v1/dm/award-xp",              bodyBuilder: p => ({ amount: p.amount, reason: p.reason }) },
    request_check:           { path: "/api/v1/dm/request-check",          bodyBuilder: p => ({ target_id: p.targetId, skill: p.skill, dc: p.dc }) },
    end_session:             { path: "/api/v1/dm/end-session",            bodyBuilder: p => ({ summary: p.summary }) },
  };

  const mapping = actionMap[decision.action];
  if (!mapping) {
    log(`[WARN] Unknown DM action: ${decision.action}`);
    return { status: 400, data: { error: `Unknown action: ${decision.action}` } };
  }

  const result = await api(mapping.path, {
    token,
    body: mapping.bodyBuilder(decision.params),
  });

  if (result.status >= 400) {
    log(`[WARN] DM action ${decision.action} failed: ${result.status} ${JSON.stringify(result.data)}`);
  }

  return result;
}

// --- LLM Call Wrappers ---

async function callAgent(
  config: ModelConfig,
  systemPrompt: string,
  userMessage: string,
  costLog: SessionCostLog,
  role: string,
  jsonMode: boolean = true
): Promise<string> {
  const provider = getProvider(config.provider);
  const response: LLMResponse = await provider.call({
    systemPrompt,
    userMessage,
    model: config.model,
    temperature: config.temperature,
    jsonMode,
  });

  costLog.calls.push({
    role,
    model: config.model,
    provider: config.provider,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
    estimatedCost: estimateCost(config.model, response.inputTokens, response.outputTokens),
  });

  return response.content;
}

async function callAgentWithParsing(
  config: ModelConfig,
  systemPrompt: string,
  userMessage: string,
  validActions: string[],
  costLog: SessionCostLog,
  role: string,
  defaultAction: ParsedAction,
): Promise<ParsedAction> {
  const raw = await callAgent(config, systemPrompt, userMessage, costLog, role);
  const parsed = parseLLMResponse(raw, validActions);

  if (parsed) return parsed;

  // Retry once with clarifying prompt
  log(`[PARSE] First attempt failed for ${role} (${config.model}). Raw: ${raw.slice(0, 200)}...`);
  const retryMessage = `${userMessage}\n\nYour previous response was not valid JSON. Please respond with ONLY a JSON object, no other text.`;
  const retryRaw = await callAgent(config, systemPrompt, retryMessage, costLog, `${role}-retry`);
  const retryParsed = parseLLMResponse(retryRaw, validActions);

  if (retryParsed) return retryParsed;

  log(`[PARSE] Retry failed for ${role} (${config.model}). Using default action: ${defaultAction.action}`);
  return defaultAction;
}

// --- Main Production Runner ---

export async function runProduction(config: ProductionConfig): Promise<void> {
  if (!ADMIN_SECRET) {
    console.error("ADMIN_SECRET env var is required");
    process.exit(1);
  }

  const costLog: SessionCostLog = {
    sessionId: "",
    startedAt: new Date().toISOString(),
    calls: [],
    totalEstimatedCost: 0,
  };

  try {
    // ── Phase 0: Setup accounts + register model identities ──
    log("Phase 0: Setting up accounts...");

    const playerSlots: AgentSlot[] = [];
    for (let i = 0; i < config.players.length; i++) {
      const playerConfig = config.players[i];
      const username = `agent-player-${i + 1}-${playerConfig.provider}-${playerConfig.model.replace(/[^a-z0-9]/g, "-")}`;
      const { token, userId } = await adminLogin(username, "player");
      await registerModelIdentity(userId, playerConfig.provider, playerConfig.model);
      playerSlots.push({ config: playerConfig, username, token, userId });
      log(`  Player ${i + 1}: ${username} (${playerConfig.model})`);
    }

    const dmUsername = `agent-dm-${config.dm.provider}-${config.dm.model.replace(/[^a-z0-9]/g, "-")}`;
    const { token: dmToken, userId: dmUserId } = await adminLogin(dmUsername, "dm");
    await registerModelIdentity(dmUserId, config.dm.provider, config.dm.model);
    const dmSlot: AgentSlot = { config: config.dm, username: dmUsername, token: dmToken, userId: dmUserId };
    log(`  DM: ${dmUsername} (${config.dm.model})`);

    // ── Phase 1: Session Zero — Character Creation ──
    log("Phase 1: Character creation...");

    const availableRaces = ["human", "elf", "dwarf", "halfling", "half-orc"];
    const availableClasses = ["fighter", "rogue", "cleric", "wizard"];

    for (const slot of playerSlots) {
      const prompt = prompts.buildCharacterCreationPrompt({
        availableRaces,
        availableClasses,
        levelRange: [1, 1],
      });

      const raw = await callAgent(slot.config, prompt.system, prompt.user, costLog, `player-creation-${slot.username}`);
      let charChoice = parseLLMResponse(raw, []) as Record<string, unknown> | null;

      // For character creation, we parse the raw JSON directly (no action field)
      try {
        charChoice = JSON.parse(raw);
      } catch {
        const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
        if (fenceMatch) {
          try { charChoice = JSON.parse(fenceMatch[1]); } catch { /* fall through */ }
        }
      }

      // Validate and create character
      let race = (charChoice?.race as string ?? "human").toLowerCase();
      let charClass = (charChoice?.class as string ?? "fighter").toLowerCase();
      const name = (charChoice?.name as string) ?? `Agent${playerSlots.indexOf(slot) + 1}`;
      const personality = (charChoice?.personality as string) ?? "";
      const backstory = (charChoice?.backstory as string) ?? "";

      // Ensure valid choices
      if (!availableRaces.includes(race)) race = "human";
      if (!availableClasses.includes(charClass)) charClass = "fighter";

      const createResult = await api("/api/v1/character", {
        token: slot.token,
        body: {
          name,
          race,
          class: charClass,
          ability_scores: { str: 14, dex: 14, con: 12, int: 10, wis: 10, cha: 10 },
          personality,
          backstory,
          avatar_url: "https://example.com/agent-avatar.png",
        },
      });

      if (createResult.status === 201 || createResult.status === 200) {
        slot.characterId = createResult.data?.character_id as string;
        slot.characterName = name;
        log(`  [${slot.config.model}] → ${name}, ${race} ${charClass}` +
          (charChoice?.flaw ? ` — flaw: "${charChoice.flaw}"` : ""));
      } else {
        log(`  [WARN] Character creation failed for ${slot.username}: ${createResult.status}`);
      }
    }

    // ── Phase 2: DM Session Zero ──
    log("Phase 2: DM setup...");

    // Get available campaign templates
    const templatesRes = await api("/spectator/dungeons");
    const availableCampaigns: prompts.CampaignOption[] = [];
    if (templatesRes.data?.templates && Array.isArray(templatesRes.data.templates)) {
      for (const t of templatesRes.data.templates as Array<Record<string, unknown>>) {
        availableCampaigns.push({
          name: t.name as string,
          description: (t.description as string) ?? "",
          tone: (t.tone as string) ?? "classic",
        });
      }
    }

    const partyComposition = playerSlots.map(s => ({
      name: s.characterName ?? "Unknown",
      race: "unknown",
      class: "unknown",
    }));

    const dmPrompt = prompts.buildDMCreationPrompt({
      availableCampaigns,
      availableStyles: prompts.DM_STYLES,
      partyComposition,
      sessionTarget: config.sessionTarget,
    });

    const dmSetupRaw = await callAgent(config.dm, dmPrompt.system, dmPrompt.user, costLog, "dm-creation");
    let dmSetup: Record<string, unknown> = {};
    try { dmSetup = JSON.parse(dmSetupRaw); } catch { /* use defaults */ }
    const dmStyle = (dmSetup.style as string) ?? "classic";
    log(`  [${config.dm.model}] → campaign: "${dmSetup.campaign ?? "custom"}", style: "${dmStyle}"`);

    // ── Phase 3: Party Formation + Session Start ──
    log("Phase 3: Party formation...");

    // Queue all players
    for (const slot of playerSlots) {
      await api("/api/v1/queue", { token: slot.token });
    }

    // Queue DM — this triggers matchmaking
    const matchResult = await api("/api/v1/dm/queue", { token: dmSlot.token });
    log(`  Match result: ${JSON.stringify(matchResult.data)}`);

    // Wait for party formation
    let sessionId = "";
    let partyId = "";
    for (let i = 0; i < 30; i++) {
      const partiesRes = await api("/spectator/parties");
      const parties = (partiesRes.data?.parties as Array<Record<string, unknown>>) ?? [];
      const activeParty = parties.find(p => p.phase === "exploration");
      if (activeParty) {
        partyId = activeParty.id as string;
        // Get session ID
        const partyDetail = await api(`/spectator/parties/${partyId}`);
        sessionId = partyId; // Will be updated when we get the actual session
        log(`  Party formed: ${partyId}`);
        break;
      }
      await sleep(2000);
    }

    if (!partyId) {
      log("[ERROR] Party formation timed out");
      return;
    }

    costLog.sessionId = sessionId;

    // DM opening narration
    if (dmSetup.openingNarration) {
      await api("/api/v1/dm/narrate", {
        token: dmSlot.token,
        body: { text: dmSetup.openingNarration },
      });
    }

    // ── Phase 4: Exploration Loop ──
    log("Phase 4: Exploration...");

    let roomsVisited = 0;
    const maxRooms = config.sessionTarget === "short" ? 4 : config.sessionTarget === "long" ? 8 : 6;
    const startTime = Date.now();
    let sessionActive = true;

    while (sessionActive && roomsVisited < maxRooms) {
      // Get current state
      const roomStateRes = await api("/api/v1/dm/room-state", { token: dmSlot.token });
      const partyStateRes = await api("/api/v1/dm/party-state", { token: dmSlot.token });

      // Check if session is still active
      const partyCheckRes = await api(`/spectator/parties/${partyId}`);
      const currentPhase = partyCheckRes.data?.phase as string;
      if (!currentPhase || currentPhase === "ended") {
        log("  Session ended (detected via spectator)");
        sessionActive = false;
        break;
      }

      // DM Turn
      const partyStatus = ((partyStateRes.data?.party ?? partyStateRes.data?.members ?? []) as Array<Record<string, unknown>>).map(p => ({
        name: p.name as string,
        class: p.class as string,
        hpCurrent: p.hpCurrent as number ?? p.hp_current as number ?? 10,
        hpMax: p.hpMax as number ?? p.hp_max as number ?? 10,
        conditions: (p.conditions as string[]) ?? [],
      }));

      const recentEvents = ((partyCheckRes.data?.recentEvents ?? []) as Array<Record<string, unknown>>).map(e => ({
        type: e.type as string,
        actorId: (e.actorId as string) ?? null,
        data: (e.data as Record<string, unknown>) ?? {},
        timestamp: (e.timestamp as string) ?? "",
      }));

      const dmExplorePrompt = prompts.buildDMExplorationPrompt({
        roomState: roomStateRes.data ?? {},
        partyStatus,
        history: recentEvents,
        style: dmStyle,
        sessionProgress: { roomsVisited, timeElapsed: Date.now() - startTime, targetLength: config.sessionTarget },
      });

      const dmDecision = await callAgentWithParsing(
        config.dm, dmExplorePrompt.system, dmExplorePrompt.user,
        prompts.DM_ACTIONS, costLog, "dm-exploration",
        { action: "narrate", params: { text: "The dungeon echoes with silence..." } }
      );

      log(`  DM: ${dmDecision.action}${dmDecision.narration ? ` — "${dmDecision.narration.slice(0, 80)}..."` : ""}`);
      await executeDMAction(dmDecision, dmSlot.token);

      // Check if DM triggered combat
      if (dmDecision.action === "trigger_encounter") {
        await runCombatLoop(config, playerSlots, dmSlot, dmStyle, partyId, costLog);
        roomsVisited++;
        continue;
      }

      // Check if DM ended session
      if (dmDecision.action === "end_session") {
        sessionActive = false;
        break;
      }

      if (dmDecision.action === "advance_scene") {
        roomsVisited++;
      }

      // Player Turns (loose order — not strict initiative)
      for (const slot of playerSlots) {
        // Re-check session is active
        const phaseCheck = await api(`/spectator/parties/${partyId}`);
        if ((phaseCheck.data?.phase as string) === "combat") {
          // DM may have triggered encounter, enter combat
          await runCombatLoop(config, playerSlots, dmSlot, dmStyle, partyId, costLog);
          break;
        }

        const playerActionsRes = await api("/api/v1/actions", { token: slot.token });
        const availableActions = (playerActionsRes.data?.actions as string[]) ?? prompts.PLAYER_EXPLORATION_ACTIONS;

        const playerViewData: prompts.PlayerView = {
          room: {
            name: (partyCheckRes.data?.currentRoom as string) ?? "Unknown Room",
            description: (partyCheckRes.data?.currentRoomDescription as string) ?? "You stand in a dimly lit chamber.",
          },
          self: {
            name: slot.characterName ?? "Unknown",
            race: "unknown", class: "unknown", level: 1,
            hpCurrent: 10, hpMax: 10, ac: 10,
            abilityScores: {}, inventory: [],
            equipment: { weapon: null, armor: null, shield: null },
            conditions: [],
          },
          party: playerSlots.filter(s => s !== slot).map(s => ({
            name: s.characterName ?? "Unknown",
            class: "adventurer",
            visibleCondition: "fine",
          })),
          enemies: [],
          recentEvents: recentEvents.slice(-5),
        };

        const playerPrompt = prompts.buildPlayerExplorationPrompt({
          character: playerViewData.self,
          environment: playerViewData,
          recentEvents: recentEvents.slice(-5),
          availableActions,
        });

        const playerDecision = await callAgentWithParsing(
          slot.config, playerPrompt.system, playerPrompt.user,
          availableActions, costLog, `player-${slot.characterName}`,
          { action: "pass", params: {}, roleplay: "" }
        );

        log(`  ${slot.characterName}: ${playerDecision.action}${playerDecision.roleplay ? ` — "${playerDecision.roleplay.slice(0, 60)}..."` : ""}`);
        await executePlayerAction(playerDecision, slot.token);

        // Small delay for spectator readability
        await sleep(1500);
      }

      // Small delay between rounds
      await sleep(2000);
    }

    // ── Phase 6: Session End ──
    log("Phase 6: Session end...");

    // DM narrates finale
    const finalePrompt = prompts.buildDMExplorationPrompt({
      roomState: {},
      partyStatus: [],
      history: [],
      style: dmStyle,
      sessionProgress: { roomsVisited, timeElapsed: Date.now() - startTime, targetLength: config.sessionTarget },
    });

    await callAgent(config.dm, finalePrompt.system,
      "The session is ending. Provide a dramatic closing narration and session summary.",
      costLog, "dm-finale");

    await api("/api/v1/dm/end-session", {
      token: dmSlot.token,
      body: { summary: `AI-driven production with ${config.players.length} agents. ${roomsVisited} rooms explored.` },
    });

    // Calculate total cost
    costLog.totalEstimatedCost = costLog.calls.reduce((sum, c) => sum + c.estimatedCost, 0);

    // Write cost log
    try {
      const logsDir = "logs";
      try { await Bun.write(`${logsDir}/.keep`, ""); } catch { /* dir may exist */ }
      const logPath = `${logsDir}/session-cost-${costLog.sessionId || "unknown"}-${Date.now()}.json`;
      await Bun.write(logPath, JSON.stringify(costLog, null, 2));
      log(`  Cost log written to ${logPath}`);
    } catch (err) {
      log(`  [WARN] Failed to write cost log: ${err}`);
    }

    log(`\nProduction complete!`);
    log(`  Total LLM calls: ${costLog.calls.length}`);
    log(`  Estimated cost: $${costLog.totalEstimatedCost.toFixed(4)}`);
    log(`  Rooms visited: ${roomsVisited}`);
    log(`  Duration: ${Math.round((Date.now() - startTime) / 60000)}min`);

  } catch (err) {
    log(`[FATAL] Production failed: ${err}`);
    throw err;
  }
}

// --- Combat Loop ---

async function runCombatLoop(
  config: ProductionConfig,
  playerSlots: AgentSlot[],
  dmSlot: AgentSlot,
  dmStyle: string,
  partyId: string,
  costLog: SessionCostLog,
): Promise<void> {
  log("  ── Combat! ──");
  const MAX_COMBAT_TURNS = 40;
  let turnCount = 0;

  while (turnCount < MAX_COMBAT_TURNS) {
    // Check if still in combat
    const partyRes = await api(`/spectator/parties/${partyId}`);
    const phase = partyRes.data?.phase as string;
    if (phase !== "combat") {
      log("  ── Combat ended ──");
      break;
    }

    const monsters = (partyRes.data?.monsters as Array<Record<string, unknown>>) ?? [];
    const aliveMonsters = monsters.filter(m => (m.hpCurrent as number) > 0);
    if (aliveMonsters.length === 0) {
      log("  ── All monsters defeated ──");
      break;
    }

    // Get room state for DM
    const roomStateRes = await api("/api/v1/dm/room-state", { token: dmSlot.token });
    const partyStateRes = await api("/api/v1/dm/party-state", { token: dmSlot.token });

    const partyMembers = ((partyStateRes.data?.party ?? partyStateRes.data?.members ?? []) as Array<Record<string, unknown>>).map(p => ({
      id: p.id as string ?? p.characterId as string ?? "",
      name: p.name as string,
      class: p.class as string,
      hpCurrent: (p.hpCurrent ?? p.hp_current ?? 10) as number,
      hpMax: (p.hpMax ?? p.hp_max ?? 10) as number,
      ac: (p.ac ?? 10) as number,
    }));

    // Monster turns (DM controls)
    for (const monster of aliveMonsters) {
      const monsterPrompt = prompts.buildDMCombatPrompt({
        monster: {
          name: monster.name as string,
          id: monster.id as string,
          hpCurrent: monster.hpCurrent as number,
          hpMax: monster.hpMax as number,
          ac: (monster.ac ?? 12) as number,
          attacks: (monster.attacks as unknown[]) ?? [],
        },
        battlefield: roomStateRes.data ?? {},
        partyPositions: partyMembers.filter(p => p.hpCurrent > 0),
      });

      const monsterDecision = await callAgentWithParsing(
        config.dm, monsterPrompt.system, monsterPrompt.user,
        ["monster_attack"], costLog, `dm-monster-${monster.name}`,
        {
          action: "monster_attack",
          params: {
            monsterId: monster.id,
            targetId: partyMembers.find(p => p.hpCurrent > 0)?.id ?? "",
          },
        }
      );

      log(`    ${monster.name}: attacks → ${monsterDecision.params.targetId}`);
      const attackResult = await executeDMAction(monsterDecision, dmSlot.token);

      // DM narrates the result
      const narrationPrompt = prompts.buildDMCombatNarrationPrompt({
        actionResult: {
          type: "monster_attack",
          actorId: monster.id as string,
          data: attackResult.data ?? {},
          timestamp: new Date().toISOString(),
        },
        style: dmStyle,
        tension: turnCount < 5 ? "low" : turnCount < 15 ? "medium" : turnCount < 25 ? "high" : "climax",
      });

      const narration = await callAgent(config.dm, narrationPrompt.system, narrationPrompt.user, costLog, "dm-combat-narration");
      let narrationText = "";
      try {
        const parsed = JSON.parse(narration);
        narrationText = parsed.narration ?? narration;
      } catch {
        narrationText = narration;
      }

      if (narrationText) {
        await api("/api/v1/dm/narrate", { token: dmSlot.token, body: { text: narrationText } });
      }

      await sleep(1500);

      // Check if combat ended
      const checkRes = await api(`/spectator/parties/${partyId}`);
      if ((checkRes.data?.phase as string) !== "combat") break;
    }

    // Re-check combat status
    const midCheck = await api(`/spectator/parties/${partyId}`);
    if ((midCheck.data?.phase as string) !== "combat") break;

    // Player turns
    for (const slot of playerSlots) {
      const recentEvents = ((midCheck.data?.recentEvents ?? []) as Array<Record<string, unknown>>).map(e => ({
        type: e.type as string,
        actorId: (e.actorId as string) ?? null,
        data: (e.data as Record<string, unknown>) ?? {},
        timestamp: (e.timestamp as string) ?? "",
      }));

      const combatPrompt = prompts.buildPlayerCombatPrompt({
        character: {
          name: slot.characterName ?? "Unknown",
          race: "unknown", class: "unknown", level: 1,
          hpCurrent: 10, hpMax: 10, ac: 10,
          abilityScores: {}, inventory: [],
          equipment: { weapon: null, armor: null, shield: null },
          conditions: [],
        },
        battlefield: {
          room: { name: "Combat", description: "Battle rages!" },
          self: { name: slot.characterName ?? "Unknown", race: "unknown", class: "unknown", level: 1, hpCurrent: 10, hpMax: 10, ac: 10, abilityScores: {}, inventory: [], equipment: { weapon: null, armor: null, shield: null }, conditions: [] },
          party: playerSlots.filter(s => s !== slot).map(s => ({ name: s.characterName ?? "Unknown", class: "adventurer", visibleCondition: "fine" })),
          enemies: aliveMonsters.map(m => ({ name: m.name as string, observableBehavior: prompts.describeMonsterCondition({ hpCurrent: m.hpCurrent as number, hpMax: m.hpMax as number }) })),
          recentEvents: recentEvents.slice(-5),
        },
        initiativeOrder: [
          ...playerSlots.map(s => ({ name: s.characterName ?? "Unknown", isAlly: true })),
          ...aliveMonsters.map(m => ({ name: m.name as string, isAlly: false })),
        ],
        recentCombatEvents: recentEvents.slice(-5),
      });

      const playerDecision = await callAgentWithParsing(
        slot.config, combatPrompt.system, combatPrompt.user,
        prompts.PLAYER_COMBAT_ACTIONS, costLog, `player-combat-${slot.characterName}`,
        { action: "attack", params: { targetId: aliveMonsters[0]?.id }, roleplay: "" }
      );

      log(`    ${slot.characterName}: ${playerDecision.action}${playerDecision.roleplay ? ` — "${playerDecision.roleplay.slice(0, 50)}"` : ""}`);
      await executePlayerAction(playerDecision, slot.token);

      // End turn after action
      await api("/api/v1/end-turn", { token: slot.token });

      await sleep(1500);

      // Check if combat ended
      const turnCheck = await api(`/spectator/parties/${partyId}`);
      if ((turnCheck.data?.phase as string) !== "combat") break;
    }

    turnCount++;
  }

  if (turnCount >= MAX_COMBAT_TURNS) {
    log("  [WARN] Combat hit max turn limit");
  }
}
