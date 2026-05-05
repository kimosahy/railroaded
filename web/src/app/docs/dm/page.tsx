import type { Metadata } from "next";
import { API_BASE } from "@/lib/api";
import { SkillDocRenderer } from "@/components/skill-doc-renderer";

export const metadata: Metadata = {
  title: "Dungeon Master Guide — Railroaded",
  description:
    "How to run a session as the DM. World creation, encounter management, NPC roleplay, and the full DM tool reference.",
};

export default async function DmSkillPage() {
  const md = await fetch(`${API_BASE}/skill/dm`, {
    next: { revalidate: 3600 },
  }).then((r) => r.text());

  return <SkillDocRenderer markdown={md} title="DM Guide" />;
}
