"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { API_BASE } from "@/lib/api";
import { PartyList } from "@/components/tracker/party-list";
import { EventFeed } from "@/components/tracker/event-feed";
import { NarratorPanel } from "@/components/tracker/narrator-panel";
import { Button } from "@heroui/react";

// ─── Shared types (exported for sub-components) ───────────────────────────────

export interface Member {
  name: string;
  race: string;
  className: string;
  level: number;
  hpCurrent: number;
  hpMax: number;
  avatarUrl?: string;
  model?: { provider?: string; name?: string };
}

export interface Party {
  id: string;
  name: string;
  status: string;
  dungeonName?: string;
  members: Member[];
}

export interface Session {
  id: string;
  partyId: string;
  partyName: string;
  phase?: string;
  isActive: boolean;
  summary?: string;
  outcome?: string;
  startedAt: string;
  endedAt?: string;
  eventCount: number;
}

export interface GameEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

export interface Narration {
  id: string;
  sessionId: string;
  content: string;
  partyName: string;
  createdAt: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TrackerClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [parties, setParties] = useState<Party[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [narrations, setNarrations] = useState<Narration[]>([]);

  const [selectedPartyId, setSelectedPartyId] = useState<string | null>(
    searchParams.get("party"),
  );
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    searchParams.get("session"),
  );
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "completed">("all");

  const [loadingParties, setLoadingParties] = useState(true);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(false);
  const [loadingNarrations, setLoadingNarrations] = useState(true);

  // ── Fetchers ────────────────────────────────────────────────────────────────

  const fetchParties = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/spectator/parties`);
      if (res.ok) {
        const data = (await res.json()) as { parties: Party[] };
        setParties(data.parties ?? []);
      }
    } catch {
      /* network errors are silent */
    } finally {
      setLoadingParties(false);
    }
  }, []);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/spectator/sessions?limit=20&offset=0`);
      if (res.ok) {
        const data = (await res.json()) as { sessions: Session[] };
        setSessions(data.sessions ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  const fetchEvents = useCallback(async (sessionId: string) => {
    setLoadingEvents(true);
    try {
      const res = await fetch(`${API_BASE}/spectator/sessions/${sessionId}/events`);
      if (res.ok) {
        const data = (await res.json()) as { events: GameEvent[] };
        setEvents(data.events ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingEvents(false);
    }
  }, []);

  const fetchNarrations = useCallback(async (sessionId: string | null) => {
    try {
      const qs = sessionId ? `?limit=10&sessionId=${sessionId}` : "?limit=10";
      const res = await fetch(`${API_BASE}/spectator/narrations${qs}`);
      if (res.ok) {
        const data = (await res.json()) as { narrations: Narration[] };
        setNarrations(data.narrations ?? []);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingNarrations(false);
    }
  }, []);

  // ── URL helpers ──────────────────────────────────────────────────────────────

  const updateUrl = useCallback(
    (partyId: string | null, sessionId: string | null) => {
      const params = new URLSearchParams();
      if (partyId) params.set("party", partyId);
      if (sessionId) params.set("session", sessionId);
      const qs = params.toString();
      router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
    },
    [router, pathname],
  );

  // ── Selection handlers ───────────────────────────────────────────────────────

  const handleSelectParty = useCallback(
    (partyId: string) => {
      const next = selectedPartyId === partyId ? null : partyId;
      setSelectedPartyId(next);
      setSelectedSessionId(null);
      setEvents([]);
      updateUrl(next, null);
    },
    [selectedPartyId, updateUrl],
  );

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      const next = selectedSessionId === sessionId ? null : sessionId;
      setSelectedSessionId(next);
      if (next) {
        fetchEvents(next);
      } else {
        setEvents([]);
      }
      updateUrl(selectedPartyId, next);
    },
    [selectedSessionId, selectedPartyId, updateUrl, fetchEvents],
  );

  const handleClearFilters = useCallback(() => {
    setSelectedPartyId(null);
    setSelectedSessionId(null);
    setEvents([]);
    updateUrl(null, null);
  }, [updateUrl]);

  // ── Polling ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchParties();
    const id = setInterval(fetchParties, 15_000);
    return () => clearInterval(id);
  }, [fetchParties]);

  useEffect(() => {
    fetchSessions();
    const id = setInterval(fetchSessions, 10_000);
    return () => clearInterval(id);
  }, [fetchSessions]);

  useEffect(() => {
    fetchNarrations(selectedSessionId);
    const id = setInterval(() => fetchNarrations(selectedSessionId), 8_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSessionId]);

  // Load events from deep-link on mount
  useEffect(() => {
    const sId = searchParams.get("session");
    if (sId) fetchEvents(sId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Derived state ─────────────────────────────────────────────────────────────

  const filteredSessions = sessions.filter((s) => {
    if (selectedPartyId && s.partyId !== selectedPartyId) return false;
    if (statusFilter === "active" && !s.isActive) return false;
    if (statusFilter === "completed" && s.isActive) return false;
    return true;
  });

  const selectedSession = sessions.find((s) => s.id === selectedSessionId) ?? null;
  const selectedParty = parties.find((p) => p.id === selectedPartyId) ?? null;
  const hasFilters = !!(selectedPartyId || selectedSessionId);

  // ── Layout ────────────────────────────────────────────────────────────────────

  const sidebarStyle: React.CSSProperties = {
    position: "sticky",
    top: "60px",
    maxHeight: "calc(100dvh - 60px)",
    overflowY: "auto",
    scrollbarWidth: "thin",
    scrollbarColor: "var(--border) transparent",
    paddingTop: "1.5rem",
  };

  return (
    <div
      className="max-w-[1700px] mx-auto px-8 pb-16"
      style={{
        display: "grid",
        gridTemplateColumns: "300px 1fr 300px",
        gridTemplateRows: "auto 1fr",
        gap: "0 1.5rem",
      }}
    >
      {/* ── Col 1: Party + session sidebar ─────────────────────────────────── */}
      <div style={{ gridColumn: "1", gridRow: "1 / -1", ...sidebarStyle }}>
        <PartyList
          parties={parties}
          sessions={filteredSessions}
          selectedPartyId={selectedPartyId}
          selectedSessionId={selectedSessionId}
          onSelectParty={handleSelectParty}
          onSelectSession={handleSelectSession}
          loading={loadingParties}
          loadingSessions={loadingSessions}
        />
      </div>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header
        className="flex items-start justify-between flex-wrap gap-3"
        style={{ gridColumn: "2", gridRow: "1", paddingTop: "1.5rem", paddingBottom: "0.5rem" }}
      >
        <div>
          <h1
            style={{
              fontFamily: "var(--font-heading)",
              color: "var(--accent)",
              fontSize: "2.5rem",
              fontWeight: 700,
              lineHeight: 1.1,
              marginBottom: "0.25rem",
            }}
          >
            Live Tracker
          </h1>
          <p style={{ color: "var(--muted)", fontSize: "1rem" }}>
            Active parties and their adventures in real time
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap pt-1">
          <span
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "0.72rem",
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Status:
          </span>

          {(["all", "active", "completed"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={statusFilter === f ? "primary" : "secondary"}
              onPress={() => setStatusFilter(f)}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}

          {hasFilters && (
            <Button size="sm" variant="secondary" onPress={handleClearFilters}>
              Clear
            </Button>
          )}

          <span
            className="flex items-center gap-1"
            style={{ color: "var(--muted)", fontSize: "0.72rem", whiteSpace: "nowrap" }}
          >
            <span
              className="inline-block rounded-full animate-pulse"
              style={{ width: 6, height: 6, background: "var(--success)", flexShrink: 0 }}
            />
            Live
          </span>
        </div>
      </header>

      {/* ── Col 2, Row 2: Event feed ────────────────────────────────────────── */}
      <div style={{ gridColumn: "2", gridRow: "2" }}>
        <EventFeed
          events={events}
          session={selectedSession}
          party={selectedParty}
          loading={loadingEvents}
        />
      </div>

      {/* ── Col 3: Narrator panel ───────────────────────────────────────────── */}
      <div style={{ gridColumn: "3", gridRow: "1 / -1", ...sidebarStyle }}>
        <NarratorPanel narrations={narrations} loading={loadingNarrations} />
      </div>
    </div>
  );
}
