import { describe, expect, test } from "bun:test";
import { __MOOD_TINTS_INTERNAL as MOOD_TINTS } from "../web/src/components/theater/mood-overlay.tsx";

describe("MOOD_TINTS — MF §3.5 hex values verbatim", () => {
  test("fear is cool blue-gray (#3a4870), NOT red", () => {
    expect(MOOD_TINTS.fear?.hueOverlay).toBe("#3a4870");
    expect(MOOD_TINTS.fear?.hueOpacity).toBeCloseTo(0.14, 5);
    expect(MOOD_TINTS.fear?.saturationDelta).toBe(-20);
    expect(MOOD_TINTS.fear?.vignette).toBe("strong");
  });

  test("dread is dark red-black (#1a0e10), NOT blue; preserves --accent-gold and --accent-red", () => {
    expect(MOOD_TINTS.dread?.hueOverlay).toBe("#1a0e10");
    expect(MOOD_TINTS.dread?.hueOpacity).toBeCloseTo(0.22, 5);
    expect(MOOD_TINTS.dread?.saturationDelta).toBe(-40);
    expect(MOOD_TINTS.dread?.vignette).toBe("extreme");
    expect(MOOD_TINTS.dread?.accentPreserve).toContain("--accent-gold");
    expect(MOOD_TINTS.dread?.accentPreserve).toContain("--accent-red");
  });

  test("joy hex matches spec", () => {
    expect(MOOD_TINTS.joy?.hueOverlay).toBe("#f0c878");
    expect(MOOD_TINTS.joy?.saturationDelta).toBe(15);
  });

  test("curiosity hex matches spec", () => {
    expect(MOOD_TINTS.curiosity?.hueOverlay).toBe("#3aa8b8");
  });

  test("anger uses contrast(1.2) (contrastDelta=20), NOT saturate(1.2)", () => {
    expect(MOOD_TINTS.anger?.hueOverlay).toBe("#a32d2d");
    expect(MOOD_TINTS.anger?.saturationDelta).toBe(0);
    expect(MOOD_TINTS.anger?.contrastDelta).toBe(20);
    expect(MOOD_TINTS.anger?.vignette).toBe("sharp");
  });

  test("grief hex matches spec", () => {
    expect(MOOD_TINTS.grief?.hueOverlay).toBe("#5a6878");
    expect(MOOD_TINTS.grief?.saturationDelta).toBe(-30);
  });

  test("awe hex matches spec", () => {
    expect(MOOD_TINTS.awe?.hueOverlay).toBe("#6048a0");
    expect(MOOD_TINTS.awe?.vignette).toBe("bottom-up");
  });

  test("all 7 spec moods present", () => {
    const moods = ["fear", "dread", "joy", "curiosity", "anger", "grief", "awe"];
    for (const m of moods) expect(MOOD_TINTS[m]).toBeDefined();
  });
});
