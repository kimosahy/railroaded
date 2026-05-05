"use client";
import type { Emission } from "@theater/types";
import { TrackBaseline, TRACK_BASELINES } from "./track-baseline";
import { ToneRenderer, getToneStyle } from "./tone-renderer";
import { PacingReveal } from "./pacing-engine";
import { AddressWrapper, getAddressConfig } from "./address-renderer";

/** Tone-specific pacing multipliers per MF §4.1. growl = "slow reveal, 1.4× pacing." */
const PACE_SCALE: Partial<Record<string, number>> = { growl: 1.4 };

export function EmissionText({ emission, onComplete }: { emission: Emission; onComplete?: () => void }) {
  const baseline = TRACK_BASELINES[emission.track];
  const paceScale: number = (emission.tone ? PACE_SCALE[emission.tone] : undefined) ?? 1;

  // AR rule 5: compose final fontSize upfront. AddressRenderer wraps for
  // indent/parens/name-tag-arrow ONLY — does NOT set fontSize.
  // Rem doesn't compound with parent percentage, so combine here.
  const toneStyle = getToneStyle(emission.tone ?? null);
  const addressConfig = getAddressConfig(emission.address ?? null);
  const resolvedSize = baseline.sizeRem * toneStyle.sizeMultiplier * addressConfig.sizeMultiplier;

  return (
    <TrackBaseline track={emission.track}>
      <AddressWrapper
        address={emission.address ?? null}
        addressTarget={emission.address_target ?? null}
      >
        <ToneRenderer tone={emission.tone ?? null} baseSize={resolvedSize}>
          <PacingReveal
            text={emission.content}
            pacing={emission.pacing ?? null}
            paceScale={paceScale}
            onComplete={onComplete}
          />
        </ToneRenderer>
      </AddressWrapper>
    </TrackBaseline>
  );
}

/** Exposed for unit testing — do not import from app code. */
export const __PACE_SCALE_INTERNAL = PACE_SCALE;
