"use client";

import { useEffect, useState } from "react";
import { Avatar, Chip, Skeleton, Table, Tabs } from "@heroui/react";
import { Crown, Medal, Skull, Star, Sword, Trophy, Users } from "@phosphor-icons/react";
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
  monstersKilled?: number;
  dungeonsCleared?: number;
  sessionsPlayed?: number;
  totalDamageDealt?: number;
  criticalHits?: number;
  timesKnockedOut?: number;
  goldEarned?: number;
}

interface PartyEntry {
  id: string;
  name: string;
  memberCount: number;
  sessionsPlayed: number;
  totalEvents: number;
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
    longestParties: PartyEntry[];
    dungeons_cleared: CharacterEntry[];
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

function CharacterAvatar({ entry }: { entry: CharacterEntry }) {
  const initials = entry.name.slice(0, 2).toUpperCase();
  const color = getClassColor(entry.class);
  return (
    <Avatar size="sm">
      {entry.avatarUrl && (
        <Avatar.Image alt={entry.name} src={entry.avatarUrl} />
      )}
      <Avatar.Fallback
        style={{
          background: color + "33",
          color,
          fontFamily: "var(--font-heading)",
          fontSize: "0.65rem",
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

function CharacterTable({
  entries,
  col3Label,
  col3Key,
  col4Label,
  col4Key,
  col5Label,
  col5Key,
}: CharacterTableProps) {
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
            {entries.map((entry, i) => (
              <Table.Row key={entry.id}>
                <Table.Cell>
                  <RankBadge rank={i + 1} />
                </Table.Cell>
                <Table.Cell>
                  <div className="flex items-center gap-2">
                    <CharacterAvatar entry={entry} />
                    <div>
                      <div
                        style={{
                          fontFamily: "var(--font-heading)",
                          fontSize: "0.875rem",
                          fontWeight: 600,
                        }}
                      >
                        {entry.name}
                      </div>
                      <div style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                        {entry.race} {entry.class}
                      </div>
                    </div>
                  </div>
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
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

// ─── Party table ──────────────────────────────────────────────────────────────

function PartyTable({ entries }: { entries: PartyEntry[] }) {
  if (entries.length === 0) {
    return (
      <EmptyState message="No parties have stood the test of time. Yet." />
    );
  }

  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content aria-label="Party rankings" className="min-w-[400px]">
          <Table.Header>
            <Table.Column isRowHeader>Rank</Table.Column>
            <Table.Column>Party</Table.Column>
            <Table.Column>Members</Table.Column>
            <Table.Column>Sessions</Table.Column>
            <Table.Column>Total Events</Table.Column>
          </Table.Header>
          <Table.Body>
            {entries.map((entry, i) => (
              <Table.Row key={entry.id}>
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
                <Table.Cell>{entry.memberCount}</Table.Cell>
                <Table.Cell>
                  <span
                    style={{ color: "var(--accent)", fontWeight: 700 }}
                  >
                    {entry.sessionsPlayed}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  {(entry.totalEvents ?? 0).toLocaleString()}
                </Table.Cell>
              </Table.Row>
            ))}
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
            <Tabs.Tab id="dungeons">
              Dungeons Cleared
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="parties">
              Longest Parties
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
            <CharacterTable
              entries={lb?.highestLevel ?? []}
              col3Label="Level"
              col3Key="level"
              col4Label="XP"
              col4Key="xp"
              col5Label="Sessions"
              col5Key="sessionsPlayed"
            />
          )}
        </Tabs.Panel>

        {/* ── Most XP ───────────────────────────────────────────────────────── */}
        <Tabs.Panel id="xp" className="pt-6">
          {loading ? (
            <SkeletonRows />
          ) : (
            <CharacterTable
              entries={lb?.mostXP ?? []}
              col3Label="XP"
              col3Key="xp"
              col4Label="Level"
              col4Key="level"
              col5Label="Monsters Killed"
              col5Key="monstersKilled"
            />
          )}
        </Tabs.Panel>

        {/* ── Dungeons Cleared ──────────────────────────────────────────────── */}
        <Tabs.Panel id="dungeons" className="pt-6">
          {loading ? (
            <SkeletonRows />
          ) : (
            <CharacterTable
              entries={lb?.dungeons_cleared ?? []}
              col3Label="Dungeons"
              col3Key="dungeonsCleared"
              col4Label="Sessions"
              col4Key="sessionsPlayed"
              col5Label="Monsters Killed"
              col5Key="monstersKilled"
            />
          )}
        </Tabs.Panel>

        {/* ── Longest Parties ───────────────────────────────────────────────── */}
        <Tabs.Panel id="parties" className="pt-6">
          {loading ? (
            <SkeletonRows />
          ) : (
            <PartyTable entries={lb?.longestParties ?? []} />
          )}
        </Tabs.Panel>

        {/* ── Best DMs ──────────────────────────────────────────────────────── */}
        <Tabs.Panel id="dms" className="pt-6">
          {loading ? (
            <SkeletonRows />
          ) : (
            <DMTable entries={lb?.best_dms ?? []} />
          )}
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
