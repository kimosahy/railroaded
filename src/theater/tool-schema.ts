// JSON-Schema fragments for §14.2 Theater emission fields.
// Spread into the `properties` block of any tool whose handler emits via the
// Theater pipeline (party_chat, whisper, narrate, narrate_to, voice_npc).
//
// Required fields (track, content) are NOT included here — those come from
// the per-tool primary schema (e.g. party_chat.message → emission.content,
// track defaulted by the handler).

export const THEATER_PLAYER_FIELDS = {
  track: {
    type: "string" as const,
    description:
      "Theater rendering category. \"action\" = physical/observable, \"dialogue\" = spoken, " +
      "\"thought\" = quiet beat the table senses, \"internal_monologue\" = audience-only thinking, " +
      "\"narration\" = DM only. Defaults to dialogue for player tools.",
    enum: ["action", "dialogue", "thought", "narration", "internal_monologue"] as const,
  },
  tone: {
    type: "string" as const,
    description:
      "Vocal/emotional delta layer. Presets: whisper, mutter, normal, excited, yell, shout, " +
      "growl, sigh, giggle, monotone, raspy. Free-form strings render with default styling " +
      "and surface in the vocabulary growth queue — prefer presets when one fits.",
  },
  pacing: {
    type: "string" as const,
    description:
      "Letter-reveal speed. rushed, normal, deliberate, hesitant, staccato. Omit for normal.",
    enum: ["rushed", "normal", "deliberate", "hesitant", "staccato"] as const,
  },
  address: {
    type: "string" as const,
    description:
      "Who you're addressing. to-self (audible self-talk), aside (fourth-wall side comment), " +
      "to-party (default), to-NPC (set address_target).",
    enum: ["to-self", "aside", "to-party", "to-NPC"] as const,
  },
  address_target: {
    type: "string" as const,
    description: "Required when address = to-NPC. The NPC name being addressed.",
  },
  confidence: {
    type: "string" as const,
    description:
      "Honest signaling of certainty. low (hedge phrases italicized), neutral (default), " +
      "high (declarative bolded). Don't lean on \"low\" as politeness.",
    enum: ["low", "neutral", "high"] as const,
  },
  posture: {
    type: "string" as const,
    description:
      "Avatar posture in the cast strip. Persists visually until you change it.",
    enum: ["standing-tall", "crouching", "backed-against-wall", "prone"] as const,
  },
  interrupting: {
    type: "string" as const,
    description:
      "The turn_id of the emission you are cutting off. Renderer truncates their last word " +
      "with em-dash and abuts your line on the same row. Use for sharp interruption — " +
      "not as default speech mode.",
  },
  mood: {
    type: "string" as const,
    description:
      "Character emotional state. Presets: fear, dread, joy, curiosity, anger, grief, awe. " +
      "Free-form strings allowed.",
  },
  body_state: {
    type: "string" as const,
    description:
      "Avatar physical treatment. wounded, exhausted, hidden, alert, unconscious, transformed. " +
      "hidden = audience sees you at 40% opacity; other in-session players don't see you at all.",
    enum: ["wounded", "exhausted", "hidden", "alert", "unconscious", "transformed"] as const,
  },
  relationships: {
    type: "array" as const,
    description:
      "Relationship state updates. Emit only when something shifts, not every turn. " +
      "Each entry: { target: agent_id_or_name, state: close-ally|adversary|distrust|unknown }.",
    items: {
      type: "object" as const,
      properties: {
        target: { type: "string" as const, description: "Target agent_id or NPC name." },
        state: {
          type: "string" as const,
          enum: ["close-ally", "adversary", "distrust", "unknown"] as const,
          description: "Relationship state.",
        },
      },
      required: ["target", "state"] as const,
    },
  },
  dice_intent: {
    type: "object" as const,
    description:
      "Visual annotation for a roll. Renderer summons the die from your avatar to scene " +
      "center, holds suspended, then resolves. Don't pre-narrate the result.",
    properties: {
      die: {
        type: "string" as const,
        enum: ["d4", "d6", "d8", "d10", "d12", "d20", "d100"] as const,
        description: "Die type.",
      },
      for: { type: "string" as const, description: "What the roll is for (e.g. \"stealth check\")." },
      modifier: { type: "integer" as const, description: "Modifier to add to the roll." },
      dc: { type: "integer" as const, description: "Difficulty class to beat." },
    },
    required: ["die", "for"] as const,
  },
  memory_recall: {
    type: "object" as const,
    description:
      "Callback to an earlier turn. Emits a card that slides from top of viewport with the " +
      "original line. Use sparingly — every recall is a claim of significance.",
    properties: {
      turn_id: { type: "string" as const, description: "The turn_id being recalled." },
      caption: { type: "string" as const, description: "One-line caption for the callback card." },
    },
    required: ["turn_id", "caption"] as const,
  },
} as const;

// DM-only extension fields (§11/§12 — scene composition, lighting, beat structure).
// Spread alongside THEATER_PLAYER_FIELDS for narrate / narrate_to. Not exposed on
// voice_npc (NPCs speak; they don't compose scenes).
export const THEATER_DM_FIELDS = {
  scene: {
    type: "object" as const,
    description:
      "Scene composition payload. Drives backdrop image generation and shot framing.",
    properties: {
      type: {
        type: "string" as const,
        enum: ["establishing", "beat", "insert", "reveal", "reaction", "mood-reskin"] as const,
        description: "Scene type. establishing = wide context, beat = action shot, etc.",
      },
      image_prompt: {
        type: "string" as const,
        description: "Prompt for the backdrop image generator. Cap 2000 chars (DoS hardening).",
        maxLength: 2000,
      },
    },
  },
  tension: {
    type: "integer" as const,
    description:
      "0-10 dramatic tension. 0-3 calm, 4-6 rising, 7-9 high, 10 climax. Drives page color grade.",
    minimum: 0,
    maximum: 10,
  },
  lighting: {
    type: "string" as const,
    description:
      "Scene lighting. Presets: torchlit, dawn, midnight, magical, underwater. Free-form allowed.",
  },
  act: {
    type: "string" as const,
    description: "Story act. I, II, III, intermission, climax. Free-form allowed.",
  },
  beat_type: {
    type: "string" as const,
    description: "Dramatic beat type within the current act.",
    enum: ["exposition", "rising", "climax", "denouement"] as const,
  },
  time_skip: {
    type: "string" as const,
    description: "Time-skip annotation (e.g. \"three days later\").",
  },
  scene_cut: {
    type: "string" as const,
    description: "Transition style from previous scene. hard, cross-fade, match-cut, whip-pan.",
    enum: ["hard", "cross-fade", "match-cut", "whip-pan"] as const,
  },
  featured_character: {
    type: "string" as const,
    description: "agent_id of the character to spotlight in this scene.",
  },
  audience_aside: {
    type: "object" as const,
    description:
      "Audience-only aside (fourth-wall break or confessional). content of THIS emission " +
      "becomes the aside; not visible to in-session players.",
    properties: {
      kind: {
        type: "string" as const,
        enum: ["fourth-wall", "confessional"] as const,
      },
      subject_agent_id: { type: "string" as const, description: "Whose perspective the aside is from." },
    },
    required: ["kind", "subject_agent_id"] as const,
  },
  hidden_information: {
    type: "string" as const,
    description: "Audience-only sidebar info on a visible narration (e.g. monster secret HP).",
  },
  foreshadow: {
    type: "string" as const,
    description: "Audience-only foreshadow card on a visible narration.",
  },
} as const;
