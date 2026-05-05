"use client";

// §9.1 VERBATIM: 4 manual detents. Auto-slow (Task 19) can target other values dynamically.
const SPEEDS = [1, 0.5, 0.2, 0.1] as const;

interface BulletTimeProps {
  speed: number;
  onSpeedChange: (s: number) => void;
  /** §9.1 auto-slow toggle. Default ON; manual interaction disables for 30s. */
  autoSlow?: boolean;
  onAutoSlowToggle?: (next: boolean) => void;
  /** Notify parent of manual interaction (so parent records override window). */
  onManualInteraction?: () => void;
}

export function BulletTimeSlider({
  speed,
  onSpeedChange,
  autoSlow,
  onAutoSlowToggle,
  onManualInteraction,
}: BulletTimeProps) {
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
        onChange={(e) => {
          onManualInteraction?.();
          onSpeedChange(SPEEDS[parseInt(e.target.value, 10)] ?? 1);
        }}
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
            onClick={() => {
              onManualInteraction?.();
              onSpeedChange(s);
            }}
            // STD-006: 44px tap targets
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-[11px] font-theater-ui uppercase tracking-[0.18em] rounded"
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
      {onAutoSlowToggle && (
        <button
          type="button"
          onClick={() => onAutoSlowToggle(!autoSlow)}
          className="ml-2 min-h-[44px] px-3 text-[11px] font-theater-ui uppercase tracking-[0.18em] rounded"
          style={{
            color: autoSlow ? "var(--accent-gold)" : "var(--text-faded)",
            backgroundColor: autoSlow ? "rgba(212,175,55,0.08)" : "transparent",
          }}
          aria-pressed={!!autoSlow}
          aria-label="Auto-slow Bullet Time"
        >
          Auto
        </button>
      )}
    </div>
  );
}
