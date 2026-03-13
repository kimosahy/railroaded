import { describe, test, expect } from "bun:test";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const audioJs = readFileSync(join(__dirname, "../website/audio.js"), "utf-8");
const trackerHtml = readFileSync(join(__dirname, "../website/tracker.html"), "utf-8");
const sessionHtml = readFileSync(join(__dirname, "../website/session.html"), "utf-8");
const themeCss = readFileSync(join(__dirname, "../website/theme.css"), "utf-8");

describe("audio.js sound effects module", () => {
  test("audio.js file exists", () => {
    expect(existsSync(join(__dirname, "../website/audio.js"))).toBe(true);
  });

  test("exposes RailroadedAudio global API", () => {
    expect(audioJs).toContain("window.RailroadedAudio");
    expect(audioJs).toContain("playForEvent");
    expect(audioJs).toContain("isEnabled");
    expect(audioJs).toContain("setEnabled");
    expect(audioJs).toContain("setVolume");
    expect(audioJs).toContain("getVolume");
  });

  test("is OFF by default", () => {
    // enabled should only be true if localStorage explicitly says so
    expect(audioJs).toContain("localStorage.getItem('audio-enabled') === 'true'");
  });

  test("persists enabled state to localStorage", () => {
    expect(audioJs).toContain("localStorage.setItem('audio-enabled'");
  });

  test("persists volume to localStorage", () => {
    expect(audioJs).toContain("localStorage.setItem('audio-volume'");
  });

  test("uses Web Audio API", () => {
    expect(audioJs).toContain("AudioContext");
    expect(audioJs).toContain("createOscillator");
    expect(audioJs).toContain("createGain");
  });

  test("has sound function for combat_start", () => {
    expect(audioJs).toContain("playCombatStart");
    expect(audioJs).toContain("combat_start");
  });

  test("has sound function for critical hits", () => {
    expect(audioJs).toContain("playCriticalHit");
    expect(audioJs).toContain("critical_hit");
  });

  test("has sound function for character death", () => {
    expect(audioJs).toContain("playDeath");
    expect(audioJs).toContain("death");
  });

  test("has sound function for victory/dungeon cleared (fanfare)", () => {
    expect(audioJs).toContain("playFanfare");
    expect(audioJs).toContain("combat_end");
  });

  test("has sound function for room enter", () => {
    expect(audioJs).toContain("playRoomEnter");
    expect(audioJs).toContain("room_enter");
  });

  test("detects critical hits from attack event data", () => {
    // Should check d.critical on attack/monster_attack events
    expect(audioJs).toMatch(/eventType\s*===\s*'attack'.*d\.critical|d\.critical.*eventType\s*===\s*'attack'/);
  });

  test("does not play when disabled", () => {
    expect(audioJs).toContain("if (!enabled) return");
  });

  test("creates toggle UI next to theme button", () => {
    expect(audioJs).toContain("theme-toggle");
    expect(audioJs).toContain("audio-toggle");
    expect(audioJs).toContain("audio-toggle-btn");
  });

  test("toggle shows speaker icons", () => {
    // 🔊 and 🔇
    expect(audioJs).toContain("\uD83D\uDD0A");
    expect(audioJs).toContain("\uD83D\uDD07");
  });

  test("has volume slider in dropdown", () => {
    expect(audioJs).toContain("audio-slider");
    expect(audioJs).toContain("audio-dropdown");
    expect(audioJs).toContain('type="range"');
  });

  test("volume is clamped between 0 and 1", () => {
    expect(audioJs).toContain("Math.max(0, Math.min(1,");
  });
});

describe("tracker.html audio integration", () => {
  test("includes audio.js script", () => {
    expect(trackerHtml).toContain('<script src="audio.js"></script>');
  });

  test("plays sound on new live party events", () => {
    expect(trackerHtml).toContain("RailroadedAudio.playForEvent");
  });

  test("plays sound only for new events (not historical)", () => {
    // Sound should be triggered after newEvents are detected in refresh
    const refreshPartyFn = trackerHtml.slice(
      trackerHtml.indexOf("async function refreshSelectedParty"),
      trackerHtml.indexOf("async function refreshSelectedSession")
    );
    expect(refreshPartyFn).toContain("RailroadedAudio.playForEvent");
    expect(refreshPartyFn).toContain("newEvents.length > 0");
  });

  test("plays sound for new session events too", () => {
    const refreshSessionFn = trackerHtml.slice(
      trackerHtml.indexOf("async function refreshSelectedSession"),
      trackerHtml.indexOf("// --- NARRATOR PANEL ---")
    );
    expect(refreshSessionFn).toContain("RailroadedAudio.playForEvent");
    expect(refreshSessionFn).toContain("newEvents.length > 0");
  });
});

describe("session.html audio integration", () => {
  test("includes audio.js script", () => {
    expect(sessionHtml).toContain('<script src="audio.js"></script>');
  });

  test("plays sound only on auto-refresh, not initial load", () => {
    // Should check lastEventCount > 0 before playing
    expect(sessionHtml).toContain("lastEventCount > 0");
    expect(sessionHtml).toContain("RailroadedAudio.playForEvent");
  });

  test("tracks event count for detecting new events", () => {
    expect(sessionHtml).toContain("let lastEventCount = 0");
    expect(sessionHtml).toContain("lastEventCount = events.length");
  });
});

describe("theme.css audio toggle styles", () => {
  test("has audio toggle container styles", () => {
    expect(themeCss).toContain(".audio-toggle");
    expect(themeCss).toContain(".audio-toggle-btn");
  });

  test("has dropdown styles", () => {
    expect(themeCss).toContain(".audio-dropdown");
    expect(themeCss).toContain(".audio-dropdown.open");
  });

  test("has volume slider styles", () => {
    expect(themeCss).toContain(".audio-slider");
  });

  test("dropdown is hidden by default", () => {
    expect(themeCss).toContain("display: none");
    expect(themeCss).toContain("display: block");
  });
});
