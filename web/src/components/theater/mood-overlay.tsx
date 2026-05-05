"use client";
import type { Mood } from "@theater/types";

interface MoodTint {
  hueOverlay: string;
  hueOpacity: number;
  saturationDelta: number;   // CSS filter: saturate(1 + delta/100)
  contrastDelta?: number;    // CSS filter: contrast(1 + delta/100) — anger uses this
  vignette: "none" | "mild" | "strong" | "extreme" | "sharp" | "bottom-up";
  accentPreserve?: string[]; // Accent tokens to preserve through overlay — TODO: implement in CC Doc 10
}

// MF §3.5 VERBATIM — hex values and percentages from spec
const MOOD_TINTS: Record<string, MoodTint> = {
  fear:      { hueOverlay: "#3a4870", hueOpacity: 0.14, saturationDelta: -20, vignette: "strong" },
  dread:     { hueOverlay: "#1a0e10", hueOpacity: 0.22, saturationDelta: -40, vignette: "extreme", accentPreserve: ["--accent-gold", "--accent-red"] },
  joy:       { hueOverlay: "#f0c878", hueOpacity: 0.10, saturationDelta: 15, vignette: "none" },
  curiosity: { hueOverlay: "#3aa8b8", hueOpacity: 0.08, saturationDelta: 0, vignette: "mild" },
  anger:     { hueOverlay: "#a32d2d", hueOpacity: 0.12, saturationDelta: 0, contrastDelta: 20, vignette: "sharp" },
  grief:     { hueOverlay: "#5a6878", hueOpacity: 0.16, saturationDelta: -30, vignette: "mild" },
  awe:       { hueOverlay: "#6048a0", hueOpacity: 0.12, saturationDelta: 10, vignette: "bottom-up" },
};

/** Convert saturation delta to CSS filter value. -20 → saturate(0.8), +15 → saturate(1.15) */
function saturationFilter(delta: number): string {
  return `saturate(${1 + delta / 100})`;
}

/** Vignette as radial gradient overlay. */
function vignetteGradient(type: MoodTint["vignette"]): string {
  switch (type) {
    case "none": return "none";
    case "mild": return "radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.25) 100%)";
    case "strong": return "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.45) 100%)";
    case "extreme": return "radial-gradient(ellipse at center, transparent 20%, rgba(0,0,0,0.65) 100%)";
    case "sharp": return "radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.35) 100%)";
    case "bottom-up": return "linear-gradient(to top, rgba(96,72,160,0.15) 0%, transparent 60%)";
  }
}

export function MoodOverlay({ mood }: { mood: Mood }) {
  const tint = mood ? MOOD_TINTS[mood] : null;
  if (!tint) return null;

  const filterParts: string[] = [];
  if (tint.saturationDelta !== 0) filterParts.push(saturationFilter(tint.saturationDelta));
  if (tint.contrastDelta) filterParts.push(`contrast(${1 + tint.contrastDelta / 100})`);
  const backdropFilterValue = filterParts.length > 0 ? filterParts.join(" ") : "none";

  return (
    <>
      {/* Layer 1: Hue overlay */}
      <div
        className="fixed inset-0 pointer-events-none z-10 transition-all duration-[800ms]"
        style={{ backgroundColor: tint.hueOverlay, opacity: tint.hueOpacity }}
        aria-hidden="true"
      />
      {/* Layer 2: Saturation + contrast filter on content */}
      {backdropFilterValue !== "none" && (
        <div
          className="fixed inset-0 pointer-events-none z-9 transition-all duration-[800ms]"
          style={{ backdropFilter: backdropFilterValue }}
          aria-hidden="true"
        />
      )}
      {/* Layer 3: Vignette */}
      {tint.vignette !== "none" && (
        <div
          className="fixed inset-0 pointer-events-none z-11 transition-all duration-[800ms]"
          style={{ background: vignetteGradient(tint.vignette) }}
          aria-hidden="true"
        />
      )}
    </>
  );
}

/** Exposed for unit testing. Do not import from app code — use <MoodOverlay /> instead. */
export const __MOOD_TINTS_INTERNAL = MOOD_TINTS;
