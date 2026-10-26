import webpush from "web-push";
import { pushConfiguration, pushDatabase } from "@/lib/push-server";
import { testPhonePush } from "@/lib/push-test";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const config = pushConfiguration();
  if (!config)
    return Response.json(
      { error: "Phone push is not configured on the server yet." },
      { status: 503 },
    );
  const db = pushDatabase(config);
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(name, args);
    if (error) throw error;
    return data;
  };
  webpush.setVapidDetails(config.subject, config.publicKey, config.privateKey);
  return testPhonePush(request, {
    authenticate: async (token) => {
      const { data, error } = await db.auth.getUser(token);
      return error ? null : (data.user?.id ?? null);
    },
    device: async (user, endpoint) => {
      const { data, error } = await db
        .from("planner_push_subscriptions")
        .select("id,endpoint,p256dh,auth")
        .eq("user_id", user)
        .eq("endpoint", endpoint)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    claim: async (device, key) =>
      await rpc("planner_claim_delivery", {
        device_id: device,
        delivery_key: key,
      }),
    finish: async (device, key, token, sent) => {
      await rpc("planner_finish_delivery", {
        device_id: device,
        delivery_key: key,
        token,
        delivered: sent,
      });
    },
    expire: async (device) => {
      await rpc("planner_expire_push", { device_id: device });
    },
    send: async (device, message) => {
      await webpush.sendNotification(
        {
          endpoint: device.endpoint,
          keys: { p256dh: device.p256dh, auth: device.auth },
        },
        JSON.stringify(message),
        { TTL: 60, timeout: 5000, urgency: "high" },
      );
    },
  });
}
