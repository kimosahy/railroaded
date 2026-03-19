import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const html = readFileSync(join(__dirname, "../website/tracker.html"), "utf-8");

// Extract and evaluate the displayName function from tracker.html
function extractDisplayName(): (s: string) => string {
  const match = html.match(/function displayName\(s\)\s*\{([^}]+)\}/);
  if (!match) throw new Error("displayName function not found in tracker.html");
  return new Function("s", match[1]) as (s: string) => string;
}

const displayName = extractDisplayName();

describe("tracker displayName utility", () => {
  test("displayName function exists in tracker.html", () => {
    expect(html).toContain("function displayName(");
  });

  test("converts underscored template names to title case", () => {
    expect(displayName("bandit_captain")).toBe("Bandit Captain");
    expect(displayName("hobgoblin_warlord")).toBe("Hobgoblin Warlord");
    expect(displayName("skeleton")).toBe("Skeleton");
    expect(displayName("dire_wolf")).toBe("Dire Wolf");
    expect(displayName("young_red_dragon")).toBe("Young Red Dragon");
  });

  test("preserves already-formatted names", () => {
    expect(displayName("Bandit Captain")).toBe("Bandit Captain");
    expect(displayName("Skeleton A")).toBe("Skeleton A");
  });

  test("handles empty and null-like input", () => {
    expect(displayName("")).toBe("");
  });
});

describe("tracker monster name rendering uses displayName", () => {
  test("combat start monster list uses displayName", () => {
    expect(html).toMatch(/monsters\.map\(m\s*=>\s*`\$\{esc\(displayName\(m\.name\)\)/);
  });

  test("monster attack attacker uses displayName", () => {
    expect(html).toContain("displayName(d.monsterName");
  });

  test("loot source uses displayName for monsterName", () => {
    expect(html).toContain("esc(displayName(d.monsterName))");
  });

  test("monster cards use displayName", () => {
    expect(html).toContain("esc(displayName(m.name))");
  });

  test("initiative list uses displayName for monsters", () => {
    expect(html).toMatch(/esc\(isMon\s*\?\s*displayName\(i\.name\)\s*:\s*i\.name\)/);
  });
});
