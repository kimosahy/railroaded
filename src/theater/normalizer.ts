import type { Emission, Tone, Pacing, Confidence, TonePreset, SceneType } from "./types.ts";
import { normalizeTrack, TONE_PRESETS } from "./types.ts";

const VALID_PACINGS: Pacing[] = ["rushed", "normal", "deliberate", "hesitant", "staccato"];
const VALID_SCENE_TYPES: SceneType[] = ["establishing", "beat", "insert", "reveal", "reaction", "mood-reskin"];

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

  // Clone scene to avoid mutating input (ATLAS-017 minor #1)
  let scene: Record<string, unknown> | undefined;
  if (raw.scene && typeof raw.scene === "object") {
    scene = { ...(raw.scene as Record<string, unknown>) };
    if (scene.type && !VALID_SCENE_TYPES.includes(scene.type as SceneType)) {
      warnings.push(`Unknown scene type "${scene.type}" — falling back to "beat"`);
      scene.type = "beat";
    }
  }

  // Build fresh normalized emission — never mutate raw (ATLAS-017 minor #1)
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
