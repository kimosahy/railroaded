// Source: Mercury THEATER_V1_SPEC.md v2.3 §14 (producer)
// Render rules: MF-040 §4-§8

export type EmissionTrack = "action" | "dialogue" | "thought" | "narration" | "internal_monologue";

export function normalizeTrack(track: string): EmissionTrack {
  if (track === "monologue") return "internal_monologue";
  const valid: EmissionTrack[] = ["action", "dialogue", "thought", "narration", "internal_monologue"];
  return valid.includes(track as EmissionTrack) ? (track as EmissionTrack) : "dialogue";
}

export type TonePreset = "whisper" | "mutter" | "normal" | "excited" | "yell" | "shout"
  | "growl" | "sigh" | "giggle" | "monotone" | "raspy";
export type Tone = TonePreset | string | null;
export type Pacing = "rushed" | "normal" | "deliberate" | "hesitant" | "staccato" | null;
export type AddressMode = "to-self" | "aside" | "to-party" | "to-NPC" | null;
export type Confidence = "low" | "neutral" | "high" | null;
export type BodyState = "wounded" | "exhausted" | "hidden" | "alert" | "unconscious" | "transformed" | null;
export type Posture = "standing-tall" | "crouching" | "backed-against-wall" | "prone" | null;
export type Mood = "fear" | "dread" | "joy" | "curiosity" | "anger" | "grief" | "awe" | string | null;
export type Tension = number; // 0-10
export type Lighting = "torchlit" | "dawn" | "midnight" | "magical" | "underwater" | string | null;
export type SceneType = "establishing" | "beat" | "insert" | "reveal" | "reaction" | "mood-reskin";
export type SceneCut = "hard" | "cross-fade" | "match-cut" | "whip-pan" | null;
export type BeatType = "exposition" | "rising" | "climax" | "denouement" | null;
export type Act = "I" | "II" | "III" | "intermission" | "climax" | string | null;
export type AudienceAsideKind = "fourth-wall" | "confessional";
export type RelationshipState = "close-ally" | "adversary" | "distrust" | "unknown";
export type ViewerRole = "player" | "dm" | "audience";

export interface Relationship { target: string; state: RelationshipState; }
export interface DiceIntent { die: "d4"|"d6"|"d8"|"d10"|"d12"|"d20"|"d100"; for: string; modifier: number|null; dc: number|null; }
export interface MemoryRecall { turn_id: string; caption: string; }
export interface NpcIntro { name: string; one_line: string; portrait_prompt: string; }
export interface AudienceAside { kind: AudienceAsideKind; subject_agent_id: string; }
export interface RecapEntry { turn_id: string; caption: string; }

export interface SceneData {
  type: SceneType;
  image_prompt: string;
  style_tokens_inherited: boolean;
  avatar_refs: string[];
  location_id: string | null;
  regenerate_from: string | null;
  pause_stream?: boolean;
}

export interface EmissionEnvelope {
  schema: string; emission_id: string; session_id: string;
  agent_id: string; agent_role: "player" | "dm";
  turn_id: string; in_response_to: string | null;
  timestamp: string; track: EmissionTrack; content: string;
}

export interface PlayerEmissionFields {
  tone?: Tone; pacing?: Pacing; address?: AddressMode;
  address_target?: string | null; confidence?: Confidence;
  posture?: Posture; interrupting?: string | null;
  mood?: Mood; body_state?: BodyState;
  relationships?: Relationship[]; dice_intent?: DiceIntent;
  memory_recall?: MemoryRecall;
}

export interface DmEmissionFields {
  scene?: SceneData; tension?: Tension; lighting?: Lighting;
  act?: Act; beat_type?: BeatType; time_skip?: string | null;
  scene_cut?: SceneCut; featured_character?: string | null;
  npc_intro?: NpcIntro; exit?: string | null;
  audience_aside?: AudienceAside; hidden_information?: string | null;
  foreshadow?: string | null; recap_card?: RecapEntry[];
}

export type Emission = EmissionEnvelope & PlayerEmissionFields & DmEmissionFields & {
  [key: string]: unknown; // Forward-compat §14.6
};

export interface EmissionUpdate { emission_id: string; [key: string]: unknown; }

export interface SessionSetup {
  schema: string; session_id: string; title: string;
  episode: { season: number; episode: number };
  genre: string; art_tone: string;
  world_params: Record<string, string>;
  style_lock: { prompt_suffix: string; negative_prompt: string; aspect: "16:9"|"9:16"|"1:1"; model: string; };
  agents: Array<{
    agent_id: string; role: "player"|"dm"; model: string;
    character_name: string|null; class: string|null;
    avatar_passport: { image_url: string; seed: number; reference_prompt: string; } | null;
  }>;
}

export interface SeatChoice {
  schema: string; viewer_id: string; session_id: string;
  timestamp: string; seat: "follow"|"wide"|"default"; follow_target: string|null;
}

/** Tension ranges per MF §6.2 VERBATIM. 0-3 calm, 4-6 rising, 7-9 high, 10 climax. */
export function tensionRange(t: Tension): "calm" | "rising" | "high" | "climax" {
  if (t <= 3) return "calm";
  if (t <= 6) return "rising";
  if (t <= 9) return "high";
  return "climax";
}

/** Known tone presets for parser bare-tag detection. */
export const TONE_PRESETS: readonly TonePreset[] = [
  "whisper", "mutter", "normal", "excited", "yell", "shout",
  "growl", "sigh", "giggle", "monotone", "raspy",
] as const;
