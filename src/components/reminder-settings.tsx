"use client";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { getCloud } from "@/lib/cloud";
import { errorMessage } from "@/lib/errors";
import {
  deviceSubscription,
  disableDevicePush,
  saveDevicePush,
  sendPhonePushTest,
  vapidBytes,
  type ReminderPreferences,
} from "@/lib/push-client";
import { registerServiceWorker } from "@/lib/service-worker";
import {
  devicePreferencesSnapshot,
  parseDevicePreferences,
  saveDevicePreferences,
  showDeviceReminder,
} from "@/lib/device-reminders";
import { usePlanner } from "./planner-provider";
import { Field, SectionHeader } from "./ui";

export function ReminderSettings() {
  const { data, household, notify } = usePlanner();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const familyId = data.members[0].id;
  const [supported, setSupported] = useState(false);
  const [config, setConfig] = useState<{
    configured: boolean;
    publicKey: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const [permission, setPermission] =
    useState<NotificationPermission>("default");
  const [preferences, setPreferences] = useState<ReminderPreferences>({
    timezone: "UTC",
    scope: "mine",
    event_minutes: 15,
    chore_time: "09:00",
    events_enabled: true,
    chores_enabled: true,
  });
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        if (!household) {
          const saved = parseDevicePreferences(
            devicePreferencesSnapshot(familyId),
          );
          if (cancelled) return;
          setSupported("Notification" in window);
          setConfig({ configured: true, publicKey: "" });
          setActive(saved.enabled);
          setPreferences(saved);
          if ("Notification" in window) setPermission(Notification.permission);
          return;
        }
        const canPush =
          "Notification" in window &&
          "serviceWorker" in navigator &&
          "PushManager" in window;
        const response = await fetch("/api/push/config");
        if (!response.ok)
          throw new Error("Reminder settings could not be loaded.");
        const config = await response.json();
        const sub = canPush ? await deviceSubscription() : null;
        let saved = null;
        if (sub) {
          const { data, error } = await getCloud()!
            .from("planner_push_subscriptions")
            .select(
              "timezone,scope,event_minutes,chore_time,events_enabled,chores_enabled,snoozed_until",
            )
            .eq("endpoint", sub.endpoint)
            .eq("household_id", household!)
            .maybeSingle();
          if (error) throw error;
          saved = data;
        }
        if (cancelled) return;
        setSupported(canPush);
        setConfig(config);
        setActive(Boolean(saved));
        if (canPush) setPermission(Notification.permission);
        setPreferences(
          saved ?? {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            scope: "mine",
            event_minutes: 15,
            chore_time: "09:00",
            events_enabled: true,
            chores_enabled: true,
          },
        );
      } catch (e) {
        if (!cancelled)
          setError(errorMessage(e, "Could not load notification settings."));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [household, familyId]);
  async function snooze(minutes: number) {
    setLoading(true);
    setError("");
    const next = {
      ...preferences,
      snoozed_until: minutes
        ? new Date(Date.now() + minutes * 60000).toISOString()
        : null,
    };
    try {
      if (household) {
        const sub = await deviceSubscription();
        if (!sub) throw new Error("Enable reminders on this device first.");
        await saveDevicePush(sub, next);
      } else saveDevicePreferences(familyId, { ...next, enabled: true });
      setPreferences(next);
      notify(
        minutes
          ? "Reminders paused for one hour on this device."
          : "Reminders resumed on this device.",
      );
    } catch (e) {
      setError(errorMessage(e, "Could not update reminder pause."));
    } finally {
      setLoading(false);
    }
  }
  function change<K extends keyof ReminderPreferences>(
    key: K,
    value: ReminderPreferences[K],
  ) {
    setPreferences((p) => ({ ...p, [key]: value }));
  }
  async function enable(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!supported || !config?.configured) return;
    // Request permission directly from the click; Safari requires user activation.
    const permissionRequest =
      Notification.permission === "granted"
        ? Promise.resolve("granted" as const)
        : Notification.requestPermission();
    setLoading(true);
    let created: PushSubscription | null = null;
    try {
      const permission = await permissionRequest;
      setPermission(permission);
      if (permission !== "granted")
        throw new Error(
          "Notifications were not allowed. You can enable them in your browser or phone settings.",
        );
      if (!household) {
        saveDevicePreferences(familyId, { ...preferences, enabled: true });
        setActive(true);
        notify(
          "Device reminders enabled. Keep the planner open to receive them.",
        );
        return;
      }
      const registration = (await registerServiceWorker())!;
      await navigator.serviceWorker.ready;
      let sub = await registration.pushManager.getSubscription();
      if (
        sub?.options.applicationServerKey &&
        !sameKey(sub.options.applicationServerKey, vapidBytes(config.publicKey))
      ) {
        await sub.unsubscribe();
        sub = null;
      }
      if (!sub) {
        sub = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidBytes(config.publicKey),
        });
        created = sub;
      }
      await saveDevicePush(sub, preferences);
      setActive(true);
      notify("Reminder settings saved for this device.");
    } catch (e) {
      if (created) await created.unsubscribe().catch(() => false);
      setError(errorMessage(e, "Could not enable reminders."));
    } finally {
      setLoading(false);
    }
  }
  async function disable() {
    setLoading(true);
    setError("");
    try {
      if (household) await disableDevicePush();
      else
        saveDevicePreferences(familyId, {
          ...parseDevicePreferences(devicePreferencesSnapshot(familyId)),
          enabled: false,
        });
      setActive(false);
      notify("Reminders turned off on this device.");
    } catch (e) {
      setError(
        errorMessage(e, "Could not turn off reminders. Please try again."),
      );
    } finally {
      setLoading(false);
    }
  }
  async function testNotification() {
    setLoading(true);
    setError("");
    try {
      if (household) {
        notify(await sendPhonePushTest());
        return;
      }
      await showDeviceReminder(
        {
          title: "Kinfolk reminders are working",
          body: "Event and chore reminders will appear here on this device.",
          url: "/#calendar",
        },
        "kinfolk-test",
      );
      notify("Test notification sent to this device.");
    } catch (e) {
      setError(errorMessage(e, "Could not show a test notification."));
    } finally {
      setLoading(false);
    }
  }
  return (
    <section
      className="card settings-card"
      id="phone-reminders"
      aria-label="Device notifications"
    >
      <SectionHeader
        icon={Bell}
        title={household ? "Phone reminders" : "Device reminders"}
      />
      <p className="settings-description">
        Get event and chore notifications
        {household
          ? " even when the planner is closed"
          : " while the planner is open"}
        , plus a look at the week ahead at your family’s review time. Settings
        apply to this device.
      </p>
      {!household && (
        <p className="form-hint">
          Keep this app open to receive reminders. Notifications with the app
          closed need a shared family with phone reminders set up.
        </p>
      )}
      {loading && !config ? (
        <p role="status">Loading reminder settings…</p>
      ) : !supported ? (
        <p className="form-hint">
          For iPhone or iPad, open this site in Safari, choose Share → Add to
          Home Screen, then open the installed app. Web push requires iOS 16.4
          or later. On other devices, use a browser that supports push
          notifications.
        </p>
      ) : !config?.configured ? (
        <p className="form-hint">
          Phone reminders need to be enabled by the app owner. You can continue
          using the Today reminders inside the planner.
        </p>
      ) : (
        <form onSubmit={enable}>
          <Field label="Remind me about">
            <select
              value={preferences.scope}
              onChange={(e) =>
                change("scope", e.target.value as "mine" | "family")
              }
            >
              <option value="mine">My events and chores</option>
              <option value="family">Everyone’s events and chores</option>
            </select>
          </Field>
          <label className="check-label">
            <input
              type="checkbox"
              checked={preferences.events_enabled}
              onChange={(e) => change("events_enabled", e.target.checked)}
            />
            Event reminders
          </label>
          <Field label="Before an event">
            <select
              value={preferences.event_minutes}
              onChange={(e) => change("event_minutes", Number(e.target.value))}
            >
              {[0, 5, 15, 30, 60].map((n) => (
                <option key={n} value={n}>
                  {n ? `${n} minutes before` : "At the start"}
                </option>
              ))}
            </select>
          </Field>
          <label className="check-label">
            <input
              type="checkbox"
              checked={preferences.chores_enabled}
              onChange={(e) => change("chores_enabled", e.target.checked)}
            />
            Daily reminder for due and overdue chores
          </label>
          <Field label="Chore reminder time">
            <input
              type="time"
              required
              value={preferences.chore_time}
              onChange={(e) => change("chore_time", e.target.value)}
            />
          </Field>
          <Field
            label="Reminder time zone"
            hint="Match the time zone used for your family’s calendar times."
          >
            <input
              required
              value={preferences.timezone}
              onChange={(e) => change("timezone", e.target.value)}
              list="reminder-timezones"
            />
          </Field>
          <datalist id="reminder-timezones">
            {["UTC", ...Intl.supportedValuesOf("timeZone")].map((tz) => (
              <option key={tz} value={tz} />
            ))}
          </datalist>
          {permission === "denied" && (
            <p className="form-hint">
              Notifications are blocked. Allow them in your browser or phone
              settings, then reload this page.
            </p>
          )}
          {active && (
            <div className="toolbar-actions">
              <button
                type="button"
                className="button secondary"
                disabled={loading}
                onClick={() => void snooze(60)}
              >
                Pause reminders for one hour
              </button>
              {preferences.snoozed_until &&
                Date.parse(preferences.snoozed_until) > now && (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={loading}
                    onClick={() => void snooze(0)}
                  >
                    Resume reminders now
                  </button>
                )}
            </div>
          )}
          <div className="backup-buttons">
            <button
              className="button primary"
              disabled={loading || permission === "denied"}
            >
              {loading
                ? "Saving…"
                : active
                  ? "Save reminder settings"
                  : "Enable on this device"}
            </button>
            {active && (
              <button
                type="button"
                className="button secondary"
                disabled={loading}
                onClick={() => void disable()}
              >
                Turn off reminders
              </button>
            )}
            {active && (
              <button
                type="button"
                className="button secondary"
                disabled={loading || permission !== "granted"}
                onClick={() => void testNotification()}
              >
                Send test notification
              </button>
            )}
          </div>
          {active && (
            <p className="form-success" role="status">
              Reminders are enabled on this device.
            </p>
          )}
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
function sameKey(a: ArrayBuffer, b: ArrayBuffer) {
  return new Uint8Array(a).toString() === new Uint8Array(b).toString();
}
