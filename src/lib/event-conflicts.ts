import {
  dayNumber,
  occurrenceOn,
  shiftDate,
  startsOn,
  type FamilyEvent,
  type Occurrence,
} from "./data";

export type EventConflict = {
  event: FamilyEvent;
  /** First date on which the two plans overlap. */
  day: string;
  memberIds: string[];
};

type Interval = { start: number; end: number; day: string };

function interval(event: FamilyEvent, occurrence: Occurrence): Interval {
  const minutes = (time: string) => {
    const [hour, minute] = time.split(":").map(Number);
    return hour * 60 + minute;
  };
  // Use wall-clock minutes so daylight-saving changes don't shift family plans.
  return {
    start:
      dayNumber(occurrence.start) * 1440 +
      (event.allDay ? 0 : minutes(event.start)),
    end: event.allDay
      ? (dayNumber(occurrence.end) + 1) * 1440
      : dayNumber(occurrence.end) * 1440 + minutes(event.end),
    day: occurrence.start,
  };
}

function intervals(event: FamilyEvent, days: string[]): Interval[] {
  if (event.repeat === "none")
    return startsOn(event, event.date)
      ? [
          interval(event, {
            start: event.date,
            end: event.endDate ?? event.date,
          }),
        ]
      : [];

  const result: Interval[] = [];
  // Include a repeat that started earlier, such as an overnight trip.
  const covering = occurrenceOn(event, days[0]);
  if (covering) result.push(interval(event, covering));
  const span = dayNumber(event.endDate ?? event.date) - dayNumber(event.date);
  for (const day of days.slice(1)) {
    if (event.until && day > event.until) break;
    if (startsOn(event, day))
      result.push(interval(event, { start: day, end: shiftDate(day, span) }));
  }
  return result;
}

/**
 * Check valid events for shared-member overlaps, excluding the event being edited.
 * Search at most 366 calendar days from the draft's start, returning each other
 * plan once, at its earliest overlap. Touching endpoints aren't overlaps.
 */
export function eventConflicts(
  draft: FamilyEvent,
  events: FamilyEvent[],
): EventConflict[] {
  const span = dayNumber(draft.endDate ?? draft.date) - dayNumber(draft.date);
  const length = Math.min(
    365,
    draft.repeat === "none"
      ? span
      : draft.until
        ? dayNumber(draft.until) - dayNumber(draft.date) + span
        : 365,
  );
  const days = Array.from({ length: length + 1 }, (_, i) =>
    shiftDate(draft.date, i),
  );
  const proposed = intervals(draft, days);
  const windowEnd = (dayNumber(days.at(-1)!) + 1) * 1440;
  const conflicts: EventConflict[] = [];

  for (const event of events) {
    if (event.id === draft.id || event.date > days.at(-1)!) continue;
    const people = (e: FamilyEvent) => [
      ...new Set(
        [...e.memberIds, e.dropOffMemberId, e.pickupMemberId].filter(
          (v): v is string => Boolean(v),
        ),
      ),
    ];
    const memberIds = people(draft).filter((id) => people(event).includes(id));
    if (!memberIds.length) continue;
    const existing = intervals(event, days);
    let i = 0;
    let j = 0;
    while (i < proposed.length && j < existing.length) {
      const a = proposed[i];
      const b = existing[j];
      if (
        a.start < b.end &&
        b.start < a.end &&
        Math.max(a.start, b.start) < windowEnd
      ) {
        conflicts.push({
          event,
          day: a.day > b.day ? a.day : b.day,
          memberIds,
        });
        break;
      }
      if (a.end <= b.end) i++;
      else j++;
    }
  }
  return conflicts.sort(
    (a, b) =>
      a.day.localeCompare(b.day) || a.event.start.localeCompare(b.event.start),
  );
}
