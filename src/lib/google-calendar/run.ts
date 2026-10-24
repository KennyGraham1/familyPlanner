import { dataSchema } from "../data";
import { syncCalendar, type EventLink } from "./sync";
import {
  CalendarError,
  getConnection,
  googleForConnection,
  type CalendarConfig,
  type CalendarDatabase,
} from "./server";

export async function runCalendarSync(
  config: CalendarConfig,
  db: CalendarDatabase,
  familyId: string,
  resolve?: { eventId: string; prefer: "kinfolk" | "google" },
) {
  const { data: token, error: claimError } = await db.rpc(
    "planner_google_claim",
    { family_id: familyId },
  );
  if (claimError)
    throw new CalendarError("Google Calendar database setup is needed.", 503);
  if (!token) return { busy: true };
  try {
    const connection = await getConnection(db, familyId);
    if (!connection?.enabled || !connection.calendar_id || !connection.timezone)
      return { enabled: false };
    const { data: family, error } = await db
      .from("planner_households")
      .select("data,owner_id")
      .eq("id", familyId)
      .single();
    if (error || !family || family.owner_id !== connection.user_id)
      throw new CalendarError(
        "The family owner needs to reconnect Google Calendar.",
        409,
      );
    const document = dataSchema.parse(family.data);
    const memberId =
      document.members.find((m) => m.id === connection.member_id)?.id ??
      document.members[0].id;
    const links: EventLink[] = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await db
        .from("planner_google_events")
        .select("event_id,google_id,local_hash,google_hash")
        .eq("household_id", familyId)
        .order("event_id")
        .range(offset, offset + 999);
      if (page.error) throw page.error;
      links.push(...page.data);
      if (page.data.length < 1000) break;
    }
    const api = await googleForConnection(config, connection);
    const result = await syncCalendar({
      api,
      familyId,
      calendarId: connection.calendar_id,
      timezone: connection.timezone,
      memberId,
      events: document.events,
      links,
      resolve,
      store: {
        commit: async (eventId, expected, changeLocal, next, link) => {
          const saved = await db.rpc("planner_google_commit", {
            family_id: familyId,
            token,
            local_id: eventId,
            expected_local: expected,
            change_local: changeLocal,
            next_local: next,
            link,
          });
          if (saved.error) throw saved.error;
          return !!saved.data;
        },
      },
    });
    const { reviewed, ...summary } = result;
    const visited = new Set(reviewed);
    // A bounded pass must not hide conflicts it has not reached yet.
    const conflicts = result.pending ? [...result.conflicts, ...connection.conflicts.filter(c => !visited.has(c.eventId))] : result.conflicts;
    const issues = result.pending ? [...result.issues, ...connection.issues.filter(i => !visited.has(i.eventId))] : result.issues;
    const saved = await db
      .from("planner_google_connections")
      .update({
        ...(!result.pending
          ? { last_synced_at: new Date().toISOString() }
          : {}),
        last_error: result.pending
          ? "More changes are waiting. The next sync will continue."
          : null,
        issues: issues.slice(0, 100),
        conflicts: conflicts.slice(0, 100),
      })
      .eq("household_id", familyId)
      .eq("lease_token", token);
    if (saved.error) throw saved.error;
    return summary;
  } catch (error) {
    const message =
      error instanceof CalendarError
        ? error.message
        : "Sync could not finish. Your changes are kept and the next sync will retry.";
    await db
      .from("planner_google_connections")
      .update({ last_error: message })
      .eq("household_id", familyId)
      .eq("lease_token", token);
    throw error;
  } finally {
    await db
      .from("planner_google_connections")
      .update({ lease_token: null, lease_until: null })
      .eq("household_id", familyId)
      .eq("lease_token", token);
  }
}
