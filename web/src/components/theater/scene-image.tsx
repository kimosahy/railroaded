"use client";
import type { SceneData, SceneType } from "@theater/types";

// §7.3 frame sizing + entrance animation per scene type.
function frameClasses(type: SceneType): string {
  switch (type) {
    case "establishing":
      return "fixed inset-0 z-0 w-screen h-screen animate-fade-up";
    case "beat":
      return "relative w-full max-w-3xl aspect-video my-4 animate-slide-up";
    case "insert":
      return "absolute top-4 right-4 w-[30%] aspect-video rounded-md overflow-hidden animate-quick-zoom";
    case "reveal":
      return "fixed inset-0 z-0 w-screen h-screen animate-freeze-drop";
    case "reaction":
      return "relative w-[40%] mx-auto aspect-[4/5] my-2 rounded overflow-hidden";
    case "mood-reskin":
      return "fixed inset-0 z-0 w-screen h-screen opacity-80 animate-cross-fade";
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
