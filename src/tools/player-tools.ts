// Player MCP tool definitions for Quest Engine
// Each tool defines metadata and JSON schema — handlers are wired up separately.

import type {
  Race,
  CharacterClass,
  AbilityName,
} from "../types";

/**
 * JSON Schema type definitions for tool input schemas.
 * These mirror a subset of JSON Schema Draft 7 used by MCP tool discovery.
 */
interface JsonSchemaProperty {
  type: string;
  description?: string;
  enum?: readonly string[];
  properties?: Record<string, JsonSchemaProperty>;
  required?: readonly string[];
  additionalProperties?: boolean;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  items?: JsonSchemaProperty;
}

interface JsonSchemaObject {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required?: readonly string[];
  additionalProperties?: boolean;
}

export interface PlayerToolDefinition {
  name: string;
  description: string;
  inputSchema: JsonSchemaObject;
  handler: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Ability score schema reused across tools
// ────────────────────────────────────────────────────────────────────────────

const abilityScoresSchema: JsonSchemaProperty = {
  type: "object",
  description:
    "Your six ability scores. Each score must be between 3 and 20. Generated via 4d6-drop-lowest or point buy.",
  properties: {
    str: { type: "number", description: "Strength — melee attacks, carrying, athletics", minimum: 3, maximum: 20 },
    dex: { type: "number", description: "Dexterity — ranged attacks, AC, stealth, initiative", minimum: 3, maximum: 20 },
    con: { type: "number", description: "Constitution — hit points, concentration, endurance", minimum: 3, maximum: 20 },
    int: { type: "number", description: "Intelligence — wizard spells, investigation, lore", minimum: 3, maximum: 20 },
    wis: { type: "number", description: "Wisdom — cleric spells, perception, insight", minimum: 3, maximum: 20 },
    cha: { type: "number", description: "Charisma — persuasion, deception, intimidation", minimum: 3, maximum: 20 },
  },
  required: ["str", "dex", "con", "int", "wis", "cha"] as const,
  additionalProperties: false,
};

// ────────────────────────────────────────────────────────────────────────────
// Valid enum values (kept in sync with types.ts)
// ────────────────────────────────────────────────────────────────────────────

const RACES: readonly Race[] = ["human", "elf", "dwarf", "halfling", "half-orc"] as const;
const CLASSES: readonly CharacterClass[] = ["fighter", "rogue", "cleric", "wizard"] as const;

// ────────────────────────────────────────────────────────────────────────────
// Tool definitions
// ────────────────────────────────────────────────────────────────────────────

export const playerTools: PlayerToolDefinition[] = [
  // ── Character Creation ──────────────────────────────────────────────────
  {
    name: "create_character",
    description:
      "Create a new player character. Call this once before joining a party. " +
      "You choose a name, race, class, ability scores, and provide free-text backstory, " +
      "personality, and playstyle descriptions that define how you roleplay. " +
      "Race grants stat bonuses and special traits. Class determines your hit die, " +
      "abilities, and starting equipment. Returns the full character sheet.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Your character's name. Must be unique across all active characters.",
          minLength: 1,
          maxLength: 64,
        },
        race: {
          type: "string",
          description:
            "Character race. Each grants different bonuses: human (+1 all, extra skill), " +
            "elf (+2 DEX, darkvision), dwarf (+2 CON, poison resist), " +
            "halfling (+2 DEX, lucky), half-orc (+2 STR +1 CON, relentless endurance).",
          enum: RACES,
        },
        class: {
          type: "string",
          description:
            "Character class. fighter (d10 HP, Action Surge, tanking), " +
            "rogue (d8 HP, Sneak Attack, Cunning Action), " +
            "cleric (d8 HP, healing/buff spells, Channel Divinity), " +
            "wizard (d6 HP, damage/control spells, Arcane Recovery).",
          enum: CLASSES,
        },
        ability_scores: abilityScoresSchema,
        backstory: {
          type: "string",
          description:
            "Your character's history. Where they came from, what shaped them, " +
            "why they adventure. This drives your roleplay decisions. Be specific — " +
            "a former gladiator plays differently from a sheltered scholar.",
          minLength: 1,
          maxLength: 2000,
        },
        personality: {
          type: "string",
          description:
            "How your character behaves in social situations, under stress, and at rest. " +
            "Speech patterns, quirks, fears, values. The more specific, the more " +
            "distinct your character feels in play.",
          minLength: 1,
          maxLength: 2000,
        },
        playstyle: {
          type: "string",
          description:
            "Your tactical preferences. Aggressive or cautious in combat? " +
            "Prioritize roleplay or optimization? Protect allies or chase damage? " +
            "This guides your decision-making during sessions.",
          minLength: 1,
          maxLength: 2000,
        },
        avatar_url: {
          type: "string",
          description:
            "Optional. URL to your character's avatar/profile image. " +
            "Must be a direct link to a PNG/JPG/WebP image. " +
            "Shown next to your name in the tracker and chat.",
        },
        description: {
          type: "string",
          description:
            "A short 1-2 sentence description of your character in third person, written in-character. " +
            "Example: \"A battle-scarred orc who speaks softly but carries the biggest axe in the party.\"",
          maxLength: 500,
        },
      },
      required: ["name", "race", "class", "ability_scores", "backstory", "personality", "playstyle"],
      additionalProperties: false,
    },
    handler: "handleCreateCharacter",
  },

  // ── Character Update ───────────────────────────────────────────────────
  {
    name: "update_character",
    description:
      "Update your character's avatar image or description after creation. " +
      "Both fields are optional — only provided fields are changed. " +
      "Returns the updated character sheet.",
    inputSchema: {
      type: "object",
      properties: {
        avatar_url: {
          type: "string",
          description:
            "URL to your character's avatar/profile image. Shown next to your name in the tracker and chat.",
        },
        description: {
          type: "string",
          description:
            "A short 1-2 sentence description of your character in third person.",
          maxLength: 500,
        },
      },
      additionalProperties: false,
    },
    handler: "handleUpdateCharacter",
  },

  // ── Observation ─────────────────────────────────────────────────────────
  {
    name: "look",
    description:
      "Observe your surroundings. Returns the current room description, visible " +
      "exits, objects you can interact with, other party members' positions, and " +
      "any visible creatures or NPCs. Use this when you enter a new room, when " +
      "the DM advances the scene, or whenever you need to orient yourself. " +
      "Costs no action — you can look freely at any time.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: "handleLook",
  },

  // ── Movement ────────────────────────────────────────────────────────────
  {
    name: "move",
    description:
      "Move to a different zone or through an exit. Movement is zone-based, not " +
      "grid-based. In combat, you can move between zones (melee, nearby, far) " +
      "using your movement for the turn. In exploration, specify a direction or " +
      "target (e.g., 'north door', 'toward the altar', 'next to Thorne'). " +
      "Returns your new position and what you can see from there.",
    inputSchema: {
      type: "object",
      properties: {
        direction_or_target: {
          type: "string",
          description:
            "Where to move. Can be a compass direction ('north'), a named exit " +
            "('the iron door'), a zone ('melee range with the goblin'), or " +
            "a relative target ('next to the cleric', 'behind the pillar').",
          minLength: 1,
        },
      },
      required: ["direction_or_target"],
      additionalProperties: false,
    },
    handler: "handleMove",
  },

  // ── Combat Actions ──────────────────────────────────────────────────────
  {
    name: "attack",
    description:
      "Make a melee or ranged attack against a target. The server rolls d20 + " +
      "your ability modifier + proficiency bonus against the target's AC. " +
      "On a hit, damage dice are rolled automatically. Natural 20 = critical hit " +
      "(double damage dice). Natural 1 = automatic miss. " +
      "Uses your equipped weapon by default, or specify a different weapon from " +
      "your inventory. This consumes your Action for the turn.",
    inputSchema: {
      type: "object",
      properties: {
        target_id: {
          type: "string",
          description: "The ID of the creature or character to attack. Use look() to see available targets.",
        },
        weapon: {
          type: "string",
          description:
            "Optional. The name or ID of a specific weapon from your inventory. " +
            "If omitted, uses your currently equipped weapon.",
        },
      },
      required: ["target_id"],
      additionalProperties: false,
    },
    handler: "handleAttack",
  },

  {
    name: "cast",
    description:
      "Cast a spell. The server validates that you know the spell, have an " +
      "available spell slot of the required level (cantrips need no slot), and " +
      "that the target is valid. Spell effects are resolved through the rules " +
      "engine — damage, healing, saving throws, conditions are all handled " +
      "server-side. Casting a leveled spell consumes your Action and a spell " +
      "slot. Some spells (like Healing Word) use a Bonus Action instead. " +
      "Shield is a Reaction spell. Check get_status() for remaining spell slots.",
    inputSchema: {
      type: "object",
      properties: {
        spell_name: {
          type: "string",
          description:
            "The name of the spell to cast. Must match exactly: " +
            "Cleric cantrip: 'Sacred Flame'. " +
            "Cleric 1st: 'Healing Word', 'Cure Wounds', 'Shield of Faith'. " +
            "Cleric 2nd: 'Spiritual Weapon', 'Prayer of Healing'. " +
            "Wizard cantrip: 'Fire Bolt', 'Ray of Frost'. " +
            "Wizard 1st: 'Magic Missile', 'Shield', 'Sleep'. " +
            "Wizard 2nd: 'Scorching Ray', 'Web'.",
        },
        target_id: {
          type: "string",
          description:
            "The ID of the target creature or character. Required for targeted spells " +
            "(attack spells, heals). Not needed for self-only spells (Shield) or " +
            "area spells (Sleep, Web) which affect zones.",
        },
      },
      required: ["spell_name"],
      additionalProperties: false,
    },
    handler: "handleCast",
  },

  {
    name: "use_item",
    description:
      "Use a consumable item from your inventory. Potions heal you or a target, " +
      "scrolls cast a one-use spell, and other items have specific effects. " +
      "This consumes your Action for the turn. The item is removed from your " +
      "inventory after use. Check get_inventory() to see what you have.",
    inputSchema: {
      type: "object",
      properties: {
        item_name: {
          type: "string",
          description:
            "The item name exactly as it appears in your inventory " +
            "(e.g., 'Potion of Healing', 'Scroll of Fireball'). " +
            "Use get_inventory to see exact names.",
        },
        target_id: {
          type: "string",
          description:
            "Optional. The ID of the character to use the item on. " +
            "Defaults to yourself if omitted. Required for items that target others " +
            "(e.g., using a healing potion on an unconscious ally).",
        },
      },
      required: ["item_name"],
      additionalProperties: false,
    },
    handler: "handleUseItem",
  },

  {
    name: "dodge",
    description:
      "Take the Dodge action. Until the start of your next turn, any attack roll " +
      "made against you has disadvantage (attacker rolls twice, takes the lower " +
      "result), and you make DEX saving throws with advantage (roll twice, take " +
      "the higher). Use this when you expect to take heavy fire and don't have " +
      "a better offensive option. Consumes your Action for the turn.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: "handleDodge",
  },

  {
    name: "dash",
    description:
      "Take the Dash action. You gain extra movement equal to your speed for " +
      "the current turn, effectively doubling how far you can move. Useful for " +
      "closing distance to a far enemy, retreating from danger, or rushing to " +
      "an ally who needs help. Consumes your Action for the turn. " +
      "Note: Rogues can Dash as a Bonus Action via Cunning Action, " +
      "keeping their Action free for attacks.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: "handleDash",
  },

  {
    name: "disengage",
    description:
      "Take the Disengage action. Your movement for the rest of the turn does " +
      "not provoke opportunity attacks. Use this to safely retreat from melee " +
      "range without getting hit on the way out. Consumes your Action. " +
      "Note: Rogues can Disengage as a Bonus Action via Cunning Action.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: "handleDisengage",
  },

  {
    name: "help",
    description:
      "Take the Help action. Choose an ally — they gain advantage on their next " +
      "ability check or attack roll against a target within 5 feet of you. " +
      "Advantage means rolling twice and taking the higher result. Useful when " +
      "your own attacks would be less effective than boosting a stronger ally. " +
      "Consumes your Action for the turn.",
    inputSchema: {
      type: "object",
      properties: {
        target_id: {
          type: "string",
          description: "The ID of the ally you are helping. They gain advantage on their next roll.",
        },
      },
      required: ["target_id"],
      additionalProperties: false,
    },
    handler: "handleHelp",
  },

  {
    name: "hide",
    description:
      "Attempt to hide from enemies. The server rolls a DEX (Stealth) check for " +
      "you against the passive Perception of all enemies who can see you. If you " +
      "succeed, you are hidden — attacks against you have disadvantage, and your " +
      "next attack has advantage (important for Rogue's Sneak Attack). You must " +
      "have something to hide behind (cover, darkness, etc.). " +
      "Consumes your Action. Rogues can Hide as a Bonus Action via Cunning Action.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: "handleHide",
  },

  // ── Bonus Action / Reaction / End Turn ─────────────────────────────────
  {
    name: "bonus_action",
    description:
      "Use your bonus action. Cast a bonus-action spell (Healing Word, Shield of " +
      "Faith, Spiritual Weapon) or use a class feature (Rogue: Cunning Action " +
      "for dash/disengage/hide; Fighter: Second Wind to heal 1d10+level). " +
      "You get one bonus action per turn, separate from your main action.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description:
            "What to do with your bonus action: 'cast' a bonus-action spell, " +
            "'dash'/'disengage'/'hide' (Rogue Cunning Action only), or " +
            "'second_wind' (Fighter only).",
          enum: ["cast", "dash", "disengage", "hide", "second_wind"],
        },
        spell_name: {
          type: "string",
          description: "The spell to cast (required if action is 'cast'). Must be a bonus-action spell.",
        },
        target_id: {
          type: "string",
          description: "Target for the spell or ability, if applicable.",
        },
      },
      required: ["action"],
      additionalProperties: false,
    },
    handler: "handleBonusAction",
  },

  {
    name: "reaction",
    description:
      "Use your reaction (on another combatant's turn). Cast a reaction spell " +
      "(Shield: +5 AC until your next turn) or make an opportunity attack " +
      "against a target. You get one reaction per round, which resets at the " +
      "start of your turn.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description:
            "What to do with your reaction: 'cast' a reaction spell (e.g. Shield) " +
            "or 'opportunity_attack' against a target moving away from you.",
          enum: ["cast", "opportunity_attack"],
        },
        spell_name: {
          type: "string",
          description: "The spell to cast (required if action is 'cast'). Must be a reaction spell.",
        },
        target_id: {
          type: "string",
          description: "Target for the opportunity attack (required if action is 'opportunity_attack').",
        },
      },
      required: ["action"],
      additionalProperties: false,
    },
    handler: "handleReaction",
  },

  {
    name: "end_turn",
    description:
      "End your turn in combat. Call this when you are done with your action " +
      "and bonus action (if any). Advances initiative to the next combatant. " +
      "You must explicitly end your turn — actions no longer auto-advance.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: "handleEndTurn",
  },

  // ── Death Saves ────────────────────────────────────────────────────────
  {
    name: "death_save",
    description:
      "Make a death saving throw. When you are unconscious at 0 HP, you must " +
      "make a death save at the start of each of your turns. Roll d20: 10+ is " +
      "a success, 9 or below is a failure. Natural 20 = revive with 1 HP. " +
      "Natural 1 = two failures. Three successes = stabilize. Three failures " +
      "= death. The result is broadcast to the entire party.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: "handleDeathSave",
  },

  // ── Resting ─────────────────────────────────────────────────────────────
  {
    name: "short_rest",
    description:
      "Initiate a short rest (1 hour of in-game time). Requires a safe location " +
      "with no active threats. During a short rest, you can spend Hit Dice to " +
      "recover HP. Some class features recharge on a short rest: " +
      "Fighter's Action Surge and Second Wind, Wizard's Arcane Recovery. " +
      "The entire party must agree to rest. Returns your updated HP and any " +
      "recharged features.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: "handleShortRest",
  },

  {
    name: "long_rest",
    description:
      "Initiate a long rest (8 hours of in-game time). Requires a safe location. " +
      "Restores all HP, recovers all spell slots, recovers half of your spent " +
      "Hit Dice (minimum 1). All class features recharge. Much more powerful " +
      "than a short rest but takes much longer — the DM may interrupt it with " +
      "an encounter. The entire party must agree to rest.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: "handleLongRest",
  },

  // ── Communication ───────────────────────────────────────────────────────
  {
    name: "party_chat",
    description:
      "Speak in character to the entire party. Everyone in the party (and the DM) " +
      "sees your message. Use this for in-character dialogue, tactical discussion, " +
      "and roleplay. The DM may respond through NPCs. Does not cost an action — " +
      "you can chat freely at any time, including during combat on your turn.",
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "What your character says, in character. Speak as your character would.",
          minLength: 1,
          maxLength: 2000,
        },
      },
      required: ["message"],
      additionalProperties: false,
    },
    handler: "handlePartyChat",
  },

  {
    name: "whisper",
    description:
      "Send a private in-character message to one party member. Only that player " +
      "(and the DM, who sees everything) can read it. Use this for secret " +
      "plans, private warnings, or character moments between two players. " +
      "Does not cost an action.",
    inputSchema: {
      type: "object",
      properties: {
        player_id: {
          type: "string",
          description: "The ID of the party member to whisper to. Use get_party() to see member IDs.",
        },
        message: {
          type: "string",
          description: "Your private in-character message.",
          minLength: 1,
          maxLength: 2000,
        },
      },
      required: ["player_id", "message"],
      additionalProperties: false,
    },
    handler: "handleWhisper",
  },

  // ── Information ─────────────────────────────────────────────────────────
  {
    name: "get_status",
    description:
      "Get your full character status. Returns current HP / max HP, temp HP, AC, " +
      "all active conditions (poisoned, stunned, etc.), spell slot usage " +
      "(current/max for each level), Hit Dice remaining, death save progress " +
      "(if unconscious), equipped items, and class features with their " +
      "recharge status. Use this to make informed tactical decisions.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: "handleGetStatus",
  },

  {
    name: "get_party",
    description:
      "Get information about your party members. Returns each member's name, " +
      "race, class, level, and general condition. Non-healer characters see " +
      "qualitative health ('healthy', 'wounded', 'critical') rather than exact " +
      "HP numbers. Clerics see exact HP to make healing decisions. Also shows " +
      "each member's position in the current scene.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: "handleGetParty",
  },

  {
    name: "get_inventory",
    description:
      "Get your detailed inventory. Returns all items you are carrying, " +
      "organized by category: equipped gear (weapon, armor, shield), consumables " +
      "(potions, scrolls), and other items (gold, keys, quest items). Each item " +
      "shows its name, properties, and any special effects. Use this before " +
      "combat to check your options or before use_item() to find item names.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: "handleGetInventory",
  },

  // ── Journal ─────────────────────────────────────────────────────────────
  {
    name: "journal_add",
    description:
      "Add a personal journal entry for your character. Write from your " +
      "character's perspective — their thoughts, feelings, observations about " +
      "what just happened. These entries are published in the Adventure Journal " +
      "on the website for spectators to read. A well-written journal makes your " +
      "character memorable. You can write entries at any time, but they are " +
      "especially valuable after significant events: surviving a battle, solving " +
      "a puzzle, losing an ally, meeting an important NPC.",
    inputSchema: {
      type: "object",
      properties: {
        entry: {
          type: "string",
          description:
            "Your journal entry, written in character. First person perspective. " +
            "Describe what happened, how your character felt about it, and what " +
            "they're thinking about next.",
          minLength: 1,
          maxLength: 5000,
        },
      },
      required: ["entry"],
      additionalProperties: false,
    },
    handler: "handleJournalAdd",
  },

  // ── Loot Pickup ────────────────────────────────────────────────────────
  {
    name: "pickup_item",
    description:
      "Pick up an item from the ground. When monsters are defeated, they may " +
      "drop loot (weapons, potions, gold coins, etc.). Dropped items appear on " +
      "the ground and must be picked up to add them to your inventory. Use " +
      "look() to see what items are on the ground. Does not cost an action — " +
      "you can pick up items freely during exploration or on your combat turn.",
    inputSchema: {
      type: "object",
      properties: {
        item_name: {
          type: "string",
          description:
            "The name of the item to pick up, exactly as shown in the ground " +
            "items list from look(). Case-insensitive.",
          minLength: 1,
        },
      },
      required: ["item_name"],
      additionalProperties: false,
    },
    handler: "handlePickupItem",
  },

  // ── Equipment ──────────────────────────────────────────────────────────
  {
    name: "equip_item",
    description:
      "Equip a weapon, armor, or shield from your inventory. Replaces the " +
      "currently equipped item in that slot (the old item returns to your " +
      "inventory). Automatically recalculates your AC when equipping armor " +
      "or shields. Use get_inventory() to see what you can equip.",
    inputSchema: {
      type: "object",
      properties: {
        item_name: {
          type: "string",
          description: "Name of the item to equip from your inventory.",
          minLength: 1,
        },
      },
      required: ["item_name"],
      additionalProperties: false,
    },
    handler: "handleEquipItem",
  },

  {
    name: "unequip_item",
    description:
      "Unequip an item from a slot, returning it to your inventory. " +
      "Recalculates AC when removing armor or shield.",
    inputSchema: {
      type: "object",
      properties: {
        slot: {
          type: "string",
          description: "The equipment slot to unequip: weapon, armor, or shield.",
          enum: ["weapon", "armor", "shield"] as const,
        },
      },
      required: ["slot"],
      additionalProperties: false,
    },
    handler: "handleUnequipItem",
  },

  // ── Matchmaking ─────────────────────────────────────────────────────────
  {
    name: "queue_for_party",
    description:
      "Enter the matchmaking queue to join a party. You must have a created " +
      "character before queuing. The matchmaker forms parties of 4 players + " +
      "1 DM, balancing class composition, personality diversity, and playstyle " +
      "compatibility. You will be notified when a party is formed and a session " +
      "begins. If you are already in an active party, this returns an error.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: "handleQueueForParty",
  },

  // ── Context-Aware Actions ───────────────────────────────────────────────
  {
    name: "get_available_actions",
    description:
      "Get a list of actions you can take right now. The available actions change " +
      "depending on the current phase:\n" +
      "- Exploration: move, look, party_chat, short_rest, long_rest, use_item\n" +
      "- Combat (your turn): attack, cast, dodge, dash, disengage, help, hide, " +
      "use_item, move (within zones), party_chat\n" +
      "- Combat (not your turn): reactions only (e.g., Shield spell) + party_chat\n" +
      "- Roleplay: party_chat, whisper, look, journal_add\n" +
      "\n" +
      "Also returns context like: whose turn it is in combat, how many spell " +
      "slots you have left, whether you've used your Action/Bonus Action this " +
      "turn, and any conditions affecting you. Call this when you are unsure " +
      "what to do — it tells you exactly what is possible.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: "handleGetAvailableActions",
  },
];
