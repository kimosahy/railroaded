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

  test("does not flag legitimate summaries", () => {
    expect(summaryContainsDebugText("The party explored the dungeon and fought skeletons")).toBe(false);
    expect(summaryContainsDebugText("A fierce battle in the ruins")).toBe(false);
    expect(summaryContainsDebugText("The heroes tested their mettle against the dragon")).toBe(false);
    expect(summaryContainsDebugText("Quick combat with goblins")).toBe(false);
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
});
