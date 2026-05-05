"use client";
import Link from "next/link";

interface GateState {
  genreAndArtTone: boolean;
  allAvatarsLocked: boolean;
  dmKeyVerified: boolean;
  styleLockConfirmed: boolean;
  initialLocationDeclared: boolean;
}

export function SetupGate({ state, sessionId }: { state: GateState; sessionId: string }) {
  const allGreen = Object.values(state).every(Boolean);

  const gates: Array<{ label: string; ready: boolean }> = [
    { label: "Genre + art tone selected", ready: state.genreAndArtTone },
    { label: "All avatar passports locked", ready: state.allAvatarsLocked },
    { label: "DM image-gen verified", ready: state.dmKeyVerified },
    { label: "Style lock confirmed", ready: state.styleLockConfirmed },
    { label: "Initial location declared (DM)", ready: state.initialLocationDeclared },
  ];

  return (
    <div className="p-4 rounded" style={{ backgroundColor: "var(--bg-frame)" }}>
      <h3 className="font-theater-heading text-lg mb-4" style={{ color: "var(--text-primary)" }}>
        Launch Gate
      </h3>
      <div className="space-y-2 mb-4">
        {gates.map(gate => (
          <div key={gate.label} className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full shrink-0 ${gate.ready ? "" : "animate-pulse"}`}
              style={{ backgroundColor: gate.ready ? "var(--accent-gold)" : "var(--accent-red)" }} />
            <span className="font-theater-ui text-[13px]"
              style={{ color: gate.ready ? "var(--text-primary)" : "var(--text-faded)" }}>
              {gate.label}
            </span>
          </div>
        ))}
      </div>
      {allGreen ? (
        <Link href={`/theater/${sessionId}`}
          className="inline-block px-6 py-3 rounded font-theater-heading text-base min-h-[44px]"
          style={{ backgroundColor: "var(--accent-gold)", color: "var(--bg-canvas)" }}>
          Open Theater
        </Link>
      ) : (
        <p className="font-theater-ui text-[13px]" style={{ color: "var(--text-faded)" }}>
          Waiting for all conditions to clear...
        </p>
      )}
    </div>
  );
}
