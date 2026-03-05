/**
 * Tests for avatar_url and description fields on characters.
 */
import { describe, test, expect } from "bun:test";
import {
  handleCreateCharacter,
  handleUpdateCharacter,
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
  test("character creation accepts avatar_url and description", async () => {
    const result = await handleCreateCharacter("avatar-user-1", {
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

  test("character creation without avatar fails", async () => {
    const result = await handleCreateCharacter("avatar-user-2", {
      name: "NoAvatarHero",
      race: "elf",
      class: "wizard",
      ability_scores: scores,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Avatar is required");
  });

  test("character creation with description but no avatar fails", async () => {
    const result = await handleCreateCharacter("avatar-user-3", {
      name: "DescOnlyHero",
      race: "dwarf",
      class: "cleric",
      ability_scores: scores,
      description: "A stout dwarf who hums hymns while swinging a warhammer.",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Avatar is required");
  });

  test("fields persist on the in-memory character", () => {
    const char = getCharacterForUser("avatar-user-1");
    expect(char).not.toBeNull();
    expect(char!.avatarUrl).toBe("https://example.com/avatar.png");
    expect(char!.description).toBe("A grizzled veteran with a scar across his left eye.");
  });

  test("chat event includes avatarUrl", async () => {
    // Form a party so chat works
    await handleCreateCharacter("avatar-user-4", { name: "ChatAvatar1", race: "human", class: "rogue", ability_scores: scores, avatar_url: "https://example.com/rogue.png" });
    await handleCreateCharacter("avatar-user-5", { name: "ChatAvatar2", race: "halfling", class: "fighter", ability_scores: scores, avatar_url: "https://example.com/test-avatar.png" });
    await handleCreateCharacter("avatar-user-6", { name: "ChatAvatar3", race: "elf", class: "cleric", ability_scores: scores, avatar_url: "https://example.com/test-avatar.png" });
    await handleCreateCharacter("avatar-user-7", { name: "ChatAvatar4", race: "dwarf", class: "wizard", ability_scores: scores, avatar_url: "https://example.com/test-avatar.png" });
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

  test("chat event avatarUrl is present when set", () => {
    const result = handlePartyChat("avatar-user-5", { message: "I have an avatar now." });
    expect(result.success).toBe(true);
    expect(result.data!.avatarUrl).toBe("https://example.com/test-avatar.png");
  });
});

describe("handleUpdateCharacter", () => {
  test("update both avatar_url and description", async () => {
    await handleCreateCharacter("upd-user-1", {
      name: "UpdateBoth",
      race: "human",
      class: "fighter",
      ability_scores: scores,
      avatar_url: "https://example.com/old.png",
      description: "Old description.",
    });
    const result = await handleUpdateCharacter("upd-user-1", {
      avatar_url: "https://example.com/new.png",
      description: "New description.",
    });
    expect(result.success).toBe(true);
    const char = result.data!.character as Record<string, unknown>;
    expect(char.avatarUrl).toBe("https://example.com/new.png");
    expect(char.description).toBe("New description.");
  });

  test("update only avatar_url — description unchanged", async () => {
    await handleCreateCharacter("upd-user-2", {
      name: "UpdateAvatar",
      race: "elf",
      class: "wizard",
      ability_scores: scores,
      avatar_url: "https://example.com/test-avatar.png",
      description: "Stays the same.",
    });
    const result = await handleUpdateCharacter("upd-user-2", {
      avatar_url: "https://example.com/elf.png",
    });
    expect(result.success).toBe(true);
    const char = result.data!.character as Record<string, unknown>;
    expect(char.avatarUrl).toBe("https://example.com/elf.png");
    expect(char.description).toBe("Stays the same.");
  });

  test("update only description — avatar_url unchanged", async () => {
    await handleCreateCharacter("upd-user-3", {
      name: "UpdateDesc",
      race: "dwarf",
      class: "cleric",
      ability_scores: scores,
      avatar_url: "https://example.com/dwarf.png",
    });
    const result = await handleUpdateCharacter("upd-user-3", {
      description: "A new description for the dwarf.",
    });
    expect(result.success).toBe(true);
    const char = result.data!.character as Record<string, unknown>;
    expect(char.avatarUrl).toBe("https://example.com/dwarf.png");
    expect(char.description).toBe("A new description for the dwarf.");
  });

  test("update with no character returns error", async () => {
    const result = await handleUpdateCharacter("upd-user-nonexistent", {
      avatar_url: "https://example.com/nope.png",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("No character found");
  });

  test("other fields unchanged after update", async () => {
    await handleCreateCharacter("upd-user-4", {
      name: "StableFields",
      race: "halfling",
      class: "rogue",
      ability_scores: scores,
      avatar_url: "https://example.com/halfling.png",
      description: "A sneaky halfling.",
    });
    const before = getCharacterForUser("upd-user-4")!;
    const hpBefore = before.hpCurrent;
    const acBefore = before.ac;
    const levelBefore = before.level;

    await handleUpdateCharacter("upd-user-4", { description: "An even sneakier halfling." });

    const after = getCharacterForUser("upd-user-4")!;
    expect(after.hpCurrent).toBe(hpBefore);
    expect(after.ac).toBe(acBefore);
    expect(after.level).toBe(levelBefore);
    expect(after.name).toBe("StableFields");
    expect(after.description).toBe("An even sneakier halfling.");
  });
});
