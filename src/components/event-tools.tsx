"use client";
import { useState } from "react";
import {
  dateKey,
  formatDate,
  occurrenceOn,
  shiftDate,
  daysBetween,
  uid,
  featureSchemas,
  type FamilyEvent,
} from "@/lib/data";
import { usePlanner } from "./planner-provider";
import { Field } from "./ui";
import type { Editor } from "./forms";

export function EventResponsibilities({ event }: { event: FamilyEvent }) {
  const { data } = usePlanner();
  if (!event.dropOffMemberId && !event.pickupMemberId) return null;
  const name = (id?: string) =>
    data.members.find((m) => m.id === id)?.name ?? "Unassigned";
  return (
    <small className="event-responsibilities">
      Drop-off: {name(event.dropOffMemberId)} · Pickup:{" "}
      {name(event.pickupMemberId)}
    </small>
  );
}
export function EventCollaboration({
  event: initial,
  day: initialDay,
  open,
}: {
  event: FamilyEvent;
  day?: string;
  open: (editor: Editor) => void;
}) {
  const { data, apply, applyWithUndo, currentMemberId, notify } = usePlanner();
  const event = data.events.find((e) => e.id === initial.id) ?? initial;
  const today = dateKey(new Date());
  const [day, setDay] = useState(
    initialDay ?? (occurrenceOn(event, today) ? today : event.date),
  );
  const [scope, setScope] = useState("day");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const occurrence = occurrenceOn(event, day);
  const key = occurrence?.start ?? day;
  const done = event.checklistDone?.[key] ?? [];
  const comments = (data.comments ?? []).filter(
    (c) =>
      (c.eventId === event.id && (!c.day || c.day === key)) ||
      (c.eventId === event.origin?.eventId &&
        (!c.day || c.day === event.origin.day)),
  );
  async function comment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    setBusy(true);
    if (
      await apply({
        collection: "comments",
        action: "upsert",
        value: {
          id: uid(),
          eventId: event.id,
          ...(scope === "day" ? { day: key } : {}),
          memberId: currentMemberId,
          body: String(f.get("body") ?? "").trim(),
          createdAt: new Date().toISOString(),
        },
      })
    )
      form.reset();
    setBusy(false);
  }
  async function link(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget,
      f = new FormData(form);
    const parsed = featureSchemas.eventLinks.safeParse({
      id: uid(),
      eventId: event.id,
      name: f.get("name"),
      url: f.get("url"),
    });
    if (!parsed.success) {
      setError("Use a complete http or https document link.");
      return;
    }
    setBusy(true);
    if (
      await apply({
        collection: "eventLinks",
        action: "upsert",
        value: parsed.data,
      })
    ) {
      form.reset();
      setError("");
    }
    setBusy(false);
  }
  return (
    <section
      className="event-collaboration"
      aria-label="Event preparation and discussion"
    >
      <h3>Prepare for this event</h3>
      <EventResponsibilities event={event} />
      <Field label="Occurrence date">
        <input
          type="date"
          value={day}
          required
          onChange={(e) => setDay(e.target.value || event.date)}
        />
      </Field>
      {!occurrence && (
        <p className="form-hint">
          This event is not scheduled on that date. Choose a scheduled
          occurrence for its checklist or changes.
        </p>
      )}
      {!!event.checklist?.length && (
        <fieldset disabled={!occurrence || busy}>
          <legend>Bring along · {formatDate(key)}</legend>
          {event.checklist.map((step) => (
            <label className="check-label" key={step.id}>
              <input
                type="checkbox"
                checked={done.includes(step.id)}
                onChange={() =>
                  void apply({
                    collection: "events",
                    action: "upsert",
                    value: {
                      ...event,
                      checklistDone: {
                        ...event.checklistDone,
                        [key]: done.includes(step.id)
                          ? done.filter((id) => id !== step.id)
                          : [...done, step.id],
                      },
                    },
                  })
                }
              />
              {step.title}
            </label>
          ))}
        </fieldset>
      )}
      {event.repeat !== "none" && (
        <div className="toolbar-actions">
          <button
            type="button"
            className="button secondary small-button"
            disabled={!occurrence || busy}
            onClick={() =>
              void applyWithUndo(
                {
                  collection: "events",
                  action: "upsert",
                  value: {
                    ...event,
                    excludedDates: [
                      ...new Set([...(event.excludedDates ?? []), key]),
                    ],
                  },
                },
                "Occurrence skipped.",
              )
            }
          >
            Skip this occurrence
          </button>
          <button
            type="button"
            className="button secondary small-button"
            disabled={!occurrence || busy}
            onClick={() => {
              const length = daysBetween(
                event.date,
                event.endDate ?? event.date,
              );
              const {
                excludedDates: _a,
                excludedRanges: _b,
                until: _c,
                checklistDone: _d,
                ...rest
              } = event;
              void _a;
              void _b;
              void _c;
              void _d;
              open({
                kind: "event",
                item: {
                  ...rest,
                  id: uid(),
                  date: key,
                  ...(length ? { endDate: shiftDate(key, length) } : {}),
                  repeat: "none",
                },
                rescheduleFrom: { eventId: event.id, day: key },
              });
              notify(
                "Choose a new date or time, then save to move just this occurrence.",
              );
            }}
          >
            Move this occurrence
          </button>
        </div>
      )}
      <h3>Document links</h3>
      <ul className="event-documents">
        {data.eventLinks
          ?.filter(
            (l) =>
              l.eventId === event.id || l.eventId === event.origin?.eventId,
          )
          .map((l) => (
            <li key={l.id}>
              <a href={l.url} target="_blank" rel="noopener noreferrer">
                {l.name}
              </a>
              <button
                type="button"
                className="text-button"
                aria-label={`Remove link ${l.name}`}
                onClick={() =>
                  void applyWithUndo(
                    { collection: "eventLinks", action: "remove", id: l.id },
                    "Document link removed.",
                  )
                }
              >
                Remove
              </button>
            </li>
          ))}
      </ul>
      <form onSubmit={(e) => void link(e)}>
        <Field label="Document name">
          <input
            name="name"
            required
            maxLength={150}
            placeholder="School notice, permission form…"
          />
        </Field>
        <Field label="Document URL">
          <input
            name="url"
            type="url"
            required
            maxLength={2000}
            placeholder="https://"
          />
        </Field>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <button className="button secondary" disabled={busy}>
          Attach document link
        </button>
      </form>
      <h3>Discussion</h3>
      <p className="form-hint">
        Messages can apply to the whole series or just {formatDate(key)}.
      </p>
      <div className="event-comments">
        {comments.map((c) => (
          <article key={c.id}>
            <strong>
              {data.members.find((m) => m.id === c.memberId)?.name ??
                "Family member"}
            </strong>
            <small>
              {new Date(c.createdAt).toLocaleString("en-NZ")} ·{" "}
              {c.day ? formatDate(c.day) : "Whole series"}
            </small>
            <p>{c.body}</p>
            {c.memberId === currentMemberId && (
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  void applyWithUndo(
                    { collection: "comments", action: "remove", id: c.id },
                    "Comment removed.",
                  )
                }
              >
                Delete comment
              </button>
            )}
          </article>
        ))}
      </div>
      <form onSubmit={(e) => void comment(e)}>
        <Field label="Message">
          <textarea name="body" required maxLength={2000} rows={3} />
        </Field>
        <Field label="Applies to">
          <select value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="day">This occurrence</option>
            <option value="series">Whole series</option>
          </select>
        </Field>
        <button className="button primary" disabled={busy}>
          Post comment
        </button>
      </form>
    </section>
  );
}
