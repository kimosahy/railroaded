import { describe, expect, test } from "bun:test";
import {
  GENRE_OPTIONS,
  ART_TONE_OPTIONS,
  deriveGateConditions,
  isAllGreen,
} from "../web/src/app/theater/setup/[id]/setup-client";
import {
  AVATAR_GRID_CLASS,
  AVATAR_IMG_CLASS,
  AVATAR_LOCKED_CLASS,
} from "../web/src/app/theater/setup/[id]/avatar-panel";
import type { SessionSetup } from "../src/theater/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fakeSetup(overrides: Partial<SessionSetup> = {}): SessionSetup {
  return {
    schema: "session_setup.v1",
    session_id: "S1",
    title: "Fake",
    episode: { season: 1, episode: 1 },
    genre: "fantasy",
    art_tone: "watercolor",
    world_params: {},
    style_lock: {
      prompt_suffix: "ink",
      negative_prompt: "blur",
      aspect: "16:9",
      model: "imagen-test",
    },
    agents: [],
    ...overrides,
  };
}

type Agent = SessionSetup["agents"][number];
function player(id: string, opts: Partial<Agent> = {}): Agent {
  return {
    agent_id: id,
    role: "player",
    model: "claude-sonnet-test",
    character_name: `char-${id}`,
    class: "fighter",
    avatar_passport: null,
    ...opts,
  };
}
function dm(id: string): Agent {
  return {
    agent_id: id,
    role: "dm",
    model: "claude-opus-test",
    character_name: null,
    class: null,
    avatar_passport: null,
  };
}

// ─── §10.1 VERBATIM: pill option lists ────────────────────────────────────────

describe("Genre + art-tone option lists §10.1 VERBATIM", () => {
  test("genre: 8 pills in spec order", () => {
    expect([...GENRE_OPTIONS]).toEqual([
      "fantasy", "scifi", "noir", "horror", "western",
      "historical", "cyberpunk", "mythology",
    ]);
  });
  test("art tone: 8 pills in spec order", () => {
    expect([...ART_TONE_OPTIONS]).toEqual([
      "hyperrealistic", "cartoonish", "watercolor", "pixel art",
      "noir b&w", "cel-shaded", "claymation", "goblin sketch",
    ]);
  });
});

// ─── PillSelector dual-select prevention (ATLAS-020 FIF-1) ────────────────────

describe("PillSelector dual-select logic", () => {
  // Re-derive `isCustomSelected` exactly as the component does.
  const isCustomSelected = (showCustomInput: boolean, selected: string | null, customValue: string) =>
    showCustomInput && selected === customValue;

  test("preset selected, custom input closed → custom not selected", () => {
    expect(isCustomSelected(false, "fantasy", "")).toBe(false);
  });
  test("clicking custom clears preset → only custom can be lit", () => {
    // After clicking custom, parent calls onSelect(customValue || "") → selected becomes ""
    // PillSelector sets showCustomInput true. selected ("") matches customValue ("") → custom lit.
    expect(isCustomSelected(true, "", "")).toBe(true);
  });
  test("no dual-lit: when custom shown but selected differs from customValue, custom NOT lit", () => {
    expect(isCustomSelected(true, "fantasy", "myGenre")).toBe(false);
  });
  test("custom typed → selected === customValue → custom lit, presets not lit", () => {
    expect(isCustomSelected(true, "myGenre", "myGenre")).toBe(true);
  });
});

// ─── Avatar 256×256 enforcement (ATLAS-020 BLOCKER-2) ─────────────────────────

describe("Avatar grid 256×256 enforcement §10.2", () => {
  test("grid uses [repeat(3,16rem)] tracks", () => {
    expect(AVATAR_GRID_CLASS).toContain("grid-cols-[repeat(3,16rem)]");
    expect(AVATAR_GRID_CLASS).toContain("gap-3");
    expect(AVATAR_GRID_CLASS).toContain("overflow-x-auto");
  });
  test("each candidate img is w-64 h-64 (256px)", () => {
    expect(AVATAR_IMG_CLASS).toContain("w-64");
    expect(AVATAR_IMG_CLASS).toContain("h-64");
  });
  test("locked-state collapses to w-24 h-24 (96×96)", () => {
    expect(AVATAR_LOCKED_CLASS).toContain("w-24");
    expect(AVATAR_LOCKED_CLASS).toContain("h-24");
  });
});

// ─── Gate derivation §10.5 + ATLAS-020 minor 1 ────────────────────────────────

describe("deriveGateConditions — 5-condition gate §10.5", () => {
  test("zero players → allAvatarsLocked auto-true", () => {
    const c = deriveGateConditions({
      sessionSetup: fakeSetup({ agents: [dm("DM1")] }),
      avatarLocks: new Map(),
      genre: null,
      artTone: null,
      dmKeyVerified: false,
      initialLocationDeclared: false,
    });
    expect(c.allAvatarsLocked).toBe(true);
  });

  test("DM-only is not counted in player gate", () => {
    const c = deriveGateConditions({
      sessionSetup: fakeSetup({ agents: [dm("DM1"), player("P1")] }),
      avatarLocks: new Map([["P1", true]]), // DM has no lock entry but is excluded
      genre: "fantasy",
      artTone: "watercolor",
      dmKeyVerified: true,
      initialLocationDeclared: true,
    });
    expect(c.allAvatarsLocked).toBe(true);
  });

  test("any player unlocked → allAvatarsLocked false", () => {
    const c = deriveGateConditions({
      sessionSetup: fakeSetup({ agents: [player("P1"), player("P2")] }),
      avatarLocks: new Map([["P1", true]]),
      genre: "fantasy",
      artTone: "watercolor",
      dmKeyVerified: true,
      initialLocationDeclared: true,
    });
    expect(c.allAvatarsLocked).toBe(false);
  });

  test("genre empty string → genreAndArtTone false", () => {
    const c = deriveGateConditions({
      sessionSetup: fakeSetup(),
      avatarLocks: new Map(),
      genre: "",
      artTone: "watercolor",
      dmKeyVerified: false,
      initialLocationDeclared: false,
    });
    expect(c.genreAndArtTone).toBe(false);
  });

  test("genre null → genreAndArtTone false", () => {
    const c = deriveGateConditions({
      sessionSetup: fakeSetup(),
      avatarLocks: new Map(),
      genre: null,
      artTone: "watercolor",
      dmKeyVerified: false,
      initialLocationDeclared: false,
    });
    expect(c.genreAndArtTone).toBe(false);
  });

  test("both genre and artTone non-empty → genreAndArtTone true", () => {
    const c = deriveGateConditions({
      sessionSetup: fakeSetup(),
      avatarLocks: new Map(),
      genre: "fantasy",
      artTone: "watercolor",
      dmKeyVerified: false,
      initialLocationDeclared: false,
    });
    expect(c.genreAndArtTone).toBe(true);
  });

  test("styleLockConfirmed auto-derived from style_lock presence (ATLAS-020 BLOCKER-1)", () => {
    const withLock = deriveGateConditions({
      sessionSetup: fakeSetup(),
      avatarLocks: new Map(),
      genre: null,
      artTone: null,
      dmKeyVerified: false,
      initialLocationDeclared: false,
    });
    expect(withLock.styleLockConfirmed).toBe(true);

    // Forcing style_lock to null cast to satisfy type; checking the runtime path.
    const noLock = deriveGateConditions({
      sessionSetup: { ...fakeSetup(), style_lock: null as unknown as SessionSetup["style_lock"] },
      avatarLocks: new Map(),
      genre: null,
      artTone: null,
      dmKeyVerified: false,
      initialLocationDeclared: false,
    });
    expect(noLock.styleLockConfirmed).toBe(false);
  });

  test("DM key + initial location pass through verbatim", () => {
    const c = deriveGateConditions({
      sessionSetup: fakeSetup(),
      avatarLocks: new Map(),
      genre: null,
      artTone: null,
      dmKeyVerified: true,
      initialLocationDeclared: true,
    });
    expect(c.dmKeyVerified).toBe(true);
    expect(c.initialLocationDeclared).toBe(true);
  });
});

describe("isAllGreen — gate launch readiness", () => {
  test("all 5 true → green", () => {
    expect(isAllGreen({
      genreAndArtTone: true,
      allAvatarsLocked: true,
      dmKeyVerified: true,
      styleLockConfirmed: true,
      initialLocationDeclared: true,
    })).toBe(true);
  });
  test("any false → red", () => {
    const base = {
      genreAndArtTone: true,
      allAvatarsLocked: true,
      dmKeyVerified: true,
      styleLockConfirmed: true,
      initialLocationDeclared: true,
    };
    for (const k of Object.keys(base) as Array<keyof typeof base>) {
      expect(isAllGreen({ ...base, [k]: false })).toBe(false);
    }
  });
});
