import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSeed, fromKey } from "../src/lib/data";
import { feedHash, feedResponse } from "../src/lib/calendar-feed";
import { calendarFile, fold } from "../src/lib/ics";

const seed = createSeed(fromKey("2026-10-05"));
const token = "a".repeat(64);

describe("calendar file", () => {
  it("describes repeating, all-day and multi-day events", () => {
    const file = calendarFile(
      [
        {
          ...seed.events[0],
          id: "bday",
          title: "Gran’s birthday",
          date: "2026-11-02",
          allDay: true,
          repeat: "yearly",
          start: "00:00",
          end: "23:59",
          location: "",
          notes: "",
        },
        {
          ...seed.events[0],
          id: "camp",
          title: "Camp, with tents; and more",
          date: "2026-11-06",
          endDate: "2026-11-08",
          start: "17:00",
          end: "12:00",
          repeat: "none",
        },
      ],
      {
        name: "Kinfolk · The Lee family",
        now: new Date("2026-10-05T00:00:00Z"),
      },
    );
    assert.match(file, /^BEGIN:VCALENDAR\r\n/);
    assert.match(file, /X-WR-CALNAME:Kinfolk · The Lee family\r\n/);
    assert.match(
      file,
      /DTSTART;VALUE=DATE:20261102\r\nDTEND;VALUE=DATE:20261103\r\n/,
    );
    assert.match(file, /RRULE:FREQ=YEARLY\r\n/);
    assert.match(file, /DTSTART:20261106T170000\r\nDTEND:20261108T120000\r\n/);
    assert.match(file, /SUMMARY:Camp\\, with tents\; and more\r\n/);
    assert.match(file, /END:VCALENDAR\r\n$/);
  });
  it("folds long lines at 75 bytes without splitting characters", () => {
    const line = `DESCRIPTION:${"Kia ora 🌿 ".repeat(20)}`;
    const folded = fold(line).split("\r\n");
    assert.ok(
      folded.every((part) => new TextEncoder().encode(part).length <= 75),
    );
    assert.equal(folded.map((p, i) => (i ? p.slice(1) : p)).join(""), line);
  });
});

describe("calendar link", () => {
  const lookup = async (hash: string) =>
    hash === feedHash(token) ? seed : null;
  it("serves the family's events as a calendar", async () => {
    const response = await feedResponse(`${token}.ics`, lookup);
    assert.equal(response.status, 200);
    assert.equal(
      response.headers.get("content-type"),
      "text/calendar; charset=utf-8",
    );
    const body = await response.text();
    assert.match(body, /X-WR-CALNAME:Kinfolk · The Miller family/);
    assert.equal(body.match(/BEGIN:VEVENT/g)?.length, seed.events.length);
  });
  it("says so when a link is unknown, turned off or malformed", async () => {
    assert.equal((await feedResponse("b".repeat(64), lookup)).status, 404);
    assert.equal((await feedResponse("not-a-token", lookup)).status, 404);
  });
});
