"use client";
import type { Emission } from "@theater/types";
import { TrackBaseline, TRACK_BASELINES } from "./track-baseline";
import { ToneRenderer, getToneStyle, HEDGE_PHRASES, hasDeclarative } from "./tone-renderer";
import { PacingReveal } from "./pacing-engine";
import { AddressWrapper, getAddressConfig } from "./address-renderer";

/** Tone-specific pacing multipliers per MF §4.1. growl = "slow reveal, 1.4× pacing." */
const PACE_SCALE: Partial<Record<string, number>> = { growl: 1.4 };

/** §4.5 low confidence: italicize hedge phrases at 70% opacity. */
function applyHedgeItalics(text: string): React.ReactNode {
  if (!text) return text;
  // Build regex matching any hedge phrase (case-insensitive, word boundaries).
  const pattern = new RegExp(`\\b(${HEDGE_PHRASES.map(p => p.replace(/ /g, "\\s+")).join("|")})\\b`, "gi");
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIdx) {
      parts.push(text.slice(lastIdx, match.index));
    }
    parts.push(
      <em key={`hedge-${i++}`} style={{ fontStyle: "italic", opacity: 0.7 }}>
        {match[0]}
      </em>
    );
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) {
    parts.push(text.slice(lastIdx));
  }
  return parts.length ? <>{parts}</> : text;
}

export function EmissionText({ emission, onComplete }: { emission: Emission; onComplete?: () => void }) {
  const baseline = TRACK_BASELINES[emission.track];
  const paceScale: number = (emission.tone ? PACE_SCALE[emission.tone] : undefined) ?? 1;

  // AR rule 5: compose final fontSize upfront.
  const toneStyle = getToneStyle(emission.tone ?? null);
  const addressConfig = getAddressConfig(emission.address ?? null);
  const resolvedSize = baseline.sizeRem * toneStyle.sizeMultiplier * addressConfig.sizeMultiplier;

  // §4.5 confidence visual treatment.
  const confidence = emission.confidence ?? null;
  // High + no declarative → bold whole emission (override via wrapper).
  const boldWhole = confidence === "high" && !hasDeclarative(emission.content);

  // PacingReveal renders the typewriter animation. For static rendering with
  // hedge italics we need the text directly — but PacingReveal owns reveal pacing.
  // §4.5 hedge italics only apply when confidence === "low".
  // Strategy: pass already-marked-up text via onComplete... but PacingReveal handles
  // a string. Simpler: for low confidence, render content directly with hedges;
  // skip PacingReveal char-by-char animation in this case.
  const useHedgeMarkup = confidence === "low";

  return (
    <TrackBaseline track={emission.track}>
      <AddressWrapper
        address={emission.address ?? null}
        addressTarget={emission.address_target ?? null}
      >
        <ToneRenderer
          tone={emission.tone ?? null}
          baseSize={resolvedSize}
          confidence={confidence}
        >
          {useHedgeMarkup ? (
            <span style={boldWhole ? { fontWeight: 700 } : undefined}>
              {applyHedgeItalics(emission.content)}
            </span>
          ) : boldWhole ? (
            <span style={{ fontWeight: 700 }}>
              <PacingReveal
                text={emission.content}
                pacing={emission.pacing ?? null}
                paceScale={paceScale}
                onComplete={onComplete}
              />
            </span>
          ) : (
            <PacingReveal
              text={emission.content}
              pacing={emission.pacing ?? null}
              paceScale={paceScale}
              onComplete={onComplete}
            />
          )}
        </ToneRenderer>
      </AddressWrapper>
    </TrackBaseline>
  );
}

/** Exposed for unit testing — do not import from app code. */
export const __PACE_SCALE_INTERNAL = PACE_SCALE;
