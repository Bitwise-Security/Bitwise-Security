import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import type { SessionResponse } from "../api";
import { useAuth } from "../auth-context";
import { Field, Notice, Shell, SubmitButton, formValues } from "../components";
import { takeQueryToken } from "./PasswordPages";

interface EnrollmentDetails {
  qrDataUrl: string;
  manualKey: string;
}

interface EnrollmentResult extends SessionResponse {
  recoveryCodes: string[];
}

function RecoveryCodes({ codes }: { codes: string[] }) {
  const navigate = useNavigate();
  const download = () => {
    const blob = new Blob(
      ["Bitwise Secure Portal recovery codes\n\nEach code works once. Store these privately.\n\n", codes.join("\n")],
      { type: "text/plain" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "bitwise-portal-recovery-codes.txt";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <Shell>
      <div className="step-copy">
        <p className="step-label">Final step</p>
        <h2>Save your recovery codes</h2>
        <p>Each code can sign you in once if you lose access to your authenticator. They will not be shown again.</p>
      </div>
      <div className="recovery-grid" aria-label="Recovery codes">
        {codes.map((code) => <code key={code}>{code}</code>)}
      </div>
      <button className="secondary-button" type="button" onClick={download}>Download recovery codes</button>
      <button className="primary-button" type="button" onClick={() => void navigate("/", { replace: true })}>
        I have saved them securely
      </button>
    </Shell>
  );
}

function MfaSetup({ enrollmentToken, initialPassword = "", onComplete }: {
  enrollmentToken: string;
  initialPassword?: string;
  onComplete: (result: EnrollmentResult) => void;
}) {
  const [details, setDetails] = useState<EnrollmentDetails | null>(null);
  const [password, setPassword] = useState(initialPassword);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialPassword) return;
    void api<EnrollmentDetails>("/api/v1/auth/mfa/enrol", {
      method: "POST",
      body: JSON.stringify({ enrollmentToken, password: initialPassword }),
    }).then(setDetails).catch(() => setError("The MFA setup link is invalid or expired."));
  }, [enrollmentToken, initialPassword]);

  const unlock = async (event: FormEvent<HTMLFormElement>) => {
    const data = formValues(event);
    const passwordEntry = data.get("password");
    const accountPassword = typeof passwordEntry === "string" ? passwordEntry : "";
    setBusy(true);
    setError(null);
    try {
      const result = await api<EnrollmentDetails>("/api/v1/auth/mfa/enrol", {
        method: "POST",
        body: JSON.stringify({ enrollmentToken, password: accountPassword }),
      });
      setPassword(accountPassword);
      setDetails(result);
    } catch {
      setError("The setup link, password, or enrollment window is invalid.");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (event: FormEvent<HTMLFormElement>) => {
    const data = formValues(event);
    setBusy(true);
    setError(null);
    try {
      const result = await api<EnrollmentResult>("/api/v1/auth/mfa/confirm", {
        method: "POST",
        body: JSON.stringify({ enrollmentToken, password, code: data.get("code") }),
      });
      onComplete(result);
    } catch {
      setError("That code was not accepted. Wait for a new code in your authenticator and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="step-copy">
        <p className="step-label">Protect your account</p>
        <h2>Connect an authenticator app</h2>
        <p>Scan this QR code with Microsoft Authenticator, Google Authenticator, 1Password or another TOTP app.</p>
      </div>
      {error ? <Notice>{error}</Notice> : null}
      {!details && !initialPassword ? (
        <form onSubmit={(event) => void unlock(event)}>
          <Field
            label="Account password"
            name="password"
            type="password"
            autoComplete="current-password"
            hint="Your password and setup email are checked together."
          />
          <SubmitButton busy={busy}>Continue securely</SubmitButton>
        </form>
      ) : !details ? <div className="loading">Preparing secure setup…</div> : (
        <>
          <img className="qr-code" src={details.qrDataUrl} alt="QR code for authenticator setup" />
          <details className="manual-key">
            <summary>Cannot scan the QR code?</summary>
            <p>Enter this setup key manually:</p>
            <code>{details.manualKey}</code>
          </details>
          <form onSubmit={(event) => void confirm(event)}>
            <Field label="Six-digit verification code" name="code" autoComplete="one-time-code" />
            <SubmitButton busy={busy}>Verify authenticator</SubmitButton>
          </form>
        </>
      )}
    </Shell>
  );
}

export function AcceptInvitationPage() {
  const [invitationToken] = useState(takeQueryToken);
  const [enrollmentToken, setEnrollmentToken] = useState<string | null>(null);
  const [enrollmentPassword, setEnrollmentPassword] = useState("");
  const [result, setResult] = useState<EnrollmentResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const auth = useAuth();

  if (result) return <RecoveryCodes codes={result.recoveryCodes} />;
  if (enrollmentToken) {
    return <MfaSetup enrollmentToken={enrollmentToken} initialPassword={enrollmentPassword} onComplete={(value) => {
      auth.establish(value);
      setResult(value);
    }} />;
  }

  const accept = async (event: FormEvent<HTMLFormElement>) => {
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
      const response = await api<{ enrollmentToken: string }>("/api/v1/invitations/accept", {
        method: "POST",
        body: JSON.stringify({ token: invitationToken, displayName: data.get("displayName"), password }),
      });
      setEnrollmentPassword(password);
      setEnrollmentToken(response.enrollmentToken);
    } catch {
      setError("This invitation is invalid, expired, or has already been used.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="step-copy">
        <p className="step-label">Step 1 of 3</p>
        <h2>Create your secure account</h2>
        <p>Your account gives access only to your own organisation’s client space.</p>
      </div>
      {!invitationToken ? <Notice>The invitation token is missing.</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
      <form onSubmit={(event) => void accept(event)}>
        <Field label="Your name" name="displayName" autoComplete="name" />
        <Field label="Choose a password" name="password" type="password" autoComplete="new-password" hint="Use at least 12 characters." />
        <Field label="Confirm password" name="confirmation" type="password" autoComplete="new-password" />
        <SubmitButton busy={busy || !invitationToken}>Continue to MFA setup</SubmitButton>
      </form>
    </Shell>
  );
}

export function EnrolMfaPage() {
  const [enrollmentToken] = useState(takeQueryToken);
  const [result, setResult] = useState<EnrollmentResult | null>(null);
  const auth = useAuth();
  if (!enrollmentToken) return <Shell><Notice>The MFA setup token is missing.</Notice></Shell>;
  if (result) return <RecoveryCodes codes={result.recoveryCodes} />;
  return <MfaSetup enrollmentToken={enrollmentToken} onComplete={(value) => {
    auth.establish(value);
    setResult(value);
  }} />;
}
