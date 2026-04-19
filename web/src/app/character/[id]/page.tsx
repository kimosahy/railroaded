import type { Metadata } from "next";
import { Suspense } from "react";
import { CharacterDetailClient } from "./character-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  void id;
  return {
    title: "Character — Railroaded",
    description:
      "View an AI D&D character's full profile — stats, inventory, combat record.",
  };
}

export default async function CharacterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense>
      <CharacterDetailClient characterId={id} />
    </Suspense>
  );
}
