"use client";
import { useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Download,
  Plus,
  Repeat2,
} from "lucide-react";
import {
  addDays,
  dateKey,
  eventsOn,
  formatDate,
  formatTime,
  startOfWeek,
} from "@/lib/data";
import { usePlanner } from "./planner-provider";
import { Avatar, EmptyState } from "./ui";
import { EventRow, type ViewProps } from "./overview";

export function Calendar({ open }: ViewProps) {
  const { data, notify } = usePlanner();
  const [date, setDate] = useState(new Date());
  const [mode, setMode] = useState<"week" | "month" | "agenda">("week");
  const [member, setMember] = useState("all");
  const today = dateKey(new Date());
  const week = startOfWeek(date, data.settings.weekStartsMonday);
  const days = Array.from({ length: mode === "month" ? 42 : 7 }, (_, i) =>
    addDays(
      mode === "month"
        ? startOfWeek(
            new Date(date.getFullYear(), date.getMonth(), 1),
            data.settings.weekStartsMonday,
          )
        : week,
      i,
    ),
  );
  function move(direction: number) {
    setDate(
      mode === "month"
        ? new Date(date.getFullYear(), date.getMonth() + direction, 1)
        : addDays(date, direction * 7),
    );
  }
  function exportCalendar() {
    const escape = (value: string) =>
      value
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,");
    const events = data.events
      .filter((e) => member === "all" || e.memberIds.includes(member))
      .map((e) =>
        [
          "BEGIN:VEVENT",
          `UID:${e.id}@kinfolk.local`,
          `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
          `DTSTART:${e.date.replaceAll("-", "")}T${e.start.replace(":", "")}00`,
          `DTEND:${e.date.replaceAll("-", "")}T${e.end.replace(":", "")}00`,
          `SUMMARY:${escape(e.title)}`,
          `LOCATION:${escape(e.location)}`,
          `DESCRIPTION:${escape(e.notes)}`,
          ...(e.repeat === "weekly" ? ["RRULE:FREQ=WEEKLY"] : []),
          "END:VEVENT",
        ].join("\r\n"),
      );
    const content = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Kinfolk//Family Planner//EN",
      "CALSCALE:GREGORIAN",
      ...events,
      "END:VCALENDAR",
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/calendar;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "kinfolk-calendar.ics";
    a.click();
    URL.revokeObjectURL(url);
    notify("Calendar exported. Import it into your favourite calendar app.");
  }
  return (
    <>
      <div className="view-toolbar">
        <div className="date-navigation">
          <button
            className="icon-button bordered"
            aria-label="Previous period"
            onClick={() => move(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <h2>{formatDate(date, { month: "long", year: "numeric" })}</h2>
          <button
            className="icon-button bordered"
            aria-label="Next period"
            onClick={() => move(1)}
          >
            <ChevronRight size={18} />
          </button>
          <button
            className="button secondary small-button"
            onClick={() => setDate(new Date())}
          >
            Today
          </button>
        </div>
        <div className="toolbar-actions">
          <div className="segmented-control">
            {(["week", "month", "agenda"] as const).map((m) => (
              <button
                key={m}
                className={mode === m ? "active" : ""}
                onClick={() => setMode(m)}
              >
                {m[0].toUpperCase() + m.slice(1)}
              </button>
            ))}
          </div>
          <button
            className="icon-button bordered"
            aria-label="Export calendar"
            title="Export calendar"
            onClick={exportCalendar}
          >
            <Download size={18} />
          </button>
        </div>
      </div>
      <div className="family-filters">
        <button
          className={`filter-chip ${member === "all" ? "active" : ""}`}
          onClick={() => setMember("all")}
        >
          The whole family
        </button>
        {data.members.map((m) => (
          <button
            key={m.id}
            className={`filter-chip ${member === m.id ? "active" : ""}`}
            onClick={() => setMember(m.id)}
          >
            <span className={`member-dot ${m.color}`} />
            {m.name}
          </button>
        ))}
      </div>
      {mode === "agenda" ? (
        <section className="card agenda-view">
          {days.map((d) => {
            const list = eventsOn(data, dateKey(d), member);
            return (
              <div key={dateKey(d)} className="agenda-day">
                <div className="agenda-day-heading">
                  <span className={dateKey(d) === today ? "today-number" : ""}>
                    {d.getDate()}
                  </span>
                  <div>
                    <strong>{formatDate(d, { weekday: "long" })}</strong>
                    <small>{formatDate(d, { month: "long" })}</small>
                  </div>
                  <button
                    className="icon-button"
                    aria-label={`Add event on ${formatDate(d)}`}
                    onClick={() => open({ kind: "event", date: dateKey(d) })}
                  >
                    <Plus size={17} />
                  </button>
                </div>
                {list.length ? (
                  list.map((event) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      onClick={() => open({ kind: "event", item: event })}
                    />
                  ))
                ) : (
                  <p className="day-empty">Nothing planned.</p>
                )}
              </div>
            );
          })}
        </section>
      ) : (
        <section className={`card calendar-container ${mode}`}>
          <div className="calendar-grid">
            {days.slice(0, 7).map((d) => (
              <div className="calendar-weekday" key={dateKey(d)}>
                {formatDate(d, { weekday: "short" })}
              </div>
            ))}
            {days.map((d) => {
              const key = dateKey(d),
                list = eventsOn(data, key, member);
              return (
                <div
                  key={key}
                  className={`calendar-day ${key === today ? "today" : ""} ${mode === "month" && d.getMonth() !== date.getMonth() ? "outside-month" : ""}`}
                >
                  <div className="calendar-day-top">
                    <span className={key === today ? "today-number" : ""}>
                      {d.getDate()}
                    </span>
                    <button
                      className="icon-button small"
                      aria-label={`Add event on ${formatDate(d)}`}
                      onClick={() => open({ kind: "event", date: key })}
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                  <div className="day-events">
                    {list.map((event) => {
                      const person = data.members.find(
                        (m) => m.id === event.memberIds[0],
                      );
                      return (
                        <button
                          key={event.id}
                          className={`calendar-event ${person?.color ?? "lavender"}`}
                          onClick={() => open({ kind: "event", item: event })}
                        >
                          <span>
                            {formatTime(event.start)}
                            {event.repeat === "weekly" && <Repeat2 size={11} />}
                          </span>
                          <strong>{event.title}</strong>
                          {mode === "week" && (
                            <>
                              <small>{event.location || event.category}</small>
                              <Avatar member={person} small />
                            </>
                          )}
                        </button>
                      );
                    })}
                    {mode === "week" && list.length === 0 && (
                      <button
                        className="unplanned-day"
                        onClick={() => open({ kind: "event", date: key })}
                      >
                        <Plus size={18} />
                        <span>New event</span>
                      </button>
                    )}
                  </div>
                  {mode === "week" &&
                    data.meals.filter((m) => m.date === key).length > 0 && (
                      <div className="calendar-meal-indicator">
                        🍽 Meal planned
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        </section>
      )}
      {data.events.length === 0 && (
        <EmptyState
          icon={CalendarDays}
          title="Make room for good things"
          text="Add your first event to get the family in sync."
        />
      )}
      <div className="help-note">
        <Repeat2 size={15} />
        <span>
          Weekly activities repeat automatically. Select any event to see its
          details or make a change.
        </span>
      </div>
    </>
  );
}
