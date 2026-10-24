import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { type FamilyEvent } from "../src/lib/data";
import { eventHash, fromGoogle, googleEventId, toGoogle, type GoogleEvent } from "../src/lib/google-calendar/events";
import { GoogleApi, GoogleError, type CalendarApi } from "../src/lib/google-calendar/google";
import { syncCalendar, syncDecision, type EventLink, type SyncStore } from "../src/lib/google-calendar/sync";
import { seal, unseal, equalState } from "../src/lib/google-calendar/security";

const zone = "Pacific/Auckland";
const event = (overrides: Partial<FamilyEvent> = {}): FamilyEvent => ({
  id: "event-1", title: "Family lunch", date: "2026-10-05", start: "12:00", end: "13:00",
  memberIds: ["alex"], location: "Home", notes: "Bring bread", repeat: "none", category: "Family time", ...overrides,
});
function google(id: string, value: FamilyEvent): GoogleEvent {
  // Google omits cleared (null) fields in its responses.
  return JSON.parse(JSON.stringify({ id, etag: '"1"', status: "confirmed", ...toGoogle(value, zone) }, (_k,v) => v === null ? undefined : v));
}
function fixture(initial: FamilyEvent[] = [event()]) {
  const local = new Map(initial.map(e => [e.id, structuredClone(e)]));
  const remote = new Map<string, GoogleEvent>();
  const links = new Map<string, EventLink>();
  const calls = { insert: 0, patch: 0, delete: 0, get: 0 };
  let serial = 1;
  const normalize = (value: unknown): GoogleEvent => JSON.parse(JSON.stringify(value, (_k,v) => v === null ? undefined : v));
  const api: CalendarApi = {
    listEvents: async () => structuredClone([...remote.values()]),
    getEvent: async (_c, id) => { calls.get++; return structuredClone(remote.get(id) ?? null); },
    insertEvent: async (_c, body) => {
      calls.insert++; const id = body.id as string;
      if (remote.has(id)) throw new GoogleError(409);
      const saved = normalize({ ...body, id, status: "confirmed", etag: `"${++serial}"` });
      remote.set(id, saved); return structuredClone(saved);
    },
    patchEvent: async (_c, id, body, etag) => {
      calls.patch++; const old = remote.get(id);
      if (!old) throw new GoogleError(404);
      if (old.etag !== etag) throw new GoogleError(412);
      const saved = normalize({ ...old, ...body, etag: `"${++serial}"` });
      remote.set(id, saved); return structuredClone(saved);
    },
    deleteEvent: async (_c, id, etag) => {
      calls.delete++; const old = remote.get(id);
      if (old?.etag !== etag) throw new GoogleError(412);
      remote.set(id, { ...old, id, status: "cancelled", etag: `"${++serial}"` });
    },
  };
  const store: SyncStore = { commit: async (id, expected, change, next, link) => {
    if (change && JSON.stringify(local.get(id) ?? null) !== JSON.stringify(expected)) return false;
    if (change) { if (next) local.set(id, structuredClone(next)); else local.delete(id); }
    if (link) links.set(id, structuredClone(link)); else links.delete(id);
    return true;
  } };
  const run = (resolve?: { eventId: string; prefer: "kinfolk" | "google" }) => syncCalendar({
    api, store, familyId: "family", calendarId: "calendar", timezone: zone, memberId: "alex",
    events: [...local.values()], links: [...links.values()], resolve,
  });
  return { local, remote, links, calls, api, store, run };
}

test("calendar conversion preserves local time, all-day exclusive ends, overnight events and repeat limits", () => {
  const summer = toGoogle(event(), zone);
  assert.equal(summer.start.dateTime, "2026-10-05T12:00:00+13:00");
  assert.equal(toGoogle(event({ date: "2026-07-05" }), zone).start.dateTime, "2026-07-05T12:00:00+12:00");
  for (const value of [event(), event({ allDay: true, endDate: "2026-10-08" }), event({ endDate: "2026-10-06", start: "23:00", end: "01:00" }), event({ repeat: "weekly", until: "2026-11-02" }), event({ allDay: true, repeat: "yearly", until: "2030-10-05" })]) {
    assert.equal(eventHash(fromGoogle(google("remote", value), zone, value.id, "alex", value)), eventHash(value));
  }
  assert.equal(toGoogle(event({ allDay: true, endDate: "2026-10-08" }), zone).end.date, "2026-10-09");
  assert.throws(() => toGoogle(event({ date: "2026-09-27", start: "02:30", end: "04:00" }), zone), RangeError);
});

test("unsupported repeats and cross-zone recurring times are never silently simplified", () => {
  const remote = google("remote", event({ repeat: "weekly" }));
  remote.recurrence = ["RRULE:FREQ=WEEKLY;BYDAY=MO,WE"];
  assert.throws(() => fromGoogle(remote, zone, "id", "alex"));
  remote.recurrence = ["RRULE:FREQ=WEEKLY;BYDAY=MO"];
  assert.equal(fromGoogle(remote, zone, "id", "alex").repeat, "weekly");
  remote.start!.timeZone = "Europe/London";
  assert.throws(() => fromGoogle(remote, zone, "id", "alex"));
});

test("two-way create and edits are idempotent and preserve Kinfolk assignments", async () => {
  const f = fixture();
  assert.equal((await f.run()).uploaded, 1);
  const id = googleEventId("family", "event-1");
  assert.equal(f.remote.get(id)?.summary, "Family lunch");
  assert.equal((await f.run()).uploaded, 0);
  assert.equal(f.calls.insert, 1);
  f.local.set("event-1", event({ title: "Lunch at noon", memberIds: ["jamie"], category: "School" }));
  assert.equal((await f.run()).uploaded, 1);
  f.remote.set(id, { ...f.remote.get(id)!, summary: "Lunch moved", etag: '"later"' });
  assert.equal((await f.run()).downloaded, 1);
  assert.equal(f.local.get("event-1")?.title, "Lunch moved");
  assert.deepEqual(f.local.get("event-1")?.memberIds, ["jamie"]);
  assert.equal(f.local.get("event-1")?.category, "School");
  f.remote.set("google-born", google("google-born", event({ title: "Google appointment" })));
  assert.equal((await f.run()).downloaded, 1);
  assert.equal(f.local.size, 2);
  await f.run();
  assert.equal(f.remote.size, 2);
});

test("conflicting edits are preserved until either version is explicitly selected", async () => {
  const f = fixture(); await f.run();
  const id = googleEventId("family", "event-1");
  f.local.set("event-1", event({ title: "Kinfolk title" }));
  f.remote.set(id, { ...f.remote.get(id)!, summary: "Google title", etag: '"new"' });
  const pending = await f.run();
  assert.equal(pending.conflicts.length, 1);
  assert.equal(f.remote.get(id)?.summary, "Google title");
  assert.equal(f.local.get("event-1")?.title, "Kinfolk title");
  await f.run({ eventId: "event-1", prefer: "google" });
  assert.equal(f.local.get("event-1")?.title, "Google title");
  f.local.set("event-1", event({ title: "Keep this" }));
  f.remote.set(id, { ...f.remote.get(id)!, summary: "Other edit", etag: '"newer"' });
  await f.run({ eventId: "event-1", prefer: "kinfolk" });
  assert.equal(f.remote.get(id)?.summary, "Keep this");
});

test("deletions sync both ways and undoing a Google deletion restores the linked event", async () => {
  const f = fixture(); await f.run();
  const id = googleEventId("family", "event-1");
  f.remote.set(id, { ...f.remote.get(id)!, status: "cancelled" });
  assert.equal((await f.run()).removed, 1);
  assert.equal(f.local.size, 0);
  await f.run();
  assert.equal(f.calls.get, 0, "unchanged tombstones do not cause repeated get requests");
  f.remote.set(id, { ...f.remote.get(id)!, status: "confirmed", etag: '"restored"' });
  assert.equal((await f.run()).downloaded, 1);
  assert.equal(f.local.size, 1);
  f.local.clear();
  assert.equal((await f.run()).removed, 1);
  assert.equal(f.remote.get(id)?.status, "cancelled");
});

test("a creation interrupted before checkpoint recovers without duplicates", async () => {
  const f = fixture(); const save = f.store.commit;
  f.store.commit = async () => { throw new Error("Database unavailable"); };
  await assert.rejects(f.run());
  assert.equal(f.remote.size, 1); assert.equal(f.links.size, 0);
  f.store.commit = save;
  await f.run(); await f.run();
  assert.equal(f.calls.insert, 1); assert.equal(f.links.size, 1);
});

test("keeping a local edit after a Google deletion recreates safely, including interrupted checkpoints", async () => {
  const f = fixture(); await f.run();
  const original = googleEventId("family", "event-1");
  f.remote.set(original, { ...f.remote.get(original)!, status: "cancelled" });
  f.local.set("event-1", event({ title: "Keep this appointment" }));
  assert.equal((await f.run()).conflicts.length, 1);
  const save = f.store.commit;
  f.store.commit = async () => { throw new Error("Checkpoint failed"); };
  await assert.rejects(f.run({ eventId: "event-1", prefer: "kinfolk" }));
  f.store.commit = save;
  await f.run();
  assert.equal([...f.remote.values()].filter(e => e.status !== "cancelled").length, 1);
  assert.notEqual(f.links.get("event-1")?.google_id, original);
  assert.equal(f.calls.insert, 2, "only the original and one recreation were inserted");
});

test("a concurrent local edit cannot be overwritten by a Google pull", async () => {
  const f = fixture(); await f.run();
  const id = googleEventId("family", "event-1");
  f.remote.set(id, { ...f.remote.get(id)!, summary: "Changed remotely", etag: '"new"' });
  const save = f.store.commit;
  f.store.commit = async (...args) => { f.local.set("event-1", event({ title: "Typed during sync" })); return save(...args); };
  assert.equal((await f.run()).pending, true);
  f.store.commit = save;
  assert.equal((await f.run()).conflicts.length, 1);
  assert.equal(f.local.get("event-1")?.title, "Typed during sync");
});

test("Google version conflicts and incomplete remote reads never advance checkpoints or remove events", async () => {
  const f = fixture(); await f.run();
  const before = structuredClone([...f.links.values()]);
  f.local.set("event-1", event({ title: "A new title" }));
  f.api.patchEvent = async () => { throw new GoogleError(412); };
  assert.equal((await f.run()).pending, true);
  assert.deepEqual([...f.links.values()], before);
  f.api.listEvents = async () => { throw new Error("Page 2 unavailable"); };
  await assert.rejects(f.run());
  assert.equal(f.local.size, 1); assert.deepEqual([...f.links.values()], before);
});

test("changed repeat instances are reported, and local-only metadata does not create a conflict", async () => {
  const f = fixture([event({ repeat: "weekly" })]); await f.run();
  const id = googleEventId("family", "event-1");
  f.remote.set("exception", { id: "exception", recurringEventId: id, status: "cancelled" });
  assert.equal((await f.run()).issues.length, 1);
  assert.equal(f.calls.patch, 0);
  assert.equal(syncDecision(event({ memberIds: ["jamie"] }), event(), { event_id: "event-1", google_id: "google", local_hash: eventHash(event()), google_hash: eventHash(event()) }), "none");
});

test("stored credentials are authenticated, randomized and bound to a family account", () => {
  const key = randomBytes(32), context = "family:user";
  const encrypted = seal("refresh-secret", key, context);
  assert.equal(unseal(encrypted, key, context), "refresh-secret");
  assert.notEqual(encrypted, seal("refresh-secret", key, context));
  assert.ok(!encrypted.includes("refresh-secret"));
  assert.throws(() => unseal(encrypted, key, "other-family:user"));
  assert.throws(() => unseal(encrypted, randomBytes(32), context));
  assert.throws(() => unseal(encrypted.slice(0, -8) + "changed!", key, context));
  assert.equal(equalState("abc", "abcd"), false);
});

test("Google API reads every page and uses conditional writes without changing guests", async () => {
  const previous = globalThis.fetch;
  const requests: { url: string; init?: RequestInit }[] = [];
  try {
    globalThis.fetch = async (url, init) => {
      requests.push({ url: String(url), init });
      if (init?.method === "PATCH") return Response.json(google("id", event()));
      return Response.json(String(url).includes("pageToken=next") ? { items: [{ id: "second" }] } : { items: [{ id: "first" }], nextPageToken: "next" });
    };
    const api = new GoogleApi("private-access-token");
    assert.equal((await api.listEvents("family@example.com")).length, 2);
    await api.patchEvent("family@example.com", "id", toGoogle(event(), zone), '"version"');
    assert.equal(new Headers(requests[2].init?.headers).get("If-Match"), '"version"');
    assert.ok(requests[2].url.includes("sendUpdates=none"));
    assert.equal(JSON.parse(String(requests[2].init?.body)).attendees, undefined);
  } finally { globalThis.fetch = previous; }
});
