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

// ── Journal Entry Templates ───────────────────────────────────────

const JOURNAL_AFTER_COMBAT = [
  (name: string, ally: string) => `That was too close. The creature nearly took my head off before ${ally} intervened.`,
  (name: string, _ally: string) => `Another fight survived. My hands are still shaking, but I'll never admit it.`,
  (name: string, ally: string) => `${ally} fought well today. I'm glad they're on our side.`,
  (name: string, _ally: string) => `The stench of battle lingers. We press on before more come.`,
];

const JOURNAL_AFTER_LOOT = [
  (name: string, item: string) => `Found ${item} in the rubble. Small mercies in this forsaken place.`,
  (name: string, item: string) => `I pocketed ${item}. Every bit helps when you're delving this deep.`,
  (name: string, item: string) => `${item} — not much, but better than nothing. This dungeon owes us more.`,
];

const JOURNAL_EXPLORATION = [
  (name: string, room: string) => `${room} — this place reeks of death. We press on.`,
  (name: string, room: string) => `Something about ${room} unsettles me. The shadows seem to move on their own.`,
  (name: string, room: string) => `We've reached ${room}. I wonder how many have stood here before us, and how many walked out.`,
  (name: string, room: string) => `The walls of ${room} are slick with moisture. Or is it something else? Best not to think about it.`,
];

type JournalContext = "combat" | "loot" | "exploration";

function generateJournalEntry(playerName: string, allyName: string, roomName: string, context: JournalContext, itemName?: string): string {
  switch (context) {
    case "combat":
      return randomPick(JOURNAL_AFTER_COMBAT)(playerName, allyName);
    case "loot":
      return randomPick(JOURNAL_AFTER_LOOT)(playerName, itemName ?? "a useful trinket");
    case "exploration":
      return randomPick(JOURNAL_EXPLORATION)(playerName, roomName);
  }
}

// ── Ability Scores ─────────────────────────────────────────────────

const CLASS_SCORES: Record<string, { str: number; dex: number; con: number; int: number; wis: number; cha: number }> = {
  fighter: { str: 16, dex: 14, con: 14, int: 10, wis: 12, cha: 8 },
  rogue:   { str: 10, dex: 16, con: 12, int: 14, wis: 12, cha: 10 },
  cleric:  { str: 14, dex: 10, con: 14, int: 10, wis: 16, cha: 10 },
  wizard:  { str: 8,  dex: 14, con: 12, int: 16, wis: 14, cha: 10 },
};

// ── Avatar Generation ─────────────────────────────────────────────

const AVATAR_STYLE_PROMPT = `Fantasy character portrait, painterly style, dramatic lighting, dark background, shoulders-up framing, highly detailed, digital painting, concept art style. D&D fantasy world.`;

async function generateAvatarUrl(name: string, race: string, characterClass: string): Promise<string | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("[Avatar] OPENAI_API_KEY not set");
    return null;
  }

  try {
    const prompt = `${AVATAR_STYLE_PROMPT} Portrait of ${name}, a ${race} ${characterClass}.`;
    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt,
        n: 1,
        size: "1024x1024",
        response_format: "b64_json",
        quality: "standard",
      }),
    });

    if (!response.ok) {
      console.error(`[Avatar] DALL-E error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const b64 = data.data[0].b64_json;

    // Upload to catbox.moe for permanent hosting
    const formData = new FormData();
    formData.append("reqtype", "fileupload");
    const blob = new Blob([Buffer.from(b64, "base64")], { type: "image/png" });
    formData.append("fileToUpload", blob, `${name.replace(/\s+/g, "_")}.png`);

    const uploadResp = await fetch("https://catbox.moe/user/api.php", {
      method: "POST",
      body: formData,
    });

    if (!uploadResp.ok) {
      console.error(`[Avatar] Catbox upload failed: ${uploadResp.status}`);
      return null;
    }

    const url = await uploadResp.text();
    log(`  Avatar generated for ${name}: ${url.trim()}`);
    return url.trim();
  } catch (err) {
    console.error(`[Avatar] Error: ${err}`);
    return null;
  }
}

const FALLBACK_AVATARS: Record<string, string[]> = {
  fighter: [],
  rogue: [],
  cleric: [],
  wizard: [],
};

function getFallbackAvatar(characterClass: string): string | null {
  const pool = FALLBACK_AVATARS[characterClass] ?? Object.values(FALLBACK_AVATARS).flat();
  if (pool.length === 0) return null;
  return randomPick(pool);
}

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
  // Avatar generated in setupPlayer after character details are known
  return {
    name,
    class: cls as RosterEntry["class"],
    race,
    personality: randomPick(PERSONALITY_POOL[cls]),
    playstyle: cls === "cleric" ? "support" : cls === "wizard" ? "tactical" : randomPick(["aggressive", "defensive", "stealth"]),
    avatarUrl: null,
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
  const { status, data } = await api("/api/v1/status", { token });
  log(`  Status check: ${status} ${JSON.stringify(data)?.slice(0, 120)}`);
  if (status === 200 && data?.success === true) {
    log(`  Character exists: ${data?.name} (Lv${data?.level})`);
    return { entry, username, token, userId, characterId: data?.id, isNew: false };
  }

  // Generate avatar if needed
  let avatarUrl = entry.avatarUrl;
  if (!avatarUrl) {
    avatarUrl = await generateAvatarUrl(entry.name, entry.race, entry.class);
    if (!avatarUrl) {
      avatarUrl = getFallbackAvatar(entry.class);
    }
    if (!avatarUrl) {
      log(`  WARNING: No avatar for ${entry.name} — character creation will fail`);
    }
  }

  // Create character
  const scores = CLASS_SCORES[entry.class];
  const { status: cStatus, data: cData } = await api("/api/v1/character", {
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
    const { status, data } = await api("/api/v1/queue", { token: p.token, body: {} });
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

  const { data: dmQueueData } = await api("/api/v1/dm/queue", { token: dm.token, body: {} });
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
  const { data: roomData } = await api("/api/v1/dm/room-state", { token: dmToken });
  if (!roomData?.room) {
    log("  No dungeon loaded — ending early.");
    return;
  }

  log(`  Dungeon room: ${roomData.room.name}`);
  const roomName = roomData.room.name;

  // Narrate entry with atmosphere
  await api("/api/v1/dm/narrate", {
    token: dmToken,
    body: { text: `The party enters ${roomName}. ${roomData.room.description ?? "Shadows cling to every surface."}` },
  });
  await sleep(5000); // Atmosphere — let spectators read

  // Walk through rooms
  let roomsVisited = 0;
  const maxRooms = 8;
  const visitedRooms = new Set<string>();
  let combatCount = 0;

  while (roomsVisited < maxRooms) {
    roomsVisited++;
    const { data: currentRoom } = await api("/api/v1/dm/room-state", { token: dmToken });
    if (!currentRoom?.room) break;

    visitedRooms.add(currentRoom.room.name);
    log(`  Room ${roomsVisited}: ${currentRoom.room.name}`);

    // Trigger encounter if available
    if (currentRoom.suggestedEncounter) {
      const encounterName = currentRoom.suggestedEncounter.name;
      log(`  Triggering encounter: ${encounterName}`);

      // DM narrates encounter start
      await api("/api/v1/dm/narrate", {
        token: dmToken,
        body: { text: `${encounterName}! Roll for initiative!` },
      });
      await sleep(3000);

      const { data: encData } = await api("/api/v1/dm/trigger-encounter", { token: dmToken, body: {} });
      log(`  Encounter response: ${JSON.stringify(encData)}`);
      await sleep(2000); // Let initiative + spawn resolve

      if (encData?.monsters?.length > 0 || encData?.phase === "combat") {
        await runCombat(dmToken, players);
        combatCount++;

        // Post-combat narration
        const { data: postCombatState } = await api("/api/v1/dm/party-state", { token: dmToken });
        const aliveMembers = (postCombatState?.members ?? []).filter((m: any) => m.hp?.current > 0);
        const totalMembers = players.length;

        await api("/api/v1/dm/narrate", {
          token: dmToken,
          body: {
            text: aliveMembers.length === totalMembers
              ? "The party stands victorious, barely winded."
              : `The battle is won, but at a cost. ${totalMembers - aliveMembers.length} of the party lie wounded.`,
          },
        });
        await sleep(5000); // Dramatic pause after combat

        // Journal entry from a random alive player after combat
        const alivePlayerSlots = players.filter((p) =>
          aliveMembers.some((m: any) => m.id === p.characterId)
        );
        if (alivePlayerSlots.length > 0) {
          const journalist = randomPick(alivePlayerSlots);
          const ally = alivePlayerSlots.find((p) => p !== journalist) ?? journalist;
          const entry = generateJournalEntry(journalist.entry.name, ally.entry.name, currentRoom.room.name, "combat");
          await api("/api/v1/journal", { token: journalist.token, body: { entry } });
          log(`  ${journalist.entry.name} wrote journal: "${entry}"`);
          await sleep(3000);
        }

        // Short rest if anyone is below 50% HP
        const hurtMembers = (postCombatState?.members ?? []).filter(
          (m: any) => m.hp?.current > 0 && m.hp?.current < m.hp?.max * 0.5
        );
        if (hurtMembers.length > 0) {
          await api("/api/v1/dm/narrate", {
            token: dmToken,
            body: { text: "The party takes a moment to catch their breath and tend to their wounds." },
          });
          await sleep(5000);

          // Cleric heals the wounded
          for (const p of players) {
            if (p.entry.class === "cleric") {
              const woundedToHeal = (postCombatState?.members ?? []).filter(
                (m: any) => m.hp?.current > 0 && m.hp?.current < m.hp?.max * 0.7
              );
              for (const h of woundedToHeal) {
                await api("/api/v1/cast", { token: p.token, body: { spell_name: "cure wounds", target_id: h.id } });
                log(`    ${p.entry.name} heals ${h.name}`);
                await sleep(2000);
              }
            }
          }
        }
      }
    }

    // Loot room if available
    if (currentRoom.lootTable) {
      for (const p of players) {
        await api("/api/v1/dm/loot-room", { token: dmToken, body: { player_id: p.characterId } });
      }
      log("  Looted room");

      // Journal entry about loot from a random player
      if (Math.random() > 0.5) {
        const journalist = randomPick(players);
        const entry = generateJournalEntry(journalist.entry.name, "", currentRoom.room.name, "loot");
        await api("/api/v1/journal", { token: journalist.token, body: { entry } });
        log(`  ${journalist.entry.name} wrote journal: "${entry}"`);
        await sleep(3000);
      }
    }

    // Exploration actions between rooms
    const rogue = players.find((p) => p.entry.class === "rogue");
    const cleric = players.find((p) => p.entry.class === "cleric");
    if (currentRoom.interactables?.length > 0) {
      const obj = randomPick(currentRoom.interactables);
      await api("/api/v1/dm/interact", { token: dmToken, body: { object_id: obj.id } });
      log(`  Interacted with: ${obj.name ?? obj.id}`);
    }
    if (rogue) {
      await api("/api/v1/skill-check", { token: rogue.token, body: { skill: "perception", dc: 12 } });
      log(`  ${rogue.entry.name} checks for traps`);
    }
    if (cleric) {
      await api("/api/v1/skill-check", { token: cleric.token, body: { skill: "religion", dc: 10 } });
      log(`  ${cleric.entry.name} checks for undead`);
    }

    // Exploration journal entry (occasionally)
    if (!currentRoom.suggestedEncounter && !currentRoom.lootTable && Math.random() > 0.6) {
      const journalist = randomPick(players);
      const entry = generateJournalEntry(journalist.entry.name, "", currentRoom.room.name, "exploration");
      await api("/api/v1/journal", { token: journalist.token, body: { entry } });
      log(`  ${journalist.entry.name} wrote journal: "${entry}"`);
      await sleep(3000);
    }

    // Advance to next room
    const exits = currentRoom.exits ?? [];
    if (exits.length === 0) {
      log("  Dead end — no more exits");
      break;
    }

    const unvisitedExits = exits.filter((e: any) => !visitedRooms.has(e.name));
    if (unvisitedExits.length === 0) {
      log("  All exits visited — ending session gracefully");
      break;
    }
    const nextExit = randomPick(unvisitedExits);
    log(`  Advancing to: ${nextExit.name} (${nextExit.id})`);
    await api("/api/v1/dm/advance-scene", { token: dmToken, body: { exit_id: nextExit.id } });
    await sleep(3000); // Let room transition process

    // DM narrates new room
    const { data: newRoom } = await api("/api/v1/dm/room-state", { token: dmToken });
    if (newRoom?.room) {
      await api("/api/v1/dm/narrate", {
        token: dmToken,
        body: { text: `The party cautiously enters ${newRoom.room.name}. ${newRoom.room.description ?? "Shadows cling to every surface."}` },
      });
      await sleep(8000); // Between rooms — let spectators read
    }
  }

  // Session end narration
  await api("/api/v1/dm/narrate", {
    token: dmToken,
    body: {
      text: `The party emerges from the dungeon, battered but alive. ${roomsVisited} chambers explored, ${combatCount} battles fought. The adventure is over — for now.`,
    },
  });
  await sleep(5000);

  // Award XP and end session
  await api("/api/v1/dm/award-xp", { token: dmToken, body: { amount: 100 * roomsVisited } });
  log(`  Awarded ${100 * roomsVisited} XP`);

  const { data: endData } = await api("/api/v1/dm/end-session", {
    token: dmToken,
    body: { summary: `Automated session: explored ${roomsVisited} rooms, fought ${combatCount} battles in a scheduled dungeon run.` },
  });
  log(`  Session ended: ${endData?.ended ? "success" : "failed"}`);
}

async function runCombat(dmToken: string, players: PlayerSlot[]): Promise<void> {
  await sleep(3000); // Let initiative resolve

  const maxTurns = 40; // ~10 rounds x 4 players
  let turns = 0;

  while (turns < maxTurns) {
    turns++;

    // Check if still in combat
    const { data: partyState } = await api("/api/v1/dm/party-state", { token: dmToken });
    if (partyState?.phase !== "combat") {
      log(`    Combat ended after ${turns} turns`);
      break;
    }

    // Check monsters
    const { data: roomState } = await api("/api/v1/dm/room-state", { token: dmToken });
    const aliveMonsters = (roomState?.monsters ?? []).filter((m: any) => m.hp > 0);
    if (aliveMonsters.length === 0) {
      log("    All monsters defeated");
      break;
    }

    // Find which player (if any) has the turn
    let acted = false;
    for (const p of players) {
      const { data: actions } = await api("/api/v1/actions", { token: p.token });
      if (!actions?.isYourTurn) continue;

      const target = aliveMonsters[0];
      let turnTaken = false;

      // Clerics heal wounded allies first
      if (p.entry.class === "cleric") {
        const members = partyState?.members ?? [];
        const hurt = members.find((m: any) => m.hp.current < m.hp.max * 0.5);
        if (hurt) {
          const { data: castRes } = await api("/api/v1/cast", { token: p.token, body: { spell_name: "cure wounds", target_id: hurt.id } });
          if (castRes?.success !== false) {
            log(`    ${p.entry.name} heals ${hurt.name}`);
            await api("/api/v1/end-turn", { token: p.token, body: {} });
            turnTaken = true;
          }
        }
      }

      // Wizards cast magic missile
      if (!turnTaken && p.entry.class === "wizard") {
        const { data: castRes } = await api("/api/v1/cast", { token: p.token, body: { spell_name: "magic missile", target_id: target.id } });
        if (castRes?.success !== false) {
          log(`    ${p.entry.name} casts magic missile at ${target.name}`);
          await api("/api/v1/end-turn", { token: p.token, body: {} });
          turnTaken = true;
        }
      }

      // Default: attack
      if (!turnTaken) {
        await api("/api/v1/attack", { token: p.token, body: { target_id: target.id } });
        log(`    ${p.entry.name} attacks ${target.name}`);
        await api("/api/v1/end-turn", { token: p.token, body: {} });
      }

      acted = true;
      await sleep(3000); // Deliberation between combat turns
      break; // Only one player acts per loop iteration
    }

    // If no player had a turn, it might be a monster turn
    if (!acted) {
      const { data: partyNow } = await api("/api/v1/dm/party-state", { token: dmToken });
      const alivePlayers = (partyNow?.members ?? []).filter((m: any) => m.hp?.current > 0);
      if (alivePlayers.length === 0) {
        log("    TPK — party wiped");
        break;
      }

      for (const monster of aliveMonsters) {
        const target = randomPick(alivePlayers);
        await api("/api/v1/dm/monster-attack", {
          token: dmToken,
          body: { monster_id: monster.id, target_id: target.id },
        });
        log(`    ${monster.name} attacks ${target.name}`);
        await sleep(2000);
      }
      await sleep(3000);
    }
  }

  if (turns >= maxTurns) {
    log("    Combat timeout — forcing advance");
    await api("/api/v1/dm/advance-scene", { token: dmToken, body: {} });
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
