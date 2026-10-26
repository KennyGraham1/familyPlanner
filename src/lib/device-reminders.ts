import { z } from "zod";
import { pushDeviceSchema, type Reminder } from "./reminders";
import { registerServiceWorker } from "./service-worker";
import type { ReminderPreferences } from "./push-client";

const preferencesSchema = pushDeviceSchema
  .pick({
    timezone: true,
    scope: true,
    event_minutes: true,
    chore_time: true,
    events_enabled: true,
    chores_enabled: true,
    snoozed_until: true,
  })
  .extend({ enabled: z.boolean() })
  .refine((value) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: value.timezone });
      return true;
    } catch {
      return false;
    }
  }, "Choose a valid reminder time zone.");

export type DeviceReminderPreferences = z.infer<typeof preferencesSchema>;
const CHANGE_EVENT = "kinfolk-device-reminders-changed";
export const deviceReminderKey = (familyId: string) =>
  `kinfolk-device-reminders:${familyId}`;

export function parseDevicePreferences(
  raw: string | null,
): DeviceReminderPreferences {
  try {
    const parsed = preferencesSchema.safeParse(JSON.parse(raw ?? "null"));
    if (parsed.success) return parsed.data;
  } catch {
    /* Use disabled defaults if storage is corrupt. */
  }
  return {
    enabled: false,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    scope: "mine",
    event_minutes: 15,
    chore_time: "09:00",
    events_enabled: true,
    chores_enabled: true,
  };
}

export function devicePreferencesSnapshot(familyId: string): string | null {
  try {
    return localStorage.getItem(deviceReminderKey(familyId));
  } catch {
    return null;
  }
}

export function saveDevicePreferences(
  familyId: string,
  preferences: ReminderPreferences & { enabled: boolean },
) {
  const parsed = preferencesSchema.safeParse(preferences);
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  localStorage.setItem(
    deviceReminderKey(familyId),
    JSON.stringify(parsed.data),
  );
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeDevicePreferences(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CHANGE_EVENT, callback);
  };
}

export async function showDeviceReminder(
  reminder: Pick<Reminder, "title" | "body" | "url">,
  tag: string,
) {
  if (!("Notification" in window) || Notification.permission !== "granted")
    throw new Error(
      "Allow notifications in your browser or phone settings first.",
    );
  const options: NotificationOptions = {
    body: reminder.body,
    icon: "/icons/icon-192.png",
    tag,
    data: { url: reminder.url },
  };
  const registration = await registerServiceWorker();
  if (registration) {
    const ready = await navigator.serviceWorker.ready;
    await ready.showNotification(reminder.title, options);
  } else {
    const notification = new Notification(reminder.title, options);
    notification.onclick = () => {
      window.focus();
      window.location.hash = reminder.url.slice(1);
      notification.close();
    };
  }
}

/** Remember deliveries across checks, reloads and tabs. The runner uses a
 * browser lock to serialize deliveries from multiple open tabs. */
export async function deliverDeviceReminders(
  storage: Pick<Storage, "getItem" | "setItem">,
  familyId: string,
  reminders: Reminder[],
  send: (reminder: Reminder, tag: string) => Promise<void> = showDeviceReminder,
  now = Date.now(),
) {
  const key = `kinfolk-device-deliveries:${familyId}`;
  for (const reminder of reminders) {
    let delivered: Record<string, number> = {};
    try {
      const raw: unknown = JSON.parse(storage.getItem(key) ?? "{}");
      if (raw && typeof raw === "object" && !Array.isArray(raw))
        delivered = Object.fromEntries(
          Object.entries(raw).filter(
            ([, at]) => typeof at === "number" && at > now - 2 * 86400000,
          ),
        );
    } catch {
      /* Old delivery history can be discarded. */
    }
    if (Object.hasOwn(delivered, reminder.key)) continue;
    delivered[reminder.key] = now;
    // If storage isn't writable, don't send reminders we can't deduplicate.
    storage.setItem(key, JSON.stringify(delivered));
    try {
      await send(reminder, `kinfolk:${familyId}:${reminder.key}`);
    } catch (error) {
      const latest = JSON.parse(storage.getItem(key) ?? "{}");
      delete latest[reminder.key];
      storage.setItem(key, JSON.stringify(latest));
      throw error;
    }
  }
}
