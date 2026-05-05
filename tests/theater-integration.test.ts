import { describe, expect, test } from "bun:test";
import { compose, deduplicateEmissions } from "../src/theater/composer.ts";
import { SAMPLE_EMISSIONS, SAMPLE_SESSION } from "../src/theater/fixtures/sample-emissions.ts";
import type { ViewerRole } from "../src/theater/types.ts";

const ROLES: ViewerRole[] = ["player", "dm", "audience"];

describe("Integration — fixture × every viewer role", () => {
  test("session setup is well-formed (3 agents, 1 dm)", () => {
    expect(SAMPLE_SESSION.agents).toHaveLength(3);
    expect(SAMPLE_SESSION.agents.filter(a => a.role === "dm")).toHaveLength(1);
  });

  test("fixture has ≥ 15 emissions and exercises all 11 tone presets", () => {
    expect(SAMPLE_EMISSIONS.length).toBeGreaterThanOrEqual(15);
    const tones = new Set(SAMPLE_EMISSIONS.map(e => e.tone).filter(Boolean));
    for (const t of [
      "whisper", "mutter", "normal", "excited", "yell", "shout",
      "growl", "sigh", "giggle", "monotone", "raspy",
    ] as const) {
      expect(tones.has(t)).toBe(true);
    }
  });

  test("fixture covers all 4 address modes", () => {
    const modes = new Set(SAMPLE_EMISSIONS.map(e => e.address).filter(Boolean));
    for (const m of ["to-self", "aside", "to-party", "to-NPC"] as const) {
      expect(modes.has(m)).toBe(true);
    }
  });

  test("fixture covers both audience aside kinds", () => {
    const kinds = new Set(SAMPLE_EMISSIONS.map(e => e.audience_aside?.kind).filter(Boolean));
    expect(kinds.has("confessional")).toBe(true);
    expect(kinds.has("fourth-wall")).toBe(true);
  });

  test("fixture covers body_state: hidden", () => {
    const hidden = SAMPLE_EMISSIONS.filter(e => e.body_state === "hidden");
    expect(hidden.length).toBeGreaterThan(0);
  });

  test("fixture covers all 3 inline markup formats", () => {
    const contents = SAMPLE_EMISSIONS.map(e => e.content).join("\n");
    // bare-tag (e.g. [whisper] or [excited])
    expect(/\[(whisper|mutter|excited|yell|shout|growl|sigh|giggle)\]/.test(contents)).toBe(true);
    // colon
    expect(/\[(tone|pacing|confidence|address|mood):[^\]]+\]/.test(contents)).toBe(true);
    // equals
    expect(/\[(tone|pacing|confidence|address|mood)=[^\]]+\]/.test(contents)).toBe(true);
  });

  for (const role of ROLES) {
    test(`compose all 16 emissions for role=${role} → no crashes; spans non-empty`, () => {
      for (const raw of SAMPLE_EMISSIONS) {
        const r = compose({ ...raw } as Record<string, unknown>, role);
        expect(r).toBeDefined();
        expect(r.viewerRole).toBe(role);
        expect(r.emission.emission_id).toBe(raw.emission_id);
        expect(r.spans.length).toBeGreaterThan(0);
      }
    });
  }

  test("Layer 1 gating: internal_monologue + audience_aside hidden from non-audience", () => {
    const monologues = SAMPLE_EMISSIONS.filter(e => e.track === "internal_monologue");
    const asides = SAMPLE_EMISSIONS.filter(e => e.audience_aside);
    expect(monologues.length).toBeGreaterThan(0);
    expect(asides.length).toBeGreaterThan(0);

    for (const m of monologues) {
      expect(compose({ ...m } as Record<string, unknown>, "player").visible).toBe(false);
      expect(compose({ ...m } as Record<string, unknown>, "dm").visible).toBe(false);
      expect(compose({ ...m } as Record<string, unknown>, "audience").visible).toBe(true);
    }
    for (const a of asides) {
      expect(compose({ ...a } as Record<string, unknown>, "player").visible).toBe(false);
      expect(compose({ ...a } as Record<string, unknown>, "audience").visible).toBe(true);
    }
  });

  test("Layer 2 stripping: foreshadow always stripped for player+dm; hidden_information kept for dm", () => {
    const annotated = SAMPLE_EMISSIONS.filter(e => e.foreshadow || e.hidden_information || e.recap_card);
    expect(annotated.length).toBeGreaterThan(0);

    for (const a of annotated) {
      const player = compose({ ...a } as Record<string, unknown>, "player");
      const dm = compose({ ...a } as Record<string, unknown>, "dm");
      const audience = compose({ ...a } as Record<string, unknown>, "audience");

      // Player: all 3 stripped
      expect(player.emission.foreshadow).toBeUndefined();
      expect(player.emission.hidden_information).toBeUndefined();
      expect(player.emission.recap_card).toBeUndefined();
      // Underlying narration text intact
      expect(player.emission.content).toBe(a.content);

      // DM: foreshadow stripped, hidden_information PRESERVED, recap_card stripped
      expect(dm.emission.foreshadow).toBeUndefined();
      if (a.hidden_information !== undefined) {
        expect(dm.emission.hidden_information).toBe(a.hidden_information);
      }
      expect(dm.emission.recap_card).toBeUndefined();

      // Audience: nothing stripped
      if (a.foreshadow !== undefined) expect(audience.emission.foreshadow).toBe(a.foreshadow);
      if (a.hidden_information !== undefined) expect(audience.emission.hidden_information).toBe(a.hidden_information);
      if (a.recap_card !== undefined) expect(audience.emission.recap_card).toEqual(a.recap_card);
    }
  });

  test("Hidden body_state emissions are still visible (body_state ≠ Layer 1 gate)", () => {
    // body_state: hidden is information about the actor in-world; it is not an audience-only
    // gating field. Visibility is decided by track + audience_aside only.
    const hidden = SAMPLE_EMISSIONS.filter(e => e.body_state === "hidden" && !e.audience_aside && e.track !== "internal_monologue");
    expect(hidden.length).toBeGreaterThan(0);
    for (const h of hidden) {
      expect(compose({ ...h } as Record<string, unknown>, "player").visible).toBe(true);
      expect(compose({ ...h } as Record<string, unknown>, "dm").visible).toBe(true);
    }
  });

  test("dedup handles fixture-derived duplicates", () => {
    const composedAll = SAMPLE_EMISSIONS.flatMap(e =>
      ROLES.map(r => compose({ ...e } as Record<string, unknown>, r)),
    );
    // composedAll has duplicate emission_ids (one per role) — dedup picks the first per id.
    const dedup = deduplicateEmissions(composedAll);
    expect(dedup.length).toBe(SAMPLE_EMISSIONS.length);
  });

  test("compose() preserves raw input across roles (no input mutation under iteration)", () => {
    for (const raw of SAMPLE_EMISSIONS) {
      const snapshot = JSON.stringify(raw);
      compose({ ...raw } as Record<string, unknown>, "player");
      compose({ ...raw } as Record<string, unknown>, "dm");
      compose({ ...raw } as Record<string, unknown>, "audience");
      // Note: spread copies make this trivially true at top level; the deeper
      // guarantee (composer doesn't mutate the *normalized* clone the parent
      // owns) is covered in theater-composer.test.ts.
      expect(JSON.stringify(raw)).toBe(snapshot);
    }
  });
});
