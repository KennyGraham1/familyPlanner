"use client";
import { useEffect, useState } from "react";
import {
  allRecipes,
  categories,
  eventsOn,
  featureSchemas,
  formatDate,
  shiftDate,
  uid,
  type Feature,
} from "@/lib/data";
import { familyDate, rewardBalance, routineDue } from "@/lib/planning";
import { usePlanner } from "./planner-provider";
import { Field, Modal } from "./ui";
import type { ViewProps } from "./overview";

type Tool = "Review" | "Routines" | "Pantry" | "Spending" | "Activity";
export function FamilyTools(props: ViewProps) {
  const [tab, setTab] = useState<Tool>("Review");
  return (
    <>
      <div className="family-filters tool-tabs" aria-label="Family tools">
        {(
          ["Review", "Routines", "Pantry", "Spending", "Activity"] as const
        ).map((name) => (
          <button
            id={`tool-${name.toLowerCase()}`}
            key={name}
            className={`filter-chip ${tab === name ? "active" : ""}`}
            aria-pressed={tab === name}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>
      {tab === "Review" && <WeeklyReview {...props} />}
      {tab === "Routines" && <Routines />}
      {tab === "Pantry" && <Pantry />}
      {tab === "Spending" && <Spending />}
      {tab === "Activity" && <Activity {...props} />}
    </>
  );
}
function WeeklyReview({ open, navigate }: ViewProps) {
  const { data, apply, notify } = usePlanner();
  const today = familyDate(data),
    catalogue = allRecipes(data);
  const [busy, setBusy] = useState(false);
  return (
    <>
      <section className="card tool-card">
        <h2>Prepare for the next seven days</h2>
        <p>
          Check meals, journeys and anything to bring before the week gets busy.
        </p>
        <div className="review-days">
          {Array.from({ length: 7 }, (_, i) => shiftDate(today, i)).map(
            (day) => {
              const events = eventsOn(data, day);
              const dinner = data.meals.find(
                (m) => m.date === day && m.slot === "Dinner",
              );
              return (
                <article key={day}>
                  <h3>
                    {formatDate(day, {
                      weekday: "long",
                      day: "numeric",
                      month: "short",
                    })}
                  </h3>
                  <p>
                    Dinner:{" "}
                    {dinner?.note ??
                      catalogue.find((r) => r.id === dinner?.recipeId)?.name ??
                      "Not planned"}
                    {!dinner && (
                      <button
                        className="text-button"
                        onClick={() => navigate("meals")}
                      >
                        Plan meals
                      </button>
                    )}
                  </p>
                  {!events.length && <small>No events</small>}
                  {events.map((e) => (
                    <button
                      key={e.id}
                      className="review-event"
                      onClick={() => open({ kind: "event", item: e, day })}
                    >
                      <strong>{e.title}</strong>
                      <span>
                        Drop-off:{" "}
                        {data.members.find((m) => m.id === e.dropOffMemberId)
                          ?.name ?? "Unassigned"}{" "}
                        · Pickup:{" "}
                        {data.members.find((m) => m.id === e.pickupMemberId)
                          ?.name ?? "Unassigned"}
                      </span>
                      {!!e.checklist?.length && (
                        <small>
                          {e.checklist.map((s) => s.title).join(" · ")}
                        </small>
                      )}
                    </button>
                  ))}
                </article>
              );
            },
          )}
        </div>
      </section>
      <section className="card tool-card">
        <h2>Family reminder schedule</h2>
        <p>
          These settings apply to the family’s reminders. Each device still
          chooses which reminders it receives.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            const f = new FormData(e.currentTarget);
            if (
              await apply({
                collection: "settings",
                action: "settings",
                value: {
                  ...data.settings,
                  timezone: String(f.get("timezone")),
                  digestDay: Number(f.get("digestDay")),
                  digestTime: String(f.get("digestTime")),
                  quietStart: String(f.get("quietStart")) || undefined,
                  quietEnd: String(f.get("quietEnd")) || undefined,
                  changeAlerts: f.get("changes") === "on",
                },
              })
            )
              notify("Family reminder schedule saved.");
            setBusy(false);
          }}
        >
          <Field label="Family time zone">
            <input
              name="timezone"
              required
              defaultValue={
                data.settings.timezone ??
                Intl.DateTimeFormat().resolvedOptions().timeZone
              }
              list="family-timezones"
            />
          </Field>
          <datalist id="family-timezones">
            {Intl.supportedValuesOf("timeZone").map((tz) => (
              <option key={tz} value={tz} />
            ))}
          </datalist>
          <div className="form-grid">
            <Field label="Weekly review day">
              <select
                name="digestDay"
                defaultValue={data.settings.digestDay ?? 0}
              >
                {[
                  "Sunday",
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                ].map((d, i) => (
                  <option value={i} key={d}>
                    {d}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Weekly review time">
              <input
                name="digestTime"
                type="time"
                required
                defaultValue={data.settings.digestTime ?? "18:00"}
              />
            </Field>
          </div>
          <div className="form-grid">
            <Field label="Quiet hours start">
              <input
                name="quietStart"
                type="time"
                defaultValue={data.settings.quietStart}
              />
            </Field>
            <Field label="Quiet hours end">
              <input
                name="quietEnd"
                type="time"
                defaultValue={data.settings.quietEnd}
              />
            </Field>
          </div>
          <label className="check-label">
            <input
              name="changes"
              type="checkbox"
              defaultChecked={data.settings.changeAlerts !== false}
            />{" "}
            Notify relevant people when events or chores change
          </label>
          <button className="button primary" disabled={busy}>
            Save family reminder schedule
          </button>
        </form>
      </section>
    </>
  );
}
function Routines() {
  const {
    data,
    apply,
    applyWithUndo,
    currentMemberId,
    household,
    isOwner,
    notify,
  } = usePlanner();
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);
  const today = familyDate(data, now);
  const [kid, setKid] = useState(false),
    [person, setPerson] = useState(currentMemberId);
  const [editing, setEditing] = useState<Feature<"routines"> | "new" | null>(
      null,
    ),
    [days, setDays] = useState([1, 2, 3, 4, 5]),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  const canApprove = !household || isOwner;
  const routines = (data.routines ?? []).filter(
    (r) => (!kid || r.memberId === person) && routineDue(r, today),
  );
  const edit = (routine: Feature<"routines"> | "new") => {
    setDays(routine === "new" ? [1, 2, 3, 4, 5] : routine.days);
    setError("");
    setEditing(routine);
  };
  const existing = editing && editing !== "new" ? editing : undefined;
  const balance = rewardBalance(data, person);
  return (
    <div className={`routines-panel ${kid ? "kid-view" : ""}`}>
      <div className="toolbar-actions">
        <button
          className="button secondary"
          aria-pressed={kid}
          onClick={() => setKid(!kid)}
        >
          {kid ? "Back to family view" : "Shared tablet child view"}
        </button>
        <label className="tool-person">
          Person
          <select
            aria-label="Routine person"
            value={person}
            onChange={(e) => setPerson(e.target.value)}
          >
            {data.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        {!kid && (
          <button className="button primary" onClick={() => edit("new")}>
            Add routine
          </button>
        )}
      </div>
      {kid && (
        <p className="form-hint">
          A simple view for a shared family tablet. An adult can return to
          family view.
        </p>
      )}
      <h2>
        {kid
          ? `${data.members.find((m) => m.id === person)?.name}’s day`
          : "Today’s routines"}
      </h2>
      <p>
        {formatDate(today, { weekday: "long", day: "numeric", month: "long" })}
      </p>
      {!routines.length && (
        <p className="no-results">
          No routines scheduled today.
          {!kid && " Add a morning, after-school or bedtime routine."}
        </p>
      )}
      <div className="routine-grid">
        {routines.map((r) => {
          const completion = data.routineChecks?.find(
              (c) => c.id === `${r.id}:${today}`,
            ),
            done = completion?.steps ?? [];
          return (
            <section className="card tool-card" key={r.id}>
              <h3>{r.title}</h3>
              <p>
                {data.members.find((m) => m.id === r.memberId)?.name} ·{" "}
                {r.period}
              </p>
              <progress
                aria-label={`${r.title} completed`}
                value={done.length}
                max={r.steps.length}
              />
              {r.steps.map((s, i) => (
                <label
                  key={s.id}
                  className={`routine-step ${done.includes(s.id) ? "is-done" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={done.includes(s.id)}
                    onChange={() =>
                      void apply({
                        collection: "routineChecks",
                        action: "upsert",
                        value: {
                          id: `${r.id}:${today}`,
                          routineId: r.id,
                          memberId: r.memberId,
                          date: today,
                          steps: done.includes(s.id)
                            ? done.filter((id) => id !== s.id)
                            : [...done, s.id],
                        },
                      })
                    }
                  />
                  <span>
                    {i + 1}. {s.title}
                  </span>
                </label>
              ))}
              <small>
                {done.length === r.steps.length
                  ? "All done — one star earned!"
                  : `${done.length} of ${r.steps.length} done`}
              </small>
              {!kid && (
                <div className="toolbar-actions">
                  <button className="text-button" onClick={() => edit(r)}>
                    Edit routine
                  </button>
                  <button
                    className="text-button"
                    onClick={() =>
                      void applyWithUndo(
                        { collection: "routines", action: "remove", id: r.id },
                        "Routine removed.",
                      )
                    }
                  >
                    Delete routine
                  </button>
                </div>
              )}
            </section>
          );
        })}
      </div>
      {!kid && !!data.routines?.length && (
        <details className="card tool-card">
          <summary>All routines and schedules</summary>
          {data.routines.map((r) => (
            <div className="tool-list-row" key={r.id}>
              <span>
                {r.title} ·{" "}
                {data.members.find((m) => m.id === r.memberId)?.name}
              </span>
              <button className="text-button" onClick={() => edit(r)}>
                Edit
              </button>
            </div>
          ))}
        </details>
      )}
      <section className="card tool-card">
        <h2>Reward goals</h2>
        <p>
          {data.members.find((m) => m.id === person)?.name}:{" "}
          <strong>{balance} stars available</strong>. Completed chores and
          routines earn one star each.
        </p>
        {data.rewards
          ?.filter((r) => r.memberId === person)
          .map((r) => {
            const claim = data.rewardClaims?.find(
              (c) => c.id === `${r.id}:${today}`,
            );
            return (
              <div className="tool-list-row" key={r.id}>
                <span>
                  {r.title} · {r.cost} stars
                </span>
                <button
                  className="button secondary small-button"
                  disabled={Boolean(claim) || balance < r.cost}
                  onClick={() =>
                    void apply({
                      collection: "rewardClaims",
                      action: "upsert",
                      value: {
                        id: `${r.id}:${today}`,
                        rewardId: r.id,
                        memberId: person,
                        date: today,
                        cost: r.cost,
                        approved: false,
                      },
                    })
                  }
                >
                  {claim
                    ? claim.approved
                      ? "Approved"
                      : "Waiting for approval"
                    : "Request reward"}
                </button>
                {!kid && (
                  <button
                    className="text-button"
                    onClick={() =>
                      void applyWithUndo(
                        { collection: "rewards", action: "remove", id: r.id },
                        "Reward removed.",
                      )
                    }
                  >
                    Delete
                  </button>
                )}
              </div>
            );
          })}
        {!kid && (
          <>
            <form
              className="tool-inline-form"
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget,
                  f = new FormData(form);
                if (
                  await apply({
                    collection: "rewards",
                    action: "upsert",
                    value: {
                      id: uid(),
                      title: String(f.get("title")).trim(),
                      memberId: person,
                      cost: Number(f.get("cost")),
                    },
                  })
                )
                  form.reset();
              }}
            >
              <Field label="Reward">
                <input
                  name="title"
                  required
                  maxLength={150}
                  placeholder="Choose a family film"
                />
              </Field>
              <Field label="Stars needed">
                <input
                  name="cost"
                  type="number"
                  required
                  min={1}
                  max={10000}
                  defaultValue={5}
                />
              </Field>
              <button className="button secondary">Add reward goal</button>
            </form>
            <h3>Reward requests</h3>
            {data.rewardClaims
              ?.filter((c) => !c.approved)
              .map((c) => (
                <div className="tool-list-row" key={c.id}>
                  <span>
                    {data.members.find((m) => m.id === c.memberId)?.name} ·{" "}
                    {data.rewards?.find((r) => r.id === c.rewardId)?.title}
                  </span>
                  <button
                    className="button secondary small-button"
                    disabled={!canApprove}
                    onClick={() =>
                      void apply({
                        collection: "rewardClaims",
                        action: "upsert",
                        value: { ...c, approved: true },
                      })
                    }
                  >
                    Approve
                  </button>
                  <button
                    className="text-button"
                    disabled={!canApprove}
                    onClick={() =>
                      void apply({
                        collection: "rewardClaims",
                        action: "remove",
                        id: c.id,
                      })
                    }
                  >
                    Decline & return stars
                  </button>
                </div>
              ))}
            {!canApprove && (
              <p className="form-hint">
                The family owner approves or declines reward requests.
              </p>
            )}
          </>
        )}
      </section>
      {editing && (
        <Modal
          title={existing ? "Edit routine" : "Add a routine"}
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setError("");
              const f = new FormData(e.currentTarget),
                get = (key: string) => String(f.get(key) ?? "").trim();
              const steps = get("steps")
                .split("\n")
                .map((x) => x.trim())
                .filter(Boolean)
                .map((title) => ({
                  id:
                    existing?.steps.find((s) => s.title === title)?.id ?? uid(),
                  title,
                }));
              const value = featureSchemas.routines.safeParse({
                id: existing?.id ?? uid(),
                title: get("title"),
                memberId: get("person"),
                period: get("period"),
                days,
                steps,
                ...(get("from") ? { from: get("from") } : {}),
                ...(get("until") ? { until: get("until") } : {}),
                ...(get("holidayFrom") && get("holidayUntil")
                  ? {
                      excludedRanges: [
                        { start: get("holidayFrom"), end: get("holidayUntil") },
                      ],
                    }
                  : {}),
              });
              if (!value.success) {
                setError(value.error.issues[0].message);
                return;
              }
              setSaving(true);
              const checks = (data.routineChecks ?? [])
                .filter((c) => c.routineId === value.data.id)
                .map((c) => ({
                  collection: "routineChecks" as const,
                  action: "upsert" as const,
                  value: {
                    ...c,
                    memberId: value.data.memberId,
                    steps: c.steps.filter((id) =>
                      steps.some((s) => s.id === id),
                    ),
                  },
                }));
              if (
                await apply([
                  {
                    collection: "routines",
                    action: "upsert",
                    value: value.data,
                  },
                  ...checks,
                ])
              ) {
                setEditing(null);
                notify("Routine saved.");
              }
              setSaving(false);
            }}
          >
            <Field label="Routine name">
              <input
                name="title"
                defaultValue={existing?.title}
                required
                maxLength={150}
              />
            </Field>
            <div className="form-grid">
              <Field label="Person">
                <select
                  name="person"
                  defaultValue={existing?.memberId ?? person}
                >
                  {data.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Time of day">
                <select
                  name="period"
                  defaultValue={existing?.period ?? "Morning"}
                >
                  {["Morning", "After school", "Bedtime"].map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </Field>
            </div>
            <fieldset>
              <legend>Days</legend>
              <div className="weekday-choices">
                {[
                  "Sunday",
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                ].map((d, i) => (
                  <label key={d}>
                    <input
                      type="checkbox"
                      checked={days.includes(i)}
                      onChange={(e) =>
                        setDays(
                          e.target.checked
                            ? [...days, i]
                            : days.filter((x) => x !== i),
                        )
                      }
                    />
                    {d}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Steps" hint="One step per line, in order.">
              <textarea
                name="steps"
                rows={5}
                required
                defaultValue={existing?.steps.map((s) => s.title).join("\n")}
                placeholder={"Brush teeth\nPack lunch\nCheck school bag"}
              />
            </Field>
            <div className="form-grid">
              <Field label="Term starts (optional)">
                <input name="from" type="date" defaultValue={existing?.from} />
              </Field>
              <Field label="Term ends (optional)">
                <input
                  name="until"
                  type="date"
                  defaultValue={existing?.until}
                />
              </Field>
              <Field label="Holiday starts (optional)">
                <input
                  name="holidayFrom"
                  type="date"
                  defaultValue={existing?.excludedRanges?.[0]?.start}
                />
              </Field>
              <Field label="Holiday ends (optional)">
                <input
                  name="holidayUntil"
                  type="date"
                  defaultValue={existing?.excludedRanges?.[0]?.end}
                />
              </Field>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="button primary" disabled={saving}>
              Save routine
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
function Pantry() {
  const { data, apply, applyWithUndo, notify } = usePlanner();
  const today = familyDate(data);
  const [editing, setEditing] = useState<Feature<"pantry"> | "new" | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const item = editing && editing !== "new" ? editing : undefined;
  return (
    <>
      <div className="toolbar-actions">
        <button className="button primary" onClick={() => setEditing("new")}>
          Add pantry item
        </button>
      </div>
      <section className="card tool-card">
        <h2>What’s in the cupboard?</h2>
        <p>
          Keep useful staples here. Shopping review flags these items so you can
          check the amount before buying more.
        </p>
        {!(data.pantry ?? []).length && <p>No pantry items yet.</p>}
        {[...(data.pantry ?? [])]
          .sort(
            (a, b) =>
              (a.useBy ?? "9999").localeCompare(b.useBy ?? "9999") ||
              a.name.localeCompare(b.name),
          )
          .map((p) => (
            <div className="tool-list-row" key={p.id}>
              <div>
                <strong>{p.name}</strong>
                <small>
                  {p.quantity} · {p.category}
                  {p.useBy
                    ? ` · ${p.useBy < today ? "Past use-by" : p.useBy <= shiftDate(today, 3) ? "Use soon" : "Use by"}: ${formatDate(p.useBy)}`
                    : ""}
                </small>
              </div>
              <button className="text-button" onClick={() => setEditing(p)}>
                Edit
              </button>
              <button
                className="text-button"
                onClick={() =>
                  void applyWithUndo(
                    { collection: "pantry", action: "remove", id: p.id },
                    "Pantry item removed.",
                  )
                }
              >
                Used up
              </button>
            </div>
          ))}
      </section>
      {editing && (
        <Modal
          title={item ? "Edit pantry item" : "Add pantry item"}
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const f = new FormData(e.currentTarget),
                useBy = String(f.get("useBy") ?? "");
              if (
                await apply({
                  collection: "pantry",
                  action: "upsert",
                  value: {
                    id: item?.id ?? uid(),
                    name: String(f.get("name")).trim(),
                    quantity: String(f.get("quantity")).trim(),
                    category: f.get("category") as (typeof categories)[number],
                    ...(useBy ? { useBy } : {}),
                  },
                })
              ) {
                setEditing(null);
                notify("Pantry saved.");
              }
              setBusy(false);
            }}
          >
            <Field label="Item name">
              <input
                name="name"
                required
                maxLength={150}
                defaultValue={item?.name}
              />
            </Field>
            <Field label="Amount at home">
              <input
                name="quantity"
                maxLength={50}
                defaultValue={item?.quantity}
                placeholder="e.g. Half a bag, 500 g"
              />
            </Field>
            <Field label="Aisle">
              <select name="category" defaultValue={item?.category ?? "Pantry"}>
                {categories.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Use-by date (optional)">
              <input name="useBy" type="date" defaultValue={item?.useBy} />
            </Field>
            <button className="button primary" disabled={busy}>
              Save pantry item
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
function Spending() {
  const { data, apply, applyWithUndo, currentMemberId, notify } = usePlanner();
  const [month, setMonth] = useState(familyDate(data).slice(0, 7)),
    [editing, setEditing] = useState<Feature<"expenses"> | "new" | null>(null),
    [busy, setBusy] = useState(false);
  const item = editing && editing !== "new" ? editing : undefined;
  const expenses = (data.expenses ?? [])
    .filter((e) => e.date.startsWith(month))
    .sort((a, b) => b.date.localeCompare(a.date));
  const total = expenses.reduce((sum, e) => sum + e.cents, 0);
  const money = (c: number) =>
    new Intl.NumberFormat("en-NZ", {
      style: "currency",
      currency: "NZD",
    }).format(c / 100);
  function exportCsv() {
    const cell = (s: string) =>
      `"${(/^[=+\-@]/.test(s) ? "'" : "") + s.replaceAll('"', '""')}"`;
    const rows = [
      ["Date", "Description", "Category", "Amount NZD", "Person"],
      ...expenses.map((e) => [
        e.date,
        e.title,
        e.category,
        (e.cents / 100).toFixed(2),
        data.members.find((m) => m.id === e.memberId)?.name ?? "",
      ]),
    ];
    const url = URL.createObjectURL(
      new Blob([rows.map((r) => r.map(cell).join(",")).join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `kinfolk-spending-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <div className="toolbar-actions">
        <Field label="Spending month">
          <input
            type="month"
            required
            value={month}
            onChange={(e) =>
              setMonth(e.target.value || familyDate(data).slice(0, 7))
            }
          />
        </Field>
        <button className="button primary" onClick={() => setEditing("new")}>
          Add expense
        </button>
        <button
          className="button secondary"
          disabled={!expenses.length}
          onClick={exportCsv}
        >
          Export CSV
        </button>
      </div>
      <section className="card tool-card">
        <h2>{money(total)} recorded this month</h2>
        {data.settings.monthlyBudget ? (
          <p>
            Budget {money(data.settings.monthlyBudget)} ·{" "}
            {money(Math.abs(data.settings.monthlyBudget - total))}{" "}
            {total > data.settings.monthlyBudget ? "over budget" : "remaining"}
          </p>
        ) : (
          <p>Record everyday family expenses in NZD.</p>
        )}
        <form
          className="tool-inline-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const value = Number(new FormData(e.currentTarget).get("budget"));
            if (
              await apply({
                collection: "settings",
                action: "settings",
                value: {
                  ...data.settings,
                  monthlyBudget: Math.round(value * 100),
                },
              })
            )
              notify("Monthly budget saved.");
          }}
        >
          <Field label="Monthly budget (NZD)">
            <input
              name="budget"
              type="number"
              min={0}
              step="0.01"
              max={1000000}
              defaultValue={(data.settings.monthlyBudget ?? 0) / 100}
            />
          </Field>
          <button className="button secondary">Save budget</button>
        </form>
        <div className="spending-categories">
          {["Groceries", "School", "Transport", "Home", "Other"].map((c) => (
            <p key={c}>
              {c}
              <strong>
                {money(
                  expenses
                    .filter((e) => e.category === c)
                    .reduce((s, e) => s + e.cents, 0),
                )}
              </strong>
            </p>
          ))}
        </div>
        {!expenses.length && <p>No expenses recorded in this month.</p>}
        {expenses.map((e) => (
          <div className="tool-list-row" key={e.id}>
            <div>
              <strong>{e.title}</strong>
              <small>
                {formatDate(e.date)} · {e.category} ·{" "}
                {data.members.find((m) => m.id === e.memberId)?.name}
              </small>
            </div>
            <strong>{money(e.cents)}</strong>
            <button className="text-button" onClick={() => setEditing(e)}>
              Edit
            </button>
            <button
              className="text-button"
              onClick={() =>
                void applyWithUndo(
                  { collection: "expenses", action: "remove", id: e.id },
                  "Expense removed.",
                )
              }
            >
              Delete
            </button>
          </div>
        ))}
      </section>
      {editing && (
        <Modal
          title={item ? "Edit expense" : "Add expense"}
          onClose={() => setEditing(null)}
        >
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              const f = new FormData(e.currentTarget);
              if (
                await apply({
                  collection: "expenses",
                  action: "upsert",
                  value: {
                    id: item?.id ?? uid(),
                    title: String(f.get("title")).trim(),
                    date: String(f.get("date")),
                    cents: Math.round(Number(f.get("amount")) * 100),
                    memberId: String(f.get("person")),
                    category: f.get(
                      "category",
                    ) as Feature<"expenses">["category"],
                  },
                })
              ) {
                setEditing(null);
                notify("Expense saved.");
              }
              setBusy(false);
            }}
          >
            <Field label="Description">
              <input
                name="title"
                required
                maxLength={150}
                defaultValue={item?.title}
              />
            </Field>
            <div className="form-grid">
              <Field label="Amount (NZD)">
                <input
                  name="amount"
                  type="number"
                  required
                  min={0.01}
                  max={1000000}
                  step="0.01"
                  defaultValue={item ? item.cents / 100 : undefined}
                />
              </Field>
              <Field label="Date">
                <input
                  name="date"
                  type="date"
                  required
                  defaultValue={item?.date ?? familyDate(data)}
                />
              </Field>
              <Field label="Category">
                <select
                  name="category"
                  defaultValue={item?.category ?? "Groceries"}
                >
                  {["Groceries", "School", "Transport", "Home", "Other"].map(
                    (c) => (
                      <option key={c}>{c}</option>
                    ),
                  )}
                </select>
              </Field>
              <Field label="Paid by">
                <select
                  name="person"
                  defaultValue={item?.memberId ?? currentMemberId}
                >
                  {data.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <button className="button primary" disabled={busy}>
              Save expense
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Activity({
  open,
  navigate,
}: Pick<ViewProps, "open" | "navigate">) {
  const { data, currentMemberId } = usePlanner();
  const [mine, setMine] = useState(true);
  const history = [...(data.activity ?? [])]
    .filter((a) => !mine || a.memberIds.includes(currentMemberId))
    .reverse();
  return (
    <section className="card tool-card">
      <h2>Family changes</h2>
      <label className="check-label">
        <input
          type="checkbox"
          checked={mine}
          onChange={(e) => setMine(e.target.checked)}
        />{" "}
        Relevant to me
      </label>
      {!history.length && <p>No recent changes to show.</p>}
      {history.map((a) => (
        <article className="activity-entry" key={a.id}>
          <strong>
            {a.actorName} · {a.title}
          </strong>
          <small>
            {new Date(a.createdAt).toLocaleString("en-NZ", {
              timeZone: data.settings.timezone,
            })}
          </small>
          {a.before && <p>Before: {a.before}</p>}
          <p>{a.after ? `Now: ${a.after}` : "Removed"}</p>
          <button
            className="text-button"
            onClick={() => {
              if (a.collection === "events" || a.collection === "comments") {
                const event = data.events.find((e) => e.id === a.recordId);
                if (event) open({ kind: "event", item: event });
                else navigate("calendar");
              } else {
                const task = data.tasks.find((t) => t.id === a.recordId);
                if (task) open({ kind: "task", item: task });
                else navigate("chores");
              }
            }}
          >
            View plan
          </button>
        </article>
      ))}
    </section>
  );
}
