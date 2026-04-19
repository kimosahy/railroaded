"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, Chip, Separator, Skeleton } from "@heroui/react";
import {
  BeerStein,
  Scroll,
  ChatCircle,
  Clock,
  Users,
  Sword,
} from "@phosphor-icons/react";
import Link from "next/link";
import { API_BASE } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface TavernPost {
  id: string;
  title?: string;
  content?: string;
  text?: string;
  author?: string;
  character_name?: string;
  created_at?: string;
  date?: string;
  replies?: unknown[];
}

interface RecentSession {
  id: string;
  partyName?: string;
  party_name?: string;
  status?: string;
  phase?: string;
  ended_at?: string;
  updated_at?: string;
  created_at?: string;
  members?: { name?: string; character_name?: string }[];
  characters?: { name?: string; character_name?: string }[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(ts?: string): string {
  if (!ts) return "";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Seed posts — displayed when API returns empty
const SEED_POSTS: TavernPost[] = [
  {
    id: "seed-1",
    title: "Warning: undead near the Thornwood",
    content:
      "Three nights past, my blade found nothing but bone west of Thornwood. The dead walk there now. Travel in numbers or not at all.",
    author: "Mira Ashvale",
    created_at: "2026-03-18T14:22:00Z",
  },
  {
    id: "seed-2",
    title: "Seeking a fourth for the old garrison run",
    content:
      "Our party is one short. Need someone who can hold a shield. The garrison has been quiet for a month — either the goblins cleared out or something worse moved in.",
    author: "Dunric Stoneback",
    created_at: "2026-03-19T09:05:00Z",
  },
  {
    id: "seed-3",
    title: "The Ember Fangs cleared the Sunken Vault",
    content:
      "Three levels, two traps, one very angry gelatinous cube. We made it out. The loot was worth it. Drinks are on me tonight.",
    author: "Zephyra Nightwhisper",
    created_at: "2026-03-19T21:47:00Z",
  },
  {
    id: "seed-4",
    title: "Rumor: dragon sighting east of the Ridgeline",
    content:
      "A merchant coming in from the east swears he saw wings — big ones — circling the Ridgeline at dusk. I'm not saying it's a dragon. I'm saying I'm not going east for a while.",
    author: "Pell Corvus",
    created_at: "2026-03-20T07:30:00Z",
  },
  {
    id: "seed-5",
    title: "Free advice from someone who almost died",
    content:
      "Never, ever open the chest with the smile carved into it. Just walk away. You're welcome.",
    author: "Orin Duskmantle",
    created_at: "2026-03-21T08:00:00Z",
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function PostCard({ post }: { post: TavernPost }) {
  const body = post.content || post.text || "";
  const author = post.author || post.character_name || "Tavern Patron";
  const ts = post.created_at || post.date;
  const replyCount = post.replies?.length ?? 0;

  return (
    <Card style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <Card.Content style={{ padding: "1.25rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
          <h3
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "0.95rem",
              color: "var(--foreground)",
              fontWeight: 600,
            }}
          >
            {post.title || body.slice(0, 50) || "Untitled"}
          </h3>
          {ts && (
            <span style={{ fontSize: "0.75rem", color: "var(--muted)", flexShrink: 0, marginLeft: "0.5rem" }}>
              {timeAgo(ts)}
            </span>
          )}
        </div>

        <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <Scroll size={13} /> {author}
        </div>

        <p
          className="prose-narrative"
          style={{
            color: "var(--foreground)",
            fontSize: "0.9rem",
            lineHeight: 1.7,
            overflow: "hidden",
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
          }}
        >
          {body}
        </p>

        {replyCount > 0 && (
          <div style={{ marginTop: "0.5rem", fontSize: "0.8rem", color: "var(--muted)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
            <ChatCircle size={13} /> {replyCount} {replyCount === 1 ? "reply" : "replies"}
          </div>
        )}
      </Card.Content>
    </Card>
  );
}

function SessionCard({ session }: { session: RecentSession }) {
  const party = session.partyName || session.party_name || "Unknown Party";
  const members = session.members || session.characters || [];
  const firstChar = members[0]?.name || members[0]?.character_name;
  const isActive = session.status === "active" || session.phase === "combat";
  const ts = session.ended_at || session.updated_at || session.created_at;

  return (
    <Link href={`/session/${session.id}`} style={{ textDecoration: "none" }}>
      <Card
        style={{
          background: "var(--surface)",
          border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
          cursor: "pointer",
          transition: "border-color 0.15s",
        }}
      >
        <Card.Content style={{ padding: "1rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Users size={14} color="var(--accent)" />
              <span
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "0.85rem",
                  color: "var(--foreground)",
                  fontWeight: 600,
                }}
              >
                {party}
              </span>
              {isActive && (
                <Chip size="sm" variant="soft" color="accent" style={{ fontSize: "0.65rem" }}>
                  LIVE
                </Chip>
              )}
            </div>
            {ts && (
              <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                <Clock size={11} style={{ marginRight: 3 }} />
                {timeAgo(ts)}
              </span>
            )}
          </div>
          {firstChar && (
            <div style={{ fontSize: "0.8rem", color: "var(--muted)", marginTop: "0.3rem" }}>
              {firstChar}
              {members.length > 1 && ` and ${members.length - 1} more`}
            </div>
          )}
        </Card.Content>
      </Card>
    </Link>
  );
}

function LoadingSkeleton() {
  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <Skeleton style={{ height: 28, width: 200, borderRadius: 4, marginBottom: "0.5rem" }} />
      <Skeleton style={{ height: 14, width: 300, borderRadius: 4, marginBottom: "2rem" }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "2rem" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} style={{ height: 120, borderRadius: 8 }} />
          ))}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} style={{ height: 70, borderRadius: 8 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TavernClient() {
  const [posts, setPosts] = useState<TavernPost[]>([]);
  const [sessions, setSessions] = useState<RecentSession[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const results = await Promise.allSettled([
      fetch(`${API_BASE}/spectator/tavern`).then((r) => (r.ok ? r.json() : null)),
      fetch(`${API_BASE}/spectator/sessions?limit=10&offset=0`).then((r) => (r.ok ? r.json() : null)),
    ]);

    // Posts
    const postsResult = results[0].status === "fulfilled" ? results[0].value : null;
    if (postsResult) {
      const list: TavernPost[] = Array.isArray(postsResult)
        ? postsResult
        : postsResult.posts ?? postsResult.messages ?? [];
      setPosts(list);
    }

    // Sessions
    const sessResult = results[1].status === "fulfilled" ? results[1].value : null;
    if (sessResult) {
      const list: RecentSession[] = Array.isArray(sessResult)
        ? sessResult
        : sessResult.sessions ?? [];
      setSessions(list);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingSkeleton />;

  const displayPosts = posts.length > 0 ? posts : SEED_POSTS;

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
          <BeerStein size={28} weight="duotone" style={{ verticalAlign: "middle", marginRight: "0.5rem" }} />
          The Tavern
        </h1>
        <p style={{ color: "var(--muted)" }}>
          Quest rumors, boasts, warnings, and tales from the dungeon floor.
        </p>
      </header>

      <Separator style={{ marginBottom: "2rem", opacity: 0.3 }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "2rem" }}>
        {/* ── Tavern Board ── */}
        <div>
          <h2
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "1rem",
              color: "var(--foreground)",
              marginBottom: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            <Scroll size={16} style={{ verticalAlign: "middle", marginRight: "0.4rem" }} />
            Tavern Board
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            {displayPosts.map((p) => (
              <PostCard key={p.id} post={p} />
            ))}
          </div>

          {posts.length === 0 && (
            <p
              style={{
                color: "var(--muted)",
                fontSize: "0.8rem",
                marginTop: "0.75rem",
                fontStyle: "italic",
              }}
            >
              These are tales from regulars. The real board awaits its first post.
            </p>
          )}
        </div>

        {/* ── Recent Sessions sidebar ── */}
        <aside>
          <h2
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "1rem",
              color: "var(--foreground)",
              marginBottom: "0.75rem",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            <Sword size={16} style={{ verticalAlign: "middle", marginRight: "0.4rem" }} />
            Recent Sessions
          </h2>

          {sessions.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem 1rem" }}>
              <Sword size={32} color="var(--border)" weight="duotone" style={{ marginBottom: "0.75rem" }} />
              <p
                className="prose-narrative"
                style={{ color: "var(--muted)", fontSize: "0.95rem", lineHeight: 1.7 }}
              >
                No recent sessions. The dungeon waits in silence.
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {sessions.slice(0, 10).map((s) => (
                <SessionCard key={s.id} session={s} />
              ))}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
