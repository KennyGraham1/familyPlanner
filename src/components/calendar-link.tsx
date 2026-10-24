"use client";
import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, Copy, Smartphone } from "lucide-react";
import { getCloud } from "@/lib/cloud";
import { errorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/data";
import { usePlanner } from "./planner-provider";
import { SectionHeader } from "./ui";

/**
 * A private calendar link, so family events show in Apple Calendar (or any app
 * that can subscribe to a calendar). Each person has their own link.
 */
export function CalendarLinkSettings({
  embedded = false,
}: {
  embedded?: boolean;
}) {
  const { household, notify } = usePlanner();
  const [since, setSince] = useState<string | null>(null);
  // The link itself can only be shown right after it's made.
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!household) return;
    const { data, error } = await getCloud()!.rpc(
      "planner_calendar_feed_status",
      { family_id: household },
    );
    if (error) setError("Calendar link settings couldn’t be loaded.");
    else setSince(data);
  }, [household]);
  useEffect(() => {
    // Loads the link status from the server when the family changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function run(task: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      setError(errorMessage(e, "That didn’t work. Please try again."));
    } finally {
      setBusy(false);
    }
  }
  const create = () =>
    run(async () => {
      const { data, error } = await getCloud()!.rpc(
        "planner_create_calendar_feed",
        { family_id: household },
      );
      if (error) throw error;
      setToken(data);
      setSince(new Date().toISOString());
    });
  const turnOff = () =>
    run(async () => {
      const { error } = await getCloud()!.rpc("planner_remove_calendar_feed", {
        family_id: household,
      });
      if (error) throw error;
      setToken(null);
      setSince(null);
      notify("Calendar link turned off.");
    });

  const path = token ? `/api/calendar/${token}.ics` : "";
  const httpsLink = token ? `${window.location.origin}${path}` : "";
  const subscribeLink = token ? `webcal://${window.location.host}${path}` : "";

  return (
    <section
      className={
        embedded
          ? "google-calendar-settings calendar-link"
          : "card settings-card google-calendar-settings calendar-link"
      }
      aria-label="Apple Calendar link"
    >
      {!embedded && (
        <SectionHeader icon={Smartphone} title="Apple Calendar & other apps" />
      )}
      {embedded && <h3>Apple Calendar & other apps</h3>}
      <p className="google-calendar-hint">
        See family events in your iPhone’s Calendar app, or any calendar that
        can subscribe to a link. It updates on its own; changes are made here in
        Kinfolk.
      </p>
      {!household ? (
        <p className="google-calendar-hint">
          Available when your family uses a shared account.
        </p>
      ) : token ? (
        <>
          <a className="button primary" href={subscribeLink}>
            <CalendarPlus size={16} /> Add to this iPhone’s Calendar
          </a>
          <div className="calendar-link-copy">
            <code>{httpsLink}</code>
            <button
              className="button secondary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(httpsLink);
                  notify("Calendar link copied.");
                } catch {
                  notify("Select the link above to copy it.", true);
                }
              }}
            >
              <Copy size={15} /> Copy link
            </button>
          </div>
          <p className="google-calendar-hint">
            On another device, paste the link into its calendar app (Outlook, or
            Google Calendar → Other calendars → From URL). Keep it private:
            anyone with the link can see your family’s events.
          </p>
        </>
      ) : since ? (
        <p className="google-calendar-account">
          <strong>Your calendar link is on</strong>
          <span>
            Made{" "}
            {formatDate(new Date(since), { day: "numeric", month: "long" })}.
            For security it can’t be shown again; get a new one to add another
            device.
          </span>
        </p>
      ) : null}
      {household && (
        <div className="google-calendar-actions">
          {!token && (
            <button
              className={`button ${since ? "secondary" : "primary"}`}
              disabled={busy}
              onClick={() => void create()}
            >
              {since ? "Get a new link" : "Create my calendar link"}
            </button>
          )}
          {since && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => void turnOff()}
            >
              Turn off my link
            </button>
          )}
        </div>
      )}
      {since && !token && (
        <p className="google-calendar-hint">
          A new link stops the old one working on every device.
        </p>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
