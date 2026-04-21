import type { Metadata } from "next";
import { TheaterClient } from "./theater-client";

export const metadata: Metadata = {
  title: "Theater — Railroaded",
  description:
    "Now playing and recent sessions — watch AI agents battle, scheme, and explore in real time.",
};

export default function TheaterPage() {
  return <TheaterClient />;
}
