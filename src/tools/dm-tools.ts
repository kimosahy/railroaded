/**
 * DM (Dungeon Master) MCP tool definitions for the Quest Engine.
 *
 * Each tool has a name, description, JSON Schema for input, and a handler
 * reference string. Handlers are wired up in the MCP server registration layer.
 *
 * The DM controls narrative, NPC dialogue, encounter placement, scene pacing,
 * difficulty calibration, and story direction. The server controls all dice rolls,
 * damage calculation, HP/resource tracking, death saves, and loot table rolls.
 */

import type { AbilityName } from "../types.ts";

// ---------------------------------------------------------------------------
// Tool definition type
// ---------------------------------------------------------------------------

/**
 * JSON Schema representation for tool input parameters.
 * Covers the subset of JSON Schema we actually use in tool definitions.
 */
interface JSONSchemaProperty {
  type: "string" | "number" | "integer" | "boolean" | "array" | "object";
  description?: string;
  enum?: readonly string[];
  items?: JSONSchemaProperty;
  properties?: Record<string, JSONSchemaProperty>;
  required?: readonly string[];
  minimum?: number;
  maximum?: number;
  minItems?: number;
  default?: string | number | boolean;
}

interface JSONSchemaObject {
  type: "object";
  properties: Record<string, JSONSchemaProperty>;
  required: readonly string[];
  additionalProperties?: boolean;
}

export interface ToolDefinition {
  /** Tool name used in MCP registration and API routing. */
  name: string;
  /** Human-readable description shown to DM agents during tool discovery. */
  description: string;
  /** JSON Schema describing the tool's input parameters. */
  inputSchema: JSONSchemaObject;
  /** Name of the handler function to be wired up in the MCP/REST layer. */
  handler: string;
}

// ---------------------------------------------------------------------------
// Shared schema fragments (reused across multiple tools)
// ---------------------------------------------------------------------------

const playerIdProperty: JSONSchemaProperty = {
  type: "string",
  description:
    "The unique ID of the target player character. Use get_party_state() to look up IDs.",
};

const abilityProperty: JSONSchemaProperty = {
  type: "string",
  description: "The ability score to use for the check or save.",
  enum: ["str", "dex", "con", "int", "wis", "cha"] as const,
};

const dcProperty: JSONSchemaProperty = {
  type: "integer",
  description:
    "Difficulty Class for the check. Guidelines: Easy 10, Medium 13, Hard 16, Very Hard 19.",
  minimum: 1,
  maximum: 30,
};

const advantageProperty: JSONSchemaProperty = {
  type: "boolean",
  description:
    "Roll with advantage (roll 2d20, take the higher). Grant advantage for favorable " +
    "circumstances, allied help, or class features. Advantage and disadvantage cancel out.",
};

const disadvantageProperty: JSONSchemaProperty = {
  type: "boolean",
  description:
    "Roll with disadvantage (roll 2d20, take the lower). Impose disadvantage for unfavorable " +
    "circumstances, obscured vision, or hostile conditions. Advantage and disadvantage cancel out.",
};

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

export const dmTools: readonly ToolDefinition[] = [
  // -- Narration tools ------------------------------------------------------

  {
    name: "narrate",
    description:
      "Broadcast narrative text to the entire party. Use this to describe rooms, " +
      "scenes, the results of actions, environmental changes, and dramatic moments. " +
      "The text you provide is sent as-is to all connected player agents. This is your " +
      "primary storytelling tool — set the scene, build tension, describe consequences. " +
      "The server does not modify the text; it is delivered verbatim.",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description:
            "The narrative text to send to all party members. Use vivid, descriptive language. " +
            "Can be as short or as long as the moment demands.",
        },
      },
      required: ["text"],
    },
    handler: "handleNarrate",
  },

  {
    name: "narrate_to",
    description:
      "Send private narrative text to a single player. Only that player receives the " +
      "message. Use this for whispered visions, perception-only details, secret notes, " +
      "backstory callbacks, or information that only one character would know. Other " +
      "party members do not see this text.",
    inputSchema: {
      type: "object",
      properties: {
        player_id: {
          ...playerIdProperty,
          description:
            "The ID of the player who should receive this private narration.",
        },
        text: {
          type: "string",
          description:
            "The private narrative text. Only this player will see it.",
        },
      },
      required: ["player_id", "text"],
    },
    handler: "handleNarrateTo",
  },

  // -- Encounter management -------------------------------------------------

  {
    name: "spawn_encounter",
    description:
      "Place monsters in the current scene and trigger combat. The server creates " +
      "monster instances from its data files (stat blocks, HP, AC, attacks), rolls " +
      "initiative for all combatants, and transitions the session into combat phase. " +
      "You provide the list of monsters to spawn; the server handles all the mechanics. " +
      "After spawning, use get_room_state() to see the initiative order and monster " +
      "positions. You can optionally specify a difficulty hint that the server uses for " +
      "logging and balance tracking.",
    inputSchema: {
      type: "object",
      properties: {
        monsters: {
          type: "array",
          description:
            "List of monsters to spawn. Each entry specifies a monster type by template " +
            "name and how many to place. Template names must match entries in the monster " +
            "data files (e.g., 'goblin', 'skeleton', 'hobgoblin', 'wight').",
          items: {
            type: "object",
            properties: {
              template_name: {
                type: "string",
                description:
                  "Name of the monster template from the data files (e.g., 'goblin', 'skeleton', 'bugbear').",
              },
              count: {
                type: "integer",
                description: "How many of this monster to spawn.",
                minimum: 1,
                maximum: 20,
              },
            },
            required: ["template_name", "count"],
          },
          minItems: 1,
        },
        difficulty: {
          type: "string",
          description:
            "Optional difficulty hint for logging and balance metrics. Does not " +
            "mechanically change the encounter — that is determined by which monsters " +
            "you choose to spawn.",
          enum: ["easy", "medium", "hard", "deadly"] as const,
        },
      },
      required: ["monsters"],
    },
    handler: "handleSpawnEncounter",
  },

  {
    name: "trigger_encounter",
    description:
      "Trigger the pre-placed encounter in the current room. Dungeon templates define " +
      "suggested encounters for specific rooms — this tool spawns that encounter automatically " +
      "without needing to specify a monster list. Use get_room_state to see if the current " +
      "room has a suggested encounter waiting. Each room's encounter can only be triggered once. " +
      "If you want a custom encounter instead, use spawn_encounter.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: "handleTriggerEncounter",
  },

  // -- Monster combat -------------------------------------------------------

  {
    name: "monster_attack",
    description:
      "Execute a monster's attack against a player character during combat. This is how " +
      "you resolve monster turns. The server rolls the attack using the monster's stat block, " +
      "resolves damage through the rules engine, and automatically advances the initiative " +
      "tracker to the next combatant. You must call this on the monster whose turn it is " +
      "(check the initiative order from spawn_encounter or the nextTurn field in responses). " +
      "After calling this, narrate the result to the party.",
    inputSchema: {
      type: "object",
      properties: {
        monster_id: {
          type: "string",
          description:
            "The ID of the monster making the attack (e.g. 'monster-1'). Must be the " +
            "monster whose turn it currently is in the initiative order.",
        },
        target_id: {
          ...playerIdProperty,
          description:
            "The ID of the player character being attacked. Use get_party_state() to look up IDs.",
        },
        attack_name: {
          type: "string",
          description:
            "Optional name of the specific attack to use (e.g. 'Scimitar', 'Bite'). " +
            "If omitted, the monster uses its first/default attack.",
        },
      },
      required: ["monster_id", "target_id"],
    },
    handler: "handleMonsterAttack",
  },

  // -- NPC interaction ------------------------------------------------------

  {
    name: "voice_npc",
    description:
      "Speak as a Non-Player Character in the scene. The server tracks which NPCs " +
      "exist in the current room; this tool delivers dialogue attributed to a specific " +
      "NPC. Use distinct voices, speech patterns, and personalities for each NPC. " +
      "All party members receive the dialogue. For NPCs that only one player can hear, " +
      "combine with narrate_to() instead.",
    inputSchema: {
      type: "object",
      properties: {
        npc_id: {
          type: "string",
          description:
            "The ID of the NPC speaking. Must be a valid NPC present in the current scene. " +
            "Use get_room_state() to see available NPCs.",
        },
        dialogue: {
          type: "string",
          description:
            "The NPC's spoken dialogue. Write in character — accents, verbal tics, " +
            "personality quirks all go here.",
        },
      },
      required: ["npc_id", "dialogue"],
    },
    handler: "handleVoiceNpc",
  },

  {
    name: "interact_with_feature",
    description:
      "Interact with a room feature (e.g., a chest, trap, weapon rack, lever). Validates the " +
      "feature exists in the current room and logs the interaction. Returns the feature description " +
      "so you can narrate what happens. You decide the outcome — use existing tools (deal_environment_damage " +
      "for traps, award_loot for chests, narrate for flavor) to resolve the interaction.",
    inputSchema: {
      type: "object",
      properties: {
        feature_name: {
          type: "string",
          description:
            "Name of the feature to interact with. Does not need to be an exact match — " +
            "partial matches work (e.g., 'chest' matches 'Locked chest (DC 14 Thieves\\' Tools to open)').",
        },
      },
      required: ["feature_name"],
    },
    handler: "handleInteractWithFeature",
  },

  {
    name: "override_room_description",
    description:
      "Replace the current room's description text. Use this for dynamic scene changes — " +
      "'the room is now on fire', 'the ceiling has collapsed', 'moonlight floods through the " +
      "broken window'. The new description replaces the old one permanently for this session. " +
      "Players will see the updated description when they use look.",
    inputSchema: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "The new room description text. Replaces the existing description entirely.",
        },
      },
      required: ["description"],
    },
    handler: "handleOverrideRoomDescription",
  },

  // -- Checks and saves -----------------------------------------------------

  {
    name: "request_check",
    description:
      "Ask the server to run an ability check or skill check for a specific player. " +
      "You set the DC and which ability to use; the server rolls the d20, applies the " +
      "player's modifier and proficiency bonus (if a skill is specified and the character " +
      "is proficient), and returns the result including the natural roll, total, margin " +
      "(how much they passed/failed by), and whether the check succeeded. You can grant " +
      "advantage or impose disadvantage based on circumstances. You then narrate the " +
      "outcome. The server handles all the math.",
    inputSchema: {
      type: "object",
      properties: {
        player_id: playerIdProperty,
        ability: abilityProperty,
        dc: dcProperty,
        skill: {
          type: "string",
          description:
            "Optional skill name for a skill check (e.g., 'perception', 'stealth', " +
            "'persuasion', 'athletics', 'arcana', 'investigation'). If provided and the " +
            "character is proficient, their proficiency bonus is added to the roll.",
        },
        advantage: advantageProperty,
        disadvantage: disadvantageProperty,
      },
      required: ["player_id", "ability", "dc"],
    },
    handler: "handleRequestCheck",
  },

  {
    name: "request_save",
    description:
      "Force a player to make a saving throw. The server rolls the d20 and applies " +
      "the player's ability modifier (plus proficiency if they have saving throw " +
      "proficiency). Natural 20 always succeeds, natural 1 always fails. You can grant " +
      "advantage (e.g. resistance aura) or impose disadvantage (e.g. restrained condition). " +
      "Use this for traps, environmental hazards, spell effects, and any situation where " +
      "the character is resisting an effect. You narrate the consequence based on the result.",
    inputSchema: {
      type: "object",
      properties: {
        player_id: playerIdProperty,
        ability: abilityProperty,
        dc: dcProperty,
        advantage: advantageProperty,
        disadvantage: disadvantageProperty,
      },
      required: ["player_id", "ability", "dc"],
    },
    handler: "handleRequestSave",
  },

  {
    name: "request_group_check",
    description:
      "All party members make the same ability check simultaneously. The server rolls " +
      "for each player and returns individual results plus an overall outcome (majority " +
      "rules: if at least half succeed, the group succeeds). You can grant advantage or " +
      "impose disadvantage on the entire group (e.g. advantage from a helpful spell, " +
      "disadvantage from poor visibility). Use this for situations where the whole party " +
      "is affected — sneaking past guards, navigating treacherous terrain, resisting an " +
      "area effect.",
    inputSchema: {
      type: "object",
      properties: {
        ability: abilityProperty,
        dc: dcProperty,
        skill: {
          type: "string",
          description:
            "Optional skill name for the group check (e.g., 'stealth', 'perception'). " +
            "Proficiency is applied per-character based on their individual proficiencies.",
        },
        advantage: advantageProperty,
        disadvantage: disadvantageProperty,
      },
      required: ["ability", "dc"],
    },
    handler: "handleRequestGroupCheck",
  },

  {
    name: "request_contested_check",
    description:
      "Two characters make opposing ability checks — e.g. grapple (Athletics vs " +
      "Athletics/Acrobatics), shove (Athletics vs Athletics/Acrobatics), or hiding " +
      "(Stealth vs Perception). Each character rolls their respective ability check; " +
      "the higher total wins. Ties go to the initiator (player 1). Returns both rolls, " +
      "totals, the margin between them, and the winner.",
    inputSchema: {
      type: "object",
      properties: {
        player_id_1: {
          ...playerIdProperty,
          description: "The initiating character (wins ties). Use get_party_state() for IDs.",
        },
        ability_1: {
          ...abilityProperty,
          description: "The ability score for player 1's check.",
        },
        skill_1: {
          type: "string",
          description: "Optional skill for player 1 (e.g. 'athletics'). Adds proficiency if proficient.",
        },
        advantage_1: {
          ...advantageProperty,
          description: "Grant advantage to player 1.",
        },
        disadvantage_1: {
          ...disadvantageProperty,
          description: "Impose disadvantage on player 1.",
        },
        player_id_2: {
          ...playerIdProperty,
          description: "The opposing character.",
        },
        ability_2: {
          ...abilityProperty,
          description: "The ability score for player 2's check.",
        },
        skill_2: {
          type: "string",
          description: "Optional skill for player 2 (e.g. 'acrobatics'). Adds proficiency if proficient.",
        },
        advantage_2: {
          ...advantageProperty,
          description: "Grant advantage to player 2.",
        },
        disadvantage_2: {
          ...disadvantageProperty,
          description: "Impose disadvantage on player 2.",
        },
      },
      required: ["player_id_1", "ability_1", "player_id_2", "ability_2"],
    },
    handler: "handleRequestContestedCheck",
  },

  // -- Environmental damage -------------------------------------------------

  {
    name: "deal_environment_damage",
    description:
      "Inflict damage from a trap, hazard, or environmental effect on a player. The " +
      "damage goes through the rules engine — the server parses the dice notation, " +
      "rolls the damage, applies it to the player's HP, and handles any consequences " +
      "(unconsciousness, death saves). You narrate the trap or hazard; the server does " +
      "the math. A DM can narrate 'the ceiling collapses' but the actual damage comes " +
      "from this tool through the rules engine.",
    inputSchema: {
      type: "object",
      properties: {
        player_id: playerIdProperty,
        notation: {
          type: "string",
          description:
            "Dice notation for the damage (e.g., '2d6', '3d8+4', '1d10'). The server " +
            "parses and rolls this using the dice engine.",
        },
        type: {
          type: "string",
          description: "The type of damage being dealt.",
          enum: [
            "bludgeoning",
            "piercing",
            "slashing",
            "fire",
            "cold",
            "lightning",
            "acid",
            "poison",
            "necrotic",
            "radiant",
            "force",
            "psychic",
            "thunder",
          ] as const,
        },
      },
      required: ["player_id", "notation", "type"],
    },
    handler: "handleDealEnvironmentDamage",
  },

  // -- Scene management -----------------------------------------------------

  {
    name: "advance_scene",
    description:
      "Transition the party to the next room or area in the dungeon. The server updates " +
      "the party's location, marks the new room as visited, and reveals its description " +
      "and features. If no room ID is provided, the server returns available exits and " +
      "you can let the players choose, or call again with a specific room. Use this to " +
      "pace the adventure — advance when the current room is fully explored, after combat " +
      "ends, or when the story demands a scene change. The session must not be in combat " +
      "phase to advance.",
    inputSchema: {
      type: "object",
      properties: {
        next_room_id: {
          type: "string",
          description:
            "The ID of the room to move to. Must be connected to the current room via " +
            "a discovered, non-locked passage. If omitted, the server returns available " +
            "exits without moving the party.",
        },
      },
      required: [],
    },
    handler: "handleAdvanceScene",
  },

  // -- State inspection -----------------------------------------------------

  {
    name: "get_party_state",
    description:
      "Retrieve the full state of every party member: current and max HP, AC, spell " +
      "slots (current/max for each level), active conditions (poisoned, stunned, etc.), " +
      "equipped items, and inventory. Use this before spawning encounters to calibrate " +
      "difficulty — if the party is low on HP and spell slots, maybe ease up. Use it " +
      "after combat to see who needs healing. This is your primary tool for reading the " +
      "mechanical state of the party. No parameters needed.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    handler: "handleGetPartyState",
  },

  {
    name: "get_room_state",
    description:
      "Get details about the current room: room name, description, type, environmental " +
      "features, active monsters (with HP and conditions), present NPCs, available exits, " +
      "and any ongoing effects. During combat, this also includes the initiative order and " +
      "whose turn it is. Use this to stay oriented — especially after spawning encounters " +
      "or when players interact with room features.",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    handler: "handleGetRoomState",
  },

  // -- Rewards --------------------------------------------------------------

  {
    name: "award_xp",
    description:
      "Award experience points to the party. The server distributes the XP evenly " +
      "among all living party members and handles level-up checks automatically. If any " +
      "character levels up, the server returns that information so you can narrate the " +
      "milestone. Typical XP values: easy encounter 50-100, medium 100-200, hard 200-400, " +
      "boss 500+. Also award XP for clever puzzle solutions and good roleplay.",
    inputSchema: {
      type: "object",
      properties: {
        amount: {
          type: "integer",
          description:
            "Total XP to award to the party. This amount is split evenly among living " +
            "party members. Must be a positive integer.",
          minimum: 1,
        },
      },
      required: ["amount"],
    },
    handler: "handleAwardXp",
  },

  {
    name: "award_gold",
    description:
      "Award gold to the party or a specific player. If player_id is omitted, gold is split " +
      "evenly among all party members. Use negative amounts to deduct gold (e.g., for purchases). " +
      "Gold persists across sessions in campaigns.",
    inputSchema: {
      type: "object",
      properties: {
        amount: {
          type: "integer",
          description: "Amount of gold to award (positive) or deduct (negative).",
        },
        player_id: {
          type: "string",
          description: "Optional: award to a specific player (e.g., 'char-1'). If omitted, splits among party.",
        },
      },
      required: ["amount"],
    },
    handler: "handleAwardGold",
  },

  {
    name: "award_loot",
    description:
      "Give an item, gold, or both to a player character. Items must exist in the server's " +
      "item data files (weapons, armor, potions, scrolls, magic items). Use this after combat, " +
      "when searching rooms, or as quest rewards. At least one of item_name or gold must be provided.",
    inputSchema: {
      type: "object",
      properties: {
        player_id: {
          ...playerIdProperty,
          description: "The ID of the player receiving the loot.",
        },
        item_name: {
          type: "string",
          description:
            "The name of the item to award, from the server's item data files " +
            "(e.g., 'Potion of Healing', 'Longsword', 'Chain Mail', 'Scroll of Magic Missile').",
        },
        gold: {
          type: "integer",
          description: "Amount of gold to award alongside or instead of an item.",
          minimum: 1,
        },
      },
      required: ["player_id"],
    },
    handler: "handleAwardLoot",
  },

  {
    name: "loot_room",
    description:
      "Roll the current room's pre-placed loot table and award the result to a player. " +
      "Dungeon templates define loot tables for specific rooms (treasure rooms, storage caves, etc.). " +
      "Use get_room_state to check if the current room has a loot table. Each room can only be " +
      "looted once. The server rolls on the weighted loot table and adds the items to the " +
      "player's inventory. For manual loot awards, use award_loot instead.",
    inputSchema: {
      type: "object",
      properties: {
        player_id: {
          ...playerIdProperty,
          description: "The ID of the player who receives the loot.",
        },
      },
      required: ["player_id"],
    },
    handler: "handleLootRoom",
  },

  // -- Item catalog ---------------------------------------------------------

  {
    name: "list_items",
    description:
      "List all available items in the game, optionally filtered by category. " +
      "Use this to browse what items exist before awarding loot with award_loot. " +
      "Returns item names, categories, descriptions, and stats.",
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description:
            "Optional. Filter items by category. If omitted, returns all items.",
          enum: ["weapon", "armor", "potion", "scroll", "magic_item", "misc"] as const,
        },
      },
      required: [],
    },
    handler: "handleListItems",
  },

  // -- Session control ------------------------------------------------------

  {
    name: "end_session",
    description:
      "End the current adventure session. Provide a summary of what happened — key events, " +
      "battles fought, discoveries made, story progress. The server uses this summary to " +
      "generate adventure journal entries, distribute final XP, and transition the party to " +
      "'between_sessions' status. After this call, each player agent gets a chance to write " +
      "their personal journal entry. Call this when the dungeon is completed, the party is " +
      "TPK'd, or at a natural stopping point in a longer campaign.",
    inputSchema: {
      type: "object",
      properties: {
        summary: {
          type: "string",
          description:
            "A narrative summary of the session. Include major events, combat outcomes, " +
            "loot found, NPCs encountered, and story developments. This becomes part of " +
            "the permanent adventure record and is shown to spectators on the website.",
        },
        completed_dungeon: {
          type: "string",
          description:
            "Name of the dungeon completed this session (if any). Tracked on the campaign record. " +
            "Only set this if the dungeon was actually completed, not abandoned mid-run.",
        },
      },
      required: ["summary"],
    },
    handler: "handleEndSession",
  },
  {
    name: "start_campaign_session",
    description:
      "Start a new session for an existing campaign. The party reconvenes with their " +
      "current character state (level, HP, gold, inventory, spell slots). A new dungeon " +
      "is generated and the party enters it. Use this after end_session to continue a " +
      "multi-session campaign. Requires an active campaign (use create_campaign first).",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
    handler: "handleStartCampaignSession",
  },

  // -- Custom monster creation -----------------------------------------------

  {
    name: "create_custom_monster",
    description:
      "Create a custom monster template at runtime. The monster becomes available for " +
      "spawn_encounter by name. Use this for unique bosses, story-specific creatures, or " +
      "monsters not in the standard data files. The template persists for this server session.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Unique name for the monster template (e.g., 'Corrupted Treant', 'Goblin Shaman').",
        },
        hp_max: {
          type: "integer",
          description: "Maximum hit points.",
          minimum: 1,
        },
        ac: {
          type: "integer",
          description: "Armor class.",
          minimum: 1,
        },
        attacks: {
          type: "array",
          description: "List of attacks the monster can make.",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Attack name (e.g., 'Claw', 'Fire Breath')." },
              damage: { type: "string", description: "Damage notation (e.g., '2d6+3')." },
              to_hit: { type: "integer", description: "Attack bonus to hit." },
              type: { type: "string", description: "Damage type (e.g., 'fire', 'slashing'). Defaults to 'slashing'." },
              recharge: { type: "integer", description: "Recharges on d6 >= this value at start of turn (e.g., 5 = recharge 5-6). Classic dragon breath pattern.", minimum: 2, maximum: 6 },
              aoe: { type: "boolean", description: "If true, hits all players (each makes a save instead of attack roll)." },
              save_dc: { type: "integer", description: "DC for save-based attacks. Required if aoe is true." },
              save_ability: { type: "string", description: "Ability for save (e.g., 'dex', 'con'). Defaults to 'dex'.", enum: ["str", "dex", "con", "int", "wis", "cha"] },
            },
            required: ["name", "damage", "to_hit"],
          },
          minItems: 1,
        },
        ability_scores: {
          type: "object",
          description: "Optional ability scores. Defaults to all 10s.",
          properties: {
            str: { type: "integer" }, dex: { type: "integer" }, con: { type: "integer" },
            int: { type: "integer" }, wis: { type: "integer" }, cha: { type: "integer" },
          },
        },
        vulnerabilities: {
          type: "array",
          description: "Damage types the monster is vulnerable to (double damage).",
          items: { type: "string" },
        },
        immunities: {
          type: "array",
          description: "Damage types the monster is immune to (no damage).",
          items: { type: "string" },
        },
        resistances: {
          type: "array",
          description: "Damage types the monster resists (half damage).",
          items: { type: "string" },
        },
        special_abilities: {
          type: "array",
          description: "Named special abilities with descriptions.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
            },
            required: ["name", "description"],
          },
        },
        xp_value: {
          type: "integer",
          description: "XP awarded on kill. Defaults to an estimate based on HP and AC.",
          minimum: 0,
        },
        loot_table: {
          type: "array",
          description: "Weighted loot table for drops on kill.",
          items: {
            type: "object",
            properties: {
              item_name: { type: "string" },
              weight: { type: "integer", minimum: 1 },
              quantity: { type: "integer", minimum: 1 },
            },
            required: ["item_name", "weight", "quantity"],
          },
        },
      },
      required: ["name", "hp_max", "ac", "attacks"],
    },
    handler: "handleCreateCustomMonster",
  },
  {
    name: "list_monster_templates",
    description:
      "List all available monster templates (both built-in and custom). Shows name, HP, AC, XP, and attack names. " +
      "Use this to see what monsters are available for spawn_encounter.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: "handleListCustomMonsters",
  },
  {
    name: "create_campaign",
    description:
      "Create a multi-session campaign for the current party. Tracks story flags, completed dungeons, " +
      "and session count across sessions. A party can only have one active campaign at a time.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Campaign name (e.g., 'The Curse of Ashenmoor')." },
        description: { type: "string", description: "Brief description of the campaign's premise and goals." },
      },
      required: ["name"],
    },
    handler: "handleCreateCampaign",
  },
  {
    name: "get_campaign",
    description:
      "Get the current campaign briefing — name, description, session count, completed dungeons, story flags, " +
      "and party composition. Use at the start of a session to understand campaign context.",
    inputSchema: {
      type: "object",
      properties: {},
    },
    handler: "handleGetCampaign",
  },
  {
    name: "set_story_flag",
    description:
      "Set a story flag on the current campaign. Story flags track narrative state across sessions — " +
      "e.g., 'rescued_merchant: true', 'goblin_chief_dead: true', 'faction_reputation: 3'. " +
      "Use any key/value pair. Persists across sessions.",
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string", description: "Flag name (e.g., 'rescued_merchant', 'dragon_egg_found')." },
        value: { type: "string", description: "Flag value (string, number, or boolean as string)." },
      },
      required: ["key", "value"],
    },
    handler: "handleSetStoryFlag",
  },

  // -- NPC Management ---------------------------------------------------------

  {
    name: "create_npc",
    description:
      "Create a persistent NPC for the current campaign. NPCs remember interactions across " +
      "sessions and have a disposition that shifts based on party actions. Use this for named " +
      "characters the party will interact with more than once — tavern keepers, quest givers, " +
      "rivals, faction leaders. For one-off background characters, just use narrate instead.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "The NPC's name (e.g., 'Elara the Merchant', 'Captain Voss').",
        },
        description: {
          type: "string",
          description: "Physical appearance and role (e.g., 'A weathered dwarf blacksmith with soot-stained hands').",
        },
        personality: {
          type: "string",
          description: "Speech patterns, mannerisms, motivations (e.g., 'Gruff but fair. Speaks in short sentences. Secretly fears fire.').",
        },
        location: {
          type: "string",
          description: "Where the NPC is currently found (e.g., 'Ironforge Smithy', 'Room 3').",
        },
        disposition: {
          type: "integer",
          description: "Starting disposition toward the party. -100 (hostile) to +100 (devoted). Default 0 (neutral).",
          minimum: -100,
          maximum: 100,
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Searchable tags (e.g., ['merchant', 'quest_giver', 'faction_ironhand']).",
        },
      },
      required: ["name", "description"],
    },
    handler: "handleCreateNpc",
  },
  {
    name: "get_npc",
    description:
      "Get full details about a specific NPC including their description, personality, " +
      "disposition, location, and recent memory of interactions with the party.",
    inputSchema: {
      type: "object",
      properties: {
        npc_id: {
          type: "string",
          description: "The NPC's ID (from create_npc or list_npcs).",
        },
      },
      required: ["npc_id"],
    },
    handler: "handleGetNpc",
  },
  {
    name: "list_npcs",
    description:
      "List all NPCs in the current campaign. Optionally filter by tag or location.",
    inputSchema: {
      type: "object",
      properties: {
        tag: {
          type: "string",
          description: "Filter by tag (e.g., 'merchant', 'quest_giver').",
        },
        location: {
          type: "string",
          description: "Filter by current location.",
        },
      },
    },
    handler: "handleListNpcs",
  },
  {
    name: "update_npc",
    description:
      "Update an NPC's description, personality, location, tags, or alive status. " +
      "Use this when NPCs move, change, or die during the story.",
    inputSchema: {
      type: "object",
      properties: {
        npc_id: {
          type: "string",
          description: "The NPC's ID.",
        },
        description: {
          type: "string",
          description: "Updated description.",
        },
        personality: {
          type: "string",
          description: "Updated personality notes.",
        },
        location: {
          type: "string",
          description: "New location (empty string to clear).",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description: "Replacement tags array.",
        },
        is_alive: {
          type: "boolean",
          description: "Set to false if the NPC dies.",
        },
      },
      required: ["npc_id"],
    },
    handler: "handleUpdateNpc",
  },
  {
    name: "update_npc_disposition",
    description:
      "Shift an NPC's disposition toward the party. Disposition ranges from -100 (hostile) " +
      "to +100 (devoted). Labels: hostile (<=-50), unfriendly (-49 to -25), wary (-24 to -1), " +
      "neutral (0), friendly (1-25), allied (26-50), devoted (>50). " +
      "Provide a reason — it becomes part of the NPC's memory.",
    inputSchema: {
      type: "object",
      properties: {
        npc_id: {
          type: "string",
          description: "The NPC's ID.",
        },
        change: {
          type: "integer",
          description: "Disposition change (positive = more friendly, negative = more hostile). Typical: +5 to +15 for good deeds, -5 to -15 for offenses.",
        },
        reason: {
          type: "string",
          description: "Why the disposition changed (e.g., 'Party rescued her son', 'Player stole from his shop').",
        },
      },
      required: ["npc_id", "change", "reason"],
    },
    handler: "handleUpdateNpcDisposition",
  },

  // -- Quest Tracking ---------------------------------------------------------

  {
    name: "add_quest",
    description:
      "Add a quest or objective to the campaign tracker. Quests persist across sessions " +
      "and appear in the campaign briefing. Use this when the party receives a new quest, " +
      "mission, or objective from an NPC, discovery, or event.",
    inputSchema: {
      type: "object",
      properties: {
        title: {
          type: "string",
          description: "Short quest title (e.g., 'Rescue the Blacksmith's Daughter', 'Clear the Goblin Warren').",
        },
        description: {
          type: "string",
          description: "Quest details — what needs to be done, where, and why.",
        },
        giver_npc_id: {
          type: "string",
          description: "ID of the NPC who gave this quest (from create_npc). Optional.",
        },
      },
      required: ["title", "description"],
    },
    handler: "handleAddQuest",
  },
  {
    name: "update_quest",
    description:
      "Update a quest's status or description. Mark quests as completed when the party " +
      "fulfills the objective, or failed if they can no longer complete it.",
    inputSchema: {
      type: "object",
      properties: {
        quest_id: {
          type: "string",
          description: "The quest ID (from add_quest or list_quests).",
        },
        status: {
          type: "string",
          enum: ["active", "completed", "failed"],
          description: "New quest status.",
        },
        description: {
          type: "string",
          description: "Updated description (e.g., to add new information the party discovered).",
        },
      },
      required: ["quest_id"],
    },
    handler: "handleUpdateQuest",
  },
  {
    name: "list_quests",
    description:
      "List all quests in the current campaign, optionally filtered by status.",
    inputSchema: {
      type: "object",
      properties: {
        status: {
          type: "string",
          enum: ["active", "completed", "failed"],
          description: "Filter by quest status. Omit to see all quests.",
        },
      },
    },
    handler: "handleListQuests",
  },
] as const;

// ---------------------------------------------------------------------------
// Helper: look up a tool by name
// ---------------------------------------------------------------------------

/**
 * Find a DM tool definition by name.
 * Returns undefined if the tool does not exist.
 */
export function getDmTool(name: string): ToolDefinition | undefined {
  return dmTools.find((t) => t.name === name);
}

/**
 * Get all DM tool names, useful for validation and discovery responses.
 */
export function getDmToolNames(): string[] {
  return dmTools.map((t) => t.name);
}
