import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cheer } from "../src/lib/chores";

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
