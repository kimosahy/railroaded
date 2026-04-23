"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Accordion,
  Avatar,
  Button,
  Chip,
  Drawer,
  Separator,
  Skeleton,
} from "@heroui/react";
import {
  Coins,
  Crosshair,
  Lightning,
  ShareNetwork,
  Shield,
  Skull,
  Sword,
  Trophy,
  X,
} from "@phosphor-icons/react";
import { API_BASE } from "@/lib/api";
import { useCharacterDrawer } from "./character-drawer-provider";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Model {
  provider?: string;
  name?: string;
}

interface CharacterData {
  id: string;
  name: string;
  race: string;
  class: string;
  level: number;
  xp?: number;
  gold?: number;
  avatarUrl?: string | null;
  description?: string | null;
  backstory?: string;
  personality?: string;
  flaw?: string | null;
  bond?: string | null;
  ideal?: string | null;
  fear?: string | null;
  isAlive?: boolean;
  hpCurrent?: number;
  hpMax?: number;
  sessionsPlayed?: number;
  monstersKilled?: number;
  dungeonsCleared?: number;
  totalDamageDealt?: number;
  criticalHits?: number;
  timesKnockedOut?: number;
  goldEarned?: number;
  model?: Model;
}

interface JournalEvent {
  id?: string;
  type: string;
  data?: Record<string, unknown>;
  timestamp?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CLASS_COLORS: Record<string, string> = {
  fighter: "#c9a84c",
  wizard: "#5b9bd5",
  rogue: "#4caf50",
  cleric: "#f0ece4",
  ranger: "#2d6b3f",
  paladin: "#e8d48b",
  warlock: "#6b3fa0",
  bard: "#e8b84c",
  barbarian: "#c43c3c",
  monk: "#8a7033",
  sorcerer: "#a47bd5",
  druid: "#4caf50",
};

const BACKSTORY_EXPAND_THRESHOLD = 300;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getClassColor(cls: string | undefined): string {
  if (!cls) return "#c9a84c";
  return CLASS_COLORS[cls.toLowerCase()] ?? "#c9a84c";
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function safeAvatarUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url) return null;
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return null;
    if (u.hostname.includes("dicebear.com")) return null;
    if (u.hostname.includes("oaidalleapiprodscus.blob")) return null;
    return url;
  } catch {
    return null;
  }
}

function formatEventLabel(type: string): string {
  return type
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatEventTime(iso?: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export function CharacterDrawer() {
  const { isOpen, characterId, sessionSnapshot, closeDrawer } =
    useCharacterDrawer();

  const [character, setCharacter] = useState<CharacterData | null>(null);
  const [events, setEvents] = useState<JournalEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  // ── Parallel fetch with AbortController ────────────────────────────────────
  useEffect(() => {
    if (!isOpen || !characterId) return;

    const controller = new AbortController();
    // On every distinct open (fresh or swap-in-place), clear stale display and
    // show loading before firing the two parallel fetches. This matches the
    // pre-existing fetch-driven setState pattern used elsewhere in this app
    // (see tracker-client.tsx polling effects).
    /* eslint-disable react-hooks/set-state-in-effect */
    setCharacter(null);
    setEvents([]);
    setError(false);
    setLoading(true);
    /* eslint-enable react-hooks/set-state-in-effect */

    Promise.all([
      fetch(`${API_BASE}/spectator/characters/${characterId}`, {
        signal: controller.signal,
      }),
      fetch(`${API_BASE}/spectator/journals/${characterId}`, {
        signal: controller.signal,
      }),
    ])
      .then(async ([charRes, journalRes]) => {
        if (!charRes.ok) {
          throw new Error("Character fetch failed");
        }
        const charData = (await charRes.json()) as CharacterData;

        let eventList: JournalEvent[] = [];
        if (journalRes.ok) {
          const journalData = (await journalRes.json()) as {
            events?: JournalEvent[];
          };
          eventList = Array.isArray(journalData.events)
            ? journalData.events.slice(0, 8)
            : [];
        }
        setCharacter(charData);
        setEvents(eventList);
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return;
        setError(true);
        console.error("[CharacterDrawer] fetch failed", err);
      })
      .finally(() => {
        setLoading(false);
      });

    return () => controller.abort();
  }, [isOpen, characterId, retryTick]);

  const handleRetry = useCallback(() => {
    setRetryTick((n) => n + 1);
  }, []);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) closeDrawer();
    },
    [closeDrawer],
  );

  // ── Derived state ──────────────────────────────────────────────────────────
  const isAlive = character?.isAlive !== false; // default true when absent
  const sessionsPlayed = character?.sessionsPlayed ?? 0;
  const hasEvents = events.length > 0;

  // State taxonomy (per AR-12):
  // - deceased: isAlive === false
  // - inactive: alive + sessionsPlayed > 0 + no events
  // - never-played: alive + sessionsPlayed === 0 + no events
  // - active: alive + has events → section rendered, no empty copy
  let emptyCopy: string | null = null;
  let activityHeader = "Recent Activity";
  if (!isAlive) {
    activityHeader = "Final Moments";
    if (!hasEvents) {
      // CC-AMBIGUITY: authored copy assumed from MFB-003 voice pattern — verify with MF
      emptyCopy = "Gone, but remembered in the journals.";
    }
  } else if (!hasEvents && sessionsPlayed > 0) {
    // CC-AMBIGUITY: authored copy assumed from MFB-003 voice pattern — verify with MF
    emptyCopy = "Waiting to be called back to the table.";
  } else if (!hasEvents && sessionsPlayed === 0) {
    // CC-AMBIGUITY: authored copy assumed from MFB-003 voice pattern — verify with MF
    emptyCopy = "No recent activity. This one hasn't been called to the table.";
  }

  // CC-AMBIGUITY: authored copy assumed from MFB-003 voice pattern — verify with MF
  const loadingCopy = "The narrator is recalling this one...";
  // CC-AMBIGUITY: authored copy assumed from MFB-003 voice pattern — verify with MF
  const errorCopy = "The narrator's records are momentarily out of reach.";

  // ── Twitter share ──────────────────────────────────────────────────────────
  const shareUrl = (() => {
    if (!character) return null;
    const quote = character.description
      ? `"${character.description}" — ${character.name}, ${character.race} ${character.class}`
      : `${character.name}, ${character.race} ${character.class} (Lv${character.level})`;
    const profileUrl = `https://railroaded.ai/character/${character.id}`;
    return `https://twitter.com/intent/tweet?text=${encodeURIComponent(
      quote,
    )}&url=${encodeURIComponent(profileUrl)}`;
  })();

  const classColor = getClassColor(character?.class);
  const avatarUrl = safeAvatarUrl(character?.avatarUrl);
  const hpPct =
    character && character.hpMax && character.hpMax > 0
      ? Math.max(
          0,
          Math.min(100, Math.round(((character.hpCurrent ?? 0) / character.hpMax) * 100)),
        )
      : 0;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <Drawer.Root isOpen={isOpen} onOpenChange={handleOpenChange}>
      {/* Spec-locked: 440px desktop, full-width <640px, right placement. The
          Drawer.Content type omits `style`, so width is applied on the inner
          Dialog which does accept standard HTML style props. */}
      <Drawer.Backdrop>
        <Drawer.Content
          placement="right"
          className="character-drawer-content"
        >
          <Drawer.Dialog
            aria-label="Character details"
            style={{
              display: "flex",
              flexDirection: "column",
              height: "100%",
              width: "min(440px, 100vw)",
              maxWidth: "100vw",
              background: "var(--surface)",
              borderLeft: "1px solid var(--border)",
              color: "var(--foreground)",
            }}
          >
            {/* ── Header ─────────────────────────────────────────────────── */}
            <Drawer.Header
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "0.75rem",
                padding: "1rem 1.25rem 0.75rem",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <Drawer.Heading
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "0.72rem",
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  margin: 0,
                }}
              >
                Character
              </Drawer.Heading>
              <Drawer.CloseTrigger
                aria-label="Close character drawer"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--muted)",
                  cursor: "pointer",
                  padding: 4,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 4,
                }}
              >
                <X size={18} />
              </Drawer.CloseTrigger>
            </Drawer.Header>

            {/* ── Body ───────────────────────────────────────────────────── */}
            <Drawer.Body
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "1rem 1.25rem",
                display: "flex",
                flexDirection: "column",
                gap: "1.25rem",
              }}
            >
              {loading && !character && (
                <LoadingBlock message={loadingCopy} />
              )}

              {error && !loading && (
                <ErrorBlock message={errorCopy} onRetry={handleRetry} />
              )}

              {character && !error && (
                <>
                  {/* Identity */}
                  <section
                    style={{
                      display: "flex",
                      gap: "0.9rem",
                      alignItems: "center",
                    }}
                  >
                    <Avatar
                      size="lg"
                      style={{
                        width: 72,
                        height: 72,
                        flexShrink: 0,
                        border: `2px solid ${classColor}`,
                      }}
                    >
                      {avatarUrl ? (
                        <Avatar.Image
                          src={avatarUrl}
                          alt={character.name}
                        />
                      ) : null}
                      <Avatar.Fallback
                        style={{
                          background: classColor,
                          color: "#0a0a0f",
                          fontFamily: "var(--font-heading)",
                          fontWeight: 700,
                          fontSize: "1.3rem",
                        }}
                      >
                        {initials(character.name)}
                      </Avatar.Fallback>
                    </Avatar>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontFamily: "var(--font-heading)",
                          fontSize: "1.35rem",
                          color: "var(--accent)",
                          lineHeight: 1.2,
                          wordBreak: "break-word",
                        }}
                      >
                        {character.name}
                      </div>
                      <div
                        style={{
                          color: "var(--muted)",
                          fontSize: "0.85rem",
                          marginTop: "0.2rem",
                        }}
                      >
                        {character.race} {character.class} · Lv{character.level}
                      </div>
                      {character.model?.name && (
                        <div style={{ marginTop: "0.4rem" }}>
                          <Chip size="sm" variant="secondary" color="default">
                            {character.model.provider
                              ? `${character.model.provider}/${character.model.name}`
                              : character.model.name}
                          </Chip>
                        </div>
                      )}
                    </div>
                  </section>

                  {/* Status */}
                  <section>
                    {isAlive ? (
                      <div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: "0.35rem",
                          }}
                        >
                          <span
                            style={{
                              fontFamily: "var(--font-heading)",
                              fontSize: "0.68rem",
                              textTransform: "uppercase",
                              letterSpacing: "0.08em",
                              color: "var(--muted)",
                            }}
                          >
                            Hit Points
                          </span>
                          <span
                            style={{
                              fontFamily: "var(--font-heading)",
                              fontSize: "0.8rem",
                              color: "var(--foreground)",
                            }}
                          >
                            {character.hpCurrent ?? 0} / {character.hpMax ?? 0}
                          </span>
                        </div>
                        <div
                          style={{
                            height: 8,
                            background: "var(--surface-tertiary, #22222a)",
                            border: "1px solid var(--border)",
                            borderRadius: 4,
                            overflow: "hidden",
                          }}
                          aria-label={`HP ${hpPct}%`}
                        >
                          <div
                            style={{
                              width: `${hpPct}%`,
                              height: "100%",
                              background: "var(--success)",
                              transition: "width 0.3s",
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.4rem",
                          color: "var(--danger)",
                          fontFamily: "var(--font-heading)",
                          textTransform: "uppercase",
                          letterSpacing: "0.1em",
                          fontSize: "0.85rem",
                        }}
                      >
                        <Skull size={18} weight="duotone" />
                        {/* CC-AMBIGUITY: authored copy assumed from MFB-003 voice pattern — verify with MF */}
                        Fallen
                      </div>
                    )}

                    {sessionSnapshot && (
                      // TODO: Replace sessionSnapshot with live WebSocket feed in v2
                      <div
                        style={{
                          marginTop: "0.75rem",
                          display: "flex",
                          flexWrap: "wrap",
                          alignItems: "center",
                          gap: "0.4rem",
                        }}
                      >
                        <span
                          style={{
                            fontFamily: "var(--font-heading)",
                            fontSize: "0.68rem",
                            textTransform: "uppercase",
                            letterSpacing: "0.08em",
                            color: "var(--muted)",
                          }}
                        >
                          Currently In
                        </span>
                        <Chip size="sm" variant="secondary" color="default">
                          {sessionSnapshot.phase}
                        </Chip>
                        {sessionSnapshot.room && (
                          <span
                            style={{
                              color: "var(--muted)",
                              fontSize: "0.8rem",
                            }}
                          >
                            · {sessionSnapshot.room}
                          </span>
                        )}
                      </div>
                    )}
                  </section>

                  <Separator />

                  {/* Stats grid (3-col, 6 cells — balanced per DESIGN.md rule #5) */}
                  <section>
                    <SectionLabel>Record</SectionLabel>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                        gap: "0.6rem 0.75rem",
                      }}
                    >
                      <StatCell
                        icon={<Trophy size={14} />}
                        label="Sessions"
                        value={character.sessionsPlayed ?? 0}
                      />
                      <StatCell
                        icon={<Sword size={14} />}
                        label="Monsters"
                        value={character.monstersKilled ?? 0}
                      />
                      <StatCell
                        icon={<Crosshair size={14} />}
                        label="Damage"
                        value={character.totalDamageDealt ?? 0}
                      />
                      <StatCell
                        icon={<Lightning size={14} />}
                        label="Crits"
                        value={character.criticalHits ?? 0}
                      />
                      <StatCell
                        icon={<Shield size={14} />}
                        label="KOs"
                        value={character.timesKnockedOut ?? 0}
                      />
                      <StatCell
                        icon={<Coins size={14} />}
                        label="Gold"
                        value={character.gold ?? 0}
                      />
                    </div>
                  </section>

                  <Separator />

                  {/* Recent Activity / Final Moments */}
                  <section>
                    <SectionLabel>{activityHeader}</SectionLabel>
                    {hasEvents ? (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "0.6rem",
                        }}
                      >
                        {events.map((e, i) => (
                          <div
                            key={e.id ?? `${e.type}-${i}`}
                            className="prose-narrative"
                            style={{
                              fontSize: "0.9rem",
                              lineHeight: 1.6,
                              color: "var(--foreground)",
                              borderLeft: "2px solid var(--accent)",
                              paddingLeft: "0.6rem",
                            }}
                          >
                            <div
                              style={{
                                fontFamily: "var(--font-geist)",
                                fontSize: "0.68rem",
                                color: "var(--muted)",
                                textTransform: "uppercase",
                                letterSpacing: "0.06em",
                                marginBottom: "0.15rem",
                              }}
                            >
                              {formatEventLabel(e.type)}
                              {e.timestamp && (
                                <span style={{ marginLeft: "0.5rem" }}>
                                  · {formatEventTime(e.timestamp)}
                                </span>
                              )}
                            </div>
                            {renderEventSummary(e)}
                          </div>
                        ))}
                      </div>
                    ) : emptyCopy ? (
                      <p
                        className="prose-narrative"
                        style={{
                          color: "var(--muted)",
                          fontSize: "0.9rem",
                          fontStyle: "italic",
                          margin: 0,
                        }}
                      >
                        {emptyCopy}
                      </p>
                    ) : null}
                  </section>

                  {/* Personality */}
                  {(character.backstory ||
                    character.personality ||
                    character.flaw ||
                    character.bond ||
                    character.ideal ||
                    character.fear) && (
                    <>
                      <Separator />
                      <section>
                        <SectionLabel>Personality</SectionLabel>
                        <PersonalitySections character={character} />
                      </section>
                    </>
                  )}
                </>
              )}
            </Drawer.Body>

            {/* ── Footer ─────────────────────────────────────────────────── */}
            {character && !error && (
              <Drawer.Footer
                style={{
                  borderTop: "1px solid var(--border)",
                  padding: "0.75rem 1.25rem",
                  display: "flex",
                  gap: "0.5rem",
                  alignItems: "center",
                  justifyContent: "space-between",
                  flexWrap: "wrap",
                }}
              >
                <Link
                  href={`/character/${character.id}`}
                  style={{
                    textDecoration: "none",
                    fontFamily: "var(--font-heading)",
                    fontSize: "0.82rem",
                    letterSpacing: "0.04em",
                    color: "var(--accent)",
                  }}
                  onClick={closeDrawer}
                >
                  View Full Profile →
                </Link>
                {shareUrl && (
                  <a
                    href={shareUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Share character on Twitter"
                    style={{ textDecoration: "none" }}
                  >
                    <Button size="sm" variant="secondary">
                      <ShareNetwork size={14} style={{ marginRight: 6 }} />
                      Share
                    </Button>
                  </a>
                )}
              </Drawer.Footer>
            )}
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer.Root>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-heading)",
        fontSize: "0.68rem",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color: "var(--muted)",
        marginBottom: "0.6rem",
      }}
    >
      {children}
    </div>
  );
}

function StatCell({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div
      style={{
        background: "var(--surface-secondary, rgba(255,255,255,0.02))",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "0.5rem 0.6rem",
        display: "flex",
        flexDirection: "column",
        gap: "0.2rem",
        minWidth: 0,
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "0.3rem",
          color: "var(--muted)",
          fontSize: "0.68rem",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {icon}
        {label}
      </span>
      <span
        style={{
          fontFamily: "var(--font-heading)",
          color: "var(--accent)",
          fontSize: "1.05rem",
          lineHeight: 1.1,
        }}
      >
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function LoadingBlock({ message }: { message: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.9rem" }}>
      <div style={{ display: "flex", gap: "0.9rem", alignItems: "center" }}>
        <Skeleton
          className="rounded-full"
          style={{ width: 72, height: 72 }}
        />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          <Skeleton className="h-5 w-3/4 rounded" />
          <Skeleton className="h-4 w-1/2 rounded" />
        </div>
      </div>
      <Skeleton className="h-3 w-full rounded" />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "0.5rem",
        }}
      >
        <Skeleton className="h-14 rounded" />
        <Skeleton className="h-14 rounded" />
        <Skeleton className="h-14 rounded" />
      </div>
      <p
        className="prose-narrative"
        style={{
          color: "var(--muted)",
          fontSize: "0.9rem",
          fontStyle: "italic",
          margin: 0,
          textAlign: "center",
        }}
      >
        {message}
      </p>
    </div>
  );
}

function ErrorBlock({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.9rem",
        padding: "2rem 0.5rem",
        textAlign: "center",
      }}
    >
      <p
        className="prose-narrative"
        style={{
          color: "var(--foreground)",
          fontSize: "0.95rem",
          fontStyle: "italic",
          margin: 0,
        }}
      >
        {message}
      </p>
      <Button size="sm" variant="secondary" onPress={onRetry}>
        Try again
      </Button>
    </div>
  );
}

function PersonalitySections({ character }: { character: CharacterData }) {
  const sections: { key: string; label: string; text: string; expand: boolean }[] = [];
  if (character.backstory) {
    sections.push({
      key: "backstory",
      label: "Backstory",
      text: character.backstory,
      expand: character.backstory.length <= BACKSTORY_EXPAND_THRESHOLD,
    });
  }
  if (character.personality) {
    sections.push({
      key: "personality",
      label: "Personality",
      text: character.personality,
      expand: false,
    });
  }
  if (character.flaw) {
    sections.push({ key: "flaw", label: "Flaw", text: character.flaw, expand: false });
  }
  if (character.bond) {
    sections.push({ key: "bond", label: "Bond", text: character.bond, expand: false });
  }
  if (character.ideal) {
    sections.push({ key: "ideal", label: "Ideal", text: character.ideal, expand: false });
  }
  if (character.fear) {
    sections.push({ key: "fear", label: "Fear", text: character.fear, expand: false });
  }
  if (sections.length === 0) return null;

  const defaultExpanded = sections.filter((s) => s.expand).map((s) => s.key);

  return (
    <Accordion
      defaultExpandedKeys={defaultExpanded}
      style={{ border: "1px solid var(--border)", borderRadius: 6 }}
    >
      {sections.map((s) => (
        <Accordion.Item key={s.key} id={s.key}>
          <Accordion.Heading>
            <Accordion.Trigger
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "0.72rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                color: "var(--muted)",
                padding: "0.6rem 0.75rem",
                width: "100%",
                textAlign: "left",
                background: "transparent",
                border: "none",
                cursor: "pointer",
              }}
            >
              {s.label}
            </Accordion.Trigger>
          </Accordion.Heading>
          <Accordion.Panel>
            <p
              className="prose-narrative"
              style={{
                padding: "0 0.75rem 0.75rem",
                color: "var(--foreground)",
                fontSize: "0.9rem",
                lineHeight: 1.65,
                margin: 0,
              }}
            >
              {s.text}
            </p>
          </Accordion.Panel>
        </Accordion.Item>
      ))}
    </Accordion>
  );
}

// ─── Event summary ────────────────────────────────────────────────────────────

function renderEventSummary(e: JournalEvent): React.ReactNode {
  const data = e.data ?? {};
  const description =
    typeof data.description === "string"
      ? data.description
      : typeof data.text === "string"
        ? data.text
        : typeof data.message === "string"
          ? data.message
          : null;
  if (description) return description;

  // Fallback: show the event type humanely.
  return formatEventLabel(e.type);
}
