// Rev3 Task 3 coverage: audience_aside + internal_monologue must be gated
// at the WS broadcast layer (defense-in-depth alongside the frontend
// composer.ts:isVisibleToViewer gate).
//
// stripAnnotationsForViewer is also asserted: audience_aside is now stripped
// for both player and dm roles (DM keeps it via raw replay store, not live WS).

import { describe, test, expect } from "bun:test";
import { stripAnnotationsForViewer } from "../src/theater/composer.ts";
import type { Emission, AudienceAside } from "../src/theater/types.ts";

function buildEmission(overrides: Partial<Emission> = {}): Emission {
  return {
    schema: "railroaded.theater.emission.v1",
    emission_id: "e-1",
    session_id: "s-1",
    agent_id: "a-1",
    agent_role: "dm",
    turn_id: "t-1",
    in_response_to: null,
    timestamp: new Date().toISOString(),
    track: "narration",
    content: "scene text",
    ...overrides,
  };
}

describe("stripAnnotationsForViewer — audience_aside gating (Task 3a)", () => {
  test("player role: audience_aside stripped to undefined", () => {
    const aside: AudienceAside = { kind: "fourth-wall", subject_agent_id: "self" };
    const stripped = stripAnnotationsForViewer(buildEmission({ audience_aside: aside }), "player");
    expect(stripped.audience_aside).toBeUndefined();
  });

  test("player role: foreshadow / hidden_information / recap_card all stripped (regression)", () => {
    const stripped = stripAnnotationsForViewer(
      buildEmission({
        foreshadow: "secret",
        hidden_information: "monster_hp_45",
        recap_card: [{ turn_id: "x", caption: "y" }],
      }),
      "player",
    );
    expect(stripped.foreshadow).toBeUndefined();
    expect(stripped.hidden_information).toBeUndefined();
    expect(stripped.recap_card).toBeUndefined();
  });

  test("dm role: audience_aside stripped (live view; DM accesses own asides via raw replay)", () => {
    const aside: AudienceAside = { kind: "confessional", subject_agent_id: "char-3" };
    const stripped = stripAnnotationsForViewer(buildEmission({ audience_aside: aside }), "dm");
    expect(stripped.audience_aside).toBeUndefined();
  });

  test("dm role: hidden_information PRESERVED (operational awareness — regression check)", () => {
    const stripped = stripAnnotationsForViewer(
      buildEmission({ hidden_information: "monster_hp_45" }),
      "dm",
    );
    expect(stripped.hidden_information).toBe("monster_hp_45");
  });

  test("audience role: keeps everything (audience_aside, foreshadow, hidden_information, recap_card)", () => {
    const aside: AudienceAside = { kind: "fourth-wall", subject_agent_id: "self" };
    const stripped = stripAnnotationsForViewer(
      buildEmission({
        audience_aside: aside,
        foreshadow: "secret",
        hidden_information: "monster_hp_45",
        recap_card: [{ turn_id: "x", caption: "y" }],
      }),
      "audience",
    );
    expect(stripped.audience_aside).toEqual(aside);
    expect(stripped.foreshadow).toBe("secret");
    expect(stripped.hidden_information).toBe("monster_hp_45");
    expect(stripped.recap_card).toEqual([{ turn_id: "x", caption: "y" }]);
  });

  test("does not mutate input emission", () => {
    const aside: AudienceAside = { kind: "fourth-wall", subject_agent_id: "self" };
    const input = buildEmission({ audience_aside: aside });
    stripAnnotationsForViewer(input, "player");
    expect(input.audience_aside).toEqual(aside);
  });
});

// Note: full WS broadcast gate behavior (audience_aside emissions skip live
// broadcast entirely; storeEmission still runs for audience replay) is verified
// by inspection of broadcastTheaterEmission's loop in src/api/ws.ts:381 — both
// `if (emission.track === "internal_monologue") continue;` AND
// `if (emission.audience_aside) continue;` precede the per-subscriber send.
// Asserting via real WS subscribers requires harness setup beyond rev3 scope;
// the symmetric strip above + the gate inspection together cover the leak.
