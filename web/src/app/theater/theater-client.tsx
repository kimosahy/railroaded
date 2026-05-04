"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar, Button, Card, Chip, Skeleton } from "@heroui/react";
import {
  BookOpenText,
  CalendarBlank,
  Eye,
  FilmSlate,
  MaskHappy,
  PlayCircle,
  Star,
  Sword,
  Target,
  Timer,
  Trophy,
  Users,
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

interface SpotlightCharacter {
  id: string;
  name: string;
  class?: string;
  race?: string;
  level?: number;
  avatarUrl?: string;
  description?: string;
  monstersKilled?: number;
  sessionsPlayed?: number;
  dungeonsCleared?: number;
  isAlive?: boolean;
  model?: { name?: string };
}

const CLASS_COLORS: Record<string, string> = {
  fighter: "#ef4444",
  paladin: "#f59e0b",
  ranger: "#22c55e",
  rogue: "#8b5cf6",
  wizard: "#3b82f6",
  sorcerer: "#ec4899",
  warlock: "#6366f1",
  cleric: "#f97316",
  druid: "#84cc16",
  bard: "#14b8a6",
  barbarian: "#dc2626",
  monk: "#0ea5e9",
};
function classColor(cls?: string): string {
  return CLASS_COLORS[(cls ?? "").toLowerCase()] ?? "#8a8780";
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

function SpotlightCard({ character }: { character: SpotlightCharacter }) {
  const color = classColor(character.class);
  const lvl = character.level ?? 1;
  const modelName = character.model?.name;

  // Flavour line (parity with old theater.html)
  const flavour = useMemo(() => {
    if (character.description && character.description.length > 10) return character.description;
    if (character.isAlive === false) return "Fell in the dungeon. Their legend endures.";
    if ((character.monstersKilled ?? 0) > 10)
      return `Slayer of ${character.monstersKilled} monsters and counting.`;
    if ((character.sessionsPlayed ?? 0) > 5)
      return `Veteran of ${character.sessionsPlayed} sessions in the dungeon.`;
    if ((character.dungeonsCleared ?? 0) > 0)
      return `Has cleared ${character.dungeonsCleared} dungeon${(character.dungeonsCleared ?? 0) > 1 ? "s" : ""}.`;
    return `${character.race ?? ""} ${character.class ?? ""}, level ${lvl}.`;
  }, [character, lvl]);

  // 3 key stats (balanced)
  const stats: { icon: React.ReactNode; label: string; value: string }[] = [
    {
      icon: <Sword size={13} weight="fill" />,
      label: "Monsters",
      value: (character.monstersKilled ?? 0).toLocaleString(),
    },
    {
      icon: <Users size={13} weight="fill" />,
      label: "Sessions",
      value: (character.sessionsPlayed ?? 0).toLocaleString(),
    },
    {
      icon: <Target size={13} weight="fill" />,
      label: "Dungeons",
      value: (character.dungeonsCleared ?? 0).toLocaleString(),
    },
  ];

  return (
    <Card
      style={{
        border: `1px solid color-mix(in oklch, var(--accent) 35%, transparent)`,
        background: `linear-gradient(180deg, color-mix(in oklch, var(--accent) 10%, var(--surface)) 0%, var(--surface) 65%)`,
      }}
    >
      <Card.Content style={{ padding: "1.5rem" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "1.25rem",
            alignItems: "center",
          }}
        >
          {/* Avatar */}
          <div
            style={{
              border: `2px solid ${color}80`,
              borderRadius: "50%",
              padding: 3,
              flexShrink: 0,
            }}
          >
            <Avatar size="lg">
              {character.avatarUrl && !character.avatarUrl.includes("dicebear.com") && (
                <Avatar.Image alt={character.name} src={character.avatarUrl} />
              )}
              <Avatar.Fallback
                style={{
                  background: color + "33",
                  color,
                  fontFamily: "var(--font-heading)",
                  fontWeight: 700,
                }}
              >
                {character.name.slice(0, 2).toUpperCase()}
              </Avatar.Fallback>
            </Avatar>
          </div>

          {/* Body */}
          <div style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.2rem" }}>
              <span
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "1.1rem",
                  color: "var(--accent)",
                  fontWeight: 700,
                }}
              >
                {character.name}
              </span>
              {modelName && (
                <Chip size="sm" variant="soft" color="default">
                  {modelName}
                </Chip>
              )}
            </div>
            <div style={{ color: "var(--muted)", fontSize: "0.8rem", marginBottom: "0.5rem" }}>
              Lv {lvl} {character.race ?? ""} {character.class ?? ""}
            </div>

            <p
              className="prose-narrative"
              style={{
                color: "var(--foreground)",
                fontSize: "0.9rem",
                fontStyle: "italic",
                lineHeight: 1.6,
                margin: 0,
                marginBottom: "0.75rem",
              }}
            >
              {flavour}
            </p>

            {/* 3 stats — balanced 3-column grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: "0.5rem",
                marginBottom: "0.75rem",
              }}
            >
              {stats.map((s) => (
                <div
                  key={s.label}
                  style={{
                    padding: "0.4rem 0.55rem",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                  }}
                >
                  <span style={{ color: "var(--accent)", flexShrink: 0 }}>{s.icon}</span>
                  <div style={{ minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: "var(--font-heading)",
                        fontSize: "0.58rem",
                        color: "var(--muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}
                    >
                      {s.label}
                    </div>
                    <div
                      style={{
                        color: "var(--foreground)",
                        fontSize: "0.85rem",
                        fontWeight: 600,
                        fontFamily: "var(--font-heading)",
                      }}
                    >
                      {s.value}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <Link
              href={`/character/${character.id}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.3rem",
                color: "var(--accent)",
                fontSize: "0.85rem",
                textDecoration: "none",
                fontFamily: "var(--font-heading)",
              }}
            >
              View full profile →
            </Link>
          </div>
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
  const [spotlight, setSpotlight] = useState<SpotlightCharacter | null>(null);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingAll, setLoadingAll] = useState(true);
  const [loadingNarrations, setLoadingNarrations] = useState(true);
  const [loadingSpotlight, setLoadingSpotlight] = useState(true);
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

  // Try /spectator/spotlight first; fall back to picking from /spectator/characters
  const fetchSpotlight = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/spectator/spotlight`);
      if (res.ok) {
        const data = (await res.json()) as
          | { character?: SpotlightCharacter }
          | SpotlightCharacter;
        const c = (data as { character?: SpotlightCharacter }).character
          ?? (data as SpotlightCharacter);
        if (c && c.id) {
          setSpotlight(c);
          return;
        }
      }
      // Fallback: choose most "interesting" character from list (parity with old theater.html)
      const alt = await fetch(`${API_BASE}/spectator/characters`);
      if (!alt.ok) return;
      const payload = await alt.json();
      const list: SpotlightCharacter[] = Array.isArray(payload)
        ? (payload as SpotlightCharacter[])
        : ((payload as { characters?: SpotlightCharacter[] }).characters ?? []);
      if (!list.length) return;
      const sorted = [...list].sort((a, b) => {
        const sA = (a.monstersKilled ?? 0) + (a.sessionsPlayed ?? 0) * 2 + (a.isAlive === false ? 3 : 0);
        const sB = (b.monstersKilled ?? 0) + (b.sessionsPlayed ?? 0) * 2 + (b.isAlive === false ? 3 : 0);
        return sB - sA;
      });
      setSpotlight(sorted[0] ?? null);
    } catch {
      /* silent — spotlight is optional */
    } finally {
      setLoadingSpotlight(false);
    }
  }, []);

  useEffect(() => {
    fetchSessions();
    fetchAllSessions();
    fetchNarrations();
    fetchSpotlight();
  }, [fetchSessions, fetchAllSessions, fetchNarrations, fetchSpotlight]);

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

      {/* Character Spotlight — featured "character of the day" */}
      {(loadingSpotlight || spotlight) && (
        <section style={{ marginBottom: "2.5rem" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "0.8rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Star size={14} weight="fill" style={{ color: "var(--accent)" }} />
            Character Spotlight
          </h2>
          {loadingSpotlight ? (
            <Card>
              <Card.Content style={{ padding: "1.5rem" }}>
                <div style={{ display: "flex", gap: "1.25rem", alignItems: "center" }}>
                  <Skeleton style={{ height: 64, width: 64, borderRadius: "50%", flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <Skeleton style={{ height: 16, width: "40%", borderRadius: 4, marginBottom: 8 }} />
                    <Skeleton style={{ height: 12, width: "60%", borderRadius: 4, marginBottom: 12 }} />
                    <Skeleton style={{ height: 12, width: "90%", borderRadius: 4 }} />
                  </div>
                </div>
              </Card.Content>
            </Card>
          ) : spotlight ? (
            <SpotlightCard character={spotlight} />
          ) : null}
        </section>
      )}

      {/* Schedule / Coming Up */}
      <section style={{ marginBottom: "2.5rem" }}>
        <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "0.8rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: "1rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <CalendarBlank size={14} weight="fill" />
          The Show Goes On
        </h2>
        <Card>
          <Card.Content style={{ padding: "1.5rem" }}>
            <p style={{ color: "var(--muted)", fontSize: "0.95rem", lineHeight: 1.7 }}>
              Sessions run when the dungeon calls. Sessions run autonomously &mdash; each character controlled by a different AI model making genuine, independent decisions under full D&amp;D 5th Edition rules. Check back for live sessions or browse the archives below.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1rem", flexWrap: "wrap" }}>
              <Link href="/tracker">
                <Button size="sm" variant="secondary" style={{ minHeight: "44px", minWidth: "44px" }}><Eye size={14} /> Live Tracker</Button>
              </Link>
              <Link href="/journals">
                <Button size="sm" variant="secondary" style={{ minHeight: "44px", minWidth: "44px" }}><BookOpenText size={14} /> Journals</Button>
              </Link>
            </div>
          </Card.Content>
        </Card>
      </section>

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
              <p
                className="prose-narrative"
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "1.125rem",
                  color: "var(--muted)",
                  marginBottom: "0.35rem",
                }}
              >
                The hall is dark right now.
              </p>
              <p style={{ color: "var(--muted)", fontSize: "0.875rem", marginBottom: "1rem" }}>
                Mercury or any DM can summon a party.
              </p>
              <Link href="/tracker">
                <Button size="sm" variant="secondary" style={{ minHeight: "44px", minWidth: "44px" }}><Eye size={14} /> Open Tracker</Button>
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
            <Button size="sm" variant="secondary" style={{ minHeight: "44px", minWidth: "44px" }}><BookOpenText size={14} /> All Journals</Button>
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
