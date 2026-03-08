import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const trackerHtml = readFileSync(join(__dirname, "../website/tracker.html"), "utf-8");
const journalsHtml = readFileSync(join(__dirname, "../website/journals.html"), "utf-8");

describe("event count pluralization", () => {
  test("tracker.html uses singular 'event' when count is 1", () => {
    // All event count displays should use a ternary for singular/plural
    const eventCountPatterns = trackerHtml.match(/=== 1 \? 'event' : 'events'/g);
    expect(eventCountPatterns).not.toBeNull();
    // There are 4 places in tracker.html that display event counts
    expect(eventCountPatterns!.length).toBeGreaterThanOrEqual(4);
  });

  test("tracker.html does not have bare hardcoded 'events' after a count", () => {
    // Should NOT have patterns like `} events</span>` without the ternary
    // Match templates like: ${...} events</span> or ${...} events` (without ternary)
    const bareEventPlurals = trackerHtml.match(/\$\{[^}]+\}\s+events[`<]/g) || [];
    expect(bareEventPlurals.length).toBe(0);
  });

  test("journals.html uses singular 'event' when count is 1", () => {
    const eventCountPatterns = journalsHtml.match(/=== 1 \? 'event' : 'events'/g);
    expect(eventCountPatterns).not.toBeNull();
    expect(eventCountPatterns!.length).toBeGreaterThanOrEqual(1);
  });

  test("journals.html does not have bare hardcoded 'events' after a count", () => {
    const bareEventPlurals = journalsHtml.match(/\$\{[^}]+\}\s+events[`<]/g) || [];
    expect(bareEventPlurals.length).toBe(0);
  });
});
