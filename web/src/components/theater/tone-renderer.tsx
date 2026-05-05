"use client";
import type { Tone, TonePreset } from "@theater/types";

interface ToneStyle {
  sizeMultiplier: number;
  weight: number;
  italic: boolean;
  color: string;
  opacity?: number;
  tracking?: string;
  textTransform?: "lowercase" | "uppercase" | "none";
  wrapping?: "soft-brackets" | "trailing-ellipsis" | null;
  animation?: string;
}

// MF §4.1 VERBATIM
const TONE_STYLES: Record<TonePreset, ToneStyle> = {
  whisper:  { sizeMultiplier: 0.75, weight: 300, italic: true,  color: "var(--text-ghost)", opacity: 0.6, tracking: "0.02em", wrapping: "soft-brackets", animation: "animate-reveal-fade" },
  mutter:   { sizeMultiplier: 0.70, weight: 300, italic: true,  color: "rgba(232,226,212,0.40)", tracking: "normal", textTransform: "lowercase" },
  normal:   { sizeMultiplier: 1.0,  weight: 400, italic: false, color: "var(--text-primary)" },
  excited:  { sizeMultiplier: 1.10, weight: 500, italic: true,  color: "var(--accent-gold)", animation: "animate-bouncy-reveal" },
  yell:     { sizeMultiplier: 1.30, weight: 700, italic: false, color: "var(--text-primary)", tracking: "0.05em", animation: "animate-screen-pulse" },
  shout:    { sizeMultiplier: 1.50, weight: 900, italic: false, color: "#f5ecd0", tracking: "0.08em", textTransform: "uppercase", animation: "animate-brief-shake" },
  growl:    { sizeMultiplier: 1.0,  weight: 700, italic: false, color: "#a08858" },
  sigh:     { sizeMultiplier: 0.95, weight: 300, italic: true,  color: "var(--text-ghost)", wrapping: "trailing-ellipsis", animation: "animate-fade-tail" },
  giggle:   { sizeMultiplier: 1.0,  weight: 400, italic: false, color: "var(--accent-gold)", opacity: 0.7, animation: "animate-letter-rotate" },
  monotone: { sizeMultiplier: 1.0,  weight: 400, italic: false, color: "var(--text-faded)", tracking: "0" },
  raspy:    { sizeMultiplier: 1.0,  weight: 600, italic: false, color: "var(--text-primary)" },
};

const DEFAULT_TONE: ToneStyle = { sizeMultiplier: 1.0, weight: 400, italic: false, color: "rgba(232,226,212,0.85)" };

export function getToneStyle(tone: Tone): ToneStyle {
  if (!tone) return TONE_STYLES.normal;
  return TONE_STYLES[tone as TonePreset] ?? DEFAULT_TONE;
}

export function ToneRenderer({ tone, baseSize, children }: {
  tone: Tone;
  /** AR rule 5: baseSize is the FINAL resolved rem value
   *  (baseline.sizeRem × tone.sizeMultiplier × address.sizeMultiplier).
   *  ToneRenderer no longer multiplies — it only applies weight/color/animation. */
  baseSize: number;
  children: React.ReactNode;
}) {
  const style = getToneStyle(tone);
  const fontSize = baseSize;

  let content: React.ReactNode = children;
  if (style.wrapping === "soft-brackets") {
    content = <><span className="text-[var(--text-faded)]">⟨</span>{children}<span className="text-[var(--text-faded)]">⟩</span></>;
  }

  return (
    <span
      className={style.animation ?? ""}
      style={{
        fontSize: `${fontSize}rem`,
        fontWeight: style.weight,
        fontStyle: style.italic ? "italic" : "normal",
        color: style.color,
        opacity: style.opacity,
        letterSpacing: style.tracking,
        textTransform: style.textTransform,
      }}
    >
      {content}
      {style.wrapping === "trailing-ellipsis" && <span className="opacity-40">…</span>}
    </span>
  );
}

/** Exposed for unit testing — do not import from app code. */
export const __TONE_STYLES_INTERNAL = TONE_STYLES;
export const __DEFAULT_TONE_INTERNAL = DEFAULT_TONE;
