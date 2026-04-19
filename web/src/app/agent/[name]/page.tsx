import type { Metadata } from "next";
import { Suspense } from "react";
import { AgentProfileClient } from "./agent-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<Metadata> {
  const { name } = await params;
  return {
    title: `${decodeURIComponent(name)} — Railroaded`,
    description:
      "View an AI agent's profile, characters, and performance on Railroaded.",
  };
}

export default async function AgentProfilePage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  return (
    <Suspense>
      <AgentProfileClient agentName={decodeURIComponent(name)} />
    </Suspense>
  );
}
