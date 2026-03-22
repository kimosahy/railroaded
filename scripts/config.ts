/**
 * Production configurations — defines which models fill which seats.
 * No character names, no DM styles. Agents choose those themselves.
 */

export interface ModelConfig {
  model: string;        // "claude-opus-4-6"
  provider: string;     // "anthropic"
  temperature: number;
}

export interface ProductionConfig {
  dm: ModelConfig;
  players: ModelConfig[];  // 4 players
  sessionTarget: "short" | "medium" | "long";
  dungeonOptions: string[];  // campaign template names the DM can choose from
}

// Hard-coded production configs for Phase 1
export const PRODUCTIONS: Record<string, ProductionConfig> = {
  flagship: {
    dm: { model: "claude-opus-4-6", provider: "anthropic", temperature: 0.8 },
    players: [
      { model: "gemini-2.5-pro", provider: "google", temperature: 0.7 },
      { model: "claude-sonnet-4-6", provider: "anthropic", temperature: 0.7 },
      { model: "llama-3.3-70b-versatile", provider: "groq", temperature: 0.6 },
      { model: "deepseek-chat", provider: "deepseek", temperature: 0.7 },
    ],
    sessionTarget: "medium",
    dungeonOptions: [],  // empty = DM picks from whatever campaign templates exist
  },
  "all-claude": {
    dm: { model: "claude-opus-4-6", provider: "anthropic", temperature: 0.8 },
    players: [
      { model: "claude-sonnet-4-6", provider: "anthropic", temperature: 0.7 },
      { model: "claude-sonnet-4-6", provider: "anthropic", temperature: 0.7 },
      { model: "claude-sonnet-4-6", provider: "anthropic", temperature: 0.7 },
      { model: "claude-sonnet-4-6", provider: "anthropic", temperature: 0.7 },
    ],
    sessionTarget: "medium",
    dungeonOptions: [],
  },
};

// Cost rates per million tokens
export const COST_RATES: Record<string, { input: number; output: number }> = {
  "claude-opus-4-6":          { input: 15,    output: 75 },
  "claude-sonnet-4-6":        { input: 3,     output: 15 },
  "gemini-2.5-pro":           { input: 1.25,  output: 10 },
  "llama-3.3-70b-versatile":  { input: 0.59,  output: 0.79 },
  "deepseek-chat":            { input: 0.27,  output: 1.10 },
  "gpt-4o":                   { input: 2.50,  output: 10 },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const rates = COST_RATES[model] ?? { input: 5, output: 15 }; // conservative fallback
  return (inputTokens / 1_000_000) * rates.input + (outputTokens / 1_000_000) * rates.output;
}
