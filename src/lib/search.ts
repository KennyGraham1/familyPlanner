import {
  allRecipes,
  dateKey,
  startsOn,
  occurrenceOn,
  fromKey,
  formatDate,
  shiftDate,
  startOfWeek,
  type FamilyEvent,
  type PlannerData,
} from "./data";
import { familyDate } from "./planning";
import { matchScore, normalizeSearch } from "./text-search";
export { matchScore, normalizeSearch } from "./text-search";
export type SearchKind =
  | "Calendar"
  | "Recipes"
  | "Chores"
  | "Shopping"
  | "Notes"
  | "Routines"
  | "Pantry"
  | "Spending";
export type SearchEntry = {
  id: string;
  kind: SearchKind;
  title: string;
  detail: string;
  text: string;
  people: string;
  date?: string;
  done?: boolean;
};
const calendarDetail = (event: FamilyEvent, day: string) =>
  `Calendar · ${formatDate(day)}${event.location ? ` · ${event.location}` : ""}`;

export function buildSearchIndex(data: PlannerData, now = new Date()) {
  const today = familyDate(data, now);
  const memberNames = new Map(data.members.map((m) => [m.id, m.name]));
  const people = (ids: string[]) =>
    [...new Set(ids)].map((id) => memberNames.get(id) ?? "").join(" ");
  const eventText = new Map<string, string[]>();
  for (const item of [...(data.comments ?? []), ...(data.eventLinks ?? [])]) {
    const words = eventText.get(item.eventId) ?? [];
    words.push("body" in item ? item.body : item.name);
    eventText.set(item.eventId, words);
  }
  const favourites = new Set(
    data.recipePrefs?.filter((p) => p.favourite).map((p) => p.recipeId),
  );
  const upcoming = new Map<string, string>();
  for (const event of data.events) {
    if (occurrenceOn(event, today)) {
      upcoming.set(event.id, today);
      continue;
    }
    if (event.repeat === "none") {
      if (event.date >= today && startsOn(event, event.date))
        upcoming.set(event.id, event.date);
      continue;
    }
    const start = event.date > today ? event.date : today;
    for (let i = 0; i < 367; i++) {
      const day = shiftDate(start, i);
      if (event.until && day > event.until) break;
      if (startsOn(event, day)) {
        upcoming.set(event.id, day);
        break;
      }
    }
  }
  const entries: SearchEntry[] = [
    ...data.events.map((e) => ({
      id: e.id,
      kind: "Calendar" as const,
      title: e.title,
      detail: calendarDetail(e, upcoming.get(e.id) ?? e.date),
      text: [
        e.notes,
        e.location,
        e.category,
        ...(e.checklist ?? []).map((s) => s.title),
        ...(eventText.get(e.id) ?? []),
      ].join(" "),
      people: people([
        ...e.memberIds,
        e.pickupMemberId ?? "",
        e.dropOffMemberId ?? "",
      ]),
      date: upcoming.get(e.id) ?? e.date,
    })),
    ...allRecipes(data).map((r) => ({
      id: r.id,
      kind: "Recipes" as const,
      title: r.name,
      detail: `Recipe · ${r.time} min${r.cuisine ? ` · ${r.cuisine}` : ""}`,
      text: [
        r.subtitle,
        r.cuisine,
        r.category,
        r.region,
        r.diet,
        r.lighter ? "lighter healthy weight loss weight management" : "",
        favourites.has(r.id) ? "favourite" : "",
        ...r.ingredients.map((i) => i.name),
      ].join(" "),
      people: "",
    })),
    ...data.tasks.map((t) => ({
      id: t.id,
      kind: "Chores" as const,
      title: t.title,
      detail: `Chore · ${people([t.memberId])} · ${t.done ? "Done" : t.due < today ? "Overdue" : formatDate(t.due)}`,
      text: t.priority,
      people: people([t.memberId]),
      date: t.due,
      done: t.done,
    })),
    ...data.shopping.map((s) => ({
      id: s.id,
      kind: "Shopping" as const,
      title: s.name,
      detail: `Shopping · ${s.category} · ${s.quantity}`,
      text: s.category,
      people: "",
      done: s.done,
    })),
    ...data.notes.map((n) => ({
      id: n.id,
      kind: "Notes" as const,
      title: n.title,
      detail: "Family board",
      text: n.body,
      people: people([n.memberId]),
    })),
    ...(data.routines ?? []).map((r) => ({
      id: r.id,
      kind: "Routines" as const,
      title: r.title,
      detail: `Routine · ${people([r.memberId])} · ${r.period}`,
      text: r.steps.map((s) => s.title).join(" "),
      people: people([r.memberId]),
    })),
    ...(data.pantry ?? []).map((p) => ({
      id: p.id,
      kind: "Pantry" as const,
      title: p.name,
      detail: `Pantry · ${p.quantity}${p.useBy ? ` · Use by ${formatDate(p.useBy)}` : ""}`,
      text: p.category,
      people: "",
    })),
    ...(data.expenses ?? []).map((e) => ({
      id: e.id,
      kind: "Spending" as const,
      title: e.title,
      detail: `Spending · $${(e.cents / 100).toFixed(2)} · ${formatDate(e.date)}`,
      text: e.category,
      people: people([e.memberId]),
      date: e.date,
    })),
  ];
  return entries;
}
export function plannerSearch(
  data: PlannerData,
  query: string,
  kind: SearchKind | "All" = "All",
  now = new Date(),
  index?: SearchEntry[],
) {
  const today = familyDate(data, now);
  const entries = index ?? buildSearchIndex(data, now);
  let q = normalizeSearch(query);
  let from: string | undefined, to: string | undefined;
  if (/\btomorrow\b/.test(q)) {
    from = to = shiftDate(today, 1);
    q = q.replace(/\btomorrow\b/g, "");
  } else if (/\btoday\b/.test(q)) {
    from = to = today;
    q = q.replace(/\btoday\b/g, "");
  } else if (/\bthis week\b/.test(q)) {
    from = dateKey(startOfWeek(fromKey(today), data.settings.weekStartsMonday));
    to = shiftDate(from, 6);
    q = q.replace(/\bthis week\b/g, "");
  }
  const overdue = /\boverdue\b/.test(q);
  q = q.replace(/\boverdue\b/g, "");
  const aliases: Record<string, SearchKind> = {
    event: "Calendar",
    events: "Calendar",
    calendar: "Calendar",
    recipe: "Recipes",
    meal: "Recipes",
    recipes: "Recipes",
    chore: "Chores",
    task: "Chores",
    chores: "Chores",
    tasks: "Chores",
    shopping: "Shopping",
    notes: "Notes",
    routines: "Routines",
    pantry: "Pantry",
    spending: "Spending",
  };
  let requested = kind;
  const first = q.trim().split(" ")[0];
  if (aliases[first]) {
    requested = aliases[first];
    q = q.trim().slice(first.length).trim();
  }
  const matchingEvents = new Map<string, { date: string; detail: string }>();
  if (from) {
    const days = Array.from({ length: 7 }, (_, i) => shiftDate(from, i)).filter(
      (day) => day <= to!,
    );
    for (const event of data.events) {
      const day = days.find((day) => occurrenceOn(event, day));
      if (day)
        matchingEvents.set(event.id, {
          date: day,
          detail: calendarDetail(event, day),
        });
    }
  }
  return entries
    .filter(
      (e) =>
        (requested === "All" || e.kind === requested) &&
        (!from ||
          (e.kind === "Calendar"
            ? matchingEvents.has(e.id)
            : e.date && e.date >= from && e.date <= to!)) &&
        (!overdue || (e.kind === "Chores" && !e.done && e.date! < today)),
    )
    .map((entry) => ({
      ...entry,
      ...(entry.kind === "Calendar" ? matchingEvents.get(entry.id) : {}),
      score: matchScore(
        entry.title,
        `${entry.text} ${entry.people} ${entry.kind}`,
        q,
      ),
    }))
    .filter((r) => r.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(a.done ?? false) - Number(b.done ?? false) ||
        a.title.localeCompare(b.title),
    );
}
