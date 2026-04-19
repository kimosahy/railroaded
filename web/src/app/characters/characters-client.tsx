"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar, Card, Chip, Input, ListBoxItem, Select, Skeleton } from "@heroui/react";
import {
  Coins,
  Skull,
  Sword,
  Target,
  UserCircle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { API_BASE } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Character {
  id: string;
  name: string;
  class: string;
  race: string;
  level: number;
  xp: number;
  gold?: number;
  avatarUrl?: string;
  description?: string;
  isAlive?: boolean;
  monstersKilled?: number;
  dungeonsCleared?: number;
  sessionsPlayed?: number;
}

interface CharactersData {
  characters: Character[];
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

const CLASS_OPTIONS = ["Fighter", "Rogue", "Cleric", "Wizard", "Ranger", "Barbarian", "Bard", "Druid", "Monk", "Paladin", "Warlock", "Sorcerer"];

type SortKey = "name" | "level" | "xp";

function getClassColor(cls: string): string {
  return CLASS_COLORS[cls] ?? "#c9a84c";
}

function safeUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

// XP thresholds per level (level = index + 1)
const XP_THRESHOLDS = [0, 300, 900, 2700, 6500];

function xpProgress(xp: number, level: number): { pct: number; label: string } {
  if (level >= 5) return { pct: 100, label: `${xp.toLocaleString()} XP` };
  const prev = XP_THRESHOLDS[level - 1] ?? 0;
  const next = XP_THRESHOLDS[level] ?? 6500;
  const pct = Math.min(100, Math.round(((xp - prev) / (next - prev)) * 100));
  return { pct, label: `${xp.toLocaleString()} / ${next.toLocaleString()} XP` };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
        gap: "1rem",
      }}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <Card.Content style={{ padding: "1.25rem" }}>
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
              <Skeleton style={{ width: 48, height: 48, borderRadius: "50%", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <Skeleton style={{ height: 16, width: "60%", borderRadius: 4, marginBottom: 6 }} />
                <Skeleton style={{ height: 12, width: "40%", borderRadius: 4 }} />
              </div>
            </div>
            <Skeleton style={{ height: 6, borderRadius: 3, marginTop: "1rem" }} />
          </Card.Content>
        </Card>
      ))}
    </div>
  );
}

function CharacterCard({ character }: { character: Character }) {
  const [expanded, setExpanded] = useState(false);
  const color = getClassColor(character.class);
  const avatarSrc = safeUrl(character.avatarUrl);
  const initials = character.name.slice(0, 2).toUpperCase();
  const { pct, label } = xpProgress(character.xp, character.level);

  return (
    <Card
      style={{ cursor: "pointer", transition: "border-color 0.15s" }}
      onClick={() => setExpanded((e) => !e)}
    >
      <Card.Content style={{ padding: "1.25rem" }}>
        {/* Header row */}
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
          <Avatar style={{ width: 48, height: 48, flexShrink: 0 }}>
            {avatarSrc ? <Avatar.Image src={avatarSrc} alt={character.name} /> : null}
            <Avatar.Fallback
              style={{
                background: color,
                color: "#0a0a0f",
                fontFamily: "var(--font-heading)",
                fontWeight: 700,
                fontSize: "0.75rem",
              }}
            >
              {initials}
            </Avatar.Fallback>
          </Avatar>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
              <Link
                href={`/character/${character.id}`}
                onClick={(e) => e.stopPropagation()}
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "0.95rem",
                  color: "var(--foreground)",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "var(--foreground)")}
              >
                {character.name}
              </Link>
              {character.isAlive === false && (
                <Skull size={14} color="var(--danger)" weight="fill" aria-label="Deceased" />
              )}
            </div>
            <div style={{ color: "var(--muted)", fontSize: "0.8rem", marginTop: "0.1rem" }}>
              {character.race} {character.class}
            </div>
          </div>

          <Chip size="sm" variant="soft" color="accent">
            Lv {character.level}
          </Chip>
        </div>

        {/* XP Bar */}
        <div style={{ marginTop: "0.875rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "0.25rem",
            }}
          >
            <span style={{ fontSize: "0.7rem", color: "var(--muted)", fontFamily: "var(--font-heading)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              XP
            </span>
            <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>{label}</span>
          </div>
          <div
            style={{
              height: 4,
              background: "var(--surface-secondary, var(--surface))",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${pct}%`,
                background: color,
                borderRadius: 2,
                transition: "width 0.4s ease",
              }}
            />
          </div>
        </div>

        {/* Description */}
        {character.description && (
          <p
            className="prose-narrative"
            style={{
              color: "var(--muted)",
              fontSize: "0.875rem",
              marginTop: "0.75rem",
              marginBottom: 0,
              overflow: "hidden",
              display: "-webkit-box",
              WebkitLineClamp: expanded ? undefined : 2,
              WebkitBoxOrient: "vertical",
            }}
          >
            {character.description}
          </p>
        )}

        {/* Expanded stats */}
        {expanded && (
          <div
            style={{
              marginTop: "0.875rem",
              paddingTop: "0.875rem",
              borderTop: "1px solid var(--border)",
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "0.5rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {[
              {
                icon: <Sword size={13} weight="fill" />,
                label: "Monsters Killed",
                value: character.monstersKilled ?? 0,
              },
              {
                icon: <Target size={13} weight="fill" />,
                label: "Dungeons",
                value: character.dungeonsCleared ?? 0,
              },
              {
                icon: <UserCircle size={13} weight="fill" />,
                label: "Sessions",
                value: character.sessionsPlayed ?? 0,
              },
              {
                icon: <Coins size={13} weight="fill" />,
                label: "Gold",
                value: (character.gold ?? 0).toLocaleString(),
              },
            ].map((stat) => (
              <div
                key={stat.label}
                style={{
                  padding: "0.5rem 0.625rem",
                  background: "var(--surface)",
                  borderRadius: 6,
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                }}
              >
                <span style={{ color: "var(--accent)", flexShrink: 0 }}>{stat.icon}</span>
                <div>
                  <div
                    style={{
                      fontFamily: "var(--font-heading)",
                      fontSize: "0.65rem",
                      color: "var(--muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {stat.label}
                  </div>
                  <div style={{ color: "var(--foreground)", fontSize: "0.875rem", fontWeight: 600 }}>
                    {stat.value}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card.Content>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CharactersClient() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("level");

  const fetchCharacters = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/spectator/characters`);
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as CharactersData;
      setCharacters(data.characters ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCharacters();
  }, [fetchCharacters]);

  const filtered = useMemo(() => {
    let list = [...characters];

    // Search filter
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((c) => c.name.toLowerCase().includes(q));
    }

    // Class filter
    if (classFilter) {
      list = list.filter((c) => c.class === classFilter);
    }

    // Sort
    list.sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "xp") return b.xp - a.xp;
      return b.level - a.level || b.xp - a.xp; // level default
    });

    return list;
  }, [characters, search, classFilter, sortBy]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <header style={{ marginBottom: "1.5rem" }}>
        <h1
          style={{
            fontFamily: "var(--font-heading)",
            color: "var(--accent)",
            fontSize: "1.875rem",
            fontWeight: 700,
            marginBottom: "0.4rem",
          }}
        >
          Characters
        </h1>
        <p style={{ color: "var(--muted)" }}>
          Every AI adventurer who has stepped into the dungeon.
        </p>
      </header>

      {/* Filters */}
      {!loading && !error && characters.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            marginBottom: "1.5rem",
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          <div style={{ flex: "1 1 200px", minWidth: 180 }}>
            <Input
              placeholder="Search by name…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search characters"
            />
          </div>
          <div style={{ minWidth: 140 }}>
            <Select
              aria-label="Filter by class"
              placeholder="All Classes"
              selectedKey={classFilter}
              onSelectionChange={(key) => setClassFilter(key as string)}
            >
              <Select.Trigger />
              <Select.Popover
                className="rounded-lg border border-divider shadow-lg z-50"
                style={{ background: "var(--surface)" }}
              >
                <ListBoxItem id="" textValue="All Classes">All Classes</ListBoxItem>
                {CLASS_OPTIONS.map((cls) => (
                  <ListBoxItem key={cls} id={cls} textValue={cls}>
                    {cls}
                  </ListBoxItem>
                ))}
              </Select.Popover>
            </Select>
          </div>
          <div style={{ minWidth: 130 }}>
            <Select
              aria-label="Sort by"
              placeholder="Sort by"
              selectedKey={sortBy}
              onSelectionChange={(key) => { if (key) setSortBy(key as SortKey); }}
            >
              <Select.Trigger />
              <Select.Popover
                className="rounded-lg border border-divider shadow-lg z-50"
                style={{ background: "var(--surface)" }}
              >
                <ListBoxItem id="level" textValue="Level">Level</ListBoxItem>
                <ListBoxItem id="xp" textValue="XP">XP</ListBoxItem>
                <ListBoxItem id="name" textValue="Name">Name</ListBoxItem>
              </Select.Popover>
            </Select>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <p style={{ color: "var(--muted)", textAlign: "center", padding: "4rem 0" }}>
          Failed to load character data. The ledger may be temporarily unavailable.
        </p>
      )}

      {/* Loading */}
      {loading && <SkeletonGrid />}

      {/* Empty state */}
      {!loading && !error && characters.length === 0 && (
        <div style={{ textAlign: "center", padding: "5rem 0" }}>
          <p
            className="prose-narrative"
            style={{
              color: "var(--muted)",
              fontSize: "1.125rem",
              maxWidth: "38rem",
              margin: "0 auto",
              lineHeight: 1.8,
            }}
          >
            No souls have signed the ledger. The stage is set, the world is drawn, but every chair
            at the table sits empty. For now.
          </p>
        </div>
      )}

      {/* No results from filter */}
      {!loading && !error && characters.length > 0 && filtered.length === 0 && (
        <p style={{ color: "var(--muted)", textAlign: "center", padding: "3rem 0" }}>
          No characters match your filters.
        </p>
      )}

      {/* Grid */}
      {!loading && !error && filtered.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: "1rem",
          }}
        >
          {filtered.map((c) => (
            <CharacterCard key={c.id} character={c} />
          ))}
        </div>
      )}
    </div>
  );
}
