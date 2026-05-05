import { describe, expect, test } from "bun:test";
import { normalizeEmission, applySpanOverrides, FALLBACK_DEFAULTS } from "../src/theater/normalizer.ts";

describe("normalizeEmission — no-mutation contract + validation", () => {
  test("(a) does not mutate input; idempotent across calls", () => {
    const raw = { track: "monologue", content: "x", tone: "whisper", custom_field: 42 };
    const snapshot = JSON.stringify(raw);
    const r1 = normalizeEmission({ ...raw });
    const r2 = normalizeEmission({ ...raw });
    expect(JSON.stringify(raw)).toBe(snapshot);
    expect(r1.emission.track).toBe(r2.emission.track);
    expect(r1.emission.tone).toBe(r2.emission.tone);
  });

  test("(b) track normalization (monologue → internal_monologue, garbage → dialogue)", () => {
    expect(normalizeEmission({ track: "monologue", content: "" }).emission.track).toBe("internal_monologue");
    expect(normalizeEmission({ track: "garbage", content: "" }).emission.track).toBe("dialogue");
    expect(normalizeEmission({ track: "action", content: "" }).emission.track).toBe("action");
  });

  test("(c) unknown pacing → warning + defaults to normal", () => {
    const r = normalizeEmission({ track: "dialogue", content: "", pacing: "blurry" });
    expect(r.emission.pacing).toBe("normal");
    expect(r.warnings.some(w => /Unknown pacing/.test(w))).toBe(true);
  });

  test("(d) tension clamped to [0,10]", () => {
    expect(normalizeEmission({ track: "dialogue", content: "", tension: 15 }).emission.tension).toBe(10);
    expect(normalizeEmission({ track: "dialogue", content: "", tension: -3 }).emission.tension).toBe(0);
    expect(normalizeEmission({ track: "dialogue", content: "", tension: 5.7 }).emission.tension).toBe(6);
  });

  test("(e) unknown scene type → cloned scene with fallback to 'beat' + warning, raw scene untouched", () => {
    const rawScene = { type: "wormhole", image_prompt: "x" };
    const raw = { track: "narration", content: "", scene: rawScene };
    const r = normalizeEmission(raw);
    expect((r.emission.scene as { type: string }).type).toBe("beat");
    expect(r.warnings.some(w => /Unknown scene type/.test(w))).toBe(true);
    expect(rawScene.type).toBe("wormhole"); // raw unchanged
  });

  test("(f) unknown forward-compat fields preserved", () => {
    const r = normalizeEmission({ track: "dialogue", content: "", future_field: "from_v2" });
    expect((r.emission as Record<string, unknown>).future_field).toBe("from_v2");
  });

  test("(g) custom (non-preset) tone passes with warning", () => {
    const r = normalizeEmission({ track: "dialogue", content: "", tone: "smug" });
    expect(r.emission.tone).toBe("smug");
    expect(r.warnings.some(w => /Custom tone/.test(w))).toBe(true);
  });
});

describe("applySpanOverrides + FALLBACK_DEFAULTS", () => {
  test("applySpanOverrides merges without mutation", () => {
    const base = { track: "dialogue", content: "x" } as never;
    const overrides = { tone: "whisper" } as never;
    const merged = applySpanOverrides(base, overrides);
    expect(merged.tone).toBe("whisper");
  });
  test("FALLBACK_DEFAULTS shape", () => {
    expect(FALLBACK_DEFAULTS.tone).toBe("normal");
    expect(FALLBACK_DEFAULTS.pacing).toBe("normal");
    expect(FALLBACK_DEFAULTS.confidence).toBe("neutral");
    expect(FALLBACK_DEFAULTS.tension).toBe(3);
  });
});
