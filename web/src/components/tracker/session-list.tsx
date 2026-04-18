"use client";

import { Card, Chip, Skeleton } from "@heroui/react";
import type { Session } from "@/app/tracker/tracker-client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function phaseMeta(phase?: string): { label: string; color: string; bg: string; border: string } {
  const p = (phase ?? "").toLowerCase();
  if (p.includes("combat"))
    return { label: "Combat", color: "#c43c3c", bg: "rgba(139,32,32,0.25)", border: "#8b2020" };
  if (p.includes("explor"))
    return { label: "Exploration", color: "#5b9bd5", bg: "rgba(45,74,107,0.25)", border: "#2d4a6b" };
  if (p.includes("roleplay"))
    return { label: "Roleplay", color: "#4caf50", bg: "rgba(45,107,63,0.25)", border: "#2d6b3f" };
  if (p.includes("town"))
    return { label: "Town", color: "#4caf50", bg: "rgba(45,107,63,0.2)", border: "#2d6b3f" };
  return {
    label: phase ? phase.replace(/_/g, " ") : "Forming",
    color: "var(--accent)",
    bg: "rgba(138,112,51,0.18)",
    border: "#8a7033",
  };
}

function outcomeLabel(outcome?: string): { text: string; color: string } | null {
  if (!outcome) return null;
  const map: Record<string, { text: string; color: string }> = {
    victory: { text: "Victory", color: "#c9a84c" },
    tpk: { text: "TPK", color: "#e85555" },
    retreat: { text: "Retreat", color: "#5b9bd5" },
    abandoned: { text: "Abandoned", color: "#8a8780" },
  };
  return map[outcome] ?? { text: outcome, color: "#8a8780" };
}

function formatTime(iso?: string): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Session card ─────────────────────────────────────────────────────────────

function SessionCard({
  session,
  isSelected,
  onClick,
}: {
  session: Session;
  isSelected: boolean;
  onClick: () => void;
}) {
  const phase = phaseMeta(session.phase);
  const outcome = outcomeLabel(session.outcome);
  const isEmpty = session.eventCount === 0;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="cursor-pointer focus-visible:outline-none"
      style={{ marginBottom: "0.55rem" }}
    >
      <Card
        style={{
          background: isSelected ? "oklch(0.19 0.01 270)" : "var(--surface)",
          borderWidth: isSelected ? "1px 1px 1px 3px" : "1px",
          borderColor: isSelected ? "var(--accent)" : "var(--border)",
          borderStyle: isEmpty && !session.isActive ? "dashed" : "solid",
          borderRadius: 8,
          opacity: isEmpty && !session.isActive ? 0.6 : 1,
          transition: "border-color 0.2s, background 0.2s",
        }}
      >
        <Card.Content style={{ padding: "0.8rem 1rem" }}>
          {/* Party name */}
          <div
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "0.9rem",
              color: "var(--accent)",
              marginBottom: "0.3rem",
              lineHeight: 1.3,
            }}
          >
            {session.partyName}
          </div>

          {/* Meta row */}
          <div
            className="flex items-center gap-2 flex-wrap"
            style={{ marginBottom: "0.25rem" }}
          >
            {session.isActive && (
              <span
                style={{
                  display: "inline-block",
                  padding: "0.1rem 0.45rem",
                  borderRadius: 4,
                  fontFamily: "var(--font-heading)",
                  fontSize: "0.62rem",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  background: phase.bg,
                  color: phase.color,
                  border: `1px solid ${phase.border}`,
                }}
              >
                {phase.label}
              </span>
            )}

            {outcome && (
              <span
                style={{
                  fontSize: "0.68rem",
                  padding: "0.1rem 0.4rem",
                  borderRadius: 3,
                  background: `${outcome.color}22`,
                  color: outcome.color,
                }}
              >
                {outcome.text}
              </span>
            )}

            <span
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "0.68rem",
                color: "var(--muted)",
              }}
            >
              {isEmpty ? (
                <em>No events</em>
              ) : (
                `${session.eventCount} events`
              )}
            </span>

            <span style={{ color: "var(--muted)", fontSize: "0.68rem" }}>
              {formatTime(session.startedAt)}
            </span>
          </div>

          {/* Summary */}
          {session.summary && (
            <p
              style={{
                fontSize: "0.78rem",
                color: "var(--muted)",
                fontStyle: "italic",
                lineHeight: 1.5,
                marginTop: "0.2rem",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }}
            >
              {session.summary}
            </p>
          )}
        </Card.Content>
      </Card>
    </div>
  );
}

// ─── Skeletons ────────────────────────────────────────────────────────────────

function SessionSkeletons() {
  return (
    <>
      {[80, 65, 75].map((w, i) => (
        <div
          key={i}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "0.8rem 1rem",
            marginBottom: "0.55rem",
          }}
        >
          <Skeleton className={`h-3.5 w-[${w}%] rounded mb-2`} />
          <div className="flex gap-2">
            <Skeleton className="h-3 w-14 rounded" />
            <Skeleton className="h-3 w-20 rounded" />
          </div>
        </div>
      ))}
    </>
  );
}

// ─── SessionList ──────────────────────────────────────────────────────────────

export interface SessionListProps {
  sessions: Session[];
  selectedSessionId: string | null;
  onSelectSession: (id: string) => void;
  loading: boolean;
}

export function SessionList({
  sessions,
  selectedSessionId,
  onSelectSession,
  loading,
}: SessionListProps) {
  if (loading) return <SessionSkeletons />;

  if (sessions.length === 0) {
    return (
      <div
        style={{
          textAlign: "center",
          padding: "1.5rem 1rem",
          color: "var(--muted)",
          fontSize: "0.85rem",
        }}
      >
        No sessions found.
      </div>
    );
  }

  return (
    <div>
      {sessions.map((s) => (
        <SessionCard
          key={s.id}
          session={s}
          isSelected={s.id === selectedSessionId}
          onClick={() => onSelectSession(s.id)}
        />
      ))}
    </div>
  );
}
