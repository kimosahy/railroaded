import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const html = readFileSync(join(__dirname, "../website/tracker.html"), "utf-8");

describe("tracker empty session handling", () => {
  test("renderSessions filters out inactive sessions with 0 events", () => {
    // Should filter sessions: keep active OR eventCount > 0
    expect(html).toContain("sessions.filter(s => s.isActive || (s.eventCount || 0) > 0)");
  });

  test("active sessions with 0 events show 'Session starting…' instead of '0 events'", () => {
    expect(html).toContain("Session starting\\u2026");
  });

  test("empty sessions get the empty-session CSS class", () => {
    expect(html).toContain("empty-session");
    // Should apply the class conditionally based on isEmpty
    expect(html).toMatch(/isEmpty\s*\?\s*`empty-session/);
  });

  test("empty-session CSS class dims the card with reduced opacity", () => {
    expect(html).toMatch(/\.session-card\.empty-session\s*\{[^}]*opacity:\s*0\.55/);
  });

  test("empty-session CSS uses dashed border to visually distinguish", () => {
    expect(html).toMatch(/\.session-card\.empty-session\s*\{[^}]*border-style:\s*dashed/);
  });

  test("live empty sessions have a pulse animation", () => {
    expect(html).toContain("pulse-dim");
    expect(html).toMatch(/\.session-card\.empty-session\.live\s*\{[^}]*animation.*pulse-dim/);
  });

  test("shows 'No session history' when all sessions are filtered out", () => {
    // After filtering, if visible.length === 0, should show empty state
    expect(html).toMatch(/visible\.length\s*===\s*0\s*&&\s*!append/);
  });

  test("empty session aria-label includes 'session starting' for accessibility", () => {
    expect(html).toContain("session starting");
    // Should conditionally add to aria-label
    expect(html).toMatch(/aria-label=.*isEmpty.*session starting/);
  });
});
