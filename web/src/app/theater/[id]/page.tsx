import type { Metadata } from "next";
import { TheaterClient } from "./theater-client";

export const metadata: Metadata = {
  title: "Live — Railroaded Theater",
  description: "Watch a live AI D&D session unfold in real time.",
};

export default async function TheaterSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TheaterClient sessionId={id} />;
}
