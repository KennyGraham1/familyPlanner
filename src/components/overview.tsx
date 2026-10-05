"use client";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  Navigation,
  PartyPopper,
  Plus,
  ShoppingBasket,
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
  isMultiDay,
  nextUp,
  occurrenceLabel,
  recipes,
  startOfWeek,
  type FamilyEvent,
  type Recipe,
} from "@/lib/data";
import { directionsUrl } from "@/lib/places";
import { cheer } from "@/lib/chores";
import { InstallCard } from "./install-card";
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
  day,
  onClick,
}: {
  event: FamilyEvent;
  /** The day being shown, for multi-day and all-day labels. */
  day: string;
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
        <strong>{occurrenceLabel(event, day)}</strong>
        {!event.allDay && !isMultiDay(event) && (
          <small>{formatTime(event.end)}</small>
        )}
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
/** The current time, refreshed every half minute for countdowns. */
function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  return now;
}
function countdown(minutes: number) {
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `in ${hours} h${rest ? ` ${rest} min` : ""}`;
}
function UpNext({ open }: Pick<ViewProps, "open">) {
  const { data } = usePlanner();
  const now = useNow();
  const next = nextUp(data, now);
  if (!next)
    return (
      <div className="up-next empty">
        <span className="up-next-label">Up next</span>
        <strong>Nothing planned for the next two weeks</strong>
        <button className="text-button" onClick={() => open({ kind: "event" })}>
          <Plus size={14} /> Add an event
        </button>
      </div>
    );
  const { event, day, ongoing, minutesUntil } = next;
  const members = data.members.filter((m) => event.memberIds.includes(m.id));
  const tomorrow = dateKey(addDays(now, 1));
  const when = ongoing
    ? event.allDay || isMultiDay(event)
      ? "Happening now"
      : `Happening now · until ${formatTime(event.end)}`
    : minutesUntil !== null
      ? `${formatTime(event.start)} · ${countdown(minutesUntil)}`
      : `${day === tomorrow ? "Tomorrow" : formatDate(day, { weekday: "long", day: "numeric", month: "short" })} · ${occurrenceLabel(event, day)}`;
  return (
    <div className={`up-next ${ongoing ? "ongoing" : ""}`}>
      <button
        className="up-next-main"
        onClick={() => open({ kind: "event", item: event })}
      >
        <span className="up-next-label">
          {ongoing ? "Happening now" : "Up next"}
        </span>
        <strong>{event.title}</strong>
        <span className="up-next-when">
          <Clock3 size={14} /> {when}
        </span>
        {event.location && (
          <span className="up-next-where">
            <MapPin size={14} /> {event.location}
          </span>
        )}
      </button>
      <div className="up-next-side">
        <AvatarGroup members={members} />
        {event.location && (
          <a
            className="up-next-directions"
            href={directionsUrl(event.location, event.place)}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Navigation size={14} /> Directions
          </a>
        )}
      </div>
    </div>
  );
}
export function Overview({ navigate, open, openRecipe }: ViewProps) {
  const { data, apply, notify, currentMemberId } = usePlanner();
  const [selectedDay, setSelectedDay] = useState(dateKey(new Date()));
  const [week, setWeek] = useState(
    startOfWeek(new Date(), data.settings.weekStartsMonday),
  );
  const today = dateKey(new Date());
  const current =
    data.members.find((m) => m.id === currentMemberId) ?? data.members[0];
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
  return (
    <>
      <section className="welcome-banner">
        <div className="welcome-copy">
          <span className="date-eyebrow">
            <span className="status-dot" />
            {formatDate(new Date(), {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </span>
          <h1>
            {greeting}, {current.name}
            <span className="greeting-sun" aria-hidden="true">
              ☀
            </span>
          </h1>
          <div className="welcome-summary">
            <button onClick={() => navigate("calendar")}>
              <CalendarDays size={15} />
              <strong>{todayEvents.length}</strong>{" "}
              {todayEvents.length === 1 ? "event" : "events"} today
            </button>
            <button onClick={() => navigate("chores")}>
              <CheckSquare size={15} />
              <strong>{remainingTasks.length}</strong>{" "}
              {remainingTasks.length === 1 ? "chore" : "chores"} due
            </button>
            <button onClick={() => navigate("shopping")}>
              <ShoppingBasket size={15} />
              <strong>{remainingShopping.length}</strong> to buy
            </button>
          </div>
          <UpNext open={open} />
          <button
            className="button primary heading-action"
            onClick={() => open({ kind: "quick" })}
          >
            <Plus size={17} /> Add something
          </button>
        </div>
        <div className="welcome-art">
          <img
            src="/images/family-breakfast-african.webp"
            alt="A Black African family enjoying breakfast together in a warm, sunny kitchen"
            fetchPriority="high"
          />
        </div>
      </section>
      <InstallCard />
      <div className="dashboard-grid">
        <section className="card schedule-card">
          <SectionHeader
            icon={CalendarDays}
            title="What’s happening"
            action="View calendar"
            onAction={() => navigate("calendar")}
          />
          <div className="week-label">
            <span>
              {formatDate(addDays(week, 3), { month: "long", year: "numeric" })}
            </span>
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
                  day={selectedDay}
                  onClick={() => open({ kind: "event", item: event })}
                />
              ))
            ) : (
              <EmptyState
                icon={CalendarDays}
                title="Nothing planned"
                text="No events on this day."
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
              </button>
              <div className="dinner-detail">
                <div>
                  <span className="mini-label">TONIGHT</span>
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
                  View recipe <ArrowRight size={16} />
                </button>
              </div>
            </>
          ) : (
            <EmptyState
              icon={Utensils}
              title="No dinner planned"
              text="Pick a recipe for tonight."
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
            title="Today’s chores"
            action="All chores"
            onAction={() => navigate("chores")}
          />
          <div className="chore-progress">
            {todayTasks.length > 0 && done === todayTasks.length ? (
              <span className="all-done">
                <PartyPopper size={16} /> All done for today. Nice work,
                everyone!
              </span>
            ) : (
              <strong>
                {done}/{todayTasks.length} done
              </strong>
            )}
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
                      notify(
                        cheer(
                          todayTasks,
                          task,
                          data.members.find((m) => m.id === task.memberId)
                            ?.name ?? "everyone",
                        ),
                      );
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
            <Plus size={16} /> Add a chore
          </button>
        </section>
        <section className="card shopping-preview">
          <SectionHeader
            icon={ShoppingBasket}
            title="Shopping"
            action="View list"
            onAction={() => navigate("shopping")}
          />
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
    </>
  );
}
