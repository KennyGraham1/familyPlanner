"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  ExternalLink,
  Link2,
  RefreshCw,
  Unplug,
} from "lucide-react";
import {
  calendarRequest,
  type CalendarStatus,
} from "@/lib/google-calendar/client";
import { usePlanner } from "./planner-provider";
import { Field, SectionHeader } from "./ui";

const changed = "kinfolk-google-calendar-changed";
const checked = "kinfolk-google-calendar-checked";
const callbackMessages: Record<string, string> = {
  connected:
    "Google account connected. Check the calendar details below to continue.",
  cancelled: "Google Calendar connection was cancelled.",
  expired: "The connection request expired. Please try connecting again.",
  permissions:
    "Allow both calendar permissions when connecting to enable two-way sync.",
  "different-account":
    "Reconnect using the Google account already linked to this family.",
  busy: "A sync is running. Please try connecting again in a moment.",
  failed: "Google Calendar could not connect. Please try again.",
};

export function GoogleCalendarSettings({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const { data, household, isOwner, currentMemberId, refreshCloud } =
    usePlanner();
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [calendarId, setCalendarId] = useState("");
  const [memberId, setMemberId] = useState(currentMemberId);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const load = useCallback(async () => {
    if (!household) return;
    try {
      setStatus(await calendarRequest<CalendarStatus>());
      setError("");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Connection status could not be loaded.",
      );
    }
  }, [household]);
  useEffect(() => {
    let active = true;
    if (household)
      void calendarRequest<CalendarStatus>()
        .then((s) => {
          if (active) setStatus(s);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    const query = new URLSearchParams(window.location.search);
    const result = query.get("googleCalendar");
    if (result) {
      queueMicrotask(() => {
        if (active)
          setMessage(callbackMessages[result] ?? callbackMessages.failed);
      });
      query.delete("googleCalendar");
      history.replaceState(
        null,
        "",
        `${location.pathname}${query.size ? `?${query}` : ""}${location.hash}`,
      );
    }
    return () => {
      active = false;
    };
  }, [household]);
  useEffect(() => {
    const refresh = () => {
      void load();
    };
    window.addEventListener(changed, refresh);
    window.addEventListener(checked, refresh);
    return () => {
      window.removeEventListener(changed, refresh);
      window.removeEventListener(checked, refresh);
    };
  }, [load]);
  async function action(body: unknown, path = "") {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await calendarRequest<{ url?: string; busy?: boolean }>(
        path,
        body,
      );
      if (response.url) {
        window.location.assign(response.url);
        return;
      }
      await load();
      await refreshCloud();
      window.dispatchEvent(new Event(path === "/sync" ? checked : changed));
      setMessage(
        response.busy
          ? "A sync is already running. Please try again shortly."
          : path === "/sync"
            ? "Sync checked. Review any items below that need attention."
            : "Calendar connection updated.",
      );
      setConfirmDisconnect(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }
  const canManage = isOwner && status?.canManage !== false;
  return (
    <section
      className={
        embedded
          ? "google-calendar-settings"
          : "card settings-card google-calendar-settings"
      }
      id="google-calendar-settings"
      aria-label="Google Calendar connection"
    >
      {!embedded && (
        <SectionHeader icon={CalendarDays} title="Google Calendar" />
      )}
      <p>Keep your family’s events up to date in both calendars.</p>
      {message && (
        <p className="form-success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!household ? (
        <p className="google-calendar-hint">
          Sign in to a shared family account to connect Google Calendar.
        </p>
      ) : !status ? (
        <p className="google-calendar-hint">
          {error
            ? "Check your connection, then try again."
            : "Checking calendar connection…"}
        </p>
      ) : !status.configured ? (
        <p className="google-calendar-hint">
          Google Calendar needs to be enabled by the person who manages this app
          before you can connect.
        </p>
      ) : (
        <>
          {status.connected && (
            <p className="google-calendar-account">
              <strong>{status.calendarName ?? "Choose your calendar"}</strong>
              <span>{status.email}</span>
            </p>
          )}
          {!canManage && (
            <p className="google-calendar-hint">
              The family owner manages this connection.
            </p>
          )}
          {canManage && (!status.connected || status.error) && (
            <button
              className="button primary"
              disabled={busy}
              onClick={() => void action({ action: "connect" })}
            >
              <Link2 size={16} />
              {busy
                ? "Connecting…"
                : status.connected
                  ? "Reconnect Google Calendar"
                  : "Connect Google Calendar"}
            </button>
          )}
          {status.connected && !status.enabled && canManage && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action({ action: "select", calendarId, memberId });
              }}
            >
              <Field label="Google calendar to share">
                <select
                  required
                  value={calendarId}
                  onChange={(e) => setCalendarId(e.target.value)}
                >
                  <option value="">Choose a calendar…</option>
                  {status.calendars?.map((c) => (
                    <option value={c.id} key={c.id}>
                      {c.name}
                      {c.primary ? " (primary)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Assign imported events to">
                <select
                  value={memberId}
                  onChange={(e) => setMemberId(e.target.value)}
                >
                  {data.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
              <p className="google-calendar-hint">
                Events in this Google calendar will be visible to your Kinfolk
                family. Kinfolk events will be added to it. Edits and deletions
                will be shared both ways.
              </p>
              <p className="google-calendar-hint">
                Choose a family calendar you’re comfortable sharing. Times will
                use{" "}
                {status.calendars?.find((c) => c.id === calendarId)?.timezone ??
                  "the selected calendar’s time zone"}
                .
              </p>
              <button className="button primary" disabled={busy || !calendarId}>
                {busy ? "Linking…" : "Start two-way sync"}
              </button>
            </form>
          )}
          {status.enabled && (
            <>
              <p className="google-calendar-hint">
                {status.lastSynced
                  ? `Last checked ${new Date(status.lastSynced).toLocaleString()}.`
                  : "Ready for the first sync."}{" "}
                Times use {status.timezone}.
              </p>
              <p className="google-calendar-hint">
                Sync checks every minute while Kinfolk is open. Background sync
                runs when the app’s scheduler is set up.
              </p>
              <div className="google-calendar-actions">
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => void action({}, "/sync")}
                >
                  <RefreshCw size={16} />
                  {busy ? "Syncing…" : "Sync now"}
                </button>
                <a
                  className="text-button"
                  href="https://calendar.google.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Google Calendar <ExternalLink size={14} />
                </a>
              </div>
            </>
          )}
          {status.error && (
            <p className="form-error" role="status">
              {status.error}
            </p>
          )}
          {!!status.conflicts?.length && (
            <div className="google-calendar-review">
              <h3>Changes to review</h3>
              <p>
                These events changed in both calendars. Choose which version to
                keep.
              </p>
              {status.conflicts.map((c) => (
                <div className="google-calendar-conflict" key={c.eventId}>
                  <strong>{c.title}</strong>
                  <p>
                    Kinfolk:{" "}
                    {c.kinfolk
                      ? `${c.kinfolk.title} · ${c.kinfolk.date} · ${c.kinfolk.start}`
                      : "Deleted"}
                  </p>
                  <p>
                    Google:{" "}
                    {c.google
                      ? `${c.google.title} · ${c.google.date} · ${c.google.start}`
                      : "Deleted"}
                  </p>
                  <div className="google-calendar-actions">
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        void action(
                          {
                            resolve: { eventId: c.eventId, prefer: "kinfolk" },
                          },
                          "/sync",
                        )
                      }
                    >
                      Keep Kinfolk version
                    </button>
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        void action(
                          { resolve: { eventId: c.eventId, prefer: "google" } },
                          "/sync",
                        )
                      }
                    >
                      Keep Google version
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!!status.issues?.length && (
            <details className="google-calendar-review">
              <summary>
                {status.issues.length} event
                {status.issues.length === 1 ? "" : "s"} need attention
              </summary>
              <ul>
                {status.issues.map((issue, i) => (
                  <li key={i}>
                    <strong>{issue.title}</strong> — {issue.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {canManage &&
            status.connected &&
            (confirmDisconnect ? (
              <div className="google-calendar-review">
                <p>
                  Stop syncing? Existing events will stay in both calendars.
                </p>
                <div className="google-calendar-actions">
                  <button
                    className="button danger"
                    disabled={busy}
                    onClick={() => void action({ action: "disconnect" })}
                  >
                    Disconnect
                  </button>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => setConfirmDisconnect(false)}
                  >
                    Keep connected
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="text-button"
                disabled={busy}
                onClick={() => setConfirmDisconnect(true)}
              >
                <Unplug size={14} /> Disconnect Google Calendar
              </button>
            ))}
        </>
      )}
      {household && error && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => void load()}
        >
          Try again
        </button>
      )}
    </section>
  );
}

/** Runs for a signed-in family on every screen, including after a phone wakes up. */
export function GoogleCalendarAutoSync() {
  const { household, phase, data, refreshCloud } = usePlanner();
  const inFlight = useRef(false);
  const previousEvents = useRef("");
  const check = useCallback(async () => {
    if (
      !household ||
      phase !== "ready" ||
      inFlight.current ||
      document.visibilityState === "hidden" ||
      !navigator.onLine
    )
      return;
    inFlight.current = true;
    try {
      const status = await calendarRequest<CalendarStatus>();
      if (status.enabled) {
        await calendarRequest("/sync", {});
        await refreshCloud();
        window.dispatchEvent(new Event(checked));
      }
    } catch {
      /* Connection details and retry controls are shown in Calendar settings. */
    } finally {
      inFlight.current = false;
    }
  }, [household, phase, refreshCloud]);
  useEffect(() => {
    if (!household || phase !== "ready") return;
    void check();
    const timer = setInterval(() => void check(), 60000);
    const wake = () => {
      void check();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    window.addEventListener(changed, wake);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener(changed, wake);
    };
  }, [household, phase, check]);
  useEffect(() => {
    const next = JSON.stringify(data.events);
    if (next === previousEvents.current) return;
    previousEvents.current = next;
    const timer = setTimeout(() => void check(), 5000);
    return () => clearTimeout(timer);
  }, [data.events, check]);
  return null;
}
