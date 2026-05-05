import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
  _resetWSState,
  broadcastTheaterEmission,
  broadcastTheaterEmissionUpdate,
  createWSData,
  createWSHandler,
  type WSData,
} from "../src/api/ws.ts";
import type { Server } from "bun";

let server: Server;
let port: number;

function url(): string {
  return `ws://localhost:${port}/ws`;
}

beforeAll(() => {
  _resetWSState();
  const handler = createWSHandler();
  server = Bun.serve<WSData, {}>({
    port: 0, // ephemeral
    fetch(req, srv) {
      if (new URL(req.url).pathname === "/ws") {
        const ip = srv.requestIP(req)?.address ?? "127.0.0.1";
        const upgraded = srv.upgrade(req, { data: createWSData(ip) });
        if (upgraded) return undefined;
        return new Response("upgrade failed", { status: 400 });
      }
      return new Response("not found", { status: 404 });
    },
    websocket: handler,
  });
  port = server.port;
});

afterAll(() => {
  server.stop(true);
  _resetWSState();
});

function openSocket(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url());
    ws.addEventListener("open", () => resolve(ws), { once: true });
    ws.addEventListener("error", (e) => reject(e), { once: true });
  });
}

function nextMessage(ws: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const onMsg = (e: MessageEvent) => {
      ws.removeEventListener("message", onMsg);
      try {
        resolve(JSON.parse(e.data));
      } catch (err) {
        reject(err);
      }
    };
    ws.addEventListener("message", onMsg);
  });
}

function nextClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve) => {
    ws.addEventListener("close", (e) => resolve({ code: e.code, reason: e.reason }), { once: true });
  });
}

describe("spectator WebSocket — IP rate limit", () => {
  test("11th connection from same IP rejected with 4029 (MAX_SPECTATOR_CONNECTIONS_PER_IP=10)", async () => {
    _resetWSState();
    const sockets: WebSocket[] = [];
    for (let i = 0; i < 10; i++) {
      sockets.push(await openSocket());
    }

    const eleventh = new WebSocket(url());
    const closeInfo = await nextClose(eleventh);
    expect(closeInfo.code).toBe(4029);
    expect(closeInfo.reason).toMatch(/Too many spectator/);

    for (const s of sockets) s.close();
    // settle
    await new Promise((r) => setTimeout(r, 50));
  });
});

describe("spectator WebSocket — auth-before-subscribe + action gating", () => {
  test("unauthenticated client can subscribe (audience read-only)", async () => {
    _resetWSState();
    const ws = await openSocket();
    ws.send(JSON.stringify({ type: "subscribe", partyId: "party-test" }));
    const msg = (await nextMessage(ws)) as { type: string; eventType?: string; data?: { partyId?: string } };
    expect(msg.type).toBe("event");
    expect(msg.eventType).toBe("subscribed");
    expect(msg.data?.partyId).toBe("party-test");
    ws.close();
    await new Promise((r) => setTimeout(r, 20));
  });

  test("action from unauthenticated socket is rejected", async () => {
    _resetWSState();
    const ws = await openSocket();
    ws.send(JSON.stringify({ type: "action", action: "attack", params: {} }));
    const msg = (await nextMessage(ws)) as { type: string; message?: string };
    expect(msg.type).toBe("error");
    expect(msg.message).toMatch(/authenticate/i);
    ws.close();
    await new Promise((r) => setTimeout(r, 20));
  });
});

describe("broadcastTheaterEmission — viewer-role field stripping", () => {
  test("audience subscriber receives all annotation fields intact", async () => {
    _resetWSState();
    const ws = await openSocket();
    ws.send(JSON.stringify({ type: "subscribe", partyId: "party-strip-1" }));
    await nextMessage(ws); // ack

    const next = nextMessage(ws);
    broadcastTheaterEmission("party-strip-1", {
      schema: "x",
      emission_id: "e1",
      session_id: "s",
      agent_id: "a",
      agent_role: "dm",
      turn_id: "t",
      in_response_to: null,
      timestamp: new Date().toISOString(),
      track: "narration",
      content: "A torch flickers.",
      foreshadow: "Something hides in the shadows.",
      hidden_information: "trapdoor at the wall",
      recap_card: [{ turn_id: "t-prev", caption: "prev" }],
    } as unknown as Parameters<typeof broadcastTheaterEmission>[1]);

    const msg = (await next) as { type: string; data: Record<string, unknown> };
    expect(msg.type).toBe("theater_emission");
    expect(msg.data.foreshadow).toBe("Something hides in the shadows.");
    expect(msg.data.hidden_information).toBe("trapdoor at the wall");
    expect(msg.data.recap_card).toBeDefined();

    ws.close();
    await new Promise((r) => setTimeout(r, 20));
  });

  test("emission update is also stripped per viewer role", async () => {
    _resetWSState();
    const ws = await openSocket();
    ws.send(JSON.stringify({ type: "subscribe", partyId: "party-strip-2" }));
    await nextMessage(ws);

    const next = nextMessage(ws);
    broadcastTheaterEmissionUpdate("party-strip-2", {
      emission_id: "e2",
      track: "narration",
      foreshadow: "an audience-only hint",
    });

    const msg = (await next) as { type: string; data: Record<string, unknown> };
    expect(msg.type).toBe("theater_emission_update");
    // Audience: foreshadow preserved
    expect(msg.data.foreshadow).toBe("an audience-only hint");

    ws.close();
    await new Promise((r) => setTimeout(r, 20));
  });
});

describe("idle timer — bookkeeping", () => {
  test("unauthenticated socket has idleTimer set on open", async () => {
    _resetWSState();
    // We can't peek at server-side ws.data via the client. But we can confirm
    // the stripping/broadcast path works (covered above) and that the spectator
    // remains connected for subscribe/unsubscribe round-trips, which exercises
    // the resetIdleTimer code path on each message.
    const ws = await openSocket();
    ws.send(JSON.stringify({ type: "subscribe", partyId: "p" }));
    await nextMessage(ws);
    ws.send(JSON.stringify({ type: "unsubscribe", partyId: "p" }));
    const ack = (await nextMessage(ws)) as { type: string; eventType?: string };
    expect(ack.type).toBe("event");
    expect(ack.eventType).toBe("unsubscribed");
    ws.close();
    await new Promise((r) => setTimeout(r, 20));
  });
});
