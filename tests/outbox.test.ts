import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSeed, fromKey } from "../src/lib/data";
import {
  acknowledgeOutbox,
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
  it("keeps edits queued while an earlier batch was being sent", () => {
    const store = memory();
    const first = tick(seed.shopping[0].id),
      second = tick(seed.shopping[1].id);
    writeOutbox("fam", [first], store);
    const sending = readOutbox("fam", store)[0];
    writeOutbox("fam", [...readOutbox("fam", store), second], store);
    assert.deepEqual(acknowledgeOutbox("fam", sending, store), [second]);
    assert.deepEqual(readOutbox("fam", store), [second]);
    assert.deepEqual(acknowledgeOutbox("fam", second, store), []);
    assert.equal(store.items.size, 0);
  });
  it("does not remove a different head already advanced by another tab", () => {
    const store = memory();
    const first = tick(seed.shopping[0].id),
      second = tick(seed.shopping[1].id);
    writeOutbox("fam", [second], store);
    assert.deepEqual(acknowledgeOutbox("fam", first, store), [second]);
    assert.deepEqual(readOutbox("fam", store), [second]);
  });
  it("reports unavailable storage without pretending an offline edit was saved", () => {
    const store = memory();
    const first = tick(seed.shopping[0].id),
      second = tick(seed.shopping[1].id);
    assert.equal(writeOutbox("fam", [first], store), true);
    const full = {
      ...store,
      setItem: () => {
        throw new DOMException("Full", "QuotaExceededError");
      },
    };
    assert.equal(writeOutbox("fam", [first, second], full), false);
    assert.deepEqual(readOutbox("fam", store), [first]);
    assert.equal(writeOutbox("fam", [first], null), false);
    assert.equal(acknowledgeOutbox("fam", first, null), null);
    const blocked = {
      ...store,
      removeItem: () => {
        throw new DOMException("Blocked", "SecurityError");
      },
    };
    assert.equal(acknowledgeOutbox("fam", first, blocked), null);
    assert.deepEqual(readOutbox("fam", store), [first]);
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
  it("lay many queued ticks on top in order", () => {
    const ticks = seed.shopping.map((item) => tick(item.id));
    const untick = [{ ...tick(seed.shopping[0].id)[0] }];
    untick[0].value = { ...untick[0].value, done: false };
    const shown = rebase(seed, [...ticks, untick]);
    assert.deepEqual(
      shown.shopping.map((i) => i.done),
      seed.shopping.map((_, i) => i !== 0),
    );
  });
  it("skip only the change that no longer fits, keeping later ones", () => {
    const gone = [
      {
        collection: "tasks" as const,
        action: "upsert" as const,
        value: { ...seed.tasks[0], memberId: "nobody" },
      },
    ];
    const shown = rebase(seed, [
      tick(seed.shopping[0].id),
      gone,
      tick(seed.shopping[1].id),
    ]);
    assert.equal(shown.tasks[0].memberId, seed.tasks[0].memberId);
    assert.equal(shown.shopping[0].done, true);
    assert.equal(shown.shopping[1].done, true);
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
