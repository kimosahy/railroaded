import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { xmlEscape } from "../src/api/spectator.ts";

const journalsHtml = readFileSync(
  join(__dirname, "../website/journals.html"),
  "utf-8"
);
const spectatorTs = readFileSync(
  join(__dirname, "../src/api/spectator.ts"),
  "utf-8"
);

describe("xmlEscape", () => {
  test("escapes ampersands", () => {
    expect(xmlEscape("Sword & Shield")).toBe("Sword &amp; Shield");
  });

  test("escapes angle brackets", () => {
    expect(xmlEscape("<b>bold</b>")).toBe("&lt;b&gt;bold&lt;/b&gt;");
  });

  test("escapes quotes", () => {
    expect(xmlEscape('He said "hello"')).toBe("He said &quot;hello&quot;");
  });

  test("escapes apostrophes", () => {
    expect(xmlEscape("it's")).toBe("it&apos;s");
  });

  test("handles all special chars together", () => {
    expect(xmlEscape(`<a href="x">&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;"
    );
  });

  test("returns plain strings unchanged", () => {
    expect(xmlEscape("The party explored the dungeon")).toBe(
      "The party explored the dungeon"
    );
  });

  test("handles empty string", () => {
    expect(xmlEscape("")).toBe("");
  });
});

describe("RSS feed endpoint (spectator.ts)", () => {
  test("feed.xml route exists", () => {
    expect(spectatorTs).toContain('"/feed.xml"');
  });

  test("returns Atom XML content type", () => {
    expect(spectatorTs).toContain("application/atom+xml");
  });

  test("generates valid Atom feed structure", () => {
    expect(spectatorTs).toContain('xmlns="http://www.w3.org/2005/Atom"');
    expect(spectatorTs).toContain("<feed");
    expect(spectatorTs).toContain("</feed>");
    expect(spectatorTs).toContain("<entry>");
    expect(spectatorTs).toContain("</entry>");
  });

  test("includes feed metadata", () => {
    expect(spectatorTs).toContain("<title>Railroaded");
    expect(spectatorTs).toContain("<subtitle>");
    expect(spectatorTs).toContain("urn:railroaded:feed");
  });

  test("entries include session links to journals page", () => {
    expect(spectatorTs).toContain("journals.html?session=");
  });

  test("entries have unique IDs using session UUID", () => {
    expect(spectatorTs).toContain("urn:railroaded:session:");
  });

  test("entries include published and updated timestamps", () => {
    expect(spectatorTs).toContain("<published>");
    expect(spectatorTs).toContain("<updated>");
  });

  test("truncates narration content to 500 characters", () => {
    expect(spectatorTs).toMatch(/narration\.slice\(0,\s*500\)/);
  });

  test("includes party member names in feed entries", () => {
    // The feed queries characters by partyId for member names
    expect(spectatorTs).toContain("memberMap");
    expect(spectatorTs).toContain("charactersTable.partyId");
  });

  test("includes campaign name when available", () => {
    expect(spectatorTs).toContain("campaignName: campaignsTable.name");
  });

  test("sets cache header for performance", () => {
    expect(spectatorTs).toContain("Cache-Control");
    expect(spectatorTs).toContain("max-age=300");
  });

  test("returns fallback feed on error", () => {
    // Should still return valid Atom XML on DB error
    const feedSection = spectatorTs.slice(spectatorTs.indexOf("feed.xml"));
    expect(feedSection).toContain("catch (err)");
    expect(feedSection).toContain("application/atom+xml");
  });

  test("uses sanitizeSummaryForPublic for session summaries", () => {
    const feedSection = spectatorTs.slice(spectatorTs.indexOf("feed.xml"));
    expect(feedSection).toContain("sanitizeSummaryForPublic");
  });
});

describe("journals.html RSS integration", () => {
  test("has RSS auto-discovery link in head", () => {
    expect(journalsHtml).toContain('rel="alternate"');
    expect(journalsHtml).toContain('type="application/atom+xml"');
    expect(journalsHtml).toContain("feed.xml");
  });

  test("auto-discovery link has correct title", () => {
    expect(journalsHtml).toContain('title="Railroaded Adventures"');
  });

  test("has RSS icon in page header", () => {
    expect(journalsHtml).toContain("feed.xml");
    // SVG RSS icon
    expect(journalsHtml).toContain("Subscribe via RSS");
  });

  test("RSS icon links to feed endpoint", () => {
    expect(journalsHtml).toContain(
      'href="https://api.railroaded.ai/spectator/feed.xml"'
    );
  });
});
