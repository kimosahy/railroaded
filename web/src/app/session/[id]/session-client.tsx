"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Avatar, Button, Card, Chip, Separator, Skeleton } from "@heroui/react";
import {
  BookOpen,
  CaretRight,
  ChatCircle,
  Copy,
  Crosshair,
  Heart,
  MaskHappy,
  Moon,
  Package,
  Play,
  Pause,
  ShareNetwork,
  Skull,
  Sparkle,
  Sword,
  Users,
} from "@phosphor-icons/react";
import { API_BASE } from "@/lib/api";
import {
  useCharacterDrawer,
  type SessionSnapshot,
} from "@/components/character-drawer-provider";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Session {
  id: string;
  partyId: string;
  partyName: string;
  phase?: string;
  isActive: boolean;
  summary?: string;
  outcome?: string;
  startedAt: string;
  endedAt?: string;
  eventCount: number;
  members?: Member[];
}

interface Member {
  id: string;
  name: string;
  race?: string;
  class?: string;
  level?: number;
  hpCurrent?: number;
  hpMax?: number;
  ac?: number;
  avatarUrl?: string;
  conditions?: string[];
  model?: { name?: string; provider?: string };
}

interface GameEvent {
  id: string;
  type: string;
  actorId?: string;
  data: Record<string, unknown>;
  timestamp: string;
}

interface Narration {
  id: string;
  content: string;
  partyName: string;
  createdAt: string;
}

interface SessionZero {
  dm?: {
    worldDescription?: string;
    style?: string;
    tone?: string;
    setting?: string;
    model?: { name?: string; provider?: string };
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CLASS_COLORS: Record<string, string> = {
  fighter: "#c9a84c", wizard: "#5b9bd5", rogue: "#4caf50", cleric: "#f0ece4",
  ranger: "#2d6b3f", paladin: "#e8d48b", warlock: "#6b3fa0", bard: "#e8b84c",
  barbarian: "#c43c3c", monk: "#8a7033", sorcerer: "#a47bd5", druid: "#4caf50",
};

const COMBAT_TYPES = new Set(["attack", "monster_attack", "player_attack", "damage", "combat_start", "combat_end", "death_save", "spell_cast", "heal"]);
const CHECK_TYPES = new Set(["skill_check", "ability_check", "saving_throw", "group_check", "contested_check"]);
const CHAT_TYPES = new Set(["chat", "npc_dialogue", "party_chat", "whisper"]);

const REACTION_EMOJIS = ["⚔️", "🗡️", "💀", "🎉", "😂", "🔥"];

const PHASE_COLORS: Record<string, "success" | "danger" | "warning" | "default"> = {
  combat: "danger",
  exploration: "default",
  roleplay: "accent" as "default",
  ended: "default",
};

// ─── Event helpers ────────────────────────────────────────────────────────────

const EVENT_META: Record<
  string,
  { label: string; color: "default" | "accent" | "success" | "danger" | "warning" }
> = {
  combat_start: { label: "Combat", color: "danger" },
  combat_end: { label: "Combat End", color: "default" },
  player_attack: { label: "Attack", color: "warning" },
  attack: { label: "Attack", color: "warning" },
  monster_attack: { label: "Monster", color: "danger" },
  player_action: { label: "Action", color: "accent" },
  spell_cast: { label: "Spell", color: "accent" },
  heal: { label: "Heal", color: "success" },
  death_save: { label: "Death Save", color: "danger" },
  party_chat: { label: "Chat", color: "default" },
  chat: { label: "Chat", color: "default" },
  npc_dialogue: { label: "NPC", color: "accent" },
  narration: { label: "Narration", color: "accent" },
  dm_narration: { label: "Narration", color: "accent" },
  session_start: { label: "Session Start", color: "success" },
  session_end: { label: "Session End", color: "default" },
  level_up: { label: "Level Up", color: "success" },
  rest: { label: "Rest", color: "default" },
  loot: { label: "Loot", color: "warning" },
  loot_drop: { label: "Loot", color: "warning" },
  room_loot: { label: "Loot", color: "warning" },
  room_enter: { label: "Exploration", color: "default" },
  gold_award: { label: "Gold", color: "warning" },
  skill_check: { label: "Check", color: "accent" },
  ability_check: { label: "Check", color: "accent" },
  saving_throw: { label: "Save", color: "accent" },
  death: { label: "Death", color: "danger" },
};

function getEventMeta(type: string) {
  return EVENT_META[type] ?? { label: type.replace(/_/g, " "), color: "default" as const };
}

function eventSummary(event: GameEvent): string {
  const d = event.data;
  switch (event.type) {
    case "player_attack":
    case "attack":
    case "monster_attack": {
      const attacker = (d.attackerName ?? d.actorName ?? d.monsterName ?? "Unknown") as string;
      const target = (d.targetName ?? d.target ?? "") as string;
      const dmg = d.damage ?? d.totalDamage;
      const hit = d.hit;
      if (hit === false) return `${attacker} swings at ${target} — miss.`;
      if (target && dmg !== undefined) return `${attacker} attacked ${target} for ${dmg} damage`;
      if (target) return `${attacker} attacked ${target}`;
      return `${attacker} attacked`;
    }
    case "party_chat":
    case "chat": {
      const speaker = (d.characterName ?? d.speakerName ?? d.actorName ?? "") as string;
      const msg = (d.message ?? d.content ?? "") as string;
      if (speaker && msg) return `${speaker}: "${msg}"`;
      return msg || speaker || "Party chat";
    }
    case "npc_dialogue": {
      const speaker = (d.speakerName ?? d.npcName ?? "NPC") as string;
      const msg = (d.message ?? d.content ?? "") as string;
      return `${speaker}: "${msg}"`;
    }
    case "narration":
    case "dm_narration": {
      const content = (d.text ?? d.content ?? d.narration ?? "") as string;
      return content.length > 200 ? content.slice(0, 197) + "…" : content;
    }
    case "spell_cast": {
      const caster = (d.casterName ?? d.actorName ?? "") as string;
      const spell = (d.spellName ?? d.spell ?? "") as string;
      let text = caster && spell ? `${caster} cast ${spell}` : spell || caster || "Spell cast";
      if (d.damage) text += ` — ${d.damage} damage`;
      if (d.healed || d.hpGained) text += ` — +${d.healed || d.hpGained} HP`;
      return text;
    }
    case "heal": {
      const healer = (d.casterName ?? d.actorName ?? "") as string;
      const target = (d.targetName ?? "an ally") as string;
      return `${healer} healed ${target} for +${d.healed || d.hpGained || 0} HP`;
    }
    case "death_save": {
      const name = (d.characterName ?? "") as string;
      const result = d.success ? "success" : "failure";
      const roll = d.naturalRoll ?? d.roll ?? "?";
      return `${name} death save: ${roll} — ${result} (${d.successes || 0}/${d.failures || 0})`;
    }
    case "combat_start": {
      const monsters = (d.monsters as Array<{ name: string }> | undefined);
      if (monsters?.length) return `Combat! ${monsters.map(m => m.name).join(", ")} appear.`;
      return (d.description ?? "Combat begins.") as string;
    }
    case "combat_end":
      if (d.reason === "all_players_dead") return "Total Party Kill. The dungeon claims another party.";
      return `Victory! +${d.xpAwarded || 0} XP earned.`;
    case "session_start": return (d.description ?? "A new session begins.") as string;
    case "session_end": return (d.summary ?? d.description ?? "The session draws to a close.") as string;
    case "level_up": return `${d.characterName || d.name || "Someone"} reached level ${d.newLevel ?? d.level}`;
    case "room_enter": return `Entered ${d.roomName || "unknown room"}`;
    case "loot_drop":
    case "room_loot": {
      const items = (d.items ?? d.droppedItems) as Array<string | { name: string }> | undefined;
      if (items?.length) return `Loot: ${items.map(i => typeof i === "string" ? i : i.name).join(", ")}`;
      return "Treasure found!";
    }
    case "gold_award": return `${d.characterName || "Party"} receives ${d.amount || d.totalAmount || "?"} gold`;
    case "skill_check":
    case "ability_check":
    case "saving_throw": {
      const name = (d.characterName ?? d.playerName ?? "") as string;
      const skill = (d.skill ?? d.ability ?? "a check") as string;
      const total = d.total ?? d.roll ?? "?";
      const success = d.success;
      return `${name} ${skill}: ${total} — ${success ? "Success" : "Failure"}${d.dc ? ` (DC ${d.dc})` : ""}`;
    }
    default: {
      const desc = (d.description ?? d.message ?? d.content ?? d.summary ?? d.text ?? "") as string;
      return desc.length > 200 ? desc.slice(0, 197) + "…" : desc || event.type.replace(/_/g, " ");
    }
  }
}

function eventIcon(type: string) {
  if (type.includes("combat") || type.includes("attack")) return <Sword size={13} weight="fill" />;
  if (type.includes("spell")) return <Sparkle size={13} weight="fill" />;
  if (type.includes("death")) return <Skull size={13} weight="fill" />;
  if (type.includes("heal")) return <Heart size={13} weight="fill" />;
  if (type.includes("chat") || type.includes("dialogue")) return <ChatCircle size={13} weight="fill" />;
  if (type.includes("session")) return <BookOpen size={13} weight="fill" />;
  if (type.includes("loot") || type.includes("gold")) return <Package size={13} weight="fill" />;
  if (type.includes("rest")) return <Moon size={13} weight="fill" />;
  if (type.includes("narration")) return <BookOpen size={13} weight="fill" />;
  if (type.includes("party") || type.includes("level")) return <Users size={13} weight="fill" />;
  return <Crosshair size={13} weight="fill" />;
}

function formatDate(iso: string) {
  try { return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

function formatTime(iso: string) {
  try { return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
  catch { return iso; }
}

function formatDuration(start: string, end: string | undefined) {
  if (!end) return null;
  try {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    const mins = Math.round(ms / 60_000);
    return mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
  } catch { return null; }
}

function getClassColor(cls: string) {
  return CLASS_COLORS[cls.toLowerCase()] ?? "#c9a84c";
}

function hpColor(pct: number): string {
  if (pct > 60) return "var(--success, #4caf50)";
  if (pct > 25) return "#e8b84c";
  return "var(--danger, #c43c3c)";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ShareReactionBar({ url, title }: { url: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const [floats, setFloats] = useState<{ id: number; emoji: string; x: number }[]>([]);
  const nextId = useRef(0);

  function copyLink() {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function shareNative() {
    if (navigator.share) {
      navigator.share({ title, url });
    } else {
      copyLink();
    }
  }

  function react(emoji: string) {
    const id = nextId.current++;
    const x = 20 + Math.random() * 60;
    setFloats((prev) => [...prev, { id, emoji, x }]);
    setTimeout(() => setFloats((prev) => prev.filter((f) => f.id !== id)), 2000);
  }

  return (
    <>
      {/* Floating reactions */}
      {floats.map((f) => (
        <span
          key={f.id}
          style={{
            position: "fixed",
            bottom: "5rem",
            left: `${f.x}%`,
            fontSize: "1.5rem",
            pointerEvents: "none",
            zIndex: 200,
            animation: "floatUp 2s ease-out forwards",
          }}
        >
          {f.emoji}
        </span>
      ))}
      <style>{`@keyframes floatUp { 0% { opacity:1; transform:translateY(0) scale(1); } 100% { opacity:0; transform:translateY(-150px) scale(1.3); } }`}</style>

      {/* Share button */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
        <Button size="sm" variant="outline" onPress={shareNative}>
          <ShareNetwork size={14} />
          Share
        </Button>
        <Button size="sm" variant="outline" onPress={copyLink}>
          <Copy size={14} />
          {copied ? "Copied!" : "Copy"}
        </Button>
      </div>

      {/* Reaction bar (fixed bottom) */}
      <div
        style={{
          position: "fixed",
          bottom: "1rem",
          left: "50%",
          transform: "translateX(-50%)",
          display: "flex",
          gap: "0.4rem",
          background: "var(--surface, #12121a)",
          border: "1px solid var(--border)",
          borderRadius: "999px",
          padding: "0.4rem 0.75rem",
          zIndex: 100,
        }}
      >
        {REACTION_EMOJIS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => react(emoji)}
            style={{
              background: "none",
              border: "none",
              fontSize: "1.3rem",
              cursor: "pointer",
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "transform 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.25)")}
            onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
          >
            {emoji}
          </button>
        ))}
      </div>
    </>
  );
}

function PlaybillCard({ sessionZero }: { sessionZero: SessionZero }) {
  const dm = sessionZero.dm;
  if (!dm || (!dm.worldDescription && !dm.style && !dm.tone && !dm.setting)) return null;

  return (
    <Card style={{ border: "1px solid color-mix(in oklch, var(--accent) 30%, transparent)", marginBottom: "1.5rem" }}>
      <Card.Content style={{ padding: "1.5rem 2rem", position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "3px",
            background: "linear-gradient(90deg, transparent, var(--accent), transparent)",
          }}
        />
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem" }}>
          <MaskHappy size={16} weight="duotone" color="var(--accent)" />
          <span
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "0.72rem",
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            The DM&rsquo;s Vision
          </span>
          {dm.model?.name && (
            <Chip size="sm" variant="soft" color="default">{dm.model.name}</Chip>
          )}
        </div>
        {dm.worldDescription && (
          <p
            className="prose-narrative"
            style={{ fontSize: "1.05rem", fontStyle: "italic", color: "var(--foreground)", lineHeight: 1.8, marginBottom: "0.75rem" }}
          >
            {dm.worldDescription}
          </p>
        )}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          {dm.style && <Chip size="sm" variant="secondary">Style: {dm.style}</Chip>}
          {dm.tone && <Chip size="sm" variant="secondary">Tone: {dm.tone}</Chip>}
          {dm.setting && <Chip size="sm" variant="secondary">Setting: {dm.setting}</Chip>}
        </div>
      </Card.Content>
    </Card>
  );
}

function RosterStrip({
  members,
  sessionSnapshot,
}: {
  members: Member[];
  sessionSnapshot: SessionSnapshot | null;
}) {
  const { openDrawer } = useCharacterDrawer();
  if (!members.length) return null;
  return (
    <div style={{ display: "flex", gap: "0.6rem", flexWrap: "wrap", margin: "1rem 0 1.5rem" }}>
      {members.map((m) => {
        const color = getClassColor(m.class || "");
        const initials = (m.name || "?").slice(0, 2).toUpperCase();
        const cardNode = (
          <Card style={{ cursor: "pointer", transition: "border-color 0.15s" }}>
            <Card.Content style={{ padding: "0.5rem 0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <Avatar size="sm">
                {m.avatarUrl ? <Avatar.Image src={m.avatarUrl} alt={m.name} /> : null}
                <Avatar.Fallback style={{ background: color, color: "#0a0a0f", fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "0.6rem" }}>
                  {initials}
                </Avatar.Fallback>
              </Avatar>
              <div style={{ textAlign: "left" }}>
                <div style={{ fontFamily: "var(--font-heading)", fontSize: "0.85rem", color: "var(--accent)", fontWeight: 600 }}>
                  {m.name}
                </div>
                <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                  {m.race} {m.class} Lv{m.level || 1}
                  {m.model?.name ? ` · ${m.model.name}` : ""}
                </div>
              </div>
            </Card.Content>
          </Card>
        );

        if (!m.id) {
          return <div key={m.name}>{cardNode}</div>;
        }

        return (
          <button
            key={m.id}
            type="button"
            className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)] focus:outline-none"
            onClick={() => openDrawer(m.id, sessionSnapshot)}
            style={{
              border: "none",
              background: "inherit",
              padding: 0,
              cursor: "pointer",
              font: "inherit",
              color: "inherit",
              textAlign: "left",
            }}
            aria-label={`Open character details for ${m.name}`}
          >
            {cardNode}
          </button>
        );
      })}
    </div>
  );
}

function PhaseTimeline({ events }: { events: GameEvent[] }) {
  if (events.length < 2) return null;

  return (
    <div
      style={{
        position: "relative",
        height: "28px",
        background: "var(--surface, #12121a)",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        margin: "0.75rem 0",
        overflow: "hidden",
      }}
    >
      {events.map((e, i) => {
        const pct = (i / (events.length - 1)) * 100;
        const isCombat = COMBAT_TYPES.has(e.type);
        const isCheck = CHECK_TYPES.has(e.type);
        const color = isCombat ? "var(--danger, #c43c3c)" : isCheck ? "#5b9bd5" : "var(--muted)";
        return (
          <div
            key={e.id || i}
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: `${pct}%`,
              width: "3px",
              borderRadius: "1px",
              background: color,
              opacity: 0.6,
            }}
            title={`#${i + 1} ${e.type.replace(/_/g, " ")}`}
          />
        );
      })}
    </div>
  );
}

function PartySidebar({ members }: { members: Member[] }) {
  if (!members.length) return null;

  return (
    <div>
      <h2
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "0.72rem",
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          color: "var(--muted)",
          marginBottom: "1rem",
        }}
      >
        Party Roster
      </h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {members.map((m) => {
          const color = getClassColor(m.class || "");
          const hpPct = m.hpMax && m.hpMax > 0 ? Math.round(((m.hpCurrent ?? 0) / m.hpMax) * 100) : 0;
          const initials = (m.name || "?").slice(0, 2).toUpperCase();

          return (
            <Card key={m.id}>
              <Card.Content style={{ padding: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.3rem" }}>
                  <Avatar size="sm">
                    {m.avatarUrl ? <Avatar.Image src={m.avatarUrl} alt={m.name} /> : null}
                    <Avatar.Fallback style={{ background: color, color: "#0a0a0f", fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "0.6rem" }}>
                      {initials}
                    </Avatar.Fallback>
                  </Avatar>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "var(--font-heading)", fontSize: "0.8rem", color: "var(--accent)", fontWeight: 600 }}>
                      {m.name}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                      {m.race} {m.class} Lv{m.level || 1} · HP {m.hpCurrent ?? "?"}{"/"}{m.hpMax ?? "?"} · AC {m.ac ?? "?"}
                    </div>
                  </div>
                </div>
                {/* HP bar */}
                {m.hpMax && m.hpMax > 0 && (
                  <div style={{ height: 4, background: "var(--surface-secondary, var(--surface))", borderRadius: 2, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${hpPct}%`, background: hpColor(hpPct), borderRadius: 2, transition: "width 0.3s" }} />
                  </div>
                )}
                {m.conditions && m.conditions.length > 0 && (
                  <div style={{ fontSize: "0.65rem", color: "var(--danger)", marginTop: "0.2rem" }}>
                    {m.conditions.join(", ")}
                  </div>
                )}
              </Card.Content>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function EventCard({ event }: { event: GameEvent }) {
  const meta = getEventMeta(event.type);
  const summary = eventSummary(event);
  const isNarration = event.type === "narration" || event.type === "dm_narration";
  const isCombat = COMBAT_TYPES.has(event.type);
  const isSessionEnd = event.type === "session_end";
  const actorName = (event.data.characterName ?? event.data.actorName ?? event.data.attackerName ?? event.data.casterName ?? event.data.speakerName ?? "") as string;
  const initials = actorName ? actorName.slice(0, 2).toUpperCase() : "";

  // Session end / epilogue style
  if (isSessionEnd) {
    return (
      <Card style={{ border: "1px solid color-mix(in oklch, var(--accent) 25%, transparent)", borderRadius: "12px", margin: "0.5rem 0" }}>
        <Card.Content style={{ padding: "2rem", textAlign: "center" }}>
          <MaskHappy size={24} color="var(--accent)" style={{ margin: "0 auto 0.5rem" }} />
          <div style={{ fontFamily: "var(--font-heading)", fontSize: "0.75rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: "0.5rem" }}>
            Curtain Call
          </div>
          <p className="prose-narrative" style={{ fontSize: "1.05rem", fontStyle: "italic", color: "var(--foreground)", lineHeight: 1.8, maxWidth: "600px", margin: "0 auto" }}>
            {summary}
          </p>
        </Card.Content>
      </Card>
    );
  }

  // Narration — full-width prose
  if (isNarration) {
    return (
      <div style={{ borderLeft: "3px solid var(--accent)", padding: "1rem 1.25rem", margin: "0.5rem 0", background: "color-mix(in oklch, var(--accent) 3%, transparent)", borderRadius: "0 8px 8px 0" }}>
        <p className="prose-narrative" style={{ fontStyle: "italic", fontSize: "1.05rem", color: "var(--foreground)", lineHeight: 1.8, marginBottom: "0.3rem" }}>
          {summary}
        </p>
        <span style={{ color: "var(--muted)", fontSize: "0.7rem" }}>{formatTime(event.timestamp)}</span>
      </div>
    );
  }

  // Combat — red accent
  if (isCombat) {
    return (
      <div style={{ borderLeft: "3px solid var(--danger, #c43c3c)", padding: "0.75rem 1rem", margin: "0.3rem 0", background: "color-mix(in oklch, var(--danger) 3%, transparent)", borderRadius: "0 8px 8px 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.25rem" }}>
          <Chip size="sm" variant="soft" color={meta.color}>
            <span style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>{eventIcon(event.type)} {meta.label}</span>
          </Chip>
          <span style={{ color: "var(--muted)", fontSize: "0.7rem" }}>{formatTime(event.timestamp)}</span>
        </div>
        <p style={{ color: "var(--foreground)", fontSize: "0.9rem", margin: 0 }}>{summary}</p>
      </div>
    );
  }

  // Default event card
  return (
    <Card variant="transparent" className="rounded-none" style={{ borderBottom: "1px solid var(--border)", padding: "0.625rem 0" }}>
      <div style={{ display: "flex", gap: "0.625rem", alignItems: "flex-start" }}>
        {initials ? (
          <Avatar size="sm" style={{ flexShrink: 0, marginTop: "0.1rem" }}>
            <Avatar.Fallback style={{ background: "var(--surface)", color: "var(--accent)", fontFamily: "var(--font-heading)", fontSize: "0.6rem", fontWeight: 700 }}>
              {initials}
            </Avatar.Fallback>
          </Avatar>
        ) : (
          <div style={{ width: 32, flexShrink: 0 }} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.25rem", flexWrap: "wrap" }}>
            <Chip size="sm" variant="soft" color={meta.color}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.25rem" }}>{eventIcon(event.type)} {meta.label}</span>
            </Chip>
            <span style={{ color: "var(--muted)", fontSize: "0.72rem" }}>{formatTime(event.timestamp)}</span>
          </div>
          <p style={{ color: "var(--foreground)", fontSize: "0.875rem", margin: 0 }}>{summary}</p>
        </div>
      </div>
    </Card>
  );
}

function SkeletonFeed() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem", paddingTop: "1rem" }}>
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <Skeleton className="h-8 w-8 rounded-full shrink-0" />
          <Skeleton className="h-5 w-20 rounded shrink-0" />
          <Skeleton className="h-4 rounded flex-1" />
          <Skeleton className="h-4 w-12 rounded shrink-0" />
        </div>
      ))}
    </div>
  );
}

// ─── Replay Controls ──────────────────────────────────────────────────────────

function ReplayControls({
  total,
  index,
  playing,
  onToggle,
  onScrub,
  speed,
  onSpeedChange,
}: {
  total: number;
  index: number;
  playing: boolean;
  onToggle: () => void;
  onScrub: (i: number) => void;
  speed: number;
  onSpeedChange: (s: number) => void;
}) {
  return (
    <Card style={{ marginBottom: "1rem" }}>
      <Card.Content style={{ padding: "0.75rem 1rem", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <Button size="sm" variant="outline" onPress={onToggle} style={{ borderRadius: "50%", width: 36, height: 36, minWidth: 36, padding: 0 }}>
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </Button>
        <input
          type="range"
          min={0}
          max={total - 1}
          value={index}
          onChange={(e) => onScrub(Number(e.target.value))}
          style={{ flex: 1, accentColor: "var(--accent)" }}
        />
        <select
          value={speed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
          style={{
            background: "var(--surface, #0a0a0f)",
            color: "var(--foreground)",
            border: "1px solid var(--border)",
            borderRadius: "4px",
            padding: "0.25rem 0.4rem",
            fontFamily: "var(--font-heading)",
            fontSize: "0.78rem",
          }}
        >
          <option value={1}>1×</option>
          <option value={2}>2×</option>
          <option value={4}>4×</option>
        </select>
        <span style={{ color: "var(--muted)", fontSize: "0.78rem", whiteSpace: "nowrap" }}>
          {index} / {total}
        </span>
      </Card.Content>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function SessionClient({ sessionId }: { sessionId: string }) {
  const [session, setSession] = useState<Session | null>(null);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [narrations, setNarrations] = useState<Narration[]>([]);
  const [sessionZero, setSessionZero] = useState<SessionZero | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingNarrations, setLoadingNarrations] = useState(true);
  const [sessionError, setSessionError] = useState(false);
  const [sortNewest, setSortNewest] = useState(true);

  // Replay state
  const [replayPlaying, setReplayPlaying] = useState(false);
  const [replayIndex, setReplayIndex] = useState(0);
  const [replaySpeed, setReplaySpeed] = useState(4);
  const replayTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isActiveRef = useRef(false);

  // ── Fetchers ────────────────────────────────────────────────────────────────

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/spectator/sessions/${sessionId}`);
      if (!res.ok) throw new Error("Not found");
      const data = (await res.json()) as Session;
      setSession(data);
      isActiveRef.current = data.isActive;
    } catch { setSessionError(true); }
    finally { setLoadingSession(false); }
  }, [sessionId]);

  const fetchEvents = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/spectator/sessions/${sessionId}/events`);
      if (res.ok) {
        const data = (await res.json()) as { events: GameEvent[] };
        setEvents(data.events ?? []);
      }
    } catch { /* silent */ }
    finally { setLoadingEvents(false); }
  }, [sessionId]);

  const fetchNarrations = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/spectator/narrations?sessionId=${sessionId}&limit=20`);
      if (res.ok) {
        const data = (await res.json()) as { narrations: Narration[] };
        setNarrations(data.narrations ?? []);
      }
    } catch { /* silent */ }
    finally { setLoadingNarrations(false); }
  }, [sessionId]);

  const fetchSessionZero = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/spectator/sessions/${sessionId}/session-zero`);
      if (res.ok) setSessionZero(await res.json());
    } catch { /* silent */ }
  }, [sessionId]);

  // ── Initial load ─────────────────────────────────────────────────────────────

  useEffect(() => {
    fetchSession();
    fetchEvents();
    fetchNarrations();
    fetchSessionZero();
  }, [fetchSession, fetchEvents, fetchNarrations, fetchSessionZero]);

  // ── Polling (active sessions only) ───────────────────────────────────────────

  useEffect(() => {
    const eventsId = setInterval(() => { if (isActiveRef.current) fetchEvents(); }, 5_000);
    const narrationsId = setInterval(() => { if (isActiveRef.current) fetchNarrations(); }, 8_000);
    return () => { clearInterval(eventsId); clearInterval(narrationsId); };
  }, [fetchEvents, fetchNarrations]);

  // ── Interleave events + narrations ──────────────────────────────────────────

  const allEvents = (() => {
    const combined: GameEvent[] = [...events];
    for (const n of narrations) {
      combined.push({
        id: n.id,
        type: "narration",
        data: { text: n.content },
        timestamp: n.createdAt,
      });
    }
    combined.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return combined;
  })();

  const displayEvents = sortNewest ? [...allEvents].reverse() : allEvents;

  // ── Replay logic ────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!replayPlaying) return;
    if (replayIndex >= allEvents.length) {
      setReplayPlaying(false);
      return;
    }
    const delay = replaySpeed === 1 ? 2000 : replaySpeed === 2 ? 1000 : 500;
    replayTimer.current = setTimeout(() => {
      setReplayIndex((i) => i + 1);
    }, delay);
    return () => { if (replayTimer.current) clearTimeout(replayTimer.current); };
  }, [replayPlaying, replayIndex, replaySpeed, allEvents.length]);

  function toggleReplay() {
    if (sortNewest) setSortNewest(false);
    if (replayPlaying) {
      setReplayPlaying(false);
    } else {
      if (replayIndex >= allEvents.length) setReplayIndex(0);
      setReplayPlaying(true);
    }
  }

  function scrubReplay(idx: number) {
    setReplayPlaying(false);
    setReplayIndex(idx);
  }

  // ── Derived ─────────────────────────────────────────────────────────────────

  const duration = session ? formatDuration(session.startedAt, session.endedAt) : null;
  const members = session?.members ?? [];
  const phaseLabel = session?.phase ? session.phase.charAt(0).toUpperCase() + session.phase.slice(1) : null;

  // ── Error state ──────────────────────────────────────────────────────────────

  if (!loadingSession && sessionError) {
    return (
      <div className="max-w-5xl mx-auto px-6" style={{ textAlign: "center", paddingTop: "5rem" }}>
        <p className="prose-narrative" style={{ color: "var(--muted)", fontSize: "1.125rem" }}>
          This session has been lost to the mists. It may never have existed, or it may have been struck from the record.
        </p>
      </div>
    );
  }

  // ── Layout ────────────────────────────────────────────────────────────────────

  const replayActive = !session?.isActive && allEvents.length > 0;
  const replayEventsToShow = replayActive && (replayPlaying || replayIndex > 0)
    ? allEvents.slice(0, replayIndex)
    : null;

  return (
    <div
      className="max-w-[1400px] mx-auto px-6 pb-20"
      style={{ display: "grid", gridTemplateColumns: "1fr 272px", gap: "0 2rem" }}
    >
      {/* ── Main column ──────────────────────────────────────────────────────── */}
      <div style={{ minWidth: 0 }}>
        {/* Session header */}
        <header style={{ paddingTop: "1.5rem", paddingBottom: "1.25rem" }}>
          {loadingSession ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              <Skeleton className="h-8 w-64 rounded" />
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Skeleton className="h-5 w-20 rounded" />
                <Skeleton className="h-5 w-16 rounded" />
                <Skeleton className="h-5 w-24 rounded" />
              </div>
            </div>
          ) : session ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                <h1 style={{ fontFamily: "var(--font-heading)", color: "var(--accent)", fontSize: "1.875rem", fontWeight: 700, lineHeight: 1.1 }}>
                  {session.partyName}
                </h1>
                {session.isActive ? (
                  <Chip size="sm" variant="soft" color="success">
                    <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                      <span className="animate-pulse inline-block rounded-full" style={{ width: 6, height: 6, background: "var(--success)", flexShrink: 0 }} />
                      Live
                    </span>
                  </Chip>
                ) : (
                  <Chip size="sm" variant="soft" color="default">Completed</Chip>
                )}
                {phaseLabel && <Chip size="sm" variant="secondary" color="default">{phaseLabel}</Chip>}
                {session.outcome && (
                  <Chip size="sm" variant="soft" color={session.outcome === "victory" ? "success" : "default"}>
                    {session.outcome}
                  </Chip>
                )}
                <ShareReactionBar
                  url={typeof window !== "undefined" ? window.location.href : ""}
                  title={`${session.partyName} — Railroaded`}
                />
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
                {duration && <Chip size="sm" variant="secondary" color="default">{duration}</Chip>}
                <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{formatDate(session.startedAt)}</span>
                <span style={{ color: "var(--muted)", fontSize: "0.8rem" }}>{allEvents.length} events</span>
              </div>
              {session.summary && (
                <p className="prose-narrative" style={{ color: "var(--muted)", fontSize: "0.95rem", marginTop: "0.75rem", maxWidth: "52rem" }}>
                  {session.summary}
                </p>
              )}
            </>
          ) : null}
        </header>

        {/* Playbill from session-zero */}
        {sessionZero && <PlaybillCard sessionZero={sessionZero} />}

        {/* Character roster strip */}
        {!loadingSession && members.length > 0 && (
          <RosterStrip
            members={members}
            sessionSnapshot={
              session
                ? {
                    sessionId: session.id,
                    phase: session.phase ?? (session.isActive ? "in session" : "ended"),
                    room: null,
                  }
                : null
            }
          />
        )}

        {/* Phase timeline */}
        {!loadingEvents && allEvents.length > 0 && <PhaseTimeline events={allEvents} />}

        <Separator />

        {/* Replay controls for completed sessions */}
        {replayActive && (
          <div style={{ marginTop: "0.75rem" }}>
            <ReplayControls
              total={allEvents.length}
              index={replayIndex}
              playing={replayPlaying}
              onToggle={toggleReplay}
              onScrub={scrubReplay}
              speed={replaySpeed}
              onSpeedChange={setReplaySpeed}
            />
          </div>
        )}

        {/* Sort controls */}
        {!loadingSession && session && (
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: "0.75rem", paddingBottom: "0.25rem" }}>
            <div style={{ display: "flex", gap: "0.4rem" }}>
              <Button size="sm" variant={sortNewest ? "primary" : "secondary"} onPress={() => setSortNewest(true)}>Newest First</Button>
              <Button size="sm" variant={!sortNewest ? "primary" : "secondary"} onPress={() => setSortNewest(false)}>Chronological</Button>
            </div>
            {allEvents.length > 0 && (
              <span style={{ color: "var(--muted)", fontSize: "0.72rem" }}>{allEvents.length} events</span>
            )}
          </div>
        )}

        {/* Loading skeleton */}
        {(loadingSession || loadingEvents) && <SkeletonFeed />}

        {/* Empty feed */}
        {!loadingSession && !loadingEvents && allEvents.length === 0 && (
          <p style={{ color: "var(--muted)", fontStyle: "italic", textAlign: "center", padding: "3rem 0" }}>
            No events have been recorded for this session yet.
          </p>
        )}

        {/* Events */}
        {!loadingEvents && (replayEventsToShow ?? displayEvents).length > 0 && (
          <div>
            {(replayEventsToShow ?? displayEvents).map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>

      {/* ── Sidebar ───────────────────────────────────────────────────────── */}
      <aside style={{ position: "sticky", top: "64px", maxHeight: "calc(100dvh - 64px)", overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent", paddingTop: "1.5rem", paddingBottom: "2rem" }}>
        {loadingSession ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            <Skeleton className="h-4 w-24 rounded" />
            <Skeleton className="h-16 rounded" />
            <Skeleton className="h-16 rounded" />
          </div>
        ) : (
          <PartySidebar members={members} />
        )}

        {/* Narrations sidebar */}
        <div style={{ marginTop: "2rem" }}>
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.07em", color: "var(--muted)", marginBottom: "1rem" }}>
            Narrations
          </h2>
          {loadingNarrations ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-4 w-full rounded" />
              <Skeleton className="h-4 w-5/6 rounded" />
            </div>
          ) : narrations.length === 0 ? (
            <p className="prose-narrative" style={{ color: "var(--muted)", fontSize: "0.9rem", fontStyle: "italic" }}>
              The narrator considers…
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {narrations.map((n) => (
                <div key={n.id} style={{ borderLeft: "2px solid var(--accent)", paddingLeft: "0.75rem", paddingTop: "0.125rem", paddingBottom: "0.125rem" }}>
                  <p className="prose-narrative" style={{ color: "var(--foreground)", fontSize: "0.9rem", margin: 0, lineHeight: 1.7 }}>
                    {n.content}
                  </p>
                  <p style={{ color: "var(--muted)", fontSize: "0.72rem", marginTop: "0.375rem", marginBottom: 0 }}>
                    {new Date(n.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
