import type { Emission, Tone, Pacing, Confidence, TonePreset, SceneType } from "./types.ts";
import { normalizeTrack, TONE_PRESETS } from "./types.ts";

// §12.2 vocabulary validation enums.
const VALID_PACINGS: readonly string[] = ["rushed", "normal", "deliberate", "hesitant", "staccato"];
const VALID_SCENE_TYPES: readonly string[] = ["establishing", "beat", "insert", "reveal", "reaction", "mood-reskin"];
const VALID_ADDRESSES: readonly string[] = ["to-self", "aside", "to-party", "to-NPC"];
const VALID_CONFIDENCES: readonly string[] = ["low", "neutral", "high"];
const VALID_POSTURES: readonly string[] = ["standing-tall", "crouching", "backed-against-wall", "prone"];
const VALID_BODY_STATES: readonly string[] = ["wounded", "exhausted", "hidden", "alert", "unconscious", "transformed"];
const VALID_MOODS: readonly string[] = ["fear", "dread", "joy", "curiosity", "anger", "grief", "awe"];
const VALID_LIGHTINGS: readonly string[] = ["torchlit", "dawn", "midnight", "magical", "underwater"];
const VALID_SCENE_CUTS: readonly string[] = ["hard", "cross-fade", "match-cut", "whip-pan"];
const VALID_BEAT_TYPES: readonly string[] = ["exposition", "rising", "climax", "denouement"];
const VALID_ACTS: readonly string[] = ["I", "II", "III", "intermission", "climax"];
const VALID_ADDRESS_MODES: readonly string[] = ["to-self", "aside", "to-party", "to-NPC"];
const VALID_RELATIONSHIP_STATES: readonly string[] = ["close-ally", "adversary", "distrust", "unknown"];

// §12.2 / AR rule 10: ALL 14 enum types covered via ENUM_VALIDATORS array.
// Encapsulated behind getVocabularyQueue() / clearVocabularyQueue() — no
// module-level mutable state exposed (ATLAS-024 FIF-6).
const ENUM_VALIDATORS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["tone", TONE_PRESETS],
  ["pacing", VALID_PACINGS],
  ["address", VALID_ADDRESSES],
  ["confidence", VALID_CONFIDENCES],
  ["posture", VALID_POSTURES],
  ["body_state", VALID_BODY_STATES],
  ["mood", VALID_MOODS],
  ["lighting", VALID_LIGHTINGS],
  ["scene_cut", VALID_SCENE_CUTS],
  ["beat_type", VALID_BEAT_TYPES],
  ["act", VALID_ACTS],
  ["scene_type", VALID_SCENE_TYPES],
  ["address_mode", VALID_ADDRESS_MODES],
  ["relationship_state", VALID_RELATIONSHIP_STATES],
];

interface VocabEntry {
  attribute: string;
  value: string;
  agentId: string;
  count: number;
}

const vocabularyQueue: VocabEntry[] = [];

export function logUnrecognizedValue(attribute: string, value: string, agentId: string): void {
  const existing = vocabularyQueue.find(v => v.attribute === attribute && v.value === value);
  if (existing) {
    existing.count++;
  } else {
    vocabularyQueue.push({ attribute, value, agentId, count: 1 });
  }
}

export function getVocabularyQueue(): readonly VocabEntry[] {
  return [...vocabularyQueue];
}

export function clearVocabularyQueue(): void {
  vocabularyQueue.length = 0;
}

export function normalizeEmission(raw: Record<string, unknown>): {
  emission: Emission;
  warnings: string[];
} {
  const warnings: string[] = [];

  const track = normalizeTrack((raw.track as string) ?? "dialogue");

  const tone = (raw.tone as Tone) ?? null;
  if (tone && !TONE_PRESETS.includes(tone as TonePreset)) {
    warnings.push(`Custom tone "${tone}" — will render with default styling`);
  }

  let pacing = (raw.pacing as Pacing) ?? null;
  if (pacing && !VALID_PACINGS.includes(pacing)) {
    warnings.push(`Unknown pacing "${pacing}" — defaulting to "normal"`);
    pacing = "normal";
  }

  let tension = (raw.tension as number) ?? undefined;
  if (tension !== undefined) {
    tension = Math.max(0, Math.min(10, Math.round(tension)));
  }

  let scene: Record<string, unknown> | undefined;
  if (raw.scene && typeof raw.scene === "object") {
    scene = { ...(raw.scene as Record<string, unknown>) };
    if (scene.type && !VALID_SCENE_TYPES.includes(scene.type as string)) {
      warnings.push(`Unknown scene type "${scene.type}" — falling back to "beat"`);
      scene.type = "beat";
    }
  }

  // §12.2 vocabulary logging — ALL 14 enums (AR rule 10).
  // Loop after primary validation so corrected values aren't logged twice.
  const agentId = (raw.agent_id as string) ?? "unknown";
  for (const [attr, validValues] of ENUM_VALIDATORS) {
    const val = raw[attr];
    if (val && typeof val === "string" && !validValues.includes(val)) {
      logUnrecognizedValue(attr, val, agentId);
    }
  }
  // scene.type is nested — log separately if invalid.
  if (raw.scene && typeof raw.scene === "object") {
    const sceneType = (raw.scene as Record<string, unknown>).type;
    if (sceneType && typeof sceneType === "string" && !VALID_SCENE_TYPES.includes(sceneType)) {
      logUnrecognizedValue("scene_type", sceneType, agentId);
    }
  }
  // relationships array — each entry's state.
  if (Array.isArray(raw.relationships)) {
    for (const rel of raw.relationships) {
      if (rel && typeof rel === "object") {
        const state = (rel as Record<string, unknown>).state;
        if (state && typeof state === "string" && !VALID_RELATIONSHIP_STATES.includes(state)) {
          logUnrecognizedValue("relationship_state", state, agentId);
        }
      }
    }
  }

  // Build fresh normalized emission — never mutate raw.
  const emission: Emission = {
    ...raw,
    track, tone, pacing, tension,
    ...(scene ? { scene } : {}),
    content: (raw.content as string) ?? "",
    schema: (raw.schema as string) ?? "railroaded.theater.emission.v1",
    emission_id: (raw.emission_id as string) ?? crypto.randomUUID(),
    session_id: (raw.session_id as string) ?? "",
    agent_id: (raw.agent_id as string) ?? "",
    agent_role: (raw.agent_role as "player" | "dm") ?? "player",
    turn_id: (raw.turn_id as string) ?? "",
    in_response_to: (raw.in_response_to as string) ?? null,
    timestamp: (raw.timestamp as string) ?? new Date().toISOString(),
  } as Emission;

  return { emission, warnings };
}

export function applySpanOverrides(base: Emission, overrides: Partial<Emission>): Emission {
  return { ...base, ...overrides };
}

export const FALLBACK_DEFAULTS = {
  tone: "normal" as Tone,
  pacing: "normal" as Pacing,
  confidence: "neutral" as Confidence,
  address: null,
  mood: null,
  tension: 3,
  lighting: null,
} as const;

/** Test-only export: list of validated enum names. */
export const __ENUM_VALIDATOR_NAMES__ = ENUM_VALIDATORS.map(([name]) => name);
