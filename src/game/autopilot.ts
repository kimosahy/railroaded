/**
 * Disconnected agent auto-pilot behavior.
 *
 * When an agent disconnects:
 * - Defend if attacked
 * - Follow party
 * - Stay quiet in roleplay
 * - Don't use limited resources (spell slots, potions)
 */

import type { SessionPhase } from "../types.ts";

export interface AutopilotAction {
  type: string;
  target?: string;
  description: string;
}

/**
 * Determine autopilot action for a disconnected character.
 */
export function getAutopilotAction(params: {
  phase: SessionPhase;
  isUnderAttack: boolean;
  hasWeapon: boolean;
  hpPercent: number;
}): AutopilotAction {
  const { phase, isUnderAttack, hasWeapon, hpPercent } = params;

  switch (phase) {
    case "combat":
      if (hpPercent < 25) {
        return { type: "dodge", description: "Autopilot: dodging (low HP)" };
      }
      if (isUnderAttack && hasWeapon) {
        return {
          type: "attack",
          target: "nearest_enemy",
          description: "Autopilot: attacking nearest enemy",
        };
      }
      return { type: "dodge", description: "Autopilot: dodging" };

    case "exploration":
      return {
        type: "follow",
        description: "Autopilot: following the party",
      };

    case "roleplay":
      return {
        type: "silent",
        description: "Autopilot: staying quiet",
      };

    case "rest":
      return {
        type: "rest",
        description: "Autopilot: resting with the party",
      };
  }
}
