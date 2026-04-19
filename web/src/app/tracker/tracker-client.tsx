"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { API_BASE } from "@/lib/api";
import { PartyList } from "@/components/tracker/party-list";
import { EventFeed } from "@/components/tracker/event-feed";
import { NarratorPanel } from "@/components/tracker/narrator-panel";
import { Button, Chip, toast } from "@heroui/react";
import { ShareNetwork, Eye } from "@phosphor-icons/react";

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
  const [loadingMoreSessions, setLoadingMoreSessions] = useState(false);
  const [hasMoreSessions, setHasMoreSessions] = useState(false);

  const SESSIONS_LIMIT = 20;

  const [spectatorCount, setSpectatorCount] = useState<number | null>(null);
  const [spectatorEndpointMissing, setSpectatorEndpointMissing] = useState(false);

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
      const res = await fetch(
        `${API_BASE}/spectator/sessions?limit=${SESSIONS_LIMIT}&offset=0`,
      );
      if (res.ok) {
        const data = (await res.json()) as { sessions: Session[] };
        const next = data.sessions ?? [];
        setSessions((prev) => {
          // Preserve any additionally-loaded pages already appended.
          // Refresh only the head slice; merge with tail that came from load-more.
          if (prev.length <= SESSIONS_LIMIT) return next;
          const tail = prev.slice(SESSIONS_LIMIT);
          const seen = new Set(next.map((s) => s.id));
          return [...next, ...tail.filter((s) => !seen.has(s.id))];
        });
        setHasMoreSessions(next.length >= SESSIONS_LIMIT);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  const loadMoreSessions = useCallback(async () => {
    if (loadingMoreSessions) return;
    setLoadingMoreSessions(true);
    try {
      const offset = sessions.length;
      const res = await fetch(
        `${API_BASE}/spectator/sessions?limit=${SESSIONS_LIMIT}&offset=${offset}`,
      );
      if (res.ok) {
        const data = (await res.json()) as { sessions: Session[] };
        const next = data.sessions ?? [];
        if (next.length > 0) {
          setSessions((prev) => {
            const seen = new Set(prev.map((s) => s.id));
            return [...prev, ...next.filter((s) => !seen.has(s.id))];
          });
        }
        setHasMoreSessions(next.length >= SESSIONS_LIMIT);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingMoreSessions(false);
    }
  }, [sessions.length, loadingMoreSessions]);

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

  // ── Spectator / viewer count (hide silently on 404) ──────────────────
  useEffect(() => {
    if (!selectedSessionId || spectatorEndpointMissing) {
      setSpectatorCount(null);
      return;
    }
    let cancelled = false;
    const fetchCount = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/spectator/sessions/${selectedSessionId}/count`,
        );
        if (cancelled) return;
        if (res.status === 404) {
          setSpectatorEndpointMissing(true);
          setSpectatorCount(null);
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as { count?: number; viewers?: number; spectators?: number };
        const n =
          typeof data.count === "number"
            ? data.count
            : typeof data.viewers === "number"
              ? data.viewers
              : typeof data.spectators === "number"
                ? data.spectators
                : null;
        if (n != null) setSpectatorCount(n);
      } catch {
        /* network errors silent */
      }
    };
    fetchCount();
    const id = setInterval(fetchCount, 10_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [selectedSessionId, spectatorEndpointMissing]);

  // ── Share session ────────────────────────────────────────────────────────────
  const handleShareSession = useCallback(async () => {
    const link = selectedSessionId
      ? `https://railroaded.ai/tracker?session=${selectedSessionId}`
      : `https://railroaded.ai/tracker`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const ta = document.createElement("textarea");
        ta.value = link;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      toast.success("Session link copied to clipboard");
    } catch {
      toast.danger("Couldn't copy the link. Try again?");
    }
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
    top: "64px",
    maxHeight: "calc(100dvh - 64px)",
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
          hasMoreSessions={hasMoreSessions && !selectedPartyId}
          loadingMoreSessions={loadingMoreSessions}
          onLoadMoreSessions={loadMoreSessions}
        />
      </div>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header
        className="flex items-start justify-between flex-wrap gap-3"
        style={{ gridColumn: "2", gridRow: "1", paddingTop: "1.5rem", paddingBottom: "0.5rem" }}
      >
        <div>
          <div className="flex items-center" style={{ gap: "8px", marginBottom: "0.25rem" }}>
            <h1
              style={{
                fontFamily: "var(--font-heading)",
                color: "var(--accent)",
                fontSize: "1.875rem",
                fontWeight: 700,
                lineHeight: 1.1,
                margin: 0,
              }}
            >
              Live Tracker
            </h1>
            <Button
              size="sm"
              variant="secondary"
              onPress={handleShareSession}
              aria-label="Copy tracker share link"
            >
              <ShareNetwork size={14} style={{ marginRight: 6 }} />
              Share
            </Button>
          </div>
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

      {/* ── Col 2, Row 2: Event feed ─────────────────────────────────── */}
      <div
        style={{
          gridColumn: "2",
          gridRow: "2",
          minHeight: "calc(100dvh - 64px - 6rem)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {selectedSession && (
          <div
            className="flex items-center gap-2 flex-wrap"
            style={{ marginBottom: "0.35rem", paddingLeft: "0.2rem" }}
          >
            {spectatorCount != null && spectatorCount > 0 && (
              <Chip
                size="sm"
                variant="secondary"
                style={{
                  fontSize: "0.72rem",
                  fontFamily: "var(--font-heading)",
                  letterSpacing: "0.04em",
                }}
              >
                <span className="flex items-center gap-1">
                  <Eye size={12} />
                  {spectatorCount} watching
                </span>
              </Chip>
            )}
          </div>
        )}
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
