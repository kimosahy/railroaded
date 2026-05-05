"use client";
import { useEffect, useState } from "react";
import type { DiceIntent } from "@theater/types";

/**
 * §7.1 Dice intent slot machine.
 *
 * Phase chain:
 *   1. summon (600ms) — intent text inline
 *   2. suspension (1.5-3s random) — die hovers, halo pulse
 *   3. spin (800ms) — die spins
 *   4. wait for dice_result from emission_update
 *   5. outcome (1s hold) — rolled number in Bodoni 28px
 *   6. exit (400ms fade)
 *
 * If dice_result arrives during suspension/spin, proceed immediately to outcome.
 * If dice_result doesn't arrive within 5s of spin end, show "?" with --accent-coral warning.
 */

type Phase = "summon" | "suspension" | "spin" | "outcome" | "missing" | "exit" | "done";

export function DiceMoment({
  intent,
  result,
  onExit,
}: {
  intent: DiceIntent;
  /** number once dice_result arrives via theater_emission_update; null while pending. */
  result: number | null;
  onExit?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("summon");

  useEffect(() => {
    if (phase !== "summon") return;
    const t = window.setTimeout(() => setPhase("suspension"), 600);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "suspension") return;
    // 1.5-3s random suspension.
    const ms = 1500 + Math.random() * 1500;
    const t = window.setTimeout(() => setPhase("spin"), ms);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "spin") return;
    const t = window.setTimeout(() => {
      setPhase(result !== null ? "outcome" : "missing");
    }, 800);
    return () => window.clearTimeout(t);
  }, [phase, result]);

  // If result arrives during suspension/spin, jump to outcome.
  useEffect(() => {
    if (result !== null && (phase === "suspension" || phase === "spin")) {
      setPhase("outcome");
    }
  }, [result, phase]);

  // 5s timeout in missing — surface warning then exit.
  useEffect(() => {
    if (phase !== "missing") return;
    const t = window.setTimeout(() => setPhase("exit"), 5000);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "outcome") return;
    const t = window.setTimeout(() => setPhase("exit"), 1000);
    return () => window.clearTimeout(t);
  }, [phase]);

  useEffect(() => {
    if (phase !== "exit") return;
    const t = window.setTimeout(() => {
      setPhase("done");
      onExit?.();
    }, 400);
    return () => window.clearTimeout(t);
  }, [phase, onExit]);

  if (phase === "done") return null;

  const intentLine = `${intent.for}${intent.modifier !== null ? ` (${intent.modifier >= 0 ? "+" : ""}${intent.modifier})` : ""}${intent.dc !== null ? ` DC ${intent.dc}` : ""} · ${intent.die}`;

  return (
    <div
      className={`fixed inset-0 z-40 flex items-center justify-center pointer-events-none ${
        phase === "exit" ? "opacity-0" : "opacity-100"
      } transition-opacity duration-[400ms]`}
      aria-live="polite"
      style={{ backgroundColor: "rgba(6,5,4,0.45)" }}
    >
      <div className="flex flex-col items-center gap-3 font-theater-heading">
        <div
          className="font-theater-ui text-[12px] uppercase tracking-[0.18em]"
          style={{ color: "var(--text-secondary)" }}
        >
          {intentLine}
        </div>
        <div
          className={`relative w-20 h-20 rounded-md flex items-center justify-center ${
            phase === "suspension" ? "animate-dice-halo" : ""
          } ${phase === "spin" ? "animate-dice-spin" : ""}`}
          style={{
            backgroundColor: "var(--bg-frame)",
            border: "2px solid var(--accent-gold)",
            color: "var(--text-primary)",
          }}
        >
          {phase === "outcome" && (
            <span className="text-[28px]" style={{ color: "var(--accent-gold)" }}>
              {result}
            </span>
          )}
          {phase === "missing" && (
            <span className="text-[28px]" style={{ color: "var(--accent-coral)" }}>
              ?
            </span>
          )}
          {(phase === "summon" || phase === "suspension" || phase === "spin") && (
            <span className="text-[14px] opacity-50">{intent.die}</span>
          )}
        </div>
      </div>
    </div>
  );
}
