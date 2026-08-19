import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { api } from "../api";
import type { SessionResponse } from "../api";
import { Field, Notice, Shell, SubmitButton, formValues } from "../components";
import { useAuth } from "../auth-context";

export function LoginPage() {
  const auth = useAuth();
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (auth.user) return <Navigate to="/" replace />;

  const submitPassword = async (event: FormEvent<HTMLFormElement>) => {
    const data = formValues(event);
    setBusy(true);
    setError(null);
    try {
      const response = await api<{ challengeToken: string }>("/api/v1/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: data.get("email"), password: data.get("password") }),
      });
      setChallengeToken(response.challengeToken);
    } catch {
      setError("The email or password was not accepted. Check your details and try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitMfa = async (event: FormEvent<HTMLFormElement>) => {
    const data = formValues(event);
    setBusy(true);
    setError(null);
    try {
      const response = await api<SessionResponse>("/api/v1/auth/mfa/verify", {
        method: "POST",
        body: JSON.stringify({ challengeToken, code: data.get("code") }),
      });
      auth.establish(response);
    } catch {
      setError("That verification code was not accepted. Use a current code or an unused recovery code.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      {challengeToken ? (
        <>
          <div className="step-copy">
            <p className="step-label">Step 2 of 2</p>
            <h2>Verify it’s you</h2>
            <p>Enter the current code from your authenticator app.</p>
          </div>
          {error ? <Notice>{error}</Notice> : null}
          <form onSubmit={(event) => void submitMfa(event)}>
            <Field label="Verification or recovery code" name="code" autoComplete="one-time-code" />
            <SubmitButton busy={busy}>Verify and sign in</SubmitButton>
          </form>
          <button className="text-button" type="button" onClick={() => setChallengeToken(null)}>
            Use a different account
          </button>
        </>
      ) : (
        <>
          <div className="step-copy">
            <h2>Sign in to your client space</h2>
            <p>Your files and reports are only available after password and MFA verification.</p>
          </div>
          {error ? <Notice>{error}</Notice> : null}
          <form onSubmit={(event) => void submitPassword(event)}>
            <Field label="Email address" name="email" type="email" autoComplete="username" />
            <Field label="Password" name="password" type="password" autoComplete="current-password" />
            <SubmitButton busy={busy}>Continue securely</SubmitButton>
          </form>
          <Link className="text-link" to="/forgot-password">Forgot your password?</Link>
        </>
      )}
    </Shell>
  );
}

