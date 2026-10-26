"use client";
import { useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Repeat2,
  Utensils,
} from "lucide-react";
import {
  dateKey,
  eventsOn,
  formatDate,
  formatTime,
  isMultiDay,
  type FamilyEvent,
} from "@/lib/data";
import { weekSpans, type WeekSpan } from "@/lib/calendar-layout";
import { usePlanner } from "./planner-provider";
import { PHONE, useMediaQuery } from "./ui";
import type { Editor } from "./forms";
import styles from "./calendar-week.module.css";

function spanLabel({ event, occurrence }: WeekSpan) {
  if (occurrence.start === occurrence.end) return "All day";
  const start = formatDate(occurrence.start);
  const end = formatDate(occurrence.end);
  return event.allDay
    ? `${start} – ${end}`
    : `${start}, ${formatTime(event.start)} – ${end}, ${formatTime(event.end)}`;
}

export function CalendarWeek({
  days,
  member,
  open,
}: {
  days: Date[];
  member: string;
  open: (editor: Editor) => void;
}) {
  const { data } = usePlanner();
  const phone = useMediaQuery(PHONE);
  const [showEarlier, setShowEarlier] = useState(false);
  const today = dateKey(new Date());
  const todayIndex = days.findIndex((d) => dateKey(d) === today);
  const earlier = phone && !showEarlier && todayIndex > 0 ? todayIndex : 0;
  const spans = weekSpans(data.events, dateKey(days[0]), member).filter(
    (s) => s.end >= earlier,
  );
  const color = (event: FamilyEvent) =>
    styles[
      data.members.find((m) => m.id === event.memberIds[0])?.color ?? "lavender"
    ];
  const people = (event: FamilyEvent) =>
    data.members
      .filter((m) => event.memberIds.includes(m.id))
      .map((m) => m.name)
      .join(", ");
  const addButton = (day: string) => (
    <button
      className={styles.add}
      aria-label={`Add event on ${formatDate(day)}`}
      onClick={() => open({ kind: "event", date: day })}
    >
      <Plus size={16} />
    </button>
  );
  return (
    <section className={`card ${styles.week}`} aria-label="Week calendar">
      <div className={styles.headers}>
        {days.map((d) => {
          const key = dateKey(d);
          return (
            <div key={key} className={styles.header}>
              <time
                dateTime={key}
                aria-current={key === today ? "date" : undefined}
              >
                <span>{formatDate(d, { weekday: "short" })}</span>
                <strong className={key === today ? styles.today : undefined}>
                  {d.getDate()}
                </strong>
              </time>
              {addButton(key)}
            </div>
          );
        })}
      </div>
      {spans.length > 0 && (
        <div className={styles.ongoing}>
          <p className={styles.ongoingLabel}>All day & longer plans</p>
          <div
            className={styles.spans}
            role="group"
            aria-label="All-day and multi-day events"
          >
            {spans.map((span) => {
              const {
                event,
                occurrence,
                start,
                end,
                lane,
                continuesBefore,
                continuesAfter,
              } = span;
              const label = spanLabel(span);
              const description = `${event.title}. ${label}. ${people(event)}`;
              return (
                <button
                  key={`${event.id}:${occurrence.start}`}
                  className={`${styles.span} ${color(event)} ${continuesBefore ? styles.continuesBefore : ""} ${continuesAfter ? styles.continuesAfter : ""}`}
                  style={{
                    gridColumn: `${start + 1} / ${end + 2}`,
                    gridRow: lane + 1,
                  }}
                  aria-label={description}
                  title={description}
                  onClick={() =>
                    open({ kind: "event", item: event, day: occurrence.start })
                  }
                >
                  {continuesBefore && (
                    <ChevronLeft size={12} aria-hidden="true" />
                  )}
                  <strong>{event.title}</strong>
                  <small
                    className={
                      end - start >= 2 ? styles.wideLabel : styles.shortLabel
                    }
                  >
                    {label}
                  </small>
                  {event.repeat !== "none" && (
                    <Repeat2 size={12} aria-label="Repeats" />
                  )}
                  {continuesAfter && (
                    <ChevronRight size={12} aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {earlier > 0 && (
        <button className={styles.earlier} onClick={() => setShowEarlier(true)}>
          <ChevronDown size={15} /> Show earlier this week
        </button>
      )}
      <div className={styles.days}>
        {days.slice(earlier).map((d) => {
          const key = dateKey(d);
          const appointments = eventsOn(data, key, member).filter(
            (e) => !e.allDay && !isMultiDay(e),
          );
          return (
            <section
              key={key}
              className={styles.day}
              aria-label={formatDate(d, {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            >
              <h3 className={styles.mobileDate}>
                <span>{formatDate(d, { weekday: "short" })}</span>
                <strong className={key === today ? styles.today : undefined}>
                  {d.getDate()}
                </strong>
              </h3>
              <div className={styles.mobileAdd}>{addButton(key)}</div>
              <div className={styles.appointments}>
                {appointments.map((event) => (
                  <button
                    key={event.id}
                    className={`${styles.appointment} ${color(event)}`}
                    title={`${event.title} · ${people(event)}${event.location ? ` · ${event.location}` : ""}`}
                    aria-label={`${formatTime(event.start)} to ${formatTime(event.end)}. ${event.title}. ${people(event)}${event.location ? `. ${event.location}` : ""}`}
                    onClick={() =>
                      open({ kind: "event", item: event, day: key })
                    }
                  >
                    <span className={styles.time}>
                      {formatTime(event.start)}
                      {event.repeat !== "none" && (
                        <Repeat2 size={11} aria-label="Repeats" />
                      )}
                    </span>
                    <strong>{event.title}</strong>
                    {event.location && <small>{event.location}</small>}
                  </button>
                ))}
                {appointments.length === 0 && (
                  <span className={styles.empty}>No appointments</span>
                )}
                {data.meals.some((m) => m.date === key) && (
                  <span className={styles.meal}>
                    <Utensils size={12} aria-hidden="true" /> Meal planned
                  </span>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
