// Track baselines per MF §3.1 VERBATIM
import type { EmissionTrack } from "@theater/types";

interface TrackStyle {
  fontClass: string;
  sizeRem: number;   // base size in rem (14px = 0.875rem, 16px = 1rem, 18px = 1.125rem)
  weight: number;
  italic: boolean;
  opacity: number;
  letterSpacing?: string;
}

// MF §3.1 table — exact values
export const TRACK_BASELINES: Record<EmissionTrack, TrackStyle> = {
  action:             { fontClass: "font-theater-prose", sizeRem: 0.875,  weight: 400, italic: true,  opacity: 1.0 },
  dialogue:           { fontClass: "font-theater-ui",    sizeRem: 1.125,  weight: 400, italic: false, opacity: 1.0 },
  thought:            { fontClass: "font-theater-ui",    sizeRem: 0.875,  weight: 400, italic: true,  opacity: 0.5 },
  narration:          { fontClass: "font-theater-heading", sizeRem: 1.0,  weight: 400, italic: false, opacity: 0.9 },
  internal_monologue: { fontClass: "font-theater-ui",    sizeRem: 0.8125, weight: 400, italic: true,  opacity: 0.7 },
};

export function TrackBaseline({ track, children }: { track: EmissionTrack; children: React.ReactNode }) {
  const style = TRACK_BASELINES[track];
  return (
    <div
      className={style.fontClass}
      style={{
        fontSize: `${style.sizeRem}rem`,
        fontWeight: style.weight,
        fontStyle: style.italic ? "italic" : "normal",
        opacity: style.opacity,
        letterSpacing: style.letterSpacing,
      }}
    >
      {children}
    </div>
  );
}
