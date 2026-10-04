import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addDays,
  applyMutation,
  createFamily,
  createSeed,
  dataSchema,
  dateKey,
  dateSchema,
  eventSchema,
  eventsOn,
  fromKey,
  ingredientsToShopping,
  occurrenceLabel,
  occurrenceOn,
  occursOn,
  removeMemberChanges,
  startsOn,
  startOfWeek,
} from "../src/lib/data";

describe("new families", () => {
  it("start empty with the creator as the only, current member", () => {
    const family = createFamily("Sam", "The Lee family");
    assert.equal(dataSchema.safeParse(family).success, true);
    assert.deepEqual(
      family.members.map((m) => m.name),
      ["Sam"],
    );
    assert.equal(family.settings.currentMemberId, family.members[0].id);
    assert.equal(family.settings.familyName, "The Lee family");
    for (const list of [
      family.events,
      family.tasks,
      family.shopping,
      family.meals,
      family.notes,
    ])
      assert.equal(list.length, 0);
  });
});

describe("removing a family member", () => {
  const seed = createSeed(fromKey("2026-09-28"));
  const after = removeMemberChanges(seed, "alex", "jamie").reduce(
    applyMutation,
    seed,
  );
  it("produces a valid family without them", () => {
    assert.equal(dataSchema.safeParse(after).success, true);
    assert.equal(
      after.members.some((m) => m.id === "alex"),
      false,
    );
  });
  it("hands their chores and notes to the chosen person", () => {
    for (const task of seed.tasks.filter((t) => t.memberId === "alex"))
      assert.equal(
        after.tasks.find((t) => t.id === task.id)?.memberId,
        "jamie",
      );
    for (const note of seed.notes.filter((n) => n.memberId === "alex"))
      assert.equal(
        after.notes.find((n) => n.id === note.id)?.memberId,
        "jamie",
      );
  });
  it("drops them from shared events without adding anyone", () => {
    for (const event of seed.events.filter(
      (e) => e.memberIds.includes("alex") && e.memberIds.length > 1,
    ))
      assert.deepEqual(
        after.events.find((e) => e.id === event.id)?.memberIds,
        event.memberIds.filter((id) => id !== "alex"),
      );
  });
  it("moves the greeting to the person taking over", () => {
    assert.equal(seed.settings.currentMemberId, "alex");
    assert.equal(after.settings.currentMemberId, "jamie");
  });
});

describe("family schedules", () => {
  const seed = createSeed(fromKey("2026-09-28"));
  it("seeds valid data relative to the local date", () => {
    assert.equal(dataSchema.safeParse(seed).success, true);
    assert.equal(seed.events[0].date, "2026-09-28");
  });
  it("repeats weekly events only on or after their start date", () => {
    const event = seed.events.find((e) => e.id === "e2")!;
    assert.equal(occursOn(event, "2026-10-05"), true);
    assert.equal(occursOn(event, "2026-09-21"), false);
    assert.equal(occursOn(event, "2026-10-06"), false);
  });
  it("filters events by family member and sorts by start time", () => {
    assert.deepEqual(
      eventsOn(seed, "2026-09-28", "sophie").map((e) => e.id),
      ["e1", "e3"],
    );
  });
  it("handles week starts and year boundaries without UTC drift", () => {
    assert.equal(dateKey(startOfWeek(fromKey("2026-01-01"))), "2025-12-29");
    assert.equal(
      dateKey(startOfWeek(fromKey("2026-01-01"), false)),
      "2025-12-28",
    );
    assert.equal(dateKey(addDays(fromKey("2026-09-26"), 2)), "2026-09-28");
  });
  it("rejects invalid dates and reversed event times", () => {
    assert.equal(dateSchema.safeParse("2026-02-30").success, false);
    assert.equal(
      eventSchema.safeParse({ ...seed.events[0], end: "07:00" }).success,
      false,
    );
    assert.equal(dateSchema.safeParse("2028-02-29").success, true);
  });
});
describe("safe planner updates", () => {
  it("updates one chore without changing any other family plans", () => {
    const seed = createSeed();
    const changed = applyMutation(seed, {
      collection: "tasks",
      action: "upsert",
      value: { ...seed.tasks[1], done: true },
    });
    assert.equal(changed.tasks[1].done, true);
    assert.equal(seed.tasks[1].done, false);
    assert.deepEqual(changed.events, seed.events);
    assert.equal(changed.tasks.length, seed.tasks.length);
  });
  it("keeps only one recipe per date and meal slot", () => {
    const seed = createSeed();
    const meal = seed.meals[0];
    const changed = applyMutation(seed, {
      collection: "meals",
      action: "upsert",
      value: { ...meal, id: "new-meal", recipeId: "tacos" },
    });
    assert.equal(changed.meals.length, seed.meals.length);
    assert.equal(
      changed.meals.find((m) => m.date === meal.date && m.slot === meal.slot)
        ?.recipeId,
      "tacos",
    );
  });
  it("does not duplicate pending ingredients or repeated recipes", () => {
    const seed = createSeed();
    const items = ingredientsToShopping(seed, ["pasta", "pasta"]);
    assert(!items.some((i) => i.name === "Cherry tomatoes"));
    assert(!items.some((i) => i.name === "Penne pasta"));
    assert.equal(new Set(items.map((i) => i.name)).size, items.length);
    assert.deepEqual(
      items.map((i) => i.name).sort(),
      [
        "Cream",
        "Fresh basil",
        "Parmesan",
        "Garlic",
        "Olive oil",
        "Salt",
        "Black pepper",
      ].sort(),
    );
  });
  it("can buy an ingredient again after it was checked off", () => {
    const seed = createSeed();
    seed.shopping = seed.shopping.map((i) =>
      i.name === "Penne pasta" ? { ...i, done: true } : i,
    );
    assert(
      ingredientsToShopping(seed, ["pasta"]).some(
        (i) => i.name === "Penne pasta",
      ),
    );
  });
  it("rejects corrupt backups, missing people, recipes, and duplicate IDs", () => {
    const seed = createSeed();
    assert.equal(dataSchema.safeParse({ ...seed, version: 2 }).success, false);
    assert.equal(dataSchema.safeParse({ ...seed, members: [] }).success, false);
    assert.equal(
      dataSchema.safeParse({
        ...seed,
        tasks: [{ ...seed.tasks[0], memberId: "missing" }],
      }).success,
      false,
    );
    assert.equal(
      dataSchema.safeParse({
        ...seed,
        meals: [{ ...seed.meals[0], recipeId: "missing" }],
      }).success,
      false,
    );
    assert.equal(
      dataSchema.safeParse({
        ...seed,
        events: [seed.events[0], seed.events[0]],
      }).success,
      false,
    );
    assert.equal(
      dataSchema.safeParse({
        ...seed,
        meals: [seed.meals[0], { ...seed.meals[0], id: "duplicate-slot" }],
      }).success,
      false,
    );
  });
});

describe("repeating and multi-day events", () => {
  const base = createSeed(fromKey("2026-09-28")).events[0];
  const event = (changes: Partial<typeof base>) => ({ ...base, ...changes });
  it("repeats every week, every 2 weeks, monthly and yearly", () => {
    const start = { date: "2026-01-31" };
    assert.equal(
      occursOn(event({ ...start, repeat: "weekly" }), "2026-02-07"),
      true,
    );
    assert.equal(
      occursOn(event({ ...start, repeat: "fortnightly" }), "2026-02-07"),
      false,
    );
    assert.equal(
      occursOn(event({ ...start, repeat: "fortnightly" }), "2026-02-14"),
      true,
    );
    assert.equal(
      occursOn(event({ ...start, repeat: "monthly" }), "2026-03-31"),
      true,
    );
    // February has no 31st, so that month is skipped.
    assert.equal(
      occursOn(event({ ...start, repeat: "monthly" }), "2026-02-28"),
      false,
    );
    assert.equal(
      occursOn(event({ ...start, repeat: "yearly" }), "2031-01-31"),
      true,
    );
    assert.equal(
      occursOn(event({ ...start, repeat: "yearly" }), "2025-01-31"),
      false,
    );
  });
  it("stops repeating after the until date", () => {
    const birthday = event({
      date: "2026-05-04",
      repeat: "yearly",
      until: "2028-12-31",
    });
    assert.equal(occursOn(birthday, "2028-05-04"), true);
    assert.equal(occursOn(birthday, "2029-05-04"), false);
  });
  it("covers every day of a multi-day event, including across years", () => {
    const trip = event({
      date: "2026-12-30",
      endDate: "2027-01-02",
      start: "18:00",
      end: "14:00",
    });
    assert.equal(eventSchema.safeParse(trip).success, true);
    for (const day of ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"])
      assert.deepEqual(occurrenceOn(trip, day), {
        start: "2026-12-30",
        end: "2027-01-02",
      });
    assert.equal(occursOn(trip, "2027-01-03"), false);
    assert.equal(occurrenceLabel(trip, "2026-12-30"), "From 6 pm");
    assert.equal(occurrenceLabel(trip, "2026-12-31"), "Day 2 of 4");
    assert.equal(occurrenceLabel(trip, "2027-01-02"), "Until 2 pm");
  });
  it("repeats multi-day events from each start", () => {
    const camp = event({
      date: "2026-07-10",
      endDate: "2026-07-12",
      repeat: "yearly",
      allDay: true,
    });
    assert.deepEqual(occurrenceOn(camp, "2027-07-11"), {
      start: "2027-07-10",
      end: "2027-07-12",
    });
    assert.equal(startsOn(camp, "2027-07-11"), false);
    assert.equal(occurrenceLabel(camp, "2027-07-11"), "Day 2 of 3");
  });
  it("explains invalid date combinations", () => {
    const message = (changes: Partial<typeof base>) =>
      eventSchema.safeParse(event(changes)).error?.issues[0].message;
    assert.equal(
      message({ endDate: "2026-09-01" }),
      "End date can’t be before the start date",
    );
    assert.equal(
      message({ start: "15:00", end: "14:00" }),
      "End time must be after start time",
    );
    assert.equal(
      message({ repeat: "weekly", until: "2026-01-01" }),
      "The repeat can’t end before the event starts",
    );
    assert.equal(
      message({ repeat: "weekly", endDate: "2026-10-05" }),
      "An event that repeats every week can last at most 7 days",
    );
    assert.equal(
      message({ allDay: true, start: "00:00", end: "23:59" }),
      undefined,
    );
  });
});
