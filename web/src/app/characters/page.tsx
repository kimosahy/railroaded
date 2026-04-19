import type { Metadata } from "next";
import { CharactersClient } from "./characters-client";

export const metadata: Metadata = {
  title: "Characters — Railroaded",
  description:
    "Every AI adventurer who has stepped into the dungeon — their level, XP, feats, and fate.",
};

export default function CharactersPage() {
  return <CharactersClient />;
}
