"use client";
import { useEffect, useState } from "react";
import type { Act, BeatType, SceneCut } from "@theater/types";

/**
 * §7.5 pacing & structure components.
 *
 * - ActInterstitial: Bodoni 36px uppercase 0.18em, 2.5s hold
 * - TimeSkipFrame: black frame, Bodoni 28px italic, 2s hold
 * - SceneCutTransition: hard / cross-fade / match-cut / whip-pan
 * - BEAT_TYPE_PACING: pacing-rate multiplier per beat_type
 *
 * AR rule 1: interval = BASE_INTER_EMISSION_MS / (speed * BEAT_TYPE_PACING).
 * NOT * BEAT_TYPE_PACING. exposition (0.85) → 706ms longest, climax (1.15) →
 * 522ms shortest.
 */

// §7.5 beat-type pacing rate. Higher = faster. interval = BASE / (speed * rate).
export const BEAT_TYPE_PACING: Record<NonNullable<BeatType>, number> = {
  exposition: 0.85,
  rising: 1.0,
  climax: 1.15,
  denouement: 0.75,
};

export function ActInterstitial({
  act,
  onComplete,
}: {
  act: Act;
  onComplete?: () => void;
}) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, 2500);
    return () => window.clearTimeout(t);
  }, [onComplete]);
  if (!visible || !act) return null;
  const label = typeof act === "string" ? act : "";
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center"
      style={{ backgroundColor: "rgba(6,5,4,0.92)" }}
      aria-live="polite"
    >
      <div
        className="font-theater-heading text-[36px] uppercase"
        style={{
          color: "var(--text-primary)",
          letterSpacing: "0.18em",
          fontWeight: 500,
        }}
      >
        {label.startsWith("Act") || label === "intermission" || label === "climax"
          ? label
          : `Act ${label}`}
      </div>
    </div>
  );
}

export function TimeSkipFrame({
  caption,
  onComplete,
}: {
  caption: string;
  onComplete?: () => void;
}) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => {
      setVisible(false);
      onComplete?.();
    }, 2000);
    return () => window.clearTimeout(t);
  }, [onComplete]);
  if (!visible) return null;
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center"
      style={{ backgroundColor: "#000" }}
      aria-live="polite"
    >
      <div
        className="font-theater-heading italic text-[28px]"
        style={{ color: "var(--text-secondary)" }}
      >
        {caption}
      </div>
    </div>
  );
}

/** §7.5 scene cut transition wrapper. */
export function SceneCutWrapper({
  cut,
  children,
}: {
  cut: SceneCut;
  children: React.ReactNode;
}) {
  let cls = "";
  switch (cut) {
    case "hard":       cls = ""; break;                            // instant
    case "cross-fade": cls = "animate-cross-fade-200";  break;     // 200ms
    case "match-cut":  cls = "animate-match-cut";       break;     // 1.2s ease
    case "whip-pan":   cls = "animate-whip-pan";        break;     // 150ms blur
    default:           cls = "";
  }
  return <div className={cls}>{children}</div>;
}
