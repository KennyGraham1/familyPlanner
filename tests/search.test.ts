import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSeed, formatDate, fromKey } from "../src/lib/data";
import { buildSearchIndex, plannerSearch } from "../src/lib/search";

describe("calendar search results", () => {
  it("links tomorrow to the matched repeat date and retains its location", () => {
    const now = fromKey("2026-10-26");
    const data = createSeed(now);
    data.events = [
      {
        ...data.events[0],
        date: "2026-10-20",
        repeat: "weekly",
        location: "School hall",
      },
    ];
    const index = buildSearchIndex(data, now);
    const [result] = plannerSearch(data, "events tomorrow", "All", now, index);
    assert.equal(result.id, data.events[0].id);
    assert.equal(result.date, "2026-10-27");
    assert.equal(
      result.detail,
      `Calendar · ${formatDate("2026-10-27")} · School hall`,
    );
    assert.equal(data.events[0].date, "2026-10-20");
  });

  it("shows this week's occurrence even when the next one is next week", () => {
    const now = fromKey("2026-10-29");
    const data = createSeed(now);
    data.events = [{ ...data.events[0], date: "2026-10-20", repeat: "weekly" }];
    const index = buildSearchIndex(data, now);
    assert.equal(
      index.find((entry) => entry.kind === "Calendar")?.date,
      "2026-11-03",
    );
    const [result] = plannerSearch(data, "events this week", "All", now, index);
    assert.equal(result.date, "2026-10-27");
    assert.match(result.detail, new RegExp(formatDate("2026-10-27")));
  });

  it("uses the searched day for an underway trip and excludes cancelled occurrences", () => {
    const now = fromKey("2026-10-26");
    const data = createSeed(now);
    data.events = [
      {
        ...data.events[0],
        date: "2026-10-25",
        endDate: "2026-10-28",
        repeat: "none",
      },
    ];
    assert.equal(
      plannerSearch(data, "events tomorrow", "All", now)[0].date,
      "2026-10-27",
    );
    data.events[0].excludedDates = ["2026-10-25"];
    assert.equal(plannerSearch(data, "events tomorrow", "All", now).length, 0);
  });

  it("interprets tomorrow in the family timezone and finds comments and document names", () => {
    const now = new Date("2026-10-26T11:30:00Z");
    const data = createSeed(now);
    data.settings.timezone = "Pacific/Auckland";
    data.events = [{ ...data.events[0], date: "2026-10-28", repeat: "none" }];
    const eventId = data.events[0].id;
    data.comments = [
      {
        id: "c",
        eventId,
        memberId: "alex",
        body: "Bring purple goggles",
        createdAt: now.toISOString(),
      },
    ];
    data.eventLinks = [
      {
        id: "l",
        eventId,
        name: "Permission slip",
        url: "https://example.com/permission",
      },
    ];
    const index = buildSearchIndex(data, now);
    for (const query of [
      "events tomorrow goggles",
      "events tomorrow permission",
    ]) {
      const [result] = plannerSearch(data, query, "All", now, index);
      assert.equal(result?.id, eventId);
      assert.equal(result.date, "2026-10-28");
    }
  });
});
