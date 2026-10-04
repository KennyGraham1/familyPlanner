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
  occursOn,
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
    assert.equal(items.length, 4);
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
