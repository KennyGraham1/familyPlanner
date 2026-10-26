import { getCloud } from "./cloud";

export type ReminderPreferences = {
  timezone: string;
  scope: "mine" | "family";
  event_minutes: number;
  chore_time: string;
  events_enabled: boolean;
  chores_enabled: boolean;
  snoozed_until?: string | null;
};
export async function deviceSubscription() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window))
    return null;
  const registration = await navigator.serviceWorker.getRegistration("/");
  return (await registration?.pushManager.getSubscription()) ?? null;
}
export async function sendPhonePushTest() {
  const cloud = getCloud(),
    session = cloud && (await cloud.auth.getSession());
  const token = session?.data.session?.access_token;
  if (!token) throw new Error("Sign in to your family account first.");
  const subscription = await deviceSubscription();
  if (!subscription) throw new Error("Enable reminders on this device first.");
  const response = await fetch("/api/push/test", {
    method: "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ endpoint: subscription.endpoint }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error ?? "Could not send the phone notification test.",
    );
  return result.message as string;
}
export async function saveDevicePush(
  subscription: PushSubscription,
  preferences: ReminderPreferences,
) {
  const { error } = await getCloud()!.rpc("planner_save_push", {
    subscription: subscription.toJSON(),
    preferences,
  });
  if (error) throw error;
}
export async function disableDevicePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const registration = await navigator.serviceWorker.getRegistration("/");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  try {
    const cloud = getCloud();
    if (cloud) {
      const { error } = await cloud.rpc("planner_remove_push", {
        device_endpoint: subscription.endpoint,
      });
      if (error) throw error;
    }
  } finally {
    await subscription.unsubscribe();
    for (const notification of await registration!.getNotifications())
      notification.close();
  }
}
export function vapidBytes(value: string): ArrayBuffer {
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0)).buffer;
}
