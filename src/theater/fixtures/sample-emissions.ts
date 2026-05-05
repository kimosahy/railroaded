// Test harness fixture — covers every TonePreset, all address modes,
// both AudienceAside kinds, body_state: hidden, and all 3 inline markup
// formats. Used by tests/theater-integration.test.ts to exercise the full
// compose() pipeline across viewer roles.

import type { Emission, SessionSetup } from "../types.ts";

export const SAMPLE_SESSION: SessionSetup = {
  schema: "railroaded.theater.session_setup.v1",
  session_id: "sess-fixture-1",
  title: "The Whisper of Hollow Hill",
  episode: { season: 1, episode: 1 },
  genre: "high-fantasy",
  art_tone: "candlelight gothic",
  world_params: { "weather": "drizzle", "season": "late-autumn" },
  style_lock: {
    prompt_suffix: "oil painting, candlelight",
    negative_prompt: "anime, neon, modern",
    aspect: "16:9",
    model: "flux-dev",
  },
  agents: [
    { agent_id: "dm-1", role: "dm", model: "claude-opus-4-7",
      character_name: null, class: null, avatar_passport: null },
    { agent_id: "p-brog", role: "player", model: "claude-sonnet-4-6",
      character_name: "Brog", class: "Barbarian",
      avatar_passport: { image_url: "https://example.com/brog.png", seed: 1, reference_prompt: "burly barbarian" } },
    { agent_id: "p-wren", role: "player", model: "gpt-4.1",
      character_name: "Wren", class: "Rogue",
      avatar_passport: { image_url: "https://example.com/wren.png", seed: 2, reference_prompt: "sly rogue in dark cloak" } },
  ],
};

export const SAMPLE_EMISSIONS: Emission[] = [
  // 1. Establishing scene — narration with foreshadow + hidden_information
  {
    schema: "railroaded.theater.emission.v1",
    emission_id: "e-001", session_id: "sess-fixture-1",
    agent_id: "dm-1", agent_role: "dm",
    turn_id: "t-001", in_response_to: null,
    timestamp: "2026-05-05T12:00:00Z",
    track: "narration",
    content: "The crooked door of the inn groans open, spilling lamplight onto rain-slick cobbles.",
    scene: { type: "establishing", image_prompt: "candlelit tavern doorway in rain",
             style_tokens_inherited: true, avatar_refs: [], location_id: "loc-inn",
             regenerate_from: null },
    tension: 2, lighting: "torchlit", act: "I", beat_type: "exposition",
    foreshadow: "Something inside has already noticed them.",
    hidden_information: "A wraith is stalking the rafters, invisible to torchlight.",
  },

  // 2. Player dialogue, normal tone, to-party
  {
    schema: "railroaded.theater.emission.v1",
    emission_id: "e-002", session_id: "sess-fixture-1",
    agent_id: "p-brog", agent_role: "player",
    turn_id: "t-002", in_response_to: "e-001",
    timestamp: "2026-05-05T12:00:05Z",
    track: "dialogue", content: "Stay close. Door's mine.",
    tone: "normal", pacing: "deliberate", address: "to-party",
    posture: "standing-tall", confidence: "high",
  },

  // 3. Whisper bare-tag inline markup, to-self
  {
    schema: "railroaded.theater.emission.v1",
    emission_id: "e-003", session_id: "sess-fixture-1",
    agent_id: "p-wren", agent_role: "player",
    turn_id: "t-003", in_response_to: "e-002",
    timestamp: "2026-05-05T12:00:10Z",
    track: "dialogue",
    content: "[whisper]please don't be a trap[/whisper]",
    tone: "whisper", pacing: "hesitant", address: "to-self",
    confidence: "low",
  },

  // 4. Internal monologue (Layer 1 audience-only)
  {
    schema: "railroaded.theater.emission.v1",
    emission_id: "e-004", session_id: "sess-fixture-1",
    agent_id: "p-wren", agent_role: "player",
    turn_id: "t-004", in_response_to: null,
    timestamp: "2026-05-05T12:00:11Z",
    track: "internal_monologue",
    content: "Brog never listens to me. I should've stayed in Tilberg.",
    tone: "mutter", mood: "grief",
  },

  // 5. Action with colon-format inline markup [pacing:rushed]
  {
    schema: "railroaded.theater.emission.v1",
    emission_id: "e-005", session_id: "sess-fixture-1",
    agent_id: "p-brog", agent_role: "player",
    turn_id: "t-005", in_response_to: "e-004",
    timestamp: "2026-05-05T12:00:12Z",
    track: "action",
    content: "[pacing:rushed]Brog kicks the door in[/pacing]",
    pacing: "rushed", posture: "standing-tall",
    dice_intent: { die: "d20", for: "athletics check", modifier: 4, dc: 13 },
  },

  // 6. Excited yell, equals-format markup [tone=yell] (stacked)
  {
    schema: "railroaded.theater.emission.v1",
    emission_id: "e-006", session_id: "sess-fixture-1",
    agent_id: "p-brog", agent_role: "player",
    turn_id: "t-006", in_response_to: "e-005",
    timestamp: "2026-05-05T12:00:13Z",
    track: "dialogue",
    content: "[tone=yell]FOR ULGAR![/tone]",
    tone: "yell", pacing: "rushed", address: "to-party", confidence: "high",
  },

  // 7. Shout (the only canonical SHOUT preset usage)
  {
    schema: "railroaded.theater.emission.v1",
    emission_id: "e-007", session_id: "sess-fixture-1",
    agent_id: "p-brog", agent_role: "player",
    turn_id: "t-007", in_response_to: "e-006",
    timestamp: "2026-05-05T12:00:14Z",
    track: "dialogue", content: "wren! ROPE NOW!",
    tone: "shout", pacing: "rushed", address: "to-party",
    interrupting: "e-006",
  },

  // 8. Confessional audience aside (Layer 1 audience-only)
  {
    schema: "railroaded.theater.emission.v1",
    emission_id: "e-008", session_id: "sess-fixture-1",
    agent_id: "p-wren", agent_role: "player",
    turn_id: "t-008", in_response_to: null,
    timestamp: "2026-05-05T12:00:15Z",
    track: "dialogue",
    content: "Of course we're charging in. I always wanted to die in a damp tavern.",
    tone: "monotone", address: "aside",
    audience_aside: { kind: "confessional", subject_agent_id: "p-wren" },
  },

  // 9. Fourth-wall aside (DM)
  {
    schema: "railroaded.theater.emission.v1",
    emission_id: "e-009", session_id: "sess-fixture-1",
    agent_id: "dm-1", agent_role: "dm",
    turn_id: "t-009", in_response_to: null,
    timestamp: "2026-05-05T12:00:16Z",
    track: "narration",
    content: "Dear viewer, you have not yet been told what is in the rafters. Patience.",
    tone: "normal",
    audience_aside: { kind: "fourth-wall", subject_agent_id: "dm-1" },
  },

  // 10. Growl + body_state: hidden + to-NPC
  {
    schema: "railroaded.theater.emission.v1",
    emission_id: "e-010", session_id: "sess-fixture-1",
    agent_id: "p-wren", agent_role: "player",
    turn_id: "t-010", in_response_to: "e-007",
    timestamp: "2026-05-05T12:00:17Z",
    track: "dialogue", content: "Where are you, beast?",
    tone: "growl", pacing: "deliberate",
    address: "to-NPC", address_target: "rafter-wraith",
    body_state: "hidden", posture: "crouching",
  },

  // 11. Sigh + grief + to-self
  {
    schema: "railroaded.theater.emission.v1",
    emission_id: "e-011", session_id: "sess-fixture-1",
    agent_id: "p-wren", agent_role: "player",
    turn_id: "t-011", in_response_to: null,
    timestamp: "2026-05-05T12:00:18Z",
    track: "dialogue", content: "of course it's a wraith",
    tone: "sigh", address: "to-self", mood: "grief",
  },

  // 12. Giggle + joy + interrupting
  {
    schema: "railroaded.theater.emission.v1",
    emission_id: "e-012", session_id: "sess-fixture-1",
    agent_id: "p-brog", agent_role: "player",
    turn_id: "t-012", in_response_to: "e-011",
    timestamp: "2026-05-05T12:00:19Z",
    track: "dialogue", content: "haha you said wraith",
    tone: "giggle", mood: "joy", interrupting: "e-011",
  },

  // 13. Raspy + dread + relationship
  {
    schema: "railroaded.theater.emission.v1",
    emission_id: "e-013", session_id: "sess-fixture-1",
    agent_id: "p-brog", agent_role: "player",
    turn_id: "t-013", in_response_to: null,
    timestamp: "2026-05-05T12:00:20Z",
    track: "dialogue", content: "Wren. Behind you.",
    tone: "raspy", pacing: "staccato", mood: "dread", address: "to-party",
    relationships: [{ target: "p-wren", state: "close-ally" }],
  },

  // 14. Excited (curiosity mood) — bare-tag stacked [excited][yell]
  {
    schema: "railroaded.theater.emission.v1",
    emission_id: "e-014", session_id: "sess-fixture-1",
    agent_id: "p-wren", agent_role: "player",
    turn_id: "t-014", in_response_to: "e-013",
    timestamp: "2026-05-05T12:00:21Z",
    track: "dialogue",
    content: "[excited][yell]WRAITH ON THE BEAM[/yell][/excited]",
    tone: "excited", mood: "curiosity",
    address: "to-party", confidence: "neutral",
  },

  // 15. Climax beat — narration + recap_card + tension 10 + scene cut
  {
    schema: "railroaded.theater.emission.v1",
    emission_id: "e-015", session_id: "sess-fixture-1",
    agent_id: "dm-1", agent_role: "dm",
    turn_id: "t-015", in_response_to: null,
    timestamp: "2026-05-05T12:00:22Z",
    track: "narration",
    content: "The rafters split. Something cold drops onto Brog's shoulders. The lamps go out.",
    tone: "normal",
    scene: { type: "reveal", image_prompt: "wraith dropping onto barbarian, snuffed lamps",
             style_tokens_inherited: true, avatar_refs: ["p-brog", "rafter-wraith"],
             location_id: "loc-inn", regenerate_from: null },
    tension: 10, lighting: "midnight", act: "III", beat_type: "climax",
    scene_cut: "hard", featured_character: "p-brog",
    recap_card: [
      { turn_id: "t-001", caption: "they walked into the inn" },
      { turn_id: "t-013", caption: "Brog felt watched" },
    ],
    foreshadow: "Wren's prophecy from Session 0 begins to play out.",
  },

  // 16. NPC introduction (DM npc_intro)
  {
    schema: "railroaded.theater.emission.v1",
    emission_id: "e-016", session_id: "sess-fixture-1",
    agent_id: "dm-1", agent_role: "dm",
    turn_id: "t-016", in_response_to: null,
    timestamp: "2026-05-05T12:00:23Z",
    track: "narration",
    content: "Across the room, an old woman in a cracked mask stands very, very still.",
    tone: "normal",
    npc_intro: { name: "The Mask-Mother", one_line: "knows more than she should",
                 portrait_prompt: "old woman with a porcelain mask, candlelit" },
    tension: 6,
  },
];
