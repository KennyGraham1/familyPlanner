"use client";
import { useState } from "react";
import { LogOut } from "lucide-react";
import { errorMessage } from "@/lib/errors";
import { usePlanner } from "./planner-provider";
import { Field } from "./ui";
import { AuthCard as Gate } from "./account-auth";
export { AuthScreen } from "./account-auth";

export function ProfilePicker({ onDone }: { onDone?: () => void }) {
  const { data, access, userId, chooseProfile, currentMemberId } = usePlanner();
  const available = data.members.filter(
    (m) => !access.some((a) => a.member_id === m.id && a.user_id !== userId),
  );
  const [selected, setSelected] = useState(
    available.some((m) => m.id === currentMemberId) ? currentMemberId : "new",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const name = String(new FormData(e.currentTarget).get("name") ?? "");
    try {
      await chooseProfile(selected === "new" ? null : selected, name);
      onDone?.();
    } catch (e) {
      setError(errorMessage(e, "Could not link this profile."));
    } finally {
      setLoading(false);
    }
  }
  return (
    <form onSubmit={submit}>
      <Field label="Your family profile">
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {available.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
          <option value="new">Create a profile for me</option>
        </select>
      </Field>
      {selected === "new" && (
        <Field label="Your name">
          <input
            name="name"
            required
            maxLength={150}
            autoComplete="given-name"
          />
        </Field>
      )}
      <p className="form-hint">
        This links your account to your name, assignments and reminders. Other
        people keep their own profiles.
      </p>
      <button className="button primary" disabled={loading}>
        {loading ? "Saving…" : "Use this profile"}
      </button>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

export function ProfileScreen() {
  const { data, signOut } = usePlanner();
  return (
    <Gate
      title="Which family member are you?"
      subtitle={`You’ve joined ${data.settings.familyName}. Choose your profile or create one.`}
    >
      <ProfilePicker />
      <button
        className="text-button auth-return"
        onClick={() => void signOut()}
      >
        Sign out
      </button>
    </Gate>
  );
}

export function SetupScreen() {
  const { cloudConfigured, email, startFamily, joinFamily, signOut, notify } =
    usePlanner();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function run(task: () => Promise<void>, fallback: string) {
    setError("");
    setLoading(true);
    try {
      await task();
    } catch (e) {
      setError(errorMessage(e, fallback));
    } finally {
      setLoading(false);
    }
  }
  function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void run(async () => {
      await startFamily(
        String(form.get("name")).trim(),
        String(form.get("familyName")).trim(),
      );
      notify("Your family is set up. Add everyone from the sidebar.");
    }, "Could not set up your family.");
  }
  function join(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get("code"));
    void run(async () => {
      await joinFamily(code);
      notify("You’ve joined your family.");
    }, "Could not join this family.");
  }
  return (
    <Gate
      title="Set up your family"
      subtitle={
        mode === "create"
          ? "You’ll be the first member. Add everyone else once you’re in."
          : "Paste the invite code someone in your family created for you."
      }
    >
      {cloudConfigured && (
        <div className="segmented-control account-tabs">
          <button
            type="button"
            className={mode === "create" ? "active" : ""}
            onClick={() => setMode("create")}
          >
            New family
          </button>
          <button
            type="button"
            className={mode === "join" ? "active" : ""}
            onClick={() => setMode("join")}
          >
            Join with a code
          </button>
        </div>
      )}
      {mode === "create" ? (
        <form onSubmit={create}>
          <Field label="Your name">
            <input
              name="name"
              autoComplete="given-name"
              required
              autoFocus
              maxLength={150}
            />
          </Field>
          <Field label="Family name">
            <input
              name="familyName"
              required
              maxLength={150}
              placeholder="The Smith family"
            />
          </Field>
          <button className="button primary full-width" disabled={loading}>
            {loading ? "One moment…" : "Start planning"}
          </button>
        </form>
      ) : (
        <form onSubmit={join}>
          <Field label="Invite code">
            <input name="code" required autoFocus maxLength={100} />
          </Field>
          <button className="button primary full-width" disabled={loading}>
            {loading ? "One moment…" : "Join family"}
          </button>
        </form>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {cloudConfigured ? (
        <p className="auth-footer">
          Signed in as {email}
          <button
            type="button"
            className="text-button"
            onClick={() => void signOut()}
          >
            <LogOut size={13} /> Sign out
          </button>
        </p>
      ) : (
        <p className="auth-footer">
          Sign-in isn’t set up, so your plans are saved in this browser only.
        </p>
      )}
    </Gate>
  );
}
