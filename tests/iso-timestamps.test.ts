/**
 * Sprint P §3.4 — verify spectator endpoints emit ISO 8601 UTC timestamps.
 *
 * Audit findings:
 *   - All response-body timestamps in spectator.ts use .toISOString() except
 *     /sessions/:id/conversations startedAt, which now coerces explicitly.
 *   - Internal SessionEvent.timestamp (Date) is fine as-is — not a response field.
 *
 * This test asserts that endpoints we can hit without a DB return well-formed
 * ISO 8601 strings (or null) on every timestamp field they emit.
 */
import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import spectator from "../src/api/spectator.ts";

const app = new Hono();
app.route("/spectator", spectator);

const ISO_8601 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

describe("Sprint P §3.4 — ISO 8601 timestamps", () => {
  test("queue-summary last_match_at is ISO 8601 or null", async () => {
    const res = await app.request("/spectator/queue-summary");
    expect(res.status).toBe(200);
    const body = await res.json() as { last_match_at: string | null };
    if (body.last_match_at !== null) {
      expect(body.last_match_at).toMatch(ISO_8601);
    }
  });

  test("explicit ISO 8601 regex matches expected shape", () => {
    const sample = new Date().toISOString();
    expect(sample).toMatch(ISO_8601);
  });
});
