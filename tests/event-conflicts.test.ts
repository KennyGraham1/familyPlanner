import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { eventSchema, shiftDate, type FamilyEvent } from "../src/lib/data";
import { eventConflicts } from "../src/lib/event-conflicts";

function event(overrides: Partial<FamilyEvent> = {}): FamilyEvent {
  return eventSchema.parse({
    id: "existing",
    title: "Football practice",
    date: "2026-10-25",
    start: "16:00",
    end: "17:00",
    memberIds: ["alex", "oliver"],
    location: "",
    notes: "",
    repeat: "none",
    category: "Activity",
    ...overrides,
  });
}
const draft = (overrides: Partial<FamilyEvent> = {}) =>
  event({ id: "draft", memberIds: ["alex"], ...overrides });

describe("event overlap warnings", () => {
  it("identifies the shared people and date, including contained events", () => {
    const other = event();
    assert.deepEqual(
      eventConflicts(draft({ start: "16:15", end: "16:45" }), [other]),
      [{ event: other, day: "2026-10-25", memberIds: ["alex"] }],
    );
    assert.equal(
      eventConflicts(draft({ start: "15:00", end: "18:00" }), [other]).length,
      1,
    );
  });

  it("ignores back-to-back plans, other dates, other people and the same record", () => {
    const other = event();
    for (const proposed of [
      draft({ start: "17:00", end: "18:00" }),
      draft({ start: "15:00", end: "16:00" }),
      draft({ date: "2026-10-26" }),
      draft({ memberIds: ["jamie"] }),
      draft({ id: other.id }),
    ])
      assert.deepEqual(eventConflicts(proposed, [other]), []);
  });

  it("finds an existing weekly repeat and honours its last start date", () => {
    const other = event({ repeat: "weekly", until: "2026-11-01" });
    assert.equal(
      eventConflicts(draft({ date: "2026-11-01" }), [other]).length,
      1,
    );
    assert.deepEqual(
      eventConflicts(draft({ date: "2026-11-08" }), [other]),
      [],
    );
  });

  it("checks later draft repeats and reports each conflicting plan once", () => {
    const other = event({ date: "2026-11-01", repeat: "weekly" });
    const proposed = draft({ repeat: "weekly" });
    assert.deepEqual(eventConflicts(proposed, [other]), [
      { event: other, day: "2026-11-01", memberIds: ["alex"] },
    ]);
    assert.deepEqual(
      eventConflicts({ ...proposed, until: "2026-10-31" }, [other]),
      [],
    );
  });

  it("respects fortnightly rhythm and skips months without the chosen day", () => {
    const fortnightly = event({ repeat: "fortnightly" });
    assert.deepEqual(
      eventConflicts(draft({ date: "2026-11-01" }), [fortnightly]),
      [],
    );
    assert.equal(
      eventConflicts(draft({ date: "2026-11-08" }), [fortnightly]).length,
      1,
    );
    const monthly = draft({ date: "2026-01-31", repeat: "monthly" });
    assert.deepEqual(
      eventConflicts(monthly, [event({ date: "2026-02-28" })]),
      [],
    );
    assert.equal(
      eventConflicts(monthly, [event({ date: "2026-03-31" })]).length,
      1,
    );
  });

  it("finds yearly repeats on leap days", () => {
    const other = event({ date: "2024-02-29", repeat: "yearly" });
    assert.equal(
      eventConflicts(draft({ date: "2028-02-29" }), [other]).length,
      1,
    );
    assert.deepEqual(
      eventConflicts(draft({ date: "2027-02-28" }), [other]),
      [],
    );
  });

  it("treats all-day events as the whole day, including the final minute", () => {
    const other = event({ allDay: true, start: "00:00", end: "23:59" });
    assert.equal(
      eventConflicts(draft({ start: "23:58", end: "23:59" }), [other]).length,
      1,
    );
    assert.equal(eventConflicts(draft({ allDay: true }), [event()]).length, 1);
    assert.deepEqual(
      eventConflicts(draft({ date: "2026-10-26" }), [other]),
      [],
    );
  });

  it("checks overnight repeats that started before the draft's date", () => {
    const other = event({
      endDate: "2026-10-26",
      start: "22:00",
      end: "07:00",
      repeat: "weekly",
      until: "2026-11-01",
    });
    const proposed = draft({
      date: "2026-11-02",
      start: "06:00",
      end: "08:00",
    });
    assert.equal(eventConflicts(proposed, [other]).length, 1);
    assert.deepEqual(
      eventConflicts({ ...proposed, start: "07:00" }, [other]),
      [],
    );
  });

  it("checks an overnight draft's next day and middle days of longer events", () => {
    const other = event({ date: "2026-10-26", start: "06:00", end: "08:00" });
    assert.equal(
      eventConflicts(
        draft({ endDate: "2026-10-26", start: "22:00", end: "07:00" }),
        [other],
      ).length,
      1,
    );
    const trip = event({
      date: "2026-10-24",
      endDate: "2026-10-27",
      start: "22:00",
      end: "07:00",
    });
    assert.equal(eventConflicts(draft(), [trip]).length, 1);
    assert.deepEqual(
      eventConflicts(
        draft({ date: "2026-10-27", start: "07:00", end: "08:00" }),
        [trip],
      ),
      [],
    );
  });

  it("includes the last day of a multi-day all-day event", () => {
    const other = event({ allDay: true, endDate: "2026-10-27" });
    assert.equal(
      eventConflicts(draft({ date: "2026-10-27" }), [other]).length,
      1,
    );
    assert.deepEqual(
      eventConflicts(draft({ date: "2026-10-28" }), [other]),
      [],
    );
  });

  it("uses calendar dates through a daylight-saving change", () => {
    const other = event({
      date: "2026-09-20",
      repeat: "weekly",
      start: "02:00",
      end: "04:00",
    });
    assert.equal(
      eventConflicts(
        draft({ date: "2026-09-27", start: "03:00", end: "04:00" }),
        [other],
      ).length,
      1,
    );
  });

  it("bounds checks to a year from the start date and sorts the first overlaps", () => {
    const proposed = draft({ repeat: "weekly" });
    const first = event({ id: "first", date: "2026-11-01" });
    const later = event({ id: "later", date: "2026-11-08" });
    const outside = event({
      id: "outside",
      date: shiftDate(proposed.date, 371),
    });
    assert.deepEqual(
      eventConflicts(proposed, [outside, later, first]).map((c) => c.event.id),
      ["first", "later"],
    );
    // Even a very long single event mustn't report beyond the advertised window.
    assert.deepEqual(
      eventConflicts(draft({ endDate: "2030-01-01" }), [outside]),
      [],
    );
  });
});
