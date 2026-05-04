"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Accordion, Avatar, Button, Chip, ListBox, ListBoxItem, Select, Skeleton } from "@heroui/react";
import {
  BookOpen,
  RssSimple,
  ShareNetwork,
  X,
} from "@phosphor-icons/react";
import { API_BASE } from "@/lib/api";
import { formatTimestamp } from "@/lib/format-time";
import { useCharacterDrawer } from "@/components/character-drawer-provider";

// ─── Types ────────────────────────────────────────────────────────────────────

interface JournalEntry {
  partyId: string;
  partyName: string;
  memberNames: string[];
  memberIds: string[];
  summary: string | null;
  eventCount: number;
}

interface Narration {
  id: string;
  content: string;
  createdAt?: string;
  sessionId?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const NARRATOR_FALLBACK_AVATAR = "https://files.catbox.moe/ns31js.jpg";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(iso?: string) {
  if (!iso) return "";
  return formatTimestamp(iso);
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message }: { message: string }) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: "2rem",
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--surface)",
        color: "var(--foreground)",
        border: "1px solid var(--accent)",
        borderRadius: "0.5rem",
        padding: "0.625rem 1rem",
        fontSize: "0.875rem",
        fontFamily: "var(--font-heading)",
        zIndex: 1000,
        boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
        animation: "toastFade 2.2s ease-out forwards",
      }}
    >
      {message}
      <style>{`@keyframes toastFade { 0% { opacity: 0; transform: translate(-50%, 10px); } 15% { opacity: 1; transform: translate(-50%, 0); } 85% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, 10px); } }`}</style>
    </div>
  );
}

// ─── Narrator panel ───────────────────────────────────────────────────────────

function NarratorPanel({
  narrations,
  loading,
  avatarUrl,
}: {
  narrations: Narration[];
  loading: boolean;
  avatarUrl: string;
}) {
  return (
    <section
      style={{
        border: "1px solid var(--border)",
        borderRadius: "0.5rem",
        padding: "1rem 1.25rem",
        marginBottom: "1rem",
        background: "var(--surface)",
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          marginBottom: narrations.length > 0 ? "0.875rem" : 0,
        }}
      >
        <Avatar size="md">
          <Avatar.Image alt="Poormetheus" src={avatarUrl} />
          <Avatar.Fallback
            style={{
              background: "var(--accent)",
              color: "var(--background)",
              fontFamily: "var(--font-heading)",
              fontWeight: 700,
            }}
          >
            P
          </Avatar.Fallback>
        </Avatar>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "1rem",
              color: "var(--accent)",
              fontWeight: 600,
              lineHeight: 1.2,
            }}
          >
            Poormetheus
          </div>
          <div style={{ color: "var(--muted)", fontSize: "0.75rem", fontStyle: "italic" }}>
            Narrator — Chronicler of dungeons, narrator of fools.
          </div>
        </div>
      </header>

      {/* Body */}
      {loading ? (
        <Skeleton style={{ height: 48, width: "100%", borderRadius: 4 }} />
      ) : narrations.length === 0 ? (
        <p
          className="prose-narrative"
          style={{
            color: "var(--muted)",
            fontSize: "0.875rem",
            fontStyle: "italic",
            margin: 0,
          }}
        >
          The narrator is silent... for now.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {narrations.map((n) => (
            <div
              key={n.id}
              style={{
                paddingBottom: "0.625rem",
                borderBottom: "1px dashed var(--border)",
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
              {n.createdAt && (
                <span style={{ color: "var(--muted)", fontSize: "0.7rem" }}>
                  {formatTime(n.createdAt)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── Journal card ─────────────────────────────────────────────────────────────

function JournalCard({ entry }: { entry: JournalEntry }) {
  const { openDrawer } = useCharacterDrawer();
  return (
    <div style={{ padding: "0.5rem 0 0.25rem" }}>
      {/* Members */}
      {entry.memberNames.length > 0 && (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: "0.375rem",
            alignItems: "center",
            marginBottom: "1rem",
          }}
        >
          <span style={{ color: "var(--muted)", fontSize: "0.8rem", marginRight: "0.25rem" }}>
            Members:
          </span>
          {entry.memberNames.map((name, i) => {
            const memberId = entry.memberIds?.[i];
            if (memberId) {
              return (
                <Chip
                  key={`${memberId}-${name}`}
                  size="sm"
                  variant="secondary"
                  color="default"
                  onClick={() => openDrawer(memberId, null)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e: React.KeyboardEvent<HTMLSpanElement>) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openDrawer(memberId, null);
                    }
                  }}
                  style={{ cursor: "pointer" }}
                  aria-label={`Open character details for ${name}`}
                >
                  {name}
                </Chip>
              );
            }
            return (
              <Chip key={name} size="sm" variant="secondary" color="default">
                {name}
              </Chip>
            );
          })}
        </div>
      )}

      {/* Summary in narrative prose */}
      {entry.summary && entry.summary.trim().length > 0 ? (
        <p
          className="prose-narrative"
          style={{
            color: "var(--foreground)",
            fontSize: "0.95rem",
            lineHeight: 1.8,
            margin: 0,
            whiteSpace: "pre-wrap",
          }}
        >
          {entry.summary}
        </p>
      ) : (
        <p
          className="prose-narrative"
          style={{
            color: "var(--muted)",
            fontSize: "0.9rem",
            fontStyle: "italic",
            margin: 0,
            lineHeight: 1.7,
          }}
        >
          The chronicler has not yet set down this session&apos;s events.
        </p>
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
  const searchParams = useSearchParams();

  const [journals, setJournals] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [partyFilter, setPartyFilter] = useState("");

  const [narrations, setNarrations] = useState<Narration[]>([]);
  const [loadingNarrations, setLoadingNarrations] = useState(true);
  const [narratorAvatar, setNarratorAvatar] = useState<string>(NARRATOR_FALLBACK_AVATAR);

  const [toast, setToast] = useState<string | null>(null);

  // ── Deep-link support ──────────────────────────────────────────────────────

  useEffect(() => {
    const p = searchParams.get("party");
    if (p) setPartyFilter(p);
  }, [searchParams]);

  // ── Fetch journals ─────────────────────────────────────────────────────────

  const fetchJournals = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/spectator/journals?limit=20&offset=0`);
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { journals?: JournalEntry[] };
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

  // ── Narrator avatar (try parties endpoint for Poormetheus) ─────────────────

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/spectator/parties`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          parties?: { members?: { name?: string; avatarUrl?: string }[] }[];
        };
        for (const p of data.parties ?? []) {
          for (const m of p.members ?? []) {
            if (m.name && /poormetheus/i.test(m.name) && m.avatarUrl) {
              if (!cancelled) setNarratorAvatar(m.avatarUrl);
              return;
            }
          }
        }
      } catch {
        /* silent — fallback remains */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Load global narrations ─────────────────────────────────────────────────

  const fetchNarrations = useCallback(async () => {
    setLoadingNarrations(true);
    try {
      const res = await fetch(`${API_BASE}/spectator/narrations?limit=20`);
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as { narrations?: Narration[] };
      setNarrations((data.narrations ?? []).slice().reverse());
    } catch {
      setNarrations([]);
    } finally {
      setLoadingNarrations(false);
    }
  }, []);

  useEffect(() => {
    fetchNarrations();
  }, [fetchNarrations]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const filteredJournals = useMemo(() => {
    if (!partyFilter) return journals;
    return journals.filter((j) => j.partyId === partyFilter);
  }, [journals, partyFilter]);

  // ── Share journal ──────────────────────────────────────────────────────────

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  }, []);

  const shareJournal = useCallback(
    (partyId: string) => {
      const url =
        typeof window !== "undefined"
          ? `${window.location.origin}/journals?party=${partyId}`
          : `/journals?party=${partyId}`;
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard
          .writeText(url)
          .then(() => showToast("Link copied!"))
          .catch(() => showToast("Copy failed — use Ctrl+C"));
      } else {
        showToast("Copy not supported");
      }
    },
    [showToast],
  );

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

      {/* Narrator panel */}
      <NarratorPanel
        narrations={narrations}
        loading={loadingNarrations}
        avatarUrl={narratorAvatar}
      />

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
          <Select
            aria-label="Filter by party"
            placeholder="All Parties"
            selectedKey={partyFilter}
            onSelectionChange={(key) => setPartyFilter(key as string)}
            style={{ minWidth: "10rem" }}
          >
            <Select.Trigger style={selectStyle}>
              <Select.Value />
            </Select.Trigger>
            <Select.Popover
              className="rounded-lg border border-divider shadow-lg z-50"
              style={{ background: "var(--surface)" }}
            >
              <ListBox>
                <ListBoxItem id="" textValue="All Parties">All Parties</ListBoxItem>
                {journals.map((j) => (
                  <ListBoxItem key={j.partyId} id={j.partyId} textValue={j.partyName}>
                    {j.partyName}
                  </ListBoxItem>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>

          {partyFilter && (
            <Button
              size="sm"
              variant="secondary"
              onPress={() => setPartyFilter("")}
            >
              <X size={12} weight="bold" />
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
          {filteredJournals.map((entry) => (
            <Accordion.Item key={entry.partyId} id={entry.partyId}>
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
                      {entry.partyName}
                    </span>
                    <Chip size="sm" variant="secondary" color="default" style={{ flexShrink: 0 }}>
                      {entry.eventCount} events
                    </Chip>
                    <button
                      type="button"
                      aria-label="Share journal link"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        shareJournal(entry.partyId);
                      }}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                        background: "transparent",
                        border: "1px solid var(--border)",
                        borderRadius: "0.375rem",
                        padding: "0.2rem 0.45rem",
                        color: "var(--muted)",
                        cursor: "pointer",
                        fontSize: "0.7rem",
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.color = "var(--accent)";
                        e.currentTarget.style.borderColor = "var(--accent)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.color = "var(--muted)";
                        e.currentTarget.style.borderColor = "var(--border)";
                      }}
                    >
                      <ShareNetwork size={11} weight="fill" />
                      Share
                    </button>
                  </div>
                  <Accordion.Indicator />
                </Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <Accordion.Body style={{ paddingBottom: "1rem" }}>
                  <JournalCard entry={entry} />
                </Accordion.Body>
              </Accordion.Panel>
            </Accordion.Item>
          ))}
        </Accordion>
      )}

      {/* Toast */}
      {toast && <Toast message={toast} />}
    </div>
  );
}
