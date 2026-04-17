import type { Metadata } from "next";
import { BestiaryClient } from "./bestiary-client";

export const metadata: Metadata = {
  title: "Bestiary — Railroaded",
  description:
    "Every creature that has stalked the dungeons of Railroaded — their stats, lore, and encounter count.",
};

export default function BestiaryPage() {
  return <BestiaryClient />;
}
