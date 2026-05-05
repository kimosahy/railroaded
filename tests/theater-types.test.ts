import { describe, expect, test } from "bun:test";
import { tensionRange, normalizeTrack, TONE_PRESETS } from "../src/theater/types.ts";

describe("tensionRange — MF §6.2 boundaries", () => {
  test("0 → calm", () => { expect(tensionRange(0)).toBe("calm"); });
  test("3 → calm (upper bin boundary)", () => { expect(tensionRange(3)).toBe("calm"); });
  test("4 → rising (lower next bin)", () => { expect(tensionRange(4)).toBe("rising"); });
  test("6 → rising (upper bin boundary)", () => { expect(tensionRange(6)).toBe("rising"); });
  test("7 → high (lower next bin)", () => { expect(tensionRange(7)).toBe("high"); });
  test("9 → high (upper bin boundary)", () => { expect(tensionRange(9)).toBe("high"); });
  test("10 → climax", () => { expect(tensionRange(10)).toBe("climax"); });
});

describe("normalizeTrack", () => {
  test("monologue → internal_monologue (Mercury alias)", () => {
    expect(normalizeTrack("monologue")).toBe("internal_monologue");
  });
  test("internal_monologue passes through", () => {
    expect(normalizeTrack("internal_monologue")).toBe("internal_monologue");
  });
  test("action / dialogue / thought / narration pass through", () => {
    expect(normalizeTrack("action")).toBe("action");
    expect(normalizeTrack("dialogue")).toBe("dialogue");
    expect(normalizeTrack("thought")).toBe("thought");
    expect(normalizeTrack("narration")).toBe("narration");
  });
  test("garbage → dialogue (default fallback)", () => {
    expect(normalizeTrack("garbage")).toBe("dialogue");
    expect(normalizeTrack("")).toBe("dialogue");
  });
});

describe("TONE_PRESETS — 11 canonical tones", () => {
  test("contains all 11 presets per MF §4.1", () => {
    expect(TONE_PRESETS).toEqual([
      "whisper", "mutter", "normal", "excited", "yell", "shout",
      "growl", "sigh", "giggle", "monotone", "raspy",
    ]);
  });
});
