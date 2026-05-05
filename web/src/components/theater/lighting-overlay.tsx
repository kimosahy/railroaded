"use client";
import type { Lighting } from "@theater/types";

/**
 * §6.3 Lighting overlays.
 *
 * - torchlit: radial gradient @14% with 3Hz flicker
 * - dawn: pink→indigo gradient, static
 * - midnight: SVG-positioned radials at avatar coordinates, 2Hz candle flicker
 * - magical: 40 CSS particles with violet→teal→gold hue cycle, drift+recycle
 * - underwater: teal wash + SVG turbulence/displacement caustic shimmer
 *
 * Magical particles use CSS animation (loop) so particles recycle from bottom
 * — they NEVER drift permanently off-screen (AR rule 12).
 */

interface AvatarPos {
  x: number;
  y: number;
}

export function LightingOverlay({
  lighting,
  avatarPositions,
}: {
  lighting: Lighting;
  avatarPositions?: Map<string, AvatarPos>;
}) {
  if (!lighting) return null;
  if (lighting === "torchlit") return <TorchlitOverlay />;
  if (lighting === "dawn") return <DawnOverlay />;
  if (lighting === "midnight") return <MidnightOverlay avatarPositions={avatarPositions} />;
  if (lighting === "magical") return <MagicalOverlay />;
  if (lighting === "underwater") return <UnderwaterOverlay />;
  return null;
}

function TorchlitOverlay() {
  return (
    <div
      className="fixed inset-0 z-10 pointer-events-none animate-torchlit-flicker"
      style={{
        background:
          "radial-gradient(circle at 50% 50%, rgba(212,175,55,0.14) 0%, rgba(0,0,0,0.4) 80%)",
      }}
      aria-hidden="true"
    />
  );
}

function DawnOverlay() {
  return (
    <div
      className="fixed inset-0 z-10 pointer-events-none"
      style={{
        background:
          "linear-gradient(to bottom, rgba(255,180,200,0.18) 0%, rgba(80,80,160,0.22) 100%)",
      }}
      aria-hidden="true"
    />
  );
}

function MidnightOverlay({
  avatarPositions,
}: {
  avatarPositions?: Map<string, AvatarPos>;
}) {
  // SVG-positioned candle pools at avatar coordinates with 2Hz flicker.
  const positions = avatarPositions ? Array.from(avatarPositions.values()) : [];
  if (!positions.length) {
    // Fallback: dark wash with single center pool.
    return (
      <div
        className="fixed inset-0 z-10 pointer-events-none animate-midnight-flicker"
        style={{
          background:
            "radial-gradient(circle at 50% 80%, rgba(255,200,120,0.12) 0%, rgba(0,0,0,0.55) 70%)",
        }}
        aria-hidden="true"
      />
    );
  }
  return (
    <svg
      className="fixed inset-0 z-10 pointer-events-none w-screen h-screen animate-midnight-flicker"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="candle" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(255,200,120,0.35)" />
          <stop offset="100%" stopColor="rgba(0,0,0,0)" />
        </radialGradient>
      </defs>
      <rect width="100%" height="100%" fill="rgba(0,0,0,0.5)" />
      {positions.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={120} fill="url(#candle)" />
      ))}
    </svg>
  );
}

function MagicalOverlay() {
  // 40 particles with randomized starting coords + staggered animation-delay.
  // Particles drift up over 30s, fade in/out at edges, and CSS animation loops
  // — so they recycle from bottom, never drift permanently off-screen.
  const particles = Array.from({ length: 40 }).map((_, i) => {
    const left = (i * 73) % 100; // pseudo-random spread
    const delay = -((i * 1.7) % 30); // stagger across 30s
    const size = 2 + ((i * 3) % 4); // 2-5px
    return (
      <span
        key={i}
        className="absolute rounded-full animate-magical-drift"
        style={{
          left: `${left}%`,
          bottom: 0,
          width: `${size}px`,
          height: `${size}px`,
          animationDelay: `${delay}s`,
          willChange: "transform",
        }}
        aria-hidden="true"
      />
    );
  });
  return (
    <div
      className="fixed inset-0 z-10 pointer-events-none overflow-hidden"
      aria-hidden="true"
    >
      {particles}
    </div>
  );
}

function UnderwaterOverlay() {
  return (
    <>
      <div
        className="fixed inset-0 z-10 pointer-events-none"
        style={{ backgroundColor: "rgba(60, 130, 150, 0.22)" }}
        aria-hidden="true"
      />
      <svg className="fixed inset-0 z-10 pointer-events-none w-screen h-screen opacity-40" aria-hidden="true">
        <defs>
          <filter id="caustic">
            <feTurbulence type="turbulence" baseFrequency="0.02" numOctaves="3" seed="2">
              <animate attributeName="baseFrequency" dur="4s" values="0.02;0.04;0.02" repeatCount="indefinite" />
            </feTurbulence>
            <feDisplacementMap in="SourceGraphic" scale="20" />
          </filter>
        </defs>
        <rect width="100%" height="100%" fill="rgba(120,200,210,0.15)" filter="url(#caustic)" />
      </svg>
    </>
  );
}
