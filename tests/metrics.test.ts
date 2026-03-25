import { describe, test, expect } from "bun:test";
import {
  detectSafetyBleedThrough,
  detectFlawActivation,
  detectFlawOpportunity,
  detectTacticalChat,
  countWords,
} from "../src/game/metrics.ts";

describe("detectSafetyBleedThrough", () => {
  test("detects 'as an AI' refusal", () => {
    expect(detectSafetyBleedThrough("As an AI, I cannot engage in violence.")).toBe(true);
  });

  test("detects 'I can't do that'", () => {
    expect(detectSafetyBleedThrough("I can't do that, it's not appropriate.")).toBe(true);
  });

  test("detects 'my programming'", () => {
    expect(detectSafetyBleedThrough("My programming prevents me from helping with that.")).toBe(true);
  });

  test("ignores normal in-character speech", () => {
    expect(detectSafetyBleedThrough("I draw my sword and charge the goblin!")).toBe(false);
  });

  test("ignores in-character refusal", () => {
    expect(detectSafetyBleedThrough("I refuse to help you, villain!")).toBe(false);
  });
});

describe("detectFlawActivation", () => {
  test("detects flaw keywords in action text", () => {
    const flaw = "Greedy and obsessed with gold, will betray allies for treasure";
    const text = "I grab the gold before anyone else can reach the treasure chest";
    expect(detectFlawActivation(text, flaw)).toBe(true);
  });

  test("returns false when flaw not relevant", () => {
    const flaw = "Terrible fear of spiders";
    const text = "I attack the goblin with my sword";
    expect(detectFlawActivation(text, flaw)).toBe(false);
  });

  test("returns false for empty flaw", () => {
    expect(detectFlawActivation("I attack the goblin", "")).toBe(false);
  });
});

describe("detectFlawOpportunity", () => {
  test("detects when flaw could be relevant", () => {
    const flaw = "Terrible fear of spiders";
    const text = "A giant spider drops from the ceiling";
    expect(detectFlawOpportunity(text, flaw)).toBe(true);
  });

  test("returns false when context doesn't match flaw", () => {
    const flaw = "Terrible fear of spiders";
    const text = "The merchant offers you a healing potion";
    expect(detectFlawOpportunity(text, flaw)).toBe(false);
  });
});

describe("detectTacticalChat", () => {
  test("detects tactical keywords", () => {
    expect(detectTacticalChat("Let's flank the ogre from behind!", [])).toBe(true);
  });

  test("detects party member name reference", () => {
    expect(detectTacticalChat("Brog, get ready!", ["Brog", "Wren"])).toBe(true);
  });

  test("ignores casual chat", () => {
    expect(detectTacticalChat("This dungeon is really dark.", [])).toBe(false);
  });
});

describe("countWords", () => {
  test("counts words in a sentence", () => {
    expect(countWords("I attack the goblin with my sword")).toBe(7);
  });

  test("returns 0 for empty string", () => {
    expect(countWords("")).toBe(0);
  });

  test("handles extra whitespace", () => {
    expect(countWords("  hello   world  ")).toBe(2);
  });
});
