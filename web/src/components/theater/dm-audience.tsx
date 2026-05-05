"use client";
import { useEffect, useState } from "react";
import type { RecapEntry } from "@theater/types";

/**
 * §9.4 DM audience attributes.
 *
 * - FourthWallRibbon: bottom ribbon during fourth-wall aside, duration =
 *   pacingMs * content.length + 2000 (AR rule 14).
 * - ConfessionalOverlay: 95% dim canvas; subject opacity stays 1.0,
 *   non-subjects 20% (driven via cast-strip prop).
 * - HiddenInfoSidebar: 320px panel persists until next emission.
 * - ForeshadowPip: 80×80 shimmer; expires after 5 emissions.
 * - RecapCard: image montage with 1200ms caption transitions, 30-60s total.
 */

export function FourthWallRibbon({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      className="fixed bottom-20 left-0 right-0 z-30 pointer-events-none flex justify-center"
      role="status"
    >
      <div
        className="font-theater-ui text-[12px] uppercase tracking-[0.18em] px-6 py-2 rounded-full"
        style={{
          backgroundColor: "rgba(212,175,55,0.12)",
          border: "1px solid var(--accent-gold)",
          color: "var(--accent-gold)",
        }}
      >
        breaking the fourth wall
      </div>
    </div>
  );
}

export function ConfessionalOverlay({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <div
      className="fixed inset-0 z-20 pointer-events-none transition-opacity duration-[400ms]"
      style={{ backgroundColor: "rgba(6,5,4,0.95)" }}
      aria-hidden="true"
    />
  );
}

export function HiddenInfoSidebar({ info }: { info: string | null }) {
  if (!info) return null;
  return (
    <aside
      className="fixed top-1/4 right-0 z-25 pointer-events-none"
      style={{
        width: "320px",
        marginRight: "12px",
        backgroundColor: "var(--bg-frame)",
        border: "1px solid var(--border-faint)",
        borderRadius: 6,
        padding: "14px 16px",
      }}
      aria-label="Hidden information"
    >
      <div
        className="font-theater-ui uppercase text-[10.5px] tracking-[0.22em] mb-2"
        style={{ color: "var(--accent-amber)" }}
      >
        Audience-only
      </div>
      <div
        className="font-theater-prose text-[13px]"
        style={{ color: "var(--text-primary)" }}
      >
        {info}
      </div>
    </aside>
  );
}

export function ForeshadowPip({ text, remaining }: { text: string; remaining: number }) {
  if (!text || remaining <= 0) return null;
  return (
    <div
      className="fixed bottom-28 right-6 z-25 pointer-events-none animate-foreshadow-shimmer"
      style={{
        width: "80px",
        height: "80px",
        background: "radial-gradient(circle, rgba(212,175,55,0.35) 0%, rgba(212,175,55,0) 70%)",
        borderRadius: "50%",
      }}
      title={text}
      aria-label={`foreshadow: ${text}`}
    />
  );
}

export function RecapCard({
  entries,
  sceneImages,
  onComplete,
}: {
  entries: RecapEntry[];
  sceneImages: Map<string, string>;
  onComplete?: () => void;
}) {
  const [currentIdx, setCurrentIdx] = useState(0);

  useEffect(() => {
    if (entries.length === 0) {
      onComplete?.();
      return;
    }
    if (entries.length === 1) {
      const t = window.setTimeout(() => onComplete?.(), 6000);
      return () => window.clearTimeout(t);
    }
    // §9.4: 30-60s total montage; minimum 6s per entry.
    const perEntry = Math.max(6000, 60000 / entries.length);
    const interval = window.setInterval(() => {
      setCurrentIdx((prev) => {
        if (prev + 1 >= entries.length) {
          window.clearInterval(interval);
          window.setTimeout(() => onComplete?.(), perEntry);
          return prev;
        }
        return prev + 1;
      });
    }, perEntry);
    return () => window.clearInterval(interval);
  }, [entries.length, onComplete]);

  if (entries.length === 0) return null;
  const entry = entries[currentIdx];
  const imageUrl = sceneImages.get(entry.turn_id);

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center"
      style={{ backgroundColor: "rgba(6,5,4,0.92)" }}
    >
      {imageUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          key={`img-${currentIdx}`}
          src={imageUrl}
          alt=""
          className="w-full h-[60vh] object-cover transition-opacity duration-[1200ms]"
        />
      )}
      <p
        key={`cap-${currentIdx}`}
        className="font-theater-heading text-[16px] italic mt-4 max-w-prose text-center px-6 transition-opacity duration-[1200ms]"
        style={{ color: "var(--text-primary)" }}
      >
        {entry.caption}
      </p>
    </div>
  );
}

/** Compute fourth-wall ribbon duration from emission. AR rule 14:
 *  pacingMs * content.length + 2000. */
export const PACING_SPEEDS: Record<string, number> = {
  rushed: 22,
  normal: 35,
  deliberate: 48,
  hesitant: 60,
  staccato: 38,
};

export function fourthWallDurationMs(
  contentLength: number,
  pacing: string | null | undefined
): number {
  const pacingMs = (pacing && PACING_SPEEDS[pacing]) ?? PACING_SPEEDS.normal;
  return pacingMs * contentLength + 2000;
}
