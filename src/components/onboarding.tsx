"use client";
import { useState } from "react";
import { Heart, House, KeyRound, LogOut } from "lucide-react";
import { getCloud } from "@/lib/cloud";
import { usePlanner } from "./planner-provider";
import { Field } from "./ui";

function Gate({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="auth-screen">
      <div className="card auth-card">
        <div className="auth-brand">
          <span className="brand-icon">
            <House size={24} />
            <Heart size={10} />
          </span>
          <span>
            kinfolk<span className="brand-period">.</span>
          </span>
        </div>
        <h1>{title}</h1>
        <p className="auth-subtitle">{subtitle}</p>
        {children}
      </div>
    </main>
  );
}

const errorMessage = (e: unknown, fallback: string) =>
  e instanceof Error ? e.message : fallback;

export function AuthScreen() {
  const { refreshCloud, syncError } = usePlanner();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const credentials = {
      email: String(form.get("email")),
      password: String(form.get("password")),
    };
    try {
      const cloud = getCloud()!;
      if (mode === "signin") {
        const { error } = await cloud.auth.signInWithPassword(credentials);
        if (error) throw error;
      } else {
        const { data: result, error } = await cloud.auth.signUp({
          ...credentials,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!result.session) {
          setMessage(
            "Check your email to confirm your account, then come back and sign in.",
          );
          setMode("signin");
          return;
        }
      }
      await refreshCloud();
    } catch (e) {
      setError(errorMessage(e, "Could not connect. Please try again."));
    } finally {
      setLoading(false);
    }
  }
  return (
    <Gate
      title={mode === "signin" ? "Sign in" : "Create your account"}
      subtitle={
        mode === "signin"
          ? "Sign in to see your family’s plans."
          : "Then set up your family or join one with an invite code."
      }
    >
      <div className="segmented-control account-tabs">
        <button
          type="button"
          className={mode === "signin" ? "active" : ""}
          onClick={() => setMode("signin")}
        >
          Sign in
        </button>
        <button
          type="button"
          className={mode === "signup" ? "active" : ""}
          onClick={() => setMode("signup")}
        >
          Create account
        </button>
      </div>
      <form onSubmit={submit}>
        <Field label="Email address">
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            autoFocus
            placeholder="you@example.com"
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            name="password"
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
            minLength={8}
            required
            placeholder="At least 8 characters"
          />
        </Field>
        <button className="button primary full-width" disabled={loading}>
          <KeyRound size={16} />
          {loading
            ? "One moment…"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </button>
      </form>
      {message && (
        <p className="form-success" role="status">
          {message}
        </p>
      )}
      {(error || syncError) && (
        <p className="form-error" role="alert">
          {error || syncError}
        </p>
      )}
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
