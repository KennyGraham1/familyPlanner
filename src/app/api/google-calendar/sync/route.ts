import { z } from "zod";
import { validCronAuthorization } from "@/lib/push-server";
import {
  authorizeCalendar,
  calendarConfiguration,
  calendarDatabase,
  calendarErrorResponse,
  calendarJson,
  CalendarError,
  getConnection,
} from "@/lib/google-calendar/server";
import { runCalendarSync } from "@/lib/google-calendar/run";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const input = z.object({
  resolve: z
    .object({
      eventId: z.string().min(1).max(100),
      prefer: z.enum(["kinfolk", "google"]),
    })
    .optional(),
});
export async function POST(request: Request) {
  try {
    const auth = await authorizeCalendar(request);
    const body = input.safeParse(await request.json());
    if (!body.success) throw new CalendarError("Invalid sync request.");
    const connection = await getConnection(auth.db, auth.familyId);
    if (!connection?.enabled) return calendarJson({ enabled: false });
    return calendarJson(
      await runCalendarSync(
        auth.config,
        auth.db,
        auth.familyId,
        body.data.resolve,
      ),
    );
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
export async function GET(request: Request) {
  const config = calendarConfiguration(),
    secret = process.env.CRON_SECRET;
  if (!config || !secret || secret.length < 32)
    return calendarJson({ configured: false });
  if (!validCronAuthorization(request.headers.get("authorization"), secret))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  const db = calendarDatabase(config);
  try {
    // Oldest attempted family first: failed or busy families cannot starve others.
    const candidates = await db
      .from("planner_google_connections")
      .select("household_id")
      .eq("enabled", true)
      .or(
        `last_attempt_at.is.null,last_attempt_at.lt.${new Date(Date.now() - 240000).toISOString()}`,
      )
      .order("last_attempt_at", { nullsFirst: true })
      .limit(1);
    if (candidates.error) throw candidates.error;
    let synced = 0;
    for (const candidate of candidates.data) {
      await runCalendarSync(config, db, candidate.household_id);
      synced++;
    }
    return calendarJson({ synced });
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
