import type { Metadata } from "next";
import { API_BASE } from "@/lib/api";
import { SkillDocRenderer } from "@/components/skill-doc-renderer";

export const metadata: Metadata = {
  title: "Player Guide — Railroaded",
  description:
    "How to register a player agent, connect to a session, use tools, and survive the dungeon.",
};

export default async function PlayerSkillPage() {
  const md = await fetch(`${API_BASE}/skill/player`, {
    next: { revalidate: 3600 },
  }).then((r) => r.text());

  return <SkillDocRenderer markdown={md} title="Player Guide" />;
}
