/**
 * Fable sprint GAP 4 — story export: one readable markdown story per session
 * (backlog item 16, "Exportable format (Markdown)").
 *
 *  - composeStoryMarkdown (pure): title/cast/scene-splitting/beats/epilogue
 *  - GET /spectator/sessions/:id/story.md — in-memory (live-session) path,
 *    exercised end-to-end through real gameplay handlers
 */
import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import spectator from "../src/api/spectator.ts";
import { composeStoryMarkdown, type StoryEvent } from "../src/game/story-export.ts";
import {
  handleCreateCharacter,
  handleQueueForParty,
  handleDMQueueForParty,
  handleNarrate,
  handleAdvanceScene,
  handleSpawnEncounter,
  getState,
} from "../src/game/game-manager.ts";
import type { AbilityScores } from "../src/types.ts";

const app = new Hono();
app.route("/spectator", spectator);

let counter = 0;
function uid(prefix: string) {
  return `story-${prefix}-${++counter}-${Date.now()}`;
}

const T0 = new Date("2026-07-01T20:00:00Z");
function at(minutes: number): Date {
  return new Date(T0.getTime() + minutes * 60_000);
}

function ev(type: string, data: Record<string, unknown>, minutes: number, actorId: string | null = null): StoryEvent {
  return { type, actorId, data, timestamp: at(minutes) };
}

describe("composeStoryMarkdown (pure)", () => {
  const meta = {
    sessionId: "s-1",
    partyName: "The Bloodforged Vanguard",
    summary: "The bandit fortress fell, but Vossa fell with it.",
    outcome: "victory",
    startedAt: T0,
    endedAt: at(23),
    isActive: false,
    dmMetadata: { worldDescription: "A rain-lashed border fort", tone: "grim" },
    members: [
      { name: "Korgath", race: "half-orc", class: "fighter", level: 2, isAlive: true, model: "anthropic/claude-opus-4-6" },
      { name: "Vossa", race: "halfling", class: "rogue", level: 2, isAlive: false, model: "openai/gpt-5.4" },
    ],
  };

  const events: StoryEvent[] = [
    ev("narration", { text: "Rain hammers the gatehouse.", narrateType: "scene" }, 1),
    ev("chat", { speakerName: "Vossa", message: "I don't like this quiet." }, 2),
    ev("room_enter", { roomName: "The Courtyard", roomId: "room-2", revisit: false }, 3),
    ev("combat_start", { monsters: [{ name: "Bandit" }, { name: "Hobgoblin Captain" }] }, 4),
    ev("attack", { attackerName: "Korgath", targetName: "Hobgoblin Captain", hit: true, critical: true, damage: 22 }, 5),
    ev("death_save", { characterName: "Vossa", naturalRoll: 3, success: false, deathSaves: { successes: 0, failures: 3 }, dead: true }, 6),
    ev("combat_end", {}, 7),
    ev("room_enter", { roomName: "The Gatehouse", roomId: "room-1", revisit: true }, 8),
    ev("narration", { text: "They carry her back the way they came.", narrateType: "scene" }, 9),
    ev("session_end", { summary: "The bandit fortress fell, but Vossa fell with it." }, 10),
    // noise that must NOT appear
    ev("turn_auto_advanced", { reason: "unconscious_stable", characterName: "Vossa" }, 5.5),
    ev("autopilot_action", { action: "dodge" }, 5.7),
  ];

  const narrations = [
    { content: "The rain does not care who wins.", createdAt: at(4.5) },
  ];

  const md = composeStoryMarkdown(meta, [...events].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()), narrations);

  test("title, world line and cast with models and death dagger", () => {
    expect(md).toContain("# The Bloodforged Vanguard");
    expect(md).toContain("*A rain-lashed border fort*");
    expect(md).toContain("- **Korgath** (half-orc fighter, level 2) — played by anthropic/claude-opus-4-6");
    expect(md).toContain("- **Vossa** † (halfling rogue, level 2) — played by openai/gpt-5.4");
  });

  test("scenes split on room_enter with revisit marker", () => {
    expect(md).toContain("## Scene 1 — The Adventure Begins");
    expect(md).toContain("## Scene 2 — The Courtyard");
    expect(md).toContain("## Scene 3 — The Gatehouse (return)");
    // Order: courtyard scene comes after scene 1 content
    expect(md.indexOf("## Scene 1")).toBeLessThan(md.indexOf("## Scene 2"));
    expect(md.indexOf("## Scene 2")).toBeLessThan(md.indexOf("## Scene 3"));
  });

  test("prose, dialogue, beats, narrator blockquote and death line all render", () => {
    expect(md).toContain("Rain hammers the gatehouse.");
    expect(md).toContain('**Vossa:** "I don\'t like this quiet."');
    expect(md).toContain("*Steel is drawn — Bandit, Hobgoblin Captain.*");
    expect(md).toContain("*Korgath lands a CRITICAL hit on Hobgoblin Captain — 22 damage.*");
    expect(md).toContain("**Vossa fails the final death save. Vossa is dead.**");
    expect(md).toContain("> The rain does not care who wins.");
  });

  test("epilogue carries the summary; mechanical noise is excluded", () => {
    expect(md).toContain("## Epilogue");
    expect(md).toContain("The bandit fortress fell, but Vossa fell with it.");
    expect(md).not.toContain("turn_auto_advanced");
    expect(md).not.toContain("autopilot");
    expect(md).not.toContain("unconscious_stable");
  });

  test("in-progress session gets the still-in-progress note", () => {
    const live = composeStoryMarkdown(
      { ...meta, endedAt: null, isActive: true, summary: null },
      events.filter((e) => e.type !== "session_end"),
      []
    );
    expect(live).toContain("still in progress");
  });
});

describe("GET /spectator/sessions/:id/story.md (in-memory live session)", () => {
  test("exports a real session's story straight from gameplay handlers", async () => {
    const scores: AbilityScores = { str: 14, dex: 14, con: 14, int: 10, wis: 10, cha: 10 };
    const pids = [uid("p"), uid("p"), uid("p"), uid("p")];
    const dmId = uid("dm");
    for (const pid of pids) {
      const r = await handleCreateCharacter(pid, {
        name: `Hero-${pid.slice(-8)}`,
        race: "human",
        class: "fighter",
        ability_scores: scores,
        avatar_url: "https://example.com/test-avatar.png",
      });
      expect(r.success).toBe(true);
      handleQueueForParty(pid);
    }
    expect(handleDMQueueForParty(dmId).success).toBe(true);

    const partyId = [...getState().parties.keys()].pop()!;
    const party = getState().parties.get(partyId)!;
    const sessionId = party.session!.id;

    // Play a little story
    handleNarrate(dmId, { text: `The torches gutter as the company descends ${counter}.`, type: "scene" });
    const exitsRes = handleAdvanceScene(dmId, {});
    const exits = (exitsRes.data!.exits as { id: string; type: string }[]).filter((e) => e.type !== "locked");
    handleAdvanceScene(dmId, { next_room_id: exits[0]!.id });
    handleSpawnEncounter(dmId, { monsters: [{ template_name: "Goblin", count: 1 }] });

    const res = await app.request(`/spectator/sessions/${sessionId}/story.md`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/markdown");

    const md = await res.text();
    expect(md).toContain(`# ${party.name}`); // party title
    expect(md).toContain("## The Company"); // cast from live members
    expect(md).toContain("The torches gutter"); // DM prose
    expect(md).toContain("*Steel is drawn"); // combat beat
    expect(md).toContain("## Scene"); // scene structure
    expect(md).toContain("still in progress"); // live session note
  });

  test("unknown session returns 404", async () => {
    const res = await app.request(`/spectator/sessions/definitely-not-a-session/story.md`);
    expect(res.status).toBe(404);
  });
});
