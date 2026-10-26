import {
  applyMutation,
  type Feature,
  type Mutation,
  type PlannerData,
  type RecordItem,
} from "./data";
export function changeSummary(
  item: RecordItem | undefined,
  data?: PlannerData,
) {
  if (!item) return "";
  const name = (id: string) =>
    data?.members.find((m) => m.id === id)?.name ?? id;
  if ("start" in item)
    return `${item.title} · ${item.date} · ${item.allDay ? "All day" : `${item.start}–${item.end}`}${item.location ? ` · ${item.location}` : ""}${item.dropOffMemberId ? ` · Drop-off: ${name(item.dropOffMemberId)}` : ""}${item.pickupMemberId ? ` · Pickup: ${name(item.pickupMemberId)}` : ""}${item.excludedDates?.length ? ` · Skipped: ${item.excludedDates.join(", ")}` : ""}${item.excludedRanges?.length ? ` · Holidays: ${item.excludedRanges.map((r) => `${r.start}–${r.end}`).join(", ")}` : ""}`.slice(
      0,
      500,
    );
  if ("done" in item && "title" in item)
    return `${item.title} · ${item.done ? "Done" : "To do"}`;
  if ("body" in item) return item.body.slice(0, 500);
  return ("title" in item ? item.title : "name" in item ? item.name : "").slice(
    0,
    500,
  );
}
/** Local history is labelled device-originated; shared audit authors are assigned in SQL. */
export function withLocalActivity(
  data: PlannerData,
  changes: Mutation[],
  actorMemberId: string,
  now = new Date(),
): Mutation[] {
  let current = data;
  const activity: Feature<"activity">[] = [];
  for (const change of changes) {
    if (change.action === "settings" || change.collection === "activity")
      continue;
    const id = change.action === "upsert" ? change.value.id : change.id;
    const old = (current[change.collection] as RecordItem[] | undefined)?.find(
      (r) => r.id === id,
    );
    const next = change.action === "upsert" ? change.value : undefined;
    if (
      ["events", "tasks", "comments"].includes(change.collection) &&
      changeSummary(old, current) !== changeSummary(next, current)
    ) {
      const record = next ?? old;
      const title =
        record &&
        ("title" in record
          ? record.title
          : "body" in record
            ? "Event discussion"
            : "Family update");
      const members =
        record &&
        ("memberIds" in record
          ? record.memberIds
          : "memberId" in record
            ? [record.memberId]
            : []);
      activity.push({
        id: crypto.randomUUID(),
        actorId: actorMemberId,
        actorMemberId,
        actorName:
          data.members.find((m) => m.id === actorMemberId)?.name ??
          "Family member",
        createdAt: now.toISOString(),
        collection: change.collection,
        recordId:
          change.collection === "comments" && record && "eventId" in record
            ? record.eventId
            : id,
        title: title || "Family update",
        before: changeSummary(old, current),
        after: changeSummary(next, current),
        memberIds: [
          ...new Set([
            ...(members ?? []),
            ...(record && "pickupMemberId" in record
              ? [
                  record.pickupMemberId ?? "",
                  record.dropOffMemberId ?? "",
                ].filter(Boolean)
              : []),
          ]),
        ],
        source: "device",
      });
    }
    current = applyMutation(current, change);
  }
  const result = [...changes];
  for (const entry of activity)
    result.push({ collection: "activity", action: "upsert", value: entry });
  const remove = Math.max(
    0,
    (data.activity?.length ?? 0) + activity.length - 200,
  );
  for (const entry of (data.activity ?? []).slice(0, remove))
    result.push({ collection: "activity", action: "remove", id: entry.id });
  return result;
}
