import { describe, expect, test } from "bun:test";
import { filterSummary, summaryContainsDebugText } from "../src/game/game-manager.ts";

describe("summaryContainsDebugText", () => {
  test("detects bug references (B036, B047)", () => {
    expect(summaryContainsDebugText("B036 VERIFIED FIXED")).toBe(true);
    expect(summaryContainsDebugText("Testing B047 regression")).toBe(true);
    expect(summaryContainsDebugText("B1234 edge case")).toBe(true);
  });

  test("detects VERIFIED FIXED", () => {
    expect(summaryContainsDebugText("Session complete - VERIFIED FIXED")).toBe(true);
  });

  test("detects STILL BROKEN", () => {
    expect(summaryContainsDebugText("Monster attack STILL BROKEN")).toBe(true);
  });

  test("detects issue tags [ie-*]", () => {
    expect(summaryContainsDebugText("Fix applied [ie-B048]")).toBe(true);
    expect(summaryContainsDebugText("[ie-ux-016] test")).toBe(true);
  });

  test("detects QA, REGRESSION, PLAYTEST, DEBUG", () => {
    expect(summaryContainsDebugText("QA run #5")).toBe(true);
    expect(summaryContainsDebugText("REGRESSION in combat")).toBe(true);
    expect(summaryContainsDebugText("PLAYTEST round 3")).toBe(true);
    expect(summaryContainsDebugText("DEBUG session output")).toBe(true);
  });

  test("detects Quick test / endpoint test / skeleton test / test session", () => {
    expect(summaryContainsDebugText("Quick test")).toBe(true);
    expect(summaryContainsDebugText("Quick skeleton test")).toBe(true);
    expect(summaryContainsDebugText("endpoint test")).toBe(true);
    expect(summaryContainsDebugText("test session for combat")).toBe(true);
  });

  test("case insensitive for new patterns", () => {
    expect(summaryContainsDebugText("quick TEST")).toBe(true);
    expect(summaryContainsDebugText("ENDPOINT TEST")).toBe(true);
    expect(summaryContainsDebugText("Test Session")).toBe(true);
  });

  test("detects technical jargon (API, field alias, correct IDs)", () => {
    expect(summaryContainsDebugText("Combat API field aliases now work")).toBe(true);
    expect(summaryContainsDebugText("field alias mapping is broken")).toBe(true);
    expect(summaryContainsDebugText("Monster-attack works fine with correct IDs")).toBe(true);
    expect(summaryContainsDebugText("Verified with correct IDs")).toBe(true);
  });

  test("detects QA validation language (works fine, works correctly)", () => {
    expect(summaryContainsDebugText("Monster-attack works fine with correct IDs.")).toBe(true);
    expect(summaryContainsDebugText("Combat system works correctly now")).toBe(true);
    expect(summaryContainsDebugText("Spells work properly after fix")).toBe(true);
  });

  test("detects bug description language (permanently stuck)", () => {
    expect(summaryContainsDebugText("One member permanently stuck unconscious")).toBe(true);
  });

  test("detects internal tool name references (monster-attack, monster_attack)", () => {
    expect(summaryContainsDebugText("monster-attack works")).toBe(true);
    expect(summaryContainsDebugText("monster_attack tool verified")).toBe(true);
  });

  test("detects test run descriptions (test narration, test combat)", () => {
    expect(summaryContainsDebugText("test narration output")).toBe(true);
    expect(summaryContainsDebugText("test combat scenario")).toBe(true);
    expect(summaryContainsDebugText("test run completed")).toBe(true);
  });

  test("detects clinical room enumeration", () => {
    expect(summaryContainsDebugText("Full goblin cave exploration — 7 rooms, wolf den, throne room")).toBe(true);
    expect(summaryContainsDebugText("Explored 3 rooms, then rested")).toBe(true);
  });

  test("does not flag legitimate summaries", () => {
    expect(summaryContainsDebugText("The party explored the dungeon and fought skeletons")).toBe(false);
    expect(summaryContainsDebugText("A fierce battle in the ruins")).toBe(false);
    expect(summaryContainsDebugText("The heroes tested their mettle against the dragon")).toBe(false);
    expect(summaryContainsDebugText("Quick combat with goblins")).toBe(false);
    expect(summaryContainsDebugText("The adventurers cleared many rooms and found treasure")).toBe(false);
    expect(summaryContainsDebugText("The party worked fine together despite their differences")).toBe(false);
  });
});

describe("filterSummary", () => {
  test("strips bug references from mixed content", () => {
    const result = filterSummary("The party fought skeletons. B036 VERIFIED FIXED. They won.");
    expect(result).not.toContain("B036");
    expect(result).not.toContain("VERIFIED");
  });

  test("strips issue tags", () => {
    const result = filterSummary("Combat resolved [ie-B048] successfully");
    expect(result).not.toContain("[ie-B048]");
  });

  test("returns empty-ish string for fully debug summaries", () => {
    const result = filterSummary("B036 VERIFIED FIXED");
    expect(result.length).toBeLessThan(5);
  });

  test("returns empty-ish string for Quick test", () => {
    const result = filterSummary("Quick test");
    expect(result.length).toBeLessThan(5);
  });

  test("returns empty-ish string for endpoint test", () => {
    const result = filterSummary("endpoint test");
    expect(result.length).toBeLessThan(5);
  });

  test("returns empty-ish string for test session", () => {
    const result = filterSummary("test session");
    expect(result.length).toBeLessThan(5);
  });

  test("preserves legitimate summaries untouched", () => {
    const summary = "The party explored the dungeon and defeated a dragon";
    expect(filterSummary(summary)).toBe(summary);
  });

  test("preserves summaries with 'test' as part of other words", () => {
    const summary = "The heroes tested their mettle against the dragon";
    expect(filterSummary(summary)).toBe(summary);
  });

  test("strips technical debug notes from Unbroken Lanterns summary", () => {
    const summary = "One member permanently stuck unconscious. Combat API field aliases now work.";
    const result = filterSummary(summary);
    expect(result).not.toContain("permanently stuck");
    expect(result).not.toContain("API");
    expect(result).not.toContain("field aliases");
    expect(result.length).toBeLessThan(5);
  });

  test("strips QA validation from Stalwart Shields summary", () => {
    const summary = "Monster-attack works fine with correct IDs.";
    const result = filterSummary(summary);
    expect(result).not.toContain("works fine");
    expect(result).not.toContain("correct IDs");
    expect(result.length).toBeLessThan(5);
  });

  test("detects clinical enumeration in Stalwart Covenant summary", () => {
    const summary = "Full goblin cave exploration — 7 rooms, wolf den, throne room, traps, features";
    expect(summaryContainsDebugText(summary)).toBe(true);
  });

  test("preserves narrative summaries with 'worked' (past tense)", () => {
    const summary = "The party worked together to defeat the goblin king";
    expect(filterSummary(summary)).toBe(summary);
  });
});
