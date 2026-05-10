// Field whitelists used by the MCP and REST dispatchers when forwarding
// agent params to the Theater-aware handlers in game-manager.ts.
//
// Why a separate file from src/theater/tool-schema.ts?
// - tool-schema.ts is JSON-schema fragments for the MCP boundary — declarative,
//   fed to the agent runtime to advertise what fields a tool accepts.
// - _dispatcher-whitelists.ts is runtime field-name Set<string>s for filtering
//   parsed JSON — imperative, used at the dispatcher layer to drop anything
//   we don't recognize before handing the params to the handler.
//
// Defense-in-depth: we don't trust upstream schema validation alone. If an
// agent (or a malformed body) sneaks an unknown field past the MCP framework
// or REST body parsing, pick() drops it before the handler sees it.
//
// Field unions = legacy fields + Theater fields per tool. Keep in sync with
// THEATER_PLAYER_FIELDS / THEATER_DM_FIELDS in src/theater/tool-schema.ts and
// the typed handler params in src/game/game-manager.ts.

export const PARTY_CHAT_FIELDS: ReadonlySet<string> = new Set([
  "message",
  "track", "tone", "pacing", "address", "address_target",
  "confidence", "posture", "interrupting", "mood", "body_state",
  "relationships", "dice_intent", "memory_recall", "in_response_to", "meta",
]);

export const WHISPER_FIELDS: ReadonlySet<string> = new Set([
  "player_id", "target_id", "targetId", "target", "message",
  "track", "tone", "pacing", "address", "address_target",
  "confidence", "posture", "interrupting", "mood", "body_state",
  "relationships", "dice_intent", "memory_recall", "in_response_to", "meta",
]);

export const NARRATE_FIELDS: ReadonlySet<string> = new Set([
  "text", "message", "style", "type", "npcId", "npc_id", "metadata", "meta",
  "track", "tone", "pacing", "scene", "tension", "lighting", "act", "beat_type",
  "time_skip", "scene_cut", "featured_character",
  "audience_aside", "hidden_information", "foreshadow",
  "address", "address_target", "mood", "in_response_to",
  // Per skills §15.14: dice_intent and memory_recall are valid for DMs too.
  "dice_intent", "memory_recall",
]);

export const NARRATE_TO_FIELDS: ReadonlySet<string> = new Set([
  "player_id", "text",
  "track", "tone", "pacing", "scene", "tension", "lighting", "act", "beat_type",
  "time_skip", "scene_cut", "featured_character",
  "audience_aside", "hidden_information", "foreshadow",
  "address", "address_target", "mood", "in_response_to",
  // Per skills §15.11+§15.14: memory_recall (callback cards) and dice_intent
  // are valid for private DM narration too.
  "dice_intent", "memory_recall",
]);

export const VOICE_NPC_FIELDS: ReadonlySet<string> = new Set([
  "npc_id", "name", "dialogue", "message",
  "track", "tone", "pacing", "address", "address_target",
  "confidence", "posture", "mood", "in_response_to",
]);

/** Returns a new object containing only the keys of `args` that are in `allowed`. */
export function pick(args: Record<string, unknown>, allowed: ReadonlySet<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(args)) {
    if (allowed.has(k)) out[k] = args[k];
  }
  return out;
}
