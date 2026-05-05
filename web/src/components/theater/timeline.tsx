"use client";
import { useMemo } from "react";
import type { ComposedEmission } from "@theater/composer";
import type { EmissionTrack } from "@theater/types";
import { EmissionText } from "./emission-text";
import { SceneImage } from "./scene-image";
import { InterruptionFlash, InterruptionGap, truncateInterrupted } from "./interruption";
import type { AgentInfo } from "@/hooks/use-session-agents";

// §5.1 within-beat track sort order.
const TRACK_PRIORITY: Record<EmissionTrack, number> = {
  narration: 0,
  action: 1,
  dialogue: 2,
  thought: 3,
  internal_monologue: 4,
};

const BEAT_WINDOW_MS = 2000; // §5.1 group emissions within 2s
const BEAT_GRACE_MS = 200;   // §5.1 finalize delay before render to prevent reshuffle (ATLAS-024 minor 2)

// §5.1 within-beat track stacking (narration→action→dialogue→thought) deferred to CC Doc 12.
// V1 renders sequentially by timestamp.

interface TimelineProps {
  emissions: ComposedEmission[];
  agents: Map<string, AgentInfo>;
  /** Bullet Time is consumed in TheaterClient drain queue — passed for future per-emission pacing. */
  playbackSpeed: number;
}

export function Timeline({ emissions, agents }: TimelineProps) {
  // §5.1 track stacking within beats: group emissions into 2s beats keyed by
  // the first emission's timestamp; sort within each beat by track priority
  // (narration → action → dialogue → thought → internal_monologue).
  const sorted = useMemo(() => {
    const byTime = [...emissions].sort(
      (a, b) =>
        new Date(a.emission.timestamp).getTime() -
        new Date(b.emission.timestamp).getTime()
    );

    // Beat finalization grace: don't reshuffle the most recent beat for
    // BEAT_GRACE_MS after its newest emission to avoid visible re-orderings.
    const now = Date.now();

    const result: ComposedEmission[] = [];
    let beat: ComposedEmission[] = [];
    let beatStart = 0;
    const flush = () => {
      // Determine if the beat is "live" (within grace window) — if so, render
      // in arrival order; otherwise sort by track priority.
      const lastTs = beat.length
        ? new Date(beat[beat.length - 1].emission.timestamp).getTime()
        : 0;
      if (now - lastTs >= BEAT_GRACE_MS) {
        beat.sort((a, b) => {
          const pa = TRACK_PRIORITY[a.emission.track] ?? 99;
          const pb = TRACK_PRIORITY[b.emission.track] ?? 99;
          if (pa !== pb) return pa - pb;
          // Stable secondary by timestamp.
          return new Date(a.emission.timestamp).getTime() - new Date(b.emission.timestamp).getTime();
        });
      }
      result.push(...beat);
      beat = [];
    };
    for (const e of byTime) {
      const ts = new Date(e.emission.timestamp).getTime();
      if (!beat.length) {
        beat.push(e);
        beatStart = ts;
        continue;
      }
      if (ts - beatStart <= BEAT_WINDOW_MS) {
        beat.push(e);
      } else {
        flush();
        beat.push(e);
        beatStart = ts;
      }
    }
    if (beat.length) flush();
    return result;
  }, [emissions]);

  return (
    <div className="space-y-6 max-w-prose mx-auto">
      {sorted.map((composed, i) => {
        const prev = i > 0 ? sorted[i - 1] : null;
        return (
          <EmissionBlock
            key={composed.emission.emission_id}
            composed={composed}
            previous={prev}
            agents={agents}
          />
        );
      })}
    </div>
  );
}

function EmissionBlock({
  composed,
  previous,
  agents,
}: {
  composed: ComposedEmission;
  previous: ComposedEmission | null;
  agents: Map<string, AgentInfo>;
}) {
  const { emission } = composed;
  const agentInfo = agents.get(emission.agent_id);
  const charName = agentInfo?.characterName ?? emission.agent_id;

  const showNameTag =
    emission.track === "dialogue" ||
    emission.track === "action" ||
    emission.track === "thought";

  // §4.3 to-self: skip name tag (AddressRenderer config sets nameTag: "hidden").
  const suppressForAddress = emission.address === "to-self";

  // §5.2: collapse if same agent within 2s of previous emission (ATLAS-019 minor 2)
  const collapseTag =
    !!showNameTag &&
    !!previous &&
    previous.emission.agent_id === emission.agent_id &&
    Math.abs(
      new Date(emission.timestamp).getTime() -
        new Date(previous.emission.timestamp).getTime()
    ) <= 2000;

  // §4.4 interruption: emissions with `interrupting` set are themselves the
  // interrupter — but per spec, the PREVIOUS emission's last word becomes "—".
  // Detect this by checking if NEXT emission has interrupting === this.emission_id.
  const wasInterrupted = !!emission.interrupting; // emission was interrupted by another

  // The previous emission was interrupted if the current emission's `interrupting`
  // points at it. We need the previous emission_id check.
  const previousWasInterrupted =
    !!emission.interrupting && !!previous && previous.emission.emission_id === emission.interrupting;

  const inner = (
    <div className="relative">
      {emission.scene && <SceneImage scene={emission.scene} />}

      {/* §5.2 timeline name tag: 10.5px / 0.22em / --text-secondary */}
      {showNameTag && !collapseTag && !suppressForAddress && (
        <span
          className="block text-[10.5px] uppercase tracking-[0.22em] mb-0.5 font-theater-ui"
          style={{ color: "var(--text-secondary)" }}
        >
          {charName}
        </span>
      )}

      {wasInterrupted ? (
        <InterruptionFlash>
          <span>{truncateInterrupted(emission.content)}</span>
        </InterruptionFlash>
      ) : (
        <EmissionText emission={emission} />
      )}
    </div>
  );

  // §4.4: 12px gap between interrupted and interrupting emission.
  return previousWasInterrupted ? <InterruptionGap>{inner}</InterruptionGap> : inner;
}
