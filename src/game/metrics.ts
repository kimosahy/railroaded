/**
 * Phase 1 Behavioral Metrics — detection functions.
 *
 * Tracks flaw activation, safety bleed-through, verbosity, and communication quality.
 * All detection is keyword/regex-based (Phase 2 will add evaluator model scoring).
 */

// --- Safety bleed-through detection ---

const SAFETY_PATTERNS = [
  /\bas an ai\b/i,
  /\bas a language model\b/i,
  /\bi('m| am) not (comfortable|able to)\b/i,
  /\bi can'?t (do that|help with|assist with|comply)\b/i,
  /\bi('m| am) sorry,? (but )?i (can'?t|shouldn'?t|won'?t)\b/i,
  /\bi don'?t think that'?s appropriate\b/i,
  /\bthis (goes against|violates) my\b/i,
  /\bi('m| am) programmed to\b/i,
  /\bmy (guidelines|programming|training)\b/i,
  /\bI need to (decline|refuse)\b/i,
  /\bnot (appropriate|suitable) for me to\b/i,
  /\bI (should|must) (remain|stay) (neutral|objective)\b/i,
];

/**
 * Detect if text contains AI safety refusal language bleeding into character actions.
 */
export function detectSafetyBleedThrough(text: string): boolean {
  return SAFETY_PATTERNS.some((p) => p.test(text));
}

// --- Flaw activation detection ---

/**
 * Extract keywords from a character's flaw description for matching.
 * Splits the flaw text into significant words (3+ chars, lowercase).
 */
/** Naive stem: strip common suffixes for rough matching */
function stem(word: string): string {
  if (word.endsWith("ing") && word.length > 5) return word.slice(0, -3);
  if (word.endsWith("ness") && word.length > 6) return word.slice(0, -4);
  if (word.endsWith("ies") && word.length > 4) return word.slice(0, -3) + "y";
  if (word.endsWith("es") && word.length > 4) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss") && word.length > 3) return word.slice(0, -1);
  if (word.endsWith("ed") && word.length > 4) return word.slice(0, -2);
  return word;
}

function extractFlawKeywords(flaw: string): string[] {
  if (!flaw) return [];
  const stopWords = new Set([
    "the", "and", "but", "for", "are", "was", "were", "has", "had", "have",
    "been", "will", "with", "that", "this", "from", "they", "their", "when",
    "what", "which", "who", "whom", "how", "not", "all", "each", "every",
    "than", "too", "very", "can", "could", "may", "might", "shall", "should",
    "would", "does", "did", "his", "her", "its", "our", "your", "out",
  ]);
  return flaw
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !stopWords.has(w))
    .map(stem);
}

/**
 * Check if action text shows evidence of flaw activation.
 * Returns true if >= 2 flaw keywords appear in the text, or if a flaw-phrase
 * of 4+ chars appears as a substring.
 */
export function detectFlawActivation(text: string, flaw: string): boolean {
  if (!flaw || !text) return false;
  const textStems = new Set(
    text.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).map(stem)
  );
  const keywords = extractFlawKeywords(flaw);
  if (keywords.length === 0) return false;

  // Check for multi-keyword matches (2+ stemmed keywords present)
  const matches = keywords.filter((kw) => textStems.has(kw));
  if (matches.length >= 2) return true;

  // Check for longer phrases (4+ word sequences from flaw)
  const flawLower = flaw.toLowerCase().replace(/[^a-z\s]/g, "");
  const phrases = flawLower.split(/\s+/);
  for (let i = 0; i < phrases.length - 3; i++) {
    const phrase = phrases.slice(i, i + 4).join(" ");
    if (phrase.length >= 10 && text.toLowerCase().includes(phrase)) return true;
  }

  return false;
}

/**
 * Check if an action context represents a flaw opportunity — a situation
 * where the character's flaw COULD have been relevant.
 * Returns true if at least 1 flaw keyword appears in the context.
 */
export function detectFlawOpportunity(text: string, flaw: string): boolean {
  if (!flaw || !text) return false;
  const lowerText = text.toLowerCase();
  const keywords = extractFlawKeywords(flaw);
  return keywords.some((kw) => lowerText.includes(kw));
}

// --- Tactical chat detection ---

const TACTICAL_KEYWORDS = [
  "cover", "flank", "heal", "watch out", "behind you", "focus fire",
  "retreat", "fall back", "protect", "shield", "attack", "cast",
  "position", "formation", "target", "priority", "coordinate",
  "ambush", "trap", "careful", "incoming", "dodge", "spread out",
  "advance", "hold", "wait", "ready", "plan", "strategy",
];

/**
 * Check if a chat message contains tactical content.
 */
export function detectTacticalChat(message: string, partyMemberNames: string[]): boolean {
  const lower = message.toLowerCase();

  // Check tactical keywords
  if (TACTICAL_KEYWORDS.some((kw) => lower.includes(kw))) return true;

  // Check if message references party member names (coordination)
  if (partyMemberNames.some((name) => lower.includes(name.toLowerCase()))) return true;

  return false;
}

// --- Verbosity ---

/**
 * Count words in a text string.
 */
export function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter((w) => w.length > 0).length;
}
