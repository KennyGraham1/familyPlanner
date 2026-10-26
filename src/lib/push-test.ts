import { allowedPushEndpoint } from "./reminders";
export type TestDevice = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};
export type PushTestService = {
  authenticate: (token: string) => Promise<string | null>;
  device: (user: string, endpoint: string) => Promise<TestDevice | null>;
  claim: (device: string, key: string) => Promise<string | null>;
  finish: (
    device: string,
    key: string,
    token: string,
    sent: boolean,
  ) => Promise<void>;
  expire: (device: string) => Promise<void>;
  send: (
    device: TestDevice,
    message: { title: string; body: string; tag: string; url: string },
  ) => Promise<void>;
};
export async function testPhonePush(
  request: Request,
  service: PushTestService,
  now = Date.now(),
) {
  const reply = (body: object, status = 200) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
  const bearer = request.headers
    .get("authorization")
    ?.match(/^Bearer (\S{1,10000})$/)?.[1];
  if (!bearer)
    return reply({ error: "Sign in to your family account first." }, 401);
  let user: string | null = null;
  try {
    user = await service.authenticate(bearer);
  } catch {}
  if (!user)
    return reply(
      { error: "Your sign-in expired. Sign in again and retry." },
      401,
    );
  let endpoint: string;
  try {
    if (Number(request.headers.get("content-length")) > 4096) throw new Error();
    const text = await request.text();
    if (text.length > 4096) throw new Error();
    const body = JSON.parse(text);
    if (
      typeof body.endpoint !== "string" ||
      !allowedPushEndpoint(body.endpoint)
    )
      throw new Error();
    endpoint = body.endpoint;
  } catch {
    return reply(
      { error: "Enable reminders on this device before testing." },
      400,
    );
  }
  try {
    const device = await service.device(user, endpoint);
    if (!device)
      return reply(
        {
          error:
            "This device is not registered to your account. Enable reminders again.",
        },
        404,
      );
    const key = `test:${Math.floor(now / 60000)}`,
      token = await service.claim(device.id, key);
    if (!token)
      return reply(
        {
          error: "A test was recently sent. Wait a minute before trying again.",
        },
        429,
      );
    try {
      await service.send(device, {
        title: "Kinfolk phone notification test",
        body: "This test was sent by your family planner’s server. Check your phone’s notification centre.",
        tag: key,
        url: "/#calendar",
      });
      await service.finish(device.id, key, token, true);
    } catch (error) {
      await service.finish(device.id, key, token, false).catch(() => undefined);
      const code =
        error && typeof error === "object" && "statusCode" in error
          ? error.statusCode
          : null;
      if (code === 404 || code === 410) {
        await service.expire(device.id);
        return reply(
          {
            error:
              "This phone’s push subscription expired. Enable reminders again.",
          },
          410,
        );
      }
      return reply(
        {
          error: "The push service did not accept the test. Try again shortly.",
        },
        503,
      );
    }
    return reply({
      sent: true,
      message:
        "The push service accepted the test. Check your phone’s notification centre.",
    });
  } catch {
    return reply(
      {
        error:
          "Could not send the test. Check the phone reminder setup and try again.",
      },
      503,
    );
  }
}
