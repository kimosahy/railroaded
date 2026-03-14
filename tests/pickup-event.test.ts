import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const sessionHtml = readFileSync(join(__dirname, "../website/session.html"), "utf-8");
const trackerHtml = readFileSync(join(__dirname, "../website/tracker.html"), "utf-8");

describe("pickup event rendering — session.html", () => {
  test("eventText handles 'pickup' case", () => {
    expect(sessionHtml).toContain("case 'pickup':");
  });

  test("pickup case renders characterName", () => {
    expect(sessionHtml).toMatch(/case 'pickup'.*d\.characterName/);
  });

  test("pickup case renders itemName", () => {
    expect(sessionHtml).toMatch(/case 'pickup'.*d\.itemName/);
  });

  test("pickup icon exists in EVENT_ICONS", () => {
    expect(sessionHtml).toMatch(/pickup:\s*'/);
  });
});

describe("pickup event rendering — tracker.html", () => {
  test("switch statement handles 'pickup' case", () => {
    expect(trackerHtml).toContain("case 'pickup':");
  });

  test("renderPickup function exists", () => {
    expect(trackerHtml).toContain("function renderPickup(d)");
  });

  test("renderPickup references characterName", () => {
    expect(trackerHtml).toMatch(/function renderPickup[\s\S]*?d\.characterName/);
  });

  test("renderPickup references itemName", () => {
    expect(trackerHtml).toMatch(/function renderPickup[\s\S]*?d\.itemName/);
  });

  test("pickup case routes to renderPickup", () => {
    expect(trackerHtml).toMatch(/case 'pickup':\s*return renderPickup\(d\)/);
  });
});
