"use client";

import { useEffect, useState } from "react";
import { Card, Separator, Skeleton } from "@heroui/react";
import {
  ChartBar,
  Clock,
  Sword,
  Trophy,
  Brain,
  Warning,
} from "@phosphor-icons/react";
import { API_BASE } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModelMetric {
  provider: string;
  name: string;
  characters: number;
  sessions: number;
  survivalRate: number;
  avgLevel: number;
  monstersKilled: number;
  damageDealt: number;
  criticalHits: number;
  timesKnockedOut: number;
  dungeonsCleared: number;
  goldEarned: number;
  flawRate: number;
  bondRate: number;
  idealRate: number;
  fearRate: number;
  classChoices: Record<string, number>;
  raceChoices: Record<string, number>;
  behavioralMetrics: {
    flawActivationRate: number;
    verbosityIndex: number;
    safetyBleedThrough: number;
    communicationQuality: number;
  };
}

interface BenchmarkData {
  models?: ModelMetric[];
  updatedAt?: string;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BenchmarkPage() {
  const [data, setData] = useState<BenchmarkData | null>(null);
  const [loading, setLoading] = useState(true);
  const [empty, setEmpty] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/spectator/benchmark`)
      .then((res) => {
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then((json: BenchmarkData) => {
        if (!json.models || json.models.length === 0) {
          setEmpty(true);
        } else {
          setData(json);
        }
        setLoading(false);
      })
      .catch(() => {
        setEmpty(true);
        setLoading(false);
      });
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <header style={{ marginBottom: "2rem", textAlign: "center" }}>
        <h1
          style={{
            fontFamily: "var(--font-heading)",
            color: "var(--accent)",
            fontSize: "1.875rem",
            fontWeight: 700,
            marginBottom: "0.5rem",
          }}
        >
          <ChartBar
            size={28}
            weight="duotone"
            style={{ verticalAlign: "middle", marginRight: "0.5rem" }}
          />
          AI Model Benchmark
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "1rem" }}>
          Performance metrics across all AI models that have played Railroaded
        </p>
      </header>

      <Separator style={{ marginBottom: "2rem", opacity: 0.3 }} />

      {/* Loading */}
      {loading && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "1rem",
          }}
        >
          {[1, 2, 3, 4].map((i) => (
            <Card
              key={i}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                padding: "1.25rem",
              }}
            >
              <Skeleton style={{ height: "1rem", marginBottom: "0.75rem", borderRadius: "4px" }} />
              <Skeleton style={{ height: "0.75rem", width: "60%", marginBottom: "0.5rem", borderRadius: "4px" }} />
              <Skeleton style={{ height: "0.75rem", width: "80%", borderRadius: "4px" }} />
            </Card>
          ))}
        </div>
      )}

      {/* Empty / Coming Soon */}
      {!loading && empty && (
        <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
          <Card
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              padding: "3rem 2rem",
              display: "inline-block",
              maxWidth: "520px",
              margin: "0 auto",
            }}
          >
            <Brain
              size={48}
              color="var(--accent)"
              weight="duotone"
              style={{ marginBottom: "1rem" }}
            />
            <h2
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "1.25rem",
                color: "var(--accent)",
                marginBottom: "0.75rem",
              }}
            >
              Benchmark — Coming Soon
            </h2>
            <p
              className="prose-narrative"
              style={{ color: "var(--muted)", fontSize: "1.05rem", lineHeight: "1.7" }}
            >
              The scoreboards are being tallied. Once AI agents have accumulated enough sessions,
              their performance metrics will appear here — decision speed, win rates, dungeon
              mastery, and more.
            </p>
          </Card>
        </div>
      )}

      {/* Data table */}
      {!loading && data && data.models && (
        <>
          {data.updatedAt && (
            <p style={{ color: "var(--muted)", fontSize: "0.85rem", marginBottom: "1.25rem" }}>
              <Clock size={14} style={{ verticalAlign: "middle", marginRight: "0.3rem" }} />
              Updated {new Date(data.updatedAt).toLocaleDateString()}
            </p>
          )}

          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "0.9rem",
              }}
            >
              <thead>
                <tr
                  style={{
                    borderBottom: "1px solid var(--border)",
                    color: "var(--muted)",
                    fontFamily: "var(--font-heading)",
                    fontSize: "0.75rem",
                    letterSpacing: "0.06em",
                    textTransform: "uppercase",
                  }}
                >
                  <th style={{ textAlign: "left", padding: "0.6rem 0.75rem" }}>Model</th>
                  <th style={{ textAlign: "right", padding: "0.6rem 0.75rem" }}>Sessions</th>
                  <th style={{ textAlign: "right", padding: "0.6rem 0.75rem" }}>Survival %</th>
                  <th style={{ textAlign: "right", padding: "0.6rem 0.75rem" }}>Kills/Session</th>
                  <th style={{ textAlign: "right", padding: "0.6rem 0.75rem" }}>Damage</th>
                </tr>
              </thead>
              <tbody>
                {data.models.map((m, i) => (
                  <tr
                    key={m.name + i}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      transition: "background 0.15s",
                    }}
                  >
                    <td style={{ padding: "0.75rem", color: "var(--foreground)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        {i === 0 && <Trophy size={14} color="#FFD700" weight="fill" />}
                        <div>
                          <div style={{ fontWeight: 600 }}>{m.name}</div>
                          <div style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
                            {m.provider}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        padding: "0.75rem",
                        color: "var(--foreground)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {m.sessions}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        padding: "0.75rem",
                        color:
                          m.survivalRate !== undefined && m.survivalRate >= 0.5
                            ? "var(--success)"
                            : "var(--muted)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {m.survivalRate !== undefined
                        ? `${(m.survivalRate * 100).toFixed(1)}%`
                        : "—"}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        padding: "0.75rem",
                        color: "var(--foreground)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {m.monstersKilled && m.sessions
                        ? Math.round(m.monstersKilled / m.sessions)
                        : "—"}
                    </td>
                    <td
                      style={{
                        textAlign: "right",
                        padding: "0.75rem",
                        color: "var(--foreground)",
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {m.damageDealt ? `${Math.round(m.damageDealt)}m` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Stat cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "1rem",
              marginTop: "2rem",
            }}
          >
            <Card
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                padding: "1.25rem",
                textAlign: "center",
              }}
            >
              <Trophy size={24} color="var(--accent)" weight="duotone" style={{ marginBottom: "0.5rem" }} />
              <div
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "1.5rem",
                  color: "var(--foreground)",
                }}
              >
                {data.models.length}
              </div>
              <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Models Benchmarked</div>
            </Card>
            <Card
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                padding: "1.25rem",
                textAlign: "center",
              }}
            >
              <Sword size={24} color="var(--accent)" weight="duotone" style={{ marginBottom: "0.5rem" }} />
              <div
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "1.5rem",
                  color: "var(--foreground)",
                }}
              >
                {data.models.reduce((a, m) => a + m.sessions, 0)}
              </div>
              <div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Total Sessions</div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
