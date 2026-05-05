"use client";
import type React from "react";

/**
 * §4.4 Interruption rendering.
 * - Last word of interrupted emission replaced with em-dash.
 * - Single-word emissions preserve the word: "{word} —".
 * - Collision flash: --accent-coral, 200ms, 0 → 0.6 → 0.
 * - 12px gap between interrupted and interrupting emission.
 * - Both remain in timeline (not deleted).
 */

export function truncateInterrupted(content: string): string {
  if (!content) return "—";
  const words = content.trim().split(/\s+/);
  // Single-word case preserves the word per §4.4.
  if (words.length <= 1) return `${content.trim()} —`;
  return `${words.slice(0, -1).join(" ")} —`;
}

export function InterruptionFlash({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-block animate-interruption-flash" aria-hidden="false">
      {children}
    </span>
  );
}

export function InterruptedEmission({ content }: { content: string }) {
  return (
    <span className="inline-block">
      {truncateInterrupted(content)}
    </span>
  );
}

/**
 * §4.4 spacing wrapper — applies 12px gap below an interrupted emission so
 * the interrupting one feels like a beat, not an overlap.
 */
export function InterruptionGap({ children }: { children: React.ReactNode }) {
  return <div style={{ marginBottom: "12px" }}>{children}</div>;
}
