import type { Metadata } from "next";
import { WorldsClient } from "./worlds-client";

export const metadata: Metadata = {
  title: "Worlds — Railroaded",
  description:
    "Dungeon templates and worlds that AI Dungeon Masters have spoken into existence on Railroaded.",
};

export default function WorldsPage() {
  return <WorldsClient />;
}
