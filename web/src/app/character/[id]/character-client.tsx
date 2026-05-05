"use client";

import { useCallback, useEffect, useState } from "react";
import { Avatar, Card, Chip, Separator, Skeleton } from "@heroui/react";
import {
  Sword,
  Target,
  UserCircle,
  Coins,
  Skull,
  Shield,
  Heart,
  Lightning,
  Scroll,
  Door,
  DiceFive,
  Trophy,
  CastleTurret,
  ArrowLeft,
} from "@phosphor-icons/react";
import Link from "next/link";
import { API_BASE } from "@/lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AbilityScores {
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
}

interface Equipment {
  weapon?: string;
  armor?: string;
  shield?: string;
}

interface Model {
  name?: string;
  provider?: string;
}

interface JournalEvent {
  id?: string;
  type: string;
  data?: Record<string, unknown>;
  timestamp?: string;
}

interface CharacterData {
  id: string;
  name: string;
  class: string;
  race: string;
  level: number;
  xp: number;
  gold?: number;
  avatarUrl?: string;
  description?: string;
  backstory?: string;
  personality?: string;
  isAlive?: boolean;
  ac?: number;
  hpCurrent?: number;
  hpMax?: number;
  abilityScores?: AbilityScores;
  equipment?: Equipment;
  inventory?: string[];
  features?: string[];
  proficiencies?: string[];
  monstersKilled?: number;
  dungeonsCleared?: number;
  sessionsPlayed?: number;
  totalDamageDealt?: number;
  criticalHits?: number;
  timesKnockedOut?: number;
  model?: Model;
  flaw?: string;
  bond?: string;
  ideal?: string;
  fear?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CLASS_COLORS: Record<string, string> = {
  fighter: "#c9a84c",
  wizard: "#5b9bd5",
  rogue: "#4caf50",
  cleric: "#f0ece4",
  ranger: "#2d6b3f",
  paladin: "#e8d48b",
  warlock: "#6b3fa0",
  bard: "#e8b84c",
  barbarian: "#c43c3c",
  monk: "#8a7033",
  sorcerer: "#a47bd5",
  druid: "#4caf50",
};

const XP_THRESHOLDS = [0, 300, 900, 2700, 6500, 14000];

function getClassColor(cls: string): string {
  return CLASS_COLORS[cls.toLowerCase()] ?? "#c9a84c";
}

function safeUrl(url: unknown): string | null {
  if (typeof url !== "string" || !url) return null;
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function mod(score: number): string {
  const m = Math.floor((score - 10) / 2);
  return m >= 0 ? `+${m}` : `${m}`;
}

function xpProgress(xp: number, level: number) {
  const next = XP_THRESHOLDS[level] ?? XP_THRESHOLDS[XP_THRESHOLDS.length - 1];
  const prev = XP_THRESHOLDS[level - 1] ?? 0;
  const pct = next > prev ? Math.min(100, Math.round(((xp - prev) / (next - prev)) * 100)) : 100;
  return { pct, label: `${xp.toLocaleString()} / ${next.toLocaleString()} XP` };
}

const EVENT_ICONS: Record<string, React.ReactNode> = {
  combat_end: <Sword size={16} weight="fill" />,
  monster_killed: <Skull size={16} weight="fill" />,
  level_up: <Lightning size={16} weight="fill" />,
  session_end: <Trophy size={16} weight="fill" />,
  room_entered: <Door size={16} weight="fill" />,
  skill_check: <DiceFive size={16} weight="fill" />,
  death_save: <Skull size={16} />,
  character_down: <Heart size={16} weight="fill" />,
  character_revived: <Heart size={16} />,
  loot_drop: <Coins size={16} weight="fill" />,
  quest_completed: <Trophy size={16} />,
  dungeon_cleared: <CastleTurret size={16} weight="fill" />,
};

const EVENT_LABELS: Record<string, string> = {
  combat_end: "Combat Ended",
  monster_killed: "Monster Slain",
  level_up: "Level Up",
  session_end: "Session Ended",
  room_entered: "Room Explored",
  skill_check: "Skill Check",
  death_save: "Death Save",
  character_down: "Knocked Out",
  character_revived: "Revived",
  loot_drop: "Loot Found",
  quest_completed: "Quest Completed",
  dungeon_cleared: "Dungeon Cleared",
};

const NOTABLE_EVENTS = new Set(Object.keys(EVENT_LABELS));

function eventDetail(ev: JournalEvent): string {
  const d = ev.data || {};
  if (ev.type === "monster_killed" && d.monsterName) return String(d.monsterName);
  if (ev.type === "level_up" && d.newLevel) return `Reached level ${d.newLevel}`;
  if (ev.type === "skill_check" && d.skill)
    return `${d.skill}${d.success != null ? (d.success ? " ✔" : " ✘") : ""}`;
  if (ev.type === "room_entered" && d.roomName) return String(d.roomName);
  if (ev.type === "loot_drop" && d.item) return String(d.item);
  if (d.description) return String(d.description);
  return "";
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <Skeleton style={{ height: 14, width: 120, borderRadius: 4, marginBottom: "1.5rem" }} />
      <div style={{ display: "flex", gap: "1.5rem", alignItems: "center", marginBottom: "2rem" }}>
        <Skeleton style={{ width: 80, height: 80, borderRadius: "50%", flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <Skeleton style={{ height: 24, width: "50%", borderRadius: 4, marginBottom: 8 }} />
          <Skeleton style={{ height: 14, width: "30%", borderRadius: 4, marginBottom: 8 }} />
          <Skeleton style={{ height: 6, width: 200, borderRadius: 3 }} />
        </div>
      </div>
      <Skeleton style={{ height: 180, borderRadius: 8, marginBottom: "1rem" }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1rem" }}>
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} style={{ height: 80, borderRadius: 8 }} />
        ))}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CharacterDetailClient({ characterId }: { characterId: string }) {
  const [char, setChar] = useState<CharacterData | null>(null);
  const [journal, setJournal] = useState<JournalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/spectator/characters/${characterId}`);
      if (!res.ok) throw new Error("Not found");
      const data = await res.json();
      setChar(data);

      // Load journal separately — non-fatal
      try {
        const jRes = await fetch(`${API_BASE}/spectator/journals/${characterId}`);
        if (jRes.ok) {
          const jData = await jRes.json();
          setJournal(jData.events ?? []);
        }
      } catch {
        /* journal is optional */
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingSkeleton />;

  if (error || !char) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8" style={{ textAlign: "center", paddingTop: "6rem" }}>
        <Skull size={48} color="var(--border)" weight="duotone" style={{ marginBottom: "1rem" }} />
        <p className="prose-narrative" style={{ color: "var(--muted)", fontSize: "1.15rem" }}>
          This adventurer has vanished from the ledger…
        </p>
        <Link
          href="/characters"
          style={{
            color: "var(--accent)",
            fontFamily: "var(--font-heading)",
            fontSize: "0.85rem",
            marginTop: "1rem",
            display: "inline-block",
          }}
        >
          ← Back to Characters
        </Link>
      </div>
    );
  }

  const color = getClassColor(char.class || "");
  const avatarSrc = safeUrl(char.avatarUrl);
  const { pct, label } = xpProgress(char.xp ?? 0, char.level ?? 1);
  const abilities = char.abilityScores ?? {};
  const equip = char.equipment ?? {};
  const equipped = [equip.weapon, equip.armor, equip.shield].filter(Boolean) as string[];
  const inventory = char.inventory ?? [];

  const traits = [
    { label: "Flaw", value: char.flaw, icon: "⚠️" },
    { label: "Bond", value: char.bond, icon: "🤝" },
    { label: "Ideal", value: char.ideal, icon: "✨" },
    { label: "Fear", value: char.fear, icon: "👻" },
  ].filter((t) => t.value);

  const adventureEvents = journal
    .filter((e) => NOTABLE_EVENTS.has(e.type))
    .reverse()
    .slice(0, 30);

  const journalEntries = journal
    .filter((e) => e.type === "journal_entry" && e.data?.content)
    .reverse();

  const combatStats = [
    { num: char.monstersKilled ?? 0, label: "Monsters Killed" },
    { num: char.dungeonsCleared ?? 0, label: "Dungeons Cleared" },
    { num: char.sessionsPlayed ?? 0, label: "Sessions Played" },
    { num: char.totalDamageDealt ?? 0, label: "Total Damage" },
    { num: char.criticalHits ?? 0, label: "Critical Hits" },
    { num: char.timesKnockedOut ?? 0, label: "Times KO'd" },
  ];

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Back link */}
      <Link
        href="/characters"
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "0.85rem",
          color: "var(--muted)",
          textDecoration: "none",
          display: "inline-flex",
          alignItems: "center",
          gap: "0.3rem",
          marginBottom: "1.5rem",
        }}
      >
        <ArrowLeft size={14} /> Back to Characters
      </Link>

      {/* ── Character Header ───────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "1.5rem", marginBottom: "2rem", flexWrap: "wrap" }}>
        <Avatar style={{ width: 80, height: 80, flexShrink: 0 }}>
          {avatarSrc ? <Avatar.Image src={avatarSrc} alt={char.name} /> : null}
          <Avatar.Fallback
            style={{
              background: color,
              color: "#0a0a0f",
              fontFamily: "var(--font-heading)",
              fontWeight: 900,
              fontSize: "2rem",
            }}
          >
            {(char.name || "?")[0].toUpperCase()}
          </Avatar.Fallback>
        </Avatar>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <h1
              style={{
                fontFamily: "var(--font-heading)",
                color: "var(--accent)",
                fontSize: "1.875rem",
                fontWeight: 700,
              }}
            >
              {char.name}
            </h1>
            {char.isAlive === false && (
              <Skull size={20} color="var(--danger)" weight="fill" aria-label="Deceased" />
            )}
            {char.model?.name && (
              <span
                style={{
                  fontSize: "0.65rem",
                  padding: "0.15rem 0.4rem",
                  borderRadius: 3,
                  background: "rgba(201,168,76,0.15)",
                  color: "var(--muted)",
                  fontFamily: "var(--font-heading)",
                  letterSpacing: "0.04em",
                }}
              >
                {char.model.name}
              </span>
            )}
          </div>

          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.4rem" }}>
            <Chip size="sm" variant="soft" style={{ background: "rgba(201,168,76,0.1)", color: "var(--accent)", border: "1px solid var(--border)" }}>
              {char.race} {char.class}
            </Chip>
            <Chip size="sm" variant="soft" color="accent">
              Level {char.level}
            </Chip>
            {char.gold != null && (
              <Chip size="sm" variant="soft" style={{ background: "rgba(201,168,76,0.1)", color: "var(--accent)", border: "1px solid var(--border)" }}>
                <Coins size={12} weight="fill" style={{ marginRight: 4 }} />
                {char.gold} gold
              </Chip>
            )}
          </div>

          {/* XP Bar */}
          <div style={{ maxWidth: 220, marginTop: "0.6rem" }}>
            <div
              style={{
                height: 6,
                background: "var(--surface-secondary, var(--surface))",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${pct}%`,
                  background: color,
                  borderRadius: 3,
                  transition: "width 0.4s ease",
                }}
              />
            </div>
            <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{label}</span>
          </div>
        </div>
      </div>

      {/* ── Character Traits ───────────────────────────────────── */}
      {traits.length > 0 && (
        <>
          <h2
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "1.1rem",
              color: "var(--accent)",
              marginBottom: "0.5rem",
            }}
          >
            Character Traits
          </h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: "0.8rem",
              marginBottom: "1.5rem",
            }}
          >
            {traits.map((t) => (
              <Card key={t.label} style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <Card.Content style={{ padding: "1rem" }}>
                  <div
                    style={{
                      fontFamily: "var(--font-heading)",
                      fontSize: "0.75rem",
                      color: "var(--muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      marginBottom: "0.3rem",
                    }}
                  >
                    {t.icon} {t.label}
                  </div>
                  <div style={{ fontSize: "0.95rem", color: "var(--foreground)", lineHeight: 1.6 }}>
                    {t.value}
                  </div>
                </Card.Content>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* ── Ability Scores / Stat Block ────────────────────────── */}
      <Card
        style={{
          background: "#1a1816",
          border: "2px solid var(--accent)",
          borderRadius: 8,
          marginBottom: "1.5rem",
        }}
      >
        <Card.Content style={{ padding: "1.5rem" }}>
          <h3
            style={{
              fontFamily: "var(--font-heading)",
              color: "var(--accent)",
              fontSize: "1rem",
              textAlign: "center",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              marginBottom: "1rem",
            }}
          >
            Ability Scores
          </h3>
          <div style={{ display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: "0.8rem", marginBottom: "1rem" }}>
            {(["str", "dex", "con", "int", "wis", "cha"] as const).map((a) => {
              const val = abilities[a] ?? 10;
              return (
                <div key={a} style={{ textAlign: "center", minWidth: 60 }}>
                  <div
                    style={{
                      fontFamily: "var(--font-heading)",
                      fontSize: "0.7rem",
                      color: "var(--muted)",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                    }}
                  >
                    {a.toUpperCase()}
                  </div>
                  <div
                    style={{
                      fontFamily: "var(--font-heading)",
                      fontSize: "1.5rem",
                      fontWeight: 700,
                      color: "var(--foreground)",
                    }}
                  >
                    {val}
                  </div>
                  <div style={{ fontSize: "0.85rem", color: "var(--accent)" }}>({mod(val)})</div>
                </div>
              );
            })}
          </div>

          <Separator style={{ opacity: 0.2, marginBottom: "0.8rem" }} />

          <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem" }}>
            <StatItem label="AC" value={char.ac ?? "?"} icon={<Shield size={14} weight="fill" />} />
            <StatItem
              label="HP"
              value={`${char.hpCurrent ?? "?"} / ${char.hpMax ?? "?"}`}
              icon={<Heart size={14} weight="fill" />}
            />
            {equip.weapon && <StatItem label="Weapon" value={equip.weapon} icon={<Sword size={14} weight="fill" />} />}
            {equip.armor && <StatItem label="Armor" value={equip.armor} icon={<Shield size={14} />} />}
            {equip.shield && <StatItem label="Shield" value={equip.shield} icon={<Shield size={14} weight="duotone" />} />}
          </div>

          {/* Features */}
          {(char.features ?? []).length > 0 && (
            <div style={{ marginTop: "0.8rem", paddingTop: "0.8rem", borderTop: "1px solid rgba(201,168,76,0.15)" }}>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: "0.7rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.4rem" }}>
                Features
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
                {char.features!.map((f) => (
                  <Chip
                    key={f}
                    size="sm"
                    style={{
                      background: "rgba(201,168,76,0.08)",
                      border: "1px solid var(--border)",
                      color: "var(--accent)",
                    }}
                  >
                    {f}
                  </Chip>
                ))}
              </div>
            </div>
          )}

          {/* Proficiencies */}
          {(char.proficiencies ?? []).length > 0 && (
            <div style={{ marginTop: "0.8rem", paddingTop: "0.8rem", borderTop: "1px solid rgba(201,168,76,0.15)" }}>
              <div style={{ fontFamily: "var(--font-heading)", fontSize: "0.7rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.3rem" }}>
                Proficiencies
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--muted)" }}>
                {char.proficiencies!.join(", ")}
              </div>
            </div>
          )}
        </Card.Content>
      </Card>

      {/* ── Combat Stats Grid ──────────────────────────────────── */}
      <div
        className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6"
      >
        {combatStats.map((s) => (
          <Card key={s.label} style={{ background: "var(--surface)", border: "1px solid var(--border)", textAlign: "center" }}>
            <Card.Content style={{ padding: "1rem" }}>
              <div
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "1.8rem",
                  fontWeight: 700,
                  color: "var(--accent)",
                }}
              >
                {s.num}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-heading)",
                  fontSize: "0.7rem",
                  color: "var(--muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  marginTop: "0.2rem",
                }}
              >
                {s.label}
              </div>
            </Card.Content>
          </Card>
        ))}
      </div>

      {/* ── Inventory ──────────────────────────────────────────── */}
      {(equipped.length > 0 || inventory.length > 0) && (
        <>
          <h2
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "1.1rem",
              color: "var(--accent)",
              marginBottom: "0.5rem",
            }}
          >
            Inventory
          </h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginBottom: "1.5rem" }}>
            {equipped.map((item) => (
              <Chip
                key={item}
                size="sm"
                style={{
                  background: "rgba(201,168,76,0.1)",
                  border: "1px solid var(--accent)",
                  color: "var(--accent)",
                }}
              >
                <Sword size={12} style={{ marginRight: 4 }} /> {item}
              </Chip>
            ))}
            {inventory.map((item) => (
              <Chip
                key={item}
                size="sm"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--foreground)",
                }}
              >
                {item}
              </Chip>
            ))}
          </div>
        </>
      )}

      {/* ── Backstory ──────────────────────────────────────────── */}
      <h2
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "1.1rem",
          color: "var(--accent)",
          marginBottom: "0.5rem",
        }}
      >
        Backstory
      </h2>
      <Card style={{ background: "var(--surface)", border: "1px solid var(--border)", marginBottom: "1.5rem" }}>
        <Card.Content style={{ padding: "1.5rem" }}>
          <p className="prose-narrative" style={{ color: "var(--foreground)", fontStyle: "italic" }}>
            {char.backstory || "This character's story has yet to be written…"}
          </p>
        </Card.Content>
      </Card>

      {/* ── Personality ────────────────────────────────────────── */}
      {char.personality && (
        <>
          <h2
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "1.1rem",
              color: "var(--accent)",
              marginBottom: "0.5rem",
            }}
          >
            Personality
          </h2>
          <Card style={{ background: "var(--surface)", border: "1px solid var(--border)", marginBottom: "1.5rem" }}>
            <Card.Content style={{ padding: "1.5rem" }}>
              <p className="prose-narrative" style={{ color: "var(--foreground)", fontStyle: "italic" }}>
                {char.personality}
              </p>
            </Card.Content>
          </Card>
        </>
      )}

      {/* ── Adventure Log ──────────────────────────────────────── */}
      {adventureEvents.length > 0 && (
        <>
          <h2
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "1.1rem",
              color: "var(--accent)",
              marginBottom: "0.5rem",
            }}
          >
            Adventure Log
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", marginBottom: "1.5rem" }}>
            {adventureEvents.map((ev, i) => {
              const detail = eventDetail(ev);
              const ts = ev.timestamp
                ? new Date(ev.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                : "";
              return (
                <div
                  key={ev.id ?? i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.8rem",
                    padding: "0.6rem 0.8rem",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    borderRadius: 6,
                  }}
                >
                  <span style={{ color: "var(--accent)", flexShrink: 0 }}>
                    {EVENT_ICONS[ev.type] ?? <Scroll size={16} />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        fontFamily: "var(--font-heading)",
                        fontSize: "0.8rem",
                        color: "var(--muted)",
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {EVENT_LABELS[ev.type] ?? ev.type.replace(/_/g, " ")}
                    </span>
                    {detail && (
                      <span style={{ fontSize: "0.9rem", color: "var(--foreground)", marginLeft: "0.5rem" }}>
                        {detail}
                      </span>
                    )}
                  </div>
                  {ts && (
                    <span style={{ fontSize: "0.75rem", color: "var(--muted)", flexShrink: 0 }}>{ts}</span>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* ── Journal Entries ────────────────────────────────────── */}
      {journalEntries.length > 0 && (
        <>
          <h2
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: "1.1rem",
              color: "var(--accent)",
              marginBottom: "0.5rem",
            }}
          >
            Journal
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", marginBottom: "1.5rem" }}>
            {journalEntries.map((entry, i) => {
              const ts = entry.timestamp
                ? new Date(entry.timestamp).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })
                : "";
              return (
                <Card key={entry.id ?? i} style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                  <Card.Content style={{ padding: "1.5rem" }}>
                    {ts && (
                      <div
                        style={{
                          fontFamily: "var(--font-heading)",
                          fontSize: "0.7rem",
                          color: "var(--muted)",
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          marginBottom: "0.4rem",
                        }}
                      >
                        {ts}
                      </div>
                    )}
                    <p className="prose-narrative" style={{ color: "var(--foreground)", fontStyle: "italic" }}>
                      {String(entry.data?.content ?? "")}
                    </p>
                  </Card.Content>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatItem({ label, value, icon }: { label: string; value: string | number; icon: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
      <span style={{ color: "var(--accent)" }}>{icon}</span>
      <span
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "0.7rem",
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
        }}
      >
        {label}
      </span>
      <span style={{ color: "var(--foreground)", fontWeight: 600, fontSize: "0.9rem" }}>{value}</span>
    </div>
  );
}
