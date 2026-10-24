import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSeed, fromKey } from "../src/lib/data";
import {
  readOutbox,
  rebase,
  readSnapshot,
  saveSnapshot,
  writeOutbox,
  forgetOffline,
} from "../src/lib/outbox";

const memory = () => {
  const items = new Map<string, string>();
  return {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
    removeItem: (k: string) => void items.delete(k),
    items,
  };
};
const seed = createSeed(fromKey("2026-10-05"));
const tick = (id: string) => [
  {
    collection: "shopping" as const,
    action: "upsert" as const,
    value: { ...seed.shopping.find((i) => i.id === id)!, done: true },
  },
];

describe("offline changes", () => {
  it("wait in order, per family, and clear when sent", () => {
    const store = memory();
    writeOutbox(
      "fam",
      [tick(seed.shopping[0].id), tick(seed.shopping[1].id)],
      store,
    );
    assert.equal(readOutbox("fam", store).length, 2);
    assert.equal(readOutbox("other", store).length, 0);
    writeOutbox("fam", [], store);
    assert.equal(store.items.size, 0);
  });
  it("stay on screen when fresh plans arrive from the server", () => {
    const fresh = {
      ...seed,
      settings: { ...seed.settings, familyName: "Renamed elsewhere" },
    };
    const shown = rebase(fresh, [tick(seed.shopping[0].id)]);
    assert.equal(shown.settings.familyName, "Renamed elsewhere");
    assert.equal(
      shown.shopping.find((i) => i.id === seed.shopping[0].id)?.done,
      true,
    );
  });
  it("skip a change that no longer fits", () => {
    const gone = [
      {
        collection: "tasks" as const,
        action: "upsert" as const,
        value: { ...seed.tasks[0], memberId: "nobody" },
      },
    ];
    assert.deepEqual(rebase(seed, [gone]), seed);
  });
  it("keep the last plans seen until sign-out", () => {
    const store = memory();
    const context = {
      household_id: "00000000-0000-4000-8000-0000000000f1",
      owner_id: "00000000-0000-4000-8000-0000000000a1",
      member_id: "alex",
      updated_at: "2026-10-05T00:00:00Z",
      access: [],
      data: seed,
    };
    saveSnapshot("u1", context, store);
    assert.equal(
      readSnapshot("u1", store)?.data.settings.familyName,
      seed.settings.familyName,
    );
    assert.equal(readSnapshot("u2", store), null);
    forgetOffline("u1", context.household_id, store);
    assert.equal(readSnapshot("u1", store), null);
  });
});
