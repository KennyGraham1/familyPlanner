import type { FamilyEvent } from "../data";
import {
  eventHash,
  fromGoogle,
  googleEventId,
  importedEventId,
  toGoogle,
  type GoogleEvent,
} from "./events";
import { GoogleError, type CalendarApi } from "./google";

export type EventLink = {
  event_id: string;
  google_id: string;
  local_hash: string | null;
  google_hash: string | null;
};
export type SyncConflict = {
  eventId: string;
  title: string;
  kinfolk: { title: string; date: string; start: string } | null;
  google: { title: string; date: string; start: string } | null;
};
export type SyncResult = {
  uploaded: number;
  downloaded: number;
  removed: number;
  pending: boolean;
  conflicts: SyncConflict[];
  issues: { eventId: string; title: string; reason: string }[];
  reviewed: string[];
};
export type SyncStore = {
  commit(
    eventId: string,
    expected: FamilyEvent | null,
    changeLocal: boolean,
    next: FamilyEvent | null,
    link: EventLink | null,
  ): Promise<boolean>;
};
export function syncDecision(
  local: FamilyEvent | null,
  remote: FamilyEvent | null,
  link: EventLink,
) {
  const localHash = eventHash(local),
    remoteHash = eventHash(remote);
  if (localHash === link.local_hash && remoteHash === link.google_hash)
    return "none";
  if (localHash === remoteHash) return "checkpoint";
  if (localHash !== link.local_hash && remoteHash !== link.google_hash)
    return "conflict";
  return localHash !== link.local_hash ? "push" : "pull";
}
const preview = (event: FamilyEvent | null) =>
  event && {
    title: event.title,
    date: event.date,
    start: event.allDay ? "All day" : event.start,
  };

/** Retries are idempotent: Google IDs are deterministic and each event + checkpoint is atomic. */
export async function syncCalendar({
  api,
  store,
  familyId,
  calendarId,
  timezone,
  memberId,
  events,
  links,
  resolve,
  deadline = Date.now() + 40000,
}: {
  api: CalendarApi;
  store: SyncStore;
  familyId: string;
  calendarId: string;
  timezone: string;
  memberId: string;
  events: FamilyEvent[];
  links: EventLink[];
  resolve?: { eventId: string; prefer: "kinfolk" | "google" };
  deadline?: number;
}): Promise<SyncResult> {
  const result: SyncResult = {
    uploaded: 0,
    downloaded: 0,
    removed: 0,
    pending: false,
    conflicts: [],
    issues: [],
    reviewed: [],
  };
  // Fetch every page before making any changes. Network failures can never look like deletions.
  const remoteEvents = await api.listEvents(calendarId);
  const remoteById = new Map(remoteEvents.map((e) => [e.id, e]));
  const localById = new Map(events.map((e) => [e.id, e]));
  const mappedGoogle = new Set(links.map((l) => l.google_id));
  const mappedLocal = new Set(links.map((l) => l.event_id));
  const exceptions = new Set(
    remoteEvents.flatMap((e) =>
      e.recurringEventId ? [e.recurringEventId] : [],
    ),
  );
  const jobs: {
    link: EventLink;
    remote?: GoogleEvent | null;
    fresh?: boolean;
  }[] = links.map((link) => ({ link: { ...link } }));
  for (const remote of remoteEvents) {
    if (
      mappedGoogle.has(remote.id) ||
      remote.status === "cancelled" ||
      remote.recurringEventId
    )
      continue;
    const props = remote.extendedProperties?.private;
    const owned =
      props?.kinfolkFamily === familyId &&
      props.kinfolkEvent &&
      remote.id === googleEventId(familyId, props.kinfolkEvent + (props.kinfolkGeneration ? `:${props.kinfolkGeneration}` : ""));
    const id = owned
      ? props.kinfolkEvent
      : importedEventId(calendarId, remote.id);
    const baseline =
      owned && /^[a-f0-9]{64}$/.test(props.kinfolkHash ?? "")
        ? props.kinfolkHash
        : null;
    if (mappedLocal.has(id)) {
      // Recover a recreation that reached Google before its local checkpoint saved.
      const prior = jobs.find(j => j.link.event_id === id);
      if (owned && prior && props.kinfolkGeneration === prior.link.google_id && baseline) {
        prior.link = { event_id: id, google_id: remote.id, local_hash: baseline, google_hash: baseline };
        prior.remote = remote;
        prior.fresh = true;
      }
      continue;
    }
    jobs.push({
      link: {
        event_id: id,
        google_id: remote.id,
        local_hash: baseline,
        google_hash: baseline,
      },
      remote,
      fresh: true,
    });
    mappedLocal.add(id);
    mappedGoogle.add(remote.id);
  }
  for (const local of events) {
    if (mappedLocal.has(local.id)) continue;
    jobs.push({
      link: {
        event_id: local.id,
        google_id: googleEventId(familyId, local.id),
        local_hash: null,
        google_hash: null,
      },
      remote: remoteById.get(googleEventId(familyId, local.id)) ?? null,
      fresh: true,
    });
  }
  // Resolve the selected conflict even when a large import needs multiple passes.
  if (resolve) jobs.sort((a, b) => Number(b.link.event_id === resolve.eventId) - Number(a.link.event_id === resolve.eventId));
  let writes = 0;
  let eventCount = events.length;
  for (const job of jobs) {
    if (Date.now() >= deadline || writes >= 40) {
      result.pending = true;
      break;
    }
    const { link } = job;
    result.reviewed.push(link.event_id);
    const local = localById.get(link.event_id) ?? null;
    // A complete snapshot already proves an unchanged tombstone is still absent.
    if (!local && !link.local_hash && !link.google_hash &&
      (!remoteById.has(link.google_id) || remoteById.get(link.google_id)?.status === "cancelled")) continue;
    let google =
      job.remote === undefined
        ? (remoteById.get(link.google_id) ??
          (await api.getEvent(calendarId, link.google_id)))
        : job.remote;
    let remote: FamilyEvent | null = null;
    try {
      if (google && google.status !== "cancelled") {
        if (exceptions.has(google.id))
          throw new Error(
            "This series has individually changed occurrences. Manage it in Google Calendar.",
          );
        remote = fromGoogle(
          google,
          timezone,
          link.event_id,
          memberId,
          local ?? undefined,
        );
      }
    } catch {
      result.issues.push({
        eventId: link.event_id,
        title: local?.title ?? google?.summary ?? "Google event",
        reason:
          "Sync is paused for this event. Custom repeats, changed occurrences, special events or incompatible details must be managed in Google Calendar. Any existing Kinfolk copy may be out of date.",
      });
      // Do not publish local edits over a Google schedule Kinfolk cannot represent.
      continue;
    }
    let decision = syncDecision(local, remote, link);
    if (job.fresh && decision === "none" && local && remote)
      decision = "checkpoint";
    if (decision === "none") continue;
    if (decision === "conflict" && resolve?.eventId === link.event_id)
      decision = resolve.prefer === "kinfolk" ? "push" : "pull";
    if (decision === "conflict") {
      result.conflicts.push({
        eventId: link.event_id,
        title: local?.title ?? remote?.title ?? "Deleted event",
        kinfolk: preview(local),
        google: preview(remote),
      });
      continue;
    }
    try {
      const checkpoint = (
        a: FamilyEvent | null,
        b: FamilyEvent | null,
      ): EventLink => ({
        ...link,
        local_hash: eventHash(a),
        google_hash: eventHash(b),
      });
      if (decision === "checkpoint") {
        await store.commit(
          link.event_id,
          local,
          false,
          local,
          checkpoint(local, remote),
        );
      } else if (decision === "pull") {
        if (!local && remote && eventCount >= 5000) {
          result.issues.push({ eventId: link.event_id, title: remote.title, reason: "Kinfolk has reached its 5,000-event limit. Remove old events to import more." });
          continue;
        }
        const saved = await store.commit(
          link.event_id,
          local,
          true,
          remote,
          checkpoint(remote, remote),
        );
        if (!saved) {
          result.pending = true;
          continue;
        }
        if (remote) result.downloaded++;
        else result.removed++;
        eventCount += Number(!!remote) - Number(!!local);
      } else if (!local) {
        if (google && google.status !== "cancelled") {
          if (!google.etag) throw new Error("Missing event version");
          await api.deleteEvent(calendarId, google.id, google.etag);
        }
        await store.commit(link.event_id, null, false, null, checkpoint(null, null));
        result.removed++;
      } else {
        const generation = (!google || google.status === "cancelled") && (!job.fresh || google?.status === "cancelled")
          ? link.google_id : google?.extendedProperties?.private?.kinfolkGeneration;
        const payload = {
          ...toGoogle(local, timezone),
          extendedProperties: {
            private: {
              ...google?.extendedProperties?.private,
              kinfolkFamily: familyId,
              kinfolkEvent: local.id,
              kinfolkHash: eventHash(local)!,
              ...(generation ? { kinfolkGeneration: generation } : {}),
            },
          },
        };
        if (google && google.status !== "cancelled") {
          if (!google.etag) throw new Error("Missing event version");
          google = await api.patchEvent(
            calendarId,
            google.id,
            payload,
            google.etag,
          );
        } else {
          const insertId = generation ? googleEventId(familyId, `${local.id}:${generation}`) : link.google_id;
          try {
            google = await api.insertEvent(calendarId, {
              id: insertId,
              ...payload,
            });
            link.google_id = insertId;
          } catch (error) {
            // A previous request may have reached Google but not saved its checkpoint.
            // Re-read on the next pass, never overwrite the event returned by a 409.
            if (error instanceof GoogleError && error.status === 409) {
              result.pending = true;
              continue;
            }
            throw error;
          }
        }
        remote = fromGoogle(google, timezone, local.id, memberId, local);
        await store.commit(
          local.id,
          local,
          false,
          local,
          checkpoint(local, remote),
        );
        result.uploaded++;
      }
      writes++;
    } catch (error) {
      if (error instanceof GoogleError && [409, 412].includes(error.status)) {
        result.pending = true;
        continue;
      }
      // Invalid wall-clock times around DST are kept locally for the family to adjust.
      if (error instanceof RangeError) {
        result.issues.push({
          eventId: link.event_id,
          title: local?.title ?? "Event",
          reason:
            "This time is ambiguous or does not exist during a daylight-saving change. Choose another time.",
        });
        continue;
      }
      throw error;
    }
  }
  return result;
}
