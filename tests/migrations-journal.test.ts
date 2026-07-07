import { describe, test, expect } from "bun:test";
import { readdirSync, readFileSync } from "fs";
import { join } from "path";

// Guards against the orphaned-migration failure found in the 2026-07-07 launch audit:
// 0021_ena_sprint_j.sql existed on disk but had no _journal.json entry, so
// `bun run db:migrate` silently skipped it and fresh databases were missing
// columns that schema.ts already referenced.

const drizzleDir = join(__dirname, "../drizzle");
const journal = JSON.parse(
  readFileSync(join(drizzleDir, "meta/_journal.json"), "utf-8"),
) as { entries: { idx: number; when: number; tag: string }[] };

const sqlFiles = readdirSync(drizzleDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

describe("drizzle migration journal", () => {
  test("every .sql migration file has a journal entry", () => {
    const tags = new Set(journal.entries.map((e) => e.tag));
    const missing = sqlFiles.filter((f) => !tags.has(f.replace(/\.sql$/, "")));
    expect(missing).toEqual([]);
  });

  test("every journal entry has a .sql file on disk", () => {
    const files = new Set(sqlFiles.map((f) => f.replace(/\.sql$/, "")));
    const dangling = journal.entries.filter((e) => !files.has(e.tag));
    expect(dangling).toEqual([]);
  });

  test("journal idx values are sequential from 0", () => {
    journal.entries.forEach((e, i) => expect(e.idx).toBe(i));
  });

  test("journal 'when' timestamps strictly increase (migrator applies by when)", () => {
    for (let i = 1; i < journal.entries.length; i++) {
      expect(journal.entries[i]!.when).toBeGreaterThan(
        journal.entries[i - 1]!.when,
      );
    }
  });
});
