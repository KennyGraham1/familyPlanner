"use client";
import { useState } from "react";
import {
  CalendarDays,
  CheckSquare,
  ShoppingBasket,
  StickyNote,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  categories,
  colors,
  dateKey,
  uid,
  eventSchema,
  taskSchema,
  shoppingSchema,
  noteSchema,
  memberSchema,
  type FamilyEvent,
  type Task,
  type ShoppingItem,
  type Note,
  type Member,
} from "@/lib/data";
import { usePlanner } from "./planner-provider";
import { Avatar, Field, FormActions, Modal } from "./ui";

export type Editor =
  | { kind: "event"; item?: FamilyEvent; date?: string }
  | { kind: "task"; item?: Task; memberId?: string }
  | { kind: "shopping"; item?: ShoppingItem }
  | { kind: "note"; item?: Note }
  | { kind: "member"; item?: Member }
  | { kind: "quick" };
export function EditorModal({
  editor,
  onClose,
  open,
}: {
  editor: Editor;
  onClose: () => void;
  open: (editor: Editor) => void;
}) {
  const { data, apply, notify } = usePlanner();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string[]>(
    editor.kind === "event" && editor.item
      ? editor.item.memberIds
      : [data.settings.currentMemberId],
  );
  const [color, setColor] = useState(
    editor.kind === "member"
      ? (editor.item?.color ?? "lavender")
      : editor.kind === "note"
        ? (editor.item?.color ?? "yellow")
        : "lavender",
  );
  const item = editor.kind === "quick" ? undefined : editor.item;
  const titles = {
    event: "event",
    task: "chore",
    shopping: "shopping item",
    note: "family note",
    member: "family member",
    quick: "something new",
  };
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setSaving(true);
    const f = new FormData(e.currentTarget),
      get = (key: string) => String(f.get(key) ?? "").trim();
    const id = item?.id ?? uid();
    let success = false;
    try {
      if (editor.kind === "event") {
        const value = eventSchema.parse({
          id,
          title: get("title"),
          date: get("date"),
          start: get("start"),
          end: get("end"),
          memberIds: selected,
          location: get("location"),
          notes: get("notes"),
          repeat: get("repeat"),
          category: get("category"),
        });
        success = await apply({
          collection: "events",
          action: "upsert",
          value,
        });
      } else if (editor.kind === "task") {
        const value = taskSchema.parse({
          id,
          title: get("title"),
          memberId: get("memberId"),
          due: get("due"),
          done: editor.item?.done ?? false,
          priority: get("priority"),
        });
        success = await apply({ collection: "tasks", action: "upsert", value });
      } else if (editor.kind === "shopping") {
        const value = shoppingSchema.parse({
          id,
          name: get("name"),
          quantity: get("quantity"),
          category: get("category"),
          done: editor.item?.done ?? false,
        });
        success = await apply({
          collection: "shopping",
          action: "upsert",
          value,
        });
      } else if (editor.kind === "note") {
        const value = noteSchema.parse({
          id,
          title: get("title"),
          body: get("body"),
          memberId: get("memberId"),
          color,
          pinned: f.get("pinned") === "on",
          createdAt: editor.item?.createdAt ?? new Date().toISOString(),
        });
        success = await apply({ collection: "notes", action: "upsert", value });
      } else if (editor.kind === "member") {
        const value = memberSchema.parse({
          id,
          name: get("name"),
          role: get("role"),
          emoji: get("emoji") || "🌻",
          color,
        });
        success = await apply({
          collection: "members",
          action: "upsert",
          value,
        });
      }
      if (success) {
        notify(
          item
            ? "Changes saved."
            : `${titles[editor.kind].charAt(0).toUpperCase() + titles[editor.kind].slice(1)} added.`,
        );
        onClose();
      }
    } catch (e) {
      const issue = (e as { issues?: { message: string }[] }).issues?.[0]
        ?.message;
      setError(issue ?? "Please check the form and try again.");
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    if (!item || editor.kind === "member" || editor.kind === "quick") return;
    const collection = {
      event: "events",
      task: "tasks",
      shopping: "shopping",
      note: "notes",
    } as const;
    setSaving(true);
    const ok = await apply({
      collection: collection[editor.kind],
      action: "remove",
      id: item.id,
    });
    setSaving(false);
    if (ok) {
      notify(`${titles[editor.kind]} removed.`);
      onClose();
    }
  }
  const memberOptions = data.members.map((m) => (
    <option key={m.id} value={m.id}>
      {m.name}
    </option>
  ));
  const colorPicker = (
    <div className="field">
      <span>Pick a colour</span>
      <div className="color-picker">
        {colors.map((c) => (
          <button
            type="button"
            key={c}
            aria-label={c}
            aria-pressed={color === c}
            className={`color-option ${c} ${color === c ? "selected" : ""}`}
            onClick={() => setColor(c)}
          />
        ))}
      </div>
    </div>
  );
  return (
    <Modal
      title={
        editor.kind === "quick"
          ? "Add something"
          : `${item ? "Edit" : "Add"} ${titles[editor.kind]}`
      }
      subtitle={
        editor.kind === "event" && editor.item?.repeat === "weekly"
          ? "Changes apply to this entire weekly series."
          : undefined
      }
      onClose={onClose}
    >
      {editor.kind === "quick" ? (
        <div className="quick-options">
          {(
            [
              [
                "event",
                CalendarDays,
                "An event",
                "Something to look forward to",
              ],
              ["task", CheckSquare, "A chore", "A job around the house"],
              [
                "shopping",
                ShoppingBasket,
                "A shopping item",
                "Something we need",
              ],
              ["note", StickyNote, "A family note", "Something to share"],
              ["member", Users, "A family member", "Make room for your people"],
            ] as [
              Exclude<Editor["kind"], "quick">,
              LucideIcon,
              string,
              string,
            ][]
          ).map(([kind, Icon, title, description]) => (
            <button key={kind} onClick={() => open({ kind } as Editor)}>
              <span
                className={`quick-icon ${kind === "event" ? "lavender" : kind === "task" ? "sage" : kind === "shopping" ? "peach" : "yellow"}`}
              >
                <Icon size={22} />
              </span>
              <span>
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
              <span className="quick-plus">+</span>
            </button>
          ))}
        </div>
      ) : (
        <form onSubmit={submit}>
          {editor.kind === "event" && (
            <>
              <Field label="What's happening?">
                <input
                  name="title"
                  placeholder="e.g. Football practice"
                  defaultValue={editor.item?.title}
                  required
                  maxLength={150}
                  autoFocus
                />
              </Field>
              <Field label="Date">
                <input
                  name="date"
                  type="date"
                  defaultValue={
                    editor.item?.date ?? editor.date ?? dateKey(new Date())
                  }
                  required
                />
              </Field>
              <div className="form-grid">
                <Field label="Starts at">
                  <input
                    name="start"
                    type="time"
                    defaultValue={editor.item?.start ?? "09:00"}
                    required
                  />
                </Field>
                <Field label="Ends at">
                  <input
                    name="end"
                    type="time"
                    defaultValue={editor.item?.end ?? "10:00"}
                    required
                  />
                </Field>
              </div>
              <div className="field">
                <span>Who’s coming?</span>
                <div className="member-picker">
                  {data.members.map((m) => (
                    <button
                      type="button"
                      className={`member-chip ${selected.includes(m.id) ? "selected" : ""}`}
                      key={m.id}
                      aria-pressed={selected.includes(m.id)}
                      onClick={() =>
                        setSelected(
                          selected.includes(m.id)
                            ? selected.filter((id) => id !== m.id)
                            : [...selected, m.id],
                        )
                      }
                    >
                      <Avatar member={m} small />
                      {m.name}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Where?">
                <input
                  name="location"
                  placeholder="Add a place"
                  defaultValue={editor.item?.location}
                  maxLength={200}
                />
              </Field>
              <div className="form-grid">
                <Field label="Category">
                  <select
                    name="category"
                    defaultValue={editor.item?.category ?? "Activity"}
                  >
                    {[
                      "Activity",
                      "School",
                      "Appointment",
                      "Family time",
                      "Work",
                    ].map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Repeat">
                  <select
                    name="repeat"
                    defaultValue={editor.item?.repeat ?? "none"}
                  >
                    <option value="none">Just this once</option>
                    <option value="weekly">Every week</option>
                  </select>
                </Field>
              </div>
              <Field label="Notes">
                <textarea
                  name="notes"
                  rows={3}
                  placeholder="Anything to bring or remember?"
                  defaultValue={editor.item?.notes}
                  maxLength={2000}
                />
              </Field>
            </>
          )}
          {editor.kind === "task" && (
            <>
              <Field label="What needs doing?">
                <input
                  name="title"
                  placeholder="e.g. Water the plants"
                  defaultValue={editor.item?.title}
                  required
                  maxLength={150}
                  autoFocus
                />
              </Field>
              <Field label="Who’s on it?">
                <select
                  name="memberId"
                  defaultValue={
                    editor.item?.memberId ??
                    editor.memberId ??
                    data.settings.currentMemberId
                  }
                >
                  {memberOptions}
                </select>
              </Field>
              <div className="form-grid">
                <Field label="Due date">
                  <input
                    name="due"
                    type="date"
                    defaultValue={editor.item?.due ?? dateKey(new Date())}
                    required
                  />
                </Field>
                <Field label="Priority">
                  <select
                    name="priority"
                    defaultValue={editor.item?.priority ?? "normal"}
                  >
                    <option value="normal">Whenever you can</option>
                    <option value="high">Important</option>
                  </select>
                </Field>
              </div>
            </>
          )}
          {editor.kind === "shopping" && (
            <>
              <Field label="What do we need?">
                <input
                  name="name"
                  placeholder="e.g. Fresh strawberries"
                  defaultValue={editor.item?.name}
                  required
                  maxLength={150}
                  autoFocus
                />
              </Field>
              <div className="form-grid">
                <Field label="How much?">
                  <input
                    name="quantity"
                    placeholder="e.g. 1 punnet"
                    defaultValue={editor.item?.quantity}
                    maxLength={50}
                  />
                </Field>
                <Field label="Aisle">
                  <select
                    name="category"
                    defaultValue={editor.item?.category ?? "Produce"}
                  >
                    {categories.map((c) => (
                      <option key={c}>{c}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </>
          )}
          {editor.kind === "note" && (
            <>
              <Field label="Give your note a title">
                <input
                  name="title"
                  placeholder="Title"
                  defaultValue={editor.item?.title}
                  required
                  maxLength={150}
                  autoFocus
                />
              </Field>
              <Field label="What would you like to share?">
                <textarea
                  name="body"
                  rows={5}
                  placeholder="What would you like to say?"
                  defaultValue={editor.item?.body}
                  required
                  maxLength={2000}
                />
              </Field>
              <Field label="From">
                <select
                  name="memberId"
                  defaultValue={
                    editor.item?.memberId ?? data.settings.currentMemberId
                  }
                >
                  {memberOptions}
                </select>
              </Field>
              {colorPicker}
              <label className="inline-check">
                <input
                  type="checkbox"
                  name="pinned"
                  defaultChecked={editor.item?.pinned}
                />{" "}
                Pin this to the top of the board
              </label>
            </>
          )}
          {editor.kind === "member" && (
            <>
              <Field label="Name">
                <input
                  name="name"
                  placeholder="Name"
                  defaultValue={editor.item?.name}
                  required
                  maxLength={150}
                  autoFocus
                />
              </Field>
              <div className="form-grid">
                <Field label="Role">
                  <select
                    name="role"
                    defaultValue={editor.item?.role ?? "Parent"}
                  >
                    {["Parent", "Kid", "Grandparent", "Family", "Pet"].map(
                      (r) => (
                        <option key={r}>{r}</option>
                      ),
                    )}
                  </select>
                </Field>
                <Field label="Favourite emoji">
                  <input
                    name="emoji"
                    defaultValue={editor.item?.emoji ?? "🌻"}
                    maxLength={10}
                  />
                </Field>
              </div>
              {colorPicker}
              <p className="form-hint">
                Their colour will help everyone spot their events and chores.
              </p>
            </>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <FormActions
            onClose={onClose}
            saving={saving}
            label={item ? "Save changes" : `Add ${titles[editor.kind]}`}
            onDelete={item && editor.kind !== "member" ? remove : undefined}
          />
        </form>
      )}
    </Modal>
  );
}
