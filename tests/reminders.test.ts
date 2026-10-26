import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSeed, fromKey, type FamilyEvent } from "../src/lib/data";
import {
  deliverReminders,
  dueReminders,
  runReminders,
  weekAhead,
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

describe("phone delivery preferences", () => {
  it("honours quiet hours across midnight and a per-device pause", () => {
    const c = candidate({ date: "2026-11-02", start: "01:00", end: "02:00" });
    c.data.settings = {
      ...c.data.settings,
      quietStart: "22:00",
      quietEnd: "07:00",
    };
    assert.deepEqual(dueReminders(c, new Date("2026-11-02T00:45:00Z")), []);
    c.data.settings.quietStart = undefined;
    c.data.settings.quietEnd = undefined;
    c.snoozed_until = "2026-11-02T02:00:00Z";
    assert.deepEqual(dueReminders(c, new Date("2026-11-02T00:45:00Z")), []);
    c.snoozed_until = null;
    assert.equal(dueReminders(c, new Date("2026-11-02T00:45:00Z")).length, 1);
  });
  it("uses the configured family digest day and time", () => {
    const c = candidate({ date: "2026-11-03", start: "10:00", end: "11:00" });
    c.data.settings = { ...c.data.settings, digestDay: 1, digestTime: "19:00" };
    assert.equal(
      dueReminders(c, new Date("2026-11-02T19:00:00Z")).filter((r) =>
        r.key.startsWith("digest:"),
      ).length,
      1,
    );
  });
  it("groups relevant changes, excludes your own changes, and links to the affected event", () => {
    const c = candidate({ date: "2026-11-04" });
    c.member_id = "alex";
    c.scope = "mine";
    c.data.activity = [
      {
        id: "a",
        actorId: "jamie",
        actorMemberId: "jamie",
        actorName: "Jamie",
        createdAt: "2026-11-02T09:44:15.000Z",
        collection: "events",
        recordId: "swim",
        title: "Swimming",
        before: "9 am",
        after: "10 am",
        memberIds: ["alex"],
        source: "server",
      },
    ];
    assert.equal(dueReminders(c, new Date("2026-11-02T09:44:30Z")).length, 0);
    const due = dueReminders(c, new Date("2026-11-02T09:45:00Z"));
    assert.equal(due.length, 1);
    assert.equal(due[0].url, "/#calendar?event=swim");
    c.member_id = "jamie";
    assert.deepEqual(dueReminders(c, new Date("2026-11-02T09:45:00Z")), []);
  });
});

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

describe("week-ahead summary", () => {
  // Sunday 25 October 2026; the week ahead is Mon 26 – Sun 1 Nov.
  const week = (
    events: Partial<FamilyEvent>[],
    extra: Partial<PushCandidate["data"]> = {},
  ) => {
    const c = candidate({});
    c.data = {
      ...c.data,
      events: events.map((e, i) => ({
        ...base,
        id: `w${i}`,
        repeat: "none" as const,
        location: "",
        ...e,
      })),
      meals: [
        {
          id: "m1",
          date: "2026-10-27",
          slot: "Dinner",
          recipeId: c.data.meals[0].recipeId,
        },
        {
          id: "m2",
          date: "2026-10-24",
          slot: "Dinner",
          recipeId: c.data.meals[0].recipeId,
        },
      ],
      tasks: [
        {
          ...c.data.tasks[0],
          due: "2026-10-28",
          done: false,
          memberId: "oliver",
        },
      ],
      ...extra,
    };
    return c;
  };
  const plan = week([
    {
      title: "Swimming",
      date: "2026-10-26",
      start: "16:00",
      end: "17:00",
      memberIds: ["oliver"],
    },
    {
      title: "Camp",
      date: "2026-10-29",
      endDate: "2026-10-31",
      start: "09:00",
      end: "15:00",
      memberIds: ["sophie"],
    },
    {
      title: "Last week",
      date: "2026-10-20",
      start: "10:00",
      end: "11:00",
      memberIds: ["oliver"],
    },
  ]);
  it("arrives at 6 pm on Sunday with the week's numbers", () => {
    const sent = dueReminders(plan, new Date("2026-10-25T18:00:00Z")).filter(
      (r) => r.key.startsWith("digest:"),
    );
    assert.deepEqual(sent, [
      {
        key: "digest:2026-10-26",
        title: "Your week ahead",
        body: "2 events · 1 dinner planned · 1 chore. First up: Swimming, Mon 4 pm",
        url: "/#calendar",
      },
    ]);
  });
  it("only on Sunday evening", () => {
    for (const at of ["2026-10-24T18:00:00Z", "2026-10-25T17:00:00Z"])
      assert.equal(
        dueReminders(plan, new Date(at)).some((r) =>
          r.key.startsWith("digest:"),
        ),
        false,
        at,
      );
  });
  it("counts just your own for “my events and chores”", () => {
    const mine = weekAhead(
      { ...plan, scope: "mine", member_id: "sophie" },
      "2026-10-25",
    );
    assert.equal(
      mine?.body.startsWith(
        "1 event · 1 dinner planned · 0 chores. First up: Camp",
      ),
      true,
    );
  });
  it("stays quiet when nothing is planned", () => {
    assert.equal(weekAhead(week([], { tasks: [] }), "2026-10-25"), null);
  });
});
