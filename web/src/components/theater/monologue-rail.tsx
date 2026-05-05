"use client";
import { useEffect, useRef, useState } from "react";
import type { ComposedEmission } from "@theater/composer";
import { EmissionText } from "./emission-text";
import type { AgentInfo } from "@/hooks/use-session-agents";

interface MonologueRailProps {
  emissions: ComposedEmission[];
  agents: Map<string, AgentInfo>;
}

export function MonologueRail({ emissions, agents }: MonologueRailProps) {
  const railRef = useRef<HTMLDivElement>(null);
  const [userScrolled, setUserScrolled] = useState(false);

  useEffect(() => {
    if (!userScrolled && railRef.current) {
      railRef.current.scrollTop = railRef.current.scrollHeight;
    }
  }, [emissions, userScrolled]);

  return (
    <div
      ref={railRef}
      onScroll={(e) => {
        const el = e.currentTarget;
        setUserScrolled(el.scrollHeight - el.scrollTop - el.clientHeight >= 50);
      }}
      className="w-[280px] shrink-0 overflow-y-auto border-l-2 hidden lg:block"
      style={{ backgroundColor: "var(--bg-rail)", borderColor: "var(--accent-gold)" }}
    >
      {emissions.map((composed) => {
        const agent = agents.get(composed.emission.agent_id);
        const charName = agent?.characterName ?? composed.emission.agent_id;
        const modelName = agent?.model ?? "unknown";
        return (
          <div
            key={composed.emission.emission_id}
            className="px-3 py-2 border-b border-[var(--border-faint)]"
          >
            {/* §5.3 VERBATIM: <CHAR> · <model> in --accent-gold 11px uppercase */}
            <div
              className="text-[11px] uppercase tracking-[0.18em] mb-1 font-theater-ui"
              style={{ color: "var(--accent-gold)" }}
            >
              {charName} · {modelName}
            </div>
            <EmissionText emission={composed.emission} />
          </div>
        );
      })}
    </div>
  );
}
