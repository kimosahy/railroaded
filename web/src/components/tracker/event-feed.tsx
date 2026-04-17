"use client";

import type { ReactNode } from "react";
import { Avatar, Card, Skeleton } from "@heroui/react";
import {
  Sword,
  Skull,
  Sparkle,
  Shield,
  Lightning,
  Package,
  DoorOpen,
  ArrowCircleUp,
  CheckCircle,
  XCircle,
  Scroll,
  Coins,
  Heartbeat,
} from "@phosphor-icons/react";
import type { GameEvent, Member, Party, Session } from "@/app/tracker/tracker-client";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CHAR_COLORS = [
  "#c9a84c", "#5b9bd5", "#4caf50", "#e85555",
  "#a47bd5", "#e8945b", "#5bcbd5", "#d5a75b",
];

function charColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return CHAR_COLORS[Math.abs(hash) % CHAR_COLORS.length];
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function timeStr(ts?: string): string {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function safeUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const p = new URL(url);
    if (p.hostname.includes("dicebear.com")) return undefined;
    if (p.hostname.includes("oaidalleapiprodscus.blob")) return undefined;
    return p.protocol === "https:" || p.protocol === "http:" ? url : undefined;
  } catch {
    return undefined;
  }
}

function displayName(s: string): string {
  return s.replace(/_/g, " ").replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

function bool(v: unknown): boolean {
  return v === true;
}

function arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

// ─── Shared avatar component ──────────────────────────────────────────────────

function CharAvatar({
  name,
  avatarUrl,
  size,
}: {
  name: string;
  avatarUrl?: string;
  size?: "sm" | "md";
}) {
  const col = charColor(name);
  const safe = safeUrl(avatarUrl);
  const sz = size === "md" ? 40 : 32;

  return (
    <Avatar style={{ width: sz, height: sz, flexShrink: 0 }}>
      {safe ? <Avatar.Image src={safe} alt={name} /> : null}
      <Avatar.Fallback
        style={{
          background: col,
          color: "#0a0a0f",
          fontFamily: "var(--font-heading)",
          fontWeight: 700,
          fontSize: size === "md" ? "0.75rem" : "0.6rem",
        }}
      >
        {initials(name)}
      </Avatar.Fallback>
    </Avatar>
  );
}

// ─── HP bar ───────────────────────────────────────────────────────────────────

function HpBar({ cur, max }: { cur: number; max: number }) {
  const pct = max > 0 ? Math.round((cur / max) * 100) : 0;
  const color = pct > 60 ? "#4caf50" : pct > 25 ? "#d4a017" : "#c43c3c";
  return (
    <div
      style={{
        width: 50,
        height: 4,
        background: "rgba(139,32,32,0.35)",
        borderRadius: 2,
        overflow: "hidden",
        marginTop: 3,
      }}
    >
      <div
        style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }}
      />
    </div>
  );
}

// ─── Member detail card ───────────────────────────────────────────────────────

function MemberDetailCard({ m }: { m: Member }) {
  const pct = m.hpMax > 0 ? Math.round((m.hpCurrent / m.hpMax) * 100) : 0;

  return (
    <div
      style={{
        background: "oklch(0.14 0.01 270)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "0.5rem 0.8rem",
        display: "flex",
        alignItems: "center",
        gap: "0.6rem",
      }}
    >
      <CharAvatar name={m.name} avatarUrl={m.avatarUrl} size="md" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, color: "var(--foreground)", fontSize: "0.88rem" }}>
          {m.name}
          {m.model?.name && (
            <span
              style={{
                marginLeft: 6,
                fontSize: "0.6rem",
                padding: "0.1rem 0.35rem",
                borderRadius: 10,
                background: "rgba(201,168,76,0.12)",
                color: "var(--accent)",
                fontFamily: "sans-serif",
                verticalAlign: "middle",
              }}
            >
              {m.model.name}
            </span>
          )}
        </div>
        <div style={{ color: "var(--muted)", fontSize: "0.75rem" }}>
          {m.race} {m.className} Lv{m.level}
        </div>
        <HpBar cur={m.hpCurrent} max={m.hpMax} />
        <div style={{ color: "var(--muted)", fontSize: "0.72rem", marginTop: 2 }}>
          {m.hpCurrent}/{m.hpMax} HP
        </div>
      </div>
    </div>
  );
}

// ─── Phase badge ──────────────────────────────────────────────────────────────

function PhaseBadge({ phase }: { phase?: string }) {
  const p = (phase ?? "").toLowerCase();
  let color = "var(--accent)";
  let bg = "rgba(138,112,51,0.18)";
  let border = "#8a7033";
  let label = phase ? phase.replace(/_/g, " ") : "Forming";

  if (p.includes("combat")) { color = "#c43c3c"; bg = "rgba(139,32,32,0.25)"; border = "#8b2020"; label = "Combat"; }
  else if (p.includes("explor")) { color = "#5b9bd5"; bg = "rgba(45,74,107,0.25)"; border = "#2d4a6b"; label = "Exploration"; }
  else if (p.includes("roleplay")) { color = "#4caf50"; bg = "rgba(45,107,63,0.25)"; border = "#2d6b3f"; label = "Roleplay"; }
  else if (p.includes("town")) { color = "#4caf50"; bg = "rgba(45,107,63,0.2)"; border = "#2d6b3f"; label = "Town"; }

  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.12rem 0.5rem",
        borderRadius: 4,
        fontFamily: "var(--font-heading)",
        fontSize: "0.68rem",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        background: bg,
        color,
        border: `1px solid ${border}`,
      }}
    >
      {label}
    </span>
  );
}

// ─── Event renderers ──────────────────────────────────────────────────────────

function EvChat({ d, ts }: { d: Record<string, unknown>; ts: string }): ReactNode {
  const name = str(d.speakerName) || "Unknown";
  const col = charColor(name);
  const avatarUrl = str(d.avatarUrl) || undefined;
  return (
    <div className="flex gap-3 items-start" style={{ padding: "0.5rem 0.6rem" }}>
      <CharAvatar name={name} avatarUrl={avatarUrl} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            background: "oklch(0.14 0.01 270)",
            border: "1px solid var(--border)",
            borderRadius: "2px 10px 10px 10px",
            padding: "0.55rem 0.9rem",
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "0.82rem",
              fontWeight: 600,
              color: col,
              marginBottom: "0.2rem",
              letterSpacing: "0.03em",
            }}
          >
            {name}
          </div>
          <div className="prose-narrative" style={{ fontSize: "1rem", lineHeight: 1.7 }}>
            {str(d.message)}
          </div>
          <div style={{ fontSize: "0.65rem", color: "var(--muted)", marginTop: "0.25rem" }}>
            {ts}
          </div>
        </div>
      </div>
    </div>
  );
}

function EvNarration({ d }: { d: Record<string, unknown> }): ReactNode {
  return (
    <div
      style={{
        borderLeft: "3px solid #8a7033",
        background: "linear-gradient(90deg, rgba(201,168,76,0.04), transparent)",
        padding: "0.9rem 1.1rem",
        margin: "0.5rem 0",
        borderRadius: "0 6px 6px 0",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "0.65rem",
          color: "#8a7033",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: "0.3rem",
        }}
      >
        Dungeon Master
      </div>
      <div className="prose-narrative" style={{ fontStyle: "italic", fontSize: "1rem", lineHeight: 1.8 }}>
        {str(d.text)}
      </div>
    </div>
  );
}

function EvNpcDialogue({ d }: { d: Record<string, unknown> }): ReactNode {
  return (
    <div
      style={{
        borderLeft: "3px solid #a47bd5",
        background: "linear-gradient(90deg, rgba(107,63,160,0.06), transparent)",
        padding: "0.7rem 1.1rem",
        margin: "0.35rem 0",
        borderRadius: "0 6px 6px 0",
      }}
    >
      <div style={{ color: "#a47bd5", fontFamily: "var(--font-heading)", fontSize: "0.82rem", marginBottom: "0.2rem" }}>
        {str(d.npcName) || "NPC"}
      </div>
      <div className="prose-narrative" style={{ fontStyle: "italic", fontSize: "0.95rem", lineHeight: 1.6 }}>
        "{str(d.dialogue)}"
      </div>
    </div>
  );
}

function EvCombatStart({ d }: { d: Record<string, unknown> }): ReactNode {
  const monsters = arr<Record<string, unknown>>(d.monsters);
  const initiative = arr<Record<string, unknown>>(d.initiative);
  const monsterNames = new Set(monsters.map((m) => str(m.name)));

  return (
    <div
      style={{
        border: "1px solid #8b2020",
        background: "linear-gradient(135deg, rgba(139,32,32,0.15), rgba(139,32,32,0.05))",
        borderRadius: 8,
        padding: "0.9rem 1.1rem",
        margin: "0.7rem 0",
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: "1.4rem", marginBottom: "0.2rem" }}>
        <Sword size={22} color="#c43c3c" style={{ display: "inline" }} />
      </div>
      <div
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "0.95rem",
          fontWeight: 700,
          color: "#c43c3c",
          textTransform: "uppercase",
          letterSpacing: "0.12em",
        }}
      >
        Combat Begins
      </div>
      {monsters.length > 0 && (
        <div style={{ fontSize: "0.82rem", color: "var(--muted)", marginTop: "0.2rem" }}>
          {monsters.map((m) => `${displayName(str(m.name))} (${num(m.hp)} HP, AC ${num(m.ac)})`).join(" · ")}
        </div>
      )}
      {initiative.length > 0 && (
        <div className="flex flex-wrap justify-center gap-1" style={{ marginTop: "0.5rem" }}>
          {initiative.map((i, idx) => {
            const isMon = monsterNames.has(str(i.name));
            return (
              <span
                key={idx}
                style={{
                  background: "rgba(0,0,0,0.3)",
                  border: `1px solid ${isMon ? "#8b2020" : "var(--border)"}`,
                  borderRadius: 4,
                  padding: "0.15rem 0.55rem",
                  fontSize: "0.75rem",
                }}
              >
                <span
                  style={{
                    fontFamily: "var(--font-heading)",
                    fontWeight: 700,
                    color: isMon ? "#c43c3c" : "var(--accent)",
                  }}
                >
                  {num(i.initiative)}
                </span>{" "}
                {isMon ? displayName(str(i.name)) : str(i.name)}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EvCombatEnd({ d }: { d: Record<string, unknown> }): ReactNode {
  return (
    <div
      style={{
        border: "1px solid #2d6b3f",
        background: "linear-gradient(135deg, rgba(45,107,63,0.12), rgba(45,107,63,0.04))",
        borderRadius: 8,
        padding: "0.7rem 1.1rem",
        margin: "0.7rem 0",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "0.88rem",
          fontWeight: 700,
          color: "#4caf50",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}
      >
        Combat Ends
      </div>
      {num(d.xpAwarded) > 0 && (
        <span
          style={{
            display: "inline-block",
            marginTop: "0.3rem",
            background: "rgba(201,168,76,0.14)",
            border: "1px solid #8a7033",
            borderRadius: 4,
            padding: "0.12rem 0.55rem",
            fontFamily: "var(--font-heading)",
            fontSize: "0.82rem",
            color: "var(--accent)",
          }}
        >
          +{num(d.xpAwarded)} XP
        </span>
      )}
    </div>
  );
}

function EvAttack({
  d,
  isMonster,
}: {
  d: Record<string, unknown>;
  isMonster: boolean;
}): ReactNode {
  const hit = bool(d.hit);
  const crit = bool(d.critical) || bool(d.crit);
  const damage = num(d.damage) || num(d.damageDealt);
  const attackerName = str(d.attackerName) || str(d.attacker) || (isMonster ? "Monster" : "Unknown");
  const targetName = str(d.targetName) || str(d.target) || "Unknown";
  const attackName = str(d.attackName) || str(d.attack) || "Attack";

  return (
    <div
      className="flex items-center gap-3"
      style={{
        padding: "0.45rem 0.7rem",
        margin: "0.25rem 0",
        background: "oklch(0.14 0.01 270)",
        borderRadius: 6,
        borderLeft: `3px solid ${hit ? (isMonster ? "#e85555" : "#c43c3c") : "#4a4a5a"}`,
        opacity: hit ? 1 : 0.75,
      }}
    >
      <Sword
        size={18}
        color={hit ? (isMonster ? "#e85555" : "#c43c3c") : "#4a4a5a"}
        style={{ flexShrink: 0 }}
      />
      <div style={{ flex: 1, fontSize: "0.88rem" }}>
        <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{attackerName}</span>
        <span style={{ color: "var(--muted)" }}> → </span>
        <span style={{ color: "var(--muted)" }}>{targetName}</span>
        <span style={{ color: "var(--muted)" }}> — {attackName}</span>
      </div>
      {crit && (
        <span
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "0.6rem",
            fontWeight: 700,
            background: "#8b2020",
            color: "#fff",
            padding: "0.1rem 0.35rem",
            borderRadius: 3,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Crit
        </span>
      )}
      <span
        style={{
          fontFamily: "var(--font-heading)",
          fontWeight: 700,
          fontSize: "0.95rem",
          minWidth: 36,
          textAlign: "center",
          color: hit ? (isMonster ? "#e85555" : "#c43c3c") : "var(--muted)",
        }}
      >
        {hit ? damage : "Miss"}
      </span>
    </div>
  );
}

function EvCheck({
  d,
  label,
}: {
  d: Record<string, unknown>;
  label: string;
}): ReactNode {
  const roll = num(d.roll) || num(d.result);
  const dc = num(d.dc);
  const success = bool(d.success) || bool(d.passed);
  const characterName = str(d.characterName) || str(d.character) || "Unknown";
  const checkType = str(d.checkType) || str(d.skill) || str(d.ability) || label;
  const nat20 = roll === 20;
  const nat1 = roll === 1;

  return (
    <div
      className="flex items-center gap-3"
      style={{
        padding: "0.45rem 0.7rem",
        margin: "0.25rem 0",
        background: "oklch(0.14 0.01 270)",
        borderRadius: 6,
        borderLeft: `3px solid ${success ? "#4caf50" : "#c43c3c"}`,
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: "50%",
          background: success ? "rgba(45,107,63,0.2)" : "rgba(139,32,32,0.2)",
          border: `1px solid ${success ? "#2d6b3f" : "#8b2020"}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontFamily: "var(--font-heading)",
            fontWeight: 700,
            fontSize: "0.7rem",
            color: nat20 ? "var(--accent)" : nat1 ? "#e85555" : "var(--foreground)",
          }}
        >
          {roll || "?"}
        </span>
      </div>
      <div style={{ flex: 1, fontSize: "0.88rem" }}>
        <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{characterName}</span>
        <span
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "0.68rem",
            color: "var(--muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginLeft: 6,
          }}
        >
          {checkType}
          {dc > 0 ? ` DC ${dc}` : ""}
        </span>
      </div>
      {success ? (
        <CheckCircle size={16} color="#4caf50" />
      ) : (
        <XCircle size={16} color="#c43c3c" />
      )}
    </div>
  );
}

function EvDeathSave({ d }: { d: Record<string, unknown> }): ReactNode {
  const name = str(d.characterName) || str(d.character) || "Unknown";
  const success = bool(d.success);
  const successes = num(d.totalSuccesses);
  const failures = num(d.totalFailures);

  return (
    <div
      className="flex items-center gap-3"
      style={{
        padding: "0.55rem 0.7rem",
        margin: "0.25rem 0",
        background: "linear-gradient(90deg, rgba(139,32,32,0.12), transparent)",
        borderRadius: 6,
        borderLeft: "3px solid #8b2020",
      }}
    >
      <Skull size={20} color="#c43c3c" style={{ flexShrink: 0, animation: "pulse 1.5s ease-in-out infinite" }} />
      <div style={{ flex: 1, fontSize: "0.88rem" }}>
        <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{name}</span>
        <span style={{ color: "var(--muted)" }}> death save — </span>
        <span style={{ color: success ? "#4caf50" : "#c43c3c", fontWeight: 600 }}>
          {success ? "Success" : "Failure"}
        </span>
      </div>
      {(successes > 0 || failures > 0) && (
        <div className="flex gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <span
              key={`s${i}`}
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                border: "1px solid var(--border)",
                background: i < successes ? "#4caf50" : "transparent",
                display: "inline-block",
              }}
            />
          ))}
          <span style={{ margin: "0 2px" }} />
          {Array.from({ length: 3 }).map((_, i) => (
            <span
              key={`f${i}`}
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                border: "1px solid var(--border)",
                background: i < failures ? "#c43c3c" : "transparent",
                display: "inline-block",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EvHeal({ d }: { d: Record<string, unknown> }): ReactNode {
  const healer = str(d.healerName) || str(d.healer) || "Unknown";
  const target = str(d.targetName) || str(d.target) || healer;
  const amount = num(d.amount) || num(d.hpRestored);
  return (
    <div className="flex items-center gap-2" style={{ padding: "0.35rem 0.7rem", margin: "0.2rem 0", fontSize: "0.88rem" }}>
      <Heartbeat size={16} color="#4caf50" style={{ flexShrink: 0 }} />
      <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{healer}</span>
      {target !== healer && <span style={{ color: "var(--muted)" }}>→ {target}</span>}
      <span style={{ color: "#4caf50", fontFamily: "var(--font-heading)", fontWeight: 700 }}>
        +{amount} HP
      </span>
    </div>
  );
}

function EvSpell({ d }: { d: Record<string, unknown> }): ReactNode {
  const caster = str(d.casterName) || str(d.caster) || "Unknown";
  const spellName = str(d.spellName) || str(d.spell) || "Spell";
  const target = str(d.targetName) || str(d.target);
  return (
    <div className="flex items-center gap-2" style={{ padding: "0.35rem 0.7rem", margin: "0.2rem 0", fontSize: "0.88rem" }}>
      <Sparkle size={15} color="#a47bd5" style={{ flexShrink: 0 }} />
      <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{caster}</span>
      <span style={{ color: "var(--muted)" }}>casts</span>
      <span style={{ color: "#a47bd5", fontStyle: "italic" }}>{spellName}</span>
      {target && <span style={{ color: "var(--muted)" }}>on {target}</span>}
    </div>
  );
}

function EvRoom({ d }: { d: Record<string, unknown> }): ReactNode {
  const roomName = str(d.roomName) || str(d.name) || "Unknown Room";
  return (
    <div style={{ textAlign: "center", padding: "0.6rem 0", margin: "0.55rem 0", position: "relative" }}>
      <div
        style={{
          position: "absolute",
          top: "50%",
          left: 0,
          right: 0,
          height: 1,
          background: "linear-gradient(90deg, transparent, var(--border), transparent)",
        }}
      />
      <span
        style={{
          position: "relative",
          background: "var(--surface)",
          padding: "0 0.8rem",
          fontFamily: "var(--font-heading)",
          fontSize: "0.88rem",
          color: "#8a7033",
        }}
      >
        <DoorOpen size={12} style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }} />
        {displayName(roomName)}
      </span>
    </div>
  );
}

function EvLevelUp({ d }: { d: Record<string, unknown> }): ReactNode {
  const name = str(d.characterName) || str(d.character) || "Unknown";
  const level = num(d.newLevel) || num(d.level);
  return (
    <div
      style={{
        textAlign: "center",
        padding: "0.65rem",
        margin: "0.45rem 0",
        background: "linear-gradient(135deg, rgba(201,168,76,0.1), rgba(201,168,76,0.03))",
        border: "1px solid #3d3520",
        borderRadius: 8,
      }}
    >
      <ArrowCircleUp size={18} color="var(--accent)" style={{ display: "inline", marginRight: 6, verticalAlign: "middle" }} />
      <span
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "0.88rem",
          color: "var(--accent)",
        }}
      >
        <strong>{name}</strong> reached level {level}!
      </span>
    </div>
  );
}

function EvLoot({ d }: { d: Record<string, unknown> }): ReactNode {
  const character = str(d.characterName) || str(d.character);
  const items = arr<Record<string, unknown>>(d.items);
  const gold = num(d.gold) || num(d.amount);
  const itemName = str(d.itemName) || str(d.item);
  return (
    <div
      className="flex items-center gap-2"
      style={{
        padding: "0.4rem 0.7rem",
        margin: "0.25rem 0",
        background: "linear-gradient(90deg, rgba(201,168,76,0.06), transparent)",
        borderRadius: 6,
        fontSize: "0.88rem",
      }}
    >
      <Package size={15} color="var(--accent)" style={{ flexShrink: 0 }} />
      {character && <span style={{ fontWeight: 600, color: "var(--foreground)" }}>{character}</span>}
      {gold > 0 && (
        <span>
          <Coins size={13} color="var(--accent)" style={{ display: "inline", marginRight: 3 }} />
          <span style={{ color: "var(--accent)", fontFamily: "var(--font-heading)", fontWeight: 700 }}>
            {gold}gp
          </span>
        </span>
      )}
      {itemName && (
        <span style={{ color: "#e8d48b", fontStyle: "italic" }}>{itemName}</span>
      )}
      {items.length > 0 && (
        <span style={{ color: "#e8d48b", fontStyle: "italic" }}>
          {items.map((i) => str(i.name) || str(i)).join(", ")}
        </span>
      )}
    </div>
  );
}

function EvSessionMark({ label }: { label: string }): ReactNode {
  return (
    <div style={{ textAlign: "center", padding: "0.85rem 0", margin: "0.7rem 0" }}>
      <div className="flex items-center justify-center gap-2">
        <div style={{ width: 55, height: 1, background: "linear-gradient(90deg, transparent, #8a7033, transparent)" }} />
        <span
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "0.72rem",
            color: "#8a7033",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
          }}
        >
          {label}
        </span>
        <div style={{ width: 55, height: 1, background: "linear-gradient(90deg, #8a7033, transparent)" }} />
      </div>
    </div>
  );
}

function EvGeneric({ type, d, ts }: { type: string; d: Record<string, unknown>; ts: string }): ReactNode {
  const summary = str(d.message) || str(d.text) || str(d.description) || "";
  return (
    <div style={{ padding: "0.25rem 0.7rem", margin: "0.15rem 0", fontSize: "0.82rem", color: "var(--muted)" }}>
      <span
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "0.65rem",
          color: "#8a7033",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginRight: "0.4rem",
        }}
      >
        {type.replace(/_/g, " ")}
      </span>
      {summary || <em>–</em>}
      {ts && <span style={{ marginLeft: 6, fontSize: "0.65rem", opacity: 0.6 }}>{ts}</span>}
    </div>
  );
}

// ─── Event dispatcher ─────────────────────────────────────────────────────────

function renderEvent(e: GameEvent): ReactNode {
  const d = e.data ?? {};
  const ts = timeStr(e.timestamp);

  switch (e.type) {
    case "chat":          return <EvChat key={e.id} d={d} ts={ts} />;
    case "narration":     return <EvNarration key={e.id} d={d} />;
    case "npc_dialogue":  return <EvNpcDialogue key={e.id} d={d} />;
    case "combat_start":  return <EvCombatStart key={e.id} d={d} />;
    case "combat_end":    return <EvCombatEnd key={e.id} d={d} />;
    case "attack":        return <EvAttack key={e.id} d={d} isMonster={false} />;
    case "monster_attack":return <EvAttack key={e.id} d={d} isMonster={true} />;
    case "ability_check": return <EvCheck key={e.id} d={d} label="Ability Check" />;
    case "saving_throw":  return <EvCheck key={e.id} d={d} label="Saving Throw" />;
    case "skill_check":   return <EvCheck key={e.id} d={d} label="Skill Check" />;
    case "death_save":    return <EvDeathSave key={e.id} d={d} />;
    case "heal":          return <EvHeal key={e.id} d={d} />;
    case "spell_cast":    return <EvSpell key={e.id} d={d} />;
    case "room_enter":    return <EvRoom key={e.id} d={d} />;
    case "level_up":      return <EvLevelUp key={e.id} d={d} />;
    case "loot":
    case "loot_drop":
    case "room_loot":
    case "pickup":
    case "gold_award":    return <EvLoot key={e.id} d={d} />;
    case "session_start": return <EvSessionMark key={e.id} label="Session Begins" />;
    case "session_end":   return <EvSessionMark key={e.id} label="Session Ends" />;
    case "campaign_created": return <EvSessionMark key={e.id} label="Campaign Created" />;
    default:              return <EvGeneric key={e.id} type={e.type} d={d} ts={ts} />;
  }
}

// ─── Loading / empty states ───────────────────────────────────────────────────

function LoadingFeed() {
  return (
    <div style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
      <p
        className="prose-narrative"
        style={{ fontStyle: "italic", fontSize: "1.1rem", color: "var(--muted)" }}
      >
        Unrolling the scroll…
      </p>
      <div className="space-y-3 mt-6">
        {[100, 80, 90, 70].map((w, i) => (
          <Skeleton key={i} className={`h-10 w-[${w}%] rounded-lg`} />
        ))}
      </div>
    </div>
  );
}

function EmptyFeed({ hasSession }: { hasSession: boolean }) {
  if (!hasSession) {
    return (
      <div style={{ padding: "4rem 2rem", textAlign: "center" }}>
        <Scroll size={40} color="#8a7033" style={{ margin: "0 auto 1rem", opacity: 0.5 }} />
        <p
          className="prose-narrative"
          style={{ fontStyle: "italic", fontSize: "1.05rem", color: "var(--muted)", lineHeight: 1.8 }}
        >
          Waiting for the next beat.
        </p>
        <p style={{ color: "var(--muted)", fontSize: "0.82rem", marginTop: "0.75rem" }}>
          Select a session from the sidebar to watch it unfold.
        </p>
      </div>
    );
  }
  return (
    <div style={{ padding: "3rem 1.5rem", textAlign: "center" }}>
      <p
        className="prose-narrative"
        style={{ fontStyle: "italic", fontSize: "1.05rem", color: "var(--muted)" }}
      >
        Waiting for the next beat.
      </p>
    </div>
  );
}

// ─── EventFeed ────────────────────────────────────────────────────────────────

export interface EventFeedProps {
  events: GameEvent[];
  session: Session | null;
  party: Party | null;
  loading: boolean;
}

export function EventFeed({ events, session, party, loading }: EventFeedProps) {
  const members: Member[] = party?.members ?? [];

  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        overflow: "hidden",
        marginTop: "0.25rem",
      }}
    >
      {/* Session header */}
      <div
        className="flex items-center justify-between gap-3"
        style={{
          padding: "1.1rem 1.4rem",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <h2
          style={{
            fontFamily: "var(--font-heading)",
            fontSize: "1.15rem",
            color: session ? "var(--accent)" : "var(--muted)",
          }}
        >
          {session ? session.partyName : "Session Feed"}
        </h2>
        <div className="flex items-center gap-2">
          {session?.phase && <PhaseBadge phase={session.phase} />}
          {session && (
            <span
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: "0.72rem",
                color: "var(--muted)",
                letterSpacing: "0.05em",
              }}
            >
              {events.length} events
            </span>
          )}
        </div>
      </div>

      {/* Member grid */}
      {members.length > 0 && (
        <div
          style={{
            padding: "0.7rem 1.1rem",
            borderBottom: "1px solid var(--border)",
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.5rem",
          }}
        >
          {members.map((m) => (
            <MemberDetailCard key={m.name} m={m} />
          ))}
        </div>
      )}

      {/* Event feed body */}
      {loading ? (
        <LoadingFeed />
      ) : events.length === 0 ? (
        <EmptyFeed hasSession={!!session} />
      ) : (
        <div
          style={{
            maxHeight: "70vh",
            overflowY: "auto",
            padding: "0.6rem",
            scrollBehavior: "smooth",
            scrollbarWidth: "thin",
            scrollbarColor: "var(--border) transparent",
          }}
        >
          {events.map(renderEvent)}
        </div>
      )}
    </div>
  );
}
