"use client";
import { useState, useEffect, useRef } from "react";
import type { Pacing } from "@theater/types";

const PACING_SPEEDS: Record<NonNullable<Pacing>, number> = {
  rushed: 15, normal: 35, deliberate: 60, hesitant: 80, staccato: 25,
};
const PUNCTUATION_PAUSE: Record<string, number> = {
  ".": 6, "!": 5, "?": 5, ",": 3, ";": 3, ":": 3, "—": 4, "…": 8,
};
const STACCATO_WORD_PAUSE = 120;
const INSTANT_THRESHOLD = 400;

interface PacingRevealProps {
  text: string;
  pacing: Pacing;
  paceScale?: number; // Multiplier for per-char delay. Growl uses 1.4× per §4.1.
  onComplete?: () => void;
}

export function PacingReveal({ text, pacing, paceScale = 1, onComplete }: PacingRevealProps) {
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const speed = (PACING_SPEEDS[pacing ?? "normal"] ?? PACING_SPEEDS.normal) * paceScale;
  const isInstant = prefersReducedMotion || !pacing || text.length > INSTANT_THRESHOLD;

  const [revealed, setRevealed] = useState(() => isInstant ? text.length : 0);
  const rafRef = useRef<number | null>(null);
  const lastFrameRef = useRef(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    lastFrameRef.current = 0;

    if (isInstant) {
      setRevealed(text.length);
      onCompleteRef.current?.();
      return;
    }

    setRevealed(0);
    let charIdx = 0;
    let accumulatedTime = 0;

    const animate = (timestamp: number) => {
      if (!lastFrameRef.current) lastFrameRef.current = timestamp;
      const delta = timestamp - lastFrameRef.current;
      lastFrameRef.current = timestamp;
      accumulatedTime += delta;

      let charDelay = speed;
      const currentChar = text[charIdx];
      if (currentChar && PUNCTUATION_PAUSE[currentChar]) charDelay = speed * PUNCTUATION_PAUSE[currentChar];
      if (pacing === "staccato" && currentChar === " ") charDelay = STACCATO_WORD_PAUSE;

      while (accumulatedTime >= charDelay && charIdx < text.length) {
        charIdx++;
        accumulatedTime -= charDelay;
        const nextChar = text[charIdx];
        charDelay = speed;
        if (nextChar && PUNCTUATION_PAUSE[nextChar]) charDelay = speed * PUNCTUATION_PAUSE[nextChar];
        if (pacing === "staccato" && nextChar === " ") charDelay = STACCATO_WORD_PAUSE;
      }

      setRevealed(charIdx);
      if (charIdx < text.length) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        onCompleteRef.current?.();
      }
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [text, pacing, isInstant, speed]);

  return (
    <span>
      <span>{isInstant ? text : text.slice(0, revealed)}</span>
      {!isInstant && revealed < text.length && (
        <span className="opacity-0" aria-hidden="true">{text.slice(revealed)}</span>
      )}
    </span>
  );
}

/** Exposed for unit testing — do not import from app code. */
export const __PACING_INTERNAL = {
  PACING_SPEEDS,
  PUNCTUATION_PAUSE,
  STACCATO_WORD_PAUSE,
  INSTANT_THRESHOLD,
};
