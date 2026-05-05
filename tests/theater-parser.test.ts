import { describe, expect, test } from "bun:test";
import { parseInlineMarkup } from "../src/theater/parser.ts";

describe("parseInlineMarkup — MF §2.2 three-format support", () => {
  test("(a) plain text → single span, empty overrides", () => {
    const r = parseInlineMarkup("just plain text");
    expect(r.spans).toHaveLength(1);
    expect(r.spans[0]!.text).toBe("just plain text");
    expect(r.spans[0]!.overrides).toEqual({});
    expect(r.warnings).toEqual([]);
  });

  test("(b) bare-tag tone [whisper]secret[/whisper]", () => {
    const r = parseInlineMarkup("hey [whisper]secret[/whisper] ok");
    expect(r.spans).toHaveLength(3);
    expect(r.spans[0]!.text).toBe("hey ");
    expect(r.spans[0]!.overrides).toEqual({});
    expect(r.spans[1]!.text).toBe("secret");
    expect(r.spans[1]!.overrides.tone).toBe("whisper");
    expect(r.spans[2]!.text).toBe(" ok");
    expect(r.spans[2]!.overrides).toEqual({});
    expect(r.warnings).toEqual([]);
  });

  test("(c) colon-separated [pacing:hesitant]wait[/pacing]", () => {
    const r = parseInlineMarkup("[pacing:hesitant]wait[/pacing]");
    expect(r.spans).toHaveLength(1);
    expect(r.spans[0]!.text).toBe("wait");
    expect(r.spans[0]!.overrides.pacing).toBe("hesitant");
  });

  test("(d) equals-separated [tone=growl]grr[/tone]", () => {
    const r = parseInlineMarkup("[tone=growl]grr[/tone]");
    expect(r.spans).toHaveLength(1);
    expect(r.spans[0]!.text).toBe("grr");
    expect(r.spans[0]!.overrides.tone).toBe("growl");
  });

  test("(e) hedge bare-tag → confidence: low", () => {
    const r = parseInlineMarkup("[hedge]I think[/hedge]");
    expect(r.spans).toHaveLength(1);
    expect(r.spans[0]!.text).toBe("I think");
    expect(r.spans[0]!.overrides.confidence).toBe("low");
  });

  test("(f) stacked [excited][yell]LOOK OUT[/yell][/excited] — last wins for same key", () => {
    const r = parseInlineMarkup("[excited][yell]LOOK OUT[/yell][/excited]");
    expect(r.spans).toHaveLength(1);
    expect(r.spans[0]!.text).toBe("LOOK OUT");
    // both are tone — last one (yell) wins
    expect(r.spans[0]!.overrides.tone).toBe("yell");
  });

  test("(g) unclosed [whisper] → warning + remaining text tagged", () => {
    const r = parseInlineMarkup("[whisper]text");
    expect(r.spans).toHaveLength(1);
    expect(r.spans[0]!.text).toBe("text");
    expect(r.spans[0]!.overrides.tone).toBe("whisper");
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings[0]).toMatch(/Unclosed \[whisper\]/);
  });

  test("(h) [/whisper] without open → warning", () => {
    const r = parseInlineMarkup("[/whisper]oops");
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings[0]).toMatch(/Closing \[\/whisper\] without matching open tag/);
  });

  test("(i) unknown opening [custom] is literal text; unknown closer [/custom] warns", () => {
    const r = parseInlineMarkup("[custom]text[/custom]");
    // [custom] is not in regex, so it's literal text. [/custom] matches \[\/(\w+)\] but no opener → warn.
    expect(r.spans.some(s => s.text.includes("[custom]"))).toBe(true);
    expect(r.warnings.some(w => /\[\/custom\]/.test(w))).toBe(true);
  });

  test("(j) [tone=whisper]text[/whisper] does NOT match — tag-name namespaces differ", () => {
    const r = parseInlineMarkup("[tone=whisper]text[/whisper]");
    // Two warnings: [/whisper] has no opener (since the opener is named 'tone'),
    // and the [tone=...] is unclosed.
    expect(r.warnings.length).toBeGreaterThanOrEqual(2);
    expect(r.warnings.some(w => /\[\/whisper\]/.test(w))).toBe(true);
    expect(r.warnings.some(w => /Unclosed \[tone\]/.test(w))).toBe(true);
  });

  test("(k) regex state does NOT leak between calls (g flag lastIndex bug)", () => {
    const a = parseInlineMarkup("[whisper]a[/whisper]");
    const b = parseInlineMarkup("[whisper]a[/whisper]");
    expect(a.spans).toEqual(b.spans);
    expect(a.warnings).toEqual(b.warnings);
  });
});
