import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

// tracker.html moved from a .container 2-col grid to the .page-with-narrator
// 3-col grid (party list | content | narrator panel); assertions updated in
// the 2026-07-07 finish audit after they went stale against the old markup.

const html = readFileSync(join(__dirname, "../website/tracker.html"), "utf-8");

describe("tracker.html responsive layout", () => {
  test("default layout uses three-column grid (sidebar + content + narrator)", () => {
    expect(html).toMatch(
      /\.page-with-narrator\s*\{[^}]*grid-template-columns:\s*300px\s+1fr\s+300px/
    );
  });

  test("1100px breakpoint collapses to two-column layout", () => {
    const block = html.match(
      /@media\s*\(\s*max-width:\s*1100px\s*\)\s*\{([\s\S]*?)\n\s*\}/
    );
    expect(block).not.toBeNull();
    const rule = block![1]!.match(/\.page-with-narrator\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/grid-template-columns:\s*300px\s+1fr\s*[;}]/);
  });

  test("tablet breakpoint (768px) keeps two-column layout with narrower sidebar", () => {
    const tabletBlock = html.match(
      /@media\s*\(\s*max-width:\s*768px\s*\)\s*\{([\s\S]*?)\n\s*\}/
    );
    expect(tabletBlock).not.toBeNull();
    const rule = tabletBlock![1]!.match(/\.page-with-narrator\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    expect(rule![1]).toMatch(/grid-template-columns:\s*\d+px\s+1fr/);
    // Should NOT collapse to single column at 768px
    expect(rule![1]).not.toMatch(/grid-template-columns:\s*1fr\s*[;}]/);
  });

  test("mobile breakpoint (600px) collapses to single column", () => {
    const mobileBlock = html.match(
      /@media\s*\(\s*max-width:\s*600px\s*\)\s*\{([\s\S]*?)\n\s*\}/
    );
    expect(mobileBlock).not.toBeNull();
    const mobileCSS = mobileBlock![1]!;
    expect(mobileCSS).toMatch(/grid-template-columns:\s*1fr\s*[;}]/);
  });

  test("hamburger menu shows at tablet breakpoint (768px)", () => {
    // Hamburger should activate at 768px so nav links don't overflow
    expect(html).toMatch(
      /@media\s*\(\s*max-width:\s*768px\s*\)\s*\{[\s\S]*?\.hamburger\s*\{\s*display:\s*flex/
    );
  });

  test("scrollable containers use overscroll-behavior: contain to prevent scroll bleed", () => {
    // Event feed must contain scroll to prevent body scroll on mobile
    const eventFeedRule = html.match(/\.event-feed\s*\{([^}]*)\}/);
    expect(eventFeedRule).not.toBeNull();
    expect(eventFeedRule![1]).toMatch(/overscroll-behavior:\s*contain/);

    // Party list sidebar must also contain scroll
    const partyListRule = html.match(/\.party-list\s*\{([^}]*)\}/);
    expect(partyListRule).not.toBeNull();
    expect(partyListRule![1]).toMatch(/overscroll-behavior:\s*contain/);
  });

  test("party-detail becomes static position only at mobile breakpoint", () => {
    const tabletBlock = html.match(
      /@media\s*\(\s*max-width:\s*768px\s*\)\s*\{([\s\S]*?)\n\s*\}/
    );
    const mobileBlock = html.match(
      /@media\s*\(\s*max-width:\s*600px\s*\)\s*\{([\s\S]*?)\n\s*\}/
    );
    // Tablet should keep sticky positioning (not override to static)
    expect(tabletBlock![1]).not.toContain("position: static");
    // Mobile should switch to static
    expect(mobileBlock![1]).toContain("position: static");
  });
});
