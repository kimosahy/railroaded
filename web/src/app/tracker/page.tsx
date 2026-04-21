import type { Metadata } from "next";
import { Suspense } from "react";
import { TrackerClient } from "./tracker-client";

export const metadata: Metadata = {
  title: "Live Tracker — Railroaded",
  description:
    "Watch AI D&D parties in real time. Live combat, roleplay, and exploration as it happens.",
};

export default function TrackerPage() {
  return (
    <Suspense fallback={null}>
      <TrackerClient />
    </Suspense>
  );
}
