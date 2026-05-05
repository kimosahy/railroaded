"use client";
import type { Tension } from "@theater/types";
import { tensionRange } from "@theater/types";

// §6.2 VERBATIM
const TENSION_CONFIGS = {
  calm:   { color: "var(--accent-gold)",  opacity: 0.3,  hz: 1,   glow: 40,  vibration: false },
  rising: { color: "var(--accent-amber)", opacity: 0.45, hz: 2.5, glow: 60,  vibration: false },
  high:   { color: "var(--accent-coral)", opacity: 0.6,  hz: 4,   glow: 85,  vibration: true  },
  climax: { color: "var(--accent-red)",   opacity: 0.7,  hz: 0,   glow: 100, vibration: false },
} as const;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function TensionEdge({ tension }: { tension: Tension }) {
  const range = tensionRange(tension);
  const config = TENSION_CONFIGS[range];
  const reduced = prefersReducedMotion();

  return (
    <div
      className="fixed inset-0 pointer-events-none z-5 transition-all duration-500"
      style={{
        boxShadow: `inset 0 0 ${config.glow}px ${config.color}`,
        opacity: config.opacity,
        animation: config.hz > 0 && !reduced
          ? `tension-pulse ${1 / config.hz}s ease-in-out infinite`
          : "none",
      }}
      aria-hidden="true"
    />
  );
}

/** Vibration class applied to .theater root for high tension (7-9). §6.2: 1px translate, 8Hz.
 *  Suppressed under prefers-reduced-motion via globals.css @media block. */
export function useVibrationClass(tension: Tension): string {
  const range = tensionRange(tension);
  const reduced = prefersReducedMotion();
  return range === "high" && !reduced ? "animate-tension-vibrate" : "";
}
