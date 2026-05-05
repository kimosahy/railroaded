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
