import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const html = readFileSync(join(__dirname, "../website/tracker.html"), "utf-8");

describe("tracker.html dead monster styling", () => {
  test("monster-dead CSS class exists with reduced opacity", () => {
    expect(html).toMatch(/\.monster-dead\s*\{[^}]*opacity:\s*[\d.]+/);
  });

  test("monster-dead names have line-through text-decoration", () => {
    expect(html).toMatch(/\.monster-dead\s+\.m-name\s*\{[^}]*text-decoration:\s*line-through/);
  });

  test("monster card template checks hpCurrent for dead state", () => {
    // The JS should check hpCurrent <= 0 to determine dead state
    expect(html).toContain("m.hpCurrent <= 0");
  });

  test("dead monsters get monster-dead class applied", () => {
    // The template should conditionally apply monster-dead class
    expect(html).toContain("monster-dead");
    expect(html).toMatch(/dead\s*\?\s*'monster-dead'/);
  });

  test("dead monsters show skull icon instead of monster icon", () => {
    // Emoji swap was replaced by Phosphor icons (ph-skull vs ph-ghost);
    // assertion updated in the 2026-07-07 finish audit.
    expect(html).toMatch(/dead\s*\?\s*'<i class="ph ph-skull">/);
  });

  test("dead monsters show 'Defeated' instead of HP values", () => {
    expect(html).toMatch(/dead\s*\?\s*'Defeated'/);
  });
});
