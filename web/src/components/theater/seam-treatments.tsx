"use client";
import type React from "react";

/** §12.1 LoadingShimmer — placeholder while DM/player emission is in flight. */
export function LoadingShimmer({ width = "12ch" }: { width?: string }) {
  return (
    <span
      className="inline-block align-middle bg-[var(--bg-frame)] rounded-sm animate-pulse"
      style={{ width, height: "1em", opacity: 0.4 }}
      aria-hidden="true"
      aria-label="Loading"
    />
  );
}

/** §12.1 ThinkingDots — agent is thinking; ellipsis bounce.
 *  Uses .animate-bounce which is also suppressed under prefers-reduced-motion. */
export function ThinkingDots({ label = "thinking" }: { label?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[var(--text-faded)] text-xs"
      role="status"
      aria-label={label}
    >
      <span className="animate-bounce" style={{ animationDelay: "0ms" }}>·</span>
      <span className="animate-bounce" style={{ animationDelay: "150ms" }}>·</span>
      <span className="animate-bounce" style={{ animationDelay: "300ms" }}>·</span>
    </span>
  );
}

/** §12.1 ParseErrorPip — small inline marker rendered when an emission
 *  contained markup we couldn't parse cleanly. Hover shows the warning text. */
export function ParseErrorPip({ message }: { message: string }) {
  return (
    <span
      className="inline-block w-2 h-2 rounded-full bg-[var(--accent-coral)] align-middle ml-1"
      title={message}
      aria-label={`parser warning: ${message}`}
    />
  );
}

/** §12.1 ReconnectIndicator — shown along the rail while the spectator
 *  WebSocket is mid-reconnect. */
export function ReconnectIndicator({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div
      className="fixed top-2 right-2 z-50 px-3 py-1 rounded-full text-xs font-theater-ui"
      style={{
        backgroundColor: "var(--bg-frame)",
        color: "var(--text-secondary)",
        border: "1px solid var(--border-faint)",
      }}
      role="status"
    >
      <span className="animate-pulse">reconnecting…</span>
    </div>
  );
}

/** §12.1 DelayedPip — small marker for emissions arriving >2s late. */
export function DelayedPip() {
  return (
    <span
      className="text-[10px] font-theater-ui ml-1"
      style={{ color: "var(--text-faded)" }}
    >
      · delayed
    </span>
  );
}

/** §12.1 HumanDmTypingCue — typewriter SVG, 1.5Hz blink (667ms step-end).
 *  Mounted next to DM avatar in CastStrip when ws emits dm_typing. */
export function HumanDmTypingCue() {
  return (
    <div className="absolute -top-2 -right-1 animate-dm-typing-blink">
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
        <rect x="2" y="3" width="10" height="8" rx="1" stroke="var(--accent-gold)" strokeWidth="1.5" fill="none" />
        <rect x="4" y="1" width="6" height="3" rx="0.5" stroke="var(--accent-gold)" strokeWidth="1" fill="none" />
      </svg>
    </div>
  );
}

/** §12.1 BackfillWrapper — wraps backfilled (historical) emissions on the
 *  rail with a slightly faded look so live emissions stand out. */
export function BackfillWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-backfill="true"
      style={{ opacity: 0.75 }}
      className="theater-backfill"
    >
      {children}
    </div>
  );
}
