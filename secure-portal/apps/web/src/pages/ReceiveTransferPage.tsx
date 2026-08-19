import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { api } from "../api";
import { Notice, Shell, SubmitButton } from "../components";

interface UnlockResult {
  displayName: string;
  expiresAt: string;
  downloadUrl: string;
  downloadUrlExpiresInSeconds: number;
}

function fragmentToken(): string {
  const parameters = new URLSearchParams(window.location.hash.slice(1));
  const token = parameters.get("token") ?? "";
  window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  return token;
}

export function ReceiveTransferPage() {
  const token = useMemo(() => fragmentToken(), []);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<UnlockResult | null>(null);

  const unlock = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) {
      setError("This secure transfer link is incomplete or invalid.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const unlocked = await api<UnlockResult>("/api/v1/public/secure-transfers/unlock", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setResult(unlocked);
      setPassword("");
    } catch {
      setError("The link or password is invalid, locked, or expired.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell>
      <div className="step-copy">
        <p className="step-label">SECURE FILE DELIVERY</p>
        <h2>{result ? "Your file is ready" : "Enter the transfer password"}</h2>
        <p>{result ? "The download button is valid for 60 seconds." : "Use the special password Bitwise Security shared with you through a separate channel."}</p>
      </div>
      {!token ? <Notice>This secure transfer link is incomplete or invalid.</Notice> : null}
      {error ? <Notice>{error}</Notice> : null}
      {result ? (
        <section className="download-ready">
          <strong>{result.displayName}</strong>
          <span>Transfer expires {new Date(result.expiresAt).toLocaleString()}</span>
          <a className="primary-button" href={result.downloadUrl} download>Download file</a>
          <p>For your security, this page does not preview the file. It is always downloaded as an attachment.</p>
        </section>
      ) : (
        <form onSubmit={(event) => void unlock(event)}>
          <label className="field">
            <span>Special password</span>
            <input value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="off" required minLength={20} maxLength={100} />
            <small>The password is not the same as this link.</small>
          </label>
          <SubmitButton busy={busy}>Unlock secure download</SubmitButton>
        </form>
      )}
    </Shell>
  );
}
