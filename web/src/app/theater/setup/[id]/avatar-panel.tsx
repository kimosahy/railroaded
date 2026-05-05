"use client";
import { useState } from "react";
import { LoadingShimmer } from "@/components/theater/seam-treatments";
import type { SessionSetup } from "@theater/types";

type PlayerAgent = SessionSetup["agents"][number];

export interface AvatarCandidate {
  url: string;
  seed: number;
}

// §10.2 VERBATIM — 3×1 grid at 256×256 px
export const AVATAR_GRID_CLASS = "grid grid-cols-[repeat(3,16rem)] gap-3 mb-3 overflow-x-auto";
export const AVATAR_IMG_CLASS = "w-64 h-64 rounded object-cover border-2 border-transparent hover:border-[var(--accent-gold)]";
export const AVATAR_LOCKED_CLASS = "w-24 h-24 rounded object-cover";

interface AvatarPanelProps {
  player: PlayerAgent;
  onLock: (agentId: string) => void;
  onUnlock: (agentId: string) => void;
}

export function AvatarPanel({ player, onLock, onUnlock }: AvatarPanelProps) {
  const [candidates, setCandidates] = useState<AvatarCandidate[]>([]);
  const [generating, setGenerating] = useState(false);
  const [locked, setLocked] = useState(player.avatar_passport !== null);
  const [selectedCandidate, setSelectedCandidate] = useState<AvatarCandidate | null>(
    player.avatar_passport ? { url: player.avatar_passport.image_url, seed: player.avatar_passport.seed } : null
  );

  const handlePick = (candidate: AvatarCandidate) => {
    setSelectedCandidate(candidate);
    setLocked(true);
    onLock(player.agent_id);
    // TODO: PATCH session setup with avatar_passport: { image_url: candidate.url, seed: candidate.seed, reference_prompt: ... }
  };

  const handleRegenerate = () => {
    setLocked(false);
    setSelectedCandidate(null);
    onUnlock(player.agent_id);
    setGenerating(true);
    // TODO: call image-gen API → returns Array<{url, seed}>
    // On success: setCandidates(results); setGenerating(false);
  };

  if (locked && selectedCandidate) {
    return (
      <div className="flex items-center gap-3 p-3 rounded mb-3" style={{ backgroundColor: "var(--bg-frame)" }}>
        {/* §10.2: collapsed to 96×96 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={selectedCandidate.url} alt={player.character_name ?? ""} className={AVATAR_LOCKED_CLASS} />
        <div>
          <span className="font-theater-heading text-base" style={{ color: "var(--text-primary)" }}>
            {player.character_name}
          </span>
          {player.class && <span className="text-[13px] font-theater-ui ml-2" style={{ color: "var(--text-secondary)" }}>{player.class}</span>}
          <button onClick={() => { setLocked(false); onUnlock(player.agent_id); }}
            className="block text-[13px] font-theater-ui mt-1 min-h-[44px]" style={{ color: "var(--accent-gold)" }}>
            change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 rounded mb-3" style={{ backgroundColor: "var(--bg-frame)" }}>
      <h3 className="font-theater-heading text-lg mb-3" style={{ color: "var(--text-primary)" }}>
        {player.character_name}
        {player.class && <span className="text-[13px] font-theater-ui ml-2" style={{ color: "var(--text-secondary)" }}>{player.class}</span>}
      </h3>

      <div className={AVATAR_GRID_CLASS}>
        {generating ? (
          <>{[0, 1, 2].map(i => <div key={i} className="w-64 h-64"><LoadingShimmer /></div>)}</>
        ) : candidates.length > 0 ? (
          candidates.map((c, i) => (
            <div key={i} className="relative cursor-pointer min-h-[44px]" onClick={() => handlePick(c)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={c.url} alt={`Option ${i + 1}`} className={AVATAR_IMG_CLASS} />
              <span className="absolute bottom-1 left-1 text-[11px] font-theater-ui px-1 rounded"
                style={{ backgroundColor: "var(--bg-canvas)", color: "var(--text-faded)" }}>
                Option {i + 1}
              </span>
            </div>
          ))
        ) : (
          <div className="col-span-3 text-center py-8 text-[var(--text-faded)] text-sm font-theater-ui">
            No candidates generated yet
          </div>
        )}
      </div>

      <button onClick={handleRegenerate}
        className="px-4 py-2 rounded font-theater-ui text-[13px] min-h-[44px] border border-[var(--border-faint)]"
        style={{ color: "var(--text-primary)" }}>
        {candidates.length > 0 ? "Regenerate all" : "Generate avatars"}
      </button>
    </div>
  );
}

