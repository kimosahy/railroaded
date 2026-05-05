"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { WS_BASE } from "@/lib/api";
import type { Emission, Mood, Tension, ViewerRole } from "@theater/types";
import { compose, deduplicateEmissions, type ComposedEmission } from "@theater/composer";
import { MoodOverlay } from "@/components/theater/mood-overlay";
import { CastStrip } from "@/components/theater/cast-strip";
import { Timeline } from "@/components/theater/timeline";
import { TensionEdge, useVibrationClass } from "@/components/theater/tension-edge";
import { MonologueRail } from "@/components/theater/monologue-rail";
import { BulletTimeSlider } from "@/components/theater/bullet-time";
import { ReconnectIndicator } from "@/components/theater/seam-treatments";
import { useSessionAgents } from "@/hooks/use-session-agents";

const BASE_INTER_EMISSION_MS = 600;

export function TheaterClient({ sessionId }: { sessionId: string }) {
  const [emissions, setEmissions] = useState<ComposedEmission[]>([]);
  const [mood, setMood] = useState<Mood>(null);
  const [tension, setTension] = useState<Tension>(3);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [climaxHold, setClimaxHold] = useState(false);
  const climaxHoldRef = useRef(false);
  climaxHoldRef.current = climaxHold;

  const [agentStates, setAgentStates] = useState<
    Map<string, { bodyState: string | null; posture: string | null }>
  >(new Map());

  // Sticky Bullet Time per session (ATLAS-019 FIF-6)
  const storageKey = `railroaded-bullet-time-${sessionId}`;
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(storageKey);
    if (stored) {
      const n = parseFloat(stored);
      if (!Number.isNaN(n)) setPlaybackSpeed(n);
    }
  }, [storageKey]);
  const handleSpeedChange = (speed: number) => {
    setPlaybackSpeed(speed);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(storageKey, String(speed));
    }
  };

  // Auth-derived viewer role (ATLAS-019 BLOCKER-1: ref, NOT in connectWs deps)
  const [viewerRole, setViewerRole] = useState<ViewerRole>("audience");
  const viewerRoleRef = useRef<ViewerRole>("audience");
  viewerRoleRef.current = viewerRole;

  const agents = useSessionAgents(sessionId);
  const wsRef = useRef<WebSocket | null>(null);
  const unmountedRef = useRef(false);
  const reconnectAttemptRef = useRef(0);

  // Buffer emissions during climax hold (ATLAS-019 FIF-5)
  const emissionBufferRef = useRef<ComposedEmission[]>([]);

  // Drain queue — Bullet Time controls inter-emission rate (ATLAS-022 BLOCKER-3 / AR rule 3)
  const incomingQueueRef = useRef<ComposedEmission[]>([]);
  const lastDrainRef = useRef(0);
  const playbackSpeedRef = useRef(playbackSpeed);
  playbackSpeedRef.current = playbackSpeed;

  useEffect(() => {
    let raf = 0;
    const tick = (ts: number) => {
      if (!lastDrainRef.current) lastDrainRef.current = ts;
      const interval = BASE_INTER_EMISSION_MS / playbackSpeedRef.current;
      if (ts - lastDrainRef.current >= interval && incomingQueueRef.current.length > 0) {
        const next = incomingQueueRef.current.shift();
        if (next) {
          if (climaxHoldRef.current) {
            emissionBufferRef.current.push(next);
          } else {
            setEmissions((prev) => deduplicateEmissions([...prev, next]));
          }
        }
        lastDrainRef.current = ts;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const connectWs = useCallback(() => {
    if (unmountedRef.current) return;
    const ws = new WebSocket(`${WS_BASE}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setReconnecting(false);
      reconnectAttemptRef.current = 0;

      // AR rule 5: AUTH BEFORE SUBSCRIBE.
      // If we have a token, send auth first and wait for auth_ok before subscribing.
      // Otherwise (audience spectator) subscribe immediately.
      const token = (typeof document !== "undefined"
        ? document.cookie.match(/railroaded-token=([^;]+)/)?.[1]
        : undefined);
      if (token) {
        ws.send(JSON.stringify({ type: "auth", token }));
        // subscribe deferred to auth_ok handler
      } else {
        ws.send(JSON.stringify({ type: "subscribe", partyId: sessionId }));
      }
    };

    ws.onmessage = (event) => {
      let msg: { type?: string; data?: unknown; role?: string } | null = null;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if (!msg || typeof msg !== "object" || !msg.type) return;

      if (msg.type === "auth_error") {
        // Fall back to audience subscribe on invalid/expired token (AR rule 7).
        ws.send(JSON.stringify({ type: "subscribe", partyId: sessionId }));
        return;
      }

      if (msg.type === "auth_ok") {
        const newRole: ViewerRole = msg.role === "dm" ? "dm" : "player";
        setViewerRole(newRole);
        // Now subscribe — server composes against the authenticated role.
        ws.send(JSON.stringify({ type: "subscribe", partyId: sessionId }));
        return;
      }

      if (msg.type === "theater_emission" && msg.data) {
        const raw = msg.data as Record<string, unknown> & Partial<Emission>;
        const composed = compose(raw, viewerRoleRef.current);

        if (raw.mood !== undefined) setMood(raw.mood as Mood);
        if (raw.tension !== undefined) setTension(raw.tension as Tension);

        if (raw.body_state !== undefined || raw.posture !== undefined) {
          const agentId = String(raw.agent_id ?? "");
          if (agentId) {
            setAgentStates((prev) => {
              const next = new Map(prev);
              const current = next.get(agentId) ?? { bodyState: null, posture: null };
              next.set(agentId, {
                bodyState:
                  raw.body_state !== undefined
                    ? ((raw.body_state as string | null) ?? null)
                    : current.bodyState,
                posture:
                  raw.posture !== undefined
                    ? ((raw.posture as string | null) ?? null)
                    : current.posture,
              });
              return next;
            });
          }
        }

        // Push to drain queue — Bullet Time controls render rate.
        incomingQueueRef.current.push(composed);
        return;
      }

      if (msg.type === "theater_emission_update" && msg.data) {
        const update = msg.data as { emission_id?: string } & Record<string, unknown>;
        if (!update.emission_id) return;
        setEmissions((prev) =>
          prev.map((e) =>
            e.emission.emission_id === update.emission_id
              ? { ...e, emission: { ...e.emission, ...update } as Emission }
              : e
          )
        );
      }
    };

    ws.onclose = () => {
      setConnected(false);
      if (!unmountedRef.current) {
        setReconnecting(true);
        // Exponential backoff with jitter — caps at 30s
        const attempt = reconnectAttemptRef.current++;
        const baseDelay = Math.min(1000 * Math.pow(2, attempt), 30000);
        const jitter = Math.random() * 1000;
        setTimeout(connectWs, baseDelay + jitter);
      }
    };
  }, [sessionId]); // viewerRole NOT in deps — uses ref

  useEffect(() => {
    unmountedRef.current = false;
    connectWs();
    return () => {
      unmountedRef.current = true;
      wsRef.current?.close();
    };
  }, [connectWs]);

  // Climax desaturate-snap — edge-detector on transition INTO tension=10 (AR rule 2)
  const lastWasClimaxRef = useRef(false);
  useEffect(() => {
    const isClimax = tension === 10;
    if (isClimax && !lastWasClimaxRef.current && !climaxHoldRef.current) {
      setClimaxHold(true);
      window.setTimeout(() => {
        setClimaxHold(false);
        const buffered = emissionBufferRef.current;
        emissionBufferRef.current = [];
        if (buffered.length > 0) {
          setEmissions((prev) => deduplicateEmissions([...prev, ...buffered]));
        }
      }, 1250);
    }
    lastWasClimaxRef.current = isClimax;
  }, [tension]);

  const monologueEmissions = emissions.filter(
    (e) => e.emission.track === "internal_monologue" && e.visible
  );
  const timelineEmissions = emissions.filter(
    (e) => e.emission.track !== "internal_monologue" && e.visible
  );

  const vibrationClass = useVibrationClass(tension);

  return (
    <div
      className={`theater relative min-h-screen ${climaxHold ? "theater-climax-flash" : ""} ${vibrationClass}`}
      style={{ backgroundColor: "var(--bg-canvas)" }}
    >
      <MoodOverlay mood={mood} />
      <TensionEdge tension={tension} />

      {/* §9.1 cool tint at 0.1× — --accent-cool, 18% opacity */}
      {playbackSpeed === 0.1 && (
        <div
          className="fixed inset-0 pointer-events-none z-12 transition-opacity duration-[400ms]"
          style={{ backgroundColor: "var(--accent-cool)", opacity: 0.18 }}
          aria-hidden="true"
        />
      )}

      <ReconnectIndicator visible={!connected && reconnecting} />

      {/* §11.1 status pip — top-right (V1 placeholder; wire to sessionStatus later) */}
      <div
        className="fixed top-4 right-4 z-20 flex items-center gap-2 font-theater-ui text-[11px] uppercase"
        style={{ color: "var(--text-faded)" }}
      >
        <span
          className="w-2 h-2 rounded-full animate-pulse"
          style={{ backgroundColor: "var(--accent-gold)" }}
        />
        <span>Live</span>
      </div>

      <div className="flex h-screen">
        <div className="flex-1 overflow-y-auto px-8 pt-16 pb-24">
          <Timeline
            emissions={timelineEmissions}
            agents={agents}
            playbackSpeed={playbackSpeed}
          />
        </div>

        {viewerRole === "audience" && monologueEmissions.length > 0 && (
          <MonologueRail emissions={monologueEmissions} agents={agents} />
        )}
      </div>

      <CastStrip
        sessionId={sessionId}
        agents={agents}
        viewerRole={viewerRole}
        agentStates={agentStates}
      />
      <BulletTimeSlider speed={playbackSpeed} onSpeedChange={handleSpeedChange} />
    </div>
  );
}
