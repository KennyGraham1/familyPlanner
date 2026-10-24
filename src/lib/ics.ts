import { addDays, dateKey, type FamilyEvent } from "./data";

// iCalendar (RFC 5545): used for the calendar download and the Apple Calendar feed.
const escape = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,");
const compact = (key: string) => key.replaceAll("-", "");
const nextDay = (key: string) =>
  dateKey(addDays(new Date(key + "T12:00:00"), 1));
const frequency = {
  weekly: "FREQ=WEEKLY",
  fortnightly: "FREQ=WEEKLY;INTERVAL=2",
  monthly: "FREQ=MONTHLY",
  yearly: "FREQ=YEARLY",
};
/** Lines longer than 75 bytes continue on the next line after a space. */
export function fold(line: string) {
  const bytes = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  for (const char of line) {
    const limit = parts.length ? 74 : 75;
    if (bytes.encode(current + char).length > limit) {
      parts.push(current);
      current = char;
    } else current += char;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function calendarFile(
  events: FamilyEvent[],
  { name, now = new Date() }: { name?: string; now?: Date } = {},
) {
  const stamp = `${now.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
  const body = events.flatMap((e) => {
    const last = e.endDate ?? e.date;
    const when = e.allDay
      ? [
          `DTSTART;VALUE=DATE:${compact(e.date)}`,
          // All-day end dates are exclusive in iCalendar.
          `DTEND;VALUE=DATE:${compact(nextDay(last))}`,
        ]
      : [
          `DTSTART:${compact(e.date)}T${e.start.replace(":", "")}00`,
          `DTEND:${compact(last)}T${e.end.replace(":", "")}00`,
        ];
    const until = e.until
      ? `;UNTIL=${compact(e.until)}${e.allDay ? "" : "T235959"}`
      : "";
    return [
      "BEGIN:VEVENT",
      `UID:${e.id}@kinfolk.local`,
      `DTSTAMP:${stamp}`,
      ...when,
      `SUMMARY:${escape(e.title)}`,
      ...(e.location ? [`LOCATION:${escape(e.location)}`] : []),
      ...(e.notes ? [`DESCRIPTION:${escape(e.notes)}`] : []),
      ...(e.repeat !== "none" ? [`RRULE:${frequency[e.repeat]}${until}`] : []),
      "END:VEVENT",
    ];
  });
  return (
    [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Kinfolk//Family Planner//EN",
      "CALSCALE:GREGORIAN",
      ...(name
        ? [
            `X-WR-CALNAME:${escape(name)}`,
            // Ask subscribing calendar apps to check for changes hourly.
            "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
            "X-PUBLISHED-TTL:PT1H",
          ]
        : []),
      ...body,
      "END:VCALENDAR",
    ]
      .map(fold)
      .join("\r\n") + "\r\n"
  );
}
