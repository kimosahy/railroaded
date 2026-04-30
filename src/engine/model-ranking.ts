/**
 * Artificial Analysis Intelligence Index — model ranking for DM promotion.
 *
 * Source: https://artificialanalysis.ai/api/v2/data/llms/models
 * Refresh: 24h interval. Disk cache survives restart.
 * Lookup: EXACT slug match only. No fuzzy matching, no suffix stripping.
 *   "gpt-5-5-high" (score 60) is distinct from "gpt-5-5-medium" (score 55).
 *   Unknown models get the median score (fair fallback — unknown != bad).
 *
 * NOTE: AA index is a PROXY for general intelligence, not DM quality.
 * Post-session transcript evaluation against a Fekry-authored rubric is
 * the v1.5 evolution. v1 ships the best available signal.
 */

import * as fs from "fs";
import * as path from "path";

const AA_API_URL = "https://artificialanalysis.ai/api/v2/data/llms/models";
const AA_API_KEY = process.env.ARTIFICIAL_ANALYSIS_API_KEY ?? "";
const CACHE_FILE = path.join(process.cwd(), "data", "aa-model-cache.json");
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** Below this many ranked models, median = 0 (small-sample guard). */
const MIN_MODELS_FOR_MEDIAN = 5;

interface AAModelEntry {
  slug: string;
  name: string;
  creator_slug: string;
  intelligence_index: number;
}

let modelScores = new Map<string, number>();
let medianScore = 0;
let lastRefresh = 0;

interface PromotionStats {
  totalAttempts: number;
  totalSuccesses: number;
  totalExhausted: number;
  handshakePassCount: number;
  handshakeFailCount: number;
  unknownModelFallbacks: number;
  lastPromotedUser: string | null;
  lastPromotionOutcome: string | null;
}

const promotionStats: PromotionStats = {
  totalAttempts: 0,
  totalSuccesses: 0,
  totalExhausted: 0,
  handshakePassCount: 0,
  handshakeFailCount: 0,
  unknownModelFallbacks: 0,
  lastPromotedUser: null,
  lastPromotionOutcome: null,
};

/**
 * Get a model's intelligence index score. EXACT MATCH ONLY.
 *
 * Rationale (Atlas BLOCKER-4, Eon #2): fuzzy matching silently misattributes
 * scores. AA slugs are effort-granular — gpt-5-5-high and gpt-5-5-medium are
 * distinct entries with different scores.
 *
 * Unknown models get median score. Every fallback is logged for v1.5 audit.
 */
export function getModelScore(
  modelProvider: string | null,
  modelName: string | null,
): { score: number; matched: boolean } {
  if (!modelProvider && !modelName) return { score: medianScore, matched: false };

  const identity = modelName
    ? modelProvider
      ? `${modelProvider}/${modelName}`
      : modelName
    : "";
  const slug = identity.toLowerCase();

  // Exact match against AA slug (with or without provider prefix)
  if (modelScores.has(slug)) return { score: modelScores.get(slug)!, matched: true };

  // Try just the model name without provider prefix
  const modelOnly = modelName?.toLowerCase() ?? "";
  if (modelOnly && modelScores.has(modelOnly)) {
    return { score: modelScores.get(modelOnly)!, matched: true };
  }

  // No match — median fallback, logged
  promotionStats.unknownModelFallbacks++;
  console.log(`[AA-RANK] Unknown model "${identity}" → median fallback (${medianScore})`);
  return { score: medianScore, matched: false };
}

/**
 * Load disk cache (survives restarts), then refresh from API if key configured.
 * Disk cache never expires — stale rankings beat no rankings.
 * API failure keeps stale cache serving.
 */
export async function initModelRanking(): Promise<void> {
  // Load from disk first (instant, no API call)
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const raw = JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8")) as AAModelEntry[];
      applyCache(raw);
      console.log(`[AA-RANK] Loaded ${modelScores.size} models from disk cache`);
    }
  } catch (err) {
    console.warn("[AA-RANK] Disk cache load failed:", err);
  }

  if (AA_API_KEY) {
    await refreshFromAPI();
    setInterval(refreshFromAPI, REFRESH_INTERVAL_MS);
  } else {
    console.warn("[AA-RANK] No ARTIFICIAL_ANALYSIS_API_KEY — ranking disabled, queue-time only");
  }
}

async function refreshFromAPI(): Promise<void> {
  try {
    const res = await fetch(AA_API_URL, { headers: { "x-api-key": AA_API_KEY } });
    if (!res.ok) {
      console.warn(`[AA-RANK] API ${res.status} — keeping stale cache`);
      return;
    }
    const json = (await res.json()) as {
      data: Array<{
        slug: string;
        name: string;
        model_creator: { slug: string };
        evaluations: { artificial_analysis_intelligence_index?: number };
      }>;
    };

    const entries: AAModelEntry[] = [];
    for (const m of json.data) {
      const score = m.evaluations?.artificial_analysis_intelligence_index;
      if (score != null) {
        entries.push({
          slug: m.slug,
          name: m.name,
          creator_slug: m.model_creator.slug,
          intelligence_index: score,
        });
      }
    }
    if (entries.length === 0) {
      console.warn("[AA-RANK] 0 scored models — keeping stale cache");
      return;
    }

    applyCache(entries);
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(entries, null, 2));
    lastRefresh = Date.now();
    const top = [...entries].sort((a, b) => b.intelligence_index - a.intelligence_index)[0];
    console.log(
      `[AA-RANK] Refreshed: ${entries.length} models. Top: ${top?.name} (${top?.intelligence_index})`,
    );
  } catch (err) {
    console.warn("[AA-RANK] Fetch failed — keeping stale cache:", err);
  }
}

function applyCache(entries: AAModelEntry[]): void {
  modelScores = new Map();
  for (const e of entries) {
    // Index by slug — exact match, no fuzzy
    modelScores.set(e.slug.toLowerCase(), e.intelligence_index);
    // Also index by creator_slug/slug for provider-prefixed identities
    modelScores.set(`${e.creator_slug}/${e.slug}`.toLowerCase(), e.intelligence_index);
  }
  // Median for unknown-model fallback (small-sample guard)
  const scores = entries.map((e) => e.intelligence_index).sort((a, b) => a - b);
  medianScore =
    scores.length >= MIN_MODELS_FOR_MEDIAN
      ? (scores[Math.floor(scores.length / 2)] ?? 0)
      : 0;
}

/** Expose ranking state for admin queue-state endpoint. */
export function getModelRankingState() {
  return {
    modelCount: modelScores.size,
    medianScore,
    lastRefresh: lastRefresh > 0 ? new Date(lastRefresh).toISOString() : null,
    apiKeyConfigured: AA_API_KEY.length > 0,
  };
}

export function getPromotionStats(): PromotionStats {
  return { ...promotionStats };
}

export function recordPromotionAttempt(): void {
  promotionStats.totalAttempts++;
}
export function recordPromotionSuccess(userId: string): void {
  promotionStats.totalSuccesses++;
  promotionStats.lastPromotedUser = userId;
  promotionStats.lastPromotionOutcome = "success";
}
export function recordPromotionExhausted(): void {
  promotionStats.totalExhausted++;
  promotionStats.lastPromotionOutcome = "exhausted";
}
export function recordHandshakePass(): void {
  promotionStats.handshakePassCount++;
}
export function recordHandshakeFail(): void {
  promotionStats.handshakeFailCount++;
}

/** Test-only: reset all internal state. */
export function _resetModelRankingForTest(): void {
  modelScores = new Map();
  medianScore = 0;
  lastRefresh = 0;
  promotionStats.totalAttempts = 0;
  promotionStats.totalSuccesses = 0;
  promotionStats.totalExhausted = 0;
  promotionStats.handshakePassCount = 0;
  promotionStats.handshakeFailCount = 0;
  promotionStats.unknownModelFallbacks = 0;
  promotionStats.lastPromotedUser = null;
  promotionStats.lastPromotionOutcome = null;
}

/** Test-only: seed cache directly without API call. */
export function _seedModelRankingForTest(entries: AAModelEntry[]): void {
  applyCache(entries);
}
