#!/usr/bin/env bun
/**
 * Automated Session Scheduler — runs 3 games/day with different character strategies.
 *
 * Usage:
 *   bun run scripts/scheduler.ts --slot curated    # Slot 1: Rotating 12 fixed characters
 *   bun run scripts/scheduler.ts --slot fresh      # Slot 2: 4 brand-new characters
 *   bun run scripts/scheduler.ts --slot veterans   # Slot 3: Random existing characters
 *   bun run scripts/scheduler.ts --all             # All 3 sequentially
 */

const API = process.env.API_URL ?? "https://api.railroaded.ai";
const ADMIN_SECRET = process.env.ADMIN_SECRET;

if (!ADMIN_SECRET) {
  console.error("ADMIN_SECRET env var is required");
  process.exit(1);
}

// ── Types ──────────────────────────────────────────────────────────

interface RosterEntry {
  name: string;
  class: "fighter" | "rogue" | "cleric" | "wizard";
  race: "human" | "elf" | "dwarf" | "halfling" | "half-orc";
  personality: string;
  playstyle: string;
  avatarUrl: string | null;
  description: string;
  backstory: string;
}

interface PlayerSlot {
  entry: RosterEntry;
  username: string;
  token: string;
  userId: string;
  characterId?: string;
  isNew: boolean;
}

// ── Helpers ────────────────────────────────────────────────────────

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
}

function randomPick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function dateTag(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, "");
}

async function api(
  path: string,
  opts: { method?: string; token?: string; body?: unknown } = {}
): Promise<{ status: number; data: any }> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  const res = await fetch(`${API}${path}`, {
    method: opts.method ?? (opts.body ? "POST" : "GET"),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function adminLogin(username: string, role: "player" | "dm" = "player"): Promise<{ token: string; userId: string }> {
  const { status, data } = await api("/admin/login-as", {
    token: ADMIN_SECRET,
    body: { username, role },
  });
  if (status !== 200 || !data?.token) throw new Error(`admin login failed for ${username}: ${status} ${JSON.stringify(data)}`);
  return { token: data.token, userId: data.userId };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function log(msg: string): void {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ── Ability Scores ─────────────────────────────────────────────────

const CLASS_SCORES: Record<string, { str: number; dex: number; con: number; int: number; wis: number; cha: number }> = {
  fighter: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 },
  rogue:   { str: 10, dex: 16, con: 12, int: 14, wis: 12, cha: 10 },
  cleric:  { str: 14, dex: 10, con: 14, int: 10, wis: 16, cha: 10 },
  wizard:  { str: 8,  dex: 14, con: 12, int: 16, wis: 14, cha: 10 },
};

// ── Curated Roster (Slot 1) ────────────────────────────────────────

const CURATED_ROSTER: RosterEntry[] = [
  // --- FIGHTERS ---
  { name: "Vex Ironhand", class: "fighter", race: "half-orc",
    personality: "Stoic protector who leads from the front", playstyle: "aggressive",
    avatarUrl: "https://files.catbox.moe/2hu2tb.png",
    description: "A towering half-orc woman with ritual scars across her arms and an iron prosthetic left hand.",
    backstory: "Lost her hand in the siege of Greyhold. Replaced it with iron forged from her enemy's armor." },
  { name: "Kael Stormshield", class: "fighter", race: "human",
    personality: "Disciplined soldier who questions unjust orders", playstyle: "defensive",
    avatarUrl: null,
    description: "Broad-shouldered with close-cropped dark hair, a broken nose, and calm grey eyes.",
    backstory: "Deserted the king's army after being ordered to burn a village." },
  { name: "Ruk Ashborn", class: "fighter", race: "half-orc",
    personality: "Quiet honor-bound warrior who speaks rarely but means every word", playstyle: "aggressive",
    avatarUrl: null,
    description: "Bronze-scaled half-orc, nearly seven feet tall, with deep amber eyes and a scar from jaw to shoulder.",
    backstory: "Last survivor of Clan Ashborn, destroyed by a red dragon. Hunts the wyrm." },

  // --- ROGUES ---
  { name: "Zephyr Shadowstep", class: "rogue", race: "halfling",
    personality: "Mischievous and quick-witted, always looking for the clever way", playstyle: "stealth",
    avatarUrl: "https://files.catbox.moe/1etc62.png",
    description: "Small halfling woman with dark curly hair, quick brown eyes, and fingers never quite still.",
    backstory: "Grew up picking pockets in the Undercity. Now steals from people who deserve it." },
  { name: "Nyx Voidwalker", class: "rogue", race: "half-orc",
    personality: "Sardonic outsider who uses humor to deflect, fiercely loyal once trusted", playstyle: "aggressive",
    avatarUrl: null,
    description: "Lean half-orc with deep violet tattoos, short-cropped hair, and a tail-shaped earring.",
    backstory: "Raised by a thieves' guild that sold her out. Survived. Now trusts actions, never words." },
  { name: "Pip Copperkettle", class: "rogue", race: "halfling",
    personality: "Cheerful inventor-thief who disarms traps by understanding them", playstyle: "stealth",
    avatarUrl: null,
    description: "Tiny halfling with wild copper hair, magnifying goggles on his forehead, and a belt of lockpicks.",
    backstory: "Clockmaker's apprentice who realized locks are just clocks you open differently." },

  // --- CLERICS ---
  { name: "Thane Bloodforge", class: "cleric", race: "dwarf",
    personality: "Gruff healer who shows love through tough talk", playstyle: "support",
    avatarUrl: "https://files.catbox.moe/73tnap.png",
    description: "Stocky dwarf with braided copper beard streaked with grey, battered plate armor with a forge hammer holy symbol.",
    backstory: "Forge priest who learned healing when his battalion was ambushed with no medic." },
  { name: "Brother Cael", class: "cleric", race: "human",
    personality: "Serene pacifist who heals first and fights only when no other option exists", playstyle: "support",
    avatarUrl: null,
    description: "Tall, thin human with kind brown eyes, shaved head, and calloused hands from tending gardens and wounds.",
    backstory: "Monastery healer who left after a plague took everyone he couldn't save." },
  { name: "Sera Dawnkeeper", class: "cleric", race: "human",
    personality: "Fiery and righteous, smites evil with enthusiasm bordering on glee", playstyle: "aggressive",
    avatarUrl: null,
    description: "Human woman with warm brown skin, golden eyes, and close-cropped silver hair.",
    backstory: "First in eight generations to manifest celestial blood. Takes the responsibility personally." },

  // --- WIZARDS ---
  { name: "Lyra Moonwhisper", class: "wizard", race: "elf",
    personality: "Quietly curious, observes everything before acting", playstyle: "tactical",
    avatarUrl: "https://files.catbox.moe/10zk85.png",
    description: "Pale elf with silver-white hair cropped short and mismatched eyes — one grey, one luminous gold.",
    backstory: "Expelled from the Arcane Academy for experimenting with forbidden chronomancy." },
  { name: "Elara Frostweave", class: "wizard", race: "half-orc",
    personality: "Intensely focused researcher who gets excited about magical theory mid-combat", playstyle: "tactical",
    avatarUrl: null,
    description: "Wiry half-orc with ink-stained fingers, wild auburn hair, and spectacles she pushes up constantly.",
    backstory: "Thesis student who accidentally opened a portal to the Plane of Ice. Got expelled. Portal still open." },
  { name: "Thorn Ashwick", class: "wizard", race: "human",
    personality: "Cynical ex-court wizard, surprisingly gentle with commoners", playstyle: "tactical",
    avatarUrl: null,
    description: "Weathered human in his fifties with salt-and-pepper hair, deep-set dark eyes, and nicotine-stained fingers.",
    backstory: "Former royal court wizard who resigned after the prince he tutored became a tyrant." },
];

// ── Fresh Blood Generator (Slot 2) ────────────────────────────────

const NAME_PARTS: Record<string, { first: string[]; last: string[] }> = {
  fighter: {
    first: ["Gareth","Hilda","Orin","Brynn","Dax","Mira","Korv","Sigrid","Tomas","Asha"],
    last: ["Ironjaw","Shieldbreaker","Warhammer","Stonefist","Battleborn","Greyhelm","Axewing","Doomguard"],
  },
  rogue: {
    first: ["Whisper","Shade","Jinx","Flick","Raven","Sable","Dusk","Ember","Wren","Moth"],
    last: ["Nightveil","Quickfingers","Silentfoot","Lockhart","Ghostwalk","Daggerthorn","Shadowmere"],
  },
  cleric: {
    first: ["Father","Sister","Brother","Sage","Elder","Prior","Deacon","Abbott","Mother","Blessed"],
    last: ["Ashmore","Lightbringer","Sunkeeper","Greywater","Stoneprayer","Dawnward","Faithhold"],
  },
  wizard: {
    first: ["Aldric","Maelis","Corvus","Isolde","Fenris","Yara","Oberon","Selene","Grimald","Thessa"],
    last: ["Spellwright","Stormcaller","Inkblood","Runemark","Voidtouched","Starweaver","Ashmantle"],
  },
};

const RACE_POOL: Record<string, Array<"human" | "elf" | "dwarf" | "halfling" | "half-orc">> = {
  fighter: ["human", "half-orc", "dwarf", "human"],
  rogue: ["halfling", "elf", "halfling", "human", "half-orc"],
  cleric: ["human", "dwarf", "human", "dwarf"],
  wizard: ["elf", "elf", "human", "human", "halfling"],
};

const PERSONALITY_POOL: Record<string, string[]> = {
  fighter: [
    "Fearless and always first through the door",
    "Protective of allies above all else",
    "Calm under pressure, deadly when provoked",
    "Loves a good brawl and a better story",
  ],
  rogue: [
    "Sly and cunning, always has an exit plan",
    "Charming and persuasive when needed",
    "Quiet and observant, notices everything",
    "Thrill-seeker who can't resist a locked door",
  ],
  cleric: [
    "Compassionate healer with a sharp tongue",
    "Devout and unwavering in faith",
    "Practical medic who prays while patching wounds",
    "Gentle soul hiding a fierce protectiveness",
  ],
  wizard: [
    "Bookish and fascinated by arcane theory",
    "Practical spellcaster who treats magic like science",
    "Eccentric and prone to muttering about experiments",
    "Wise beyond years, speaks in careful riddles",
  ],
};

const BACKSTORY_POOL: Record<string, string[]> = {
  fighter: [
    "Former arena champion seeking worthy foes beyond the pit.",
    "Village defender who swore to hunt the raiders that burned their home.",
    "Ex-mercenary trying to use their sword for good this time.",
    "Blacksmith who picked up a blade after bandits killed the town guard.",
  ],
  rogue: [
    "Street urchin turned gentleman thief, only steals from the rich.",
    "Spy who burned their identity and now lives on the run.",
    "Locksmith's child who found the wrong side of the law more interesting.",
    "Treasure hunter searching for a legendary lost vault.",
  ],
  cleric: [
    "Battlefield medic who found faith in the blood and the mud.",
    "Pilgrim who heard a divine voice and walked into the wilds.",
    "Temple acolyte sent on a quest to prove their devotion.",
    "Healer who learned magic after medicine alone couldn't save their village.",
  ],
  wizard: [
    "Academy dropout who learned more from forbidden books than any lecture.",
    "Archivist whose curiosity led them to dangerous knowledge.",
    "Court wizard who left politics for the freedom of adventure.",
    "Self-taught mage from a remote village with no magical tradition.",
  ],
};

function generateFreshCharacter(cls: string): RosterEntry {
  const parts = NAME_PARTS[cls];
  const first = randomPick(parts.first);
  const last = randomPick(parts.last);
  const race = randomPick(RACE_POOL[cls]);
  const name = `${first} ${last}`;
  const avatarUrl = `https://api.dicebear.com/7.x/adventurer/png?seed=${encodeURIComponent(name)}&size=200`;
  return {
    name,
    class: cls as RosterEntry["class"],
    race,
    personality: randomPick(PERSONALITY_POOL[cls]),
    playstyle: cls === "cleric" ? "support" : cls === "wizard" ? "tactical" : randomPick(["aggressive", "defensive", "stealth"]),
    avatarUrl,
    description: `A ${race} ${cls} known as ${name}.`,
    backstory: randomPick(BACKSTORY_POOL[cls]),
  };
}

// ── Character Selection Strategies ─────────────────────────────────

async function pickCuratedParty(): Promise<RosterEntry[]> {
  const { data } = await api("/spectator/characters");
  const allChars: any[] = data?.characters ?? [];

  const enriched = CURATED_ROSTER.map((r) => ({
    ...r,
    sessionsPlayed: allChars.find((c: any) => c.name === r.name)?.sessionsPlayed ?? 0,
  }));

  const byClass: Record<string, typeof enriched> = { fighter: [], rogue: [], cleric: [], wizard: [] };
  for (const c of enriched) byClass[c.class].push(c);
  for (const cls of Object.keys(byClass)) {
    byClass[cls].sort((a, b) => a.sessionsPlayed - b.sessionsPlayed || a.name.localeCompare(b.name));
  }

  return [byClass.fighter[0], byClass.rogue[0], byClass.cleric[0], byClass.wizard[0]];
}

function pickFreshParty(): RosterEntry[] {
  return ["fighter", "rogue", "cleric", "wizard"].map(generateFreshCharacter);
}

async function pickVeteranParty(): Promise<RosterEntry[]> {
  const { data } = await api("/spectator/characters");
  const allChars: any[] = data?.characters ?? [];

  const byClass: Record<string, any[]> = { fighter: [], rogue: [], cleric: [], wizard: [] };
  for (const c of allChars) {
    if (byClass[c.class]) byClass[c.class].push(c);
  }

  const picked: RosterEntry[] = [];
  for (const cls of ["fighter", "rogue", "cleric", "wizard"]) {
    const pool = byClass[cls];
    if (pool.length === 0) {
      picked.push(generateFreshCharacter(cls));
    } else {
      const c = randomPick(pool);
      picked.push({
        name: c.name,
        class: c.class,
        race: c.race,
        personality: "",
        playstyle: "",
        avatarUrl: c.avatarUrl,
        description: c.description ?? "",
        backstory: "",
      });
    }
  }
  return picked;
}

// ── Player Setup ───────────────────────────────────────────────────

async function setupPlayer(entry: RosterEntry, slotPrefix: string): Promise<PlayerSlot> {
  const username = `${slotPrefix}-${slug(entry.name)}`;
  const { token, userId } = await adminLogin(username);
  log(`  Logged in as ${username} (${userId})`);

  // Check if character exists
  const { status, data } = await api("/player/status", { token });
  if (status === 200 && data?.character) {
    log(`  Character exists: ${data.character.name} (Lv${data.character.level})`);
    return { entry, username, token, userId, characterId: data.character.id, isNew: false };
  }

  // Create character
  const avatarUrl = entry.avatarUrl ?? `https://api.dicebear.com/7.x/adventurer/png?seed=${encodeURIComponent(entry.name)}&size=200`;
  const scores = CLASS_SCORES[entry.class];
  const { status: cStatus, data: cData } = await api("/player/character", {
    token,
    body: {
      name: entry.name,
      race: entry.race,
      class: entry.class,
      ability_scores: scores,
      backstory: entry.backstory,
      personality: entry.personality,
      playstyle: entry.playstyle,
      avatar_url: avatarUrl,
      description: entry.description,
    },
  });

  if (cStatus !== 201 && cStatus !== 200) {
    throw new Error(`Failed to create character ${entry.name}: ${cStatus} ${JSON.stringify(cData)}`);
  }

  log(`  Created character: ${entry.name} (${entry.race} ${entry.class})`);
  return { entry, username, token, userId, characterId: cData?.character?.id, isNew: true };
}

// ── Game Orchestration ─────────────────────────────────────────────

async function runGame(slotName: string, party: RosterEntry[]): Promise<void> {
  log(`\n=== Starting ${slotName} game ===`);
  const slotPrefix = slotName === "curated" ? "curated" : slotName === "fresh" ? `fresh-${dateTag()}` : "veteran";

  // 1. Setup players
  const players: PlayerSlot[] = [];
  for (const entry of party) {
    const p = await setupPlayer(entry, slotPrefix);
    players.push(p);
  }

  // 2. Queue players
  for (const p of players) {
    const { status, data } = await api("/player/queue", { token: p.token, body: {} });
    if (data?.matched) {
      log(`  ${p.entry.name} queued → party formed immediately`);
    } else if (data?.queued || status === 200) {
      log(`  ${p.entry.name} queued (position: ${data?.position ?? "?"})`);
    } else {
      log(`  ${p.entry.name} queue failed: ${JSON.stringify(data)}`);
    }
  }

  // 3. Setup and queue DM
  const dmUsername = `scheduler-dm-${slotName}`;
  const dm = await adminLogin(dmUsername, "dm");
  log(`  DM logged in: ${dmUsername}`);

  const { data: dmQueueData } = await api("/dm/queue", { token: dm.token, body: {} });
  log(`  DM queued → matched: ${dmQueueData?.matched}`);

  // 4. Wait for party formation
  let partyId: string | null = null;
  for (let i = 0; i < 12; i++) {
    await sleep(5000);
    const { data: partiesData } = await api("/spectator/parties");
    const allParties = partiesData?.parties ?? [];
    // Find a party containing our first character
    const playerName = party[0].name;
    const match = allParties.find((p: any) =>
      p.members?.some((m: any) => m.name === playerName)
    );
    if (match) {
      partyId = match.id;
      log(`  Party formed: ${match.name} (${partyId})`);
      break;
    }
  }

  if (!partyId) {
    log("  ERROR: Party did not form within 60 seconds. Aborting.");
    return;
  }

  // 5. Run scripted dungeon session
  await runDungeonSession(dm.token, players, partyId);

  log(`=== ${slotName} game complete ===\n`);
}

async function runDungeonSession(
  dmToken: string,
  players: PlayerSlot[],
  partyId: string
): Promise<void> {
  // Get initial room state
  const { data: roomData } = await api("/dm/room-state", { token: dmToken });
  if (!roomData?.room) {
    log("  No dungeon loaded — ending early.");
    return;
  }

  log(`  Dungeon room: ${roomData.room.name}`);
  const roomName = roomData.room.name;

  // Narrate entry
  await api("/dm/narrate", {
    token: dmToken,
    body: { text: `The party enters ${roomName}. ${roomData.room.description ?? ""}` },
  });

  // Walk through rooms
  let roomsVisited = 0;
  const maxRooms = 5;

  while (roomsVisited < maxRooms) {
    roomsVisited++;
    const { data: currentRoom } = await api("/dm/room-state", { token: dmToken });
    if (!currentRoom?.room) break;

    log(`  Room ${roomsVisited}: ${currentRoom.room.name}`);

    // Trigger encounter if available
    if (currentRoom.suggestedEncounter) {
      log(`  Triggering encounter: ${currentRoom.suggestedEncounter.name}`);
      const { data: encData } = await api("/dm/trigger-encounter", { token: dmToken, body: {} });
      if (encData?.spawned || encData?.encounter) {
        await runCombat(dmToken, players);
      }
    }

    // Loot room if available
    if (currentRoom.lootTable) {
      for (const p of players) {
        await api("/dm/loot-room", { token: dmToken, body: { player_id: p.characterId } });
      }
      log("  Looted room");
    }

    // Advance to next room
    const exits = currentRoom.exits ?? [];
    if (exits.length === 0) {
      log("  Dead end — no more exits");
      break;
    }

    const nextExit = exits[0];
    log(`  Advancing to: ${nextExit.name} (${nextExit.id})`);
    await api("/dm/advance-scene", { token: dmToken, body: { exit_id: nextExit.id } });

    // Brief narration
    const { data: newRoom } = await api("/dm/room-state", { token: dmToken });
    if (newRoom?.room) {
      await api("/dm/narrate", {
        token: dmToken,
        body: { text: `The party moves into ${newRoom.room.name}. ${newRoom.room.description ?? ""}` },
      });
    }
  }

  // Award XP and end session
  await api("/dm/award-xp", { token: dmToken, body: { amount: 100 * roomsVisited } });
  log(`  Awarded ${100 * roomsVisited} XP`);

  const { data: endData } = await api("/dm/end-session", {
    token: dmToken,
    body: { summary: `Automated session: explored ${roomsVisited} rooms in a scheduled dungeon run.` },
  });
  log(`  Session ended: ${endData?.ended ? "success" : "failed"}`);
}

async function runCombat(dmToken: string, players: PlayerSlot[]): Promise<void> {
  const maxRounds = 10;
  let round = 0;

  while (round < maxRounds) {
    round++;

    // Check current state
    const { data: partyState } = await api("/dm/party-state", { token: dmToken });
    if (partyState?.phase !== "combat") {
      log(`    Combat ended (phase: ${partyState?.phase})`);
      break;
    }

    const { data: roomState } = await api("/dm/room-state", { token: dmToken });
    const aliveMonsters = (roomState?.monsters ?? []).filter((m: any) => m.hp > 0);
    if (aliveMonsters.length === 0) {
      log("    All monsters dead — combat should end");
      // Advance scene to exit combat
      await api("/dm/advance-scene", { token: dmToken, body: {} });
      break;
    }

    // Process turns — check each player and monster
    // Players act by attacking first alive monster
    for (const p of players) {
      const { data: actions } = await api("/player/actions", { token: p.token });
      if (!actions?.isYourTurn) continue;

      const target = aliveMonsters[0];
      if (!target) break;

      // Fighters and rogues attack, clerics heal or attack, wizards cast or attack
      if (p.entry.class === "cleric") {
        // Check if any party member is hurt
        const members = partyState?.members ?? [];
        const hurt = members.find((m: any) => m.hp.current < m.hp.max * 0.5);
        if (hurt) {
          const { data: castRes } = await api("/player/cast", { token: p.token, body: { spell_name: "cure wounds", target_id: hurt.id } });
          if (castRes?.success !== false) {
            log(`    ${p.entry.name} heals ${hurt.name}`);
            await api("/player/end-turn", { token: p.token, body: {} });
            continue;
          }
        }
      }

      if (p.entry.class === "wizard") {
        const { data: castRes } = await api("/player/cast", { token: p.token, body: { spell_name: "magic missile", target_id: target.id } });
        if (castRes?.success !== false) {
          log(`    ${p.entry.name} casts magic missile at ${target.name}`);
          await api("/player/end-turn", { token: p.token, body: {} });
          continue;
        }
      }

      // Default: attack
      await api("/player/attack", { token: p.token, body: { target_id: target.id } });
      log(`    ${p.entry.name} attacks ${target.name}`);
      await api("/player/end-turn", { token: p.token, body: {} });
    }

    // Monster turns — DM resolves
    const { data: roomAfterPlayers } = await api("/dm/room-state", { token: dmToken });
    const monstersNow = (roomAfterPlayers?.monsters ?? []).filter((m: any) => m.hp > 0);
    for (const monster of monstersNow) {
      const { data: partyNow } = await api("/dm/party-state", { token: dmToken });
      if (partyNow?.phase !== "combat") break;

      const alivePlayers = (partyNow.members ?? []).filter((m: any) => m.hp.current > 0);
      if (alivePlayers.length === 0) break;

      const target = randomPick(alivePlayers);
      await api("/dm/monster-attack", {
        token: dmToken,
        body: { monster_id: monster.id, target_id: target.id },
      });
      log(`    ${monster.name} attacks ${target.name}`);
    }

    // Small delay between rounds
    await sleep(500);
  }

  if (round >= maxRounds) {
    log("    Combat timeout — forcing advance");
    await api("/dm/advance-scene", { token: dmToken, body: {} });
  }
}

// ── Slot Runners ───────────────────────────────────────────────────

async function runSlot(slot: string): Promise<void> {
  let party: RosterEntry[];
  switch (slot) {
    case "curated":
      log("Slot 1: Curated Roster");
      party = await pickCuratedParty();
      break;
    case "fresh":
      log("Slot 2: Fresh Blood");
      party = pickFreshParty();
      break;
    case "veterans":
      log("Slot 3: Random Veterans");
      party = await pickVeteranParty();
      break;
    default:
      console.error(`Unknown slot: ${slot}`);
      process.exit(1);
  }

  log(`Party: ${party.map((p) => `${p.name} (${p.race} ${p.class})`).join(", ")}`);
  await runGame(slot, party);
}

// ── CLI ────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const slotIdx = args.indexOf("--slot");
const allFlag = args.includes("--all");

if (allFlag) {
  log("Running all 3 slots sequentially...");
  for (const slot of ["curated", "fresh", "veterans"]) {
    try {
      await runSlot(slot);
    } catch (err) {
      log(`ERROR in ${slot}: ${err instanceof Error ? err.message : err}`);
    }
  }
} else if (slotIdx !== -1 && args[slotIdx + 1]) {
  await runSlot(args[slotIdx + 1]);
} else {
  console.log("Usage:");
  console.log("  bun run scripts/scheduler.ts --slot curated");
  console.log("  bun run scripts/scheduler.ts --slot fresh");
  console.log("  bun run scripts/scheduler.ts --slot veterans");
  console.log("  bun run scripts/scheduler.ts --all");
  process.exit(1);
}
