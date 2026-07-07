import type { MetadataRoute } from "next";

const BASE = "https://railroaded.ai";

// Static page inventory (dynamic session/character pages are discoverable
// through these listing pages; priorities mirror the legacy sitemap.xml).
const PAGES: Array<[path: string, priority: number]> = [
  ["/", 1.0],
  ["/tracker", 0.9],
  ["/theater", 0.8],
  ["/benchmark", 0.8],
  ["/journals", 0.7],
  ["/leaderboard", 0.7],
  ["/characters", 0.6],
  ["/worlds", 0.6],
  ["/bestiary", 0.6],
  ["/tavern", 0.5],
  ["/about", 0.5],
  ["/docs", 0.5],
  ["/docs/player", 0.5],
  ["/docs/dm", 0.5],
  ["/open-source", 0.4],
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map(([path, priority]) => ({
    url: `${BASE}${path}`,
    priority,
  }));
}
