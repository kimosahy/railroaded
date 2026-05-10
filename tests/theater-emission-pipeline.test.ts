// End-to-end pipeline: buildEmission → normalizeEmission → storeEmission.
// Verifies the producer-side Theater pipeline produces well-formed envelopes
// the renderer expects. Live-WS-broadcast routing is verified by inspection
// of broadcastTheaterEmission's loop (Task 6 added the internal_monologue gate);
// asserting via real WS subscribers requires harness setup that's deferred.

import { describe, test, expect, beforeEach } from "bun:test";
import { buildEmission } from "../src/theater/build-emission.ts";
import { normalizeEmission, clearVocabularyQueue, getVocabularyQueue } from "../src/theater/normalizer.ts";
import { _resetSetupStore, getEmissionHistory, storeEmission } from "../src/theater/setup-store.ts";

beforeEach(() => {
  _resetSetupStore();
  clearVocabularyQueue();
});

describe("buildEmission — envelope shape (§14.1)", () => {
  test("server-authoritative fields are always set, never trusted from params", () => {
    const raw = buildEmission(
      {
        message: "hi",
        // Agent attempting to override server-controlled fields:
        agent_id: "evil-spoof",
        agent_role: "dm",
        session_id: "spoofed",
        emission_id: "spoofed",
        turn_id: "spoofed",
      },
      {
        sessionId: "real-session",
        agentId: "real-agent",
        agentRole: "player",
        defaultTrack: "dialogue",
        content: "hi",
      },
    );
    expect(raw.session_id).toBe("real-session");
    expect(raw.agent_id).toBe("real-agent");
    expect(raw.agent_role).toBe("player");
    expect(raw.emission_id).not.toBe("spoofed");
    expect(raw.turn_id).not.toBe("spoofed");
    expect(typeof raw.emission_id).toBe("string");
    expect(typeof raw.turn_id).toBe("string");
    expect(raw.schema).toBe("railroaded.theater.emission.v1");
  });

  test("track defaults to handler default when params.track absent", () => {
    const raw = buildEmission(
      { message: "hi" },
      { sessionId: "s", agentId: "a", agentRole: "player", defaultTrack: "dialogue", content: "hi" },
    );
    expect(raw.track).toBe("dialogue");
  });

  test("track is agent-overridable", () => {
    const raw = buildEmission(
      { message: "hi", track: "internal_monologue" },
      { sessionId: "s", agentId: "a", agentRole: "player", defaultTrack: "dialogue", content: "hi" },
    );
    expect(raw.track).toBe("internal_monologue");
  });

  test("DM extension fields only flow when agent_role is dm", () => {
    const playerRaw = buildEmission(
      { message: "hi", lighting: "torchlit", tension: 5 },
      { sessionId: "s", agentId: "a", agentRole: "player", defaultTrack: "dialogue", content: "hi" },
    );
    expect(playerRaw.lighting).toBeUndefined();
    expect(playerRaw.tension).toBeUndefined();

    const dmRaw = buildEmission(
      { text: "x", lighting: "torchlit", tension: 5 },
      { sessionId: "s", agentId: "a", agentRole: "dm", defaultTrack: "narration", content: "x" },
    );
    expect(dmRaw.lighting).toBe("torchlit");
    expect(dmRaw.tension).toBe(5);
  });

  test("addressTarget override (voice_npc derives from npc lookup)", () => {
    const raw = buildEmission(
      { dialogue: "hi" },
      {
        sessionId: "s",
        agentId: "dm",
        agentRole: "dm",
        defaultTrack: "dialogue",
        content: "hi",
        addressTarget: "Bartender",
      },
    );
    expect(raw.address_target).toBe("Bartender");
  });

  test("in_response_to defaults to null when missing", () => {
    const raw = buildEmission(
      { message: "hi" },
      { sessionId: "s", agentId: "a", agentRole: "player", defaultTrack: "dialogue", content: "hi" },
    );
    expect(raw.in_response_to).toBeNull();
  });

  test("in_response_to passed through from params when present", () => {
    const raw = buildEmission(
      { message: "no", in_response_to: "previous-turn-uuid" },
      { sessionId: "s", agentId: "a", agentRole: "player", defaultTrack: "dialogue", content: "no" },
    );
    expect(raw.in_response_to).toBe("previous-turn-uuid");
  });

  test("each call mints a fresh emission_id and turn_id", () => {
    const a = buildEmission(
      { message: "1" },
      { sessionId: "s", agentId: "a", agentRole: "player", defaultTrack: "dialogue", content: "1" },
    );
    const b = buildEmission(
      { message: "2" },
      { sessionId: "s", agentId: "a", agentRole: "player", defaultTrack: "dialogue", content: "2" },
    );
    expect(a.emission_id).not.toBe(b.emission_id);
    expect(a.turn_id).not.toBe(b.turn_id);
  });
});

describe("Pipeline: build → normalize → store", () => {
  test("known enum values pass through cleanly with zero warnings", () => {
    const raw = buildEmission(
      {
        message: "hi",
        tone: "whisper",
        pacing: "deliberate",
        address: "to-party",
        confidence: "low",
        posture: "crouching",
        body_state: "alert",
      },
      { sessionId: "s", agentId: "a", agentRole: "player", defaultTrack: "dialogue", content: "hi" },
    );
    const { emission, warnings } = normalizeEmission(raw);
    expect(warnings.length).toBe(0);
    expect(emission.tone).toBe("whisper");
    expect(emission.pacing).toBe("deliberate");
    expect(emission.address).toBe("to-party");
    storeEmission("p1", emission as unknown as Record<string, unknown>);
    expect(getEmissionHistory("p1").length).toBe(1);
  });

  test("unknown pacing → defaulted with warning, vocab queue records", () => {
    const raw = buildEmission(
      { message: "hi", pacing: "ambling" },
      { sessionId: "s", agentId: "agent-x", agentRole: "player", defaultTrack: "dialogue", content: "hi" },
    );
    const { emission, warnings } = normalizeEmission(raw);
    expect(warnings.length).toBeGreaterThan(0);
    expect(emission.pacing).toBe("normal"); // defaulted
    const queue = getVocabularyQueue();
    const entry = queue.find(e => e.attribute === "pacing" && e.value === "ambling");
    expect(entry).toBeDefined();
    expect(entry!.agentId).toBe("agent-x");
  });

  test("unknown tone (free-form) → preserved as-is, vocab queue records", () => {
    const raw = buildEmission(
      { message: "hi", tone: "wistful" },
      { sessionId: "s", agentId: "agent-y", agentRole: "player", defaultTrack: "dialogue", content: "hi" },
    );
    const { emission, warnings } = normalizeEmission(raw);
    // Free-form tone is allowed (Tone type accepts string), but logged
    expect(emission.tone).toBe("wistful");
    expect(warnings.length).toBeGreaterThan(0);
    const queue = getVocabularyQueue();
    expect(queue.find(e => e.attribute === "tone" && e.value === "wistful")).toBeDefined();
  });

  test("missing track → normalizer defaults to dialogue per spec §14.16", () => {
    // buildEmission would always set track via defaultTrack; this asserts the
    // normalizer's own fallback for malformed payloads bypassing buildEmission.
    const malformed: Record<string, unknown> = {
      schema: "railroaded.theater.emission.v1",
      emission_id: "x", session_id: "s", agent_id: "a", agent_role: "player",
      turn_id: "t", in_response_to: null, timestamp: new Date().toISOString(),
      content: "hi",
      // track intentionally omitted
    };
    const { emission } = normalizeEmission(malformed);
    expect(emission.track).toBe("dialogue");
  });

  test("forward-compat: unknown fields preserved through normalize → store", () => {
    const raw = buildEmission(
      { message: "hi" },
      { sessionId: "s", agentId: "a", agentRole: "player", defaultTrack: "dialogue", content: "hi" },
    );
    raw.future_field = "ok";
    const { emission } = normalizeEmission(raw);
    expect((emission as unknown as Record<string, unknown>).future_field).toBe("ok");
    storeEmission("p", emission as unknown as Record<string, unknown>);
    const stored = getEmissionHistory("p")[0];
    expect(stored.future_field).toBe("ok");
  });
});
