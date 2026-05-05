"use client";
import { useEffect, useState } from "react";

/**
 * §9.2 Seat Choice — audience picks a viewing seat.
 *
 * - "follow": camera follows a featured character
 * - "wide": neutral, full ensemble view
 * - "default": session-default seat
 *
 * Sticky per-session via localStorage.
 * Labels: 12px font-medium uppercase 0.12em per §3.2 audience control labels.
 */

export type Seat = "follow" | "wide" | "default";

const SEAT_LABELS: Record<Seat, string> = {
  follow: "Follow",
  wide: "Wide",
  default: "Default",
};

export function SeatChoice({
  sessionId,
  followTarget,
  onChange,
}: {
  sessionId: string;
  followTarget?: string | null;
  onChange?: (seat: Seat, followTarget: string | null) => void;
}) {
  const storageKey = `railroaded-seat-${sessionId}`;
  const [seat, setSeat] = useState<Seat>("default");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(storageKey);
    if (stored === "follow" || stored === "wide" || stored === "default") {
      setSeat(stored);
      onChange?.(stored, followTarget ?? null);
    }
  }, [storageKey, followTarget, onChange]);

  const handleSelect = (next: Seat) => {
    setSeat(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, next);
    }
    onChange?.(next, followTarget ?? null);
  };

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-3 py-1 rounded-full"
      style={{
        backgroundColor: "var(--bg-frame)",
        border: "1px solid var(--border-faint)",
      }}
      aria-label="Seat choice"
    >
      {(Object.keys(SEAT_LABELS) as Seat[]).map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => handleSelect(s)}
          className="min-h-[44px] px-3 text-[12px] font-medium uppercase tracking-[0.12em] font-theater-ui rounded"
          style={{
            color: s === seat ? "var(--accent-gold)" : "var(--text-faded)",
            backgroundColor: s === seat ? "rgba(212,175,55,0.08)" : "transparent",
          }}
          aria-pressed={s === seat}
        >
          {SEAT_LABELS[s]}
        </button>
      ))}
    </div>
  );
}
