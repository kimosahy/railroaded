import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const trackerHtml = readFileSync(join(__dirname, "../website/tracker.html"), "utf-8");
const narratorCss = readFileSync(join(__dirname, "../website/narrator.css"), "utf-8");

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
