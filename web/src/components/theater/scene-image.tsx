"use client";
import type { SceneData, SceneType } from "@theater/types";

// §7.3 frame sizing per scene type.
function frameClasses(type: SceneType): string {
  switch (type) {
    case "establishing":
      // Full-bleed background.
      return "fixed inset-0 z-0 w-screen h-screen";
    case "beat":
      return "relative w-full max-w-3xl aspect-video my-4";
    case "insert":
      // Small inset, top-right.
      return "absolute top-4 right-4 w-48 h-48 rounded-md overflow-hidden";
    case "reveal":
      return "relative w-full max-w-3xl aspect-video my-4 animate-freeze-drop";
    case "reaction":
      return "relative w-32 h-32 my-2 rounded-full overflow-hidden";
    case "mood-reskin":
      return "fixed inset-0 z-0 w-screen h-screen opacity-80";
    default:
      return "relative w-full max-w-3xl aspect-video my-4";
  }
}

export function SceneImage({ scene }: { scene: SceneData }) {
  const imageUrl = (scene as SceneData & { image_url?: string }).image_url ?? null;
  const cls = frameClasses(scene.type);
  if (!imageUrl) {
    // Placeholder slot while image is being generated upstream.
    return (
      <div
        className={`${cls} bg-[var(--bg-frame)] border border-[var(--border-faint)]`}
        aria-label="Scene image loading"
      />
    );
  }
  return (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img
      src={imageUrl}
      alt={scene.image_prompt ?? "Scene"}
      className={`${cls} object-cover`}
    />
  );
}
