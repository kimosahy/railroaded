"use client";
import { useEffect, useState } from "react";
import type { MemoryRecall } from "@theater/types";

/**
 * §7.2 Memory recall flash card.
 *
 * 200px wide, slides from top, 3s hold, 400ms slide-out. Non-blocking.
 * Card content: "Earlier…" label + relative timestamp + original line.
 */

export function formatRelativeTime(then: string | Date | null | undefined): string {
  if (!then) return "earlier";
  const t = typeof then === "string" ? new Date(then) : then;
  const ms = Date.now() - t.getTime();
  if (Number.isNaN(ms) || ms < 0) return "earlier";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function MemoryFlash({
  memory,
  /** Original turn timestamp — looked up from session events when available. */
  originalTimestamp,
  onDismiss,
}: {
  memory: MemoryRecall;
  originalTimestamp?: string | null;
  onDismiss?: () => void;
}) {
  const [phase, setPhase] = useState<"in" | "hold" | "out" | "done">("in");

  useEffect(() => {
    const t1 = window.setTimeout(() => setPhase("hold"), 50);
    const t2 = window.setTimeout(() => setPhase("out"), 3000);
    const t3 = window.setTimeout(() => {
      setPhase("done");
      onDismiss?.();
    }, 3400);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [onDismiss]);

  if (phase === "done") return null;

  const translate = phase === "in" ? "translateY(-40px)" : phase === "out" ? "translateY(-40px)" : "translateY(0)";
  const opacity = phase === "in" ? 0 : phase === "out" ? 0 : 1;

  return (
    <div
      className="fixed top-4 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
      style={{
        width: "200px",
        backgroundColor: "var(--bg-frame)",
        border: "1px solid var(--border-faint)",
        borderRadius: 6,
        padding: "10px 12px",
        transform: translate,
        opacity,
        transition: "transform 400ms ease-out, opacity 400ms ease-out",
      }}
      role="status"
    >
      <div
        className="text-[11px] mb-1 font-theater-ui uppercase tracking-[0.18em]"
        style={{ color: "var(--text-faded)" }}
      >
        Earlier… · {formatRelativeTime(originalTimestamp ?? null)}
      </div>
      <div
        className="font-theater-prose text-[14px]"
        style={{ color: "var(--text-primary)" }}
      >
        {memory.caption}
      </div>
    </div>
  );
}
