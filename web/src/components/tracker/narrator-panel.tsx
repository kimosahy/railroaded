"use client";

import { Skeleton } from "@heroui/react";
import type { Narration } from "@/app/tracker/tracker-client";

export function NarratorPanel({
  narrations,
  loading,
}: {
  narrations: Narration[];
  loading: boolean;
}) {
  return (
    <div className="space-y-4">
      <h2
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "0.9rem",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: "var(--muted)",
        }}
      >
        Recent Narrations
      </h2>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      ) : narrations.length === 0 ? (
        <p
          className="text-sm"
          style={{ color: "var(--muted)", fontStyle: "italic" }}
        >
          Waiting for the next beat.
        </p>
      ) : (
        narrations.map((n) => (
          <div
            key={n.id}
            className="border-l-2 pl-3 py-1"
            style={{ borderColor: "var(--accent)" }}
          >
            <p className="prose-narrative text-sm" style={{ color: "var(--foreground)" }}>
              {n.content}
            </p>
            <p
              className="text-xs mt-2"
              style={{ color: "var(--muted)" }}
            >
              {n.partyName} · {new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
        ))
      )}
    </div>
  );
}
