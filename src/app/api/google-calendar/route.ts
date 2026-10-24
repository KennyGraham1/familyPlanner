import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { GOOGLE_SCOPES } from "@/lib/google-calendar/google";
import { seal } from "@/lib/google-calendar/security";
import {
  authorizeCalendar,
  calendarConfiguration,
  calendarErrorResponse,
  calendarJson,
  CalendarError,
  getConnection,
  googleForConnection,
} from "@/lib/google-calendar/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const input = z.discriminatedUnion("action", [
  z.object({ action: z.literal("connect") }),
  z.object({
    action: z.literal("select"),
    calendarId: z.string().min(1).max(1024),
    memberId: z.string().min(1).max(100),
  }),
  z.object({ action: z.literal("disconnect") }),
]);
export async function GET(request: Request) {
  if (!calendarConfiguration()) return calendarJson({ configured: false });
  try {
    const { config, db, familyId, isOwner, userId, ownerId } =
      await authorizeCalendar(request);
    const connection = await getConnection(db, familyId);
    const mine = connection?.user_id === userId;
    const connected = !!connection?.encrypted_token;
    const calendars =
      isOwner && mine && connected && !connection.calendar_id
        ? (
            await (await googleForConnection(config, connection)).calendars()
          ).map((c) => ({
            id: c.id,
            name: c.summary,
            timezone: c.timeZone,
            primary: !!c.primary,
          }))
        : [];
    return calendarJson({
      configured: true,
      connected,
      enabled: !!connection?.enabled && connection.user_id === ownerId,
      canManage: isOwner,
      email: connection?.account_email,
      calendarName: connection?.calendar_name,
      timezone: connection?.timezone,
      lastSynced: connection?.last_synced_at,
      error: connection && connection.user_id !== ownerId ? "Disconnect the previous owner’s Google Calendar, then connect your own." : connection?.last_error,
      issues: connection?.issues ?? [],
      conflicts: connection?.conflicts ?? [],
      calendars,
      backgroundSync: !!process.env.CRON_SECRET,
    });
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const { config, db, userId, familyId, data } = await authorizeCalendar(
      request,
      true,
    );
    const parsed = input.safeParse(await request.json());
    if (!parsed.success)
      throw new CalendarError("Choose a valid calendar action.");
    const body = parsed.data;
    const connection = await getConnection(db, familyId);
    if (connection && connection.user_id !== userId && body.action !== "disconnect")
      throw new CalendarError(
        "Disconnect the previous owner’s Google Calendar, then connect your own.",
        409,
      );
    if (body.action === "connect") {
      if (
        connection?.lease_until &&
        new Date(connection.lease_until).getTime() > Date.now()
      )
        throw new CalendarError(
          "A sync is running. Try again in a moment.",
          409,
        );
      const state = randomBytes(32).toString("base64url");
      const verifier = randomBytes(48).toString("base64url");
      const stateHash = createHash("sha256").update(state).digest("hex");
      await db
        .from("planner_google_oauth")
        .delete()
        .lt("expires_at", new Date().toISOString());
      const saved = await db
        .from("planner_google_oauth")
        .insert({
          state_hash: stateHash,
          household_id: familyId,
          user_id: userId,
          encrypted_verifier: seal(
            verifier,
            config.encryptionKey,
            `oauth:${stateHash}`,
          ),
          expires_at: new Date(Date.now() + 600000).toISOString(),
        });
      if (saved.error) throw saved.error;
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: "code",
        scope: GOOGLE_SCOPES.join(" "),
        state,
        access_type: "offline",
        prompt: "consent",
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256",
      });
      const response = calendarJson({
        url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
      });
      response.headers.set(
        "Set-Cookie",
        `kinfolk-google-state=${state}; HttpOnly; SameSite=Lax; Path=/api/google-calendar; Max-Age=600${config.origin.startsWith("https:") ? "; Secure" : ""}`,
      );
      return response;
    }
    if (!connection) throw new CalendarError("Connect Google Calendar first.");
    if (body.action === "disconnect") {
      const result = await db.rpc("planner_google_disconnect", {
        family_id: familyId,
        account_id: userId,
      });
      if (result.error) throw result.error;
      if (!result.data)
        throw new CalendarError(
          "A sync is running. Try disconnecting again in a moment.",
          409,
        );
      return calendarJson({ disconnected: true });
    }
    if (connection.calendar_id && connection.calendar_id !== body.calendarId)
      throw new CalendarError(
        "This family is already linked to a different calendar.",
        409,
      );
    if (!data.members.some((m) => m.id === body.memberId))
      throw new CalendarError("Choose a family member for imported events.");
    const google = await googleForConnection(config, connection);
    const calendar = await google.calendar(body.calendarId);
    if (!["owner", "writer"].includes(calendar.accessRole))
      throw new CalendarError("Choose a calendar you can edit.");
    try {
      new Intl.DateTimeFormat("en", { timeZone: calendar.timeZone }).format();
    } catch {
      throw new CalendarError(
        "This calendar needs a valid time zone in Google Calendar.",
      );
    }
    const saved = await db
      .from("planner_google_connections")
      .update({
        calendar_id: calendar.id,
        calendar_name: calendar.summary,
        timezone: calendar.timeZone,
        member_id: body.memberId,
        enabled: true,
        last_error: null,
      })
      .eq("household_id", familyId)
      .eq("user_id", userId);
    if (saved.error)
      throw new CalendarError(
        "This calendar could not be linked. It may already be linked to another family.",
        409,
      );
    return calendarJson({ enabled: true });
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
