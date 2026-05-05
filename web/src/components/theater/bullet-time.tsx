"use client";

// §9.1 detents — verbatim
const SPEEDS = [0.1, 0.25, 0.5, 1, 1.5, 2] as const;

interface BulletTimeProps {
  speed: number;
  onSpeedChange: (s: number) => void;
}

export function BulletTimeSlider({ speed, onSpeedChange }: BulletTimeProps) {
  const idx = SPEEDS.findIndex((s) => s === speed);
  const safeIdx = idx === -1 ? SPEEDS.indexOf(1) : idx;

  return (
    <div
      className="fixed bottom-24 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2 rounded-full"
      style={{
        backgroundColor: "var(--bg-frame)",
        border: "1px solid var(--border-faint)",
      }}
      aria-label="Bullet Time playback speed"
    >
      <input
        type="range"
        min={0}
        max={SPEEDS.length - 1}
        step={1}
        value={safeIdx}
        onChange={(e) => onSpeedChange(SPEEDS[parseInt(e.target.value, 10)] ?? 1)}
        className="bullet-time-slider w-40"
        aria-label="Playback speed"
      />
      <div
        className="font-theater-ui text-[11px] uppercase tracking-[0.18em]"
        style={{ color: "var(--accent-gold)" }}
      >
        {speed}×
      </div>
      <div className="flex gap-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSpeedChange(s)}
            // STD-006: 44px tap targets
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[10px] font-theater-ui uppercase tracking-[0.18em] rounded"
            style={{
              color: s === speed ? "var(--accent-gold)" : "var(--text-faded)",
              backgroundColor: s === speed ? "rgba(212,175,55,0.08)" : "transparent",
            }}
            aria-pressed={s === speed}
            aria-label={`${s}× playback`}
          >
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}
