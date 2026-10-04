"use client";
import { useEffect, useState, type InputHTMLAttributes } from "react";
import Link from "next/link";
import { Eye, EyeOff, Heart, House, KeyRound } from "lucide-react";
import { getCloud } from "@/lib/cloud";
import { errorMessage } from "@/lib/errors";
import { usePlanner } from "./planner-provider";
import { Field } from "./ui";

export function AuthCard({
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

export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false);
  return (
    <div className="password-input">
      <input {...props} type={show ? "text" : "password"} />
      <button
        type="button"
        className="icon-button"
        aria-label={show ? "Hide password" : "Show password"}
        aria-pressed={show}
        aria-controls={props.id}
        onClick={() => setShow(!show)}
      >
        {show ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}

type Mode = "signin" | "signup" | "reset" | "resend";
export function AuthScreen() {
  const { refreshCloud, syncError } = usePlanner();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  function changeMode(next: Mode) {
    setMode(next);
    setError("");
    setMessage("");
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const credentials = {
      email: email.trim(),
      password: String(form.get("password") ?? ""),
    };
    try {
      const cloud = getCloud()!;
      if (mode === "reset") {
        const { error } = await cloud.auth.resetPasswordForEmail(
          credentials.email,
          {
            redirectTo: `${window.location.origin}/reset-password`,
          },
        );
        if (error) throw error;
        setMessage(
          "If an account exists for this email, you’ll receive a password reset link. Check your inbox and spam folder.",
        );
        setCooldown(60);
      } else if (mode === "resend") {
        const { error } = await cloud.auth.resend({
          type: "signup",
          email: credentials.email,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setMessage(
          "If this account needs confirmation, a new link is on its way. Check your inbox and spam folder.",
        );
        setCooldown(60);
      } else if (mode === "signin") {
        const { error } = await cloud.auth.signInWithPassword(credentials);
        if (error) throw error;
        await refreshCloud();
      } else {
        const { data, error } = await cloud.auth.signUp({
          ...credentials,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        if (!data.session) {
          setMode("signin");
          setMessage(
            "Check your email to confirm your account, then come back and sign in.",
          );
        } else await refreshCloud();
      }
    } catch (e) {
      setError(errorMessage(e, "Could not connect. Please try again."));
    } finally {
      setLoading(false);
    }
  }
  const titles = {
    signin: "Sign in",
    signup: "Create your account",
    reset: "Reset your password",
    resend: "Resend confirmation",
  };
  const subtitles = {
    signin: "Sign in to see your family’s plans.",
    signup: "Then set up your family or join one with an invite code.",
    reset: "We’ll email you a link to choose a new password.",
    resend: "Request a fresh link to confirm your email address.",
  };
  const emailOnly = mode === "reset" || mode === "resend";
  return (
    <AuthCard title={titles[mode]} subtitle={subtitles[mode]}>
      {!emailOnly && (
        <div className="segmented-control account-tabs">
          <button
            type="button"
            disabled={loading}
            className={mode === "signin" ? "active" : ""}
            onClick={() => changeMode("signin")}
          >
            Sign in
          </button>
          <button
            type="button"
            disabled={loading}
            className={mode === "signup" ? "active" : ""}
            onClick={() => changeMode("signup")}
          >
            Create account
          </button>
        </div>
      )}
      <form onSubmit={submit}>
        <Field label="Email address">
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
          />
        </Field>
        {!emailOnly && (
          <Field label="Password">
            <PasswordInput
              name="password"
              key={mode}
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              minLength={mode === "signup" ? 8 : undefined}
              required
              placeholder={
                mode === "signup" ? "At least 8 characters" : "Your password"
              }
            />
          </Field>
        )}
        <button
          className="button primary full-width"
          disabled={loading || (emailOnly && cooldown > 0)}
        >
          <KeyRound size={16} />
          {loading
            ? "One moment…"
            : emailOnly && cooldown
              ? `Try again in ${cooldown}s`
              : mode === "reset"
                ? "Send reset link"
                : mode === "resend"
                  ? "Send confirmation email"
                  : mode === "signin"
                    ? "Sign in"
                    : "Create account"}
        </button>
      </form>
      <div className="auth-links">
        {emailOnly ? (
          <button
            className="text-button"
            disabled={loading}
            onClick={() => changeMode("signin")}
          >
            Back to sign in
          </button>
        ) : (
          <>
            <button
              className="text-button"
              disabled={loading}
              onClick={() => changeMode("reset")}
            >
              Forgot password?
            </button>
            <button
              className="text-button"
              disabled={loading}
              onClick={() => changeMode("resend")}
            >
              Resend confirmation email
            </button>
          </>
        )}
      </div>
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
    </AuthCard>
  );
}

export function ResetPasswordScreen() {
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    const cloud = getCloud();
    if (!cloud) {
      setTimeout(() => {
        if (active) {
          setError("Account recovery is not configured yet.");
          setLoading(false);
        }
      }, 0);
      return () => {
        active = false;
      };
    }
    void cloud.auth
      .getSession()
      .then(({ data, error }) => {
        if (!active) return;
        const hash = new URLSearchParams(window.location.hash.slice(1));
        const callbackError = hash.get("error_description");
        if (error || callbackError || !data.session)
          setError(
            "This reset link has expired or is invalid. Return to sign in and request a new link.",
          );
        else setReady(true);
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setError(
            "Could not verify this reset link. Check your connection and reload.",
          );
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const form = new FormData(e.currentTarget);
    const password = String(form.get("password"));
    if (password !== form.get("confirm")) {
      setError("The passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const { error } = await getCloud()!.auth.updateUser({ password });
      if (error) throw error;
      setSaved(true);
      window.history.replaceState(null, "", "/reset-password");
    } catch (e) {
      setError(
        errorMessage(e, "Could not update your password. Please try again."),
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <AuthCard
      title={saved ? "Password updated" : "Choose a new password"}
      subtitle={
        saved
          ? "You can use your new password next time you sign in."
          : "Use at least eight characters."
      }
    >
      {loading && !ready && <p role="status">Checking your reset link…</p>}
      {ready && !saved && (
        <form onSubmit={submit}>
          <Field label="New password">
            <PasswordInput
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirm new password">
            <PasswordInput
              name="confirm"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Field>
          <button className="button primary full-width" disabled={loading}>
            {loading ? "Saving…" : "Update password"}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <Link className="text-button auth-return" href="/">
        {saved ? "Continue to your planner" : "Back to sign in"}
      </Link>
    </AuthCard>
  );
}
