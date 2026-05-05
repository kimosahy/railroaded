"use client";
import { useState } from "react";

type VerifyStatus = "pending" | "checking" | "verified" | "failed";

interface DmVerifyCardProps {
  dmProvider: string;
  onVerified: () => void;
}

// §10.3 + §12 — pip color tokens
const PIP_COLORS: Record<VerifyStatus, string> = {
  pending: "var(--text-faded)",
  checking: "var(--accent-amber)",
  verified: "var(--accent-gold)",
  failed: "var(--accent-red)",
};

export function DmVerifyCard({ dmProvider, onVerified }: DmVerifyCardProps) {
  const [status, setStatus] = useState<VerifyStatus>("pending");
  const [error, setError] = useState<string | null>(null);

  const handleVerify = async () => {
    setStatus("checking");
    setError(null);
    try {
      // TODO: real verification call against the DM image-gen provider key.
      await new Promise(r => setTimeout(r, 600));
      setStatus("verified");
      onVerified();
    } catch (e) {
      setStatus("failed");
      setError(e instanceof Error ? e.message : "Verification failed");
    }
  };

  const pipColor = PIP_COLORS[status];
  const pulsing = status === "checking";

  return (
    <div className="p-4 rounded" style={{ backgroundColor: "var(--bg-frame)" }}>
      <div className="flex items-center gap-3 mb-3">
        <span
          className={`w-3 h-3 rounded-full shrink-0 ${pulsing ? "animate-pulse" : ""}`}
          style={{ backgroundColor: pipColor }}
          aria-label={`DM verification ${status}`}
        />
        <span className="font-theater-ui text-[13px]" style={{ color: "var(--text-primary)" }}>
          DM image-gen provider: <span style={{ color: "var(--text-secondary)" }}>{dmProvider}</span>
        </span>
      </div>
      {status !== "verified" && (
        <button
          onClick={handleVerify}
          disabled={status === "checking"}
          className="px-4 py-2 rounded font-theater-ui text-[13px] min-h-[44px] border border-[var(--border-faint)]"
          style={{ color: "var(--text-primary)" }}
        >
          {status === "checking" ? "Verifying…" : status === "failed" ? "Retry verification" : "Verify image-gen"}
        </button>
      )}
      {error && (
        <p className="font-theater-ui text-[13px] mt-2" style={{ color: "var(--accent-red)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
