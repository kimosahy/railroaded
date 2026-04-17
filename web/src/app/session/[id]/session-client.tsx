"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, Card, Chip, Separator, Skeleton } from "@heroui/react";
import {
  BookOpen,
  ChatCircle,
  Crosshair,
  Moon,
  Package,
  Skull,
  Sparkle,
  Sword,
  Users,
} from "@phosphor-icons/react";
import { API_BASE } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Session {
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

interface GameEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
}

interface Narration {
  id: string;
  content: string;
  partyName: string;
  createdAt: string;
}

// ─── Event helpers ────────────────────────────────────────────────────────────

const EVENT_META: Record<
  string,
  { label: string; color: "default" | "accent" | "success" | "danger" | "warning" }
> = {
  combat_start: { label: "Combat", color: "danger" },
  combat_end: { label: "Combat End", color: "default" },
  player_attack: { label: "Attack", color: "warning" },
  monster_attack: { label: "Monster", color: "danger" },
  player_action: { label: "Action", color: "accent" },
  spell_cast: { label: "Spell", color: "accent" },
  death_save: { label: "Death Save", color: "danger" },
  party_chat: { label: "Chat", color: "default" },
  narration: { label: "Narration", color: "accent" },
  session_start: { label: "Session Start", color: "success" },
  session_end: { label: "Session End", color: "default" },
  level_up: { label: "Level Up", color: "success" },
  rest: { label: "Rest", color: "default" },
  loot: { label: "Loot", color: "warning" },
};

function getEventMeta(type: string) {
  return (
    EVENT_META[type] ?? {
      label: type.replace(/_/g, " "),
      color: "default" as const,
    }
  );
}

function eventSummary(event: GameEvent): string {
  const d = event.data;
  switch (event.type) {
    case "player_attack":
    case "monster_attack": {
      const attacker = (d.attackerName ?? d.actorName ?? "Unknown") as string;
      const target = (d.targetName ?? d.target ?? "") as string;
      const dmg = d.damage ?? d.totalDamage;
      if (target && dmg !== undefined) return `${attacker} attacked ${target} for ${dmg} damage`;
      if (target) return `${attacker} attacked ${target}`;
      return `${attacker} attacked`;
    }
    case "party_chat": {
      const speaker = (d.characterName ?? d.actorName ?? "") as string;
      const msg = (d.message ?? d.content ?? "") as string;
      if (speaker && msg) return `${speaker}: "${msg}"`;
      return msg || speaker || "Party chat";
    }
    case "narration": {
      const content = (d.content ?? d.narration ?? "") as string;
      return content.length > 200 ? content.slice(0, 197) + "…" : content;
    }
    case "spell_cast": {
      const caster = (d.casterName ?? d.actorName ?? "") as string;
      const spell = (d.spellName ?? d.spell ?? "") as string;
      if (caster && spell) return `${caster} cast ${spell}`;
      return spell || caster || "Spell cast";
    }
    case "death_save": {
      const name = (d.characterName ?? "") as string;
      const result = (d.result ?? d.outcome ?? "") as string;
      return `${name} death save${result ? `: ${result}` : ""}`;
    }
    case "combat_start":
      return (d.description ?? "Combat begins.") as string;
    case "combat_end":
      return (d.outcome ?? d.description ?? "Combat ends.") as string;
    case "session_start":
      return (d.description ?? "A new session begins.") as string;
    case "session_end":
      return (d.summary ?? d.description ?? "The session draws to a close.") as string;
    case "level_up": {
      const name = (d.characterName ?? "") as string;
      const lvl = d.newLevel ?? d.level;
      return `${name} reached level ${lvl}`;
    }
    default: {
      const desc = (d.description ?? d.message ?? d.content ?? d.summary ?? "") as string;
      return desc.length > 200 ? desc.slice(0, 197) + "…" : desc || event.type;
    }
  }
}

function eventIcon(type: string) {
  if (type.includes("combat") || type.includes("attack"))
    return <Sword size={13} weight="fill" />;
  if (type.includes("spell")) return <Sparkle size={13} weight="fill" />;
  if (type.includes("death")) return <Skull size={13} weight="fill" />;
  if (type.includes("chat")) return <ChatCircle size={13} weight="fill" />;
  if (type.includes("session")) return <BookOpen size={13} weight="fill" />;
  if (type.includes("loot")) return <Package size={13} weight="fill" />;
  if (type.includes("rest")) return <Moon size={13} weight="fill" />;
  if (type.includes("party") || type.includes("level"))
    return <Users size={13} weight="fill" />;
  return <Crosshair size={13} weight="fill" />;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatDuration(start: string, end: string | undefined) {
  if (!end) return null;
  try {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const mins = Math.round(ms / 60_000);
    return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
  } catch {
    return null;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function EventCard({ event }: { event: GameEvent }) {
  const meta = getEventMeta(event.type);
  const summary = eventSummary(event);
  const isNarration = event.type === "narration";
  const actorName = (
    event.data.characterName ??
    event.data.actorName ??
    event.data.attackerName ??
    event.data.casterName ??
    ""
  ) as string;
  const initials = actorName ? actorName.slice(0, 2).toUpperCase() : "";

  return (
    <Card
      variant="transparent"
      className="rounded-none"
      style={{
        borderBottom: "1px solid var(--border)",
        padding: "0.625rem 0",
      }}
    >
      <div
        style={{
          display: "flex",
          gap: "0.625rem",
          alignItems: "flex-start",
        }}
      >
        {/* Actor avatar */}
        {initials ? (
          <Avatar size="sm" style={{ flexShrink: 0, marginTop: "0.1rem" }}>
            <Avatar.Fallback
              style={{
                background: "var(--surface)",
                color: "var(--accent)",
                fontFamily: "var(--font-heading)",
                fontSize: "0.6rem",
                fontWeight: 700,
              }}
            >
              {initials}
            </Avatar.Fallback>
          </Avatar>
        ) : (
          <div style={{ width: 32, flexShrink: 0 }} />
        )}

        {/* Type chip + content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              marginBottom: "0.25rem",
              flexWrap: "wrap",
            }}
          >
            <Chip size="sm" variant="soft" color={meta.color}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                {eventIcon(event.type)}
                {meta.label}
              </span>
            </Chip>
            <span style={{ color: "var(--muted)", fontSize: "0.72rem" }}>
              {formatTime(event.timestamp)}
            </span>
          </div>
          {isNarration ? (
            <p
              className="prose-narrative"
              style={{ color: "var(--foreground)", fontSize: "0.95rem", margin: 0 }}
            >
              {summary}
            </p>
          ) : (
            <p style={{ color: "var(--foreground)", fontSize: "0.875rem", margin: 0 }}>
              {summary}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}

function SkeletonFeed() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem", paddingTop: "1rem" }}>
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <Skeleton className="h-5 w-20 rounded shrink-0" />
          <Skeleton className="h-4 rounded flex-1" />
          <Skeleton className="h-4 w-12 rounded shrink-0" />
        </div>
      ))}
    </div>
  );
}

function SkeletonNarrations() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
      <Skeleton className="h-4 w-3/4 rounded" />
      <Skeleton className="h-4 w-full rounded" />
      <Skeleton className="h-4 w-5/6 rounded" />
      <Skeleton className="h-4 w-2/3 rounded" />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SessionClient({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [narrations, setNarrations] = useState<Narration[]>([]);

  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingNarrations, setLoadingNarrations] = useState(true);
  const [sessionError, setSessionError] = useState(false);

  const isActiveRef = useRef(false);

  // ── Fetchers ────────────────────────────────────────────────────────────────

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/spectator/sessions/${sessionId}`);
      if (!res.ok) throw new Error("Not found");
      const data = (await res.json()) as Session;
      setSession(data);
      isActiveRef.current = data.isActive;
    } catch {
      setSessionError(true);
    } finally {
      setLoadingSession(false);
    }
  }, [sessionId]);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/spectator/sessions/${sessionId}/events`);
      if (res.ok) {
        const data = (await res.json()) as { events: GameEvent[] };
        setEvents(data.events ?? []);
      }
    } catch {
      /* silent */
    } finally {
      setLoadingEvents(false);
    }
  }, [sessionId]);

  const fetchNarrations = useCallback(async () => {
    try {
      const res = await fetch(
        `${API_BASE}/spectator/narrations?sessionId=${sessionId}&limit=20`,
      );
      if (res.ok) {
        const data = (await res.json()) as { narrations: Narration[] };
        setNarrations(data.narrations ?? []);
      }
    } catch {
      /* silent */
    } finally {
      setLoadingNarrations(false);
    }
  }, [sessionId]);

  // ── Initial load ─────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchSession();
    fetchEvents();
    fetchNarrations();
  }, [fetchSession, fetchEvents, fetchNarrations]);

  // ── Polling (active sessions only) ───────────────────────────────────────────

  useEffect(() => {
    const eventsId = setInterval(() => {
      if (isActiveRef.current) fetchEvents();
    }, 5_000);
    const narrationsId = setInterval(() => {
      if (isActiveRef.current) fetchNarrations();
    }, 8_000);
    return () => {
      clearInterval(eventsId);
      clearInterval(narrationsId);
    };
  }, [fetchEvents, fetchNarrations]);

  // ── Derived ─────────────────────────────────────────────────────────────────

  const duration =
    session ? formatDuration(session.startedAt, session.endedAt) : null;
  const phaseLabel =
    session?.phase
      ? session.phase.charAt(0).toUpperCase() + session.phase.slice(1)
      : null;

  // ── Error state ──────────────────────────────────────────────────────────────

  if (!loadingSession && sessionError) {
    return (
      <div
        className="max-w-5xl mx-auto px-6"
        style={{ textAlign: "center", paddingTop: "5rem" }}
      >
        <p
          className="prose-narrative"
          style={{ color: "var(--muted)", fontSize: "1.125rem" }}
        >
          This session has been lost to the mists. It may never have existed, or it may
          have been struck from the record.
        </p>
      </div>
    );
  }

  // ── Layout ────────────────────────────────────────────────────────────────────

  const sidebarStyle: React.CSSProperties = {
    position: "sticky",
    top: "60px",
    maxHeight: "calc(100dvh - 60px)",
    overflowY: "auto",
    scrollbarWidth: "thin",
    scrollbarColor: "var(--border) transparent",
    paddingTop: "1.5rem",
    paddingBottom: "2rem",
  };

  return (
    <div
      className="max-w-[1400px] mx-auto px-6 pb-16"
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 272px",
        gap: "0 2rem",
      }}
    >
      {/* ── Main column ──────────────────────────────────────────────────────── */}
      <div style={{ minWidth: 0 }}>
        {/* Session header */}
        <header style={{ paddingTop: "1.5rem", paddingBottom: "1.25rem" }}>
          {loadingSession ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              <Skeleton className="h-8 w-64 rounded" />
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Skeleton className="h-5 w-20 rounded" />
                <Skeleton className="h-5 w-16 rounded" />
                <Skeleton className="h-5 w-24 rounded" />
              </div>
              <p
                className="prose-narrative"
                style={{ color: "var(--muted)", fontSize: "0.95rem", marginTop: "0.25rem" }}
              >
                Unrolling the scroll…
              </p>
            </div>
          ) : session ? (
            <>
              <h1
                style={{
                  fontFamily: "var(--font-heading)",
                  color: "var(--accent)",
                  fontSize: "1.875rem",
                  fontWeight: 700,
                  lineHeight: 1.1,
                  marginBottom: "0.5rem",
                }}
              >
                {session.partyName}
              </h1>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  alignItems: "center",
                }}
              >
                {session.isActive ? (
                  <Chip size="sm" variant="soft" color="success">
                    <span
                      style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}
                    >
                      <span
                        className="animate-pulse inline-block rounded-full"
                        style={{
                          width: 6,
                          height: 6,
                          background: "var(--success)",
                          flexShrink: 0,
                        }}
                      />
                      Live
                    </span>
                  </Chip>
                ) : (
                  <Chip size="sm" variant="soft" color="default">
                    Completed
                  </Chip>
                )}

                {phaseLabel && (
                  <Chip size="sm" variant="secondary" color="default">
                    {phaseLabel}
                  </Chip>
                )}

                {session.outcome && (
                  <Chip
                    size="sm"
                    variant="soft"
                    color={session.outcome === "victory" ? "success" : "default"}
                  >
                    {session.outcome}
                  </Chip>
                )}

                {duration && (
                  <Chip size="sm" variant="secondary" color="default">
                    {duration}
                  </Chip>
                )}

                <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                  {formatDate(session.startedAt)}
                </span>
              </div>

              {session.summary && (
                <p
                  className="prose-narrative"
                  style={{
                    color: "var(--muted)",
                    fontSize: "0.95rem",
                    marginTop: "0.75rem",
                    maxWidth: "52rem",
                  }}
                >
                  {session.summary}
                </p>
              )}
            </>
          ) : null}
        </header>

        <Separator />

        {/* Feed heading */}
        {!loadingSession && session && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              paddingTop: "1rem",
              paddingBottom: "0.25rem",
            }}
          >
            <h2
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "0.72rem",
                textTransform: "uppercase",
                letterSpacing: "0.07em",
                color: "var(--muted)",
              }}
            >
              Event Feed
            </h2>
            {events.length > 0 && (
              <span style={{ color: "var(--muted)", fontSize: "0.72rem" }}>
                {events.length} events
              </span>
            )}
          </div>
        )}

        {/* Loading skeleton */}
        {(loadingSession || loadingEvents) && <SkeletonFeed />}

        {/* Empty feed */}
        {!loadingSession && !loadingEvents && events.length === 0 && (
          <p
            style={{
              color: "var(--muted)",
              fontStyle: "italic",
              textAlign: "center",
              padding: "3rem 0",
            }}
          >
            No events have been recorded for this session yet.
          </p>
        )}

        {/* Events */}
        {!loadingEvents && events.length > 0 && (
          <div>
            {events.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>

      {/* ── Narration sidebar ───────────────────────────────────────────────── */}
      <aside style={sidebarStyle}>
        <h2
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "0.72rem",
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            color: "var(--muted)",
            marginBottom: "1rem",
          }}
        >
          Narrations
        </h2>

        {loadingNarrations ? (
          <SkeletonNarrations />
        ) : narrations.length === 0 ? (
          <p
            className="prose-narrative"
            style={{
              color: "var(--muted)",
              fontSize: "0.9rem",
              fontStyle: "italic",
            }}
          >
            The narrator considers…
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {narrations.map((n) => (
              <div
                key={n.id}
                style={{
                  borderLeft: "2px solid var(--accent)",
                  paddingLeft: "0.75rem",
                  paddingTop: "0.125rem",
                  paddingBottom: "0.125rem",
                }}
              >
                <p
                  className="prose-narrative"
                  style={{
                    color: "var(--foreground)",
                    fontSize: "0.9rem",
                    margin: 0,
                    lineHeight: 1.7,
                  }}
                >
                  {n.content}
                </p>
                <p
                  style={{
                    color: "var(--muted)",
                    fontSize: "0.72rem",
                    marginTop: "0.375rem",
                    marginBottom: 0,
                  }}
                >
                  {new Date(n.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}
