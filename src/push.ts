/**
 * Push notification service — sends browser push notifications for milestone events.
 * Uses the web-push library with VAPID keys (configured via env vars).
 */

import webpush from "web-push";
import { db } from "./db/connection.ts";
import { pushSubscriptions } from "./db/schema.ts";
import { eq } from "drizzle-orm";

// --- VAPID configuration ---

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@railroaded.ai";

let pushEnabled = false;

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  pushEnabled = true;
  console.log("  Push notifications enabled (VAPID keys configured)");
} else {
  console.log("  Push notifications disabled (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY not set)");
}

export function isPushEnabled(): boolean {
  return pushEnabled;
}

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

// --- Notification types and payloads ---

export type NotificationType =
  | "session_start"
  | "combat_end"
  | "character_death"
  | "dungeon_cleared"
  | "level_up";

export interface PushNotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

// --- Subscription management ---

export interface PushSubscriptionData {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface NotificationPreferences {
  session_start: boolean;
  combat_end: boolean;
  character_death: boolean;
  dungeon_cleared: boolean;
  level_up: boolean;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  session_start: true,
  combat_end: true,
  character_death: true,
  dungeon_cleared: true,
  level_up: true,
};

/** Save a push subscription to the database. Upserts on endpoint. */
export async function saveSubscription(
  subscription: PushSubscriptionData,
  preferences?: Partial<NotificationPreferences>
): Promise<{ id: string }> {
  const prefs = { ...DEFAULT_PREFERENCES, ...preferences };

  // Upsert: if endpoint already exists, update keys and preferences
  const existing = await db
    .select({ id: pushSubscriptions.id })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, subscription.endpoint))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(pushSubscriptions)
      .set({
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        preferences: prefs,
      })
      .where(eq(pushSubscriptions.id, existing[0].id));
    return { id: existing[0].id };
  }

  const [row] = await db
    .insert(pushSubscriptions)
    .values({
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
      preferences: prefs,
    })
    .returning({ id: pushSubscriptions.id });

  return { id: row.id };
}

/** Remove a push subscription by endpoint. */
export async function removeSubscription(endpoint: string): Promise<boolean> {
  const result = await db
    .delete(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .returning({ id: pushSubscriptions.id });

  return result.length > 0;
}

/** Update preferences for an existing subscription by endpoint. */
export async function updatePreferences(
  endpoint: string,
  preferences: Partial<NotificationPreferences>
): Promise<boolean> {
  const [existing] = await db
    .select({ id: pushSubscriptions.id, preferences: pushSubscriptions.preferences })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.endpoint, endpoint))
    .limit(1);

  if (!existing) return false;

  const merged = {
    ...(existing.preferences as NotificationPreferences),
    ...preferences,
  };

  await db
    .update(pushSubscriptions)
    .set({ preferences: merged })
    .where(eq(pushSubscriptions.id, existing.id));

  return true;
}

// --- Send notifications ---

/** Send a push notification to all subscriptions that want this event type. */
export async function sendPushNotification(
  notification: PushNotificationPayload
): Promise<{ sent: number; failed: number }> {
  if (!pushEnabled) return { sent: 0, failed: 0 };

  // Fetch all subscriptions
  const subscriptions = await db
    .select({
      id: pushSubscriptions.id,
      endpoint: pushSubscriptions.endpoint,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
      preferences: pushSubscriptions.preferences,
    })
    .from(pushSubscriptions);

  let sent = 0;
  let failed = 0;
  const staleIds: string[] = [];

  for (const sub of subscriptions) {
    // Check if subscription wants this notification type
    const prefs = sub.preferences as NotificationPreferences;
    if (!prefs[notification.type]) continue;

    const pushSubscription = {
      endpoint: sub.endpoint,
      keys: {
        p256dh: sub.p256dh,
        auth: sub.auth,
      },
    };

    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      url: notification.url || "/",
      tag: notification.tag || notification.type,
      type: notification.type,
    });

    try {
      await webpush.sendNotification(pushSubscription, payload);
      sent++;
    } catch (err: unknown) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 410 || statusCode === 404) {
        // Subscription no longer valid — mark for cleanup
        staleIds.push(sub.id);
      }
      failed++;
    }
  }

  // Clean up stale subscriptions
  if (staleIds.length > 0) {
    for (const id of staleIds) {
      try {
        await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, id));
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  return { sent, failed };
}

// --- Event-to-notification mapping ---

/** Build a push notification payload from a game event. Returns null if the event isn't push-worthy. */
export function buildPushPayload(
  eventType: string,
  data: Record<string, unknown>
): PushNotificationPayload | null {
  switch (eventType) {
    case "session_start":
      return {
        type: "session_start",
        title: "A new dungeon crawl just began!",
        body: "Watch live as AI adventurers enter the dungeon.",
        url: "/tracker.html",
        tag: "session_start",
      };

    case "combat_end": {
      const reason = data.reason as string | undefined;
      if (reason === "all_players_dead") {
        return {
          type: "combat_end",
          title: "Total party wipe!",
          body: "The adventurers have fallen. Check the aftermath.",
          url: "/tracker.html",
          tag: "party_wipe",
        };
      }
      const xp = data.xpAwarded as number | undefined;
      return {
        type: "combat_end",
        title: "Combat victory!",
        body: xp ? `The party won combat and earned ${xp} XP.` : "The party emerged victorious from battle.",
        url: "/tracker.html",
        tag: "combat_end",
      };
    }

    case "death":
    case "character_death": {
      const charName = (data.characterName ?? data.name) as string | undefined;
      return {
        type: "character_death",
        title: charName ? `${charName} has fallen!` : "A hero has fallen!",
        body: charName
          ? `${charName} met their end in the dungeon.`
          : "An adventurer has died in the dungeon.",
        url: "/tracker.html",
        tag: "character_death",
      };
    }

    case "dungeon_cleared":
      return {
        type: "dungeon_cleared",
        title: "Dungeon cleared!",
        body: "The party has conquered the dungeon. Read the tale.",
        url: "/tracker.html",
        tag: "dungeon_cleared",
      };

    case "level_up": {
      const name = (data.characterName ?? data.name) as string | undefined;
      const level = data.newLevel as number | undefined;
      return {
        type: "level_up",
        title: name ? `${name} leveled up!` : "Level up!",
        body: name && level
          ? `${name} reached level ${level}.`
          : "An adventurer has grown stronger.",
        url: "/tracker.html",
        tag: "level_up",
      };
    }

    default:
      return null;
  }
}

/** Fire-and-forget: build and send a push notification for a game event. */
export function notifyPushSubscribers(
  eventType: string,
  data: Record<string, unknown>
): void {
  const payload = buildPushPayload(eventType, data);
  if (!payload) return;

  // Fire and forget — don't block the event flow
  sendPushNotification(payload).catch((err) => {
    console.error("[PUSH] Failed to send notifications:", err);
  });
}
