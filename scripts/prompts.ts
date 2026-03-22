/**
 * Prompt templates + perception filter for the orchestrator.
 * All intelligence that shapes agent behavior lives here.
 */

// --- Types ---

export interface CharacterSheet {
  name: string;
  race: string;
  class: string;
  level: number;
  hpCurrent: number;
  hpMax: number;
  ac: number;
  abilityScores: Record<string, number>;
  spellSlots?: Record<string, { current: number; max: number }>;
  inventory: string[];
  equipment: Record<string, string | null>;
  conditions: string[];
  personality?: string;
  backstory?: string;
  flaw?: string;
  bond?: string;
  ideal?: string;
  fear?: string;
}

export interface PartyMember {
  name: string;
  class: string;
  visibleCondition: string;
}

export interface VisibleEnemy {
  name: string;
  observableBehavior: string;
}

export interface GameEvent {
  type: string;
  actorId: string | null;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface RoomInfo {
  name: string;
  description: string;
  features?: Array<{ name: string; description: string; visible?: boolean }>;
}

export interface PlayerView {
  room: RoomInfo;
  self: CharacterSheet;
  party: PartyMember[];
  enemies: VisibleEnemy[];
  recentEvents: GameEvent[];
}

export interface FullRoomState {
  room: RoomInfo & {
    traps?: unknown[];
    hiddenDoors?: unknown[];
    encounterData?: unknown;
  };
  features?: unknown[];
}

export interface CampaignOption {
  name: string;
  description: string;
  tone: string;
}

// --- Perception Filter ---

export function describeCondition(character: { hpCurrent: number; hpMax: number; conditions: string[] }): string {
  if (character.conditions.includes("dead")) return "dead";
  if (character.hpCurrent <= 0) return "unconscious";
  const ratio = character.hpCurrent / character.hpMax;
  if (ratio > 0.75) return "fine";
  if (ratio > 0.25) return "wounded";
  return "critical";
}

export function describeMonsterCondition(monster: { hpCurrent: number; hpMax: number }): string {
  const ratio = monster.hpCurrent / monster.hpMax;
  if (ratio > 0.5) return "seems healthy";
  if (ratio > 0.25) return "looking battered";
  return "barely standing";
}

export function isVisibleTo(event: GameEvent, playerId: string): boolean {
  // DM-only event types that players shouldn't see
  const dmOnlyTypes = ["trap_check", "hidden_roll", "dm_note", "secret_door_check"];
  if (dmOnlyTypes.includes(event.type)) return false;

  // Whispers are only visible to sender and recipient
  if (event.type === "whisper") {
    const data = event.data as { from?: string; toUserId?: string };
    return event.actorId === playerId || data.toUserId === playerId;
  }

  return true;
}

export function buildPlayerView(
  fullState: {
    room: FullRoomState["room"];
    characters: Array<CharacterSheet & { userId: string; id: string }>;
    monsters?: Array<{ name: string; hpCurrent: number; hpMax: number; id: string }>;
    events: GameEvent[];
  },
  playerId: string
): PlayerView {
  const self = fullState.characters.find(c => c.userId === playerId || c.id === playerId);
  if (!self) throw new Error(`Character not found for player ${playerId}`);

  return {
    room: {
      name: fullState.room.name,
      description: fullState.room.description,
      features: (fullState.room.features ?? []).filter(f => f.visible !== false),
    },
    self,
    party: fullState.characters
      .filter(c => c.userId !== playerId && c.id !== playerId)
      .map(c => ({
        name: c.name,
        class: c.class,
        visibleCondition: describeCondition(c),
      })),
    enemies: (fullState.monsters ?? []).map(m => ({
      name: m.name,
      observableBehavior: describeMonsterCondition(m),
    })),
    recentEvents: fullState.events
      .filter(e => isVisibleTo(e, playerId))
      .slice(-10),
  };
}

// --- Character Creation Prompt ---

export function buildCharacterCreationPrompt(options: {
  availableRaces: string[];
  availableClasses: string[];
  levelRange: [number, number];
}): { system: string; user: string } {
  return {
    system: `You are about to join a D&D campaign. The world is yours to enter as whoever you want to be.

AVAILABLE OPTIONS:
- Races: ${options.availableRaces.join(", ")}
- Classes: ${options.availableClasses.join(", ")}
- Level range: ${options.levelRange[0]}-${options.levelRange[1]}

Create your character. Choose freely — there is no "correct" answer.

You must provide:
- Race and class
- A name that fits the fantasy setting
- 2-3 sentences of personality
- A backstory (brief — what brought you here?)
- A flaw (something that will cause you REAL problems)
- A bond (something you care about protecting)
- An ideal (what you believe in)
- A fear (what makes you hesitate)

Your flaw MUST be real. Not "sometimes too brave." Real: "will betray allies for gold," "freezes when facing undead," "pathological liar even to friends."

Return JSON only.`,
    user: `Create your character now. Return a JSON object with these exact fields:
{
  "race": "one of the available races",
  "class": "one of the available classes",
  "name": "your character's name",
  "personality": "2-3 sentences",
  "backstory": "brief backstory",
  "flaw": "a real, dangerous flaw",
  "bond": "what you protect",
  "ideal": "what you believe",
  "fear": "what makes you hesitate"
}`,
  };
}

// --- DM Session Zero Prompt ---

export function buildDMCreationPrompt(options: {
  availableCampaigns: CampaignOption[];
  availableStyles: string[];
  partyComposition: Array<{ name: string; race: string; class: string }>;
  sessionTarget: string;
}): { system: string; user: string } {
  const campaignList = options.availableCampaigns.length > 0
    ? options.availableCampaigns.map(c => `- "${c.name}" (${c.tone}): ${c.description}`).join("\n")
    : "- No pre-built campaigns available. You may describe your own setting and adventure.";

  const styleList = options.availableStyles.map(s => `- ${s}`).join("\n");

  const partyDesc = options.partyComposition.map(p => `${p.name} (${p.race} ${p.class})`).join(", ");

  return {
    system: `You are the Dungeon Master for a live Railroaded production. Your job is to create an unforgettable experience.

AVAILABLE CAMPAIGNS:
${campaignList}

AVAILABLE STYLES:
${styleList}

YOUR PARTY: ${partyDesc}

SESSION LENGTH TARGET: ${options.sessionTarget}

Choose your campaign, your style, and your approach. You have full creative control — any setting, any monsters, any story. The system provides D&D 5e rules; you provide everything else.

Return JSON only.`,
    user: `Choose your campaign and style. Return a JSON object:
{
  "campaign": "campaign name or your own custom name",
  "style": "your chosen style",
  "pacingNotes": "brief notes on your pacing approach",
  "openingNarration": "your dramatic opening narration (2-4 sentences)"
}`,
  };
}

// --- Player Exploration Prompt ---

export function buildPlayerExplorationPrompt(options: {
  character: CharacterSheet;
  environment: PlayerView;
  recentEvents: GameEvent[];
  availableActions: string[];
}): { system: string; user: string } {
  const char = options.character;
  const flaw = char.flaw ? `\nFLAW ACTIVATION:\nYour flaw: "${char.flaw}". This is who you are.\nWhen the trigger comes, lean into it. The audience loves flawed characters.\nBeing entertaining matters more than surviving.` : "";

  return {
    system: `You are ${char.name}, a level ${char.level} ${char.race} ${char.class}.
YOU chose this character. Own it.

YOUR CHARACTER:
- HP: ${char.hpCurrent}/${char.hpMax}, AC: ${char.ac}
- Equipment: ${JSON.stringify(char.equipment)}
- Inventory: ${char.inventory.join(", ") || "empty"}
- Conditions: ${char.conditions.join(", ") || "none"}
${char.personality ? `- Personality: ${char.personality}` : ""}
${char.backstory ? `- Backstory: ${char.backstory}` : ""}
${flaw}

WHAT YOU CAN SEE:
- Room: ${options.environment.room.name} — ${options.environment.room.description}
- Party: ${options.environment.party.map(p => `${p.name} (${p.class}, ${p.visibleCondition})`).join(", ") || "none nearby"}
${options.environment.enemies.length > 0 ? `- Enemies: ${options.environment.enemies.map(e => `${e.name} (${e.observableBehavior})`).join(", ")}` : ""}

RULES:
- Stay in character. Always.
- Your flaw causes real problems. Not "I'm sometimes too brave." Real consequences.
- You don't have perfect information. Act on what your character knows, not what's optimal.
- Primary objective: BE ENTERTAINING, not survive.

Available actions: ${options.availableActions.join(", ")}

Return JSON only.`,
    user: `What do you do? Return a JSON object:
{
  "action": "one of: ${options.availableActions.join(", ")}",
  "params": { ... action-specific parameters ... },
  "roleplay": "brief in-character description of what you're doing"
}`,
  };
}

// --- DM Exploration Prompt ---

export function buildDMExplorationPrompt(options: {
  roomState: Record<string, unknown>;
  partyStatus: Array<{ name: string; class: string; hpCurrent: number; hpMax: number; conditions: string[] }>;
  history: GameEvent[];
  style: string;
  sessionProgress: { roomsVisited: number; timeElapsed: number; targetLength: string };
}): { system: string; user: string } {
  const partyDesc = options.partyStatus.map(p =>
    `${p.name} (${p.class}): ${p.hpCurrent}/${p.hpMax} HP${p.conditions.length > 0 ? `, ${p.conditions.join(", ")}` : ""}`
  ).join("\n");

  const pacing = options.sessionProgress.targetLength === "short" ? "Keep it moving — aim for 3-4 rooms total."
    : options.sessionProgress.targetLength === "long" ? "Take your time — explore fully, deep NPC interactions."
    : "Balanced pacing — 5-6 rooms, mix of combat and roleplay.";

  return {
    system: `You are the Dungeon Master. Style: ${options.style}.

YOUR FULL KNOWLEDGE (players cannot see this):
${JSON.stringify(options.roomState, null, 2)}

PARTY STATUS:
${partyDesc}

SESSION PROGRESS: ${options.sessionProgress.roomsVisited} rooms visited, ${Math.round(options.sessionProgress.timeElapsed / 60000)}min elapsed.
PACING: ${pacing}

RECENT EVENTS (last 10):
${options.history.slice(-10).map(e => `[${e.type}] ${JSON.stringify(e.data)}`).join("\n")}

DM ACTIONS: narrate, trigger_encounter, advance_scene, voice_npc, deal_environment_damage, award_xp, request_check, end_session

Return JSON only.`,
    user: `What happens next? Return a JSON object:
{
  "action": "one of the DM actions above",
  "params": { ... action-specific parameters ... },
  "narration": "dramatic narration text"
}`,
  };
}

// --- Player Combat Prompt ---

export function buildPlayerCombatPrompt(options: {
  character: CharacterSheet;
  battlefield: PlayerView;
  initiativeOrder: Array<{ name: string; isAlly: boolean }>;
  recentCombatEvents: GameEvent[];
}): { system: string; user: string } {
  const char = options.character;
  const spellInfo = char.spellSlots
    ? Object.entries(char.spellSlots).map(([lvl, s]) => `${lvl}: ${s.current}/${s.max}`).join(", ")
    : "none";

  return {
    system: `COMBAT! You are ${char.name}, a level ${char.level} ${char.race} ${char.class}.

YOUR STATUS:
- HP: ${char.hpCurrent}/${char.hpMax}, AC: ${char.ac}
- Spell slots: ${spellInfo}
- Equipment: ${JSON.stringify(char.equipment)}
- Inventory: ${char.inventory.join(", ") || "empty"}
- Conditions: ${char.conditions.join(", ") || "none"}
${char.personality ? `- Personality: ${char.personality}` : ""}
${char.flaw ? `- Flaw: ${char.flaw} — lean into it even in combat!` : ""}

BATTLEFIELD:
${options.battlefield.enemies.map(e => `- ENEMY: ${e.name} (${e.observableBehavior})`).join("\n")}
${options.battlefield.party.map(p => `- ALLY: ${p.name} (${p.class}, ${p.visibleCondition})`).join("\n")}

INITIATIVE ORDER: ${options.initiativeOrder.map(i => `${i.name}${i.isAlly ? "" : " [enemy]"}`).join(" → ")}

RECENT COMBAT:
${options.recentCombatEvents.slice(-5).map(e => `[${e.type}] ${JSON.stringify(e.data)}`).join("\n")}

Combat actions: attack, cast_spell, use_item, dodge, dash, hide, help, pass

Return JSON only.`,
    user: `It's your turn! What do you do?
{
  "action": "attack|cast_spell|use_item|dodge|dash|hide|help|pass",
  "params": { "targetId": "...", "weapon": "...", "spellName": "...", "itemName": "..." },
  "roleplay": "brief in-character combat narration"
}`,
  };
}

// --- DM Combat Prompt (Monster Turn) ---

export function buildDMCombatPrompt(options: {
  monster: { name: string; id: string; hpCurrent: number; hpMax: number; ac: number; attacks: unknown[] };
  battlefield: Record<string, unknown>;
  partyPositions: Array<{ id: string; name: string; class: string; hpCurrent: number; hpMax: number; ac: number }>;
}): { system: string; user: string } {
  const targets = options.partyPositions
    .filter(p => p.hpCurrent > 0)
    .map(p => `${p.name} (${p.class}): ${p.hpCurrent}/${p.hpMax} HP, AC ${p.ac} [id: ${p.id}]`);

  return {
    system: `You control ${options.monster.name} in combat.

MONSTER: ${options.monster.name}
- HP: ${options.monster.hpCurrent}/${options.monster.hpMax}, AC: ${options.monster.ac}
- Attacks: ${JSON.stringify(options.monster.attacks)}

TARGETS (living party members):
${targets.join("\n")}

Pick a target. Consider tactical logic — wounded healers are high-value targets. Low-AC characters are easy hits. But monsters aren't always optimal — they have instincts too.

Return JSON only.`,
    user: `Choose the monster's action:
{
  "action": "monster_attack",
  "params": { "monsterId": "${options.monster.id}", "targetId": "target's id" },
  "narration": "brief combat narration for this attack"
}`,
  };
}

// --- DM Combat Narration Prompt ---

export function buildDMCombatNarrationPrompt(options: {
  actionResult: GameEvent;
  style: string;
  tension: "low" | "medium" | "high" | "climax";
}): { system: string; user: string } {
  const tensionGuide = {
    low: "Keep it brief and matter-of-fact.",
    medium: "Add some drama and weight.",
    high: "This is a crucial moment — make it intense.",
    climax: "This could decide everything — maximum drama.",
  };

  return {
    system: `You are narrating combat. Style: ${options.style}.
Tension level: ${options.tension}. ${tensionGuide[options.tension]}

What just happened:
${JSON.stringify(options.actionResult.data, null, 2)}

Write 1-2 sentences of dramatic combat narration. No mechanics — pure storytelling.`,
    user: `Narrate this combat moment. Return just the narration text as a JSON object:
{
  "narration": "your dramatic narration here"
}`,
  };
}

// --- Valid action sets ---

export const PLAYER_EXPLORATION_ACTIONS = [
  "attack", "cast_spell", "use_item", "dodge", "dash", "hide", "help",
  "explore", "search", "talk_to_npc", "party_chat", "journal_add", "rest", "pass",
];

export const PLAYER_COMBAT_ACTIONS = [
  "attack", "cast_spell", "use_item", "dodge", "dash", "hide", "help", "pass",
];

export const DM_ACTIONS = [
  "narrate", "trigger_encounter", "monster_attack", "advance_scene",
  "voice_npc", "deal_environment_damage", "award_xp", "request_check", "end_session",
];

export const DM_STYLES = [
  "dramatic — rich narration, strong NPC voices, emotional weight",
  "brutal — high lethality, tactical, consequences are final",
  "comedic — absurd NPCs, slapstick consequences, the danger is still real",
  "classic — balanced, traditional D&D tone",
];
