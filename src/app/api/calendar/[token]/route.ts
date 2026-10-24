import { createClient } from "@supabase/supabase-js";
import { feedResponse } from "@/lib/calendar-feed";

// Private calendar link for Apple Calendar and other apps: /api/calendar/<token>.ics
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    return new Response("Calendar links aren't set up.", { status: 503 });
  const db = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return feedResponse(token, async (hash) => {
    const { data, error } = await db.rpc("planner_calendar_feed", {
      feed_hash: hash,
    });
    if (error) throw error;
    return data;
  }).catch(
    () =>
      new Response("This calendar can't be read right now.", { status: 503 }),
  );
}
