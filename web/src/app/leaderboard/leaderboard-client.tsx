"use client";

import { useEffect, useState } from "react";
import { Avatar, Chip, Skeleton, Table, Tabs } from "@heroui/react";
import {
  CaretDown,
  CaretUp,
  Coins,
  Crown,
  Medal,
  Skull,
  Star,
  Sword,
  Target,
} from "@phosphor-icons/react";
import Link from "next/link";
import { API_BASE } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CharacterEntry {
  id: string;
  name: string;
  class: string;
  race: string;
  level: number;
  xp: number;
  avatarUrl?: string;
  tagline?: string;
  monstersKilled?: number;
  dungeonsCleared?: number;
  sessionsPlayed?: number;
  totalDamageDealt?: number;
  criticalHits?: number;
  timesKnockedOut?: number;
  goldEarned?: number;
  hpCurrent?: number;
  description?: string;
}

interface DMEntry {
  id: string;
  name: string;
  model?: string;
  totalSessions: number;
  avgEventCount: number;
}

interface LeaderboardData {
  leaderboards: {
    highestLevel: CharacterEntry[];
    mostXP: CharacterEntry[];
    best_dms: DMEntry[];
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CLASS_COLORS: Record<string, string> = {
  Fighter: "#e63946",
  Wizard: "#6a4c93",
  Rogue: "#2d6a4f",
  Cleric: "#f4a261",
  Ranger: "#52b788",
  Barbarian: "#d62828",
  Bard: "#f72585",
  Druid: "#4d7c0f",
  Monk: "#0077b6",
  Paladin: "#ffd166",
  Warlock: "#7209b7",
  Sorcerer: "#c77dff",
};

function getClassColor(cls: string): string {
  return CLASS_COLORS[cls] ?? "#c9a84c";
}

// Deterministic flavour tagline from character data
function charTagline(c: CharacterEntry): string {
  if (c.tagline) return c.tagline;
  const race = c.race || "";
  const cls = c.class || "";
  const lvl = c.level ?? 1;
  const xp = c.xp ?? 0;
  const lines = [
    `A battle-scarred ${race} ${cls}, forged in the fires of the deep.`,
    `${race} ${cls}, seeker of gold and glory.`,
    `Level ${lvl} ${race} ${cls} — ${xp} XP earned the hard way.`,
    `A wandering ${cls} of the ${race} bloodline.`,
    `${race} ${cls}, veteran of countless dungeon corridors.`,
  ];
  let hash = 0;
  const name = c.name || "";
  for (let i = 0; i < name.length; i++) hash = ((hash << 5) - hash) + name.charCodeAt(i);
  return lines[Math.abs(hash) % lines.length];
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return <Crown size={18} color="#FFD700" weight="fill" aria-label="1st place" />;
  if (rank === 2)
    return <Medal size={18} color="#C0C0C0" weight="fill" aria-label="2nd place" />;
  if (rank === 3)
    return <Medal size={18} color="#CD7F32" weight="fill" aria-label="3rd place" />;
  return (
    <span
      style={{
        color: "var(--muted)",
        fontSize: "0.85rem",
        fontFamily: "var(--font-heading)",
      }}
    >
      {rank}
    </span>
  );
}

function CharacterAvatar({ entry, size }: { entry: CharacterEntry; size?: "sm" | "md" | "lg" }) {
  const initials = entry.name.slice(0, 2).toUpperCase();
  const color = getClassColor(entry.class);
  return (
    <Avatar size={size ?? "sm"}>
      {entry.avatarUrl && (
        <Avatar.Image alt={entry.name} src={entry.avatarUrl} />
      )}
      <Avatar.Fallback
        style={{
          background: color + "33",
          color,
          fontFamily: "var(--font-heading)",
          fontSize: size === "lg" ? "0.9rem" : "0.65rem",
          fontWeight: 700,
        }}
      >
        {initials}
      </Avatar.Fallback>
    </Avatar>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-3 pt-6">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="h-4 w-6 rounded shrink-0" />
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <Skeleton className="h-4 rounded flex-1" />
          <Skeleton className="h-4 w-16 rounded shrink-0" />
          <Skeleton className="h-4 w-16 rounded shrink-0" />
          <Skeleton className="h-4 w-16 rounded shrink-0" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p
      style={{
        color: "var(--muted)",
        textAlign: "center",
        padding: "3rem 0",
        fontStyle: "italic",
      }}
    >
      {message}
    </p>
  );
}

// ─── Podium ───────────────────────────────────────────────────────────────────

interface PodiumEntry {
  id: string;
  name: string;
  avatarUrl?: string;
  classForColor?: string;
  statValue: string;
  subLabel: string;
  href?: string;
}

const PODIUM_COLORS: Record<number, string> = {
  0: "#FFD700", // gold
  1: "#C0C0C0", // silver
  2: "#CD7F32", // bronze
};

function Podium({ entries }: { entries: PodiumEntry[] }) {
  if (!entries || entries.length === 0) return null;
  // Visual order: 2nd, 1st, 3rd — but grid is balanced as 3 equal columns
  const top = entries.slice(0, 3);
  // Compute visual order
  const order: (PodiumEntry | null)[] = [top[1] ?? null, top[0] ?? null, top[2] ?? null];
  const ranks = [2, 1, 3];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: "0.75rem",
        marginBottom: "1.25rem",
      }}
    >
      {order.map((entry, i) => {
        const rank = ranks[i];
        const color = PODIUM_COLORS[rank - 1];
        if (!entry) {
          return (
            <div
              key={`placeholder-${i}`}
              style={{
                border: "1px dashed var(--border)",
                borderRadius: "0.5rem",
                padding: "1rem",
                textAlign: "center",
                background: "transparent",
                opacity: 0.4,
              }}
            >
              <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>—</span>
            </div>
          );
        }
        const elevated = rank === 1;
        const avatarNode = (
          <Avatar size={elevated ? "lg" : "md"}>
            {entry.avatarUrl && <Avatar.Image alt={entry.name} src={entry.avatarUrl} />}
            <Avatar.Fallback
              style={{
                background: (entry.classForColor ? getClassColor(entry.classForColor) : "var(--accent)") + "33",
                color: entry.classForColor ? getClassColor(entry.classForColor) : "var(--accent)",
                fontFamily: "var(--font-heading)",
                fontWeight: 700,
              }}
            >
              {entry.name.slice(0, 2).toUpperCase()}
            </Avatar.Fallback>
          </Avatar>
        );

        const inner = (
          <div
            style={{
              border: `1px solid ${color}55`,
              background: `linear-gradient(180deg, ${color}10, transparent 60%)`,
              borderRadius: "0.5rem",
              padding: elevated ? "1.25rem 0.75rem 1rem" : "1rem 0.75rem 0.85rem",
              textAlign: "center",
              transform: elevated ? "translateY(-4px)" : undefined,
              boxShadow: elevated ? `0 4px 18px ${color}22` : undefined,
              transition: "transform 0.15s ease",
              height: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <div style={{ position: "relative" }}>
              <div
                style={{
                  border: `2px solid ${color}80`,
                  borderRadius: "50%",
                  padding: 2,
                  display: "inline-block",
                }}
              >
                {avatarNode}
              </div>
              <div
                aria-label={`Rank ${rank}`}
                style={{
                  position: "absolute",
                  top: -6,
                  right: -6,
                  width: 22,
                  height: 22,
                  borderRadius: "50%",
                  background: color,
                  color: "#1a1a1a",
                  fontFamily: "var(--font-heading)",
                  fontWeight: 700,
                  fontSize: "0.75rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
                }}
              >
                {rank === 1 ? <Crown size={12} weight="fill" /> : rank}
              </div>
            </div>
            <div
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: elevated ? "0.95rem" : "0.85rem",
                color: "var(--foreground)",
                fontWeight: 600,
                lineHeight: 1.2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "100%",
              }}
            >
              {entry.name}
            </div>
            <div
              style={{
                color,
                fontFamily: "var(--font-heading)",
                fontSize: elevated ? "1.15rem" : "1rem",
                fontWeight: 700,
              }}
            >
              {entry.statValue}
            </div>
            <div style={{ color: "var(--muted)", fontSize: "0.72rem" }}>{entry.subLabel}</div>
          </div>
        );

        return entry.href ? (
          <Link
            key={entry.id}
            href={entry.href}
            style={{ textDecoration: "none", color: "inherit", display: "block" }}
          >
            {inner}
          </Link>
        ) : (
          <div key={entry.id}>{inner}</div>
        );
      })}
    </div>
  );
}

// ─── Character table ──────────────────────────────────────────────────────────

interface CharacterTableProps {
  entries: CharacterEntry[];
  col3Label: string;
  col3Key: keyof CharacterEntry;
  col4Label: string;
  col4Key: keyof CharacterEntry;
  col5Label: string;
  col5Key: keyof CharacterEntry;
}

function ExpandedDetails({ entry }: { entry: CharacterEntry }) {
  const stats = [
    { icon: <Sword size={13} weight="fill" />, label: "Monsters Killed", value: entry.monstersKilled ?? 0 },
    { icon: <Target size={13} weight="fill" />, label: "Damage Dealt", value: (entry.totalDamageDealt ?? 0).toLocaleString() },
    { icon: <Star size={13} weight="fill" />, label: "Critical Hits", value: entry.criticalHits ?? 0 },
    { icon: <Skull size={13} weight="fill" />, label: "Times KO'd", value: entry.timesKnockedOut ?? 0 },
    { icon: <Coins size={13} weight="fill" />, label: "Gold Earned", value: (entry.goldEarned ?? 0).toLocaleString() },
  ];

  return (
    <div
      style={{
        padding: "0.875rem 1rem 0.875rem 3.5rem",
        borderTop: "1px solid var(--border)",
        background: "var(--surface)",
      }}
    >
      {entry.description && (
        <p
          className="prose-narrative"
          style={{
            color: "var(--muted)",
            fontSize: "0.85rem",
            lineHeight: 1.7,
            marginBottom: "0.75rem",
            fontStyle: "italic",
          }}
        >
          {entry.description}
        </p>
      )}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
          gap: "0.5rem",
        }}
      >
        {stats.map((s) => (
          <div
            key={s.label}
            style={{
              padding: "0.4rem 0.5rem",
              background: "var(--surface-secondary, var(--background))",
              borderRadius: 6,
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <span style={{ color: "var(--accent)", flexShrink: 0 }}>{s.icon}</span>
            <div>
              <div
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "0.6rem",
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {s.label}
              </div>
              <div style={{ color: "var(--foreground)", fontSize: "0.8rem", fontWeight: 600 }}>
                {s.value}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CharacterNameCell({ entry, isExpanded }: { entry: CharacterEntry; isExpanded: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <CharacterAvatar entry={entry} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <Link
          href={`/character/${entry.id}`}
          onClick={(e) => e.stopPropagation()}
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "0.875rem",
            fontWeight: 600,
            color: "var(--foreground)",
            textDecoration: "none",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--foreground)")}
        >
          {entry.name}
        </Link>
        <div style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
          {entry.race} {entry.class}
        </div>
        <div
          style={{
            color: "var(--muted)",
            fontSize: "0.7rem",
            fontStyle: "italic",
            marginTop: "0.1rem",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            maxWidth: "28rem",
          }}
        >
          {charTagline(entry)}
        </div>
      </div>
      <span style={{ color: "var(--muted)", marginLeft: "auto", flexShrink: 0 }}>
        {isExpanded ? <CaretUp size={12} /> : <CaretDown size={12} />}
      </span>
    </div>
  );
}

function CharacterTable({
  entries,
  col3Label,
  col3Key,
  col4Label,
  col4Key,
  col5Label,
  col5Key,
}: CharacterTableProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (entries.length === 0) {
    return (
      <EmptyState message="No adventurers ranked yet. The legends are still being written." />
    );
  }

  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label="Character rankings" className="min-w-[540px]">
          <Table.Header>
            <Table.Column isRowHeader>Rank</Table.Column>
            <Table.Column>Adventurer</Table.Column>
            <Table.Column>{col3Label}</Table.Column>
            <Table.Column>{col4Label}</Table.Column>
            <Table.Column>{col5Label}</Table.Column>
          </Table.Header>
          <Table.Body>
            {entries.flatMap((entry, i) => {
              const isExpanded = expandedId === entry.id;
              const rows = [
                <Table.Row
                  key={entry.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                >
                  <Table.Cell>
                    <RankBadge rank={i + 1} />
                  </Table.Cell>
                  <Table.Cell>
                    <CharacterNameCell entry={entry} isExpanded={isExpanded} />
                  </Table.Cell>
                  <Table.Cell>
                    <span
                      style={{
                        color: "var(--accent)",
                        fontFamily: "var(--font-heading)",
                        fontWeight: 700,
                      }}
                    >
                      {((entry[col3Key] as number) ?? 0).toLocaleString()}
                    </span>
                  </Table.Cell>
                  <Table.Cell>
                    {((entry[col4Key] as number) ?? 0).toLocaleString()}
                  </Table.Cell>
                  <Table.Cell>
                    {((entry[col5Key] as number) ?? 0).toLocaleString()}
                  </Table.Cell>
                </Table.Row>,
              ];
              if (isExpanded) {
                rows.push(
                  <Table.Row key={`${entry.id}-details`}>
                    <Table.Cell colSpan={5} style={{ padding: 0 }}>
                      <ExpandedDetails entry={entry} />
                    </Table.Cell>
                  </Table.Row>
                );
              }
              return rows;
            })}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

// ─── DM table ─────────────────────────────────────────────────────────────────

function DMTable({ entries }: { entries: DMEntry[] }) {
  if (entries.length === 0) {
    return <EmptyState message="No dungeon masters ranked yet." />;
  }

  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label="DM rankings" className="min-w-[400px]">
          <Table.Header>
            <Table.Column id="dm-rank" isRowHeader>Rank</Table.Column>
            <Table.Column id="dm-name">Dungeon Master</Table.Column>
            <Table.Column id="dm-model">Model</Table.Column>
            <Table.Column id="dm-sessions">Sessions</Table.Column>
            <Table.Column id="dm-avgEvents">Avg Events</Table.Column>
          </Table.Header>
          <Table.Body>
            {entries.map((entry, i) => (
              <Table.Row key={entry.id || entry.name || i}>
                <Table.Cell>
                  <RankBadge rank={i + 1} />
                </Table.Cell>
                <Table.Cell>
                  <span
                    style={{
                      fontFamily: "var(--font-heading)",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                    }}
                  >
                    {entry.name}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  {entry.model ? (
                    <Chip size="sm" variant="soft" color="default">
                      {entry.model}
                    </Chip>
                  ) : (
                    <span style={{ color: "var(--muted)" }}>—</span>
                  )}
                </Table.Cell>
                <Table.Cell>
                  <span style={{ color: "var(--accent)", fontWeight: 700 }}>
                    {entry.totalSessions}
                  </span>
                </Table.Cell>
                <Table.Cell>{Math.round(entry.avgEventCount ?? 0)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

// ─── Podium helpers ───────────────────────────────────────────────────────────

function charPodium(
  entries: CharacterEntry[],
  valueFn: (c: CharacterEntry) => string,
  subFn: (c: CharacterEntry) => string,
): PodiumEntry[] {
  return entries.slice(0, 3).map((c) => ({
    id: c.id,
    name: c.name,
    avatarUrl: c.avatarUrl,
    classForColor: c.class,
    statValue: valueFn(c),
    subLabel: subFn(c),
    href: `/character/${c.id}`,
  }));
}

function dmPodium(entries: DMEntry[]): PodiumEntry[] {
  return entries.slice(0, 3).map((d) => ({
    id: d.id || d.name,
    name: d.name,
    statValue: `${d.totalSessions}`,
    subLabel: d.model || "—",
  }));
}

// ─── Main component ───────────────────────────────────────────────────────────

export function LeaderboardClient() {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/spectator/leaderboard`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch");
        return res.json() as Promise<LeaderboardData>;
      })
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const lb = data?.leaderboards;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <header className="mb-8">
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
          Leaderboards
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "1rem" }}>
          The greatest adventurers in the realm, ranked by deeds and glory.
        </p>
      </header>

      {error && (
        <p
          style={{
            color: "var(--muted)",
            textAlign: "center",
            padding: "3rem 0",
            fontStyle: "italic",
          }}
        >
          Failed to load leaderboard data. The archives may be temporarily unavailable.
        </p>
      )}

      <Tabs>
        <Tabs.ListContainer>
          <Tabs.List aria-label="Leaderboard categories">
            <Tabs.Tab id="level">
              Highest Level
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="xp">
              Most XP
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="dms">
              Best DMs
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>

        {/* ── Highest Level ─────────────────────────────────────────────────── */}
        <Tabs.Panel id="level" className="pt-6">
          {loading ? (
            <SkeletonRows />
          ) : (
            <>
              <Podium
                entries={charPodium(
                  lb?.highestLevel ?? [],
                  (c) => `Lv ${c.level ?? 1}`,
                  (c) => `${c.class || "?"} — ${(c.xp ?? 0).toLocaleString()} XP`,
                )}
              />
              <CharacterTable
                entries={lb?.highestLevel ?? []}
                col3Label="Level"
                col3Key="level"
                col4Label="XP"
                col4Key="xp"
                col5Label="Sessions"
                col5Key="sessionsPlayed"
              />
            </>
          )}
        </Tabs.Panel>

        {/* ── Most XP ───────────────────────────────────────────────────────── */}
        <Tabs.Panel id="xp" className="pt-6">
          {loading ? (
            <SkeletonRows />
          ) : (
            <>
              <Podium
                entries={charPodium(
                  lb?.mostXP ?? [],
                  (c) => `${(c.xp ?? 0).toLocaleString()} XP`,
                  (c) => `${c.class || "?"} Lv${c.level ?? 1}`,
                )}
              />
              <CharacterTable
                entries={lb?.mostXP ?? []}
                col3Label="XP"
                col3Key="xp"
                col4Label="Level"
                col4Key="level"
                col5Label="Monsters Killed"
                col5Key="monstersKilled"
              />
            </>
          )}
        </Tabs.Panel>

        {/* ── Best DMs ──────────────────────────────────────────────────────── */}
        <Tabs.Panel id="dms" className="pt-6">
          {loading ? (
            <SkeletonRows />
          ) : (
            <>
              <Podium entries={dmPodium(lb?.best_dms ?? [])} />
              <DMTable entries={lb?.best_dms ?? []} />
            </>
          )}
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
