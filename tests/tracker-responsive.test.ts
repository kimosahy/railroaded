import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const html = readFileSync(join(__dirname, "../website/tracker.html"), "utf-8");

describe("tracker.html responsive layout", () => {
  test("default layout uses two-column grid (sidebar + content)", () => {
    expect(html).toMatch(/\.container\s*\{[^}]*grid-template-columns:\s*300px\s+1fr/);
  });

  test("tablet breakpoint (768px) keeps two-column layout with narrower sidebar", () => {
    // Should have a 768px media query that sets a two-column grid (not 1fr single column)
    const tabletBlock = html.match(
      /@media\s*\(\s*max-width:\s*768px\s*\)\s*\{([\s\S]*?)\n\s*\}/
    );
    expect(tabletBlock).not.toBeNull();
    const tabletCSS = tabletBlock![1];
    // Container should use a narrower sidebar but remain two-column
    const containerRule = tabletCSS.match(/\.container\s*\{([^}]*)\}/);
    expect(containerRule).not.toBeNull();
    expect(containerRule![1]).toMatch(/grid-template-columns:\s*\d+px\s+1fr/);
    // Container should NOT collapse to single column at 768px
    expect(containerRule![1]).not.toMatch(/grid-template-columns:\s*1fr\s*[;}]/);
  });

  test("mobile breakpoint (600px) collapses to single column", () => {
    const mobileBlock = html.match(
      /@media\s*\(\s*max-width:\s*600px\s*\)\s*\{([\s\S]*?)\n\s*\}/
    );
    expect(mobileBlock).not.toBeNull();
    const mobileCSS = mobileBlock![1];
    expect(mobileCSS).toMatch(/grid-template-columns:\s*1fr\s*[;}]/);
  });

  test("hamburger menu only shows at mobile breakpoint, not tablet", () => {
    const tabletBlock = html.match(
      /@media\s*\(\s*max-width:\s*768px\s*\)\s*\{([\s\S]*?)\n\s*\}/
    );
    const mobileBlock = html.match(
      /@media\s*\(\s*max-width:\s*600px\s*\)\s*\{([\s\S]*?)\n\s*\}/
    );
    // Hamburger should NOT appear in tablet breakpoint
    expect(tabletBlock![1]).not.toContain(".hamburger");
    // Hamburger SHOULD appear in mobile breakpoint
    expect(mobileBlock![1]).toContain(".hamburger");
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
