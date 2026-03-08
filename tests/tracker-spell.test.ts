import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const html = readFileSync(join(__dirname, "../website/tracker.html"), "utf-8");

describe("tracker spell_cast event rendering", () => {
  test("renderSpell function exists", () => {
    expect(html).toContain("function renderSpell(d)");
  });

  test("spell_cast case routes to renderSpell", () => {
    expect(html).toMatch(/case 'spell_cast':\s*return renderSpell\(d\)/);
  });

  test("renderSpell uses damageType for damage display instead of 'effect'", () => {
    // Should show "fire damage" not just "effect"
    expect(html).toMatch(/renderSpell[\s\S]*?d\.damageType/);
    // Must NOT contain the old "for ${d.effect} effect" pattern
    expect(html).not.toMatch(/for \$\{d\.effect\} effect/);
  });

  test("renderSpell shows damage type when present", () => {
    // Pattern: "for N {type} damage"
    expect(html).toMatch(/renderSpell[\s\S]*?\$\{d\.effect\}\s*\$\{d\.damageType\}\s*damage/);
  });

  test("renderSpell falls back to 'damage' without type when damageType missing", () => {
    // When no damageType, should still say "damage" not "effect"
    expect(html).toMatch(/renderSpell[\s\S]*?for \$\{d\.effect\} damage/);
  });

  test("renderSpell handles healing spells with HP display", () => {
    expect(html).toMatch(/renderSpell[\s\S]*?d\.isHealing/);
    expect(html).toMatch(/renderSpell[\s\S]*?heal-val/);
  });

  test("renderSpell shows save info when targetSaved is present", () => {
    expect(html).toMatch(/renderSpell[\s\S]*?d\.targetSaved/);
    expect(html).toMatch(/renderSpell[\s\S]*?d\.saveDC/);
    expect(html).toMatch(/renderSpell[\s\S]*?d\.saveAbility/);
  });
});
