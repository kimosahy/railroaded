"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar, Card, Chip, Skeleton } from "@heroui/react";
import { CaretDown, CaretUp, Skull, Star } from "@phosphor-icons/react";
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
  const [expanded, setExpanded] = useState(false);
  const avatarSrc = safeUrl(monster.avatarUrl);
  const color = monsterColor(monster.name);
  const initials = monster.name.slice(0, 2).toUpperCase();

  return (
    <Card
      style={{ cursor: "pointer", transition: "border-color 0.15s" }}
      onClick={() => setExpanded((e) => !e)}
    >
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
            {/* Compact stat line */}
            <div style={{ color: "var(--muted)", fontSize: "0.775rem", marginTop: "0.15rem" }}>
              CR {formatCR(monster.cr)}
              {(monster.count ?? 0) > 0 && (
                <span> · {monster.count} encounter{(monster.count ?? 0) > 1 ? "s" : ""}</span>
              )}
            </div>
          </div>

          {/* Expand indicator */}
          <span style={{ color: "var(--muted)", flexShrink: 0, marginTop: 2 }}>
            {expanded ? <CaretUp size={14} /> : <CaretDown size={14} />}
          </span>
        </div>

        {/* Expanded stat block */}
        {expanded && (
          <div
            style={{
              marginTop: "0.875rem",
              paddingTop: "0.875rem",
              borderTop: "1px solid var(--border)",
            }}
          >
            {/* Stat grid */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "0.5rem",
                marginBottom: monster.lore ? "0.875rem" : 0,
              }}
            >
              {[
                { label: "HP", value: monster.hp },
                { label: "AC", value: monster.ac },
                { label: "CR", value: formatCR(monster.cr) },
                { label: "XP", value: monster.xp ? monster.xp.toLocaleString() : "—" },
                {
                  label: "Encounters",
                  value: (monster.count ?? 0),
                },
              ].map((stat) => (
                <div
                  key={stat.label}
                  style={{
                    padding: "0.5rem 0.625rem",
                    background: "var(--surface)",
                    borderRadius: 6,
                  }}
                >
                  <div
                    style={{
                      fontFamily: "var(--font-heading)",
                      fontSize: "0.6rem",
                      color: "var(--muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}
                  >
                    {stat.label}
                  </div>
                  <div
                    style={{
                      color: "var(--foreground)",
                      fontSize: "0.875rem",
                      fontWeight: 600,
                    }}
                  >
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Lore */}
            {monster.lore && (
              <p
                className="prose-narrative"
                style={{
                  color: "var(--muted)",
                  fontSize: "0.85rem",
                  marginTop: 0,
                  marginBottom: 0,
                  lineHeight: 1.7,
                  fontStyle: "italic",
                }}
              >
                {monster.lore}
              </p>
            )}
          </div>
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

  // Split known vs undiscovered (custom)
  const { knownMonsters, undiscovered } = useMemo(() => {
    const known: Monster[] = [];
    const custom: Monster[] = [];
    for (const m of monsters) {
      if (m.isCustom) custom.push(m);
      else known.push(m);
    }
    return { knownMonsters: known, undiscovered: custom };
  }, [monsters]);

  // Group known monsters by CR tier
  const grouped = useMemo(() => {
    const map = new Map<string, Monster[]>();
    for (const tier of CR_TIERS) {
      map.set(tier.label, []);
    }
    for (const m of knownMonsters) {
      const tier = getTier(m.cr);
      map.get(tier)?.push(m);
    }
    // Sort within each tier by CR ascending
    for (const [, list] of map) {
      list.sort((a, b) => parseCR(a.cr) - parseCR(b.cr));
    }
    return map;
  }, [knownMonsters]);

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
          Every creature that has stalked the dungeons — click to reveal their full stat block.
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

          {/* Undiscovered section */}
          {undiscovered.length > 0 && (
            <section>
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
                    color: "var(--accent)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                  }}
                >
                  <Star size={13} weight="fill" color="var(--accent)" />
                  Undiscovered
                </h2>
                <div
                  style={{
                    flex: 1,
                    height: 1,
                    background: "var(--border)",
                  }}
                />
                <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                  {undiscovered.length}
                </span>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
                  gap: "1rem",
                }}
              >
                {undiscovered.map((monster) => (
                  <MonsterCard key={monster.name} monster={monster} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
