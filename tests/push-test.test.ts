import { it } from "node:test";
import assert from "node:assert/strict";
import { testPhonePush, type PushTestService } from "../src/lib/push-test";
const endpoint = "https://web.push.apple.com/test-device";
function fake() {
  const sent: unknown[] = [],
    finished: boolean[] = [];
  let expired = false;
  const service: PushTestService = {
    authenticate: async (token) => (token === "valid" ? "person" : null),
    device: async (user, url) =>
      user === "person" && url === endpoint
        ? { id: "device", endpoint, p256dh: "key", auth: "key" }
        : null,
    claim: async () => "claim",
    finish: async (_d, _k, _t, ok) => {
      finished.push(ok);
    },
    expire: async () => {
      expired = true;
    },
    send: async (device, message) => {
      sent.push({ device, message });
    },
  };
  return { service, sent, finished, isExpired: () => expired };
}
const request = (url = endpoint, token = "valid") =>
  new Request("https://example.test/api/push/test", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ endpoint: url }),
  });
it("sends a test through the push provider to the signed-in person's saved phone", async () => {
  const f = fake();
  const response = await testPhonePush(request(), f.service);
  assert.equal(response.status, 200);
  assert.equal(f.sent.length, 1);
  assert.deepEqual(f.finished, [true]);
  assert.equal((await response.json()).sent, true);
});
it("does not send to unsigned-in users, unregistered devices, or arbitrary endpoints", async () => {
  const f = fake();
  assert.equal(
    (await testPhonePush(request(endpoint, "invalid"), f.service)).status,
    401,
  );
  assert.equal(
    (
      await testPhonePush(
        request("https://web.push.apple.com/someone-else"),
        f.service,
      )
    ).status,
    404,
  );
  assert.equal(
    (await testPhonePush(request("https://example.test/internal"), f.service))
      .status,
    400,
  );
  assert.equal(f.sent.length, 0);
});
it("limits repeated tests and cleans expired push subscriptions", async () => {
  const f = fake();
  f.service.claim = async () => null;
  assert.equal((await testPhonePush(request(), f.service)).status, 429);
  f.service.claim = async () => "claim";
  f.service.send = async () => {
    throw { statusCode: 410 };
  };
  assert.equal((await testPhonePush(request(), f.service)).status, 410);
  assert.equal(f.isExpired(), true);
  assert.deepEqual(f.finished, [false]);
});
