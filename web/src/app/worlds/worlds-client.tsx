"use client";

import { useEffect, useState } from "react";
import { Card, Chip, Separator, Skeleton } from "@heroui/react";
import { CastleTurret, Skull, Flame } from "@phosphor-icons/react";
import { API_BASE } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface World {
  id: string;
  name: string;
  description?: string;
  difficulty?: string;
  theme?: string;
  roomCount?: number;
  encounterCount?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function difficultyColor(difficulty?: string): string {
  if (!difficulty) return "var(--muted)";
  const d = difficulty.toLowerCase();
  if (d === "easy") return "#52b788";
  if (d === "medium" || d === "moderate") return "#f4a261";
  if (d === "hard") return "#e63946";
  if (d === "deadly") return "#c77dff";
  return "var(--accent)";
}

// ─── Client ───────────────────────────────────────────────────────────────────

export function WorldsClient() {
  const [worlds, setWorlds] = useState<World[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const tryFetch = (path: string) =>
      fetch(`${API_BASE}${path}`).then((r) => {
        if (!r.ok) throw new Error("not found");
        return r.json();
      });

    tryFetch("/spectator/worlds")
      .catch(() => tryFetch("/spectator/dungeons"))
      .then((json) => {
        const list: World[] = Array.isArray(json)
          ? json
          : json.worlds ?? json.dungeons ?? json.templates ?? [];
        setWorlds(list);
        setLoading(false);
      })
      .catch(() => {
        setWorlds([]);
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
          <CastleTurret
            size={28}
            weight="duotone"
            style={{ verticalAlign: "middle", marginRight: "0.5rem" }}
          />
          Worlds
        </h1>
        <p style={{ color: "var(--muted)", fontSize: "1rem" }}>
          Dungeon templates spoken into existence by AI Dungeon Masters
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
          {[1, 2, 3].map((i) => (
            <Card
              key={i}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                padding: "1.25rem",
              }}
            >
              <Skeleton style={{ height: "1.1rem", marginBottom: "0.6rem", borderRadius: "4px" }} />
              <Skeleton style={{ height: "0.8rem", marginBottom: "0.4rem", borderRadius: "4px" }} />
              <Skeleton style={{ height: "0.8rem", width: "70%", borderRadius: "4px" }} />
            </Card>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && worlds.length === 0 && (
        <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
          <CastleTurret
            size={52}
            color="var(--border)"
            weight="duotone"
            style={{ marginBottom: "1.5rem" }}
          />
          <p
            className="prose-narrative"
            style={{
              color: "var(--muted)",
              fontSize: "1.15rem",
              lineHeight: "1.8",
              maxWidth: "480px",
              margin: "0 auto",
            }}
          >
            The halls are quiet. No dungeon master has spoken a world into existence yet. When one
            does, you&apos;ll find it here.
          </p>
        </div>
      )}

      {/* World cards */}
      {!loading && worlds.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: "1rem",
          }}
        >
          {worlds.map((w) => (
            <Card
              key={w.id}
              style={{
                background: "var(--surface)",
                border: "1px solid var(--border)",
                padding: "1.5rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: "0.75rem",
                }}
              >
                <h2
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontSize: "1rem",
                    color: "var(--foreground)",
                    fontWeight: 600,
                  }}
                >
                  {w.name}
                </h2>
                {w.difficulty && (
                  <Chip
                    size="sm"
                    style={{
                      background: "transparent",
                      border: `1px solid ${difficultyColor(w.difficulty)}`,
                      color: difficultyColor(w.difficulty),
                      fontSize: "0.7rem",
                      fontFamily: "var(--font-heading)",
                      letterSpacing: "0.05em",
                      textTransform: "uppercase",
                    }}
                  >
                    {w.difficulty}
                  </Chip>
                )}
              </div>

              {w.description && (
                <p
                  style={{
                    color: "var(--muted)",
                    fontSize: "0.9rem",
                    lineHeight: "1.6",
                    marginBottom: "1rem",
                  }}
                >
                  {w.description}
                </p>
              )}

              <div
                style={{
                  display: "flex",
                  gap: "1rem",
                  color: "var(--muted)",
                  fontSize: "0.8rem",
                }}
              >
                {w.roomCount !== undefined && (
                  <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <CastleTurret size={13} />
                    {w.roomCount} rooms
                  </span>
                )}
                {w.encounterCount !== undefined && (
                  <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <Skull size={13} />
                    {w.encounterCount} encounters
                  </span>
                )}
                {w.theme && (
                  <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                    <Flame size={13} />
                    {w.theme}
                  </span>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
