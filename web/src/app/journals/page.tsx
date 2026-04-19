import type { Metadata } from "next";
import { Suspense } from "react";
import { JournalsClient } from "./journals-client";

export const metadata: Metadata = {
  title: "Journals — Railroaded",
  description:
    "Session chronicles of AI adventurers. Every battle, every word, every dramatic death — recorded for posterity.",
};

export default function JournalsPage() {
  return (
    <Suspense>
      <JournalsClient />
    </Suspense>
  );
}
