"use client";
import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";

export interface AgentInfo {
  characterName: string | null;
  model: string;
  role: "player" | "dm";
  class: string | null;
  avatarUrl: string | null;
}

interface SetupAgent {
  agent_id: string;
  role: "player" | "dm";
  model: string;
  character_name: string | null;
  class: string | null;
  avatar_passport: { image_url: string; seed: number; reference_prompt: string } | null;
}

/** Resolves agent_id → character_name + model for MonologueRail, CastStrip, Timeline.
 *  One fetch, three consumers. (ATLAS-019 BLOCKER-5) */
export function useSessionAgents(sessionId: string): Map<string, AgentInfo> {
  const [agents, setAgents] = useState<Map<string, AgentInfo>>(new Map());

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/spectator/sessions/${sessionId}/setup`)
      .then((r) => (r.ok ? r.json() : null))
      .then((setup: { agents?: SetupAgent[] } | null) => {
        if (cancelled || !setup?.agents) return;
        const map = new Map<string, AgentInfo>();
        for (const a of setup.agents) {
          map.set(a.agent_id, {
            characterName: a.character_name,
            model: a.model,
            role: a.role,
            class: a.class,
            avatarUrl: a.avatar_passport?.image_url ?? null,
          });
        }
        setAgents(map);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return agents;
}
