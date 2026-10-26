"use client";
import { useState } from "react";
import { Upload } from "lucide-react";
import { eventSchema, uid, type Mutation } from "@/lib/data";
import { familyDate } from "@/lib/planning";
import {
  duplicateNotice,
  parseNotice,
  type NoticeDraft,
} from "@/lib/notice-import";
import { usePlanner } from "./planner-provider";
import { Field, Modal } from "./ui";
type Draft = NoticeDraft & { id: string; selected: boolean; allDay: boolean };
export function NoticeImport() {
  const { data, applyWithUndo, currentMemberId } = usePlanner();
  const [open, setOpen] = useState(false),
    [source, setSource] = useState(""),
    [drafts, setDrafts] = useState<Draft[] | null>(null),
    [person, setPerson] = useState(currentMemberId),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const update = (id: string, patch: Partial<Draft>) =>
    setDrafts(
      (all) => all?.map((d) => (d.id === id ? { ...d, ...patch } : d)) ?? null,
    );
  async function save() {
    setError("");
    const changes: Mutation[] = [];
    for (const d of drafts ?? []) {
      if (!d.selected || duplicateNotice(d, data.events)) continue;
      const parsed = eventSchema.safeParse({
        id: d.id,
        title: d.title.trim(),
        date: d.date,
        start: d.allDay ? "00:00" : d.start,
        end: d.allDay ? "23:59" : d.end,
        allDay: d.allDay,
        memberIds: [person],
        repeat: "none",
        category: "School",
        location: d.location,
        notes: `From notice: ${d.source}`.slice(0, 2000),
      });
      if (!parsed.success) {
        setError(`Check “${d.title}”: ${parsed.error.issues[0].message}`);
        return;
      }
      changes.push({
        collection: "events",
        action: "upsert",
        value: parsed.data,
      });
    }
    if (!changes.length) {
      setError("Select at least one new event to import.");
      return;
    }
    setBusy(true);
    if (
      await applyWithUndo(
        changes,
        `${changes.length} reviewed events imported.`,
      )
    ) {
      setOpen(false);
      setDrafts(null);
      setSource("");
    }
    setBusy(false);
  }
  return (
    <>
      <button
        className="button secondary small-button"
        onClick={() => {
          setOpen(true);
          setError("");
        }}
      >
        <Upload size={15} /> Import school notice
      </button>
      {open && (
        <Modal
          title="Import a school notice"
          subtitle="Paste the notice or load a text/email file. Review every proposed event before saving."
          onClose={() => setOpen(false)}
          wide
        >
          {!drafts ? (
            <>
              <Field
                label="Notice text"
                hint="One event per line. Dates can use 2026-11-05, 5/11/2026, 5 November 2026, or relative dates."
              >
                <textarea
                  rows={8}
                  value={source}
                  maxLength={100000}
                  onChange={(e) => setSource(e.target.value)}
                  placeholder="School assembly 5 November 2026 9am–10am"
                />
              </Field>
              <Field label="Load a text notice or email">
                <input
                  type="file"
                  accept=".txt,.eml,.csv,text/plain,message/rfc822"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 200000) {
                      setError("Choose a text file smaller than 200 KB.");
                      return;
                    }
                    setSource(await file.text());
                  }}
                />
              </Field>
              <button
                className="button primary"
                disabled={!source.trim()}
                onClick={() => {
                  const parsed = parseNotice(source, familyDate(data));
                  if (!parsed.length) {
                    setError(
                      "No dated events found. Include a date on each event line.",
                    );
                    return;
                  }
                  setDrafts(
                    parsed.map((d) => ({
                      ...d,
                      id: uid(),
                      selected: !duplicateNotice(d, data.events),
                      allDay: false,
                    })),
                  );
                  setError("");
                }}
              >
                Review proposed events
              </button>
            </>
          ) : (
            <>
              <Field label="Assign imported events to">
                <select
                  value={person}
                  onChange={(e) => setPerson(e.target.value)}
                >
                  {data.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="form-hint">
                Dates and times use{" "}
                {data.settings.timezone ??
                  Intl.DateTimeFormat().resolvedOptions().timeZone}
                . Check dates inferred from “next” or “tomorrow”.
              </p>
              {drafts.map((d) => (
                <article className="notice-draft" key={d.id}>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={d.selected}
                      disabled={duplicateNotice(d, data.events)}
                      onChange={(e) =>
                        update(d.id, { selected: e.target.checked })
                      }
                    />{" "}
                    {duplicateNotice(d, data.events)
                      ? "Already in your calendar"
                      : "Import this event"}
                  </label>
                  <p className="notice-source">Source: {d.source}</p>
                  {d.warning && <p className="form-hint">{d.warning}</p>}
                  <Field label="Event title">
                    <input
                      value={d.title}
                      maxLength={150}
                      onChange={(e) => update(d.id, { title: e.target.value })}
                    />
                  </Field>
                  <div className="form-grid">
                    <Field label="Event date">
                      <input
                        type="date"
                        value={d.date}
                        onChange={(e) => update(d.id, { date: e.target.value })}
                      />
                    </Field>
                    <label className="check-label">
                      <input
                        type="checkbox"
                        checked={d.allDay}
                        onChange={(e) =>
                          update(d.id, { allDay: e.target.checked })
                        }
                      />
                      All day
                    </label>
                    {!d.allDay && (
                      <>
                        <Field label="Start time">
                          <input
                            type="time"
                            value={d.start}
                            onChange={(e) =>
                              update(d.id, { start: e.target.value })
                            }
                          />
                        </Field>
                        <Field label="End time">
                          <input
                            type="time"
                            value={d.end}
                            onChange={(e) =>
                              update(d.id, { end: e.target.value })
                            }
                          />
                        </Field>
                      </>
                    )}
                  </div>
                  <Field label="Location">
                    <input
                      value={d.location}
                      maxLength={200}
                      onChange={(e) =>
                        update(d.id, { location: e.target.value })
                      }
                    />
                  </Field>
                </article>
              ))}
              <div className="toolbar-actions">
                <button
                  className="button secondary"
                  onClick={() => setDrafts(null)}
                >
                  Back to notice
                </button>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => void save()}
                >
                  Save reviewed events
                </button>
              </div>
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
