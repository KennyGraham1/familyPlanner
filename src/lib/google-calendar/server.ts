import { createClient } from "@supabase/supabase-js";
import { dataSchema } from "../data";
import { GoogleApi, GoogleError, googleJson } from "./google";
import { unseal } from "./security";
import type { SyncConflict, SyncResult } from "./sync";

export class CalendarError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
export function calendarConfiguration() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  const encryptionKey = Buffer.from(
    process.env.GOOGLE_CALENDAR_ENCRYPTION_KEY ?? "",
    "base64",
  );
  if (
    !url ||
    !key ||
    !clientId ||
    !clientSecret ||
    !redirectUri ||
    encryptionKey.length !== 32
  )
    return null;
  try {
    const redirect = new URL(redirectUri);
    if (
      redirect.pathname !== "/api/google-calendar/callback" ||
      redirect.search ||
      redirect.hash ||
      redirect.username ||
      redirect.password
    )
      return null;
    if (
      redirect.protocol !== "https:" &&
      !(redirect.protocol === "http:" && redirect.hostname === "localhost")
    )
      return null;
    return {
      url,
      key,
      clientId,
      clientSecret,
      redirectUri,
      encryptionKey,
      origin: redirect.origin,
    };
  } catch {
    return null;
  }
}
export type CalendarConfig = NonNullable<
  ReturnType<typeof calendarConfiguration>
>;
export const calendarDatabase = (config: CalendarConfig) =>
  createClient(config.url, config.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
export type CalendarDatabase = ReturnType<typeof calendarDatabase>;
export const tokenContext = (family: string, user: string) =>
  `kinfolk-google:${family}:${user}`;
export type Connection = {
  household_id: string;
  user_id: string;
  google_account_id: string;
  account_email: string;
  encrypted_token: string | null;
  calendar_id: string | null;
  calendar_name: string | null;
  timezone: string | null;
  member_id: string | null;
  enabled: boolean;
  last_synced_at: string | null;
  last_attempt_at: string | null;
  last_error: string | null;
  issues: SyncResult["issues"];
  conflicts: SyncConflict[];
  lease_token: string | null;
  lease_until: string | null;
};
export async function getConnection(
  db: CalendarDatabase,
  family: string,
): Promise<Connection | null> {
  const { data, error } = await db
    .from("planner_google_connections")
    .select("*")
    .eq("household_id", family)
    .maybeSingle();
  if (error)
    throw new CalendarError("Google Calendar database setup is needed.", 503);
  return data;
}
export async function authorizeCalendar(request: Request, ownerOnly = false) {
  const config = calendarConfiguration();
  if (!config) throw new CalendarError("Google Calendar setup is needed.", 503);
  const bearer = request.headers.get("authorization");
  if (!bearer?.startsWith("Bearer "))
    throw new CalendarError("Sign in to connect your family calendar.", 401);
  const db = calendarDatabase(config);
  const { data: auth, error } = await db.auth.getUser(bearer.slice(7));
  if (error || !auth.user)
    throw new CalendarError("Please sign in again.", 401);
  const { data: member, error: memberError } = await db
    .from("planner_memberships")
    .select("household_id,member_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (memberError || !member)
    throw new CalendarError("Join a family before linking a calendar.", 403);
  const { data: family, error: familyError } = await db
    .from("planner_households")
    .select("id,owner_id,data")
    .eq("id", member.household_id)
    .single();
  if (familyError || !family)
    throw new CalendarError("This family space is unavailable.", 403);
  const isOwner = family.owner_id === auth.user.id;
  if (ownerOnly && !isOwner)
    throw new CalendarError(
      "Only the family owner can change the Google Calendar connection.",
      403,
    );
  return {
    config,
    db,
    userId: auth.user.id,
    familyId: family.id as string,
    isOwner,
    ownerId: family.owner_id as string,
    memberId: member.member_id as string | null,
    data: dataSchema.parse(family.data),
  };
}
export async function googleForConnection(
  config: CalendarConfig,
  connection: Connection,
) {
  if (!connection.encrypted_token)
    throw new CalendarError("Reconnect Google Calendar to continue.", 409);
  let refresh: string;
  try {
    refresh = unseal(
      connection.encrypted_token,
      config.encryptionKey,
      tokenContext(connection.household_id, connection.user_id),
    );
  } catch {
    throw new CalendarError("Reconnect Google Calendar to continue.", 409);
  }
  try {
    const tokens = await googleJson("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        refresh_token: refresh,
        grant_type: "refresh_token",
      }),
    });
    if (typeof tokens.access_token !== "string")
      throw new Error("Missing Google access token");
    return new GoogleApi(tokens.access_token);
  } catch (error) {
    if (error instanceof GoogleError && [400, 401].includes(error.status))
      throw new CalendarError(
        "Google access has expired. Reconnect Google Calendar.",
        409,
      );
    throw error;
  }
}
export function calendarErrorResponse(error: unknown) {
  return Response.json(
    {
      error:
        error instanceof CalendarError
          ? error.message
          : "Google Calendar could not finish this request. Please try again.",
    },
    {
      status: error instanceof CalendarError ? error.status : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
export const calendarJson = (value: unknown) =>
  Response.json(value, { headers: { "Cache-Control": "no-store" } });
