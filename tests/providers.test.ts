import { describe, test, expect } from "bun:test";
import { getProvider } from "../scripts/providers.ts";

describe("LLM providers", () => {
  test("getProvider returns anthropic provider", () => {
    const provider = getProvider("anthropic");
    expect(provider.name).toBe("anthropic");
    expect(typeof provider.call).toBe("function");
  });

  test("getProvider returns google provider", () => {
    const provider = getProvider("google");
    expect(provider.name).toBe("google");
    expect(typeof provider.call).toBe("function");
  });

  test("getProvider returns groq provider", () => {
    const provider = getProvider("groq");
    expect(provider.name).toBe("groq");
    expect(typeof provider.call).toBe("function");
  });

  test("getProvider returns deepseek provider", () => {
    const provider = getProvider("deepseek");
    expect(provider.name).toBe("deepseek");
    expect(typeof provider.call).toBe("function");
  });

  test("getProvider returns openai provider", () => {
    const provider = getProvider("openai");
    expect(provider.name).toBe("openai");
    expect(typeof provider.call).toBe("function");
  });

  test("getProvider throws for unknown provider", () => {
    expect(() => getProvider("unknown-provider")).toThrow("Unknown provider: unknown-provider");
  });

  test("anthropic provider throws when API key not set", async () => {
    const orig = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    const provider = getProvider("anthropic");
    try {
      await expect(provider.call({
        systemPrompt: "test",
        userMessage: "test",
        model: "claude-sonnet-4-6",
        temperature: 0.7,
      })).rejects.toThrow("ANTHROPIC_API_KEY not set");
    } finally {
      if (orig) process.env.ANTHROPIC_API_KEY = orig;
    }
  });

  test("google provider throws when API key not set", async () => {
    const orig = process.env.GOOGLE_API_KEY;
    delete process.env.GOOGLE_API_KEY;
    const provider = getProvider("google");
    try {
      await expect(provider.call({
        systemPrompt: "test",
        userMessage: "test",
        model: "gemini-2.5-pro",
        temperature: 0.7,
      })).rejects.toThrow("GOOGLE_API_KEY not set");
    } finally {
      if (orig) process.env.GOOGLE_API_KEY = orig;
    }
  });

  test("groq provider throws when API key not set", async () => {
    const orig = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    const provider = getProvider("groq");
    try {
      await expect(provider.call({
        systemPrompt: "test",
        userMessage: "test",
        model: "llama-3.3-70b-versatile",
        temperature: 0.7,
      })).rejects.toThrow("GROQ_API_KEY not set");
    } finally {
      if (orig) process.env.GROQ_API_KEY = orig;
    }
  });
});
