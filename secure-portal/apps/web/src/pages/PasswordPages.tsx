import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { Field, Notice, Shell, SubmitButton, formValues } from "../components";

function takeQueryToken(): string {
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  const token = fragment.get("token") ?? url.searchParams.get("token") ?? "";
  if (token) window.history.replaceState({}, "", url.pathname);
  return token;
}

export function ForgotPasswordPage() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    const data = formValues(event);
    setBusy(true);
    try {
      await api("/api/v1/auth/password-reset/request", {
        method: "POST",
        body: JSON.stringify({ email: data.get("email") }),
      });
    } finally {
      setBusy(false);
      setSent(true);
    }
  };

  return (
    <Shell>
      <div className="step-copy">
        <h2>Reset your password</h2>
        <p>Enter your account email. For privacy, the response is the same whether an account exists or not.</p>
      </div>
      {sent ? (
        <Notice type="success">If the account exists, instructions have been sent. The link expires shortly and MFA remains required.</Notice>
      ) : (
        <form onSubmit={(event) => void submit(event)}>
          <Field label="Email address" name="email" type="email" autoComplete="email" />
          <SubmitButton busy={busy}>Send reset instructions</SubmitButton>
        </form>
      )}
      <Link className="text-link" to="/login">Return to sign in</Link>
    </Shell>
  );
}

export function ResetPasswordPage() {
  const [token] = useState(takeQueryToken);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    const data = formValues(event);
    const passwordEntry = data.get("password");
    const confirmationEntry = data.get("confirmation");
    const password = typeof passwordEntry === "string" ? passwordEntry : "";
    const confirmation = typeof confirmationEntry === "string" ? confirmationEntry : "";
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api("/api/v1/auth/password-reset/confirm", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      void navigate("/login", { replace: true, state: { reset: true } });
    } catch {
      setError("This reset link is invalid or has expired. Request a new one.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="step-copy">
        <h2>Choose a new password</h2>
        <p>Use at least 12 characters. Your authenticator code will still be required when you sign in.</p>
      </div>
      {!token ? <Notice>The reset token is missing. Request a new reset email.</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
      <form onSubmit={(event) => void submit(event)}>
        <Field label="New password" name="password" type="password" autoComplete="new-password" hint="12–128 characters; passphrases are welcome." />
        <Field label="Confirm new password" name="confirmation" type="password" autoComplete="new-password" />
        <SubmitButton busy={busy || !token}>Update password</SubmitButton>
      </form>
    </Shell>
  );
}

export { takeQueryToken };
