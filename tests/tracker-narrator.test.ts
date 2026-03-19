import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const trackerHtml = readFileSync(join(__dirname, "../website/tracker.html"), "utf-8");
const narratorCss = readFileSync(join(__dirname, "../website/narrator.css"), "utf-8");
const spectatorTs = readFileSync(join(__dirname, "../src/api/spectator.ts"), "utf-8");
const narratorTs = readFileSync(join(__dirname, "../src/api/narrator.ts"), "utf-8");

describe("tracker narrator sidebar", () => {
  test("loadNarrations fetches session-specific narrations when sessionId is provided", () => {
    // Should attempt session-specific endpoint first
    expect(trackerHtml).toContain("`${API}/spectator/narrations/${sessionId}`");
  });

  test("loadNarrations falls back to global narrations when session has none", () => {
    // After getting empty session narrations, should fetch global feed
    // The fallback fetch should happen inside the sessionId branch
    const loadFn = trackerHtml.match(/async function loadNarrations\(sessionId\)\s*\{([\s\S]*?)\n\s{4}\}/);
    expect(loadFn).not.toBeNull();
    const fnBody = loadFn![1];

    // Should have two fetches to the global endpoint — one for fallback, one for non-session case
    const globalFetches = fnBody.match(/spectator\/narrations\?limit=20/g);
    expect(globalFetches).not.toBeNull();
    expect(globalFetches!.length).toBe(2);

    // Fallback render should pass { fallback: true }
    expect(fnBody).toContain("{ fallback: true }");
  });

  test("renderNarratorPanel shows fallback context label when opts.fallback is true", () => {
    // Should render a context label explaining these are from other sessions
    expect(trackerHtml).toContain("No narrations for this session. Latest from other adventures:");
    expect(trackerHtml).toContain("narration-context");
  });

  test("renderNarratorPanel shows party name in fallback mode", () => {
    // In fallback mode, each narration entry should show the party name
    expect(trackerHtml).toContain("narration-party");
    // Should only show party name when isFallback and n.partyName exist
    expect(trackerHtml).toMatch(/isFallback && n\.partyName/);
  });

  test("renderNarratorPanel still shows empty state when no narrations exist anywhere", () => {
    // When narrations array is empty (no fallback either), should show silent message
    expect(trackerHtml).toContain("The narrator is silent... for now.");
  });

  test("selectSession sets narratorSessionId and triggers session-specific load", () => {
    expect(trackerHtml).toMatch(/narratorSessionId\s*=\s*id/);
    expect(trackerHtml).toContain("loadNarrations(id)");
  });

  test("selectParty clears narratorSessionId for global narrations", () => {
    expect(trackerHtml).toMatch(/narratorSessionId\s*=\s*null/);
  });

  test("narrator.css has styles for fallback context label", () => {
    expect(narratorCss).toContain(".narration-context");
    expect(narratorCss).toContain(".narration-party");
  });
});

describe("spectator narrations endpoint fallback (ie-ux-016)", () => {
  test("session narrations endpoint falls back to session_events when narrations table is empty", () => {
    // The /spectator/narrations/:sessionId endpoint should query session_events
    // for narration-type events when the narrations table returns no rows
    expect(spectatorTs).toContain('eq(sessionEventsTable.type, "narration")');
  });

  test("fallback extracts text field from session event data", () => {
    // DM narrate tool stores narration text in data.text
    expect(spectatorTs).toMatch(/r\.data.*\.text/);
  });

  test("fallback returns same response shape as narrations table query", () => {
    // Both paths should return { sessionId, narrations: [{ id, eventId, content, createdAt }] }
    const endpointCode = spectatorTs.slice(
      spectatorTs.indexOf("narrations/:sessionId"),
      spectatorTs.indexOf("// ---", spectatorTs.indexOf("narrations/:sessionId"))
    );
    // The fallback path maps to { id, eventId, content, createdAt }
    expect(endpointCode).toContain("eventId: r.id");
    expect(endpointCode).toContain("content:");
    expect(endpointCode).toContain("createdAt: r.createdAt.toISOString()");
  });
});

// === UX-004: test narration 'test narration' visible in narrator sidebar ===
// Root cause: 14-char test record inserted before content length validation existed.
// Fix: migration 0014_delete_test_narration.sql removes the stale row.
// Guard: narrator POST endpoint enforces 20-char minimum so this cannot recur.
describe("ux-004: narrator content validation prevents short test narrations (ie-ux-004)", () => {
  test("narrator POST endpoint enforces minimum content length of 20 characters", () => {
    expect(narratorTs).toContain("content.trim().length < 20");
  });

  test("narrator POST endpoint returns 400 for content shorter than 20 chars", () => {
    // Validates the error response path exists alongside the length check
    expect(narratorTs).toContain("content must be at least 20 characters");
  });

  test("migration 0014 deletes the stale test narration by id", () => {
    const migration = readFileSync(
      join(__dirname, "../drizzle/0014_delete_test_narration.sql"),
      "utf-8"
    );
    expect(migration).toContain("DELETE FROM narrations");
    expect(migration).toContain("1de9ad3d-1cfd-4d37-85f0-757320a3f249");
  });
});
