"use client";
import type { Emission } from "@theater/types";
import { TrackBaseline, TRACK_BASELINES } from "./track-baseline";
import { ToneRenderer } from "./tone-renderer";
import { PacingReveal } from "./pacing-engine";

/** Tone-specific pacing multipliers per MF §4.1. growl = "slow reveal, 1.4× pacing." */
const PACE_SCALE: Partial<Record<string, number>> = { growl: 1.4 };

export function EmissionText({ emission, onComplete }: { emission: Emission; onComplete?: () => void }) {
  const baseline = TRACK_BASELINES[emission.track];
  const paceScale: number = (emission.tone ? PACE_SCALE[emission.tone] : undefined) ?? 1;

  return (
    <TrackBaseline track={emission.track}>
      <ToneRenderer tone={emission.tone ?? null} baseSize={baseline.sizeRem}>
        <PacingReveal
          text={emission.content}
          pacing={emission.pacing ?? null}
          paceScale={paceScale}
          onComplete={onComplete}
        />
      </ToneRenderer>
    </TrackBaseline>
  );
}

/** Exposed for unit testing — do not import from app code. */
export const __PACE_SCALE_INTERNAL = PACE_SCALE;
