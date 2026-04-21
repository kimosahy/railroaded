"use client";

import { Avatar, Card, Chip, Skeleton } from "@heroui/react";
import { Users } from "@phosphor-icons/react";
import type { Member, Party, Session } from "@/app/tracker/tracker-client";
import { SessionList } from "./session-list";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CHAR_COLORS = [
  "#c9a84c", "#5b9bd5", "#4caf50", "#e85555",
  "#a47bd5", "#e8945b", "#5bcbd5", "#d5a75b",
];

function charColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return CHAR_COLORS[Math.abs(hash) % CHAR_COLORS.length];
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

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
  return { label: phase ? phase.replace(/_/g, " ") : "Forming", color: "var(--accent)", bg: "rgba(138,112,51,0.18)", border: "#8a7033" };
}

function safeAvatarUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const p = new URL(url);
    if (p.hostname.includes("dicebear.com")) return undefined;
    if (p.hostname.includes("oaidalleapiprodscus.blob")) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

// ─── Member pip ───────────────────────────────────────────────────────────────

function MemberPip({ member }: { member: Member }) {
  const col = charColor(member.name);
  const safe = safeAvatarUrl(member.avatarUrl);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.3rem",
        background: "rgba(201,168,76,0.07)",
        border: "1px solid var(--border)",
        borderRadius: 4,
        padding: "0.1rem 0.45rem",
        fontSize: "0.78rem",
        color: "var(--foreground)",
      }}
    >
      <Avatar size="sm" style={{ width: 18, height: 18 }}>
        {safe ? (
          <Avatar.Image src={safe} alt={member.name} />
        ) : null}
        <Avatar.Fallback
          style={{
            background: col,
            color: "#0a0a0f",
            fontSize: "0.5rem",
            fontFamily: "var(--font-heading)",
            fontWeight: 700,
          }}
        >
          {initials(member.name)}
        </Avatar.Fallback>
      </Avatar>
      {member.name}
      <span style={{ color: "var(--muted)", fontSize: "0.7rem" }}>
        {member.className}
      </span>
    </span>
  );
}

// ─── Party card ───────────────────────────────────────────────────────────────

function PartyCard({
  party,
  isSelected,
  onClick,
}: {
  party: Party;
  isSelected: boolean;
  onClick: () => void;
}) {
  const phase = phaseMeta(party.status);

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
      style={{ marginBottom: "0.75rem" }}
    >
      <Card
        style={{
          background: isSelected ? "oklch(0.19 0.01 270)" : "var(--surface)",
          border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
          borderLeft: isSelected ? "3px solid var(--accent)" : undefined,
          borderRadius: 8,
          transition: "border-color 0.2s, background 0.2s",
        }}
      >
        <Card.Content style={{ padding: "1rem 1.1rem" }}>
          <div
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "1rem",
              color: "var(--accent)",
              marginBottom: "0.35rem",
              lineHeight: 1.3,
            }}
          >
            {party.name}
          </div>

          <div
            className="flex items-center gap-2 flex-wrap"
            style={{ marginBottom: "0.4rem" }}
          >
            <span
              style={{
                display: "inline-block",
                padding: "0.12rem 0.5rem",
                borderRadius: 4,
                fontFamily: "var(--font-heading)",
                fontSize: "0.65rem",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                background: phase.bg,
                color: phase.color,
                border: `1px solid ${phase.border}`,
              }}
            >
              {phase.label}
            </span>

            {party.dungeonName && (
              <span style={{ color: "var(--muted)", fontSize: "0.78rem" }}>
                {party.dungeonName}
              </span>
            )}

            <span style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
              {party.members.length}
              <Users
                size={11}
                style={{ display: "inline", marginLeft: 3, verticalAlign: "middle" }}
              />
            </span>
          </div>

          <div className="flex flex-wrap gap-1">
            {party.members.map((m) => (
              <MemberPip key={m.name} member={m} />
            ))}
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}

// ─── Skeleton cards ───────────────────────────────────────────────────────────

function PartySkeletons() {
  return (
    <>
      {[90, 70, 55].map((w, i) => (
        <div
          key={i}
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "1.1rem",
            marginBottom: "0.75rem",
          }}
        >
          <Skeleton className={`h-4 w-[${w}%] rounded-md mb-3`} />
          <div className="flex gap-2 mb-3">
            <Skeleton className="h-5 w-16 rounded" />
            <Skeleton className="h-5 w-12 rounded" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-5 w-14 rounded" />
            <Skeleton className="h-5 w-14 rounded" />
            {i > 0 && <Skeleton className="h-5 w-14 rounded" />}
          </div>
        </div>
      ))}
    </>
  );
}

// ─── Section label ────────────────────────────────────────────────────────────

function SectionLabel({
  children,
  live,
}: {
  children: React.ReactNode;
  live?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between"
      style={{
        fontFamily: "var(--font-heading)",
        fontSize: "0.72rem",
        color: "var(--muted)",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        margin: "1rem 0 0.5rem",
        paddingBottom: "0.3rem",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <span>{children}</span>
      {live && (
        <span className="flex items-center gap-1" style={{ fontSize: "0.68rem" }}>
          <span
            className="inline-block rounded-full animate-pulse"
            style={{ width: 5, height: 5, background: "var(--success)" }}
          />
          Auto-refresh
        </span>
      )}
    </div>
  );
}

// ─── PartyList ────────────────────────────────────────────────────────────────

export interface PartyListProps {
  parties: Party[];
  sessions: Session[];
  selectedPartyId: string | null;
  selectedSessionId: string | null;
  onSelectParty: (id: string) => void;
  onSelectSession: (id: string) => void;
  loading: boolean;
  loadingSessions: boolean;
  hasMoreSessions?: boolean;
  loadingMoreSessions?: boolean;
  onLoadMoreSessions?: () => void;
}

export function PartyList({
  parties,
  sessions,
  selectedPartyId,
  selectedSessionId,
  onSelectParty,
  onSelectSession,
  loading,
  loadingSessions,
  hasMoreSessions,
  loadingMoreSessions,
  onLoadMoreSessions,
}: PartyListProps) {
  return (
    <div>
      <SectionLabel live>Live Parties</SectionLabel>

      {loading ? (
        <PartySkeletons />
      ) : parties.length === 0 ? (
        <div
          style={{
            textAlign: "center",
            padding: "2rem 1rem",
            color: "var(--muted)",
            fontSize: "0.9rem",
          }}
        >
          No active parties.
        </div>
      ) : (
        parties.map((p) => (
          <PartyCard
            key={p.id}
            party={p}
            isSelected={p.id === selectedPartyId}
            onClick={() => onSelectParty(p.id)}
          />
        ))
      )}

      <SectionLabel>Past Sessions</SectionLabel>

      <SessionList
        sessions={sessions}
        selectedSessionId={selectedSessionId}
        onSelectSession={onSelectSession}
        loading={loadingSessions}
        hasMore={hasMoreSessions}
        loadingMore={loadingMoreSessions}
        onLoadMore={onLoadMoreSessions}
      />
    </div>
  );
}
