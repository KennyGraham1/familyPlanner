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
    location: new URL("https://kinfolk.example/sw.js?offline=0"),
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
  it("opens the affected event and rejects external notification URLs", async () => {
    assert.deepEqual(await click([], "/#calendar?event=swim&day=2026-11-02"), [
      "https://kinfolk.example/#calendar?event=swim&day=2026-11-02",
    ]);
    assert.deepEqual(await click([], "https://example.test/untrusted"), [
      "https://kinfolk.example/#calendar",
    ]);
  });
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

describe("opening the app offline", () => {
  type FakeRequest = { url: string; method: string; mode: string };
  // Runs sw.js with a fake cache and network.
  function worker({ offline = true, online = true } = {}) {
    const handlers: Record<string, (event: unknown) => void> = {};
    const store = new Map<string, string>();
    const network: string[] = [];
    const key = (req: FakeRequest | string) =>
      typeof req === "string"
        ? new URL(req, "https://kinfolk.example").href
        : req.url;
    const cache = {
      match: async (req: FakeRequest | string) =>
        store.has(key(req)) ? new Response(store.get(key(req))) : undefined,
      put: async (req: FakeRequest, res: Response) =>
        void store.set(key(req), await res.text()),
      addAll: async () => undefined,
    };
    const self = {
      location: new URL(
        `https://kinfolk.example/sw.js?offline=${offline ? 1 : 0}`,
      ),
      addEventListener: (type: string, handler: (event: unknown) => void) =>
        (handlers[type] = handler),
      clients: { claim: async () => undefined },
      registration: {},
      skipWaiting: () => undefined,
    };
    const fetch = async (req: FakeRequest) => {
      network.push(new URL(req.url).pathname);
      if (!online) throw new TypeError("Failed to fetch");
      return new Response(`fresh ${new URL(req.url).pathname}`);
    };
    runInNewContext(readFileSync("public/sw.js", "utf8"), {
      self,
      URL,
      Response,
      fetch,
      caches: {
        open: async () => cache,
        keys: async () => [],
        delete: async () => true,
      },
    });
    /** What the worker answers with, or null when it leaves the request alone. */
    const request = async (url: string, mode = "no-cors") => {
      let reply: Promise<Response> | null = null;
      handlers.fetch({
        request: {
          url: new URL(url, "https://kinfolk.example").href,
          method: "GET",
          mode,
        },
        waitUntil: () => undefined,
        respondWith: (r: Promise<Response>) => (reply = r),
      });
      return reply ? (reply as Promise<Response>).then((r) => r.text()) : null;
    };
    return { request, store, network };
  }

  it("opens the saved app when there's no connection", async () => {
    const sw = worker({ online: false });
    sw.store.set("https://kinfolk.example/", "saved app");
    assert.equal(
      await sw.request("/?googleCalendar=connected", "navigate"),
      "saved app",
    );
  });
  it("saves pages while online, and serves built files without the network", async () => {
    const sw = worker();
    assert.equal(await sw.request("/", "navigate"), "fresh /");
    assert.equal(sw.store.get("https://kinfolk.example/"), "fresh /");
    sw.store.set(
      "https://kinfolk.example/_next/static/chunks/app.js",
      "saved chunk",
    );
    assert.equal(
      await sw.request("/_next/static/chunks/app.js"),
      "saved chunk",
    );
    assert.deepEqual(sw.network, ["/"]);
  });
  it("never touches family data, API replies or other sites", async () => {
    const sw = worker();
    assert.equal(await sw.request("/api/calendar/abc.ics"), null);
    assert.equal(
      await sw.request(
        "https://kinfolktest.supabase.co/rest/v1/rpc/planner_get_context",
      ),
      null,
    );
    assert.equal(
      await sw.request("https://photon.komoot.io/api/?q=park"),
      null,
    );
  });
  it("stays out of the way in development", async () => {
    const sw = worker({ offline: false });
    assert.equal(await sw.request("/", "navigate"), null);
  });
});
