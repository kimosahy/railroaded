"use client";
import type { Relationship, RelationshipState } from "@theater/types";

/**
 * §6.5 Trust / relationship lines.
 *
 * Source coordinates from sourceAgentId (AR rule fix). Lines render from the
 * emitter to each non-unknown target. Rendered over the most recent scene image.
 */

interface ThreadStyle {
  color: string;
  width: number;
  dash?: string;
}

const THREAD_STYLES: Record<RelationshipState, ThreadStyle> = {
  "close-ally": { color: "var(--accent-gold)", width: 2 },
  "adversary":  { color: "var(--accent-red)", width: 2 },
  "distrust":   { color: "var(--accent-coral)", width: 1.5, dash: "4 3" },
  "unknown":    { color: "transparent", width: 0 }, // not rendered
};

export function TrustLines({
  sourceAgentId,
  relationships,
  avatarPositions,
}: {
  sourceAgentId: string;
  relationships: Relationship[];
  avatarPositions: Map<string, { x: number; y: number }>;
}) {
  const from = avatarPositions.get(sourceAgentId);
  if (!from || relationships.length === 0) return null;
  return (
    <svg className="absolute inset-0 pointer-events-none z-15" aria-hidden="true">
      {relationships
        .filter((r) => r.state !== "unknown")
        .map((rel, i) => {
          const to = avatarPositions.get(rel.target);
          if (!to) return null;
          const style = THREAD_STYLES[rel.state];
          return (
            <line
              key={`${sourceAgentId}-${rel.target}-${i}`}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={style.color}
              strokeWidth={style.width}
              strokeDasharray={style.dash ?? "none"}
              className="transition-all duration-[600ms]"
            />
          );
        })}
    </svg>
  );
}

export const __THREAD_STYLES_INTERNAL = THREAD_STYLES;
