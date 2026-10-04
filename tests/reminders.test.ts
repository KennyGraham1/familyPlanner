import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSeed, fromKey, type FamilyEvent } from "../src/lib/data";
import {
  deliverReminders,
  dueReminders,
  runReminders,
  type DeliveryStore,
  type PushCandidate,
} from "../src/lib/reminders";
import { validCronAuthorization } from "../src/lib/push-server";

const seed = createSeed(fromKey("2026-09-28"));
const base = seed.events[0];
const candidate = (event: Partial<FamilyEvent>): PushCandidate => ({
  id: "00000000-0000-4000-8000-000000000001",
  user_id: "00000000-0000-4000-8000-000000000002",
  household_id: "00000000-0000-4000-8000-000000000003",
  endpoint: "https://fcm.googleapis.com/fcm/send/test",
  p256dh: "key",
  auth: "auth",
  member_id: null,
  timezone: "UTC",
  scope: "family",
  event_minutes: 15,
  chore_time: "07:00",
  events_enabled: true,
  chores_enabled: false,
  data: { ...seed, events: [{ ...base, ...event }] },
});
const titles = (c: PushCandidate, at: string) =>
  dueReminders(c, new Date(at)).map((r) => `${r.title}: ${r.body}`);

describe("event reminders", () => {
  it("remind about yearly all-day events at 8 am", () => {
    const birthday = candidate({
      title: "Gran’s birthday",
      date: "2026-05-04",
      repeat: "yearly",
      allDay: true,
      start: "00:00",
      end: "23:59",
      location: "",
    });
    assert.deepEqual(titles(birthday, "2028-05-04T07:45:00Z"), [
      "Gran’s birthday: All day",
    ]);
    assert.deepEqual(titles(birthday, "2028-05-03T23:45:00Z"), []);
  });
  it("follow monthly repeats, skipping months without the date", () => {
    const rent = candidate({
      title: "Rent",
      date: "2026-01-31",
      repeat: "monthly",
      start: "18:00",
      end: "18:30",
      location: "",
    });
    assert.deepEqual(titles(rent, "2026-03-31T17:45:00Z"), ["Rent: At 6 pm"]);
    assert.deepEqual(titles(rent, "2026-02-28T17:45:00Z"), []);
  });
  it("remind once for a multi-day event", () => {
    const trip = candidate({
      title: "Beach trip",
      date: "2026-12-30",
      endDate: "2027-01-02",
      start: "18:00",
      end: "14:00",
      location: "",
    });
    assert.deepEqual(titles(trip, "2026-12-30T17:45:00Z"), [
      "Beach trip: At 6 pm",
    ]);
    assert.deepEqual(titles(trip, "2026-12-31T17:45:00Z"), []);
  });
});

describe("reminder delivery", () => {
  const due = candidate({
    title: "Dentist",
    date: "2026-11-02",
    start: "10:00",
    end: "10:30",
    location: "",
  });
  const at = new Date("2026-11-02T09:45:00Z");
  function fakeStore(claimed = true) {
    const log: string[] = [];
    const store: DeliveryStore = {
      claim: async (_device, key) => (
        log.push(`claim ${key}`),
        claimed ? "token" : null
      ),
      finish: async (_device, _key, _token, sent) =>
        void log.push(`finish ${sent}`),
      expire: async () => void log.push("expire"),
    };
    return { store, log };
  }

  it("sends a due reminder once and records it", async () => {
    const { store, log } = fakeStore();
    const sent: string[] = [];
    const result = await deliverReminders(
      [due],
      store,
      async (_c, r) => void sent.push(r.title),
      at,
    );
    assert.deepEqual(result, { sent: 1, failed: 0, skipped: 0, expired: 0 });
    assert.deepEqual(sent, ["Dentist"]);
    assert.deepEqual(log.at(-1), "finish true");
  });
  it("skips reminders another run already claimed", async () => {
    const { store } = fakeStore(false);
    let sends = 0;
    const result = await deliverReminders(
      [due],
      store,
      async () => void sends++,
      at,
    );
    assert.equal(sends, 0);
    assert.equal(result.skipped, 1);
  });
  it("forgets devices whose subscription has gone, and retries other failures", async () => {
    const gone = fakeStore();
    const expired = await deliverReminders(
      [due],
      gone.store,
      async () => {
        throw Object.assign(new Error("Gone"), { statusCode: 410 });
      },
      at,
    );
    assert.equal(expired.expired, 1);
    assert.ok(gone.log.includes("expire"));

    const flaky = fakeStore();
    const failed = await deliverReminders(
      [due],
      flaky.store,
      async () => {
        throw new Error("Network");
      },
      at,
    );
    assert.equal(failed.failed, 1);
    assert.equal(flaky.log.at(-1), "finish false");
  });
  it("only sends to known push services", async () => {
    const { store } = fakeStore();
    const result = await deliverReminders(
      [{ ...due, endpoint: "https://attacker.example/push" }],
      store,
      async () => assert.fail("must not send"),
      at,
    );
    assert.equal(result.skipped, 1);
  });
});

describe("cron authorization", () => {
  const secret = "a".repeat(64);
  it("accepts only the exact bearer secret", () => {
    assert.equal(validCronAuthorization(`Bearer ${secret}`, secret), true);
    assert.equal(
      validCronAuthorization(`Bearer ${"b".repeat(64)}`, secret),
      false,
    );
    assert.equal(validCronAuthorization(secret, secret), false);
    assert.equal(validCronAuthorization(null, secret), false);
  });
});

describe("scheduled reminder runs", () => {
  const uuid = (n: number) =>
    `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
  const at = new Date("2026-11-02T09:45:00Z");
  const plan = {
    ...seed,
    events: [
      {
        ...base,
        date: "2026-11-02",
        start: "10:00",
        end: "10:30",
        repeat: "none" as const,
      },
    ],
  };
  // 250 devices across 3 families, listed in id order like planner_push_candidates.
  const rows = Array.from({ length: 250 }, (_, i) => ({
    id: uuid(i + 1),
    user_id: uuid(1000 + i),
    household_id: uuid(5000 + (i % 3)),
    endpoint: `https://fcm.googleapis.com/fcm/send/${i}`,
    p256dh: "key",
    auth: "auth",
    member_id: null,
    timezone: "UTC",
    scope: "family",
    event_minutes: 15,
    chore_time: "07:00",
    events_enabled: true,
    chores_enabled: false,
  }));
  function source() {
    const householdCalls: string[][] = [];
    return {
      householdCalls,
      source: {
        devices: async (afterId: string | null) =>
          rows
            .filter((row) => afterId === null || row.id > afterId)
            .slice(0, 100),
        households: async (ids: string[]) => {
          householdCalls.push(ids);
          return Object.fromEntries(ids.map((id) => [id, plan]));
        },
      },
    };
  }
  const store = (overrides: Partial<DeliveryStore> = {}): DeliveryStore => ({
    claim: async () => "token",
    finish: async () => undefined,
    expire: async () => undefined,
    ...overrides,
  });

  it("reaches every device once, starting mid-list and wrapping around", async () => {
    const { source: src, householdCalls } = source();
    const seen: string[] = [];
    const totals = await runReminders(
      src,
      store(),
      async (c) => void seen.push(c.id),
      {
        now: at,
        start: uuid(137),
      },
    );
    assert.equal(totals.sent, 250);
    assert.equal(new Set(seen).size, 250);
    assert.equal(seen[0], uuid(138));
    // Each family's plans are loaded and checked once per run.
    assert.equal(householdCalls.flat().length, 3);
  });
  it("keeps going when one device's delivery record fails", async () => {
    const { source: src } = source();
    let finishes = 0;
    const totals = await runReminders(
      src,
      store({
        claim: async (device) => {
          if (device === uuid(5)) throw new Error("database hiccup");
          return "token";
        },
        finish: async () => {
          if (finishes++ === 0) throw new Error("retry me");
        },
      }),
      async () => undefined,
      { now: at, start: uuid(0) },
    );
    assert.equal(totals.failed, 1);
    assert.equal(totals.sent, 249);
  });
  it("stops when time runs out, after a whole page", async () => {
    const { source: src } = source();
    let time = 0;
    const seen: string[] = [];
    const totals = await runReminders(
      src,
      store(),
      async (c) => void seen.push(c.id),
      {
        now: at,
        start: uuid(200),
        budgetMs: 10,
        clock: () => (time += 6),
      },
    );
    assert.equal(totals.sent, 50);
    assert.equal(seen[0], uuid(201));
  });
});
