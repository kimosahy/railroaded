// Pure helper: builds a raw §14.1 emission envelope from handler params + context.
// Caller feeds the result into normalizeEmission() to get the validated Emission.
//
// Server-authoritative fields (schema, emission_id, session_id, agent_id, agent_role,
// turn_id, timestamp, content) are always set by the server — never trusted from params.
// track is agent-overridable but defaults to the handler's expected default.

import type { EmissionTrack } from "./types.ts";

export interface BuildEmissionContext {
  sessionId: string;
  agentId: string;
  agentRole: "player" | "dm";
  defaultTrack: EmissionTrack;
  /** Pre-resolved content string (handler picks message/text/dialogue/etc.). */
  content: string;
  /** Override for tools that derive address_target server-side (voice_npc). */
  addressTarget?: string | null;
}

// §14.2 player extension fields — passthrough whitelist.
const PLAYER_PASSTHROUGH = [
  "tone", "pacing", "address", "address_target", "confidence",
  "posture", "interrupting", "mood", "body_state",
  "relationships", "dice_intent", "memory_recall",
] as const;

// DM-only extension fields (§11/§12) — passthrough whitelist for agent_role: "dm".
const DM_PASSTHROUGH = [
  "scene", "tension", "lighting", "act", "beat_type",
  "time_skip", "scene_cut", "featured_character",
  "audience_aside", "hidden_information", "foreshadow",
] as const;

export function buildEmission(
  params: Record<string, unknown>,
  context: BuildEmissionContext,
): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    schema: "railroaded.theater.emission.v1",
    emission_id: crypto.randomUUID(),
    session_id: context.sessionId,
    agent_id: context.agentId,
    agent_role: context.agentRole,
    turn_id: crypto.randomUUID(),
    in_response_to: (params.in_response_to as string | null | undefined) ?? null,
    timestamp: new Date().toISOString(),
    track: (params.track as string | undefined) ?? context.defaultTrack,
    content: context.content,
  };

  for (const k of PLAYER_PASSTHROUGH) {
    if (params[k] !== undefined) raw[k] = params[k];
  }
  if (context.agentRole === "dm") {
    for (const k of DM_PASSTHROUGH) {
      if (params[k] !== undefined) raw[k] = params[k];
    }
  }

  // voice_npc derives address_target from the NPC's resolved name.
  if (context.addressTarget !== undefined) {
    raw.address_target = context.addressTarget;
  }

  // C4 migration (one release): promote legacy metadata.{mood,lighting} to top-level
  // §14 fields if the agent didn't set them explicitly. Top-level wins on collision.
  // metadata.location stays in metadata (no §14 location field).
  // Skill files stop recommending the legacy slots; deprecation in a follow-up.
  const metadata = params.metadata;
  if (metadata && typeof metadata === "object") {
    const m = metadata as Record<string, unknown>;
    if (m.mood !== undefined && raw.mood === undefined) raw.mood = m.mood;
    if (m.lighting !== undefined && raw.lighting === undefined) raw.lighting = m.lighting;
  }

  return raw;
}
