import { z } from "zod";
import { dataSchema, formatTime, startsOn, type PlannerData } from "./data";

/** A device with reminders turned on, as listed by planner_push_candidates. */
export const pushDeviceSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  household_id: z.string().uuid(),
  endpoint: z.string().url(),
  p256dh: z.string(),
  auth: z.string(),
  member_id: z.string().nullable(),
  timezone: z.string(),
  scope: z.enum(["mine", "family"]),
  event_minutes: z.union([
    z.literal(0),
    z.literal(5),
    z.literal(15),
    z.literal(30),
    z.literal(60),
  ]),
  chore_time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  events_enabled: z.boolean(),
  chores_enabled: z.boolean(),
});
export type PushCandidate = z.infer<typeof pushDeviceSchema> & {
  data: PlannerData;
};
export type Reminder = {
  key: string;
  title: string;
  body: string;
  url: "/#calendar" | "/#chores";
};
export function allowedPushEndpoint(value: string): boolean {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      !u.port &&
      ([
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
      ].includes(u.hostname) ||
        /^[a-z0-9-]+\.notify\.windows\.com$/.test(u.hostname))
    );
  } catch {
    return false;
  }
}
function wallClock(at: number, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    time: `${get("hour")}:${get("minute")}`,
  };
}
// All-day events (birthdays, trips) are reminded as if they start at this time.
const ALL_DAY_TIME = "08:00";
/** Minute-based clock comparison handles IANA zones and a five-minute scheduler delay.
 * Repeated DST wall times share a delivery key; nonexistent wall times are skipped. */
export function dueReminders(
  candidate: PushCandidate,
  now = new Date(),
): Reminder[] {
  if (candidate.scope === "mine" && !candidate.member_id) return [];
  const found = new Map<string, Reminder>();
  const currentMinute = Math.floor(now.getTime() / 60000) * 60000;
  for (let delay = 0; delay <= 5; delay++) {
    const minute = currentMinute - delay * 60000;
    if (candidate.events_enabled) {
      const target = wallClock(
        minute + candidate.event_minutes * 60000,
        candidate.timezone,
      );
      for (const event of candidate.data.events) {
        const time = event.allDay ? ALL_DAY_TIME : event.start;
        // Multi-day events are reminded once, before their first day.
        if (
          time !== target.time ||
          !startsOn(event, target.date) ||
          (candidate.scope === "mine" &&
            !event.memberIds.includes(candidate.member_id!))
        )
          continue;
        const key = `event:${event.id}:${target.date}:${time}`;
        const when = event.allDay ? "All day" : `At ${formatTime(event.start)}`;
        found.set(key, {
          key,
          title: event.title,
          body: `${when}${event.location ? ` · ${event.location}` : ""}`,
          url: "/#calendar",
        });
      }
    }
    if (candidate.chores_enabled) {
      const target = wallClock(minute, candidate.timezone);
      if (target.time !== candidate.chore_time) continue;
      const tasks = candidate.data.tasks.filter(
        (t) =>
          !t.done &&
          t.due <= target.date &&
          (candidate.scope === "family" || t.memberId === candidate.member_id),
      );
      if (tasks.length) {
        const key = `chores:${target.date}`;
        found.set(key, {
          key,
          title: `${tasks.length} chore${tasks.length === 1 ? "" : "s"} to do`,
          body: tasks
            .slice(0, 3)
            .map((t) => t.title)
            .join(" · "),
          url: "/#chores",
        });
      }
    }
  }
  return [...found.values()];
}
export type DeliveryStore = {
  claim: (device: string, key: string) => Promise<string | null>;
  finish: (
    device: string,
    key: string,
    token: string,
    sent: boolean,
  ) => Promise<void>;
  expire: (device: string) => Promise<void>;
};
export async function deliverReminders(
  candidates: PushCandidate[],
  store: DeliveryStore,
  send: (candidate: PushCandidate, reminder: Reminder) => Promise<void>,
  now = new Date(),
) {
  const result = { sent: 0, failed: 0, skipped: 0, expired: 0 };
  for (const candidate of candidates) {
    if (!allowedPushEndpoint(candidate.endpoint)) {
      result.skipped++;
      continue;
    }
    let due: Reminder[];
    try {
      due = dueReminders(candidate, now);
    } catch {
      result.skipped++;
      continue;
    }
    for (const reminder of due) {
      let token: string | null;
      try {
        token = await store.claim(candidate.id, reminder.key);
      } catch {
        // Unclaimed reminders are retried by the next run.
        result.failed++;
        continue;
      }
      if (!token) {
        result.skipped++;
        continue;
      }
      // Recording the outcome is retried once: an unrecorded send can be repeated later.
      const finish = async (sent: boolean) => {
        for (let attempt = 0; attempt < 2; attempt++) {
          try {
            await store.finish(candidate.id, reminder.key, token, sent);
            return;
          } catch {}
        }
      };
      try {
        await send(candidate, reminder);
      } catch (error) {
        const status =
          error && typeof error === "object" && "statusCode" in error
            ? error.statusCode
            : null;
        if (status === 404 || status === 410) {
          await store.expire(candidate.id).catch(() => undefined);
          result.expired++;
          break;
        }
        await finish(false);
        result.failed++;
        continue;
      }
      await finish(true);
      result.sent++;
    }
  }
  return result;
}

const PAGE_SIZE = 100;
export type ReminderSource = {
  /** Up to PAGE_SIZE devices with ids after `afterId`, in id order. */
  devices: (afterId: string | null) => Promise<unknown[]>;
  /** Family plans by household id. */
  households: (ids: string[]) => Promise<Record<string, unknown>>;
};
/**
 * One scheduled run: every device, each family's plans loaded and checked once.
 * It starts at a random point in id order and wraps around, so when time runs out
 * a different set of devices waits each minute; reminders allow five minutes' delay.
 */
export async function runReminders(
  source: ReminderSource,
  store: DeliveryStore,
  send: (candidate: PushCandidate, reminder: Reminder) => Promise<void>,
  {
    now = new Date(),
    budgetMs = 45000,
    start = crypto.randomUUID(),
    clock = Date.now,
  } = {},
) {
  const totals = { sent: 0, failed: 0, skipped: 0, expired: 0 };
  const plans = new Map<string, PlannerData | null>();
  const began = clock();
  const idOf = (row: unknown) => String((row as { id?: unknown })?.id ?? "");
  let cursor: string | null = start;
  let wrapped = false;
  while (clock() - began < budgetMs) {
    const rows = await source.devices(cursor);
    const page = wrapped ? rows.filter((row) => idOf(row) <= start) : rows;
    const devices = [];
    for (const row of page) {
      const parsed = pushDeviceSchema.safeParse(row);
      if (parsed.success) devices.push(parsed.data);
      else totals.skipped++;
    }
    const missing = [
      ...new Set(
        devices.map((d) => d.household_id).filter((id) => !plans.has(id)),
      ),
    ];
    if (missing.length) {
      const found = await source.households(missing);
      for (const id of missing) {
        const parsed = dataSchema.safeParse(found[id]);
        plans.set(id, parsed.success ? parsed.data : null);
      }
    }
    const candidates: PushCandidate[] = [];
    for (const device of devices) {
      const data = plans.get(device.household_id);
      if (data) candidates.push({ ...device, data });
      else totals.skipped++;
    }
    // Small parallel groups keep one slow provider from delaying the whole family.
    for (let i = 0; i < candidates.length; i += 5) {
      const results = await Promise.allSettled(
        candidates
          .slice(i, i + 5)
          .map((candidate) => deliverReminders([candidate], store, send, now)),
      );
      for (const result of results) {
        if (result.status === "rejected") totals.failed++;
        else
          for (const key of ["sent", "failed", "skipped", "expired"] as const)
            totals[key] += result.value[key];
      }
    }
    if (wrapped && page.length < rows.length) break;
    if (rows.length < PAGE_SIZE) {
      if (wrapped) break;
      wrapped = true;
      cursor = null;
      continue;
    }
    cursor = idOf(rows.at(-1));
  }
  return totals;
}
