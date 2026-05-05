import { describe, expect, test } from "bun:test";
import { TONE_PRESETS } from "../src/theater/types.ts";
import {
  __TONE_STYLES_INTERNAL as TONE_STYLES,
  __DEFAULT_TONE_INTERNAL as DEFAULT_TONE,
  getToneStyle,
} from "../web/src/components/theater/tone-renderer.tsx";
import { TRACK_BASELINES } from "../web/src/components/theater/track-baseline.tsx";

describe("ToneRenderer — relative sizing per MF §4.1", () => {
  test("whisper at dialogue baseline (1.125rem) → 0.84375rem (0.75×)", () => {
    const baseline = TRACK_BASELINES.dialogue.sizeRem;
    const style = getToneStyle("whisper");
    expect(baseline * style.sizeMultiplier).toBeCloseTo(0.84375, 5);
  });

  test("yell at action baseline (0.875rem) → 1.1375rem (1.30×)", () => {
    const baseline = TRACK_BASELINES.action.sizeRem;
    const style = getToneStyle("yell");
    expect(baseline * style.sizeMultiplier).toBeCloseTo(1.1375, 5);
  });

  test("shout at dialogue baseline (1.125rem) → 1.6875rem (1.50×)", () => {
    const baseline = TRACK_BASELINES.dialogue.sizeRem;
    const style = getToneStyle("shout");
    expect(baseline * style.sizeMultiplier).toBeCloseTo(1.6875, 5);
  });

  test("unknown tone falls back to DEFAULT_TONE (rgba colour)", () => {
    const style = getToneStyle("smug" as never);
    expect(style).toEqual(DEFAULT_TONE);
    expect(style.color).toBe("rgba(232,226,212,0.85)");
  });

  test("null tone → normal", () => {
    expect(getToneStyle(null)).toEqual(TONE_STYLES.normal);
  });
});

describe("Tone presets — parameterized assertions over all 11", () => {
  for (const t of TONE_PRESETS) {
    test(`${t}: defined with required fields`, () => {
      const s = TONE_STYLES[t];
      expect(s).toBeDefined();
      expect(typeof s.sizeMultiplier).toBe("number");
      expect(typeof s.weight).toBe("number");
      expect(typeof s.italic).toBe("boolean");
      expect(typeof s.color).toBe("string");
    });
  }

  test("mutter has lowercase transform", () => {
    expect(TONE_STYLES.mutter.textTransform).toBe("lowercase");
  });

  test("shout has uppercase transform", () => {
    expect(TONE_STYLES.shout.textTransform).toBe("uppercase");
  });

  test("whisper soft-brackets wrapping + animate-reveal-fade", () => {
    expect(TONE_STYLES.whisper.wrapping).toBe("soft-brackets");
    expect(TONE_STYLES.whisper.animation).toBe("animate-reveal-fade");
  });

  test("sigh trailing-ellipsis wrapping", () => {
    expect(TONE_STYLES.sigh.wrapping).toBe("trailing-ellipsis");
  });

  test("excited uses --accent-gold", () => {
    expect(TONE_STYLES.excited.color).toBe("var(--accent-gold)");
  });

  test("growl uses #a08858", () => {
    expect(TONE_STYLES.growl.color).toBe("#a08858");
  });
});

describe("TRACK_BASELINES — MF §3.1", () => {
  test("action: 14px italic prose", () => {
    expect(TRACK_BASELINES.action.sizeRem).toBe(0.875);
    expect(TRACK_BASELINES.action.italic).toBe(true);
    expect(TRACK_BASELINES.action.fontClass).toBe("font-theater-prose");
  });
  test("dialogue: 18px UI", () => {
    expect(TRACK_BASELINES.dialogue.sizeRem).toBe(1.125);
    expect(TRACK_BASELINES.dialogue.fontClass).toBe("font-theater-ui");
  });
  test("narration: 16px Bodoni heading, 0.9 opacity", () => {
    expect(TRACK_BASELINES.narration.sizeRem).toBe(1.0);
    expect(TRACK_BASELINES.narration.fontClass).toBe("font-theater-heading");
    expect(TRACK_BASELINES.narration.opacity).toBe(0.9);
  });
  test("internal_monologue: 13px italic UI, 0.7 opacity", () => {
    expect(TRACK_BASELINES.internal_monologue.sizeRem).toBe(0.8125);
    expect(TRACK_BASELINES.internal_monologue.italic).toBe(true);
    expect(TRACK_BASELINES.internal_monologue.opacity).toBe(0.7);
  });
});
