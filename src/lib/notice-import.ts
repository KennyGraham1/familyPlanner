import { dateSchema, fromKey, shiftDate, type FamilyEvent } from "./data";
export type NoticeDraft = {
  title: string;
  date: string;
  start: string;
  end: string;
  location: string;
  source: string;
  warning: string;
};
const months = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];
export function parseNotice(text: string, reference: string): NoticeDraft[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 100)
    .flatMap((source) => {
      let date = "",
        matched = "",
        warning = "";
      const iso = source.match(/\b(\d{4}-\d{2}-\d{2})\b/),
        numeric = source.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/),
        named = source.match(
          /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})\b/i,
        );
      if (iso) {
        date = iso[1];
        matched = iso[0];
      } else if (numeric) {
        date = `${numeric[3]}-${numeric[2].padStart(2, "0")}-${numeric[1].padStart(2, "0")}`;
        matched = numeric[0];
      } else if (named) {
        date = `${named[3]}-${String(months.indexOf(named[2].slice(0, 3).toLowerCase()) + 1).padStart(2, "0")}-${named[1].padStart(2, "0")}`;
        matched = named[0];
      } else {
        const relative = source.match(
          /\b(today|tomorrow|next\s+(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday))\b/i,
        );
        if (relative) {
          matched = relative[0];
          const value = relative[1].toLowerCase();
          date =
            value === "today"
              ? reference
              : value === "tomorrow"
                ? shiftDate(reference, 1)
                : shiftDate(
                    reference,
                    ([
                      "sunday",
                      "monday",
                      "tuesday",
                      "wednesday",
                      "thursday",
                      "friday",
                      "saturday",
                    ].indexOf(relative[2].toLowerCase()) -
                      fromKey(reference).getDay() +
                      7) %
                      7 || 7,
                  );
          warning =
            "Relative date inferred from your family date; please check it.";
        }
      }
      if (!date) return [];
      if (!dateSchema.safeParse(date).success)
        return [
          {
            title: source.slice(0, 150),
            date: "",
            start: "",
            end: "",
            location: "",
            source,
            warning: "The date is invalid. Choose the correct date.",
          },
        ];
      const times = [
        ...source
          .replace(matched, "")
          .matchAll(
            /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|\b([01]\d|2[0-3]):([0-5]\d)\b/gi,
          ),
      ];
      const time = (m: RegExpMatchArray) =>
        m[4]
          ? `${m[4]}:${m[5]}`
          : `${String((Number(m[1]) % 12) + (m[3].toLowerCase() === "pm" ? 12 : 0)).padStart(2, "0")}:${m[2] ?? "00"}`;
      const valid = times.filter(
        (m) =>
          m[4] ||
          (Number(m[1]) >= 1 && Number(m[1]) <= 12 && Number(m[2] ?? 0) < 60),
      );
      const start = valid[0] ? time(valid[0]) : "",
        end = valid[1] ? time(valid[1]) : "";
      let title = source.replace(matched, "");
      for (const t of times) title = title.replace(t[0], "");
      title = title
        .replace(/\b(at|from|until|to|on)\b/gi, " ")
        .replace(/[|–—]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/^[,:\-\s]+|[,:\-\s]+$/g, "");
      return [
        {
          title: title.slice(0, 150) || "School event",
          date,
          start,
          end,
          location: "",
          source,
          warning: [
            warning,
            ...(!start || !end
              ? ["Choose start and end times, or mark all day."]
              : []),
          ]
            .filter(Boolean)
            .join(" "),
        },
      ];
    });
}
export function duplicateNotice(
  draft: Pick<NoticeDraft, "title" | "date" | "start">,
  events: FamilyEvent[],
) {
  return events.some(
    (e) =>
      e.title.trim().toLowerCase() === draft.title.trim().toLowerCase() &&
      e.date === draft.date &&
      (e.allDay || e.start === draft.start),
  );
}
