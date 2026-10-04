"use client";
import { useEffect, useRef, useState } from "react";
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
import { errorMessage } from "@/lib/errors";
import { FamilyAccessSettings } from "./family-access";
import { ReminderSettings } from "./reminder-settings";
import { usePlanner } from "./planner-provider";
import { Avatar, Field, Modal, SectionHeader } from "./ui";
import type { ViewProps } from "./overview";

export function Settings({ open }: ViewProps) {
  const {
    data,
    apply,
    notify,
    replaceData,
    restoreData,
    household,
    startOver,
    isOwner,
    revision,
    busy,
  } = usePlanner();
  const [familyName, setFamilyName] = useState(data.settings.familyName);
  const [currentMemberId, setCurrentMemberId] = useState(
    data.settings.currentMemberId,
  );
  const [weekStartsMonday, setWeekStartsMonday] = useState(
    data.settings.weekStartsMonday,
  );
  // Follow changes other family members make, except in fields you've changed
  // and not saved yet (even if a save failed).
  const [syncedSettings, setSyncedSettings] = useState(data.settings);
  const [edited, setEdited] = useState<
    Partial<Record<"familyName" | "currentMemberId" | "weekStartsMonday", true>>
  >({});
  if (syncedSettings !== data.settings) {
    setSyncedSettings(data.settings);
    if (!edited.familyName) setFamilyName(data.settings.familyName);
    if (!edited.currentMemberId)
      setCurrentMemberId(data.settings.currentMemberId);
    if (!edited.weekStartsMonday)
      setWeekStartsMonday(data.settings.weekStartsMonday);
  }
  const [imported, setImported] = useState<PlannerData | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [startOverConfirm, setStartOverConfirm] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [previewRevision, setPreviewRevision] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [copies, setCopies] = useState<{ id: string; created_at: string }[]>(
    [],
  );
  const [backupError, setBackupError] = useState("");
  useEffect(() => {
    if (!household || !isOwner) return;
    let active = true;
    void getCloud()!
      .from("planner_backups")
      .select("id,created_at")
      .eq("household_id", household)
      .order("created_at", { ascending: false })
      .limit(5)
      .then(({ data, error }) => {
        if (!active) return;
        if (error)
          setBackupError(
            "Recovery copies could not be loaded. Check your connection.",
          );
        else {
          setCopies(data ?? []);
          setBackupError("");
        }
      });
    return () => {
      active = false;
    };
  }, [household, isOwner, revision]);
  async function reviewCopy(id: string) {
    setBackupError("");
    const { data: copy, error } = await getCloud()!
      .from("planner_backups")
      .select("data")
      .eq("id", id)
      .eq("household_id", household!)
      .single();
    if (error) {
      setBackupError(errorMessage(error, "Could not load this recovery copy."));
      return;
    }
    const parsed = dataSchema.safeParse(copy.data);
    if (!parsed.success) {
      setBackupError("This recovery copy could not be read.");
      return;
    }
    setImported(parsed.data);
    setPreviewRevision(revision);
    setConfirmed(false);
  }
  const fileRef = useRef<HTMLInputElement>(null);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (
      await apply({
        collection: "settings",
        action: "settings",
        value: {
          familyName: familyName.trim(),
          currentMemberId: household
            ? data.settings.currentMemberId
            : currentMemberId,
          weekStartsMonday,
        },
      })
    ) {
      setEdited({});
      notify("Preferences saved.");
    }
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
      setPreviewRevision(revision);
      setConfirmed(false);
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
        <FamilyAccessSettings />
        <section className="card settings-card">
          <SectionHeader icon={Heart} title="Preferences" />
          <form onSubmit={save}>
            <Field label="Your family space">
              <input
                required
                value={familyName}
                maxLength={150}
                onChange={(e) => {
                  setEdited((x) => ({ ...x, familyName: true }));
                  setFamilyName(e.target.value);
                }}
              />
            </Field>
            {!household && (
              <Field
                label="Who should we greet?"
                hint="This is the default name for greetings and new plans in this family space."
              >
                <select
                  value={currentMemberId}
                  onChange={(e) => {
                    setEdited((x) => ({ ...x, currentMemberId: true }));
                    setCurrentMemberId(e.target.value);
                  }}
                >
                  {data.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label="Start the week on">
              <select
                value={weekStartsMonday ? "monday" : "sunday"}
                onChange={(e) => {
                  setEdited((x) => ({ ...x, weekStartsMonday: true }));
                  setWeekStartsMonday(e.target.value === "monday");
                }}
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
        <ReminderSettings />
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
              disabled={busy || (Boolean(household) && !isOwner)}
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
              ? isOwner
                ? "Restoring replaces shared plans for everyone. A recovery copy is kept automatically."
                : "Only the family owner can restore shared plans."
              : "Restoring replaces the plans in this browser. Download a backup first."}
          </p>
          {household && isOwner && copies.length > 0 && (
            <div className="recovery-copies">
              <h3>Before your recent restores</h3>
              <p className="form-hint">
                The five most recent recovery copies are kept.
              </p>
              {copies.map((copy) => (
                <button
                  key={copy.id}
                  className="text-button"
                  disabled={busy || restoreBusy}
                  onClick={() => void reviewCopy(copy.id)}
                >
                  Review copy from {new Date(copy.created_at).toLocaleString()}
                </button>
              ))}
            </div>
          )}
          {backupError && (
            <p className="form-error" role="alert">
              {backupError}
            </p>
          )}
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
          onClose={() => {
            if (!restoreBusy) setImported(null);
          }}
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
            {household
              ? "This replaces shared plans for everyone. Profiles linked to accounts are preserved, and a recovery copy is saved first. Account access stays the same."
              : "This will replace the plans currently saved in this browser. Download your current backup if you’d like to keep it."}
          </p>
          {household && (
            <label className="check-label">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              Replace shared plans for everyone
            </label>
          )}
          <div className="form-actions">
            <button
              className="button secondary"
              disabled={restoreBusy}
              onClick={() => setImported(null)}
            >
              Cancel
            </button>
            <button
              className="button primary"
              disabled={
                restoreBusy || busy || (Boolean(household) && !confirmed)
              }
              onClick={async () => {
                setRestoreBusy(true);
                const restored = await restoreData(imported, previewRevision);
                setRestoreBusy(false);
                if (restored) {
                  // The form still holds the previous family's settings.
                  setEdited({});
                  setFamilyName(imported.settings.familyName);
                  setCurrentMemberId(imported.settings.currentMemberId);
                  setWeekStartsMonday(imported.settings.weekStartsMonday);
                  notify("Your plans have been restored.");
                  setImported(null);
                }
              }}
            >
              {restoreBusy ? "Restoring…" : "Restore this backup"}
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
    isOwner,
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
      setError(errorMessage(e, "Could not create invitation."));
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
            {isOwner && (
              <button
                className="button secondary"
                disabled={loading || busy}
                onClick={getInvite}
              >
                <Plus size={16} />
                Create invite code
              </button>
            )}
            {isOwner && (
              <button
                className="button secondary"
                disabled={loading || busy}
                onClick={async () => {
                  setLoading(true);
                  setError("");
                  const { error } = await getCloud()!.rpc(
                    "planner_revoke_invite",
                    { family_id: household },
                  );
                  if (error)
                    setError(
                      errorMessage(error, "Could not revoke the invite."),
                    );
                  else {
                    setInvite("");
                    notify("Existing invite codes have been cancelled.");
                  }
                  setLoading(false);
                }}
              >
                Cancel invite codes
              </button>
            )}
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
