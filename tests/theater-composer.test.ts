import { describe, expect, test } from "bun:test";
import { compose, deduplicateEmissions } from "../src/theater/composer.ts";

describe("compose() — full pipeline", () => {
  test("(a) raw → composed with normalized track + tone + spans", () => {
    const raw = {
      track: "monologue",
      content: "[whisper]hi[/whisper]",
      tone: "growl",
      emission_id: "e1",
    };
    const r = compose(raw, "audience");
    expect(r.emission.track).toBe("internal_monologue");
    expect(r.emission.tone).toBe("growl");
    expect(r.spans.length).toBeGreaterThan(0);
    expect(r.spans.some(s => s.text === "hi" && s.overrides.tone === "whisper")).toBe(true);
  });
});

describe("compose() — Layer 1 whole-emission gating", () => {
  test("(b) internal_monologue: hidden from player + dm; visible to audience", () => {
    const raw = { track: "internal_monologue", content: "I doubt myself.", emission_id: "m1" };
    expect(compose(raw, "player").visible).toBe(false);
    expect(compose(raw, "dm").visible).toBe(false);
    expect(compose(raw, "audience").visible).toBe(true);
  });

  test("(c) audience_aside (confessional): hidden from player + dm; visible to audience", () => {
    const raw = {
      track: "dialogue",
      content: "I always wanted to be a baker.",
      audience_aside: { kind: "confessional", subject_agent_id: "a1" },
      emission_id: "a1",
    };
    expect(compose(raw, "player").visible).toBe(false);
    expect(compose(raw, "dm").visible).toBe(false);
    expect(compose(raw, "audience").visible).toBe(true);
  });

  test("(c.2) audience_aside fourth-wall: same gating", () => {
    const raw = {
      track: "narration",
      content: "Dear viewer…",
      audience_aside: { kind: "fourth-wall", subject_agent_id: "dm1" },
      emission_id: "fw1",
    };
    expect(compose(raw, "player").visible).toBe(false);
    expect(compose(raw, "audience").visible).toBe(true);
  });
});

describe("compose() — Layer 2 field-stripping (visible but annotations gated)", () => {
  const baseRaw = {
    track: "narration",
    content: "The door creaks open.",
    foreshadow: "Something terrible awaits.",
    hidden_information: "Dragon is asleep behind door.",
    recap_card: [{ turn_id: "t1", caption: "previously…" }],
    emission_id: "n1",
  };

  test("(d) player: visible=true, content kept, foreshadow + hidden_information stripped", () => {
    const r = compose({ ...baseRaw }, "player");
    expect(r.visible).toBe(true);
    expect(r.emission.content).toBe("The door creaks open.");
    expect(r.emission.foreshadow).toBeUndefined();
    expect(r.emission.hidden_information).toBeUndefined();
    expect(r.emission.recap_card).toBeUndefined();
  });

  test("(e) dm: visible=true, foreshadow stripped, hidden_information PRESERVED", () => {
    const r = compose({ ...baseRaw }, "dm");
    expect(r.visible).toBe(true);
    expect(r.emission.content).toBe("The door creaks open.");
    expect(r.emission.foreshadow).toBeUndefined();
    expect(r.emission.hidden_information).toBe("Dragon is asleep behind door.");
    expect(r.emission.recap_card).toBeUndefined();
  });

  test("(f) audience: visible=true, all fields preserved", () => {
    const r = compose({ ...baseRaw }, "audience");
    expect(r.visible).toBe(true);
    expect(r.emission.content).toBe("The door creaks open.");
    expect(r.emission.foreshadow).toBe("Something terrible awaits.");
    expect(r.emission.hidden_information).toBe("Dragon is asleep behind door.");
    expect(r.emission.recap_card).toEqual([{ turn_id: "t1", caption: "previously…" }]);
  });
});

describe("compose() — conflict resolution", () => {
  test("(g) interrupting + whisper → tone reset to normal + warning", () => {
    const raw = {
      track: "dialogue", content: "wait!", tone: "whisper",
      interrupting: "other_emission_id", emission_id: "c1",
    };
    const r = compose(raw, "audience");
    expect(r.emission.tone).toBe("normal");
    expect(r.warnings.some(w => /Conflict: interrupting \+ whisper/.test(w))).toBe(true);
  });
});

describe("compose() — no input mutation", () => {
  test("(h) raw input unchanged after compose()", () => {
    const raw: Record<string, unknown> = {
      track: "narration", content: "x",
      foreshadow: "y", hidden_information: "z",
      emission_id: "h1",
    };
    const snapshot = JSON.stringify(raw);
    compose(raw, "player");
    compose(raw, "dm");
    compose(raw, "audience");
    expect(JSON.stringify(raw)).toBe(snapshot);
  });
});

describe("compose() — producedAudienceContent flag", () => {
  test("(i) narration with foreshadow → producedAudienceContent=true even for player", () => {
    const r = compose({
      track: "narration", content: "x",
      foreshadow: "secret", emission_id: "i1",
    }, "player");
    expect(r.producedAudienceContent).toBe(true);
    expect(r.visible).toBe(true);
  });
  test("(i.2) plain dialogue → producedAudienceContent=false", () => {
    const r = compose({ track: "dialogue", content: "hi", emission_id: "i2" }, "player");
    expect(r.producedAudienceContent).toBe(false);
  });
  test("(i.3) internal_monologue → producedAudienceContent=true", () => {
    const r = compose({ track: "internal_monologue", content: "x", emission_id: "i3" }, "player");
    expect(r.producedAudienceContent).toBe(true);
  });
});

describe("deduplicateEmissions", () => {
  test("(j) two emissions with same emission_id → one output", () => {
    const a = compose({ track: "dialogue", content: "x", emission_id: "dup1" }, "audience");
    const b = compose({ track: "dialogue", content: "x", emission_id: "dup1" }, "audience");
    const c = compose({ track: "dialogue", content: "y", emission_id: "uniq1" }, "audience");
    const out = deduplicateEmissions([a, b, c]);
    expect(out).toHaveLength(2);
    expect(out.map(e => e.emission.emission_id)).toEqual(["dup1", "uniq1"]);
  });
});
