"use client";
import type { BodyState, Posture, ViewerRole } from "@theater/types";
import type { AgentInfo } from "@/hooks/use-session-agents";

// §4.6 VERBATIM — scale, transform, placement
function postureTransform(posture: Posture): string {
  switch (posture) {
    case "standing-tall":       return "scale(1.1)";
    case "crouching":           return "scale(0.85) translateY(8px)";
    case "backed-against-wall": return "scale(1.0)"; // edge-positioned via layout
    case "prone":               return "rotate(90deg)"; // NO scale per §4.6
    default:                    return "none";
  }
}

// §4.6: standing-tall also gets brightness(1.05)
function postureFilter(posture: Posture): string {
  return posture === "standing-tall" ? "brightness(1.05)" : "none";
}

interface BodyStateStyle {
  className: string;
  filter?: string;
  animation?: string;
  /** §6.4 hidden: suppress entirely on player UI */
  suppressOnPlayerUI: boolean;
}

// §6.4 VERBATIM
function bodyStateTreatment(state: BodyState): BodyStateStyle {
  switch (state) {
    case "wounded":
      return { className: "relative", filter: "saturate(0.85)", suppressOnPlayerUI: false };
    case "exhausted":
      return { className: "", filter: "brightness(0.7)", animation: "animate-exhausted-blink", suppressOnPlayerUI: false };
    case "hidden":
      return { className: "opacity-40", suppressOnPlayerUI: true };
    case "alert":
      return { className: "outline outline-2 outline-[var(--accent-gold)]", animation: "animate-alert-pulse", suppressOnPlayerUI: false };
    case "unconscious":
      return { className: "grayscale", suppressOnPlayerUI: false };
    case "transformed":
      // §6.4: 1.2s cross-fade to alternate avatar. Alternate avatar URL not yet
      // in Mercury §14 — placeholder visual shift until upstream ships data path.
      return { className: "transition-all duration-[1200ms]", filter: "hue-rotate(30deg) brightness(1.1)", suppressOnPlayerUI: false };
    default:
      return { className: "", suppressOnPlayerUI: false };
  }
}

interface CastMember {
  agentId: string;
  characterName: string;
  avatarUrl: string | null;
  bodyState: BodyState;
  posture: Posture;
}

interface CastStripProps {
  sessionId: string;
  agents: Map<string, AgentInfo>;
  viewerRole: ViewerRole;
  agentStates: Map<string, { bodyState: string | null; posture: string | null }>;
}

export function CastStrip({ agents, viewerRole, agentStates }: CastStripProps) {
  const cast: CastMember[] = Array.from(agents.entries())
    .filter(([, a]) => a.role === "player")
    .map(([id, a]) => {
      const state = agentStates.get(id);
      return {
        agentId: id,
        characterName: a.characterName ?? id,
        avatarUrl: a.avatarUrl,
        bodyState: (state?.bodyState ?? null) as BodyState,
        posture: (state?.posture ?? null) as Posture,
      };
    });

  // §4.6 backed-against-wall: edge positioning via bucket-by-side
  // (ATLAS-022 FIF-3: bucket, do NOT use first:/last: variants which break for 3+ members)
  const wallMembers = cast.filter((m) => m.posture === "backed-against-wall");
  const edgeLeft = wallMembers[0] ?? null;
  const edgeRight = wallMembers.length >= 2 ? wallMembers[wallMembers.length - 1] : null;
  const centerMembers = cast.filter((m) => m !== edgeLeft && m !== edgeRight);

  const renderMember = (member: CastMember, positionClass: string) => {
    const treatment = bodyStateTreatment(member.bodyState);

    // §6.4 hidden: suppress entirely on player UI
    if (treatment.suppressOnPlayerUI && viewerRole === "player") return null;

    // §6.4 unconscious: force prone posture
    const effectivePosture: Posture = member.bodyState === "unconscious" ? "prone" : member.posture;

    const filter =
      [postureFilter(effectivePosture), treatment.filter]
        .filter((f) => f && f !== "none")
        .join(" ") || "none";

    return (
      <div
        key={member.agentId}
        className={`flex flex-col items-center gap-1 transition-all duration-[400ms] ${positionClass}`}
      >
        <div
          className={`w-14 h-14 rounded-full overflow-hidden relative ${treatment.className} ${treatment.animation ?? ""}`}
          style={{
            transform: postureTransform(effectivePosture),
            filter,
          }}
        >
          {member.avatarUrl ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={member.avatarUrl}
              alt={member.characterName}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-[var(--surface)]" />
          )}
          {/* §6.4 wounded: blood-spatter SVG mask overlay (placeholder gradient if asset absent) */}
          {member.bodyState === "wounded" && (
            <div
              className="absolute inset-0 bg-cover opacity-60 mix-blend-multiply pointer-events-none"
              style={{
                backgroundImage:
                  "url('/theater/blood-spatter.svg'), radial-gradient(circle at 30% 40%, rgba(163,45,45,0.55), transparent 60%)",
              }}
              aria-hidden="true"
            />
          )}
        </div>
        {/* §11.1: Inter 11px uppercase 0.18em */}
        <span
          className="text-[11px] uppercase tracking-[0.18em] font-theater-ui"
          style={{ color: "var(--text-secondary)" }}
        >
          {member.characterName}
        </span>
      </div>
    );
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-20 h-20 flex items-center justify-center gap-4 px-6"
      style={{ backgroundColor: "var(--bg-frame)" }}
    >
      {edgeLeft && renderMember(edgeLeft, "absolute left-2")}
      {centerMembers.map((m) => renderMember(m, ""))}
      {edgeRight && renderMember(edgeRight, "absolute right-2")}
    </div>
  );
}
