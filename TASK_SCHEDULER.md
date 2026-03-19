# CC Task: Automated Session Scheduler + Blockers

**Priority:** P0 — blocks Mercury marketing launch
**Branch:** ie-dev (merge to main when done)

⚠️ IMPORTANT: Local main and ie-dev are behind origin/main. Before starting:
```bash
git checkout main && git pull origin main
git checkout ie-dev && git merge main
```

---

## Part 1: Fix B004 — Waitlist Table Missing Migration

**Problem:** `POST /spectator/waitlist` returns 500. The `waitlist_signups` table is defined in `src/db/schema.ts` (line ~521 on origin/main) but has NO migration. The table doesn't exist in the production DB.

**Fix:** Create `drizzle/0015_create_waitlist_signups.sql`:

```sql
CREATE TABLE "waitlist_signups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL,
  "referral_code" text NOT NULL,
  "referred_by" text,
  "referral_count" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "waitlist_signups_email_unique" UNIQUE("email"),
  CONSTRAINT "waitlist_signups_referral_code_unique" UNIQUE("referral_code")
);
```

Update `drizzle/meta/_journal.json` — add entry with idx 15, tag `0015_create_waitlist_signups`.

**Verify:** `curl -X POST https://api.railroaded.ai/spectator/waitlist -H "Content-Type: application/json" -d '{"email":"test-verify@test.com"}'` → 201 with referral_code.

---

## Part 2: Admin Auth Endpoint for Scheduler

**Problem:** Scheduler needs to log in as existing characters. Passwords are bcrypt-hashed — can't recover them after restart.

**Solution:** Add `POST /admin/login-as` in `src/api/auth.ts`, secured by `ADMIN_SECRET` env var.

```typescript
auth.post("/admin/login-as", async (c) => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) return c.json({ error: "Admin endpoint not configured" }, 503);

  const authHeader = c.req.header("Authorization");
  if (!authHeader || authHeader !== `Bearer ${adminSecret}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const body = await c.req.json<{ username: string; role?: string }>();
  if (!body.username) return c.json({ error: "username is required" }, 400);

  // Find existing user or auto-register
  let user = usersByUsername.get(body.username);
  if (!user) {
    const role = (body.role as UserRole) ?? "player";
    const password = generatePassword();
    const passwordHash = await hashPassword(password);
    const id = `user-${userIdCounter++}`;
    user = { id, username: body.username, passwordHash, role, dbUserId: null };
    usersByUsername.set(body.username, user);
    usersById.set(id, user);
    try {
      const [row] = await db.insert(usersTable).values({ username: body.username, passwordHash, role })
        .returning({ id: usersTable.id });
      user.dbUserId = row.id;
    } catch (err) { console.error("[DB] Failed to persist auto-registered user:", err); }
  }

  const token = generateToken();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);
  sessionsByToken.set(token, { userId: user.id, expiresAt });
  return c.json({ token, expiresAt: expiresAt.toISOString(), userId: user.id, role: user.role });
});
```

**Env:** Add `ADMIN_SECRET` to Render (random 64-char hex). Scheduler uses this.

---

## Part 3: Automated Session Scheduler — `scripts/scheduler.ts`

A standalone Bun script that runs **3 games per day**, each with a different character selection strategy.

### The Three Slots

| Slot | Time (UTC) | Strategy | Purpose |
|------|-----------|----------|---------|
| **1 — Curated Roster** | 08:00 | Rotate 12 fixed "face" characters, fewest-sessions-first | Reliable regulars that level evenly, recognizable on leaderboard |
| **2 — Fresh Blood** | 15:00 | Generate 4 brand-new characters every run | Grows total character count, new names/stories appear daily |
| **3 — Random Veterans** | 22:00 | Pick 4 random existing characters from DB | Organic uneven leveling, surprise comebacks, some chars pull ahead |

### Slot 1: Curated Roster (12 fixed characters, rotating)

12 characters — 3 of each class. Every run, sort all 12 by `sessionsPlayed` ascending → pick the 4 with fewest sessions (1 per class). Ties broken alphabetically. This guarantees even leveling — nobody gets more than 1 session ahead.

```typescript
const CURATED_ROSTER = [
  // --- FIGHTERS ---
  { name: "Vex Ironhand", class: "fighter", race: "half-orc",
    personality: "Stoic protector who leads from the front", playstyle: "aggressive",
    avatarUrl: "https://files.catbox.moe/2hu2tb.png",
    description: "A towering half-orc woman with ritual scars across her arms and an iron prosthetic left hand.",
    backstory: "Lost her hand in the siege of Greyhold. Replaced it with iron forged from her enemy's armor." },
  { name: "Kael Stormshield", class: "fighter", race: "human",
    personality: "Disciplined soldier who questions unjust orders", playstyle: "defensive",
    avatarUrl: null,
    description: "Broad-shouldered with close-cropped dark hair, a broken nose, and calm grey eyes. His shield is dented from a hundred battles but polished every night.",
    backstory: "Deserted the king's army after being ordered to burn a village." },
  { name: "Ruk Ashborn", class: "fighter", race: "dragonborn",
    personality: "Quiet honor-bound warrior who speaks rarely but means every word", playstyle: "aggressive",
    avatarUrl: null,
    description: "Bronze-scaled dragonborn, nearly seven feet tall, with deep amber eyes and a scar from jaw to shoulder.",
    backstory: "Last survivor of Clan Ashborn, destroyed by a red dragon. Hunts the wyrm." },

  // --- ROGUES ---
  { name: "Zephyr Shadowstep", class: "rogue", race: "halfling",
    personality: "Mischievous and quick-witted, always looking for the clever way", playstyle: "stealth",
    avatarUrl: "https://files.catbox.moe/1etc62.png",
    description: "Small halfling woman with dark curly hair, quick brown eyes, and fingers never quite still.",
    backstory: "Grew up picking pockets in the Undercity. Now steals from people who deserve it." },
  { name: "Nyx Voidwalker", class: "rogue", race: "tiefling",
    personality: "Sardonic outsider who uses humor to deflect, fiercely loyal once trusted", playstyle: "aggressive",
    avatarUrl: null,
    description: "Lean tiefling with deep violet skin, short-cropped horns filed to points, and a tail with opinions of its own.",
    backstory: "Raised by a thieves' guild that sold her out. Survived. Now trusts actions, never words." },
  { name: "Pip Copperkettle", class: "rogue", race: "gnome",
    personality: "Cheerful inventor-thief who disarms traps by understanding them", playstyle: "stealth",
    avatarUrl: null,
    description: "Tiny gnome with wild copper hair, magnifying goggles on his forehead, and a belt of lockpicks and wrenches.",
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
  { name: "Sera Dawnkeeper", class: "cleric", race: "aasimar",
    personality: "Fiery and righteous, smites evil with enthusiasm bordering on glee", playstyle: "aggressive",
    avatarUrl: null,
    description: "Aasimar woman with warm brown skin, golden eyes that glow when angry, and close-cropped silver hair.",
    backstory: "First in eight generations to manifest celestial blood. Takes the responsibility personally." },

  // --- WIZARDS ---
  { name: "Lyra Moonwhisper", class: "wizard", race: "elf",
    personality: "Quietly curious, observes everything before acting", playstyle: "tactical",
    avatarUrl: "https://files.catbox.moe/10zk85.png",
    description: "Pale elf with silver-white hair cropped short and mismatched eyes — one grey, one luminous gold.",
    backstory: "Expelled from the Arcane Academy for experimenting with forbidden chronomancy." },
  { name: "Elara Frostweave", class: "wizard", race: "half-elf",
    personality: "Intensely focused researcher who gets excited about magical theory mid-combat", playstyle: "tactical",
    avatarUrl: null,
    description: "Wiry half-elf with ink-stained fingers, wild auburn hair, and spectacles she pushes up constantly.",
    backstory: "Thesis student who accidentally opened a portal to the Plane of Ice. Got expelled. Portal still open." },
  { name: "Thorn Ashwick", class: "wizard", race: "human",
    personality: "Cynical ex-court wizard, surprisingly gentle with commoners", playstyle: "tactical",
    avatarUrl: null,
    description: "Weathered human in his fifties with salt-and-pepper hair, deep-set dark eyes, and nicotine-stained fingers.",
    backstory: "Former royal court wizard who resigned after the prince he tutored became a tyrant." },
];
```

**Rotation algorithm:**
```typescript
async function pickCuratedParty(): Promise<RosterEntry[]> {
  const lb = await fetch(`${API}/spectator/leaderboard`).then(r => r.json());
  const allChars = lb.leaderboards.highestLevel;

  // Attach sessionsPlayed to each roster member (0 if not yet created)
  const enriched = CURATED_ROSTER.map(r => ({
    ...r,
    sessionsPlayed: allChars.find((c: any) => c.name === r.name)?.sessionsPlayed ?? 0,
  }));

  // Group by class, sort each group by sessionsPlayed asc
  const byClass: Record<string, typeof enriched> = { fighter: [], rogue: [], cleric: [], wizard: [] };
  for (const c of enriched) byClass[c.class].push(c);
  for (const cls of Object.keys(byClass)) {
    byClass[cls].sort((a, b) => a.sessionsPlayed - b.sessionsPlayed || a.name.localeCompare(b.name));
  }

  // Pick 1 least-played from each class
  return [byClass.fighter[0], byClass.rogue[0], byClass.cleric[0], byClass.wizard[0]];
}
```

### Slot 2: Fresh Blood (new characters every run)

Each run generates 4 brand-new characters — 1 per class. Use an LLM call or a large pre-built name/backstory pool to create unique characters each time.

**Simplest approach (no LLM):** Build a combinatorial generator:

```typescript
const NAME_PARTS = {
  fighter: { first: ["Gareth","Hilda","Orin","Brynn","Dax","Mira","Korv","Sigrid","Tomas","Asha"],
             last: ["Ironjaw","Shieldbreaker","Warhammer","Stonefist","Battleborn","Greyhelm","Axewing","Doomguard"] },
  rogue:   { first: ["Whisper","Shade","Jinx","Flick","Raven","Sable","Dusk","Ember","Wren","Moth"],
             last: ["Nightveil","Quickfingers","Silentfoot","Lockhart","Ghostwalk","Daggerthorn","Shadowmere"] },
  cleric:  { first: ["Father","Sister","Brother","Sage","Elder","Prior","Deacon","Abbott","Mother","Blessed"],
             last: ["Ashmore","Lightbringer","Sunkeeper","Greywater","Stoneprayer","Dawnward","Faithhold"] },
  wizard:  { first: ["Aldric","Maelis","Corvus","Isolde","Fenris","Yara","Oberon","Selene","Grimald","Thessa"],
             last: ["Spellwright","Stormcaller","Inkblood","Runemark","Voidtouched","Starweaver","Ashmantle"] },
};

// Race pool per class (weighted toward flavor)
const RACE_POOL = {
  fighter: ["human","half-orc","dwarf","dragonborn"],
  rogue: ["halfling","elf","tiefling","gnome","human"],
  cleric: ["human","dwarf","aasimar","half-elf"],
  wizard: ["elf","half-elf","human","gnome","tiefling"],
};

function generateFreshCharacter(cls: string): CharacterInput {
  const first = randomPick(NAME_PARTS[cls].first);
  const last = randomPick(NAME_PARTS[cls].last);
  const race = randomPick(RACE_POOL[cls]);
  const name = `${first} ${last}`;
  // Use DiceBear for instant avatar
  const avatarUrl = `https://api.dicebear.com/7.x/adventurer/png?seed=${encodeURIComponent(name)}&size=200`;
  return { name, class: cls, race, avatarUrl, personality: "...", playstyle: "...", ... };
}
```

Each fresh character gets a unique username: `fresh-<name-slugified>-<YYYYMMDD>`.

**Personality/backstory:** Use 5-6 template sentences with randomized fill-ins, or write 20 backstories per class and pick randomly. Don't need an LLM call — variety comes from name + race + combination.

### Slot 3: Random Veterans (pull from DB)

Pick 4 random existing characters from the database — class-balanced (1 per class). This creates organic, uneven leveling. Some characters randomly get picked more often and pull ahead on the leaderboard. Others stay low-level sleepers. Surprise comebacks when a level-1 character suddenly appears in a high-stakes session.

```typescript
async function pickRandomVeterans(): Promise<CharacterInfo[]> {
  const lb = await fetch(`${API}/spectator/leaderboard`).then(r => r.json());
  const allChars = lb.leaderboards.highestLevel; // or use a dedicated /spectator/characters endpoint

  // Group by class
  const byClass: Record<string, any[]> = { fighter: [], rogue: [], cleric: [], wizard: [] };
  for (const c of allChars) {
    if (byClass[c.class]) byClass[c.class].push(c);
  }

  // Pick 1 random from each class
  const picked: any[] = [];
  for (const cls of ["fighter", "rogue", "cleric", "wizard"]) {
    const pool = byClass[cls];
    if (pool.length === 0) {
      // Fallback: if no character of this class exists, generate a fresh one
      picked.push(generateFreshCharacter(cls));
    } else {
      picked.push(pool[Math.floor(Math.random() * pool.length)]);
    }
  }
  return picked;
}
```

**Key detail:** Random veterans already have accounts in the DB. The scheduler uses `/admin/login-as` with their username to get a token. Their character already exists — no need to re-create. Just login → queue → play.

**Edge case (early days):** If the DB has fewer than 4 classes represented, fall back to generating fresh characters for missing classes. After a week of Slot 2 (Fresh Blood) running, this won't be an issue.

### Game Orchestration Flow (same for all 3 slots)

For each game:

```
1. For each of 4 players:
   a. POST /admin/login-as { username: "<slot>-<charname-slug>", role: "player" } → token
   b. If character doesn't exist for this user:
      POST /player/character { name, race, class, ability_scores, backstory, personality, playstyle, avatar_url, description }
      (Ability scores: STR 15, DEX 14, CON 13, INT 12, WIS 10, CHA 8 — rearranged by class priority)
   c. POST /player/queue → enters matchmaking

2. Register DM:
   a. POST /admin/login-as { username: "scheduler-dm-<slot>", role: "dm" }
   b. POST /dm/queue → triggers party formation

3. Wait for party (poll /spectator/parties every 5s, timeout 60s)

4. DM runs a simple scripted session:
   a. POST /dm/start-session (random dungeon template)
   b. Narrate room descriptions, spawn encounters from template
   c. Monsters attack, players respond via autopilot
   d. Move through 3-5 rooms
   e. POST /dm/end-session with summary

5. Log result to /tmp/scheduler-log.jsonl
```

**The DM is NOT an AI agent** — it's a scripted sequence of API calls that walks through the dungeon template. AI agents play the game during IE loops and live sessions. The scheduler just needs to produce events and content.

### Avatar Handling

- **Curated roster (existing 4):** Already have catbox.moe avatars
- **Curated roster (new 8):** Use DiceBear on first creation: `https://api.dicebear.com/7.x/adventurer/png?seed=<name>&size=200`
- **Fresh Blood:** DiceBear with character name as seed
- **Random Veterans:** Already have avatars from when they were created
- **TODO (later):** Replace DiceBear with AI-generated portraits

### CLI Interface

```bash
bun run scripts/scheduler.ts --slot curated    # Run Slot 1
bun run scripts/scheduler.ts --slot fresh      # Run Slot 2
bun run scripts/scheduler.ts --slot veterans   # Run Slot 3
bun run scripts/scheduler.ts --all             # Run all 3 sequentially
```

### Cron (Render or VPS)

```
0 8 * * *   cd /app && bun run scripts/scheduler.ts --slot curated
0 15 * * *  cd /app && bun run scripts/scheduler.ts --slot fresh
0 22 * * *  cd /app && bun run scripts/scheduler.ts --slot veterans
```

### Environment Variables

- `ADMIN_SECRET` — for /admin/login-as auth
- `API_URL` — defaults to `https://api.railroaded.ai`, `http://localhost:3000` in dev

---

## Part 4: Fix Homepage Stats (B020)

**Problem:** Homepage "The World So Far" shows 0 Sessions / 0 Characters / 0 Events. API returns correct data at `/spectator/stats` (65 sessions, 60 characters, 1288 events).

**Check:** In `website/index.html`, find the stats fetch code. Likely causes:
- Wrong API URL (hardcoded localhost vs production)
- Fetch error silently swallowed, showing 0
- CORS issue on stats endpoint
- Stats endpoint missing from deployed version

Trace the data flow, fix. This is probably a 1-line URL fix.

---

## Part 5: Spectator Characters Endpoint (needed for Slot 3)

The leaderboard endpoint returns top-10 per category. Slot 3 (Random Veterans) needs ALL characters to pick randomly from.

**Add:** `GET /spectator/characters` — returns all characters with basic info (id, name, class, race, level, sessionsPlayed, avatarUrl). No auth required. Paginated (default 100, max 500).

This also benefits the frontend — future character browser page.

---

## Commit Strategy

1. **B004 fix** — waitlist migration (smallest, most impactful)
2. **Admin auth endpoint** — `/admin/login-as`
3. **Spectator characters endpoint** — needed by scheduler
4. **Homepage stats fix** — B020
5. **Scheduler script + roster** — the main feature

Each commit independently deployable. Push to main after each.

---

## Testing Checklist

- [ ] Waitlist POST returns 201 (not 500)
- [ ] `/admin/login-as` returns token with valid ADMIN_SECRET
- [ ] `/admin/login-as` returns 401 without secret
- [ ] `/admin/login-as` auto-registers unknown username
- [ ] Slot 1: logs in as Vex Ironhand, queues, party forms
- [ ] Slot 2: generates 4 new unique characters, creates accounts, queues
- [ ] Slot 3: fetches all characters, picks 4 random (1/class), logs in, queues
- [ ] Session runs → events visible in spectator API
- [ ] Curated rotation: after 1 run, the 4 who played sort to bottom next run
- [ ] Fresh blood: no name collisions across runs
- [ ] Random veterans: graceful fallback if <4 classes in DB
- [ ] Homepage stats show real numbers
- [ ] `--all` flag runs all 3 slots sequentially without errors
