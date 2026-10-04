"use client";
import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { getCloud } from "@/lib/cloud";
import { errorMessage } from "@/lib/errors";
import {
  deviceSubscription,
  disableDevicePush,
  saveDevicePush,
  vapidBytes,
  type ReminderPreferences,
} from "@/lib/push-client";
import { usePlanner } from "./planner-provider";
import { Field, SectionHeader } from "./ui";

export function ReminderSettings() {
  const { household, notify } = usePlanner();
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
    if (!household) return;
    let cancelled = false;
    async function load() {
      try {
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
              "timezone,scope,event_minutes,chore_time,events_enabled,chores_enabled",
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
  }, [household]);
  if (!household) return null;
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
      const registration = await navigator.serviceWorker.register("/sw.js", {
        scope: "/",
      });
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
      await disableDevicePush();
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
  return (
    <section className="card settings-card">
      <SectionHeader icon={Bell} title="Phone reminders" />
      <p className="settings-description">
        Get event and chore notifications even when the planner is closed.
        Settings apply to this device.
      </p>
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
