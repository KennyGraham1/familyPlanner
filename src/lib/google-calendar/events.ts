import { createHash } from "node:crypto";
import { Temporal } from "@js-temporal/polyfill";
import { eventSchema, shiftDate, type FamilyEvent } from "../data";
import { skippedDates } from "../planning";

export type GoogleEvent = {
  id: string;
  etag?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  eventType?: string;
  recurrence?: string[];
  recurringEventId?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  extendedProperties?: { private?: Record<string, string> };
};

const frequencies = {
  weekly: "FREQ=WEEKLY",
  fortnightly: "FREQ=WEEKLY;INTERVAL=2",
  monthly: "FREQ=MONTHLY",
  yearly: "FREQ=YEARLY",
};
const compact = (value: string) => value.replace(/[-:]/g, "");
export const stableId = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export const googleEventId = (household: string, id: string) =>
  `kf${stableId(`${household}:${id}`)}`;
export const importedEventId = (calendar: string, id: string) =>
  `google-${stableId(`${calendar}:${id}`)}`;

/** Only fields shared with Google participate in conflict detection. */
export function sharedEvent(event: FamilyEvent | null) {
  return (
    event && {
      title: event.title,
      notes: event.notes,
      location: event.location,
      date: event.date,
      endDate: event.endDate ?? event.date,
      start: event.allDay ? "" : event.start,
      end: event.allDay ? "" : event.end,
      allDay: !!event.allDay,
      repeat: event.repeat,
      until: event.repeat === "none" ? null : (event.until ?? null),
      excludedDates: skippedDates(event),
    }
  );
}
export const sameEvent = (a: FamilyEvent | null, b: FamilyEvent | null) =>
  JSON.stringify(sharedEvent(a)) === JSON.stringify(sharedEvent(b));
export const eventHash = (event: FamilyEvent | null) =>
  event ? stableId(JSON.stringify(sharedEvent(event))) : null;

export function toGoogle(event: FamilyEvent, timezone: string) {
  const endDate = event.endDate ?? event.date;
  const at = (date: string, time: string) =>
    Temporal.PlainDateTime.from(`${date}T${time}`).toZonedDateTime(timezone, {
      disambiguation: "reject",
    });
  const times = event.allDay
    ? {
        start: { date: event.date, dateTime: null, timeZone: null },
        end: { date: shiftDate(endDate, 1), dateTime: null, timeZone: null },
      }
    : {
        start: {
          date: null,
          dateTime: at(event.date, event.start).toString({
            timeZoneName: "never",
          }),
          timeZone: timezone,
        },
        end: {
          date: null,
          dateTime: at(endDate, event.end).toString({ timeZoneName: "never" }),
          timeZone: timezone,
        },
      };
  const until = !event.until
    ? ""
    : event.allDay
      ? `;UNTIL=${compact(event.until)}`
      : `;UNTIL=${compact(at(event.until, "23:59:59").toInstant().toString())}`;
  return {
    summary: event.title,
    description: event.notes,
    location: event.location,
    ...times,
    recurrence:
      event.repeat === "none"
        ? []
        : [
            `RRULE:${frequencies[event.repeat]}${until}`,
            ...skippedDates(event).map((date) =>
              event.allDay
                ? `EXDATE;VALUE=DATE:${compact(date)}`
                : `EXDATE:${compact(at(date, event.start).toInstant().toString())}`,
            ),
          ],
  };
}

function localTime(value: NonNullable<GoogleEvent["start"]>, timezone: string) {
  if (value.date) return { date: value.date, time: "00:00" };
  if (!value.dateTime) throw new Error("Missing event time");
  const at = Temporal.Instant.from(value.dateTime).toZonedDateTimeISO(timezone);
  // Kinfolk stores minute precision. Never silently round a Google event.
  if (at.second || at.millisecond || at.microsecond || at.nanosecond)
    throw new Error("This event uses seconds in its start or end time");
  return {
    date: at.toPlainDate().toString(),
    time: at.toPlainTime().toString({ smallestUnit: "minute" }),
  };
}

function repeatRule(
  google: GoogleEvent,
  date: string,
  timezone: string,
): Pick<FamilyEvent, "repeat" | "until"> {
  if (!google.recurrence?.length) return { repeat: "none" };
  if (
    google.recurrence.filter((r) => r.startsWith("RRULE:")).length !== 1 ||
    google.recurrence.some(
      (r) => !r.startsWith("RRULE:") && !r.startsWith("EXDATE"),
    ) ||
    !google.recurrence[0].startsWith("RRULE:")
  )
    throw new Error("Custom repeat schedules stay in Google Calendar");
  const pairs = google.recurrence[0]
    .slice(6)
    .split(";")
    .map((p) => p.split("="));
  const rule = Object.fromEntries(pairs);
  if (
    pairs.some((p) => p.length !== 2) ||
    new Set(pairs.map((p) => p[0])).size !== pairs.length
  )
    throw new Error("Unsupported repeat rule");
  if (
    Object.keys(rule).some(
      (key) => !["FREQ", "INTERVAL", "UNTIL", "BYDAY", "WKST"].includes(key),
    )
  )
    throw new Error("Custom repeat schedules stay in Google Calendar");
  const interval = Number(rule.INTERVAL ?? "1");
  const repeat =
    rule.FREQ === "WEEKLY" && interval === 2
      ? "fortnightly"
      : interval !== 1
        ? null
        : ({ WEEKLY: "weekly", MONTHLY: "monthly", YEARLY: "yearly" } as const)[
            rule.FREQ as "WEEKLY"
          ];
  if (!repeat)
    throw new Error("Custom repeat schedules stay in Google Calendar");
  if (
    rule.BYDAY &&
    (rule.FREQ !== "WEEKLY" ||
      rule.BYDAY !==
        ["MO", "TU", "WE", "TH", "FR", "SA", "SU"][
          Temporal.PlainDate.from(date).dayOfWeek - 1
        ])
  )
    throw new Error("Custom repeat schedules stay in Google Calendar");
  // A series in a different time zone can shift its wall-clock time at DST.
  if (!google.start?.date && google.start?.timeZone !== timezone)
    throw new Error(
      "Repeating events must use the linked calendar’s time zone",
    );
  let until: string | undefined;
  if (rule.UNTIL) {
    if (/^\d{8}$/.test(rule.UNTIL) && google.start?.date)
      until = rule.UNTIL.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
    else if (/^\d{8}T\d{6}Z$/.test(rule.UNTIL)) {
      const iso = rule.UNTIL.replace(
        /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
        "$1-$2-$3T$4:$5:$6Z",
      );
      until = Temporal.Instant.from(iso)
        .toZonedDateTimeISO(timezone)
        .toPlainDate()
        .toString();
      // If the UNTIL falls before this event's clock time, the previous day is the last allowed start.
      const local = Temporal.Instant.from(iso).toZonedDateTimeISO(timezone);
      const start = localTime(google.start!, timezone);
      if (local.toPlainTime().toString().slice(0, 5) < start.time)
        until = shiftDate(until, -1);
    } else throw new Error("Unsupported repeat end date");
  }
  return { repeat, ...(until ? { until } : {}) };
}

export function fromGoogle(
  google: GoogleEvent,
  timezone: string,
  id: string,
  memberId: string,
  previous?: FamilyEvent,
): FamilyEvent {
  if (
    google.recurringEventId ||
    (google.eventType && google.eventType !== "default")
  )
    throw new Error(
      "Special Google events and individual repeat exceptions stay in Google Calendar",
    );
  if (!google.start || !google.end) throw new Error("Missing event dates");
  if (!!google.start.date !== !!google.end.date)
    throw new Error("Mixed event date types");
  const start = localTime(google.start, timezone),
    end = localTime(google.end, timezone);
  const allDay = !!google.start.date;
  const last = allDay ? shiftDate(end.date, -1) : end.date;
  const location = google.location ?? "";
  return eventSchema.parse({
    ...(previous ?? {}),
    endDate: undefined,
    until: undefined,
    place: undefined,
    id,
    title: google.summary?.trim() || "Untitled Google event",
    date: start.date,
    start: allDay ? "09:00" : start.time,
    end: allDay ? "10:00" : end.time,
    ...(last !== start.date ? { endDate: last } : {}),
    allDay,
    ...repeatRule(google, start.date, timezone),
    excludedRanges: undefined,
    excludedDates: google.recurrence
      ?.filter((r) => r.startsWith("EXDATE"))
      .flatMap((rule) =>
        rule
          .split(":")
          .slice(1)
          .join(":")
          .split(",")
          .map((raw) => {
            if (/^\d{8}$/.test(raw))
              return raw.replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3");
            if (!/^\d{8}T\d{6}Z$/.test(raw))
              throw new Error("Unsupported excluded date");
            const iso = raw.replace(
              /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/,
              "$1-$2-$3T$4:$5:$6Z",
            );
            return Temporal.Instant.from(iso)
              .toZonedDateTimeISO(timezone)
              .toPlainDate()
              .toString();
          }),
      ),
    memberIds: previous?.memberIds ?? [memberId],
    category: previous?.category ?? "Activity",
    location,
    notes: google.description ?? "",
    ...(previous?.location === location && previous.place
      ? { place: previous.place }
      : {}),
  });
}
