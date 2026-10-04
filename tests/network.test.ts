import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canRetry,
  connectionState,
  createResilientFetch,
  isNetworkError,
  offlineMessage,
} from "../src/lib/network";

const base = "https://project.supabase.co";
const save = `${base}/rest/v1/rpc/planner_apply_changes`;
// Safari's wording when a phone's connection was dropped in the background.
const loadFailed = () => new TypeError("Load failed");

function fakeFetch(...outcomes: ("fail" | "hang" | number)[]) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push(String(input));
    const outcome = outcomes[Math.min(calls.length - 1, outcomes.length - 1)];
    if (outcome === "fail") throw loadFailed();
    if (outcome === "hang")
      return await new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("The operation was aborted.", "AbortError")),
        ),
      );
    return new Response("{}", { status: outcome });
  }) as typeof fetch;
  return { impl, calls };
}

describe("resilient requests", () => {
  it("retries a save that failed on a dropped connection", async () => {
    const { impl, calls } = fakeFetch("fail", 200);
    const request = createResilientFetch({ fetchImpl: impl, delaysMs: [1, 1] });
    const response = await request(save, { method: "POST", body: "[]" });
    assert.equal(response.status, 200);
    assert.equal(calls.length, 2);
  });
  it("gives up on a hung request and tries again", async () => {
    const { impl, calls } = fakeFetch("hang", 200);
    const request = createResilientFetch({
      fetchImpl: impl,
      timeoutMs: 20,
      delaysMs: [1, 1],
    });
    assert.equal((await request(`${base}/rest/v1/x`)).status, 200);
    assert.equal(calls.length, 2);
  });
  it("stops after three attempts", async () => {
    const { impl, calls } = fakeFetch("fail");
    const request = createResilientFetch({ fetchImpl: impl, delaysMs: [1, 1] });
    await assert.rejects(request(save, { method: "POST" }), /Load failed/);
    assert.equal(calls.length, 3);
  });
  it("never repeats requests that could act twice", async () => {
    const { impl, calls } = fakeFetch("fail", 200);
    const request = createResilientFetch({ fetchImpl: impl, delaysMs: [1, 1] });
    await assert.rejects(
      request(`${base}/rest/v1/rpc/planner_join_family`, { method: "POST" }),
    );
    assert.equal(calls.length, 1);
  });
  it("doesn't retry answers from the server", async () => {
    const { impl, calls } = fakeFetch(400);
    const request = createResilientFetch({ fetchImpl: impl, delaysMs: [1, 1] });
    assert.equal((await request(save, { method: "POST" })).status, 400);
    assert.equal(calls.length, 1);
  });
  it("knows which requests are safe to repeat", () => {
    assert.equal(canRetry(save, "POST"), true);
    assert.equal(
      canRetry(`${base}/rest/v1/rpc/planner_get_context`, "POST"),
      true,
    );
    assert.equal(
      canRetry(`${base}/auth/v1/token?grant_type=refresh_token`, "POST"),
      true,
    );
    assert.equal(
      canRetry(`${base}/rest/v1/rpc/planner_create_family`, "POST"),
      false,
    );
    assert.equal(canRetry(`${base}/auth/v1/signup`, "POST"), false);
    assert.equal(canRetry(`${base}/rest/v1/planner_backups?select=id`), true);
  });
});

describe("network errors", () => {
  it("recognises dropped connections in each browser's wording", () => {
    for (const message of [
      "TypeError: Load failed",
      "Failed to fetch",
      "NetworkError when attempting to fetch resource.",
      "fetch failed",
    ])
      assert.equal(isNetworkError({ message }), true, message);
    assert.equal(isNetworkError(new DOMException("x", "AbortError")), true);
    assert.equal(
      isNetworkError({ message: "The updated family data is not valid." }),
      false,
    );
  });
  it("explains them in plain words", () => {
    assert.match(offlineMessage(true), /last saved plans while it retries/);
    assert.match(offlineMessage(false), /offline/);
  });
});

describe("when to tell people about connection problems", () => {
  it("stays quiet during a brief drop, then says so after 15 seconds", () => {
    assert.equal(connectionState(null, 1000, true), "connected");
    assert.equal(connectionState(1000, 1000 + 14999, true), "reconnecting");
    assert.equal(connectionState(1000, 1000 + 15000, true), "offline");
  });
  it("says so straight away when the device itself is offline", () => {
    assert.equal(connectionState(null, 1000, false), "offline");
  });
});
