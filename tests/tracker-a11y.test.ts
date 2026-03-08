import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const html = readFileSync(join(__dirname, "../website/tracker.html"), "utf-8");

describe("tracker.html accessibility", () => {
  test("party cards have role, tabindex, and aria-label", () => {
    // Match the party-card template string
    const partyCardMatch = html.match(/class="party-card[^"]*"[^>]*>/);
    expect(partyCardMatch).not.toBeNull();
    const tag = partyCardMatch![0];
    expect(tag).toContain('role="button"');
    expect(tag).toContain('tabindex="0"');
    expect(tag).toContain("aria-label=");
  });

  test("party cards have keyboard event handler", () => {
    const partyCardMatch = html.match(/class="party-card[^"]*"[^>]*>/);
    const tag = partyCardMatch![0];
    expect(tag).toContain("onkeydown=");
    expect(tag).toMatch(/Enter/);
    expect(tag).toMatch(/Space|' '/);
  });

  test("session cards have role, tabindex, and aria-label", () => {
    const sessionCardMatch = html.match(/class="session-card[^"]*"[^>]*>/);
    expect(sessionCardMatch).not.toBeNull();
    const tag = sessionCardMatch![0];
    expect(tag).toContain('role="button"');
    expect(tag).toContain('tabindex="0"');
    expect(tag).toContain("aria-label=");
  });

  test("session cards have keyboard event handler", () => {
    const sessionCardMatch = html.match(/class="session-card[^"]*"[^>]*>/);
    const tag = sessionCardMatch![0];
    expect(tag).toContain("onkeydown=");
    expect(tag).toMatch(/Enter/);
    expect(tag).toMatch(/Space|' '/);
  });

  test("member cards have role, tabindex, and aria-label", () => {
    const memberCardMatch = html.match(/class="member-card"[^>]*>/);
    expect(memberCardMatch).not.toBeNull();
    const tag = memberCardMatch![0];
    expect(tag).toContain('role="button"');
    expect(tag).toContain('tabindex="0"');
    expect(tag).toContain("aria-label=");
  });

  test("member cards have keyboard event handler", () => {
    const memberCardMatch = html.match(/class="member-card"[^>]*>/);
    const tag = memberCardMatch![0];
    expect(tag).toContain("onkeydown=");
    expect(tag).toMatch(/Enter/);
    expect(tag).toMatch(/Space|' '/);
  });

  test("focus styles exist for interactive cards", () => {
    expect(html).toContain(".party-card:focus");
    expect(html).toContain(".session-card:focus");
    expect(html).toContain(".member-card:focus");
  });
});
