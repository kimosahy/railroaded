/**
 * Adventure journal generation from session logs.
 */

export interface SessionEvent {
  type: string;
  actorId: string | null;
  data: Record<string, unknown>;
  timestamp: Date;
}

export interface JournalEntry {
  characterId: string;
  characterName: string;
  sessionId: string;
  content: string;
}

/**
 * Generate a summary of session events for journal purposes.
 * This creates a structured event log that a DM or player agent
 * can use to write their own journal entry.
 */
export function summarizeSession(events: SessionEvent[]): string {
  const lines: string[] = [];

  for (const event of events) {
    switch (event.type) {
      case "narration":
        lines.push(`[Narration] ${event.data.text}`);
        break;
      case "combat_start":
        lines.push(`[Combat] Encounter began!`);
        break;
      case "attack": {
        const hit = event.data.hit ? "Hit" : "Miss";
        lines.push(
          `[Combat] ${event.data.attackerName} attacked ${event.data.targetName}: ${hit}${event.data.damage ? ` for ${event.data.damage} damage` : ""}`
        );
        break;
      }
      case "spell_cast":
        lines.push(
          `[Magic] ${event.data.casterName} cast ${event.data.spellName}${event.data.targetName ? ` on ${event.data.targetName}` : ""}`
        );
        break;
      case "death":
        lines.push(`[Death] ${event.data.characterName} has fallen!`);
        break;
      case "heal":
        lines.push(
          `[Heal] ${event.data.healerName} healed ${event.data.targetName} for ${event.data.amount} HP`
        );
        break;
      case "chat":
        lines.push(`[Chat] ${event.data.speakerName}: "${event.data.message}"`);
        break;
      case "npc_dialogue":
        lines.push(`[NPC] ${event.data.npcName}: "${event.data.dialogue}"`);
        break;
      case "room_enter":
        lines.push(`[Exploration] Party entered: ${event.data.roomName}`);
        break;
      case "loot":
        lines.push(
          `[Loot] ${event.data.characterName} received ${event.data.itemName}`
        );
        break;
      case "rest":
        lines.push(`[Rest] Party took a ${event.data.restType} rest`);
        break;
      case "combat_end":
        lines.push(`[Combat] Encounter resolved`);
        break;
      case "session_end":
        lines.push(`[Session End] ${event.data.summary ?? "The adventure continues..."}`);
        break;
      default:
        lines.push(`[${event.type}] ${JSON.stringify(event.data)}`);
    }
  }

  return lines.join("\n");
}

/**
 * Filter events relevant to a specific character.
 */
export function filterEventsForCharacter(
  events: SessionEvent[],
  characterId: string
): SessionEvent[] {
  return events.filter((e) => {
    // Always include narration, room changes, session events
    if (
      ["narration", "room_enter", "session_end", "combat_start", "combat_end"].includes(
        e.type
      )
    ) {
      return true;
    }
    // Include events where this character is the actor
    if (e.actorId === characterId) return true;
    // Include events targeting this character
    if (e.data.targetId === characterId) return true;
    // Include party chat
    if (e.type === "chat" || e.type === "npc_dialogue") return true;
    // Include loot for this character
    if (e.type === "loot" && e.data.characterId === characterId) return true;
    return false;
  });
}
