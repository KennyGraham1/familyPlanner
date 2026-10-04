import webpush from "web-push";
import {
  pushConfiguration,
  pushDatabase,
  validCronAuthorization,
} from "@/lib/push-server";
import { runReminders, type DeliveryStore } from "@/lib/reminders";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  const config = pushConfiguration();
  if (!config)
    return Response.json(
      { error: "Reminders are not configured." },
      { status: 503 },
    );
  if (
    !validCronAuthorization(
      request.headers.get("authorization"),
      config.cronSecret,
    )
  )
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = pushDatabase(config);
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(name, args);
    if (error) throw error;
    return data;
  };
  const store: DeliveryStore = {
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
  };
  try {
    webpush.setVapidDetails(
      config.subject,
      config.publicKey,
      config.privateKey,
    );
    await rpc("planner_clean_deliveries", {});
    const totals = await runReminders(
      {
        devices: async (afterId) =>
          await rpc("planner_push_candidates", {
            after_id: afterId,
            batch_size: 100,
          }),
        households: async (ids) =>
          await rpc("planner_push_households", { family_ids: ids }),
      },
      store,
      async (c, r) => {
        await webpush.sendNotification(
          { endpoint: c.endpoint, keys: { p256dh: c.p256dh, auth: c.auth } },
          JSON.stringify({
            title: r.title,
            body: r.body,
            tag: r.key,
            url: r.url,
          }),
          { TTL: 600, timeout: 5000, urgency: "normal" },
        );
      },
    );
    return Response.json(totals, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Never put push endpoints, keys or family data in responses or deployment logs.
    return Response.json(
      {
        error:
          "Reminder delivery could not finish. The next scheduled run will retry.",
      },
      { status: 503 },
    );
  }
}
