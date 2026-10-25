import {
  daysBetween,
  isMultiDay,
  occurrenceOn,
  shiftDate,
  type FamilyEvent,
  type Occurrence,
} from "./data";

export type WeekSpan = {
  event: FamilyEvent;
  occurrence: Occurrence;
  start: number;
  end: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
};

/** One bar per all-day or multi-day occurrence, packed into non-overlapping rows. */
export function weekSpans(
  events: FamilyEvent[],
  first: string,
  member = "all",
): WeekSpan[] {
  const last = shiftDate(first, 6);
  const segments: WeekSpan[] = [];
  for (const event of events) {
    if (
      (!event.allDay && !isMultiDay(event)) ||
      (member !== "all" && !event.memberIds.includes(member))
    )
      continue;
    const seen = new Set<string>();
    for (let i = 0; i < 7; i++) {
      const occurrence = occurrenceOn(event, shiftDate(first, i));
      if (!occurrence || seen.has(occurrence.start)) continue;
      seen.add(occurrence.start);
      segments.push({
        event,
        occurrence,
        start: Math.max(0, daysBetween(first, occurrence.start)),
        end: Math.min(6, daysBetween(first, occurrence.end)),
        lane: 0,
        continuesBefore: occurrence.start < first,
        continuesAfter: occurrence.end > last,
      });
    }
  }
  segments.sort(
    (a, b) =>
      a.start - b.start ||
      b.end - a.end ||
      a.event.title.localeCompare(b.event.title),
  );
  const lanes: number[] = [];
  for (const segment of segments) {
    const available = lanes.findIndex((end) => end < segment.start);
    segment.lane = available === -1 ? lanes.length : available;
    lanes[segment.lane] = segment.end;
  }
  return segments;
}
