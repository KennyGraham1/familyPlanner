"use client";
import { useState } from "react";
import {
  CheckCheck,
  CheckSquare,
  Clock3,
  Download,
  Flag,
  MoreHorizontal,
  Pin,
  Plus,
  Search,
  ShoppingBasket,
  Sparkles,
  StickyNote,
} from "lucide-react";
import { categories, dateKey, formatDate, uid } from "@/lib/data";
import { usePlanner } from "./planner-provider";
import { Avatar, CheckButton, EmptyState } from "./ui";
import type { ViewProps } from "./overview";

export function Shopping({ open }: ViewProps) {
  const { data, apply, notify } = usePlanner();
  const [name, setName] = useState("");
  const [category, setCategory] =
    useState<(typeof categories)[number]>("Produce");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All items");
  const done = data.shopping.filter((i) => i.done).length;
  const visible = data.shopping.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) &&
      (filter === "All items" ||
        (filter === "To buy" && !i.done) ||
        (filter === "In the bag" && i.done)),
  );
  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const value = {
      id: uid(),
      name: name.trim(),
      quantity: "",
      category,
      done: false,
    };
    if (await apply({ collection: "shopping", action: "upsert", value })) {
      setName("");
      notify("Added to the list.");
    }
  }
  async function clearBought() {
    const items = data.shopping.filter((i) => i.done);
    if (
      await apply(
        items.map((i) => ({
          collection: "shopping",
          action: "remove",
          id: i.id,
        })),
      )
    )
      notify(`${items.length} bought items cleared.`);
  }
  function exportList() {
    const content = categories
      .map((c) => {
        const items = data.shopping.filter((i) => i.category === c && !i.done);
        return items.length
          ? `${c.toUpperCase()}\n${items.map((i) => `☐ ${i.name}${i.quantity ? " — " + i.quantity : ""}`).join("\n")}`
          : "";
      })
      .filter(Boolean)
      .join("\n\n");
    const url = URL.createObjectURL(
      new Blob([`${data.settings.familyName} — Shopping list\n\n${content}`], {
        type: "text/plain",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "kinfolk-shopping.txt";
    a.click();
    URL.revokeObjectURL(url);
    notify("Your shopping list is ready to share.");
  }
  return (
    <>
      <form className="quick-add-form card" onSubmit={add}>
        <Plus size={20} />
        <input
          name="item"
          aria-label="New shopping item"
          placeholder="Add an item…"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={150}
          required
        />
        <select
          aria-label="Shopping aisle"
          value={category}
          onChange={(e) => setCategory(e.target.value as typeof category)}
        >
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <button className="button primary" type="submit">
          Add item <Plus size={16} />
        </button>
      </form>
      <div className="view-toolbar">
        <div className="segmented-control">
          {["All items", "To buy", "In the bag"].map((f) => (
            <button
              key={f}
              className={filter === f ? "active" : ""}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="toolbar-actions">
          <label className="search-field compact">
            <Search size={16} />
            <input
              placeholder="Find an item…"
              aria-label="Search shopping list"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <button
            className="icon-button bordered"
            aria-label="Download shopping list"
            title="Download shopping list"
            onClick={exportList}
          >
            <Download size={18} />
          </button>
          {done > 0 && (
            <button
              className="button secondary small-button"
              onClick={clearBought}
            >
              <CheckCheck size={16} />
              Clear bought
            </button>
          )}
        </div>
      </div>
      <div className="shopping-categories">
        {categories.map((c) => {
          const items = visible
            .filter((i) => i.category === c)
            .sort((a, b) => Number(a.done) - Number(b.done));
          return items.length ? (
            <section className="card shopping-category" key={c}>
              <div className="category-heading">
                <span className="category-emoji">
                  {
                    {
                      Produce: "🥑",
                      "Dairy & eggs": "🥛",
                      "Meat & fish": "🐟",
                      Bakery: "🥖",
                      Pantry: "🫙",
                      Household: "🧽",
                      Other: "🛍️",
                    }[c]
                  }
                </span>
                <h3>{c}</h3>
                <span className="count-badge">{items.length}</span>
              </div>
              {items.map((item) => (
                <div
                  className={`shopping-item ${item.done ? "is-done" : ""}`}
                  key={item.id}
                >
                  <CheckButton
                    done={item.done}
                    label={`Bought ${item.name}`}
                    onClick={() =>
                      void apply({
                        collection: "shopping",
                        action: "upsert",
                        value: { ...item, done: !item.done },
                      })
                    }
                  />
                  <button
                    className="shopping-item-name"
                    onClick={() => open({ kind: "shopping", item })}
                  >
                    {item.name}
                    <small>{item.quantity}</small>
                  </button>
                  <button
                    className="icon-button small row-edit"
                    aria-label={`Edit ${item.name}`}
                    onClick={() => open({ kind: "shopping", item })}
                  >
                    <MoreHorizontal size={18} />
                  </button>
                </div>
              ))}
            </section>
          ) : null;
        })}
      </div>
      {!visible.length && (
        <EmptyState
          icon={ShoppingBasket}
          title={search ? "Nothing by that name" : "The list is empty"}
          text={
            search
              ? "Try another search."
              : "Add what you need above, or send ingredients over from your meal plan."
          }
        />
      )}
    </>
  );
}

export function Chores({ open }: ViewProps) {
  const { data, apply, notify } = usePlanner();
  const [filter, setFilter] = useState("To do");
  const [member, setMember] = useState("all");
  const today = dateKey(new Date());
  const total = data.tasks.length,
    done = data.tasks.filter((t) => t.done).length;
  const visible = data.tasks.filter(
    (t) =>
      (member === "all" || t.memberId === member) &&
      (filter === "All chores" ||
        (filter === "To do" && !t.done) ||
        (filter === "Done" && t.done) ||
        (filter === "Due today" && t.due <= today && !t.done)),
  );
  return (
    <>
      <div className="view-toolbar">
        <div className="segmented-control">
          {["To do", "Due today", "Done", "All chores"].map((f) => (
            <button
              key={f}
              className={filter === f ? "active" : ""}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <select
          className="standalone-select"
          aria-label="Filter chores by person"
          value={member}
          onChange={(e) => setMember(e.target.value)}
        >
          <option value="all">The whole family</option>
          {data.members.map((m) => (
            <option value={m.id} key={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <div className="chore-columns">
        {data.members
          .filter((m) => member === "all" || m.id === member)
          .map((m) => {
            const tasks = visible
              .filter((t) => t.memberId === m.id)
              .sort(
                (a, b) =>
                  Number(b.priority === "high") -
                    Number(a.priority === "high") || a.due.localeCompare(b.due),
              );
            const memberDone = data.tasks.filter(
              (t) => t.memberId === m.id && t.done,
            ).length;
            return (
              <section className="card chore-column" key={m.id}>
                <div className={`chore-column-heading ${m.color}`}>
                  <Avatar member={m} />
                  <div>
                    <h3>{m.name}</h3>
                    <small>
                      {memberDone} done · {tasks.length} shown
                    </small>
                  </div>
                  <span>{m.emoji}</span>
                </div>
                <div className="chore-column-body">
                  {tasks.map((task) => (
                    <div
                      className={`chore-task ${task.done ? "is-done" : ""}`}
                      key={task.id}
                    >
                      <div>
                        <CheckButton
                          done={task.done}
                          label={`Complete ${task.title}`}
                          onClick={async () => {
                            if (
                              (await apply({
                                collection: "tasks",
                                action: "upsert",
                                value: { ...task, done: !task.done },
                              })) &&
                              !task.done
                            )
                              notify(`Done. Thanks, ${m.name}!`);
                          }}
                        />
                        <button
                          className="task-title"
                          onClick={() => open({ kind: "task", item: task })}
                        >
                          {task.title}
                        </button>
                      </div>
                      <div className="chore-task-meta">
                        <span
                          className={
                            !task.done && task.due < today ? "overdue" : ""
                          }
                        >
                          <Clock3 size={12} />
                          {task.due === today ? "Today" : formatDate(task.due)}
                          {!task.done && task.due < today ? " · overdue" : ""}
                        </span>
                        {task.priority === "high" && (
                          <span className="priority-tag">
                            <Flag size={11} />
                            Important
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {!tasks.length && (
                    <div className="column-empty">
                      <Sparkles size={22} />
                      <span>Nothing here</span>
                    </div>
                  )}
                </div>
                <button
                  className="add-subtle"
                  onClick={() => open({ kind: "task", memberId: m.id })}
                >
                  <Plus size={16} /> Add a chore
                </button>
              </section>
            );
          })}
      </div>
      {total > 0 && done === total && (
        <div className="celebration">
          <CheckSquare size={23} />
          <h3>All chores done</h3>
          <p>Nice work, everyone.</p>
        </div>
      )}
    </>
  );
}

export function Board({ open }: ViewProps) {
  const { data, apply, notify } = usePlanner();
  const [filter, setFilter] = useState("All notes");
  const notes = [...data.notes]
    .filter((n) => filter === "All notes" || n.pinned)
    .sort(
      (a, b) =>
        Number(b.pinned) - Number(a.pinned) ||
        b.createdAt.localeCompare(a.createdAt),
    );
  return (
    <>
      <div className="view-toolbar">
        <div className="segmented-control">
          {["All notes", "Pinned"].map((f) => (
            <button
              key={f}
              className={filter === f ? "active" : ""}
              onClick={() => setFilter(f)}
            >
              {f === "Pinned" && <Pin size={13} />} {f}
            </button>
          ))}
        </div>
      </div>
      <div className="notes-grid">
        {notes.map((n) => (
          <article key={n.id} className={`note-card ${n.color}`}>
            <div className="note-top">
              <span>
                {n.pinned ? (
                  <>
                    <Pin size={13} /> PINNED
                  </>
                ) : (
                  <StickyNote size={18} />
                )}
              </span>
              <div>
                <button
                  className="icon-button small"
                  title={n.pinned ? "Unpin note" : "Pin note"}
                  aria-label={`${n.pinned ? "Unpin" : "Pin"} ${n.title}`}
                  onClick={async () => {
                    if (
                      await apply({
                        collection: "notes",
                        action: "upsert",
                        value: { ...n, pinned: !n.pinned },
                      })
                    )
                      notify(
                        n.pinned ? "Note unpinned." : "Pinned to the top.",
                      );
                  }}
                >
                  <Pin size={16} fill={n.pinned ? "currentColor" : "none"} />
                </button>
                <button
                  className="icon-button small"
                  aria-label={`Edit ${n.title}`}
                  onClick={() => open({ kind: "note", item: n })}
                >
                  <MoreHorizontal size={18} />
                </button>
              </div>
            </div>
            <button
              className="note-content"
              onClick={() => open({ kind: "note", item: n })}
            >
              <h3>{n.title}</h3>
              <p>{n.body}</p>
            </button>
            <div className="note-footer">
              <Avatar
                member={data.members.find((m) => m.id === n.memberId)}
                small
              />
              <span>{data.members.find((m) => m.id === n.memberId)?.name}</span>
              <small>{formatDate(new Date(n.createdAt))}</small>
            </div>
          </article>
        ))}
        <button
          className="new-note-card"
          onClick={() => open({ kind: "note" })}
        >
          <span>
            <Plus size={26} />
          </span>
          <h3>New note</h3>
        </button>
      </div>
      {!notes.length && filter === "Pinned" && (
        <EmptyState
          icon={Pin}
          title="Your favourites belong here"
          text="Pin a note to keep it at the top of your family board."
        />
      )}
    </>
  );
}
