# CC-260428-MATCHMAKING-BOOTSTRAP — Railroaded Matchmaking + Agent Bootstrap (Stage B)

**Commissioned by:** Muhammad (CTO) via Ram Prime
**Venture:** Railroaded
**Source specs:** MF-026 (`RAILROADED_MATCHMAKING_BOOTSTRAP_UX_SPEC.md`), MF-024 (T-2/T-5), MF-027 (P0-1/P2-9/P2-10)
**Scope:** Queue-state feedback, queue idempotency 409, admin queue-state endpoint, auto-DM trigger, DM quickstart endpoint, skill doc updates, param alignment verification, DM queue investigation
**Repo:** `kimosahy/railroaded` — branch from latest `main`
**Branch name:** `atlas/matchmaking-bootstrap`
**Commit format:** `Atlas build (Ram): [description]`

---

## 0. Context for Atlas (Investigation Arc)

This CC doc went through a multi-party investigation before landing. Here's why certain decisions were made:

**Auto-DM (Task 4) — why it's pluggable:** RAM-025 investigated how DM agents actually work. Three teams responded: Atlas (codebase trace — no DM agent code exists in the repo, `scripts/scheduler.ts` is a one-liner), Eon (operational data — DM agents are per-session Claude sub-agents spawned by Mercury's harness, polling REST at ~2s), MF (product confirmation — MF-033 confirms The Conductor is a new auto-provisioned agent, NOT a promoted player).

The trigger mechanism (timer, conditions, queue entry) is fully specified. The execution path (what happens after the trigger fires) depends on CoS picking a provisioning option by EOD Apr 30: (1) runtime spawn via Mercury, (2) pre-deployed standing agent on VPS-2, (3) backend-only user account. We don't know which yet. So Task 4 implements the trigger + a `provisionConductor()` function with a default implementation that creates a queue entry. The function is designed to be replaced once CoS decides — the trigger doesn't change regardless of path.

**DM bootstrap stall — why quickstart matters:** Eon's report showed both Apr 27 DM agents stalled on `GET /skill/dm` digestion (49 tools loaded upfront) before producing any HTTP traffic. Task 5 (quickstart endpoint) directly addresses this. The Conductor will hit the same wall if the skill doc isn't restructured. Quickstart is a prerequisite for reliable auto-DM, not a nice-to-have.

**Queue idempotency — why 409 not 400:** Mercury's Apr 27 report (T-2) independently flagged this: agents that re-queue get a 400 with no error code and can't distinguish "bad request" from "already queued." CC Doc 1 added `reason_code` to all 400s; this CC extends that work with a proper 409 status code for the already-queued case specifically.

**P2-9 stale party — why the 5-minute threshold:** Apr 23 playtest showed DM agents getting stuck on `handleDMQueueForParty` returning "already have an active party" when the party was effectively dead (no events for minutes). The 5-minute staleness check is a pragmatic workaround — not a permanent fix. The real fix is proper session cleanup on disconnect, which CC Doc 1's autopilot timer partially addresses.

---

## 1. What You Are Building

Seven changes that fix the "sessions never start" class of failures. In Mercury's Apr 27 test, 4 players + 1 DM queued for 37 minutes and the game never started — because nobody could see what was blocking, the DM stalled during bootstrap, and there was no fallback when the DM failed.

**Queue-state feedback (§5).** When a player or DM is queued, `GET /actions` returns `phase: "idle"` with no queue information. You are enriching the response with queue state: how many players are queued, how many DMs, what's blocking, and when the agent entered the queue.

**Queue idempotency (§10.1).** Double-queueing returns 400 `WRONG_STATE`. You are changing this to 409 Conflict with the current queue state in the body, so agents can distinguish "I'm already queued (safe to poll)" from "I sent a bad request."

**Admin queue-state endpoint (§10.2).** New `GET /api/v1/admin/queue-state` returning a diagnostic snapshot: who's queued, active sessions, last match timestamp, auto-DM status. Uses existing `ADMIN_SECRET` auth pattern.

**Auto-DM trigger (§8).** When 3+ players have been queued for 60+ seconds with no DM, the system auto-creates a fallback DM user ("The Conductor") and queues it. The trigger is server-side — whether The Conductor is backed by a real AI agent is an external provisioning concern (CoS). Our backend just creates the user and queues it.

**DM quickstart endpoint (§9).** New `GET /skill/dm/quickstart` route serving the 5-command bootstrap sequence agents need to start a game. Currently the DM skill doc is 49 tools — agents stall trying to parse it. The quickstart gives them the critical path only.

**Skill doc updates.** Player skill doc gets a queue-status awareness paragraph (§6.2 — copy from MF spec). Bootstrap docs fixes: wrong API host, wrong field names.

**Verification + investigation.** P0-1 (phantom DM-less match) verification test. P2-9 (DM queue 9× rejection) investigation. P2-10 (param alignment) verification — server-side already fixed, docs-only remaining.

---

## 2. Architecture Overview

```
Queue-State Feedback (§5)
──────────────────────────────────────────────────────────────
handleGetAvailableActions(userId):
  if playerQueue.some(q => q.userId === userId):
    → return queue_status { players_queued, dms_queued, blocking_reason,
                            queued_at, position, fallback_dm_eta_seconds }
  else:
    → existing behavior (phase: "idle" or session state)

handleGetDmActions(userId):
  if dmQueue.some(q => q.userId === userId):
    → return queue_status instead of NOT_DM error

Queue Idempotency (§10.1)
──────────────────────────────────────────────────────────────
handleQueueForParty / handleDMQueueForParty:
  if already queued:
    → return 409 with current queue state (not 400 WRONG_STATE)

Admin Queue-State (§10.2)
──────────────────────────────────────────────────────────────
GET /api/v1/admin/queue-state (ADMIN_SECRET auth):
  → { playerQueue, dmQueue, activeParties, lastMatchAt, autoDmStatus }

Auto-DM Trigger (§8)
──────────────────────────────────────────────────────────────
On each player queue join/leave:
  checkAutoDmTrigger():
    if playerQueue.length >= 3 && dmQueue.length === 0:
      start 60s timer (autoDmTimer)
      → on expiry: re-check conditions
                   → provisionConductor()
                     → if RAILROADED_AUTO_DM_PROVISION=false: log skip, return
                     → if true: create QueueEntry for SYSTEM_DM_ID ("The Conductor")
                       → push to dmQueue
                       → clearMatchmakerWaitTimer
                       → tryMatchPartyFallback → formParty if match
    on DM join or match: cancel timer
  provisionConductor() is pluggable — default creates queue entry.
  Feature-flagged: trigger always fires (telemetry), queue entry gated.
  Swap to webhook (Path B) or agent signal (Path A) when CoS decides.

DM Quickstart (§9)
──────────────────────────────────────────────────────────────
GET /skill/dm/quickstart → text/plain, 5 curl commands
```

---

## 3. Build Tasks

### Task 1 — Queue idempotency: 400 → 409

**What:** Already-queued responses change from 400 to 409 Conflict. This requires `respond()` to accept a status code parameter.

**File:** `src/api/rest.ts`

**Step 1a — Modify `respond()` to accept optional status code.**

Grep for `function respond`. Current signature:

```ts
function respond(c: Context<AuthEnv>, result: { success: boolean; data?: Record<string, unknown>; error?: string; reason_code?: string }) {
```

Add an optional `statusCode` parameter:

```ts
/**
 * Respond to client. On success, spreads result.data into JSON body.
 * On failure, spreads result.data into the 4xx body for structured error context
 * (e.g., queue_status on 409). Do NOT include sensitive or large data in result.data
 * on failure paths — it will appear in the error response.
 */
function respond(c: Context<AuthEnv>, result: { success: boolean; data?: Record<string, unknown>; error?: string; reason_code?: string }, statusCode?: number) {
  if (!result.success) {
    const reason = result.reason_code ?? "BAD_REQUEST";
    const status = statusCode ?? 400;
    console.log(`[4xx] ${c.req.method} ${new URL(c.req.url).pathname} reason=${reason} user=${c.get("user")?.userId ?? "unknown"}`);
    return c.json({ error: result.error, code: "BAD_REQUEST", reason_code: reason, ...(result.data ?? {}) }, status);
  }
  return c.json({ success: true, ...result.data });
}
```

**Critical change:** On error responses, `result.data` is now spread into the JSON body. This lets handlers include queue state in error responses (the 409 body includes current queue position). One existing handler returns data on failure: `handleMonsterAttack` (grep for `rechargeResults`) returns `{ success: false, data: { rechargeResults } }` when a monster ability hasn't recharged. This data will now appear in the 400 response body — this is harmless and actually useful (DM agents see which abilities are on cooldown). No other error paths return data (verified by grep).

**Step 1b — Update queue handlers to return 409 with state.**

**File:** `src/game/game-manager.ts`

In `handleQueueForParty`, grep for `"Already in the queue."`. Replace:

```ts
// Before:
return { success: false, error: "Already in the queue.", reason_code: "WRONG_STATE" };

// After:
const queuePos = playerQueue.findIndex(q => q.userId === userId) + 1;
return {
  success: false,
  error: "Already in the queue.",
  reason_code: "ALREADY_QUEUED",
  data: {
    queue_status: buildPlayerQueueStatus(userId),
  },
};
```

Same pattern in `handleDMQueueForParty` for `"Already in the DM queue."`:

```ts
return {
  success: false,
  error: "Already in the DM queue.",
  reason_code: "ALREADY_QUEUED",
  data: {
    queue_status: buildDmQueueStatus(userId),
  },
};
```

**Step 1c — Update route callers to pass 409.**

In `rest.ts`, the queue routes call `respond()`. Update them to pass 409 when the result contains `ALREADY_QUEUED`:

```ts
// Before:
player.post("/queue", (c) => respond(c, gm.handleQueueForParty(c.get("user").userId)));

// After:
player.post("/queue", (c) => {
  const result = gm.handleQueueForParty(c.get("user").userId);
  return respond(c, result, result.reason_code === "ALREADY_QUEUED" ? 409 : undefined);
});
```

Same for DM queue:

```ts
dm.post("/queue", (c) => {
  const result = gm.handleDMQueueForParty(c.get("user").userId);
  return respond(c, result, result.reason_code === "ALREADY_QUEUED" ? 409 : undefined);
});
```

**Step 1d — Add `ALREADY_QUEUED` to ReasonCode enum.**

In `src/types.ts`, grep for `ReasonCode`. Add to the enum:

```ts
ALREADY_QUEUED: "ALREADY_QUEUED",
```

**Step 1e — Tests.** Write tests: (a) queue a player → queue again → assert 409 status code + `queue_status` in body. (b) Queue a DM → queue again → assert 409.

---

### Task 2 — Queue-state feedback on GET /actions

**What:** When a player or DM is queued, their `GET /actions` response includes queue state.

**File:** `src/game/game-manager.ts`

**Step 2a — Add queue-status builder helpers.**

Place near the queue handler functions (grep for `handleQueueForParty`).

**DEPENDENCY NOTE:** These helpers reference `autoDmFirstEligibleAt` and `AUTO_DM_DELAY_MS` which are declared in Task 4. If implementing in order, add the auto-DM constant and state variable declarations from Task 4 Step 4a FIRST (just the declarations, not the full trigger mechanism). Then implement Task 2. Then implement the rest of Task 4. Alternatively, implement Task 4 Step 4a before Task 2.

```ts
/** Build queue status snapshot for a queued player. */
function buildPlayerQueueStatus(userId: string): Record<string, unknown> {
  const entry = playerQueue.find(q => q.userId === userId);
  const position = playerQueue.findIndex(q => q.userId === userId) + 1;
  const playersQueued = playerQueue.length;
  const dmsQueued = dmQueue.length;

  let blockingReason: string;
  if (dmsQueued === 0) {
    blockingReason = "waiting_for_dm";
  } else if (playersQueued < PARTY_SIZE) {
    blockingReason = `waiting_for_players (need ${PARTY_SIZE - playersQueued} more)`;
  } else {
    blockingReason = "match_forming";
  }

  // Auto-DM ETA: if no DM and timer is running, compute remaining seconds
  let fallbackDmEtaSeconds: number | null = null;
  if (dmsQueued === 0 && autoDmFirstEligibleAt !== null) {
    const elapsed = Date.now() - autoDmFirstEligibleAt;
    const remaining = Math.max(0, AUTO_DM_DELAY_MS - elapsed);
    fallbackDmEtaSeconds = Math.ceil(remaining / 1000);
  }

  return {
    phase: dmsQueued === 0 ? "queued_waiting_dm" : "queued_dm_available",
    players_queued: playersQueued,
    dms_queued: dmsQueued,
    blocking_reason: blockingReason,
    queued_at: entry?.queuedAt?.toISOString() ?? null,
    position,
    total_in_queue: playersQueued + dmsQueued,
    fallback_dm_eta_seconds: fallbackDmEtaSeconds,
  };
}

/** Build queue status snapshot for a queued DM. */
function buildDmQueueStatus(userId: string): Record<string, unknown> {
  const position = dmQueue.findIndex(q => q.userId === userId) + 1;
  const playersQueued = playerQueue.length;
  const playersNeeded = Math.max(0, PARTY_SIZE - playersQueued);

  return {
    phase: playersQueued >= 2 ? "queued_players_available" : "queued_waiting_players",
    players_queued: playersQueued,
    dms_queued: dmQueue.length,
    blocking_reason: playersNeeded > 0 ? `waiting_for_players (need ${playersNeeded} more)` : "match_forming",
    position,
    players_needed: playersNeeded,
    total_in_queue: playersQueued + dmQueue.length,
  };
}
```

**Step 2b — Add `queuedAt` to QueueEntry.**

**File:** `src/game/matchmaker.ts`

Grep for `interface QueueEntry`. Add:

```ts
  queuedAt: Date;
```

**File:** `src/game/game-manager.ts`

In `handleQueueForParty`, where the `QueueEntry` object is constructed (grep for `const entry: QueueEntry =`), add:

```ts
  queuedAt: new Date(),
```

Same in `handleDMQueueForParty`.

**Step 2c — Enrich `handleGetAvailableActions` for queued players.**

Grep for `function handleGetAvailableActions`. The function currently has two "idle" paths:

1. No character → returns `phase: "idle"` with `create_character`
2. Character but no party/session → returns `phase: "idle"` with `queue, get_status, get_inventory`

In path 2, add a queue membership check BEFORE returning idle:

```ts
  // Check if player is currently in the queue
  if (playerQueue.some(q => q.userId === userId)) {
    const queueStatus = buildPlayerQueueStatus(userId);
    const actions = ["leave_queue", "get_status", "get_inventory"];
    return {
      success: true,
      data: {
        phase: queueStatus.phase,
        isYourTurn: false,
        availableActions: actions,
        actionRoutes: buildActionRoutes(actions, playerActionRoutes),
        queue_status: queueStatus,
      },
    };
  }
```

Insert this block AFTER the `!party?.session` check and BEFORE the existing idle return.

**Step 2d — Enrich `handleGetDmActions` for queued DMs.**

Grep for `function handleGetDmActions`. Currently when DM is not in a party:

```ts
const inQueue = dmQueue.some((q) => q.userId === userId);
const hint = inQueue ? " You are in the DM queue — waiting for players." : " Queue via POST /api/v1/dm/queue first.";
return { success: false, error: `Not a DM for any active party.${hint}`, reason_code: "NOT_DM" };
```

Replace with:

```ts
const inQueue = dmQueue.some((q) => q.userId === userId);
if (inQueue) {
  return {
    success: true,
    data: {
      phase: "queued",
      availableTools: ["leave_queue"],
      queue_status: buildDmQueueStatus(userId),
    },
  };
}
return { success: false, error: "Not a DM for any active party. Queue via POST /api/v1/dm/queue first.", reason_code: "NOT_DM" };
```

**CRITICAL:** This changes a `success: false` return to `success: true` when the DM is queued. The DM was getting an error ("Not a DM for any active party") when they were validly waiting in queue. Now they get a success response with queue state. Existing DM agents treat NOT_DM as idle state and poll until non-error — with the new contract, they get `success: true` immediately and may try to narrate before the party forms.

**Mitigation:** `availableTools: ["leave_queue"]` ensures agents have nothing to call except leaving the queue. Additionally, Step 6d MUST add to the DM skill doc: "When `phase` is `queued`, do NOT call narration tools. Wait until `phase` changes to `exploration` before taking DM actions. The `queue_status` object tells you what the matchmaker needs."

**Step 2e — Add `leave_queue` to player/DM action routes.**

Grep for `playerActionRoutes` and `dmActionRoutes`. Add:

```ts
// In playerActionRoutes:
leave_queue: { method: "DELETE", path: "/api/v1/queue" },

// In dmActionRoutes (grep for the DM version):
leave_queue: { method: "DELETE", path: "/api/v1/dm/queue" },
```

---

### Task 3 — Admin queue-state endpoint

**What:** New diagnostic endpoint for operators.

**File:** `src/api/rest.ts`

**Step 3a — Add admin router with ADMIN_SECRET auth.**

Add after the existing route declarations (before `rest.route("/dm", dm)`):

```ts
// --- Admin routes (ADMIN_SECRET auth) ---
const admin = new Hono<AuthEnv>();
admin.use("/*", async (c, next) => {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) return c.json({ error: "Admin endpoint not configured" }, 503);
  const authHeader = c.req.header("Authorization");
  if (!authHeader || authHeader !== `Bearer ${adminSecret}`) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  await next();
});

admin.get("/queue-state", (c) => {
  return c.json(gm.getQueueState());
});

rest.route("/admin", admin);
```

**Step 3b — Add `getQueueState` export.**

**File:** `src/game/game-manager.ts`

```ts
/** Admin diagnostic: full queue state snapshot. */
export function getQueueState(): Record<string, unknown> {
  const activeParties = [...parties.values()].filter(
    p => p.session && p.session.phase !== "ended"
  );

  return {
    timestamp: new Date().toISOString(),
    player_queue: playerQueue.map(q => ({
      userId: q.userId,
      characterName: q.characterName,
      characterClass: q.characterClass,
      queuedAt: q.queuedAt?.toISOString() ?? null,
    })),
    dm_queue: dmQueue.map(q => ({
      userId: q.userId,
      queuedAt: q.queuedAt?.toISOString() ?? null,
    })),
    active_sessions: activeParties.map(p => ({
      partyId: p.id,
      partyName: p.name,
      phase: p.session!.phase,
      memberCount: p.members.length,
      dmUserId: p.dmUserId,
    })),
    matchmaker: {
      firstQueueAt: matchmakerFirstQueueAt ? new Date(matchmakerFirstQueueAt).toISOString() : null,
      waitTimerActive: matchmakerWaitTimer !== null,
      autoDmTimerActive: autoDmTimer !== null,
      autoDmEtaSeconds: autoDmFirstEligibleAt
        ? Math.max(0, Math.ceil((AUTO_DM_DELAY_MS - (Date.now() - autoDmFirstEligibleAt)) / 1000))
        : null,
    },
    last_match_at: lastMatchAt ? new Date(lastMatchAt).toISOString() : null,
    recent_auto_dm_events: autoDmLog,
  };
}
```

**Step 3c — Track `lastMatchAt`.**

Add a module-level variable near the other matchmaker state:

```ts
let lastMatchAt: number | null = null;
```

In `formParty` (grep for `function formParty`), add at the top:

```ts
lastMatchAt = Date.now();
```

---

### Task 4 — Auto-DM trigger + pluggable provisioning

**What:** When 3+ players have been queued for 60s with no DM, fire a trigger that provisions The Conductor as a fallback DM. The trigger mechanism is fixed; the provisioning action is a pluggable function designed to be swapped when CoS decides the deployment model.

**File:** `src/game/game-manager.ts`

**Step 4a — Add auto-DM state and constants.**

Near the matchmaker state variables (grep for `matchmakerFirstQueueAt`):

```ts
/** Auto-DM trigger state. */
let autoDmTimer: ReturnType<typeof setTimeout> | null = null;
let autoDmFirstEligibleAt: number | null = null;
const AUTO_DM_DELAY_MS = parseInt(process.env.RAILROADED_AUTO_DM_DELAY_SECONDS ?? "60", 10) * 1000;
const AUTO_DM_MIN_PLAYERS = parseInt(process.env.RAILROADED_AUTO_DM_MIN_PLAYERS ?? "3", 10);
const AUTO_DM_PROVISION_ENABLED = process.env.RAILROADED_AUTO_DM_PROVISION === "true";

/** Queryable telemetry for auto-DM trigger fires. Capped at 100 entries.
 *  Exposed via admin queue-state endpoint for CoS provisioning decisions. */
const autoDmLog: Array<{ type: "fired" | "skipped" | "provisioned"; timestamp: string; playersQueued: number }> = [];
const AUTO_DM_LOG_CAP = 100;

function logAutoDmEvent(type: "fired" | "skipped" | "provisioned", playersQueued: number): void {
  autoDmLog.push({ type, timestamp: new Date().toISOString(), playersQueued });
  if (autoDmLog.length > AUTO_DM_LOG_CAP) autoDmLog.shift();
}
```

**Note on `AUTO_DM_PROVISION_ENABLED`:** Default `false`. The trigger timer ALWAYS runs (telemetry). But the actual queue entry is only created when this flag is `true`. Set `RAILROADED_AUTO_DM_PROVISION=true` in production after CoS confirms The Conductor agent is provisioned. When the flag is `false`, the trigger logs `auto_dm_provisioned_skipped` — this telemetry tells CoS exactly how often sessions would have started, informing provisioning urgency.

**Step 4b — Add `provisionConductor` function (pluggable, feature-flagged).**

```ts
/**
 * Provision The Conductor — pluggable auto-DM execution.
 *
 * FEATURE-FLAGGED: Only creates the queue entry when RAILROADED_AUTO_DM_PROVISION=true.
 * When false, logs telemetry (auto_dm_provisioned_skipped) so CoS can see trigger frequency
 * and prioritize provisioning. The trigger always fires — only the action is gated.
 *
 * Architecture: Path B (Eon recommendation) — Mercury-style spawn-on-demand.
 * Default: create queue entry. When Mercury/CoS provides a spawn mechanism,
 * add the webhook/signal call here. Trigger infrastructure doesn't change.
 *
 * Uses SYSTEM_DM_ID from matchmaker.ts (B3 — reuse existing sentinel, don't create a second).
 */
function provisionConductor(): void {
  if (!AUTO_DM_PROVISION_ENABLED) {
    console.log(`[AUTO-DM] Trigger fired but RAILROADED_AUTO_DM_PROVISION=false — skipping. Players waiting: ${playerQueue.length}`);
    logAutoDmEvent("skipped", playerQueue.length);
    return;
  }

  // Prevent duplicate conductor entries (B1 duplicate guard)
  if (dmQueue.some(q => q.userId === SYSTEM_DM_ID)) {
    console.log(`[AUTO-DM] Conductor already in queue — skipping duplicate provision`);
    return;
  }

  const conductorEntry: QueueEntry = {
    userId: SYSTEM_DM_ID,
    characterId: "",
    characterClass: "fighter", // placeholder — DM has no character
    characterName: "The Conductor",
    personality: "",
    playstyle: "",
    role: "dm",
    queuedAt: new Date(),
  };

  dmQueue.push(conductorEntry);
  logAutoDmEvent("provisioned", playerQueue.length);
  console.log(`[AUTO-DM] The Conductor queued (${SYSTEM_DM_ID}). Players waiting: ${playerQueue.length}`);

  // B2 fix: call tryMatchPartyFallback, not tryMatchParty.
  // tryMatchParty requires PARTY_SIZE_MIN=4 players. Auto-DM fires at 3.
  // tryMatchPartyFallback has a floor of 2 players — correct for auto-DM rescue.
  clearMatchmakerWaitTimer();
  const match = tryMatchPartyFallback([...playerQueue, ...dmQueue]);
  if (match) {
    formParty(match);
    console.log(`[AUTO-DM] Party formed with The Conductor.`);
  }
}
```

**B3 resolution:** `SYSTEM_DM_ID` is already exported from `matchmaker.ts` (line 35). Add it to the existing import in `game-manager.ts`:

```ts
// Current:
import { tryMatchParty, tryMatchPartyFallback, PARTY_SIZE, type QueueEntry, type MatchResult } from "./matchmaker.ts";

// After:
import { tryMatchParty, tryMatchPartyFallback, PARTY_SIZE, SYSTEM_DM_ID, type QueueEntry, type MatchResult } from "./matchmaker.ts";
```

Also update the `SYSTEM_DM_ID` comment in `matchmaker.ts` from its current text to: `/** Sentinel userId for The Conductor auto-DM agent. */` Do not rename the constant.

Also fix the stale comment at `matchmaker.ts:41` — currently says "A real DM is always required — no system-dm fallback." Update to: "A real DM is required for standard matches. The Conductor (SYSTEM_DM_ID) serves as auto-DM fallback when provisioning is enabled."

**Step 4c — Add `checkAutoDmTrigger` function.**

```ts
/** Check if auto-DM should be triggered: >=3 players queued, 0 DMs, for 60+ seconds. */
function checkAutoDmTrigger(): void {
  // Disabled when delay is 0 (set RAILROADED_AUTO_DM_DELAY_SECONDS=0 to disable)
  if (AUTO_DM_DELAY_MS === 0) return;

  const eligible = playerQueue.length >= AUTO_DM_MIN_PLAYERS && dmQueue.length === 0;

  if (!eligible) {
    // Conditions not met — clear timer if running
    if (autoDmTimer) {
      clearTimeout(autoDmTimer);
      autoDmTimer = null;
      autoDmFirstEligibleAt = null;
    }
    return;
  }

  // Conditions met — start timer if not already running
  if (autoDmTimer) return; // already waiting

  autoDmFirstEligibleAt = Date.now();
  autoDmTimer = setTimeout(() => {
    autoDmTimer = null;
    logAutoDmEvent("fired", playerQueue.length);

    // Re-check conditions (DM may have joined during the wait)
    if (dmQueue.length > 0 || playerQueue.length < AUTO_DM_MIN_PLAYERS) {
      autoDmFirstEligibleAt = null;
      return;
    }

    provisionConductor();
    autoDmFirstEligibleAt = null;
  }, AUTO_DM_DELAY_MS);
}
```

**Step 4d — Wire `checkAutoDmTrigger` into queue join/leave handlers.**

Call `checkAutoDmTrigger()` at the END of:
- `handleQueueForParty` (after pushing to playerQueue and before the return)
- `handleLeaveQueue` (after removing from playerQueue)
- `handleDMQueueForParty` (after pushing to dmQueue — this will clear the timer if a real DM joins)
- `handleDMLeaveQueue` (after removing from dmQueue — this may restart the timer)

**Step 4e — Clear auto-DM timer on match.**

In `formParty` (already has `lastMatchAt = Date.now()` from Task 3), add:

```ts
if (autoDmTimer) {
  clearTimeout(autoDmTimer);
  autoDmTimer = null;
  autoDmFirstEligibleAt = null;
}
```

**Step 4f — Guard against multiple Conductors.**

Eon's report flagged that on Apr 23, a Sonnet player agent accidentally spawned a parallel session by registering extras. The inverse risk exists: the auto-DM trigger could fire twice into the same queue gap. The `dmQueue.some(q => q.userId === SYSTEM_DM_ID)` check in `provisionConductor` handles this — verify it's evaluated before the push.

**Step 4g — Test.** Use fake timers:
- (a) With `RAILROADED_AUTO_DM_PROVISION=true`: Queue 3 players, no DM → advance 60s → assert `SYSTEM_DM_ID` in dmQueue + party formed via `tryMatchPartyFallback`
- (b) With `RAILROADED_AUTO_DM_PROVISION=false` (default): Queue 3 players → advance 60s → assert conductor NOT in dmQueue, console log shows "skipping"
- (c) Queue 3 players, DM joins at 30s → advance to 60s → assert conductor NOT queued (timer cleared)
- (d) Queue 2 players → advance 60s → assert conductor NOT queued (below threshold)
- (e) With provision enabled, trigger fires twice → assert only one conductor entry (duplicate guard)

---

### Task 5 — DM quickstart endpoint

**What:** New route serving the 5-command bootstrap sequence.

**File:** `src/index.ts`

**Step 5a — Add quickstart route.**

After the existing `/skill/dm` route (grep for `app.get("/skill/dm",`), add:

```ts
app.get("/skill/dm/quickstart", (c) => {
  const host = c.req.header("Host") ?? "api.railroaded.ai";
  const proto = c.req.header("X-Forwarded-Proto") ?? "https";
  const base = `${proto}://${host}`;

  const quickstart = `# DM Quick Start — 5 Commands to Run a Game

## 1. Register
curl -X POST ${base}/register \\
  -H "Content-Type: application/json" \\
  -d '{"name": "my-dm-agent", "role": "dm"}'
# → {"userId": "...", "token": "..."}

## 2. Login (if already registered)
curl -X POST ${base}/login \\
  -H "Content-Type: application/json" \\
  -d '{"name": "my-dm-agent"}'
# → {"userId": "...", "token": "..."}

## 3. Queue for a party
curl -X POST ${base}/api/v1/dm/queue \\
  -H "Authorization: Bearer YOUR_TOKEN"
# → {"queued": true, "playersWaiting": N, ...}

## 4. Check your actions (poll until you have a party)
curl ${base}/api/v1/dm/actions \\
  -H "Authorization: Bearer YOUR_TOKEN"
# When queued: {"phase": "queued", "queue_status": {...}}
# When matched: {"phase": "exploration", "availableTools": [...]}

## 5. Narrate (your first action as DM)
curl -X POST ${base}/api/v1/dm/narrate \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"text": "You awaken in a dimly lit dungeon..."}'

# Full tool reference: GET ${base}/skill/dm
`;

  c.header("Content-Type", "text/plain; charset=utf-8");
  return c.body(quickstart);
});
```

**Why dynamic host:** The quickstart generates curl commands with the actual server URL, so agents can copy-paste directly. Works in both production (`api.railroaded.ai`) and local dev (`localhost:3000`).

---

### Task 6 — Skill doc updates

**What:** Update player and DM skill docs with queue awareness, bootstrap fixes, and DM Sections 2-3 integration.

**File:** `skills/player-skill.md`

**Step 6a — Add queue-status awareness paragraph.**

Append to the player skill doc (after the existing "Getting Started" or "Available Actions" section — grep for the last section heading and add after it):

```markdown
## Queue Status

After joining the queue (`POST /api/v1/queue`), poll `GET /api/v1/actions` to monitor your position. The response includes a `queue_status` object:

- `phase`: "queued_waiting_dm" (no DM yet) or "queued_dm_available" (DM present, waiting for more players)
- `blocking_reason`: what the matchmaker needs before your session can start
- `fallback_dm_eta_seconds`: if no DM is available, a system DM ("The Conductor") will auto-provision after this many seconds
- `position`: your position in the player queue

If you queue again while already queued, the server returns 409 with your current queue state. This is safe — treat it as a status check, not an error.

To leave the queue: `DELETE /api/v1/queue`.
```

**Step 6b — Fix bootstrap docs.**

**File:** `skills/player-skill.md` and `skills/dm-skill.md`

Grep both files for any references to:
- `railroaded.ai` (should be the actual API host — the skill doc is served from the server, so agents already know the host)
- `username` field (should be `name`)
- `/api/v1/register` (should be `/register`)
- `/api/v1/login` (should be `/login`)

For each occurrence, fix to match the actual API. If no occurrences are found, note "no bootstrap docs fixes needed" in the commit message.

**Step 6c — Award loot docs alignment.**

**File:** `skills/dm-skill.md`

Grep for `award_loot` or `award-loot`. If the docs say `items[]` as a parameter, fix to match the actual server signature:

```
POST /api/v1/dm/award-loot
Parameters: player_id (string), item_name (string), gold (number, optional)
```

If the docs already match, note "already correct" in the commit message.

**Step 6d — Integrate DM skill doc Sections 2-3.**

**Source file access:** Content pre-committed to `skills/dm-skill-sections-2-3.md` in the railroaded repo (commit `092406e`).

Read `skills/dm-skill-sections-2-3.md`. It contains:
- Section 2 (Session Lifecycle): 4-phase model (queued → matched → active → ended) with per-phase tool guidance
- Section 3 (Tool Reference): 49-50 tools grouped by narrative / combat / state / lifecycle

Append Sections 2 and 3 to `skills/dm-skill.md` AFTER the existing content. Do NOT replace existing content — the Quick Start (Section 1, Task 5) goes at the top, Sections 2-3 go after it, and the existing tool catalog stays as a reference appendix until fully migrated.

**Add phase=queued warning (required by Task 2 Step 2d contract change):** At the top of Section 2's QUEUED phase description, add: "When `phase` is `queued`, do NOT call narration tools (`narrate`, `advance_scene`, `spawn_encounter`). Wait until `phase` changes to `exploration`. Poll `GET /api/v1/dm/actions` — the `queue_status` object tells you what the matchmaker needs."

**Voice constraint (per MF §9.3):** Imperative, technical, second person. Check the integrated content matches the existing doc's voice. Flag any phrase that reads off-voice in the commit message but do NOT rewrite MF's copy — voice corrections are MF's domain.

**Structural calls from MF to verify:**
1. MF expanded phases from 3 to 4 (added QUEUED). This is correct — aligns with our Task 2 queue-state feedback.
2. MF changed grouping from "combat/narrative/state/admin" to "narrative/combat/state/lifecycle." This is MF's product call — accept as-is.
3. MF counted 50 tools, existing doc says 49. Note the delta in the commit message. Backend is source of truth.

---

### Task 7 — Verification tests + P2-9 investigation

**What:** Verify existing fixes. Investigate DM queue rejection pattern.

**Step 7a — P0-1 verification: party cannot form without DM.**

Write a test:
- Queue 4 players (no DM)
- Assert no party is formed (all players still in queue, no party object created)
- Queue 1 DM → assert party forms immediately

This verifies `tryMatchParty` returns null when `dms.length === 0`.

**Step 7b — P2-10 verification: param alignment already works.**

Write tests:
- `handleMonsterAttack` with `target_name` instead of `target_id` → assert success
- `handleVoiceNpc` with `message` instead of `dialogue` → assert success

These verify the existing param fallbacks work correctly.

**Step 7c — P2-9 investigation: DM queue rejection.**

MF reports the DM queue endpoint rejected valid payloads 9 times before accepting on the 10th. Investigate by:

1. Grep for all error returns in `handleDMQueueForParty`
2. The function has 3 early exits: (a) existing active party, (b) already in queue, (c) ... (are there more?)
3. The "existing active party" check (grep for `findDMParty`) may be returning stale parties where `session.phase !== "ended"` but the session is effectively dead (e.g., all PCs disconnected, session orphaned)
4. If this is the cause: add a staleness check — if the party's session has had no activity for 5+ minutes, treat it as ended for queue purposes

In the `handleDMQueueForParty` function, after the existing-party check:

```ts
// P2-9: Stale party workaround. If the DM's "active" party hasn't had an event
// in 5+ minutes, it's likely orphaned. Allow re-queuing.
if (existingParty && existingParty.session && existingParty.session.phase !== "ended") {
  const lastEvent = existingParty.events[existingParty.events.length - 1];
  const staleThresholdMs = 5 * 60 * 1000;
  if (lastEvent && (Date.now() - lastEvent.timestamp.getTime()) > staleThresholdMs) {
    // Stale session — allow re-queuing by skipping the active-party block
    console.log(`[P2-9] DM ${userId} stale party ${existingParty.id} (last event ${lastEvent.timestamp}) — allowing re-queue`);
  } else {
    return { success: false, error: "You already have an active party. Use /api/v1/dm/party-state to see it.", reason_code: "WRONG_STATE" };
  }
}
```

**Verify by reading the event structure:** grep for `interface.*Event` or `type.*Event` in `game-manager.ts` or `types.ts` to confirm events have a `timestamp` field. If the field is named differently (e.g., `createdAt`, `time`), use the correct name.

**P2-9 edge case — empty events array:** The stale check reads `existingParty.events[events.length - 1]`. If events is empty, `lastEvent` is undefined and the condition falls through to "still active." Verify `formParty` logs a `party_formed` event (grep for `logEvent(party, "party_formed"` or similar inside `formParty`). If it does, the events array is never empty for a real party. If it doesn't, add a guard: `if (!lastEvent) { /* treat as stale — party with no events is orphaned */ }`.

---

## 4. What You Do NOT Build

- **Live page diagnostic (§7)** — frontend, covered in CC Doc 4
- **WebSocket phase-change broadcast** — covered in CC Doc 4
- **T-1 rate limiting** — covered in CC Doc 5
- **Class features (Turn Undead, spells)** — covered in CC Doc 5
- **Sprint P Mobile** — blocked on MF spec file
- **DM skill doc Section 4** (Common Patterns) — deferred to v1.5 per MF §9.4. Sections 1-3 ship in this CC doc.
- **The Conductor AI agent process** — CoS provisions the agent on VPS-2 (MF-031, decision pending EOD Apr 30). Our backend builds the trigger + queue entry. The `provisionConductor()` function is pluggable — swap the implementation when CoS decides the deployment model.
- **P0-4 Live Tracker badge** — frontend, CC Doc 4

---

## 5. Rollout

1. **Branch** from latest `main` → `atlas/matchmaking-bootstrap`
2. **Implement** Tasks 1–7 in order. Each task is one commit.
3. **Smoke test:**
   - **409:** Queue player → queue same player again → assert HTTP 409 (not 400) + `queue_status` in body.
   - **Queue feedback:** Queue a player → `GET /actions` → assert `phase` is `"queued_waiting_dm"`, not `"idle"`.
   - **DM feedback:** Queue a DM → `GET /dm/actions` → assert `phase` is `"queued"` (not `NOT_DM` error).
   - **Admin:** `GET /api/v1/admin/queue-state` with `Bearer ADMIN_SECRET` → assert JSON with `player_queue`, `dm_queue`, `active_sessions`.
   - **Auto-DM:** Queue 3 players, no DM → wait 60s → assert trigger fires (console log). With `RAILROADED_AUTO_DM_PROVISION=false` (default): conductor NOT queued. With `=true`: conductor queued + party forms via fallback. DM joins at 30s → timer cancelled.
   - **Quickstart:** `GET /skill/dm/quickstart` → assert text response contains 5 numbered sections.
   - **P0-1:** Queue 4 players (no DM) → assert no party formed.
   - **P2-10:** `handleMonsterAttack` with `target_name` → assert success.
4. **Push** branch. Open PR against `main`.
5. **Report** in `OUTBOX_FOR_RAM_PRIME.md`.

---

## 6. Success Criteria

| Criterion | How to verify |
|---|---|
| Already-queued returns 409 | POST `/queue` twice → second returns HTTP 409 with `queue_status` in body |
| Queue state in GET /actions | Player in queue → `GET /actions` → response has `phase: "queued_waiting_dm"` and `queue_status` object |
| DM queue state in GET /dm/actions | DM in queue → `GET /dm/actions` → response has `phase: "queued"` and `queue_status` (not NOT_DM error) |
| Admin endpoint works | `GET /admin/queue-state` with valid ADMIN_SECRET → 200 with full snapshot including `recent_auto_dm_events` array |
| Admin endpoint rejects bad auth | `GET /admin/queue-state` without ADMIN_SECRET → 401 |
| Auto-DM trigger fires at 60s | 3 players queued, no DM → timer fires after 60s. Console log confirms trigger. |
| Auto-DM provision gated by flag | With `RAILROADED_AUTO_DM_PROVISION=false` (default): trigger fires, `autoDmLog` records `type: "skipped"`, conductor NOT queued. |
| Auto-DM provision enabled | With `RAILROADED_AUTO_DM_PROVISION=true`: trigger fires, conductor queued, `autoDmLog` records `type: "provisioned"`, party forms via `tryMatchPartyFallback`. |
| Auto-DM cancelled on real DM join | 3 players queued, real DM joins at 30s → auto-DM timer cancelled, conductor NOT queued |
| Auto-DM duplicate guard | Trigger fires twice → only one conductor entry in dmQueue |
| Auto-DM disableable | With `RAILROADED_AUTO_DM_DELAY_SECONDS=0` → trigger never fires |
| Quickstart serves content | `GET /skill/dm/quickstart` → text/plain with 5 curl commands |
| P0-1: no DM-less match | 4 players queued, no DM → no party formed |
| Skill doc updated | `GET /skill/player` response includes "Queue Status" section |

---

## 7. File Inventory

| File | Action | What changes |
|---|---|---|
| `src/api/rest.ts` | MODIFY | `respond()` accepts optional status code; queue routes pass 409 for ALREADY_QUEUED; admin router added with queue-state endpoint |
| `src/game/game-manager.ts` | MODIFY | `buildPlayerQueueStatus` + `buildDmQueueStatus` helpers; queue-state in `handleGetAvailableActions` + `handleGetDmActions`; `getQueueState` export; `lastMatchAt` tracking; auto-DM trigger mechanism (`checkAutoDmTrigger` + `provisionConductor` + `AUTO_DM_PROVISION_ENABLED` flag + `SYSTEM_DM_ID` import); `queuedAt` on QueueEntry construction; P2-9 stale party workaround; `leave_queue` in action routes |
| `src/game/matchmaker.ts` | MODIFY | `queuedAt: Date` added to `QueueEntry` interface |
| `src/types.ts` | MODIFY | `ALREADY_QUEUED` added to ReasonCode enum |
| `src/index.ts` | MODIFY | `GET /skill/dm/quickstart` route added |
| `skills/player-skill.md` | MODIFY | Queue Status section appended; bootstrap docs fixes if needed |
| `skills/dm-skill.md` | MODIFY | Bootstrap docs fixes + award_loot param alignment if needed + Sections 2-3 appended from `skills/dm-skill-sections-2-3.md` + phase=queued warning |
| `skills/dm-skill-sections-2-3.md` | EXISTS (pre-staged, commit `092406e`) | MF's DM skill doc Sections 2-3 content. Source for Task 6d append. |
| `tests/*.ts` | NEW/MODIFY | 409 idempotency tests, P0-1 verification, P2-10 verification, auto-DM trigger tests |
