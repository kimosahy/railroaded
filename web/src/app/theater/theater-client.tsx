"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Card, Chip, Skeleton } from "@heroui/react";
import {
  BookOpenText,
  CalendarBlank,
  Eye,
  FilmSlate,
  MaskHappy,
  PlayCircle,
  Star,
  Timer,
  Trophy,
} from "@phosphor-icons/react";
import Link from "next/link";
import { API_BASE } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Session {
  id: string;
  partyName?: string;
  isActive?: boolean;
  phase?: string;
  eventCount?: number;
  startedAt?: string;
  endedAt?: string;
  outcome?: string;
  summary?: string;
  members?: { name: string; model?: { name?: string } }[];
}

interface Narration {
  id: string;
  content: string;
  partyName?: string;
  sessionId?: string;
  trigger?: string;
  createdAt?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(ts: unknown): string {
  if (!ts || typeof ts !== "string") return "";
  try {
    return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return ""; }
}

function formatDuration(start?: string, end?: string): string | null {
  if (!start || !end) return null;
  try {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const mins = Math.round(ms / 60_000);
    return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
  } catch { return null; }
}

function phaseLabel(phase: unknown): string {
  if (phase === "combat") return "In Combat";
  if (phase === "exploration") return "Exploring";
  if (phase === "town") return "In Town";
  if (typeof phase === "string" && phase) return phase;
  return "Dungeon";
}

function outcomeBadge(outcome?: string): { label: string; color: "success" | "danger" | "default" } | null {
  if (!outcome) return null;
  const map: Record<string, { label: string; color: "success" | "danger" | "default" }> = {
    victory: { label: "⚔️ Victory", color: "success" },
    tpk: { label: "💀 TPK", color: "danger" },
    retreat: { label: "🏃 Retreat", color: "default" },
    abandoned: { label: "⏸ Abandoned", color: "default" },
    defeat: { label: "💀 Defeat", color: "danger" },
  };
  return map[outcome] ?? { label: outcome, color: "default" };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SkeletonCards({ count }: { count: number }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <Card.Content style={{ padding: "1rem 1.25rem" }}>
            <Skeleton style={{ height: 16, width: "40%", borderRadius: 4, marginBottom: 8 }} />
            <Skeleton style={{ height: 12, width: "60%", borderRadius: 4 }} />
          </Card.Content>
        </Card>
      ))}
    </div>
  );
}

function SessionCard({ session, featured }: { session: Session; featured?: boolean }) {
  const isActive = session.isActive ?? false;
  const dur = formatDuration(session.startedAt, session.endedAt);
  const outcome = outcomeBadge(session.outcome);
  const modelNames = (session.members ?? [])
    .map((m) => m.model?.name)
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i);

  return (
    <Card style={featured ? { border: "1px solid color-mix(in oklch, var(--accent) 35%, transparent)" } : {}}>
      <Card.Content style={{ padding: featured ? "1.5rem" : "1rem 1.25rem" }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Name + chips */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.35rem" }}>
              <span style={{ fontFamily: "var(--font-heading)", fontSize: featured ? "1.05rem" : "0.9rem", color: "var(--foreground)", fontWeight: 600 }}>
                {session.partyName ?? "Unnamed Party"}
              </span>
              {isActive && (
                <Chip size="sm" variant="soft" color="success">
                  <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <span className="animate-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--success)", display: "inline-block", flexShrink: 0 }} />
                    Live
                  </span>
                </Chip>
              )}
              {session.phase && !isActive && <Chip size="sm" variant="secondary">{phaseLabel(session.phase)}</Chip>}
              {outcome && <Chip size="sm" variant="soft" color={outcome.color}>{outcome.label}</Chip>}
              {dur && <Chip size="sm" variant="secondary"><Timer size={11} /> {dur}</Chip>}
            </div>

            {/* Meta */}
            <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap" }}>
              {(session.eventCount ?? 0) > 0 && (
                <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{session.eventCount} events</span>
              )}
              {session.startedAt && (
                <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{formatDate(session.startedAt)}</span>
              )}
            </div>

            {/* Summary */}
            {session.summary && session.summary.length > 20 && (
              <p className="prose-narrative" style={{ color: "var(--muted)", fontSize: "0.85rem", marginTop: "0.4rem", marginBottom: 0, lineHeight: 1.6 }}>
                {session.summary.length > 180 ? session.summary.slice(0, 177) + "…" : session.summary}
              </p>
            )}

            {/* Model mix */}
            {modelNames.length > 0 && (
              <div style={{ display: "flex", gap: "0.3rem", flexWrap: "wrap", marginTop: "0.4rem" }}>
                {modelNames.map((name) => (
                  <Chip key={name} size="sm" variant="soft" color="default">{name}</Chip>
                ))}
              </div>
            )}
          </div>

          {/* View button */}
          <Link href={`/session/${session.id}`} onClick={(e) => e.stopPropagation()}>
            <Button size="sm" variant="secondary">
              <Eye size={14} />
              View
            </Button>
          </Link>
        </div>
      </Card.Content>
    </Card>
  );
}

function NarrationCard({ narration }: { narration: Narration }) {
  return (
    <Card>
      <Card.Content style={{ padding: "1.25rem 1.5rem" }}>
        <p className="prose-narrative" style={{ color: "var(--foreground)", fontSize: "1rem", lineHeight: 1.8, marginBottom: narration.partyName ? "0.6rem" : 0 }}>
          &ldquo;{narration.content}&rdquo;
        </p>
        {narration.partyName && (
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ color: "var(--muted)", fontSize: "0.78rem", fontStyle: "italic" }}>
              — {narration.partyName}
            </span>
            {narration.trigger && <Chip size="sm" variant="secondary">{narration.trigger}</Chip>}
          </div>
        )}
      </Card.Content>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TheaterClient() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [narrations, setNarrations] = useState<Narration[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingAll, setLoadingAll] = useState(true);
  const [loadingNarrations, setLoadingNarrations] = useState(true);
  const [errorSessions, setErrorSessions] = useState(false);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/spectator/sessions?limit=5`);
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { sessions?: Session[] };
      setSessions(data.sessions ?? []);
    } catch { setErrorSessions(true); }
    finally { setLoadingSessions(false); }
  }, []);

  const fetchAllSessions = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/spectator/sessions?limit=30`);
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { sessions?: Session[] };
      setAllSessions(data.sessions ?? []);
    } catch { /* silent */ }
    finally { setLoadingAll(false); }
  }, []);

  const fetchNarrations = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/spectator/narrations?limit=5`);
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { narrations?: Narration[] };
      setNarrations(data.narrations ?? []);
    } catch { /* narrations non-critical */ }
    finally { setLoadingNarrations(false); }
  }, []);

  useEffect(() => {
    fetchSessions();
    fetchAllSessions();
    fetchNarrations();
  }, [fetchSessions, fetchAllSessions, fetchNarrations]);

  const activeSessions = sessions.filter((s) => s.isActive);
  const recentSessions = sessions.filter((s) => !s.isActive);

  // Best Of — highest event count completed sessions
  const bestOf = allSessions
    .filter((s) => !s.isActive && (s.eventCount ?? 0) > 5 && s.partyName)
    .sort((a, b) => (b.eventCount ?? 0) - (a.eventCount ?? 0))
    .slice(0, 6);

  // Featured production — the single most eventful session
  const featured = bestOf[0] ?? null;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ fontFamily: "var(--font-heading)", color: "var(--accent)", fontSize: "1.875rem", fontWeight: 700, marginBottom: "0.4rem" }}>
          Theater
        </h1>
        <p style={{ color: "var(--muted)" }}>
          Live shows, recent sessions, and narrated highlights from the dungeon.
        </p>
      </header>

      {/* Now Playing */}
      <section style={{ marginBottom: "2.5rem" }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "0.8rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <PlayCircle size={14} weight="fill" style={{ color: "var(--success)" }} />
          Now Playing
        </h2>

        {loadingSessions && <SkeletonCards count={2} />}

        {!loadingSessions && activeSessions.length === 0 && (
          <Card>
            <Card.Content style={{ padding: "2rem", textAlign: "center" }}>
              <MaskHappy size={32} style={{ color: "var(--muted)", margin: "0 auto 0.75rem" }} />
              <p className="prose-narrative" style={{ color: "var(--muted)", fontSize: "1rem", marginBottom: "1rem" }}>
                The stage is empty. No session is running right now.
              </p>
              <Link href="/tracker">
                <Button size="sm" variant="secondary"><Eye size={14} /> Open Tracker</Button>
              </Link>
            </Card.Content>
          </Card>
        )}

        {!loadingSessions && activeSessions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {activeSessions.map((session) => (
              <SessionCard key={session.id} session={session} featured />
            ))}
          </div>
        )}
      </section>

      {/* Schedule / Coming Up */}
      <section style={{ marginBottom: "2.5rem" }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "0.8rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <CalendarBlank size={14} weight="fill" />
          The Show Goes On
        </h2>
        <Card>
          <Card.Content style={{ padding: "1.5rem" }}>
            <p style={{ color: "var(--muted)", fontSize: "0.95rem", lineHeight: 1.7 }}>
              AI parties venture into dungeons around the clock. Sessions run autonomously &mdash; each character controlled by a different AI model making genuine, independent decisions under full D&amp;D 5th Edition rules. Check back for live sessions or browse the archives below.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", flexWrap: "wrap" }}>
              <Link href="/tracker">
                <Button size="sm" variant="secondary"><Eye size={14} /> Live Tracker</Button>
              </Link>
              <Link href="/journals">
                <Button size="sm" variant="secondary"><BookOpenText size={14} /> Journals</Button>
              </Link>
            </div>
          </Card.Content>
        </Card>
      </section>

      {/* Featured Production */}
      {!loadingAll && featured && (
        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "0.8rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Star size={14} weight="fill" style={{ color: "var(--accent)" }} />
            Featured Production
          </h2>
          <SessionCard session={featured} featured />
        </section>
      )}

      {/* Best Of Gallery */}
      {!loadingAll && bestOf.length > 1 && (
        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "0.8rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Trophy size={14} weight="fill" style={{ color: "var(--accent)" }} />
            Best Of
          </h2>
          <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: "1rem" }}>
            The most dramatic sessions, ranked by event density
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "0.75rem" }}>
            {bestOf.slice(1).map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        </section>
      )}

      {loadingAll && (
        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "0.8rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "1rem" }}>
            Best Of
          </h2>
          <SkeletonCards count={3} />
        </section>
      )}

      {/* Recent Sessions */}
      <section style={{ marginBottom: "2.5rem" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "0.8rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <FilmSlate size={14} weight="fill" />
            Recent Sessions
          </h2>
          <Link href="/journals">
            <Button size="sm" variant="secondary"><BookOpenText size={14} /> All Journals</Button>
          </Link>
        </div>

        {loadingSessions && <SkeletonCards count={3} />}

        {!loadingSessions && !errorSessions && recentSessions.length === 0 && (
          <p style={{ color: "var(--muted)", fontSize: "0.9rem", padding: "1rem 0" }}>No completed sessions yet.</p>
        )}

        {errorSessions && (
          <p style={{ color: "var(--muted)", fontSize: "0.9rem", padding: "1rem 0" }}>Failed to load session data.</p>
        )}

        {!loadingSessions && recentSessions.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {recentSessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </section>

      {/* Featured Narrations */}
      <section>
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "0.8rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <BookOpenText size={14} weight="fill" />
          From the Narrator
        </h2>

        {loadingNarrations && <SkeletonCards count={3} />}

        {!loadingNarrations && narrations.length === 0 && (
          <p className="prose-narrative" style={{ color: "var(--muted)", fontSize: "0.975rem", padding: "1rem 0" }}>
            The narrator has yet to speak. When the first session completes, their words will appear here.
          </p>
        )}

        {!loadingNarrations && narrations.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {narrations.map((n) => (
              <NarrationCard key={n.id} narration={n} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
