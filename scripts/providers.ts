/**
 * LLM Provider interface — wraps each provider's REST API using native fetch.
 * No SDKs — keep deps minimal.
 */

export interface LLMResponse {
  content: string;
  inputTokens: number;
  outputTokens: number;
}

export interface LLMProvider {
  name: string;
  call(params: {
    systemPrompt: string;
    userMessage: string;
    model: string;
    temperature: number;
    jsonMode?: boolean;
  }): Promise<LLMResponse>;
}

// --- Retry helper ---

async function withRetry<T>(fn: () => Promise<T>, retries: number = 1): Promise<T> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (attempt < retries && (errMsg.includes("429") || errMsg.includes("5") || errMsg.includes("rate"))) {
        console.warn(`[LLM] Retrying after error: ${errMsg} (attempt ${attempt + 1}/${retries + 1})`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Unreachable");
}

// --- Anthropic Provider ---

class AnthropicProvider implements LLMProvider {
  name = "anthropic";

  async call(params: {
    systemPrompt: string;
    userMessage: string;
    model: string;
    temperature: number;
    jsonMode?: boolean;
  }): Promise<LLMResponse> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    return withRetry(async () => {
      let userContent = params.userMessage;
      if (params.jsonMode) {
        userContent += "\n\nRespond with valid JSON only. No markdown fences, no extra text.";
      }

      const body: Record<string, unknown> = {
        model: params.model,
        max_tokens: 2048,
        temperature: params.temperature,
        system: params.systemPrompt,
        messages: [{ role: "user", content: userContent }],
      };

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Anthropic ${res.status}: ${errText}`);
      }

      const data = await res.json() as {
        content: Array<{ type: string; text?: string }>;
        usage: { input_tokens: number; output_tokens: number };
      };

      const text = data.content.find(c => c.type === "text")?.text ?? "";
      return {
        content: text,
        inputTokens: data.usage?.input_tokens ?? 0,
        outputTokens: data.usage?.output_tokens ?? 0,
      };
    });
  }
}

// --- Google Gemini Provider ---

class GoogleProvider implements LLMProvider {
  name = "google";

  async call(params: {
    systemPrompt: string;
    userMessage: string;
    model: string;
    temperature: number;
    jsonMode?: boolean;
  }): Promise<LLMResponse> {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) throw new Error("GOOGLE_API_KEY not set");

    return withRetry(async () => {
      const body: Record<string, unknown> = {
        contents: [{ parts: [{ text: params.userMessage }] }],
        systemInstruction: { parts: [{ text: params.systemPrompt }] },
        generationConfig: {
          temperature: params.temperature,
          maxOutputTokens: 2048,
          ...(params.jsonMode ? { responseMimeType: "application/json" } : {}),
        },
      };

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${params.model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Google ${res.status}: ${errText}`);
      }

      const data = await res.json() as {
        candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
        usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
      };

      const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      return {
        content: text,
        inputTokens: data.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0,
      };
    });
  }
}

// --- OpenAI-Compatible Provider (shared by Groq, DeepSeek, OpenAI) ---

class OpenAICompatibleProvider implements LLMProvider {
  name: string;
  private baseUrl: string;
  private apiKeyEnv: string;
  private authHeader: string;

  constructor(name: string, baseUrl: string, apiKeyEnv: string) {
    this.name = name;
    this.baseUrl = baseUrl;
    this.apiKeyEnv = apiKeyEnv;
    this.authHeader = "Bearer";
  }

  async call(params: {
    systemPrompt: string;
    userMessage: string;
    model: string;
    temperature: number;
    jsonMode?: boolean;
  }): Promise<LLMResponse> {
    const apiKey = process.env[this.apiKeyEnv];
    if (!apiKey) throw new Error(`${this.apiKeyEnv} not set`);

    return withRetry(async () => {
      const body: Record<string, unknown> = {
        model: params.model,
        max_tokens: 2048,
        temperature: params.temperature,
        messages: [
          { role: "system", content: params.systemPrompt },
          { role: "user", content: params.userMessage },
        ],
        ...(params.jsonMode ? { response_format: { type: "json_object" } } : {}),
      };

      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `${this.authHeader} ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`${this.name} ${res.status}: ${errText}`);
      }

      const data = await res.json() as {
        choices: Array<{ message: { content: string } }>;
        usage?: { prompt_tokens: number; completion_tokens: number };
      };

      const text = data.choices?.[0]?.message?.content ?? "";
      return {
        content: text,
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      };
    });
  }
}

// --- Provider registry ---

const providers: Record<string, LLMProvider> = {
  anthropic: new AnthropicProvider(),
  google: new GoogleProvider(),
  groq: new OpenAICompatibleProvider("groq", "https://api.groq.com/openai/v1", "GROQ_API_KEY"),
  deepseek: new OpenAICompatibleProvider("deepseek", "https://api.deepseek.com", "DEEPSEEK_API_KEY"),
  openai: new OpenAICompatibleProvider("openai", "https://api.openai.com/v1", "OPENAI_API_KEY"),
};

export function getProvider(providerName: string): LLMProvider {
  const provider = providers[providerName];
  if (!provider) throw new Error(`Unknown provider: ${providerName}. Available: ${Object.keys(providers).join(", ")}`);
  return provider;
}
