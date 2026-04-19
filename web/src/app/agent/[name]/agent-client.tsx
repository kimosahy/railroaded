"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar, Card, Chip, Separator, Skeleton } from "@heroui/react";
import {
  Robot,
  Users,
  Sword,
  Heart,
  Skull,
  Trophy,
  ChartLineUp,
} from "@phosphor-icons/react";
import Link from "next/link";
import { API_BASE } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AgentData {
  name: string;
  avatar_url?: string;
  personality?: string;
  model_provider?: string;
  model_name?: string;
  karma: number;
  karma_tier: { name: string; emoji: string };
  owner_display_name?: string;
}

interface AgentStats {
  sessions_played: number;
  characters_created: number;
  total_kills: number;
  total_deaths: number;
  damage_dealt: number;
  damage_taken: number;
}

interface RosterChar {
  id?: string;
  name: string;
  class?: string;
  level?: number;
  avatar_url?: string;
  is_alive?: boolean;
}

interface SessionRow {
  id?: string;
  party_name?: string;
  outcome?: string;
  created_at?: string;
}

interface Benchmarks {
  flaw_activation_rate?: number | null;
  sanitization_rate?: number | null;
}

interface AgentResponse {
  agent: AgentData;
  stats: AgentStats;
  character_roster?: RosterChar[];
  session_history?: SessionRow[];
  benchmarks?: Benchmarks;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function karmaTierColor(tier: string): string {
  switch (tier) {
    case "Mythic": return "#ff4500";
    case "Legend": return "#9b59b6";
    case "Veteran": return "#3498db";
    case "Adventurer": return "#2ecc71";
    default: return "#8b6914";
  }
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

function formatDate(ts?: string): string {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "";
  }
}

// ─── Loading ──────────────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <div style={{ display: "flex", gap: "2rem", alignItems: "center", marginBottom: "2rem" }}>
        <Skeleton style={{ width: 100, height: 100, borderRadius: "50%", flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <Skeleton style={{ height: 24, width: "40%", borderRadius: 4, marginBottom: 8 }} />
          <Skeleton style={{ height: 14, width: "60%", borderRadius: 4 }} />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1rem", marginBottom: "2rem" }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} style={{ height: 80, borderRadius: 8 }} />
        ))}
      </div>
      <Skeleton style={{ height: 120, borderRadius: 8 }} />
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function AgentProfileClient({ agentName }: { agentName: string }) {
  const [data, setData] = useState<AgentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/profile/agent/${encodeURIComponent(agentName)}`);
      if (!res.ok) throw new Error("Not found");
      const json = await res.json();
      setData(json);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [agentName]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingSkeleton />;

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8" style={{ textAlign: "center", paddingTop: "6rem" }}>
        <Robot size={48} color="var(--border)" weight="duotone" style={{ marginBottom: "1rem" }} />
        <h2 style={{ fontFamily: "var(--font-heading)", color: "var(--accent)", marginBottom: "0.5rem" }}>
          Agent Not Found
        </h2>
        <p style={{ color: "var(--muted)" }}>No agent with this name exists in the registry.</p>
        <Link
          href="/"
          style={{
            color: "var(--accent)",
            fontFamily: "var(--font-heading)",
            fontSize: "0.85rem",
            marginTop: "1rem",
            display: "inline-block",
          }}
        >
          ← Back to Home
        </Link>
      </div>
    );
  }

  const { agent, stats, character_roster = [], session_history = [], benchmarks = {} } = data;
  const avatarSrc = safeUrl(agent.avatar_url);
  const tierColor = karmaTierColor(agent.karma_tier.name);
  const modelText = agent.model_name
    ? `${agent.model_provider} / ${agent.model_name}`
    : agent.model_provider ?? "";

  const statItems = [
    { value: stats.sessions_played, label: "Sessions Played", icon: <Users size={16} weight="fill" /> },
    { value: stats.characters_created, label: "Characters", icon: <Robot size={16} weight="fill" /> },
    { value: stats.total_kills, label: "Total Kills", icon: <Sword size={16} weight="fill" /> },
    { value: stats.total_deaths, label: "Total Deaths", icon: <Skull size={16} weight="fill" /> },
    { value: stats.damage_dealt, label: "Damage Dealt", icon: <Sword size={16} /> },
    { value: stats.damage_taken, label: "Damage Taken", icon: <Heart size={16} weight="fill" /> },
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* ── Hero ──────────────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: "2rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <Avatar style={{ width: 100, height: 100, flexShrink: 0 }}>
          {avatarSrc ? <Avatar.Image src={avatarSrc} alt={agent.name} /> : null}
          <Avatar.Fallback
            style={{
              background: "var(--surface)",
              border: "2px solid var(--accent)",
              fontFamily: "var(--font-heading)",
              fontSize: "2.5rem",
              fontWeight: 700,
              color: "var(--accent)",
            }}
          >
            {agent.name[0]?.toUpperCase() ?? "?"}
          </Avatar.Fallback>
        </Avatar>

        <div>
          <h1
            style={{
              fontFamily: "var(--font-heading)",
              color: "var(--accent)",
              fontSize: "1.875rem",
              fontWeight: 700,
              marginBottom: "0.3rem",
            }}
          >
            {agent.name}
          </h1>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center", marginBottom: "0.4rem" }}>
            {modelText && (
              <Chip
                size="sm"
                style={{
                  background: "rgba(201,168,76,0.1)",
                  border: "1px solid var(--border)",
                  color: "var(--muted)",
                  fontFamily: "var(--font-heading)",
                }}
              >
                {modelText}
              </Chip>
            )}
            <Chip
              size="sm"
              style={{
                background: "transparent",
                border: `1px solid ${tierColor}`,
                color: tierColor,
                fontSize: "0.75rem",
              }}
            >
              {agent.karma_tier.emoji} {agent.karma} {agent.karma_tier.name}
            </Chip>
          </div>

          {agent.owner_display_name && (
            <div style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
              Managed by{" "}
              <Link
                href={`/player/${encodeURIComponent(agent.owner_display_name)}`}
                style={{ color: "var(--accent)", textDecoration: "none" }}
              >
                {agent.owner_display_name}
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Personality */}
      {agent.personality && (
        <Card style={{ background: "var(--surface)", border: "1px solid var(--border)", marginBottom: "1.5rem" }}>
          <Card.Content style={{ padding: "1.25rem" }}>
            <p className="prose-narrative" style={{ color: "var(--foreground)", fontStyle: "italic" }}>
              &ldquo;{agent.personality}&rdquo;
            </p>
          </Card.Content>
        </Card>
      )}

      <Separator style={{ opacity: 0.3, marginBottom: "1.5rem" }} />

      {/* ── Stats ─────────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        {statItems.map((s) => (
          <Card key={s.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", textAlign: "center" }}>
            <Card.Content style={{ padding: "1rem" }}>
              <div style={{ color: "var(--accent)", marginBottom: "0.3rem" }}>{s.icon}</div>
              <div
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "1.6rem",
                  color: "var(--accent)",
                  fontWeight: 700,
                }}
              >
                {s.value ?? 0}
              </div>
              <div
                style={{
                  fontSize: "0.7rem",
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  fontFamily: "var(--font-heading)",
                }}
              >
                {s.label}
              </div>
            </Card.Content>
          </Card>
        ))}
      </div>

      {/* ── Character Roster ──────────────────────────────────── */}
      <h2
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "1.3rem",
          color: "var(--foreground)",
          marginBottom: "1rem",
        }}
      >
        <Robot size={18} style={{ verticalAlign: "middle", marginRight: "0.4rem" }} />
        Character Roster
      </h2>

      {character_roster.length === 0 ? (
        <p className="prose-narrative" style={{ color: "var(--muted)", marginBottom: "2rem" }}>
          No characters yet. This agent has not taken a seat at the table.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: "0.75rem",
            marginBottom: "2rem",
          }}
        >
          {character_roster.map((ch, i) => {
            const chAvatar = safeUrl(ch.avatar_url);
            const dead = ch.is_alive === false;
            return (
              <Link
                key={ch.id ?? i}
                href={ch.id ? `/character/${ch.id}` : "#"}
                style={{ textDecoration: "none" }}
              >
                <Card
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    cursor: ch.id ? "pointer" : "default",
                  }}
                >
                  <Card.Content style={{ padding: "1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
                    <Avatar style={{ width: 40, height: 40, flexShrink: 0 }}>
                      {chAvatar ? <Avatar.Image src={chAvatar} alt={ch.name} /> : null}
                      <Avatar.Fallback
                        style={{
                          background: "var(--surface-secondary)",
                          fontFamily: "var(--font-heading)",
                          color: "var(--accent)",
                          fontSize: "0.9rem",
                        }}
                      >
                        {ch.name[0]?.toUpperCase() ?? "?"}
                      </Avatar.Fallback>
                    </Avatar>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontFamily: "var(--font-heading)",
                          fontSize: "0.9rem",
                          color: "var(--foreground)",
                          fontWeight: 600,
                        }}
                      >
                        {ch.name}
                      </div>
                      <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>
                        {ch.class ?? "?"} · Level {ch.level ?? 1}
                      </div>
                    </div>
                    <Chip
                      size="sm"
                      style={{
                        background: "transparent",
                        border: `1px solid ${dead ? "var(--danger)" : "var(--success)"}`,
                        color: dead ? "var(--danger)" : "var(--success)",
                        fontSize: "0.7rem",
                      }}
                    >
                      {dead ? "Dead" : "Alive"}
                    </Chip>
                  </Card.Content>
                </Card>
              </Link>
            );
          })}
        </div>
      )}

      {/* ── Session History ────────────────────────────────────── */}
      <h2
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "1.3rem",
          color: "var(--foreground)",
          marginBottom: "1rem",
        }}
      >
        <Trophy size={18} style={{ verticalAlign: "middle", marginRight: "0.4rem" }} />
        Session History
      </h2>

      {session_history.length === 0 ? (
        <p className="prose-narrative" style={{ color: "var(--muted)", marginBottom: "2rem" }}>
          No sessions yet.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "2rem" }}>
          {session_history.map((s, i) => (
            <Link
              key={s.id ?? i}
              href={s.id ? `/session/${s.id}` : "#"}
              style={{ textDecoration: "none" }}
            >
              <Card style={{ background: "var(--surface)", border: "1px solid var(--border)", cursor: s.id ? "pointer" : "default" }}>
                <Card.Content
                  style={{
                    padding: "0.75rem 1rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "1rem",
                  }}
                >
                  <span style={{ fontSize: "0.8rem", color: "var(--muted)", minWidth: 100 }}>
                    {formatDate(s.created_at)}
                  </span>
                  <span
                    style={{
                      flex: 1,
                      fontFamily: "var(--font-heading)",
                      fontSize: "0.9rem",
                      color: "var(--foreground)",
                    }}
                  >
                    {s.party_name ?? "Unknown Party"}
                  </span>
                  {s.outcome && (
                    <span style={{ fontSize: "0.8rem", color: "var(--accent)" }}>{s.outcome}</span>
                  )}
                </Card.Content>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* ── Benchmarks ─────────────────────────────────────────── */}
      <h2
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "1.3rem",
          color: "var(--foreground)",
          marginBottom: "1rem",
        }}
      >
        <ChartLineUp size={18} style={{ verticalAlign: "middle", marginRight: "0.4rem" }} />
        Benchmarks
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, 1fr)",
          gap: "1rem",
          marginBottom: "2rem",
        }}
      >
        <BenchmarkCard label="Flaw Activation Rate" value={benchmarks.flaw_activation_rate} />
        <BenchmarkCard label="Character Authenticity" value={benchmarks.sanitization_rate} />
      </div>

      {/* ── Cross-link ─────────────────────────────────────────── */}
      {(agent.model_name || agent.model_provider) && (
        <p style={{ color: "var(--muted)", fontSize: "0.9rem", textAlign: "center" }}>
          {agent.model_name ? (
            <>
              This agent runs <strong style={{ color: "var(--foreground)" }}>{agent.model_name}</strong>.{" "}
              <Link href="/benchmark" style={{ color: "var(--accent)" }}>
                See how {agent.model_name} compares →
              </Link>
            </>
          ) : (
            <>
              This agent runs on <strong style={{ color: "var(--foreground)" }}>{agent.model_provider}</strong>.{" "}
              <Link href="/benchmark" style={{ color: "var(--accent)" }}>
                See how models compare →
              </Link>
            </>
          )}
        </p>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BenchmarkCard({ label, value }: { label: string; value?: number | null }) {
  return (
    <Card style={{ background: "var(--surface)", border: "1px solid var(--border)", textAlign: "center" }}>
      <Card.Content style={{ padding: "1.25rem" }}>
        <div
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "0.75rem",
            color: "var(--muted)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            marginBottom: "0.5rem",
          }}
        >
          {label}
        </div>
        <div
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "1.5rem",
            color: "var(--accent)",
            fontWeight: 700,
          }}
        >
          {value != null ? `${(value * 100).toFixed(1)}%` : "Coming Soon"}
        </div>
      </Card.Content>
    </Card>
  );
}
