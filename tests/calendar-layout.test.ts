import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { weekSpans } from "../src/lib/calendar-layout";
import type { FamilyEvent } from "../src/lib/data";

const event = (changes: Partial<FamilyEvent> = {}): FamilyEvent => ({
  id: "trip",
  title: "Family trip",
  date: "2026-10-20",
  endDate: "2026-10-23",
  start: "09:00",
  end: "17:00",
  memberIds: ["alex"],
  repeat: "none",
  location: "",
  notes: "",
  category: "Activity",
  ...changes,
});
describe("weekly calendar bars", () => {
  it("shows a long event once, clipped to the visible week", () => {
    const spans = weekSpans(
      [event({ date: "2026-06-22", endDate: "2026-10-31", allDay: true })],
      "2026-10-19",
    );
    assert.equal(spans.length, 1);
    assert.deepEqual(
      [
        spans[0].start,
        spans[0].end,
        spans[0].continuesBefore,
        spans[0].continuesAfter,
      ],
      [0, 6, true, true],
    );
  });
  it("packs adjacent plans into the same row without overlapping plans", () => {
    const spans = weekSpans(
      [
        event(),
        event({ id: "overlap", date: "2026-10-21", endDate: "2026-10-24" }),
        event({ id: "after", date: "2026-10-24", endDate: "2026-10-25" }),
      ],
      "2026-10-19",
    );
    assert.deepEqual(
      spans.map((s) => [s.event.id, s.lane]),
      [
        ["trip", 0],
        ["overlap", 1],
        ["after", 0],
      ],
    );
  });
  it("keeps repeat occurrences distinct and respects repeat end dates", () => {
    const repeating = event({
      date: "2026-10-18",
      endDate: "2026-10-19",
      repeat: "weekly",
    });
    assert.deepEqual(
      weekSpans([repeating], "2026-10-19").map((s) => [s.start, s.end]),
      [
        [0, 0],
        [6, 6],
      ],
    );
    assert.equal(
      weekSpans([{ ...repeating, until: "2026-10-18" }], "2026-10-19").length,
      1,
    );
  });
  it("filters by member and excludes timed, out-of-week events", () => {
    assert.deepEqual(weekSpans([event()], "2026-10-19", "jamie"), []);
    assert.deepEqual(
      weekSpans([event({ endDate: undefined })], "2026-10-19"),
      [],
    );
    assert.deepEqual(
      weekSpans(
        [event({ date: "2026-10-26", endDate: "2026-10-27" })],
        "2026-10-19",
      ),
      [],
    );
    assert.equal(
      weekSpans([event({ endDate: undefined, allDay: true })], "2026-10-19")
        .length,
      1,
    );
  });
  it("uses calendar days across a year boundary", () => {
    const [span] = weekSpans(
      [event({ date: "2026-12-30", endDate: "2027-01-02" })],
      "2026-12-28",
    );
    assert.deepEqual([span.start, span.end], [2, 5]);
  });
});
