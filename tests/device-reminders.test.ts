import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  deliverDeviceReminders,
  parseDevicePreferences,
} from "../src/lib/device-reminders";
import type { Reminder } from "../src/lib/reminders";

const reminder: Reminder = {
  key: "event:football:2026-10-25:16:00",
  title: "Football practice",
  body: "At 4 pm",
  url: "/#calendar",
};
function storage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

describe("device reminders", () => {
  it("starts disabled and ignores malformed or invalid saved preferences", () => {
    for (const raw of [
      null,
      "not json",
      "[]",
      JSON.stringify({ enabled: true }),
      JSON.stringify({
        enabled: true,
        timezone: "Not/AZone",
        scope: "mine",
        event_minutes: 15,
        chore_time: "09:00",
        events_enabled: true,
        chores_enabled: true,
      }),
    ])
      assert.equal(parseDevicePreferences(raw).enabled, false);
    const valid = {
      ...parseDevicePreferences(null),
      enabled: true,
      timezone: "Pacific/Auckland",
    };
    assert.deepEqual(parseDevicePreferences(JSON.stringify(valid)), valid);
  });

  it("sends a reminder once across repeated checks and reloads", async () => {
    const saved = storage();
    const sent: string[] = [];
    const send = async (_: Reminder, tag: string) => {
      sent.push(tag);
    };
    await deliverDeviceReminders(saved, "family-one", [reminder], send);
    await deliverDeviceReminders(saved, "family-one", [reminder], send);
    assert.deepEqual(sent, [`kinfolk:family-one:${reminder.key}`]);
  });

  it("keeps delivery records separate for different families and occurrences", async () => {
    const saved = storage();
    let sent = 0;
    const send = async () => {
      sent++;
    };
    await deliverDeviceReminders(saved, "one", [reminder], send);
    await deliverDeviceReminders(saved, "two", [reminder], send);
    await deliverDeviceReminders(
      saved,
      "one",
      [{ ...reminder, key: reminder.key + ":next" }],
      send,
    );
    assert.equal(sent, 3);
  });

  it("retries failed notifications without duplicating successful ones", async () => {
    const saved = storage();
    let sent = 0;
    await assert.rejects(
      deliverDeviceReminders(saved, "one", [reminder], async () => {
        throw new Error("Device unavailable");
      }),
    );
    await deliverDeviceReminders(saved, "one", [reminder], async () => {
      sent++;
    });
    assert.equal(sent, 1);
  });

  it("does not send when delivery history cannot be saved", async () => {
    let sent = false;
    await assert.rejects(
      deliverDeviceReminders(
        {
          getItem: () => null,
          setItem: () => {
            throw new Error("Storage unavailable");
          },
        },
        "one",
        [reminder],
        async () => {
          sent = true;
        },
      ),
    );
    assert.equal(sent, false);
  });

  it("discards expired and corrupt delivery history", async () => {
    const saved = storage();
    const key = "kinfolk-device-deliveries:one";
    saved.setItem(key, JSON.stringify({ old: 1, invalid: "forever" }));
    await deliverDeviceReminders(
      saved,
      "one",
      [reminder],
      async () => {},
      200000000,
    );
    assert.deepEqual(JSON.parse(saved.getItem(key)!), {
      [reminder.key]: 200000000,
    });
    saved.setItem(key, "not json");
    await deliverDeviceReminders(
      saved,
      "one",
      [reminder],
      async () => {},
      200000001,
    );
    assert.deepEqual(JSON.parse(saved.getItem(key)!), {
      [reminder.key]: 200000001,
    });
  });
});
