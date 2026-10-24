import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  cheer,
  completeChore,
  nextDue,
  reopenChore,
  starsThisWeek,
} from "../src/lib/chores";
import {
  applyMutation,
  createSeed,
  dataSchema,
  fromKey,
  removeMemberChanges,
  type Task,
} from "../src/lib/data";

describe("thanking people for chores", () => {
  const tasks = [
    { id: "1", memberId: "oliver", done: false },
    { id: "2", memberId: "oliver", done: false },
    { id: "3", memberId: "sophie", done: false },
  ];
  it("says thanks", () => {
    assert.equal(cheer(tasks, tasks[0], "Oliver"), "Done. Thanks, Oliver!");
  });
  it("notices someone finishing all their chores", () => {
    const one = [{ ...tasks[0], done: true }, tasks[1], tasks[2]];
    assert.equal(
      cheer(one, tasks[1], "Oliver"),
      "Oliver has finished all their chores! ⭐",
    );
  });
  it("celebrates the last chore in the family", () => {
    const almost = tasks.map((t) => ({ ...t, done: t.id !== "3" }));
    assert.equal(
      cheer(almost, tasks[2], "Sophie"),
      "Every chore is done. Brilliant teamwork! 🎉",
    );
  });
});

describe("repeating chores", () => {
  const seed = createSeed(fromKey("2026-10-05"));
  const bins: Task = {
    id: "bins",
    title: "Take out the bins",
    memberId: "oliver",
    due: "2026-10-06", // a Tuesday
    done: false,
    priority: "normal",
    repeat: "weekly",
    rotation: ["oliver", "sophie"],
  };
  const plan = { ...seed, tasks: [...seed.tasks, bins] };
  const at = (day: string) => new Date(`${day}T18:00:00`);
  const after = (changes: ReturnType<typeof completeChore>) =>
    changes.reduce(applyMutation, plan);

  it("schedules the next one for the next person in turn", () => {
    const done = after(completeChore(plan, bins, at("2026-10-06")));
    const next = done.tasks.filter((t) => t.series === "bins" && !t.done);
    assert.equal(dataSchema.safeParse(done).success, true);
    assert.deepEqual(
      next.map((t) => [t.memberId, t.due]),
      [["sophie", "2026-10-13"]],
    );
    assert.ok(done.tasks.find((t) => t.id === "bins")?.doneAt);
  });
  it("keeps its rhythm when done late", () => {
    assert.equal(nextDue("2026-10-06", "weekly", "2026-10-15"), "2026-10-20");
    assert.equal(nextDue("2026-01-31", "monthly", "2026-01-31"), "2026-02-28");
    assert.equal(
      nextDue("2026-10-06", "fortnightly", "2026-10-06"),
      "2026-10-20",
    );
  });
  it("takes back the next one when unticked, and doesn't double up", () => {
    const done = after(completeChore(plan, bins, at("2026-10-06")));
    const ticked = done.tasks.find((t) => t.id === "bins")!;
    const reopened = reopenChore(done, ticked).reduce(applyMutation, done);
    assert.equal(reopened.tasks.filter((t) => t.series === "bins").length, 1);
    assert.equal(
      reopened.tasks.find((t) => t.id === "bins")?.doneAt,
      undefined,
    );
    // Ticking again only schedules one next chore.
    const again = completeChore(
      reopened,
      reopened.tasks.find((t) => t.id === "bins")!,
      at("2026-10-06"),
    );
    const twice = completeChore(
      again.reduce(applyMutation, reopened),
      { ...bins, done: false, series: "bins" },
      at("2026-10-06"),
    );
    assert.equal(twice.length, 1);
  });
  it("counts stars for this week only", () => {
    const done = after(completeChore(plan, bins, at("2026-10-06")));
    const old = {
      ...seed.tasks[0],
      memberId: "sophie",
      done: true,
      doneAt: "2026-09-01T09:00:00.000Z",
    };
    const stars = starsThisWeek(
      { ...done, tasks: [...done.tasks, old] },
      at("2026-10-08"),
    );
    assert.equal(stars.oliver, 1);
    assert.equal(stars.sophie, undefined);
  });
  it("drops someone who's removed from the turns", () => {
    const sophieGone = removeMemberChanges(plan, "sophie", "alex").reduce(
      applyMutation,
      plan,
    );
    assert.equal(dataSchema.safeParse(sophieGone).success, true);
    assert.equal(
      sophieGone.tasks.find((t) => t.id === "bins")?.rotation,
      undefined,
    );
  });
  it("rejects turns for people who aren't in the family", () => {
    const bad = {
      ...plan,
      tasks: [...seed.tasks, { ...bins, rotation: ["oliver", "nobody"] }],
    };
    assert.equal(dataSchema.safeParse(bad).success, false);
  });
});
