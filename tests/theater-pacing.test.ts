import { describe, expect, test } from "bun:test";
import { __PACING_INTERNAL as P } from "../web/src/components/theater/pacing-engine.tsx";
import { __PACE_SCALE_INTERNAL as PACE_SCALE } from "../web/src/components/theater/emission-text.tsx";

describe("PacingReveal — speed table per MF §4.2", () => {
  test("rushed = 15 ms/char", () => { expect(P.PACING_SPEEDS.rushed).toBe(15); });
  test("normal = 35 ms/char", () => { expect(P.PACING_SPEEDS.normal).toBe(35); });
  test("deliberate = 60 ms/char", () => { expect(P.PACING_SPEEDS.deliberate).toBe(60); });
  test("hesitant = 80 ms/char", () => { expect(P.PACING_SPEEDS.hesitant).toBe(80); });
  test("staccato = 25 ms/char", () => { expect(P.PACING_SPEEDS.staccato).toBe(25); });
});

describe("PacingReveal — punctuation pauses", () => {
  test("period pause × 6", () => {
    expect(P.PUNCTUATION_PAUSE["."]).toBe(6);
    // deliberate (60) × 6 = 360
    expect(P.PACING_SPEEDS.deliberate * P.PUNCTUATION_PAUSE["."]!).toBe(360);
  });
  test("ellipsis pause × 8 (longest)", () => {
    expect(P.PUNCTUATION_PAUSE["…"]).toBe(8);
  });
  test("comma pause × 3", () => {
    expect(P.PUNCTUATION_PAUSE[","]).toBe(3);
  });
});

describe("PacingReveal — staccato word pause", () => {
  test("STACCATO_WORD_PAUSE is 120ms (per spec)", () => {
    expect(P.STACCATO_WORD_PAUSE).toBe(120);
  });
});

describe("PacingReveal — instant fallback threshold", () => {
  test("INSTANT_THRESHOLD = 400 chars", () => {
    expect(P.INSTANT_THRESHOLD).toBe(400);
  });
});

describe("EmissionText — growl paceScale 1.4×", () => {
  test("growl maps to 1.4 in PACE_SCALE", () => {
    expect(PACE_SCALE.growl).toBe(1.4);
  });
  test("non-growl tones absent from PACE_SCALE → defaults to 1× at runtime", () => {
    expect(PACE_SCALE.whisper).toBeUndefined();
    expect(PACE_SCALE.normal).toBeUndefined();
    expect(PACE_SCALE.shout).toBeUndefined();
  });
});
