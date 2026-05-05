"use client";
import { useEffect, useMemo, useState } from "react";
import { API_BASE } from "@/lib/api";
import type { Emission, SceneData } from "@theater/types";
import { compose, type ComposedEmission } from "@theater/composer";
import { Timeline } from "./timeline";
import { BulletTimeSlider } from "./bullet-time";
import type { AgentInfo } from "@/hooks/use-session-agents";

/**
 * §9.3 Director's Cut viewing surface.
 *
 * Post-session card with thumbnail + Watch button. On Watch, opens a full-bleed
 * modal that fetches stored emissions from `GET /spectator/sessions/:id/emissions`,
 * NOT from in-memory state (AR rule 2). Bullet Time mounted; Seat Choice NOT
 * mounted (per §9.3).
 *
 * Embed/share hooks deferred per §13 Q7.
 */

function formatDuration(ms: number | null): string {
  if (ms === null || ms < 0) return "";
  const seconds = Math.floor(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function useLastEstablishingImage(emissions: ComposedEmission[]): string | null {
  return useMemo(() => {
    for (let i = emissions.length - 1; i >= 0; i--) {
      const e = emissions[i].emission;
      const sceneObj = e.scene as (SceneData & { image_url?: string }) | undefined;
      if (sceneObj?.type === "establishing" && sceneObj.image_url) {
        return sceneObj.image_url;
      }
    }
    return null;
  }, [emissions]);
}

interface DirectorsCutCardProps {
  sessionId: string;
  sessionTitle: string;
  sessionDurationMs: number | null;
  emissions: ComposedEmission[];
  agents: Map<string, AgentInfo>;
}

export function DirectorsCutCard({
  sessionId,
  sessionTitle,
  sessionDurationMs,
  emissions,
  agents,
}: DirectorsCutCardProps) {
  const [open, setOpen] = useState(false);
  const lastEstablishing = useLastEstablishingImage(emissions);

  return (
    <>
      <div
        className="w-full max-w-3xl mx-auto p-6 rounded"
        style={{ backgroundColor: "var(--bg-frame)" }}
      >
        {lastEstablishing && (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={lastEstablishing}
            alt=""
            className="w-full aspect-video rounded mb-4 object-cover"
          />
        )}
        <h2
          className="font-theater-heading text-[24px] mb-1"
          style={{ color: "var(--text-primary)" }}
        >
          Director&apos;s Cut
        </h2>
        <p
          className="font-theater-ui text-[13px]"
          style={{ color: "var(--text-secondary)" }}
        >
          {sessionTitle}
          {sessionDurationMs !== null ? ` · ${formatDuration(sessionDurationMs)}` : ""}
        </p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-4 px-6 py-3 rounded font-theater-heading text-base min-h-[44px]"
          style={{ backgroundColor: "var(--accent-gold)", color: "var(--bg-canvas)" }}
        >
          Watch
        </button>
      </div>
      {/* TODO: og:image + embed URL pattern — §13 Q7 follow-up */}
      {open && <DirectorsCutPlayer sessionId={sessionId} agents={agents} onClose={() => setOpen(false)} />}
    </>
  );
}

function DirectorsCutPlayer({
  sessionId,
  agents,
  onClose,
}: {
  sessionId: string;
  agents: Map<string, AgentInfo>;
  onClose: () => void;
}) {
  const [emissions, setEmissions] = useState<ComposedEmission[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/spectator/sessions/${sessionId}/emissions`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((rawList: Record<string, unknown>[]) => {
        if (cancelled) return;
        const composed = rawList.map((raw) => compose(raw, "audience"));
        setEmissions(composed.filter((e) => e.visible));
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto"
      style={{ backgroundColor: "var(--bg-canvas)" }}
      role="dialog"
      aria-label="Director's Cut playback"
    >
      <button
        type="button"
        onClick={onClose}
        className="fixed top-4 right-4 z-50 min-h-[44px] min-w-[44px] px-4 font-theater-ui text-[12px] uppercase tracking-[0.18em] rounded"
        style={{
          backgroundColor: "var(--bg-frame)",
          color: "var(--accent-gold)",
          border: "1px solid var(--border-faint)",
        }}
      >
        Close
      </button>

      {error && (
        <div className="p-12 text-center font-theater-ui" style={{ color: "var(--accent-coral)" }}>
          Error loading emissions: {error}
        </div>
      )}

      <div className="px-8 pt-16 pb-24 max-w-prose mx-auto">
        <Timeline emissions={emissions} agents={agents} playbackSpeed={playbackSpeed} />
      </div>

      <BulletTimeSlider speed={playbackSpeed} onSpeedChange={setPlaybackSpeed} />
    </div>
  );
}

/** Test-only export: cast Emission record to ComposedEmission via the composer. */
export function _composeForTest(raw: Record<string, unknown>): ComposedEmission {
  return compose(raw, "audience");
}

/** Test-only: same selector as the live hook. */
export function _lastEstablishingForTest(emissions: { emission: Emission }[]): string | null {
  for (let i = emissions.length - 1; i >= 0; i--) {
    const e = emissions[i].emission;
    const sceneObj = e.scene as (SceneData & { image_url?: string }) | undefined;
    if (sceneObj?.type === "establishing" && sceneObj.image_url) return sceneObj.image_url;
  }
  return null;
}
