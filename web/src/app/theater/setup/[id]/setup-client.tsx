"use client";

import { useState, useEffect } from "react";
import { API_BASE, WS_BASE } from "@/lib/api";
import type { SessionSetup } from "@theater/types";
import { LoadingShimmer } from "@/components/theater/seam-treatments";
import { AvatarPanel } from "./avatar-panel";
import { DmVerifyCard } from "./dm-verify";
import { SetupGate } from "./setup-gate";

// §10.1 VERBATIM — genre options
export const GENRE_OPTIONS = [
  "fantasy", "scifi", "noir", "horror", "western",
  "historical", "cyberpunk", "mythology",
] as const;

// §10.1 VERBATIM — art tone options
export const ART_TONE_OPTIONS = [
  "hyperrealistic", "cartoonish", "watercolor", "pixel art",
  "noir b&w", "cel-shaded", "claymation", "goblin sketch",
] as const;

export interface GateInputState {
  sessionSetup: SessionSetup | null;
  avatarLocks: Map<string, boolean>;
  genre: string | null;
  artTone: string | null;
  dmKeyVerified: boolean;
  initialLocationDeclared: boolean;
}

export interface GateConditions {
  genreAndArtTone: boolean;
  allAvatarsLocked: boolean;
  dmKeyVerified: boolean;
  styleLockConfirmed: boolean;
  initialLocationDeclared: boolean;
}

// Pure derivation per §10.5 + ATLAS-020 minor 1
export function deriveGateConditions(input: GateInputState): GateConditions {
  const { sessionSetup, avatarLocks, genre, artTone, dmKeyVerified, initialLocationDeclared } = input;
  const playerAgents = (sessionSetup?.agents ?? []).filter(a => a.role === "player");
  const allAvatarsLocked = playerAgents.length === 0
    || playerAgents.every(a => avatarLocks.get(a.agent_id) === true);
  const styleLockConfirmed = sessionSetup?.style_lock !== null && sessionSetup?.style_lock !== undefined;
  const genreAndArtTone = (genre !== null && genre !== "") && (artTone !== null && artTone !== "");
  return {
    genreAndArtTone,
    allAvatarsLocked,
    dmKeyVerified,
    styleLockConfirmed,
    initialLocationDeclared,
  };
}

export function isAllGreen(c: GateConditions): boolean {
  return c.genreAndArtTone && c.allAvatarsLocked && c.dmKeyVerified
    && c.styleLockConfirmed && c.initialLocationDeclared;
}

export function SetupClient({ sessionId }: { sessionId: string }) {
  const [genre, setGenre] = useState<string | null>(null);
  const [customGenre, setCustomGenre] = useState("");
  const [artTone, setArtTone] = useState<string | null>(null);
  const [customArtTone, setCustomArtTone] = useState("");
  const [sessionSetup, setSessionSetup] = useState<SessionSetup | null>(null);
  const [loading, setLoading] = useState(true);

  const [avatarLocks, setAvatarLocks] = useState<Map<string, boolean>>(new Map());

  const [dmKeyVerified, setDmKeyVerified] = useState(false);
  const [initialLocationDeclared, setInitialLocationDeclared] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetch(`${API_BASE}/spectator/sessions/${sessionId}/setup`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { setSessionSetup(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [sessionId]);

  useEffect(() => {
    const ws = new WebSocket(`${WS_BASE}/ws`);
    ws.onopen = () => ws.send(JSON.stringify({ type: "subscribe", partyId: sessionId }));
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "theater_emission" && msg.data?.scene?.type === "establishing") {
          setInitialLocationDeclared(true);
          ws.close();
        }
      } catch {}
    };
    return () => ws.close();
  }, [sessionId]);

  if (loading) return <LoadingShimmer />;
  if (!sessionSetup) return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "var(--bg-canvas)" }}>
      <p className="font-theater-ui text-[var(--text-faded)]">Session not found</p>
    </div>
  );

  const playerAgents = sessionSetup.agents.filter(a => a.role === "player");
  const gate = deriveGateConditions({
    sessionSetup,
    avatarLocks,
    genre,
    artTone,
    dmKeyVerified,
    initialLocationDeclared,
  });

  return (
    <div className="min-h-screen px-6 py-8 max-w-3xl mx-auto" style={{ backgroundColor: "var(--bg-canvas)" }}>
      <h1 className="font-theater-heading text-2xl mb-8" style={{ color: "var(--text-primary)" }}>
        Session Setup
      </h1>

      <SetupSection title="Genre">
        <PillSelector
          options={[...GENRE_OPTIONS]}
          selected={genre}
          onSelect={(v) => { setGenre(v); setCustomGenre(""); }}
          customValue={customGenre}
          onCustomChange={(v) => { setCustomGenre(v); setGenre(v); }}
          hasCustom={true}
        />
      </SetupSection>

      <SetupSection title="Art Tone">
        <PillSelector
          options={[...ART_TONE_OPTIONS]}
          selected={artTone}
          onSelect={(v) => { setArtTone(v); setCustomArtTone(""); }}
          customValue={customArtTone}
          onCustomChange={(v) => { setCustomArtTone(v); setArtTone(v); }}
          hasCustom={true}
        />
      </SetupSection>

      <SetupSection title="Character Avatars">
        {playerAgents.map(agent => (
          <AvatarPanel key={agent.agent_id} player={agent}
            onLock={(id) => setAvatarLocks(prev => new Map(prev).set(id, true))}
            onUnlock={(id) => setAvatarLocks(prev => new Map(prev).set(id, false))}
          />
        ))}
      </SetupSection>

      <SetupSection title="DM Verification">
        <DmVerifyCard
          dmProvider={sessionSetup.style_lock?.model ?? "unknown"}
          onVerified={() => setDmKeyVerified(true)}
        />
      </SetupSection>

      {sessionSetup.style_lock && (
        <SetupSection title="Style Lock">
          <div className="p-4 rounded" style={{ backgroundColor: "var(--bg-frame)" }}>
            <div className="space-y-1 font-theater-ui text-[13px]" style={{ color: "var(--text-secondary)" }}>
              <p>Prompt suffix: <span style={{ color: "var(--text-primary)" }}>{sessionSetup.style_lock.prompt_suffix}</span></p>
              <p>Negative: <span style={{ color: "var(--text-primary)" }}>{sessionSetup.style_lock.negative_prompt}</span></p>
              <p>Aspect: <span style={{ color: "var(--text-primary)" }}>{sessionSetup.style_lock.aspect}</span></p>
              <p>Model: <span style={{ color: "var(--text-primary)" }}>{sessionSetup.style_lock.model}</span></p>
            </div>
          </div>
        </SetupSection>
      )}

      <SetupGate sessionId={sessionId} state={gate} />
    </div>
  );
}

function SetupSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="font-theater-heading text-lg mb-3" style={{ color: "var(--text-secondary)" }}>{title}</h2>
      {children}
    </div>
  );
}

interface PillSelectorProps {
  options: string[];
  selected: string | null;
  onSelect: (value: string) => void;
  customValue: string;
  onCustomChange: (value: string) => void;
  hasCustom: boolean;
}

function PillSelector({ options, selected, onSelect, customValue, onCustomChange, hasCustom }: PillSelectorProps) {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const isCustomSelected = showCustomInput && selected === customValue;

  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button key={opt}
          onClick={() => { onSelect(opt); setShowCustomInput(false); }}
          className={`px-4 py-2 rounded-full font-theater-ui text-[13px] min-h-[44px] transition-colors ${
            selected === opt && !showCustomInput
              ? "text-[var(--bg-canvas)]"
              : "text-[var(--text-primary)] border border-[var(--border-faint)]"
          }`}
          style={selected === opt && !showCustomInput ? { backgroundColor: "var(--accent-gold)" } : {}}>
          {opt}
        </button>
      ))}
      {hasCustom && (
        <>
          <button
            onClick={() => {
              setShowCustomInput(true);
              onSelect(customValue || "");
            }}
            className={`px-4 py-2 rounded-full font-theater-ui text-[13px] min-h-[44px] border transition-colors ${
              isCustomSelected ? "border-[var(--accent-gold)] text-[var(--bg-canvas)]" : "border-dashed border-[var(--border-faint)] text-[var(--text-faded)]"
            }`}
            style={isCustomSelected ? { backgroundColor: "var(--accent-gold)" } : {}}>
            custom
          </button>
          {showCustomInput && (
            <input type="text" value={customValue}
              onChange={(e) => onCustomChange(e.target.value)}
              placeholder="Type custom..."
              className="px-4 py-2 rounded-full font-theater-ui text-[13px] min-h-[44px] bg-[var(--bg-frame)] text-[var(--text-primary)] border border-[var(--accent-gold)] outline-none"
              autoFocus />
          )}
        </>
      )}
    </div>
  );
}
