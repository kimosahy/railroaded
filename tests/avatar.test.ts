/**
 * Tests for avatar_url and description fields on characters.
 */
import { describe, test, expect } from "bun:test";
import {
  handleCreateCharacter,
  getCharacterForUser,
  handleGetStatus,
  handleGetInventory,
  handlePartyChat,
  handleQueueForParty,
  handleDMQueueForParty,
} from "../src/game/game-manager.ts";
import type { AbilityScores } from "../src/types.ts";

const scores: AbilityScores = { str: 14, dex: 12, con: 13, int: 10, wis: 10, cha: 8 };

describe("avatar_url and description fields", () => {
  test("character creation accepts avatar_url and description", () => {
    const result = handleCreateCharacter("avatar-user-1", {
      name: "AvatarHero",
      race: "human",
      class: "fighter",
      ability_scores: scores,
      avatar_url: "https://example.com/avatar.png",
      description: "A grizzled veteran with a scar across his left eye.",
    });
    expect(result.success).toBe(true);
    expect(result.character!.avatarUrl).toBe("https://example.com/avatar.png");
    expect(result.character!.description).toBe("A grizzled veteran with a scar across his left eye.");
  });

  test("avatar_url and description are optional (default to null)", () => {
    const result = handleCreateCharacter("avatar-user-2", {
      name: "NoAvatarHero",
      race: "elf",
      class: "wizard",
      ability_scores: scores,
    });
    expect(result.success).toBe(true);
    expect(result.character!.avatarUrl).toBeNull();
    expect(result.character!.description).toBeNull();
  });

  test("avatar_url can be omitted while description is provided", () => {
    const result = handleCreateCharacter("avatar-user-3", {
      name: "DescOnlyHero",
      race: "dwarf",
      class: "cleric",
      ability_scores: scores,
      description: "A stout dwarf who hums hymns while swinging a warhammer.",
    });
    expect(result.success).toBe(true);
    expect(result.character!.avatarUrl).toBeNull();
    expect(result.character!.description).toBe("A stout dwarf who hums hymns while swinging a warhammer.");
  });

  test("fields persist on the in-memory character", () => {
    const char = getCharacterForUser("avatar-user-1");
    expect(char).not.toBeNull();
    expect(char!.avatarUrl).toBe("https://example.com/avatar.png");
    expect(char!.description).toBe("A grizzled veteran with a scar across his left eye.");
  });

  test("chat event includes avatarUrl", () => {
    // Form a party so chat works
    handleCreateCharacter("avatar-user-4", { name: "ChatAvatar1", race: "human", class: "rogue", ability_scores: scores, avatar_url: "https://example.com/rogue.png" });
    handleCreateCharacter("avatar-user-5", { name: "ChatAvatar2", race: "halfling", class: "fighter", ability_scores: scores });
    handleCreateCharacter("avatar-user-6", { name: "ChatAvatar3", race: "elf", class: "cleric", ability_scores: scores });
    handleCreateCharacter("avatar-user-7", { name: "ChatAvatar4", race: "dwarf", class: "wizard", ability_scores: scores });
    handleQueueForParty("avatar-user-4");
    handleQueueForParty("avatar-user-5");
    handleQueueForParty("avatar-user-6");
    handleQueueForParty("avatar-user-7");
    handleDMQueueForParty("avatar-dm-1");

    const result = handlePartyChat("avatar-user-4", { message: "Hello party!" });
    expect(result.success).toBe(true);
    expect(result.data!.speaker).toBe("ChatAvatar1");
    expect(result.data!.avatarUrl).toBe("https://example.com/rogue.png");
  });

  test("chat event avatarUrl is null when not set", () => {
    const result = handlePartyChat("avatar-user-5", { message: "I have no avatar." });
    expect(result.success).toBe(true);
    expect(result.data!.avatarUrl).toBeNull();
  });
});
