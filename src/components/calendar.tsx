"use client";
import { useCallback, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
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
  occurrenceLabel,
  occurrenceOn,
  startOfWeek,
  type FamilyEvent,
} from "@/lib/data";
import { usePlanner } from "./planner-provider";
import { Avatar, EmptyState, PHONE, useDismiss, useMediaQuery } from "./ui";
import { EventRow, type ViewProps } from "./overview";

type Mode = "week" | "month" | "year" | "agenda";
const AGENDA_DAYS = 30;
const MONTH_LIMIT = 3;
const monthNames = Array.from({ length: 12 }, (_, m) =>
  formatDate(new Date(2026, m, 1), { month: "short" }),
);

function range(from: Date, to: Date) {
  return `${formatDate(from)} – ${formatDate(to)} ${to.getFullYear()}`;
}
export function Calendar({ open }: ViewProps) {
  const { data, notify } = usePlanner();
  const [date, setDate] = useState(new Date());
  const [mode, setMode] = useState<Mode>("week");
  const [member, setMember] = useState("all");
  const [pickerYear, setPickerYear] = useState<number | null>(null);
  const picker = useRef<HTMLDivElement>(null);
  const closePicker = useCallback(() => setPickerYear(null), []);
  useDismiss(picker, pickerYear !== null, closePicker);
  const today = dateKey(new Date());
  // On phones the month grid shows dots; tapping a day lists its events below.
  const phone = useMediaQuery(PHONE);
  const [selectedDay, setSelectedDay] = useState(today);
  const monday = data.settings.weekStartsMonday;
  const year = date.getFullYear();
  const weekStart = startOfWeek(date, monday);
  const monthStart = startOfWeek(new Date(year, date.getMonth(), 1), monday);
  const days = Array.from({ length: mode === "month" ? 42 : 7 }, (_, i) =>
    addDays(mode === "month" ? monthStart : weekStart, i),
  );
  const title =
    mode === "week"
      ? range(weekStart, addDays(weekStart, 6))
      : mode === "month"
        ? formatDate(date, { month: "long", year: "numeric" })
        : mode === "year"
          ? String(year)
          : range(date, addDays(date, AGENDA_DAYS - 1));
  const eventsFor = (key: string) => eventsOn(data, key, member);
  const agendaDays =
    mode === "agenda"
      ? Array.from({ length: AGENDA_DAYS }, (_, i) => addDays(date, i))
          .map((d) => ({ d, key: dateKey(d), list: eventsFor(dateKey(d)) }))
          .filter(({ list }) => list.length > 0)
      : [];
  const personOf = (event: FamilyEvent) =>
    data.members.find((m) => m.id === event.memberIds[0]);

  function move(direction: number) {
    setDate(
      mode === "month"
        ? new Date(year, date.getMonth() + direction, 1)
        : mode === "year"
          ? new Date(year + direction, date.getMonth(), 1)
          : addDays(date, direction * (mode === "agenda" ? AGENDA_DAYS : 7)),
    );
  }
  function show(next: Date, nextMode: Mode) {
    setDate(next);
    setMode(nextMode);
  }
  function jumpTo(month: number) {
    setDate(new Date(pickerYear ?? year, month, 1));
    if (mode === "agenda" || mode === "week") setMode("month");
    setPickerYear(null);
  }

  function exportCalendar() {
    const escape = (value: string) =>
      value
        .replace(/\\/g, "\\\\")
        .replace(/\n/g, "\\n")
        .replace(/;/g, "\\;")
        .replace(/,/g, "\\,");
    const compact = (key: string) => key.replaceAll("-", "");
    const nextDay = (key: string) =>
      dateKey(addDays(new Date(key + "T12:00:00"), 1));
    const frequency = {
      weekly: "FREQ=WEEKLY",
      fortnightly: "FREQ=WEEKLY;INTERVAL=2",
      monthly: "FREQ=MONTHLY",
      yearly: "FREQ=YEARLY",
    };
    const events = data.events
      .filter((e) => member === "all" || e.memberIds.includes(member))
      .map((e) => {
        const last = e.endDate ?? e.date;
        const when = e.allDay
          ? [
              `DTSTART;VALUE=DATE:${compact(e.date)}`,
              // All-day end dates are exclusive in iCalendar.
              `DTEND;VALUE=DATE:${compact(nextDay(last))}`,
            ]
          : [
              `DTSTART:${compact(e.date)}T${e.start.replace(":", "")}00`,
              `DTEND:${compact(last)}T${e.end.replace(":", "")}00`,
            ];
        const until = e.until
          ? `;UNTIL=${compact(e.until)}${e.allDay ? "" : "T235959"}`
          : "";
        return [
          "BEGIN:VEVENT",
          `UID:${e.id}@kinfolk.local`,
          `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").split(".")[0]}Z`,
          ...when,
          `SUMMARY:${escape(e.title)}`,
          `LOCATION:${escape(e.location)}`,
          `DESCRIPTION:${escape(e.notes)}`,
          ...(e.repeat !== "none"
            ? [`RRULE:${frequency[e.repeat]}${until}`]
            : []),
          "END:VEVENT",
        ].join("\r\n");
      });
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
    notify("Calendar exported. Import it into your calendar app.");
  }

  function chip(event: FamilyEvent, key: string, detailed: boolean) {
    const person = personOf(event);
    const occurrence = occurrenceOn(event, key);
    const spansDays = occurrence && occurrence.start !== occurrence.end;
    return (
      <button
        key={event.id}
        className={`calendar-event ${person?.color ?? "lavender"} ${event.allDay || spansDays ? "all-day" : ""}`}
        onClick={() => open({ kind: "event", item: event })}
      >
        <span>
          {occurrenceLabel(event, key)}
          {event.repeat !== "none" && (
            <Repeat2 size={11} aria-label="Repeats" />
          )}
        </span>
        <strong>{event.title}</strong>
        {detailed && (
          <>
            {(event.location || event.category) && (
              <small>{event.location || event.category}</small>
            )}
            <Avatar member={person} small />
          </>
        )}
      </button>
    );
  }

  return (
    <>
      <div className="view-toolbar">
        <div className="date-navigation">
          <button
            className="icon-button bordered"
            aria-label={`Previous ${mode === "agenda" ? "30 days" : mode}`}
            onClick={() => move(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <div className="calendar-title" ref={picker}>
            <button
              className="calendar-title-button"
              aria-expanded={pickerYear !== null}
              aria-label={`${title}. Jump to a month`}
              onClick={() => setPickerYear(pickerYear === null ? year : null)}
            >
              <h2>{title}</h2>
              <ChevronDown size={16} />
            </button>
            {pickerYear !== null && (
              <div
                className="month-picker"
                role="dialog"
                aria-label="Jump to a month"
              >
                <div className="month-picker-year">
                  <button
                    className="icon-button small"
                    aria-label="Previous year"
                    onClick={() => setPickerYear(pickerYear - 1)}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <strong>{pickerYear}</strong>
                  <button
                    className="icon-button small"
                    aria-label="Next year"
                    onClick={() => setPickerYear(pickerYear + 1)}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
                <div className="month-picker-grid">
                  {monthNames.map((name, m) => (
                    <button
                      key={name}
                      className={
                        pickerYear === year && m === date.getMonth()
                          ? "active"
                          : ""
                      }
                      onClick={() => jumpTo(m)}
                    >
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <button
            className="icon-button bordered"
            aria-label={`Next ${mode === "agenda" ? "30 days" : mode}`}
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
            {(["week", "month", "year", "agenda"] as const).map((m) => (
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
      {mode === "year" ? (
        <section className="year-grid" aria-label={`${year} at a glance`}>
          {monthNames.map((_, m) => {
            const first = new Date(year, m, 1);
            const blanks = (first.getDay() + (monday ? 6 : 0)) % 7;
            const length = new Date(year, m + 1, 0).getDate();
            return (
              <div className="card year-month" key={m}>
                <button
                  className="year-month-title"
                  onClick={() => show(first, "month")}
                >
                  {formatDate(first, { month: "long" })}
                </button>
                <div className="year-month-days">
                  {days.slice(0, 7).map((d) => (
                    <span className="year-weekday" key={dateKey(d)}>
                      {formatDate(d, { weekday: "narrow" })}
                    </span>
                  ))}
                  {Array.from({ length: blanks }, (_, i) => (
                    <span key={`blank-${i}`} />
                  ))}
                  {Array.from({ length }, (_, i) => {
                    const d = new Date(year, m, i + 1),
                      key = dateKey(d),
                      list = eventsFor(key);
                    return (
                      <button
                        key={key}
                        className={`year-day ${key === today ? "today" : ""} ${list.length ? "busy" : ""}`}
                        aria-label={`${formatDate(d, { weekday: "long", day: "numeric", month: "long" })}${list.length ? `, ${list.length} ${list.length === 1 ? "event" : "events"}` : ""}`}
                        title={list.map((e) => e.title).join("\n") || undefined}
                        onClick={() => show(d, "week")}
                      >
                        {i + 1}
                        {list.length > 0 && (
                          <i
                            className={`member-dot ${personOf(list[0])?.color ?? "lavender"}`}
                          />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      ) : mode === "agenda" ? (
        <section className="card agenda-view">
          {agendaDays.map(({ d, key, list }) => (
            <div key={key} className="agenda-day">
              <div className="agenda-day-heading">
                <span className={key === today ? "today-number" : ""}>
                  {d.getDate()}
                </span>
                <div>
                  <strong>{formatDate(d, { weekday: "long" })}</strong>
                  <small>
                    {formatDate(d, { month: "long", year: "numeric" })}
                  </small>
                </div>
                <button
                  className="icon-button"
                  aria-label={`Add event on ${formatDate(d)}`}
                  onClick={() => open({ kind: "event", date: key })}
                >
                  <Plus size={17} />
                </button>
              </div>
              {list.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  day={key}
                  onClick={() => open({ kind: "event", item: event })}
                />
              ))}
            </div>
          ))}
          {agendaDays.length === 0 && (
            <p className="day-empty">Nothing planned in these 30 days.</p>
          )}
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
                list = eventsFor(key),
                shown = mode === "month" ? list.slice(0, MONTH_LIMIT) : list,
                hidden = list.length - shown.length;
              return (
                <div
                  key={key}
                  className={`calendar-day ${key === today ? "today" : ""} ${mode === "month" && d.getMonth() !== date.getMonth() ? "outside-month" : ""} ${mode === "month" && phone && key === selectedDay ? "selected" : ""}`}
                >
                  <div className="calendar-day-top">
                    {mode === "month" ? (
                      <button
                        className={`day-number ${key === today ? "today-number" : ""}`}
                        aria-label={
                          phone
                            ? `${formatDate(d, { weekday: "long", day: "numeric", month: "long" })}${list.length ? `, ${list.length} ${list.length === 1 ? "event" : "events"}` : ""}`
                            : `Show the week of ${formatDate(d, { day: "numeric", month: "long" })}`
                        }
                        aria-pressed={phone ? key === selectedDay : undefined}
                        onClick={() =>
                          phone ? setSelectedDay(key) : show(d, "week")
                        }
                      >
                        {d.getDate()}
                      </button>
                    ) : (
                      <span className="day-label">
                        {/* The weekday name shows when days are listed (phones). */}
                        <span className="day-name">
                          {formatDate(d, { weekday: "short" })}
                        </span>
                        <span className={key === today ? "today-number" : ""}>
                          {d.getDate()}
                        </span>
                      </span>
                    )}
                    <button
                      className="icon-button small"
                      aria-label={`Add event on ${formatDate(d)}`}
                      onClick={() => open({ kind: "event", date: key })}
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                  {mode === "month" && list.length > 0 && (
                    <span className="day-dots" aria-hidden="true">
                      {list.slice(0, 3).map((event) => (
                        <i
                          key={event.id}
                          className={`member-dot ${personOf(event)?.color ?? "lavender"}`}
                        />
                      ))}
                    </span>
                  )}
                  <div className="day-events">
                    {mode === "week" && list.length === 0 && (
                      <span className="day-free">No plans</span>
                    )}
                    {shown.map((event) => chip(event, key, mode === "week"))}
                    {hidden > 0 && (
                      <button
                        className="more-events"
                        onClick={() => show(d, "week")}
                      >
                        +{hidden} more
                      </button>
                    )}
                  </div>
                  {mode === "week" &&
                    data.meals.some((m) => m.date === key) && (
                      <div className="calendar-meal-indicator">
                        🍽 Meal planned
                      </div>
                    )}
                </div>
              );
            })}
          </div>
          {mode === "month" && phone && (
            <div className="month-day-detail">
              <div className="agenda-day-heading">
                <span className={selectedDay === today ? "today-number" : ""}>
                  {Number(selectedDay.slice(8))}
                </span>
                <div>
                  <strong>
                    {formatDate(selectedDay, { weekday: "long" })}
                  </strong>
                  <small>
                    {formatDate(selectedDay, {
                      month: "long",
                      year: "numeric",
                    })}
                  </small>
                </div>
                <button
                  className="icon-button"
                  aria-label={`Add event on ${formatDate(selectedDay)}`}
                  onClick={() => open({ kind: "event", date: selectedDay })}
                >
                  <Plus size={17} />
                </button>
              </div>
              {eventsFor(selectedDay).map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  day={selectedDay}
                  onClick={() => open({ kind: "event", item: event })}
                />
              ))}
              {eventsFor(selectedDay).length === 0 && (
                <p className="day-empty">Nothing planned.</p>
              )}
            </div>
          )}
        </section>
      )}
      {data.events.length === 0 && (
        <EmptyState
          icon={CalendarDays}
          title="No events yet"
          text="Use the + on any day to add your first event."
        />
      )}
    </>
  );
}
