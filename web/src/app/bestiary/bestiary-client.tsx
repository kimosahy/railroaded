"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar, Card, Chip, Skeleton } from "@heroui/react";
import { Skull, Star } from "@phosphor-icons/react";
import { API_BASE } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Monster {
  name: string;
  hp: number;
  ac: number;
  cr: number | string;
  xp?: number;
  count?: number;
  avatarUrl?: string;
  lore?: string;
  isCustom?: boolean;
}

interface BestiaryData {
  monsters: Monster[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCR(cr: unknown): number {
  if (typeof cr === "number") return cr;
  if (typeof cr === "string") {
    if (cr === "1/8") return 0.125;
    if (cr === "1/4") return 0.25;
    if (cr === "1/2") return 0.5;
    const n = parseFloat(cr);
    return isNaN(n) ? 0 : n;
  }
  return 0;
}

function formatCR(cr: unknown): string {
  if (typeof cr === "string") return cr;
  const n = parseCR(cr);
  if (n === 0) return "0";
  if (n === 0.125) return "1/8";
  if (n === 0.25) return "1/4";
  if (n === 0.5) return "1/2";
  return String(n);
}

interface CRTier {
  label: string;
  min: number;
  max: number;
}

const CR_TIERS: CRTier[] = [
  { label: "Low Tier (CR 0–1)", min: 0, max: 1 },
  { label: "Medium Tier (CR 2–4)", min: 2, max: 4 },
  { label: "High Tier (CR 5+)", min: 5, max: Infinity },
];

function getTier(cr: unknown): string {
  const n = parseCR(cr);
  for (const tier of CR_TIERS) {
    if (n <= tier.max) return tier.label;
  }
  return CR_TIERS[CR_TIERS.length - 1].label;
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

function monsterColor(name: string): string {
  const COLORS = [
    "#e63946",
    "#6a4c93",
    "#2d6a4f",
    "#f4a261",
    "#52b788",
    "#d62828",
    "#0077b6",
    "#7209b7",
  ];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SkeletonGrid() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: "1rem",
      }}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <Card key={i}>
          <Card.Content style={{ padding: "1.25rem" }}>
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
              <Skeleton style={{ width: 44, height: 44, borderRadius: "50%", flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <Skeleton style={{ height: 14, width: "55%", borderRadius: 4, marginBottom: 6 }} />
                <Skeleton style={{ height: 12, width: "70%", borderRadius: 4 }} />
              </div>
            </div>
          </Card.Content>
        </Card>
      ))}
    </div>
  );
}

function MonsterCard({ monster }: { monster: Monster }) {
  const avatarSrc = safeUrl(monster.avatarUrl);
  const color = monsterColor(monster.name);
  const initials = monster.name.slice(0, 2).toUpperCase();

  return (
    <Card>
      <Card.Content style={{ padding: "1.25rem" }}>
        {/* Header */}
        <div style={{ display: "flex", gap: "0.75rem", alignItems: "flex-start" }}>
          <Avatar style={{ width: 44, height: 44, flexShrink: 0 }}>
            {avatarSrc ? <Avatar.Image src={avatarSrc} alt={monster.name} /> : null}
            <Avatar.Fallback
              style={{
                background: color,
                color: "#0a0a0f",
                fontFamily: "var(--font-heading)",
                fontWeight: 700,
                fontSize: "0.7rem",
              }}
            >
              {initials}
            </Avatar.Fallback>
          </Avatar>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
              <span
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "0.9rem",
                  color: "var(--foreground)",
                  fontWeight: 600,
                }}
              >
                {monster.name}
              </span>
              {monster.isCustom && (
                <Star size={12} color="var(--accent)" weight="fill" aria-label="Custom" />
              )}
            </div>
            {/* Stat line */}
            <div style={{ color: "var(--muted)", fontSize: "0.775rem", marginTop: "0.15rem" }}>
              HP {monster.hp} · AC {monster.ac} · CR {formatCR(monster.cr)}
              {monster.xp ? ` · ${monster.xp.toLocaleString()} XP` : ""}
            </div>
          </div>

          {/* Encounter count */}
          {(monster.count ?? 0) > 0 && (
            <Chip size="sm" variant="soft" color="danger">
              <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>
                <Skull size={11} weight="fill" />
                {monster.count}
              </span>
            </Chip>
          )}
        </div>

        {/* Lore */}
        {monster.lore && (
          <p
            className="prose-narrative"
            style={{
              color: "var(--muted)",
              fontSize: "0.85rem",
              marginTop: "0.75rem",
              marginBottom: 0,
              lineHeight: 1.6,
            }}
          >
            {monster.lore}
          </p>
        )}
      </Card.Content>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function BestiaryClient() {
  const [monsters, setMonsters] = useState<Monster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchBestiary = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/spectator/bestiary`);
      if (!res.ok) throw new Error("Failed");
      const data = (await res.json()) as BestiaryData;
      setMonsters(data.monsters ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBestiary();
  }, [fetchBestiary]);

  // Group monsters by CR tier
  const grouped = useMemo(() => {
    const map = new Map<string, Monster[]>();
    for (const tier of CR_TIERS) {
      map.set(tier.label, []);
    }
    for (const m of monsters) {
      const tier = getTier(m.cr);
      map.get(tier)?.push(m);
    }
    // Sort within each tier by CR ascending
    for (const [, list] of map) {
      list.sort((a, b) => parseCR(a.cr) - parseCR(b.cr));
    }
    return map;
  }, [monsters]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <header style={{ marginBottom: "2rem" }}>
        <h1
          style={{
            fontFamily: "var(--font-heading)",
            color: "var(--accent)",
            fontSize: "1.875rem",
            fontWeight: 700,
            marginBottom: "0.4rem",
          }}
        >
          Bestiary
        </h1>
        <p style={{ color: "var(--muted)" }}>
          Every creature that has stalked the dungeons — their stats, lore, and encounter count.
        </p>
      </header>

      {/* Error */}
      {error && (
        <p style={{ color: "var(--muted)", textAlign: "center", padding: "4rem 0" }}>
          Failed to load bestiary data.
        </p>
      )}

      {/* Loading */}
      {loading && <SkeletonGrid />}

      {/* Empty state */}
      {!loading && !error && monsters.length === 0 && (
        <div style={{ textAlign: "center", padding: "5rem 0" }}>
          <p
            className="prose-narrative"
            style={{
              color: "var(--muted)",
              fontSize: "1.125rem",
              maxWidth: "42rem",
              margin: "0 auto",
              lineHeight: 1.8,
            }}
          >
            The bestiary remains unwritten. No creature has yet earned a name in these halls. That
            changes the moment a party is brave enough — or foolish enough — to encounter one.
          </p>
        </div>
      )}

      {/* Grouped sections */}
      {!loading && !error && monsters.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "2.5rem" }}>
          {CR_TIERS.map((tier) => {
            const list = grouped.get(tier.label) ?? [];
            if (list.length === 0) return null;
            return (
              <section key={tier.label}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.75rem",
                    marginBottom: "1rem",
                  }}
                >
                  <h2
                    style={{
                      fontFamily: "var(--font-heading)",
                      fontSize: "0.8rem",
                      color: "var(--muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {tier.label}
                  </h2>
                  <div
                    style={{
                      flex: 1,
                      height: 1,
                      background: "var(--border)",
                    }}
                  />
                  <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>{list.length}</span>
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                    gap: "1rem",
                  }}
                >
                  {list.map((monster) => (
                    <MonsterCard key={monster.name} monster={monster} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
