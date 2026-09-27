"use client";
import { useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Heart,
  MapPin,
  Plus,
  ShoppingBasket,
  Sparkles,
  StickyNote,
  Utensils,
  Users,
} from "lucide-react";
import {
  addDays,
  dateKey,
  eventsOn,
  formatDate,
  formatTime,
  recipes,
  startOfWeek,
  type FamilyEvent,
  type Recipe,
} from "@/lib/data";
import { usePlanner } from "./planner-provider";
import {
  Avatar,
  AvatarGroup,
  CheckButton,
  EmptyState,
  SectionHeader,
} from "./ui";
import type { Editor } from "./forms";

export type View =
  | "overview"
  | "calendar"
  | "meals"
  | "shopping"
  | "chores"
  | "board"
  | "settings";
export type ViewProps = {
  navigate: (view: View) => void;
  open: (editor: Editor) => void;
  openRecipe: (recipe: Recipe) => void;
};
export function EventRow({
  event,
  onClick,
}: {
  event: FamilyEvent;
  onClick: () => void;
}) {
  const { data } = usePlanner();
  const members = data.members.filter((m) => event.memberIds.includes(m.id));
  const color =
    members.length === data.members.length
      ? "lavender"
      : (members[0]?.color ?? "lavender");
  return (
    <button className={`event-row ${color}-event`} onClick={onClick}>
      <span className="event-time">
        <strong>{formatTime(event.start)}</strong>
        <small>{formatTime(event.end)}</small>
      </span>
      <span className="event-stripe" />
      <span className="event-detail">
        <strong>{event.title}</strong>
        <small>
          <MapPin size={12} />
          {event.location || event.category}
        </small>
      </span>
      <AvatarGroup members={members} />
      <ChevronRight className="event-arrow" size={16} />
    </button>
  );
}
export function Overview({ navigate, open, openRecipe }: ViewProps) {
  const { data, apply, notify } = usePlanner();
  const [selectedDay, setSelectedDay] = useState(dateKey(new Date()));
  const [week, setWeek] = useState(
    startOfWeek(new Date(), data.settings.weekStartsMonday),
  );
  const today = dateKey(new Date());
  const current =
    data.members.find((m) => m.id === data.settings.currentMemberId) ??
    data.members[0];
  const todayEvents = eventsOn(data, today);
  const selectedEvents = eventsOn(data, selectedDay);
  const todayTasks = data.tasks.filter((t) => t.due <= today);
  const remainingTasks = todayTasks.filter((t) => !t.done);
  const remainingShopping = data.shopping.filter((i) => !i.done);
  const meal = data.meals.find((m) => m.date === today && m.slot === "Dinner");
  const dinner = recipes.find((r) => r.id === meal?.recipeId);
  const done = todayTasks.filter((t) => t.done).length;
  const greeting =
    new Date().getHours() < 12
      ? "Good morning"
      : new Date().getHours() < 17
        ? "Good afternoon"
        : "Good evening";
  const note = [...data.notes].sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      b.createdAt.localeCompare(a.createdAt),
  )[0];
  const stats = [
    {
      label: "On the calendar",
      count: todayEvents.length,
      foot: "a little rhythm to your day",
      Icon: CalendarDays,
      color: "lavender",
      view: "calendar" as View,
    },
    {
      label: "On the menu",
      count: dinner ? "Dinner, sorted" : "Let’s make a plan",
      foot: dinner ? dinner.name : "Good food, good company",
      Icon: Utensils,
      color: "peach",
      view: "meals" as View,
    },
    {
      label: "On the shopping list",
      count: remainingShopping.length,
      foot: "little things to pick up",
      Icon: ShoppingBasket,
      color: "sage",
      view: "shopping" as View,
    },
    {
      label: "A little teamwork",
      count: `${done} of ${todayTasks.length}`,
      foot: "today’s chores, all done",
      Icon: CheckSquare,
      color: "blue",
      view: "chores" as View,
    },
  ];
  return (
    <>
      <section className="welcome-banner">
        <div className="welcome-copy">
          <span className="eyebrow">
            <span className="little-sun">✳</span> A FRESH LITTLE START
          </span>
          <h2>
            {greeting}, {current.name}
            <span className="greeting-sun">☀</span>
          </h2>
          <p>Life gets busy. Let’s make room for what matters.</p>
          <div className="welcome-summary">
            <span>
              <CalendarDays size={15} />
              <strong>{todayEvents.length}</strong> events today
            </span>
            <span className="summary-dot" />
            <span>
              <CheckSquare size={15} />
              <strong>{remainingTasks.length}</strong> little to-dos
            </span>
          </div>
          <span className="welcome-signoff">You’ve got this, together.</span>
        </div>
        <div className="welcome-art">
          <img
            src="/images/family-breakfast.webp"
            alt="A family enjoying breakfast together in a warm, sunny kitchen"
            fetchPriority="high"
          />
        </div>
        <span className="welcome-flower">✻</span>
      </section>
      <div className="stats-grid">
        {stats.map(({ label, count, foot, Icon, color, view }) => (
          <button
            key={label}
            className="stat-card"
            onClick={() => navigate(view)}
          >
            <div className="stat-top">
              <span>{label}</span>
              <span className={`stat-icon ${color}`}>
                <Icon size={19} />
              </span>
            </div>
            <strong
              className={
                typeof count === "string" && count.length > 8 ? "stat-word" : ""
              }
            >
              {count}
            </strong>
            <small>{foot}</small>
          </button>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="card schedule-card">
          <SectionHeader
            icon={CalendarDays}
            title="What’s happening"
            action="View calendar"
            onAction={() => navigate("calendar")}
          />
          <div className="week-label">
            <span>{formatDate(week, { month: "long", year: "numeric" })}</span>
            <div>
              <button
                className="icon-button small"
                aria-label="Previous week"
                onClick={() => setWeek(addDays(week, -7))}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                className="icon-button small"
                aria-label="Next week"
                onClick={() => setWeek(addDays(week, 7))}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
          <div className="week-strip">
            {Array.from({ length: 7 }, (_, i) => addDays(week, i)).map((d) => {
              const key = dateKey(d);
              return (
                <button
                  className={`${key === selectedDay ? "selected" : ""} ${key === today ? "is-today" : ""}`}
                  onClick={() => setSelectedDay(key)}
                  key={key}
                >
                  <small>{formatDate(d, { weekday: "short" })}</small>
                  <strong>{d.getDate()}</strong>
                  <span
                    className={
                      eventsOn(data, key).length ? "day-dot active" : "day-dot"
                    }
                  />
                </button>
              );
            })}
          </div>
          <div className="agenda-label">
            {selectedDay === today
              ? "TODAY"
              : formatDate(selectedDay, { weekday: "long" }).toUpperCase()}
            <span>{selectedEvents.length} events</span>
          </div>
          <div className="event-list">
            {selectedEvents.length ? (
              selectedEvents.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  onClick={() => open({ kind: "event", item: event })}
                />
              ))
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="A little breathing room"
                text="No plans for this day. Enjoy the possibilities."
              />
            )}
          </div>
          <button
            className="add-subtle"
            onClick={() => open({ kind: "event", date: selectedDay })}
          >
            <Plus size={16} /> Add an event
          </button>
        </section>
        <section className="card dinner-card">
          <SectionHeader
            icon={Utensils}
            title="What’s for dinner?"
            action="Meal plan"
            onAction={() => navigate("meals")}
          />
          {dinner ? (
            <>
              <button
                className="dinner-photo"
                onClick={() => openRecipe(dinner)}
              >
                <img src={dinner.image} alt={dinner.name} />
                <span className="photo-badge">
                  <Sparkles size={13} /> FAMILY FAVOURITE
                </span>
                <span className="photo-view">
                  View recipe <ArrowRight size={15} />
                </span>
              </button>
              <div className="dinner-detail">
                <div>
                  <span className="mini-label">TONIGHT’S LITTLE COMFORT</span>
                  <h3>{dinner.name}</h3>
                  <p>{dinner.subtitle}</p>
                  <div className="recipe-meta">
                    <span>
                      <Clock3 size={14} />
                      {dinner.time} min
                    </span>
                    <span>
                      <Users size={14} />
                      Serves {dinner.servings}
                    </span>
                    <span className="diet-tag">{dinner.category}</span>
                  </div>
                </div>
                <button
                  className="button soft-purple full-width"
                  onClick={() => openRecipe(dinner)}
                >
                  Let’s get cooking <ArrowRight size={16} />
                </button>
              </div>
            </>
          ) : (
            <EmptyState
              icon={Utensils}
              title="Something delicious awaits"
              text="Pick a family favourite and make tonight a little easier."
              action={
                <button
                  className="button primary"
                  onClick={() => navigate("meals")}
                >
                  Plan dinner
                </button>
              }
            />
          )}
        </section>
        <section className="card chores-preview">
          <SectionHeader
            icon={CheckSquare}
            title="Little things, big help"
            action="All chores"
            onAction={() => navigate("chores")}
          />
          <div className="chore-progress">
            <span>
              Teamwork makes home work <Heart size={12} />
            </span>
            <strong>
              {done}/{todayTasks.length} done
            </strong>
          </div>
          <div className="progress-track">
            <span
              style={{
                width: `${todayTasks.length ? (done / todayTasks.length) * 100 : 0}%`,
              }}
            />
          </div>
          <div className="task-list">
            {todayTasks.slice(0, 5).map((task) => (
              <div
                className={`task-row ${task.done ? "is-done" : ""}`}
                key={task.id}
              >
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
                      notify("One little thing done. Thanks for helping!");
                  }}
                />
                <button
                  className="task-title"
                  onClick={() => open({ kind: "task", item: task })}
                >
                  {task.title}
                </button>
                <Avatar
                  member={data.members.find((m) => m.id === task.memberId)}
                  small
                />
              </div>
            ))}
          </div>
          <button className="add-subtle" onClick={() => open({ kind: "task" })}>
            <Plus size={16} /> Add a little to-do
          </button>
        </section>
        <section className="card shopping-preview">
          <SectionHeader
            icon={ShoppingBasket}
            title="A quick shop"
            action="View list"
            onAction={() => navigate("shopping")}
          />
          <p className="section-subtitle">
            A few things for a well-stocked week.
          </p>
          <div className="shopping-mini-list">
            {remainingShopping.slice(0, 4).map((item) => (
              <div className="shopping-mini-row" key={item.id}>
                <CheckButton
                  done={false}
                  label={`Bought ${item.name}`}
                  onClick={() =>
                    void apply({
                      collection: "shopping",
                      action: "upsert",
                      value: { ...item, done: true },
                    })
                  }
                />
                <span>{item.name}</span>
                <small>{item.quantity}</small>
              </div>
            ))}
            {remainingShopping.length === 0 && (
              <p className="all-done">
                <Check size={18} /> Everything’s in the bag!
              </p>
            )}
          </div>
          <div className="shopping-preview-footer">
            <span>{remainingShopping.length} items to pick up</span>
            <button
              className="text-button"
              onClick={() => open({ kind: "shopping" })}
            >
              <Plus size={14} /> Add item
            </button>
          </div>
        </section>
      </div>
      {note && (
        <section className={`board-preview ${note.color}`}>
          <span className="board-preview-icon">
            <StickyNote size={24} />
          </span>
          <div>
            <span className="mini-label">
              A NOTE FROM{" "}
              {data.members
                .find((m) => m.id === note.memberId)
                ?.name.toUpperCase()}
            </span>
            <h3>{note.title}</h3>
            <p>{note.body}</p>
          </div>
          <button
            className="button note-button"
            onClick={() => navigate("board")}
          >
            Family board <ArrowRight size={15} />
          </button>
        </section>
      )}
      <div className="page-footer">
        <Heart size={13} /> A little more organised. A lot more together.
      </div>
    </>
  );
}
