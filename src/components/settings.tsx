"use client";
import { useRef, useState } from "react";
import {
  Check,
  Cloud,
  Download,
  Heart,
  LogOut,
  Plus,
  RefreshCw,
  ShieldCheck,
  Upload,
  Users,
} from "lucide-react";
import { dataSchema, type PlannerData } from "@/lib/data";
import { getCloud } from "@/lib/cloud";
import { usePlanner } from "./planner-provider";
import { Avatar, Field, Modal, SectionHeader } from "./ui";
import type { ViewProps } from "./overview";

export function Settings({ open }: ViewProps) {
  const { data, apply, notify, replaceData, household, startOver } =
    usePlanner();
  const [familyName, setFamilyName] = useState(data.settings.familyName);
  const [currentMemberId, setCurrentMemberId] = useState(
    data.settings.currentMemberId,
  );
  const [weekStartsMonday, setWeekStartsMonday] = useState(
    data.settings.weekStartsMonday,
  );
  const [imported, setImported] = useState<PlannerData | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [startOverConfirm, setStartOverConfirm] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (
      await apply({
        collection: "settings",
        action: "settings",
        value: {
          familyName: familyName.trim(),
          currentMemberId,
          weekStartsMonday,
        },
      })
    )
      notify("Preferences saved.");
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `kinfolk-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify("Your family backup has been downloaded.");
  }
  async function readBackup(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 5_000_000) {
      notify("Please choose a backup smaller than 5 MB.", true);
      return;
    }
    try {
      const parsed = dataSchema.parse(JSON.parse(await file.text()));
      setImported(parsed);
    } catch {
      notify(
        "That file is not a valid Kinfolk backup. Your current plans are unchanged.",
        true,
      );
    }
  }
  function clearPlans() {
    const cleared = {
      ...data,
      events: [],
      tasks: [],
      meals: [],
      shopping: [],
      notes: [],
    };
    if (replaceData(cleared)) {
      notify("A fresh page for your family.");
      setClearConfirm(false);
    }
  }
  return (
    <div className="settings-grid">
      <div>
        <CloudSettings />
        <section className="card settings-card">
          <SectionHeader icon={Heart} title="Preferences" />
          <form onSubmit={save}>
            <Field label="Your family space">
              <input
                required
                value={familyName}
                maxLength={150}
                onChange={(e) => setFamilyName(e.target.value)}
              />
            </Field>
            <Field
              label="Who should we greet?"
              hint="This is the default name for greetings and new plans in this family space."
            >
              <select
                value={currentMemberId}
                onChange={(e) => setCurrentMemberId(e.target.value)}
              >
                {data.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Start the week on">
              <select
                value={weekStartsMonday ? "monday" : "sunday"}
                onChange={(e) =>
                  setWeekStartsMonday(e.target.value === "monday")
                }
              >
                <option value="monday">Monday</option>
                <option value="sunday">Sunday</option>
              </select>
            </Field>
            <button type="submit" className="button primary">
              <Check size={16} />
              Save preferences
            </button>
          </form>
        </section>
        <section className="card settings-card">
          <SectionHeader icon={Users} title="Family members" />
          <div className="settings-members">
            {data.members.map((m) => (
              <button
                key={m.id}
                onClick={() => open({ kind: "member", item: m })}
              >
                <Avatar member={m} />
                <span>
                  <strong>{m.name}</strong>
                  <small>{m.role}</small>
                </span>
                <span className="member-emoji">{m.emoji}</span>
                <span className="text-button">Edit</span>
              </button>
            ))}
          </div>
          <button
            className="button secondary full-width"
            onClick={() => open({ kind: "member" })}
          >
            <Plus size={16} />
            Add a family member
          </button>
          <p className="form-hint">
            Family profiles help organise your plans. Use a shared family space
            to invite someone on their own device.
          </p>
        </section>
      </div>
      <div>
        <section className="card settings-card">
          <SectionHeader icon={ShieldCheck} title="Backup" />
          <p className="settings-description">
            Take a copy of your family’s plans, lists and notes whenever you
            like.
          </p>
          <div className="backup-buttons">
            <button className="button secondary" onClick={download}>
              <Download size={16} />
              Download backup
            </button>
            <button
              className="button secondary"
              disabled={Boolean(household)}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={16} />
              Restore backup
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            aria-label="Restore family backup file"
            accept="application/json,.json"
            className="sr-only"
            onChange={readBackup}
          />
          <p className="form-hint">
            {household
              ? "Restoring a backup isn’t available in a shared family space."
              : "Restoring replaces the plans in this browser. Download a backup first."}
          </p>
          {!household && (
            <div className="fresh-start">
              <div>
                <strong>A fresh start</strong>
                <p>Clear the plans and lists. Keep your family members.</p>
              </div>
              <button
                className="button danger-quiet"
                onClick={() => setClearConfirm(true)}
              >
                Clear plans
              </button>
            </div>
          )}
          {!household && (
            <div className="fresh-start">
              <div>
                <strong>Start over</strong>
                <p>Delete all plans and family members in this browser.</p>
              </div>
              <button
                className="button danger-quiet"
                onClick={() => setStartOverConfirm(true)}
              >
                Start over
              </button>
            </div>
          )}
        </section>
      </div>
      {imported && (
        <Modal
          title="Restore your family backup?"
          subtitle="Let’s make sure this is the right one."
          onClose={() => setImported(null)}
        >
          <div className="backup-preview">
            <h3>{imported.settings.familyName}</h3>
            <p>
              {imported.members.length} people · {imported.events.length} events
              · {imported.tasks.length} chores
            </p>
            <p>
              {imported.shopping.length} shopping items ·{" "}
              {imported.meals.length} meals · {imported.notes.length} notes
            </p>
          </div>
          <p className="settings-description">
            This will replace the plans currently saved in this browser.
            Download your current backup if you’d like to keep it.
          </p>
          <div className="form-actions">
            <button
              className="button secondary"
              onClick={() => setImported(null)}
            >
              Cancel
            </button>
            <button
              className="button primary"
              onClick={() => {
                if (replaceData(imported)) {
                  // The form still holds the previous family's settings.
                  setFamilyName(imported.settings.familyName);
                  setCurrentMemberId(imported.settings.currentMemberId);
                  setWeekStartsMonday(imported.settings.weekStartsMonday);
                  notify("Your plans have been restored.");
                  setImported(null);
                }
              }}
            >
              Restore this backup
            </button>
          </div>
        </Modal>
      )}
      {clearConfirm && (
        <Modal
          title="A fresh page for your family?"
          subtitle="Your family members and preferences will stay."
          onClose={() => setClearConfirm(false)}
        >
          <p className="settings-description">
            This clears all events, chores, shopping items, meal plans and notes
            in this browser. Download a backup first if you’d like to keep them.
          </p>
          <div className="form-actions">
            <button
              className="button secondary"
              onClick={() => setClearConfirm(false)}
            >
              Keep my plans
            </button>
            <button className="button danger" onClick={clearPlans}>
              Clear all plans
            </button>
          </div>
        </Modal>
      )}
      {startOverConfirm && (
        <Modal
          title="Start over?"
          subtitle="This can’t be undone."
          onClose={() => setStartOverConfirm(false)}
        >
          <p className="settings-description">
            This deletes every plan and family member saved in this browser and
            takes you back to family setup. Download a backup first if you’d
            like to keep them.
          </p>
          <div className="form-actions">
            <button
              className="button secondary"
              onClick={() => setStartOverConfirm(false)}
            >
              Cancel
            </button>
            <button className="button danger" onClick={startOver}>
              Delete everything
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function CloudSettings() {
  const {
    notify,
    cloudConfigured,
    email,
    household,
    syncError,
    refreshCloud,
    signOut,
    busy,
  } = usePlanner();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [invite, setInvite] = useState("");
  async function getInvite() {
    setLoading(true);
    setError("");
    try {
      const { data: token, error } = await getCloud()!.rpc(
        "planner_create_invite",
        { family_id: household },
      );
      if (error) throw error;
      setInvite(token);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create invitation.");
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="card settings-card cloud-card" id="account">
      <SectionHeader icon={Cloud} title="Account" />
      {!cloudConfigured ? (
        <>
          <div className="local-mode">
            <span className="status-dot" />
            <div>
              <strong>Sign-in isn’t set up yet</strong>
              <p>
                Plans are saved in this browser only. Connect a Supabase project
                to turn on accounts.
              </p>
            </div>
          </div>
          <details className="setup-details" open>
            <summary>Set up sign-in</summary>
            <p>
              Connect this app to a Supabase project to enable secure accounts
              and shared plans.
            </p>
            <ol>
              <li>
                Run <code>supabase/schema.sql</code> in your project’s SQL
                editor.
              </li>
              <li>
                Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to your Vercel
                environment.
              </li>
              <li>
                Set your Supabase Auth site URL to your Vercel address, then
                redeploy.
              </li>
            </ol>
            <p>The README includes the complete setup guide.</p>
          </details>
        </>
      ) : (
        <>
          <div className="account-state">
            <span className="cloud-avatar">
              <Cloud size={22} />
            </span>
            <div>
              <strong>Signed in</strong>
              <small>{email}</small>
            </div>
          </div>
          <p className="form-hint">
            Family plans refresh every 15 seconds and when you return to the
            app.
          </p>
          <div className="backup-buttons">
            <button
              className="button secondary"
              disabled={loading || busy}
              onClick={getInvite}
            >
              <Plus size={16} />
              Create invite code
            </button>
            <button
              className="icon-button bordered"
              disabled={busy}
              aria-label="Refresh family data"
              onClick={() => void refreshCloud()}
            >
              <RefreshCw size={16} />
            </button>
          </div>
          {invite && (
            <div className="invite-code">
              <label>Share this code privately with your family</label>
              <code>{invite}</code>
              <p>Valid for 7 days. Creating another code replaces this one.</p>
              <button
                className="text-button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(invite);
                    notify("Invite code copied.");
                  } catch {
                    notify("Select the code above to copy it.", true);
                  }
                }}
              >
                Copy code
              </button>
            </div>
          )}
          <button
            className="text-button signout-button"
            onClick={() => void signOut()}
            disabled={busy || loading}
          >
            <LogOut size={14} />
            Sign out
          </button>
        </>
      )}
      {(error || syncError) && (
        <p className="form-error" role="alert">
          {error || syncError}
        </p>
      )}
    </section>
  );
}
