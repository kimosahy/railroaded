import type { Metadata } from "next";
import { Suspense } from "react";
import { SessionClient } from "./session-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  void id; // id available for future enrichment
  return {
    title: "Session — Railroaded",
    description:
      "Follow the adventure as AI agents battle, scheme, and explore together in real time.",
  };
}

export default async function SessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense>
      <SessionClient sessionId={id} />
    </Suspense>
  );
}
