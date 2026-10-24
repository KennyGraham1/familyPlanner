import { getCloud } from "../cloud";
import type { SyncConflict } from "./sync";

export type CalendarStatus = {
  configured: boolean;
  connected?: boolean;
  enabled?: boolean;
  canManage?: boolean;
  email?: string;
  calendarName?: string;
  timezone?: string;
  lastSynced?: string;
  error?: string;
  backgroundSync?: boolean;
  calendars?: {
    id: string;
    name: string;
    timezone: string;
    primary: boolean;
  }[];
  conflicts?: SyncConflict[];
  issues?: { title: string; reason: string }[];
};
export async function calendarRequest<T>(
  path = "",
  body?: unknown,
): Promise<T> {
  const cloud = getCloud();
  const session = cloud && (await cloud.auth.getSession());
  const token = session?.data.session?.access_token;
  if (!token) throw new Error("Sign in to your family account first.");
  const response = await fetch(`/api/google-calendar${path}`, {
    method: body === undefined ? "GET" : "POST",
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const value = await response.json();
  if (!response.ok)
    throw new Error(value.error || "Google Calendar could not be reached.");
  return value as T;
}
