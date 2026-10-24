import { createHash } from "node:crypto";
import { GOOGLE_SCOPES, googleJson } from "@/lib/google-calendar/google";
import { equalState, seal, unseal } from "@/lib/google-calendar/security";
import {
  calendarConfiguration,
  calendarDatabase,
  getConnection,
  tokenContext,
} from "@/lib/google-calendar/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const config = calendarConfiguration();
  if (!config)
    return new Response("Google Calendar setup is needed.", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  const finish = (result: string) =>
    new Response(null, {
      status: 303,
      headers: {
        Location: `${config.origin}/?googleCalendar=${result}#settings`,
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
        "Set-Cookie": `kinfolk-google-state=; HttpOnly; SameSite=Lax; Path=/api/google-calendar; Max-Age=0${config.origin.startsWith("https:") ? "; Secure" : ""}`,
      },
    });
  try {
    const query = new URL(request.url).searchParams;
    const state = query.get("state") ?? "";
    const cookie =
      request.headers
        .get("cookie")
        ?.split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith("kinfolk-google-state="))
        ?.slice("kinfolk-google-state=".length) ?? "";
    if (!/^[A-Za-z0-9_-]{43}$/.test(state) || !equalState(state, cookie))
      return finish("expired");
    const hash = createHash("sha256").update(state).digest("hex");
    const db = calendarDatabase(config);
    // DELETE RETURNING consumes state exactly once, including parallel callback requests.
    const consumed = await db
      .from("planner_google_oauth")
      .delete()
      .eq("state_hash", hash)
      .gt("expires_at", new Date().toISOString())
      .select("*")
      .maybeSingle();
    if (consumed.error || !consumed.data) return finish("expired");
    if (query.get("error")) return finish("cancelled");
    const code = query.get("code");
    if (!code || code.length > 4096) return finish("failed");
    const stateData = consumed.data;
    const { data: family } = await db
      .from("planner_households")
      .select("owner_id")
      .eq("id", stateData.household_id)
      .single();
    if (!family || family.owner_id !== stateData.user_id)
      return finish("expired");
    const verifier = unseal(
      stateData.encrypted_verifier,
      config.encryptionKey,
      `oauth:${hash}`,
    );
    const tokens = await googleJson("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
    });
    const granted = new Set(String(tokens.scope ?? "").split(" "));
    if (
      GOOGLE_SCOPES.filter((s) => s.startsWith("https:")).some(
        (s) => !granted.has(s),
      )
    )
      return finish("permissions");
    if (typeof tokens.access_token !== "string") return finish("failed");
    const identity = await googleJson(
      "https://openidconnect.googleapis.com/v1/userinfo",
      { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    );
    if (typeof identity.sub !== "string" || typeof identity.email !== "string")
      return finish("failed");
    const existing = await getConnection(db, stateData.household_id);
    if (
      existing &&
      (existing.google_account_id !== identity.sub ||
        existing.user_id !== stateData.user_id)
    )
      return finish("different-account");
    if (
      existing?.lease_until &&
      new Date(existing.lease_until).getTime() > Date.now()
    )
      return finish("busy");
    const encryptedToken =
      typeof tokens.refresh_token === "string"
        ? seal(
            tokens.refresh_token,
            config.encryptionKey,
            tokenContext(stateData.household_id, stateData.user_id),
          )
        : existing?.encrypted_token;
    if (!encryptedToken) return finish("permissions");
    const saved = await db.from("planner_google_connections").upsert(
      {
        household_id: stateData.household_id,
        user_id: stateData.user_id,
        google_account_id: identity.sub,
        account_email: identity.email,
        encrypted_token: encryptedToken,
        enabled: !!existing?.calendar_id,
        last_error: null,
      },
      { onConflict: "household_id" },
    );
    if (saved.error) return finish("failed");
    return finish("connected");
  } catch {
    return finish("failed");
  }
}
