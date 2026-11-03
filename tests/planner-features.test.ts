import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyMutation,
  createSeed,
  dataSchema,
  dateKey,
  fromKey,
  inverseOf,
  occurrenceOn,
  recipes,
  type Feature,
  type Mutation,
} from "../src/lib/data";
import { combineQuantities, scaleQuantity } from "../src/lib/quantities";
import {
  copyMeals,
  familyDate,
  lineItems,
  lines,
  rewardBalance,
  routineDue,
  setChecklistItem,
  setRoutineStep,
  shoppingPlan,
  weekEntries,
} from "../src/lib/planning";
import { validationMessage } from "../src/lib/errors";
import { plannerSearch } from "../src/lib/search";
import { parseNotice } from "../src/lib/notice-import";
import { calendarFile } from "../src/lib/ics";
import {
  fromGoogle,
  toGoogle,
  type GoogleEvent,
} from "../src/lib/google-calendar/events";
import { withLocalActivity } from "../src/lib/activity";

describe("meal planning and groceries", () => {
  it("scales fractions, combines compatible units and preserves uncertain quantities", () => {
    assert.equal(scaleQuantity("1/2 tsp", 2), "1 tsp");
    assert.equal(scaleQuantity("1½ cups", 2), "3 cup");
    assert.equal(combineQuantities("300 g", "0.5 kg"), "800 g");
    assert.equal(combineQuantities("2 tbsp", "3 tsp"), "3 tbsp");
    assert.equal(scaleQuantity("1–2, to taste", 2), "2 × (1–2, to taste)");
    assert.equal(combineQuantities("1 cup", "200 g"), "1 cup + 200 g");
  });
  it("scales counted items and leaves amounts without numbers alone", () => {
    assert.equal(scaleQuantity("3 cloves", 2), "6 cloves");
    assert.equal(scaleQuantity("2 × 400 g cans", 1.5), "3 × 400 g cans");
    assert.equal(scaleQuantity("⅛ tsp", 2), "0.25 tsp");
    assert.equal(
      scaleQuantity("600 g (sealed ready-to-heat packs)", 2),
      "1200 g (sealed ready-to-heat packs)",
    );
    assert.equal(scaleQuantity("to taste", 2), "to taste");
    assert.equal(scaleQuantity("a pinch", 3), "a pinch");
    assert.equal(
      scaleQuantity("4 large (about 1 kg)", 2),
      "2 × (4 large (about 1 kg))",
    );
    assert.equal(combineQuantities("3 cloves", "2 cloves"), "5 cloves");
    assert.equal(combineQuantities("2 tablespoons", "1 tsp"), "2.33 tbsp");
    assert.equal(combineQuantities("to taste", "to taste"), "to taste");
    assert.equal(combineQuantities("2 cans", "3 cloves"), "2 cans + 3 cloves");
  });
  it("counts each planned meal and serving, with explicit pantry and already-listed flags", () => {
    const data = createSeed();
    data.shopping = [];
    data.pantry = [
      { id: "p", name: "Plain flour", quantity: "200 g", category: "Pantry" },
    ];
    const plan = shoppingPlan(data, [
      { recipeId: "pancakes", servings: 2 },
      { recipeId: "pancakes", servings: 4 },
    ]);
    assert.equal(plan.find((l) => l.name === "Plain flour")?.quantity, "300 g");
    assert.equal(plan.find((l) => l.name === "Plain flour")?.inPantry, true);
    assert.equal(plan.find((l) => l.name === "Eggs")?.quantity, "3");
  });
  it("copies all meal slots over a year boundary, preserves occupied slots and undoes the batch", () => {
    const data = createSeed(fromKey("2026-12-28"));
    data.meals = [
      { id: "a", date: "2026-12-21", slot: "Breakfast", recipeId: "pancakes" },
      { id: "b", date: "2026-12-27", slot: "Dinner", note: "Leftovers" },
      {
        id: "existing",
        date: "2026-12-28",
        slot: "Breakfast",
        recipeId: "pasta",
      },
    ];
    const entries = weekEntries(data.meals, "2026-12-21");
    const empty = copyMeals(data, entries, "2026-12-28", false);
    assert.equal(empty.length, 1);
    const changes = copyMeals(data, entries, "2026-12-28", true),
      next = changes.reduce(applyMutation, data);
    assert.equal(
      next.meals.find((m) => m.date === "2027-01-03")?.note,
      "Leftovers",
    );
    assert.deepEqual(
      inverseOf(data, changes).reduce(applyMutation, next),
      data,
    );
    assert.ok(dataSchema.safeParse(next).success);
  });
  it("accepts old backups, custom recipes and meal notes and rejects broken references", () => {
    const data = createSeed();
    assert.ok(dataSchema.safeParse(data).success);
    data.customRecipes = [
      { ...recipes[0], id: "custom", color: "sage" as const },
    ];
    data.meals = [
      { id: "m", date: "2026-11-01", slot: "Dinner", recipeId: "custom" },
    ];
    assert.ok(dataSchema.safeParse(data).success);
    data.recipePrefs = [
      {
        id: "pref",
        memberId: "alex",
        recipeId: "missing",
        favourite: true,
        cookSoon: false,
      },
    ];
    assert.equal(dataSchema.safeParse(data).success, false);
    data.recipePrefs = [];
    data.meals = [
      { id: "m", date: "2026-11-01", slot: "Dinner", note: "Leftovers" },
    ];
    assert.ok(dataSchema.safeParse(data).success);
  });
});
describe("routines, events and history", () => {
  const routine: Feature<"routines"> = {
    id: "r",
    title: "School morning",
    memberId: "oliver",
    period: "Morning",
    days: [1, 2, 3, 4, 5],
    steps: [{ id: "bag", title: "Pack bag" }],
    from: "2026-10-01",
    until: "2026-12-20",
    excludedRanges: [{ start: "2026-10-26", end: "2026-10-30" }],
  };
  it("respects weekdays, term dates and holidays and credits a completed routine only once", () => {
    assert.equal(routineDue(routine, "2026-10-26"), false);
    assert.equal(routineDue(routine, "2026-10-31"), false);
    assert.equal(routineDue(routine, "2026-11-02"), true);
    const data = createSeed();
    data.tasks = [];
    data.routines = [routine];
    data.routineChecks = [
      {
        id: "r:2026-11-02",
        routineId: "r",
        memberId: "oliver",
        date: "2026-11-02",
        steps: ["bag"],
      },
    ];
    assert.equal(rewardBalance(data, "oliver"), 1);
    assert.equal(
      familyDate(
        {
          ...data,
          settings: { ...data.settings, timezone: "Pacific/Auckland" },
        },
        new Date("2026-11-01T11:30:00Z"),
      ),
      "2026-11-02",
    );
    assert.ok(dataSchema.safeParse(data).success);
    data.routineChecks[0].steps = ["bag", "bag"];
    assert.equal(dataSchema.safeParse(data).success, false);
  });
  it("skips holidays in calendar, export and Google while preserving local event metadata", () => {
    const event = {
      ...createSeed().events[0],
      date: "2026-10-26",
      repeat: "weekly" as const,
      until: "2026-12-31",
      excludedDates: ["2026-11-02"],
      excludedRanges: [{ start: "2026-11-09", end: "2026-11-15" }],
      pickupMemberId: "alex",
    };
    assert.equal(occurrenceOn(event, "2026-11-02"), null);
    assert.equal(occurrenceOn(event, "2026-11-09"), null);
    assert.ok(occurrenceOn(event, "2026-11-16"));
    assert.match(calendarFile([event]), /EXDATE:20261102T/);
    const google = toGoogle(event, "Pacific/Auckland");
    const back = fromGoogle(
      { id: "g", ...google } as unknown as GoogleEvent,
      "Pacific/Auckland",
      event.id,
      "alex",
      event,
    );
    assert.equal(back.pickupMemberId, "alex");
    assert.equal(occurrenceOn(back, "2026-11-09"), null);
  });
  it("restores event comments and links together when deletion is undone", () => {
    const data = createSeed();
    const eventId = data.events[0].id;
    data.comments = [
      {
        id: "c",
        eventId,
        memberId: "alex",
        body: "Bring towels",
        createdAt: new Date().toISOString(),
      },
    ];
    data.eventLinks = [
      {
        id: "l",
        eventId,
        name: "Notice",
        url: "https://example.com/notice.pdf",
      },
    ];
    const changes: Mutation[] = [
      { collection: "events", action: "remove", id: eventId },
    ];
    const next = changes.reduce(applyMutation, data);
    assert.equal(next.comments?.length, 0);
    assert.ok(dataSchema.safeParse(next).success);
    const restored = inverseOf(data, changes).reduce(applyMutation, next);
    assert.ok(dataSchema.safeParse(restored).success);
    assert.deepEqual(restored.comments, data.comments);
    assert.deepEqual(restored.eventLinks, data.eventLinks);
    const edit: Mutation = {
      collection: "events",
      action: "upsert",
      value: { ...data.events[0], title: "Updated school run" },
    };
    const audited = withLocalActivity(data, [edit], "alex").reduce(
      applyMutation,
      data,
    );
    assert.equal(audited.activity?.[0].source, "device");
    assert.match(audited.activity?.[0].after ?? "", /Updated school run/);
  });
});
describe("smart search and notice import", () => {
  it("ranks names first, tolerates typos and finds ingredients, notes, places and people", () => {
    const now = fromKey("2026-10-26"),
      data = createSeed(now);
    data.events[0].notes = "Bring purple goggles";
    data.events[0].location = "Porirua aquatic centre";
    assert.equal(
      plannerSearch(data, "goggles", "Calendar", now)[0].id,
      data.events[0].id,
    );
    assert.equal(
      plannerSearch(data, "porirua jamie", "Calendar", now)[0].id,
      data.events[0].id,
    );
    for (const typo of ["jolof", "jololf", "jolloff"])
      assert.ok(
        plannerSearch(data, typo, "Recipes", now).some((r) =>
          r.title.toLowerCase().includes("jollof"),
        ),
        typo,
      );
    assert.ok(
      plannerSearch(data, "chiken", "Recipes", now).some((r) =>
        r.title.toLowerCase().includes("chicken"),
      ),
    );
    assert.ok(
      plannerSearch(data, "footbal", "Calendar", now).some(
        (r) => r.title === "Football practice",
      ),
    );
    assert.ok(
      plannerSearch(data, "cabbage tuna", "Recipes", now).some(
        (r) => r.id === "ghana-tuna-cabbage",
      ),
    );
    assert.ok(
      plannerSearch(data, "soccer", "Calendar", now).some(
        (r) => r.title === "Football practice",
      ),
    );
  });
  it("understands tomorrow and overdue, including a multi-day event already underway", () => {
    const now = fromKey("2026-10-26"),
      data = createSeed(now);
    data.events = [
      {
        ...data.events[0],
        id: "trip",
        date: "2026-10-25",
        endDate: "2026-10-29",
        title: "Family trip",
      },
    ];
    assert.equal(
      plannerSearch(data, "events tomorrow", "All", now)[0].id,
      "trip",
    );
    data.tasks = [
      { ...data.tasks[0], id: "late", due: "2026-10-25", done: false },
      { ...data.tasks[0], id: "done", due: "2026-10-25", done: true },
    ];
    assert.deepEqual(
      plannerSearch(data, "chores overdue", "All", now).map((r) => r.id),
      ["late"],
    );
  });
  it("extracts dated lines without guessing missing times and flags invalid or relative dates", () => {
    const drafts = parseNotice(
      "Assembly 5 November 2026 9am–10am\nTrip 6/11/2026\nSports next Friday\nImpossible 2026-02-30",
      "2026-10-26",
    );
    assert.equal(drafts[0].date, "2026-11-05");
    assert.equal(drafts[0].start, "09:00");
    assert.equal(drafts[0].end, "10:00");
    assert.equal(drafts[1].start, "");
    assert.equal(drafts[2].date, "2026-10-30");
    assert.match(drafts[2].warning, /Relative/);
    assert.equal(drafts[3].date, "");
    assert.equal(dateKey(fromKey(drafts[0].date)), drafts[0].date);
  });
  it("reads abbreviated months as written in school newsletters", () => {
    const [sept, nov] = parseNotice(
      "Photo day 5 Sept 2026\nPrize-giving 12 Nov. 2026 6pm–7pm",
      "2026-08-01",
    );
    assert.equal(sept.date, "2026-09-05");
    assert.equal(sept.title, "Photo day");
    assert.equal(nov.date, "2026-11-12");
    assert.equal(nov.title, "Prize-giving");
  });
});

describe("lists typed one per line", () => {
  it("handle pasted line endings and blank lines", () => {
    assert.deepEqual(lines("Rice | 300 g\r\n  \r\n\tTomatoes \n"), [
      "Rice | 300 g",
      "Tomatoes",
    ]);
  });
  it("keep ids for unchanged lines and give repeated lines their own", () => {
    const before = [
      { id: "a", title: "Water bottle" },
      { id: "b", title: "Towel" },
    ];
    const items = lineItems("Towel\nWater bottle\nWater bottle", before);
    assert.deepEqual(
      items.slice(0, 2).map((i) => i.id),
      ["b", "a"],
    );
    assert.equal(new Set(items.map((i) => i.id)).size, 3);
  });
});

describe("ticks made while an earlier save is on its way", () => {
  const seed = createSeed(fromKey("2026-10-05"));
  const data = {
    ...seed,
    events: seed.events.map((e) =>
      e.id === "e2"
        ? {
            ...e,
            checklist: [
              { id: "boots", title: "Boots" },
              { id: "water", title: "Water bottle" },
            ],
          }
        : e,
    ),
    routines: [
      {
        id: "morning",
        title: "Morning",
        memberId: "oliver",
        period: "Morning" as const,
        days: [0, 1, 2, 3, 4, 5, 6],
        steps: [
          { id: "teeth", title: "Brush teeth" },
          { id: "bag", title: "Pack bag" },
        ],
      },
    ],
  };
  const day = seed.events.find((e) => e.id === "e2")!.date;
  it("keep every checklist tick, not just the last", () => {
    // Both taps were made on the same (stale) screen; each is worked out in turn.
    const first = setChecklistItem("e2", day, "boots", true);
    const second = setChecklistItem("e2", day, "water", true);
    const once = first(data).reduce(applyMutation, data);
    const after = second(once).reduce(applyMutation, once);
    assert.deepEqual(
      after.events.find((e) => e.id === "e2")?.checklistDone?.[day],
      ["boots", "water"],
    );
    assert.equal(dataSchema.safeParse(after).success, true);
    // An item removed elsewhere meanwhile is left alone.
    assert.deepEqual(setChecklistItem("e2", day, "gone", true)(data), []);
  });
  it("keep every routine step tick, and repeated taps change nothing", () => {
    const teeth = setRoutineStep("morning", "2026-10-05", "teeth", true);
    const bag = setRoutineStep("morning", "2026-10-05", "bag", true);
    const once = teeth(data).reduce(applyMutation, data);
    const both = bag(once).reduce(applyMutation, once);
    assert.deepEqual(both.routineChecks?.[0].steps, ["teeth", "bag"]);
    assert.deepEqual(teeth(both), []);
    assert.equal(dataSchema.safeParse(both).success, true);
    assert.equal(rewardBalance(both, "oliver"), 1);
  });
});

describe("explaining a change the plans can't accept", () => {
  it("uses the planner's own reason, and leaves other failures alone", () => {
    const settings = createSeed().settings;
    const rejected = dataSchema.safeParse({
      ...createSeed(),
      settings: { ...settings, quietStart: "21:00" },
    });
    assert.equal(
      validationMessage(rejected.error),
      "Choose both the start and end of quiet hours",
    );
    assert.equal(
      validationMessage(new DOMException("Full", "QuotaExceededError")),
      null,
    );
    assert.match(
      validationMessage(dataSchema.safeParse({}).error) ?? "",
      /check them/,
    );
  });
});
