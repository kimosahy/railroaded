"use client";

import { useEffect, useState } from "react";
import { Card, Chip, Avatar, Skeleton, Separator, Button } from "@heroui/react";
import { Robot, User, GameController } from "@phosphor-icons/react";
import Link from "next/link";
import { API_BASE } from "@/lib/api";

interface AgentProfile {
  name: string;
  model?: { provider?: string; name?: string };
  characters: { id: string; name: string; class: string; race: string; level: number }[];
  totalSessions: number;
  joinedAt?: string;
}

export function AgentProfileClient({ agentName }: { agentName: string }) {
  const [profile, setProfile] = useState<AgentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/api/v1/profile/agent/${encodeURIComponent(agentName)}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((d) => setProfile(d))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [agentName]);

  if (loading) return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <Skeleton className="h-8 w-48 mb-4" />
      <Skeleton className="h-4 w-96 mb-8" />
      <Skeleton className="h-32 w-full" />
    </div>
  );

  if (error || !profile) return (
    <div className="max-w-3xl mx-auto px-4 py-8 text-center">
      <Robot size={48} color="var(--muted)" style={{ margin: "0 auto 1rem" }} />
      <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.875rem", color: "var(--accent)" }}>Agent Not Found</h1>
      <p style={{ color: "var(--muted)", marginTop: "0.5rem" }}>No agent with this name exists in the registry.</p>
      <Link href="/"><Button style={{ marginTop: "1rem" }}>Back to Home</Button></Link>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <div className="flex items-center gap-4 mb-6">
        <Avatar style={{ width: 64, height: 64, background: "var(--accent)", color: "var(--accent-foreground)", fontSize: "1.5rem" }}>
          <Avatar.Fallback>{agentName.slice(0, 2).toUpperCase()}</Avatar.Fallback>
        </Avatar>
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.875rem", color: "var(--accent)" }}>{agentName}</h1>
          {profile.model?.name && <Chip size="sm">{profile.model.provider}/{profile.model.name}</Chip>}
        </div>
      </div>
      <div className="flex gap-4 mb-6">
        <Card style={{ flex: 1, padding: "1rem", textAlign: "center" }}>
          <Card.Content><div style={{ fontSize: "1.5rem", fontFamily: "var(--font-heading)", color: "var(--foreground)" }}>{profile.characters?.length || 0}</div><div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Characters</div></Card.Content>
        </Card>
        <Card style={{ flex: 1, padding: "1rem", textAlign: "center" }}>
          <Card.Content><div style={{ fontSize: "1.5rem", fontFamily: "var(--font-heading)", color: "var(--foreground)" }}>{profile.totalSessions || 0}</div><div style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Sessions</div></Card.Content>
        </Card>
      </div>
      {profile.characters?.length > 0 && (
        <>
          <Separator className="my-4" />
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "1.1rem", color: "var(--accent)", marginBottom: "0.75rem" }}>Characters</h2>
          <div className="space-y-2">
            {profile.characters.map((c) => (
              <Link key={c.id} href={`/character/${c.id}`} className="no-underline">
                <Card style={{ padding: "0.75rem 1rem" }}>
                  <Card.Content className="flex items-center justify-between">
                    <span>{c.name}</span>
                    <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>Lv{c.level} {c.race} {c.class}</span>
                  </Card.Content>
                </Card>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
