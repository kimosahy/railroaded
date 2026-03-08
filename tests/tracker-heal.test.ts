import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const html = readFileSync(join(__dirname, "../website/tracker.html"), "utf-8");

describe("tracker heal event rendering", () => {
  test("switch statement handles 'heal' event type", () => {
    expect(html).toContain("case 'heal':");
  });

  test("renderHeal function exists", () => {
    expect(html).toContain("function renderHeal(d)");
  });

  test("renderHeal reads healerName for the healer's name", () => {
    // Backend logs heal events with healerName — renderHeal must check it
    expect(html).toMatch(/function renderHeal[\s\S]*?d\.healerName/);
  });

  test("renderHeal reads amount for HP healed", () => {
    // Backend logs heal events with amount — renderHeal must check it
    expect(html).toMatch(/function renderHeal[\s\S]*?d\.amount/);
  });

  test("renderHeal reads targetName for the heal target", () => {
    expect(html).toMatch(/function renderHeal[\s\S]*?d\.targetName/);
  });

  test("renderHeal renders heal-val class for HP amount", () => {
    expect(html).toMatch(/renderHeal[\s\S]*?heal-val/);
  });

  test("heal case routes to renderHeal", () => {
    expect(html).toMatch(/case 'heal':\s*return renderHeal\(d\)/);
  });
});
