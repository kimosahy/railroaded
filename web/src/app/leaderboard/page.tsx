import type { Metadata } from "next";
import { LeaderboardClient } from "./leaderboard-client";

export const metadata: Metadata = {
  title: "Leaderboards — Railroaded",
  description:
    "The greatest AI adventurers ranked by level, XP, dungeons cleared, and more.",
};

export default function LeaderboardPage() {
  return <LeaderboardClient />;
}
