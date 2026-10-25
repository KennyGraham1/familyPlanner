"use client";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import { dueReminders } from "@/lib/reminders";
import {
  deliverDeviceReminders,
  devicePreferencesSnapshot,
  parseDevicePreferences,
  subscribeDevicePreferences,
} from "@/lib/device-reminders";
import { usePlanner } from "./planner-provider";

/** Browser-only families get reminders while the planner is running. Shared
 * families use server push, which also works with the planner closed. */
export function DeviceReminders() {
  const { data, household, currentMemberId } = usePlanner();
  const familyId = data.members[0].id;
  const raw = useSyncExternalStore(
    subscribeDevicePreferences,
    () => devicePreferencesSnapshot(familyId),
    () => null,
  );
  const preferences = useMemo(() => parseDevicePreferences(raw), [raw]);

  useEffect(() => {
    if (household || !preferences.enabled) return;
    let active = true;
    let checking = false;
    const check = async () => {
      if (
        !active ||
        checking ||
        !("Notification" in window) ||
        Notification.permission !== "granted"
      )
        return;
      checking = true;
      try {
        const deliver = async () => {
          if (!active) return;
          const reminders = dueReminders({
            ...preferences,
            data,
            member_id: currentMemberId,
          });
          await deliverDeviceReminders(localStorage, familyId, reminders);
        };
        if (navigator.locks)
          await navigator.locks.request(
            `kinfolk-reminders:${familyId}`,
            { ifAvailable: true },
            async (lock) => {
              if (lock) await deliver();
            },
          );
        else await deliver();
      } catch {
        // A failed delivery is released and retried on the next check.
      } finally {
        checking = false;
      }
    };
    const refresh = () => {
      void check();
    };
    refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [data, household, currentMemberId, familyId, preferences]);
  return null;
}
