/**
 * FT009: GET /mcp returns a helpful JSON response instead of 404.
 *
 * The MCP endpoint is POST-only (JSON-RPC 2.0). Agents that try GET /mcp
 * should receive a clear explanation of how to use the endpoint, not a 404.
 */
import { describe, test, expect } from "bun:test";
import { Hono } from "hono";
import mcp from "../src/api/mcp.ts";

function buildApp(): Hono {
  const app = new Hono();
  app.route("/", mcp);
  return app;
}

describe("FT009: GET /mcp returns helpful JSON instead of 404", () => {
  const app = buildApp();

  test("GET /mcp returns 200 (not 404)", async () => {
    const res = await app.request("/mcp", { method: "GET" });
    expect(res.status).toBe(200);
  });

  test("GET /mcp response is JSON", async () => {
    const res = await app.request("/mcp", { method: "GET" });
    const body = await res.json();
    expect(typeof body).toBe("object");
  });

  test("GET /mcp response includes message explaining POST requirement", async () => {
    const res = await app.request("/mcp", { method: "GET" });
    const body = await res.json();
    expect(body.message).toBeDefined();
    expect(body.message.toLowerCase()).toContain("post");
    expect(body.message.toLowerCase()).toContain("json-rpc");
  });

  test("GET /mcp response includes protocol field", async () => {
    const res = await app.request("/mcp", { method: "GET" });
    const body = await res.json();
    expect(body.protocol).toBe("JSON-RPC 2.0");
  });

  test("GET /mcp response includes method: POST", async () => {
    const res = await app.request("/mcp", { method: "GET" });
    const body = await res.json();
    expect(body.method).toBe("POST");
  });

  test("GET /mcp response lists supported methods", async () => {
    const res = await app.request("/mcp", { method: "GET" });
    const body = await res.json();
    expect(Array.isArray(body.supportedMethods)).toBe(true);
    expect(body.supportedMethods).toContain("initialize");
    expect(body.supportedMethods).toContain("tools/list");
    expect(body.supportedMethods).toContain("tools/call");
  });

  test("GET /mcp response includes usage examples", async () => {
    const res = await app.request("/mcp", { method: "GET" });
    const body = await res.json();
    expect(body.usage).toBeDefined();
    expect(body.usage.initialize).toBeDefined();
    expect(body.usage.initialize.example).toBeDefined();
    expect(body.usage.initialize.example.method).toBe("initialize");
  });

  test("POST /mcp still works (initialize method requires no auth)", async () => {
    const res = await app.request("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result).toBeDefined();
    expect(body.result.protocolVersion).toBeDefined();
    expect(body.result.serverInfo.name).toBe("quest-engine");
  });

  test("POST /mcp with invalid JSON returns parse error, not 404", async () => {
    const res = await app.request("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe(-32700);
  });
});
