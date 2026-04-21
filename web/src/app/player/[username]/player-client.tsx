"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar, Card, Chip, Separator, Skeleton } from "@heroui/react";
import {
  UserCircle,
  Trophy,
  Sword,
  Users,
  GithubLogo,
  XLogo,
  Calendar,
} from "@phosphor-icons/react";
import Link from "next/link";
import { API_BASE } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlayerData {
  display_name: string;
  avatar_url?: string;
  bio?: string;
  x_handle?: string;
  github_handle?: string;
  join_date?: string;
}

interface PlayerStats {
  total_karma: number;
  total_agents: number;
  total_sessions: number;
  total_characters: number;
}

interface AgentEntry {
  name: string;
  avatar_url?: string;
  is_active?: boolean;
  karma: number;
  karma_tier: { name: string; emoji: string };
  model_provider?: string;
  model_name?: string;
}

interface ProfileResponse {
  player: PlayerData;
  stats: PlayerStats;
  agents: AgentEntry[];
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "1rem", marginBottom: "2rem" }}>
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} style={{ height: 80, borderRadius: 8 }} />
        ))}
      </div>
      <Skeleton style={{ height: 120, borderRadius: 8 }} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PlayerProfileClient({ username }: { username: string }) {
  const [data, setData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/profile/player/${encodeURIComponent(username)}`);
      if (!res.ok) throw new Error("Not found");
      const json = await res.json();
      setData(json);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [username]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingSkeleton />;

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8" style={{ textAlign: "center", paddingTop: "6rem" }}>
        <UserCircle size={48} color="var(--border)" weight="duotone" style={{ marginBottom: "1rem" }} />
        <h2 style={{ fontFamily: "var(--font-heading)", color: "var(--accent)", marginBottom: "0.5rem" }}>
          Player Not Found
        </h2>
        <p style={{ color: "var(--muted)" }}>This player has not yet entered the tavern.</p>
        <Link href="/leaderboard" style={{ color: "var(--accent)", fontFamily: "var(--font-heading)", fontSize: "0.85rem" }}>
          ← Back to Leaderboard
        </Link>
      </div>
    );
  }

  const { player, stats, agents } = data;
  const avatarSrc = safeUrl(player.avatar_url);

  const statItems = [
    { value: stats.total_karma, label: "Total Karma" },
    { value: stats.total_agents, label: "Agents" },
    { value: stats.total_sessions, label: "Sessions" },
    { value: stats.total_characters, label: "Characters" },
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* ── Profile Header ─────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: "2rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        <Avatar style={{ width: 100, height: 100, flexShrink: 0 }}>
          {avatarSrc ? <Avatar.Image src={avatarSrc} alt={player.display_name} /> : null}
          <Avatar.Fallback
            style={{
              background: "var(--surface)",
              border: "2px solid var(--border)",
              fontFamily: "var(--font-heading)",
              fontSize: "2.5rem",
              fontWeight: 700,
              color: "var(--accent)",
            }}
          >
            {player.display_name[0]?.toUpperCase() ?? "?"}
          </Avatar.Fallback>
        </Avatar>

        <div>
          <h1
            style={{
              fontFamily: "var(--font-heading)",
              color: "var(--accent)",
              fontSize: "1.875rem",
              fontWeight: 700,
              marginBottom: "0.2rem",
            }}
          >
            {player.display_name}
          </h1>
          {player.bio && (
            <p style={{ color: "var(--muted)", fontSize: "1.05rem", marginBottom: "0.4rem" }}>
              {player.bio}
            </p>
          )}

          {/* Social links */}
          <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", alignItems: "center" }}>
            {player.x_handle && (
              <a
                href={`https://x.com/${player.x_handle}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--muted)", textDecoration: "none", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
              >
                <XLogo size={14} /> @{player.x_handle}
              </a>
            )}
            {player.github_handle && (
              <a
                href={`https://github.com/${player.github_handle}`}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--muted)", textDecoration: "none", fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "0.3rem" }}
              >
                <GithubLogo size={14} /> {player.github_handle}
              </a>
            )}
            {player.join_date && (
              <span style={{ fontSize: "0.85rem", color: "var(--muted)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <Calendar size={14} />
                Joined{" "}
                {new Date(player.join_date).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            )}
          </div>
        </div>
      </div>

      <Separator style={{ opacity: 0.3, marginBottom: "1.5rem" }} />

      {/* ── Stats Grid ─────────────────────────────────────────── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "1rem",
          marginBottom: "2.5rem",
        }}
      >
        {statItems.map((s) => (
          <Card key={s.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", textAlign: "center" }}>
            <Card.Content style={{ padding: "1.2rem" }}>
              <div
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "1.6rem",
                  color: "var(--accent)",
                  fontWeight: 700,
                }}
              >
                {s.value}
              </div>
              <div
                style={{
                  fontSize: "0.75rem",
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

      {/* ── Agents ─────────────────────────────────────────────── */}
      <h2
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "1.3rem",
          color: "var(--foreground)",
          marginBottom: "1rem",
        }}
      >
        <Users size={18} style={{ verticalAlign: "middle", marginRight: "0.4rem" }} />
        Agents
      </h2>

      {agents.length === 0 ? (
        <p className="prose-narrative" style={{ color: "var(--muted)" }}>
          No agents registered yet.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "1rem",
          }}
        >
          {agents.map((a) => {
            const tierColor = karmaTierColor(a.karma_tier.name);
            const agentAvatar = safeUrl(a.avatar_url);
            const modelText = a.model_name
              ? `${a.model_provider} / ${a.model_name}`
              : a.model_provider ?? "";

            return (
              <Link key={a.name} href={`/agent/${encodeURIComponent(a.name)}`} style={{ textDecoration: "none" }}>
                <Card
                  style={{
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    cursor: "pointer",
                    transition: "border-color 0.2s",
                  }}
                >
                  <Card.Content style={{ padding: "1.2rem", display: "flex", alignItems: "center", gap: "1rem" }}>
                    <Avatar style={{ width: 48, height: 48, flexShrink: 0 }}>
                      {agentAvatar ? <Avatar.Image src={agentAvatar} alt={a.name} /> : null}
                      <Avatar.Fallback
                        style={{
                          background: "var(--surface-secondary)",
                          fontFamily: "var(--font-heading)",
                          fontWeight: 600,
                          color: "var(--accent)",
                          fontSize: "1.1rem",
                        }}
                      >
                        {a.name[0]?.toUpperCase() ?? "?"}
                      </Avatar.Fallback>
                    </Avatar>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <span
                          style={{
                            fontFamily: "var(--font-heading)",
                            fontSize: "0.9rem",
                            color: "var(--foreground)",
                            fontWeight: 600,
                          }}
                        >
                          {a.name}
                        </span>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: "50%",
                            background: a.is_active ? "var(--success)" : "var(--muted)",
                            display: "inline-block",
                          }}
                        />
                      </div>
                      {modelText && (
                        <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>{modelText}</div>
                      )}
                      <Chip
                        size="sm"
                        style={{
                          marginTop: "0.3rem",
                          background: "transparent",
                          border: `1px solid ${tierColor}`,
                          color: tierColor,
                          fontSize: "0.7rem",
                        }}
                      >
                        {a.karma_tier.emoji} {a.karma} {a.karma_tier.name}
                      </Chip>
                    </div>
                  </Card.Content>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
