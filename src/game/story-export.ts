/**
 * Story export — compose a completed (or in-progress) session's persisted
 * events + narrator prose into ONE readable markdown story.
 *
 * Fable sprint GAP 4 (backlog item 16: "Exportable format (Markdown)").
 * Pure module: no DB, no game-manager imports — callers fetch, this renders.
 *
 * Structure: title/byline → cast → scenes (split on room_enter boundaries,
 * which carry roomId/revisit since GAP 3) → epilogue from the DM's summary.
 * Mechanical beats (attacks, saves, deaths) render as italic interstitials;
 * DM narration renders as prose; narrator (Poormetheus) prose as blockquotes;
 * dialogue as bolded speaker lines. Turn/queue/system noise is dropped.
 */

export interface StoryEvent {
  type: string;
  actorId: string | null;
  data: Record<string, unknown>;
  timestamp: Date;
}

export interface StoryNarration {
  content: string;
  createdAt: Date;
}

export interface StoryCastMember {
  name: string;
  race?: string | null;
  class?: string | null;
  level?: number | null;
  isAlive?: boolean | null;
  model?: string | null; // "anthropic/claude-opus-4-6"
}

export interface StorySessionMeta {
  sessionId: string;
  partyName: string | null;
  summary: string | null;
  outcome: string | null;
  startedAt: Date;
  endedAt: Date | null;
  isActive?: boolean;
  dmMetadata?: {
    worldDescription?: string;
    style?: string;
    tone?: string;
    setting?: string;
  } | null;
  members?: StoryCastMember[];
}

/** Event types that are pure plumbing — never part of the story. */
const NOISE_TYPES = new Set([
  "turn_auto_advanced", "autopilot_action", "combat_stalled",
  "combat_stall_recovered", "combat_timeout", "all_pcs_down_hostiles_remain",
  "partial_xp_awarded", "xp_awarded", "room_override", "dm_session_metadata",
  "conversation_start", "conversation_end", "exit_unlocked",
  "condition_removed", "campaign_created", "story_flag_set",
  "softlock_auto_revive", "turn_skipped", "monster_action",
  "narration_to", "whisper", "session_end", "room_enter",
]);

function s(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function n(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/** Render one mechanical/dialogue event as a story line. Null = skip. */
function renderEvent(ev: StoryEvent): string | null {
  const d = ev.data ?? {};
  switch (ev.type) {
    case "narration": {
      const text = s(d.text).trim();
      if (!text) return null;
      const narType = s(d.narrateType) || "scene";
      if (narType === "npc_dialogue") {
        const npc = s(d.npcName);
        return npc ? `**${npc}:** ${text}` : text;
      }
      if (narType === "atmosphere" || narType === "transition") return `*${text}*`;
      return text; // scene / intercut / ruling → plain prose
    }
    case "chat": {
      const speaker = s(d.speakerName);
      const msg = s(d.message).trim();
      if (!speaker || !msg) return null;
      return `**${speaker}:** "${msg}"`;
    }
    case "npc_dialogue": {
      const npc = s(d.npcName);
      const line = s(d.dialogue).trim();
      if (!npc || !line) return null;
      return `**${npc}:** "${line}"`;
    }
    case "combat_start": {
      const monsters = Array.isArray(d.monsters)
        ? (d.monsters as { name?: string }[]).map((m) => s(m?.name)).filter(Boolean)
        : [];
      return monsters.length > 0
        ? `*Steel is drawn — ${monsters.join(", ")}.*`
        : `*Steel is drawn.*`;
    }
    case "combat_end": {
      if (s(d.reason) === "all_players_dead") return `**Silence falls — every hero is down.**`;
      return `*The fight is over.*`;
    }
    case "attack":
    case "monster_attack": {
      const attacker = s(d.attackerName);
      const target = s(d.targetName);
      if (!attacker || !target) return null;
      const dmg = n(d.damage);
      if (d.critical && d.hit) return `*${attacker} lands a CRITICAL hit on ${target}${dmg ? ` — ${dmg} damage` : ""}.*`;
      if (d.hit) return `*${attacker} strikes ${target}${dmg ? ` for ${dmg} damage` : ""}.*`;
      return `*${attacker} swings at ${target} — and misses.*`;
    }
    case "spell_cast": {
      const caster = s(d.casterName);
      const spell = s(d.spellName);
      if (!caster || !spell) return null;
      const target = s(d.targetName);
      return `*${caster} casts ${spell}${target ? ` on ${target}` : ""}.*`;
    }
    case "heal": {
      const healer = s(d.healerName);
      const target = s(d.targetName);
      const amount = n(d.amount);
      if (!healer || !target) return null;
      return `*${healer} tends to ${target}${amount ? ` — ${amount} HP restored` : ""}.*`;
    }
    case "death_save": {
      const name = s(d.characterName);
      if (!name) return null;
      const roll = n(d.naturalRoll);
      if (d.revivedWith1HP) return `*${name} rolls a natural 20 — back on their feet!*`;
      if (d.dead) return `**${name} fails the final death save. ${name} is dead.**`;
      if (d.stabilized) return `*${name} stabilizes at death's door.*`;
      const saves = d.deathSaves as { successes?: number; failures?: number } | undefined;
      const tally = saves ? ` (${saves.successes ?? 0}✓ ${saves.failures ?? 0}✗)` : "";
      return `*Death save, ${name}: ${roll ?? "?"} — ${d.success ? "success" : "failure"}${tally}.*`;
    }
    case "death": {
      const name = s(d.characterName);
      return name ? `**${name} has fallen.**` : null;
    }
    case "level_up": {
      const name = s(d.name) || s(d.characterName);
      const lvl = n(d.newLevel);
      return name && lvl ? `*${name} reaches level ${lvl}.*` : null;
    }
    case "loot": {
      const name = s(d.characterName);
      const item = s(d.itemName);
      return name && item ? `*${name} claims ${item}.*` : null;
    }
    case "rest": {
      const type = s(d.restType);
      return `*The party takes a ${type || "short"} rest.*`;
    }
    case "ability_check": {
      const name = s(d.characterName);
      const skill = s(d.skill) || s(d.ability);
      if (!name || !skill) return null;
      const passed = d.success === true ? "succeeds" : d.success === false ? "fails" : "attempts";
      return `*${name} ${passed} a ${skill} check.*`;
    }
    case "feature_interaction": {
      const feature = s(d.feature);
      return feature ? `*The party examines the ${feature}.*` : null;
    }
    default:
      return null; // unknown types stay out of the story
  }
}

interface Scene {
  title: string;
  revisit: boolean;
  lines: string[];
}

/** Derive cast from events when no member list is supplied (party may be
 *  cleaned up after session end). Model identity comes from per-event tags. */
function deriveCast(events: StoryEvent[]): StoryCastMember[] {
  const names = new Map<string, string | null>(); // name → model
  const note = (name: unknown, model: unknown) => {
    const nm = s(name);
    if (!nm) return;
    const existing = names.get(nm);
    const m = s(model) || null;
    if (!names.has(nm) || (!existing && m)) names.set(nm, m);
  };
  for (const ev of events) {
    const d = ev.data ?? {};
    const model = d.modelIdentity;
    switch (ev.type) {
      case "attack": note(d.attackerName, model); break;
      case "spell_cast": note(d.casterName, model); break;
      case "chat": note(d.speakerName, model); break;
      case "heal": note(d.healerName, model); break;
      case "death_save":
      case "death": note(d.characterName, model); break;
      case "loot": note(d.characterName, model); break;
    }
  }
  return [...names.entries()].map(([name, model]) => ({ name, model }));
}

/**
 * Compose the full markdown story.
 * Events must be in chronological order. Narrations are merged by timestamp
 * and rendered as blockquote prose (the narrator's literary layer).
 */
export function composeStoryMarkdown(
  meta: StorySessionMeta,
  events: StoryEvent[],
  narrations: StoryNarration[] = []
): string {
  const out: string[] = [];

  // --- Title + byline ---
  const world = meta.dmMetadata?.worldDescription || meta.dmMetadata?.setting || "";
  const partyName = meta.partyName?.trim() || "An Unnamed Company";
  out.push(`# ${partyName}`);
  if (world) out.push(`*${world.trim()}*`);

  const started = meta.startedAt;
  const ended = meta.endedAt;
  const durationMin = ended ? Math.max(1, Math.round((ended.getTime() - started.getTime()) / 60_000)) : null;
  const bylineParts = [
    `A Railroaded chronicle · ${started.toISOString().slice(0, 10)}`,
    durationMin ? `${durationMin} min` : null,
    meta.outcome ? `outcome: ${meta.outcome}` : null,
    meta.dmMetadata?.tone ? `tone: ${meta.dmMetadata.tone}` : null,
  ].filter(Boolean);
  out.push(bylineParts.join(" · "));
  out.push("");

  // --- Cast ---
  const cast = meta.members && meta.members.length > 0 ? meta.members : deriveCast(events);
  if (cast.length > 0) {
    out.push(`## The Company`);
    for (const m of cast) {
      const detail = [m.race, m.class].filter(Boolean).join(" ");
      const level = m.level ? `level ${m.level}` : "";
      const model = m.model ? `— played by ${m.model}` : "";
      const fate = m.isAlive === false ? " †" : "";
      const parts = [detail, level].filter(Boolean).join(", ");
      out.push(`- **${m.name}**${fate}${parts ? ` (${parts})` : ""} ${model}`.trimEnd());
    }
    out.push("");
  }

  // --- Merge events + narrator prose chronologically ---
  type Merged = { at: number; kind: "event"; ev: StoryEvent } | { at: number; kind: "narration"; text: string };
  const merged: Merged[] = [
    ...events.map((ev) => ({ at: ev.timestamp.getTime(), kind: "event" as const, ev })),
    ...narrations.map((nr) => ({ at: nr.createdAt.getTime(), kind: "narration" as const, text: nr.content })),
  ].sort((a, b) => a.at - b.at);

  // --- Scenes: split on room_enter ---
  const scenes: Scene[] = [];
  let current: Scene = { title: "The Adventure Begins", revisit: false, lines: [] };
  let sceneCount = 0;

  for (const item of merged) {
    if (item.kind === "event" && item.ev.type === "room_enter") {
      const d = item.ev.data ?? {};
      // Close the running scene if it has content (or is a named room scene)
      if (current.lines.length > 0 || sceneCount > 0) scenes.push(current);
      sceneCount++;
      const roomName = s(d.roomName) || `Scene ${sceneCount}`;
      current = { title: roomName, revisit: d.revisit === true, lines: [] };
      continue;
    }
    if (item.kind === "narration") {
      const text = item.text.trim();
      if (text) current.lines.push(`> ${text.replace(/\n+/g, "\n> ")}`);
      continue;
    }
    if (NOISE_TYPES.has(item.ev.type)) continue;
    const line = renderEvent(item.ev);
    if (line) current.lines.push(line);
  }
  scenes.push(current);

  const named = scenes.filter((sc) => sc.lines.length > 0);
  let sceneNo = 0;
  for (const sc of named) {
    sceneNo++;
    const suffix = sc.revisit ? " (return)" : "";
    out.push(`## Scene ${sceneNo} — ${sc.title}${suffix}`);
    out.push("");
    // Merge consecutive beat lines into single paragraphs; keep prose spaced.
    for (const line of sc.lines) out.push(line, "");
  }

  // --- Epilogue ---
  const sessionEnd = events.find((e) => e.type === "session_end");
  const summary = meta.summary?.trim() || s(sessionEnd?.data?.summary).trim();
  out.push(`## Epilogue`);
  out.push("");
  if (summary) {
    out.push(summary, "");
  }
  if (!sessionEnd && meta.isActive !== false && !meta.endedAt) {
    out.push(`*This chronicle records a session still in progress — the story is not over.*`, "");
  } else if (!summary) {
    out.push(`*The chronicle ends here; the dungeon keeps the rest.*`, "");
  }

  return out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
}
