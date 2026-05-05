"use client";
import { useEffect, useState } from "react";
import type { NpcIntro } from "@theater/types";

/**
 * §7.6 Casting & spotlight.
 *
 * - FEATURED_SCALE / DIMMED_SCALE / DIMMED_BRIGHTNESS: cast strip values
 *   applied via cast-strip props (featuredCharacterId).
 * - NpcIntroCard: 280px from right, Bodoni 20px + Inter 13px italic, 3s hold
 * - exitTransform: 1.5s fade, scale 1.0→0.9 (consumed by cast-strip when
 *   exitingAgentId set)
 */

export const FEATURED_SCALE = 1.2;
export const DIMMED_SCALE = 0.8;
export const DIMMED_BRIGHTNESS = 0.7;
export const CAST_TRANSITION_MS = 600;
export const CAST_EXIT_MS = 1500;

export function NpcIntroCard({
  npc,
  onComplete,
}: {
  npc: NpcIntro;
  onComplete?: () => void;
}) {
  const [phase, setPhase] = useState<"in" | "hold" | "out" | "done">("in");

  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase("hold"), 50);
    const t2 = window.setTimeout(() => setPhase("out"), 3000);
    const t3 = window.setTimeout(() => {
      setPhase("done");
      onComplete?.();
    }, 3400);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [onComplete]);

  if (phase === "done") return null;

  const opacity = phase === "in" || phase === "out" ? 0 : 1;
  const transform = phase === "in" ? "translateX(20px)" : phase === "out" ? "translateX(20px)" : "translateX(0)";

  return (
    <div
      className="fixed top-1/3 right-0 z-30 pointer-events-none"
      style={{
        width: "280px",
        marginRight: "16px",
        backgroundColor: "var(--bg-frame)",
        border: "1px solid var(--border-faint)",
        borderRadius: 8,
        padding: "16px",
        opacity,
        transform,
        transition: "opacity 400ms ease-out, transform 400ms ease-out",
      }}
      role="status"
    >
      <div
        className="font-theater-heading text-[20px] mb-1"
        style={{ color: "var(--text-primary)" }}
      >
        {npc.name}
      </div>
      <div
        className="font-theater-ui italic text-[13px]"
        style={{ color: "var(--text-secondary)" }}
      >
        {npc.one_line}
      </div>
    </div>
  );
}
