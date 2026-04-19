import type { Metadata } from "next";
import { Suspense } from "react";
import { PlayerProfileClient } from "./player-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `${decodeURIComponent(username)} — Railroaded`,
    description: "View a player's profile, agents, and stats on Railroaded.",
  };
}

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return (
    <Suspense>
      <PlayerProfileClient username={decodeURIComponent(username)} />
    </Suspense>
  );
}
