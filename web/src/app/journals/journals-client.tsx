"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Accordion, Button, Chip, Select, ListBoxItem, Skeleton } from "@heroui/react";
import {
  BookOpen,
  ChatCircle,
  Crosshair,
  RssSimple,
  Skull,
  Sparkle,
  Sword,
  Users,
} from "@phosphor-icons/react";
import { API_BASE } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface GameEvent {
  id: string;
  type: string;
  data: Record<string, unknown>;
  timestamp: string;
  actorId?: string;
}

interface JournalSession {
  sessionId: string;
  partyId: string;
  partyName: string;
  startedAt: string;
  endedAt?: string;
  outcome?: string;
  eventCount: number;
  events: GameEvent[];
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

function getEventMeta(type: string): { label: string; color: "default" | "accent" | "success" | "danger" | "warning" } {
  return EVENT_META[type] ?? { label: type.replace(/_/g, " "), color: "default" };
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
      return content.length > 140 ? content.slice(0, 137) + "…" : content;
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
      const desc =
        (d.description ?? d.message ?? d.content ?? d.summary ?? "") as string;
      return desc.length > 140 ? desc.slice(0, 137) + "…" : desc || event.type;
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

// ─── Sub-components ───────────────────────────────────────────────────────────

function EventRow({ event }: { event: GameEvent }) {
  const meta = getEventMeta(event.type);
  const summary = eventSummary(event);
  const isNarration = event.type === "narration";

  return (
    <div
      style={{
        display: "flex",
        gap: "0.75rem",
        alignItems: "flex-start",
        paddingBottom: "0.75rem",
        borderBottom: "1px solid var(--border)",
      }}
    >
      {/* Icon + chip */}
      <div style={{ paddingTop: "0.1rem", flexShrink: 0 }}>
        <Chip size="sm" variant="soft" color={meta.color}>
          <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
            {eventIcon(event.type)}
            {meta.label}
          </span>
        </Chip>
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
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
        <span style={{ color: "var(--muted)", fontSize: "0.72rem" }}>
          {formatDate(event.timestamp)}
        </span>
      </div>
    </div>
  );
}

function SessionCard({ session }: { session: JournalSession }) {
  const duration =
    session.endedAt
      ? (() => {
          const ms =
            new Date(session.endedAt).getTime() -
            new Date(session.startedAt).getTime();
          const mins = Math.round(ms / 60_000);
          return mins >= 60
            ? `${Math.floor(mins / 60)}h ${mins % 60}m`
            : `${mins}m`;
        })()
      : null;

  return (
    <div style={{ padding: "0.75rem 0" }}>
      {/* Session meta */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.5rem",
          marginBottom: "0.75rem",
          alignItems: "center",
        }}
      >
        <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
          {formatDate(session.startedAt)}
        </span>
        {duration && (
          <Chip size="sm" variant="secondary" color="default">
            {duration}
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
        <span style={{ color: "var(--muted)", fontSize: "0.8rem", marginLeft: "auto" }}>
          {session.eventCount} events
        </span>
      </div>

      {/* Events */}
      {session.events.length === 0 ? (
        <p style={{ color: "var(--muted)", fontSize: "0.875rem", fontStyle: "italic" }}>
          No events recorded for this session.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {session.events.map((ev) => (
            <EventRow key={ev.id} event={ev} />
          ))}
        </div>
      )}
    </div>
  );
}

function SkeletonSessions() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          style={{
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            padding: "1rem 1.25rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <Skeleton className="h-5 w-48 rounded" />
            <Skeleton className="h-5 w-20 rounded" />
            <Skeleton className="h-5 w-16 rounded ml-auto" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function JournalsClient() {
  const [journals, setJournals] = useState<JournalSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [characterFilter, setCharacterFilter] = useState("");
  const [sessionFilter, setSessionFilter] = useState("");

  const fetchJournals = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/spectator/journals?limit=20&offset=0`);
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { journals?: JournalSession[] };
      setJournals(data.journals ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJournals();
  }, [fetchJournals]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const allCharacters = useMemo(() => {
    const names = new Set<string>();
    for (const session of journals) {
      for (const ev of session.events) {
        const d = ev.data;
        const name =
          (d.characterName ?? d.actorName ?? d.attackerName ?? "") as string;
        if (name) names.add(name);
      }
    }
    return Array.from(names).sort();
  }, [journals]);

  const filteredJournals = useMemo(() => {
    let result = journals;
    if (sessionFilter) {
      result = result.filter((j) => j.sessionId === sessionFilter);
    }
    if (characterFilter) {
      result = result.filter((j) =>
        j.events.some((ev) => {
          const d = ev.data;
          const name =
            (d.characterName ?? d.actorName ?? d.attackerName ?? "") as string;
          return name === characterFilter;
        }),
      );
    }
    return result;
  }, [journals, sessionFilter, characterFilter]);

  const hasFilters = !!(sessionFilter || characterFilter);

  // ── Shared select style ────────────────────────────────────────────────────

  const selectStyle: React.CSSProperties = {
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "0.375rem",
    color: "var(--foreground)",
    fontSize: "0.875rem",
    padding: "0.375rem 0.625rem",
    cursor: "pointer",
    outline: "none",
    minWidth: "10rem",
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "1rem",
          marginBottom: "1.75rem",
        }}
      >
        <div>
          <h1
            style={{
              fontFamily: "var(--font-heading)",
              color: "var(--accent)",
              fontSize: "1.875rem",
              fontWeight: 700,
              lineHeight: 1.1,
              marginBottom: "0.375rem",
            }}
          >
            Journals
          </h1>
          <p style={{ color: "var(--muted)", fontSize: "1rem" }}>
            Chronicles of every session — battles, words, and the deeds of AI adventurers.
          </p>
        </div>

        <a
          href={`${API_BASE}/spectator/journals/rss`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            padding: "0.375rem 0.75rem",
            border: "1px solid var(--border)",
            borderRadius: "0.375rem",
            color: "var(--muted)",
            fontSize: "0.875rem",
            textDecoration: "none",
            background: "transparent",
            cursor: "pointer",
          }}
        >
          <RssSimple size={15} weight="fill" />
          RSS Feed
        </a>
      </header>

      {/* Filters */}
      {!loading && journals.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            flexWrap: "wrap",
            alignItems: "center",
            marginBottom: "1.5rem",
          }}
        >
          {/* Session filter */}
          <Select
            aria-label="Filter by session"
            placeholder="All Sessions"
            selectedKey={sessionFilter}
            onSelectionChange={(key) => setSessionFilter(key as string)}
            style={{ minWidth: "10rem" }}
          >
            <Select.Trigger style={selectStyle}>
              <Select.Value />
            </Select.Trigger>
            <Select.Popover
              className="rounded-lg border border-divider shadow-lg z-50"
              style={{ background: "var(--surface)" }}
            >
              <ListBoxItem id="" textValue="All Sessions">All Sessions</ListBoxItem>
              {journals.map((j) => (
                <ListBoxItem key={j.sessionId} id={j.sessionId} textValue={`${j.partyName} — ${formatDate(j.startedAt)}`}>
                  {j.partyName} — {formatDate(j.startedAt)}
                </ListBoxItem>
              ))}
            </Select.Popover>
          </Select>

          {/* Character filter */}
          {allCharacters.length > 0 && (
            <Select
              aria-label="Filter by character"
              placeholder="All Characters"
              selectedKey={characterFilter}
              onSelectionChange={(key) => setCharacterFilter(key as string)}
              style={{ minWidth: "10rem" }}
            >
              <Select.Trigger style={selectStyle}>
                <Select.Value />
              </Select.Trigger>
              <Select.Popover
                className="rounded-lg border border-divider shadow-lg z-50"
                style={{ background: "var(--surface)" }}
              >
                <ListBoxItem id="" textValue="All Characters">All Characters</ListBoxItem>
                {allCharacters.map((name) => (
                  <ListBoxItem key={name} id={name} textValue={name}>
                    {name}
                  </ListBoxItem>
                ))}
              </Select.Popover>
            </Select>
          )}

          {hasFilters && (
            <Button
              size="sm"
              variant="secondary"
              onPress={() => {
                setSessionFilter("");
                setCharacterFilter("");
              }}
            >
              Clear
            </Button>
          )}
        </div>
      )}

      {/* Loading */}
      {loading && <SkeletonSessions />}

      {/* Error */}
      {!loading && error && (
        <p
          style={{
            color: "var(--muted)",
            textAlign: "center",
            padding: "3rem 0",
            fontStyle: "italic",
          }}
        >
          The archives are temporarily unavailable. Try again shortly.
        </p>
      )}

      {/* Empty — no sessions at all */}
      {!loading && !error && journals.length === 0 && (
        <div style={{ textAlign: "center", padding: "4rem 0" }}>
          <p
            className="prose-narrative"
            style={{
              color: "var(--muted)",
              fontSize: "1.125rem",
              maxWidth: "38rem",
              margin: "0 auto",
            }}
          >
            No sessions have been chronicled. The ink is dry, the pages blank.
            Every story begins with someone willing to sit down and play.
          </p>
        </div>
      )}

      {/* Empty — filters match nothing */}
      {!loading && !error && journals.length > 0 && filteredJournals.length === 0 && (
        <p
          style={{
            color: "var(--muted)",
            textAlign: "center",
            padding: "3rem 0",
            fontStyle: "italic",
          }}
        >
          No sessions match the current filters.
        </p>
      )}

      {/* Sessions accordion */}
      {!loading && !error && filteredJournals.length > 0 && (
        <Accordion allowsMultipleExpanded>
          {filteredJournals.map((session) => (
            <Accordion.Item key={session.sessionId} id={session.sessionId}>
              <Accordion.Heading>
                <Accordion.Trigger
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                    padding: "0.875rem 0",
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flex: 1, minWidth: 0 }}>
                    <BookOpen size={16} weight="fill" style={{ color: "var(--accent)", flexShrink: 0 }} />
                    <span
                      style={{
                        fontFamily: "var(--font-heading)",
                        fontSize: "0.975rem",
                        fontWeight: 600,
                        color: "var(--foreground)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {session.partyName}
                    </span>
                    <Chip size="sm" variant="secondary" color="default" style={{ flexShrink: 0 }}>
                      {session.eventCount} events
                    </Chip>
                    {session.outcome && (
                      <Chip
                        size="sm"
                        variant="soft"
                        color={session.outcome === "victory" ? "success" : "default"}
                        style={{ flexShrink: 0 }}
                      >
                        {session.outcome}
                      </Chip>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexShrink: 0 }}>
                    <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>
                      {formatDate(session.startedAt)}
                    </span>
                    <Accordion.Indicator />
                  </div>
                </Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <Accordion.Body style={{ paddingBottom: "1rem" }}>
                  <SessionCard session={session} />
                </Accordion.Body>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      )}
    </div>
  );
}
