import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

type Client = {
  url: string;
  navigate: (url: string) => Promise<Client | null>;
  focus: () => Promise<Client>;
};
// Runs public/sw.js with a fake service worker scope and clicks a reminder.
async function click(windows: Client[], url = "/#chores") {
  const handlers: Record<string, (event: unknown) => void> = {};
  const opened: string[] = [];
  const self = {
    location: { origin: "https://kinfolk.example" },
    addEventListener: (type: string, handler: (event: unknown) => void) =>
      (handlers[type] = handler),
    clients: {
      matchAll: async () => windows,
      openWindow: async (target: string) => void opened.push(target),
      claim: async () => undefined,
    },
    registration: {},
  };
  runInNewContext(readFileSync("public/sw.js", "utf8"), { self, URL });
  let work: Promise<unknown> = Promise.resolve();
  handlers.notificationclick({
    notification: { close: () => undefined, data: { url } },
    waitUntil: (promise: Promise<unknown>) => (work = promise),
  });
  await work;
  return opened;
}

describe("reminder notification clicks", () => {
  it("reuses an open planner tab", async () => {
    const visited: string[] = [];
    const tab: Client = {
      url: "https://kinfolk.example/#overview",
      navigate: async (url) => (visited.push(url), tab),
      focus: async () => tab,
    };
    assert.deepEqual(await click([tab]), []);
    assert.deepEqual(visited, ["https://kinfolk.example/#chores"]);
  });
  it("opens a new window when the tab can't be navigated", async () => {
    const tab: Client = {
      url: "https://kinfolk.example/",
      navigate: async () => {
        throw new TypeError(
          "This service worker is not the client's active worker.",
        );
      },
      focus: async () => tab,
    };
    assert.deepEqual(await click([tab], "/#calendar"), [
      "https://kinfolk.example/#calendar",
    ]);
  });
});
