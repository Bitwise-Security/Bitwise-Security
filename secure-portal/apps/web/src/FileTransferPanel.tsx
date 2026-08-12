import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { api } from "./api";
import { uploadEncryptedFile } from "./file-upload";
import { Notice } from "./components";

interface Space { id: string; name: string }
interface PortalFile {
  id: string;
  direction: "CLIENT_TO_ADMIN" | "ADMIN_TO_CLIENT";
  display_name: string;
  plaintext_size: string;
  status: string;
  expires_at: string | null;
  created_at: string;
  uploaded_by_me: boolean;
}
interface SecureTransfer {
  id: string;
  status: "PENDING_SCAN" | "ACTIVE" | "REVOKED" | "EXPIRED";
  expires_at: string;
  download_count: number;
  display_name: string;
}
interface OneTimeCredentials {
  id: string;
  url: string;
  password: string;
  expiresAt: string;
}

function formatBytes(value: string | number): string {
  const bytes = Number(value);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function FileList({ files, title, empty, role, onChanged }: {
  files: PortalFile[];
  title: string;
  empty: string;
  role: "ADMIN" | "CLIENT";
  onChanged: () => Promise<void>;
}) {
  const download = async (fileId: string) => {
    const result = await api<{ url: string }>(`/api/v1/files/${fileId}/download-ticket`, {
      method: "POST",
      body: "{}",
    });
    window.location.assign(result.url);
  };
  const remove = async (fileId: string) => {
    if (!window.confirm("Permanently delete this file? This cannot be undone.")) return;
    await api<void>(`/api/v1/files/${fileId}`, { method: "DELETE" });
    await onChanged();
  };
  const rename = async (file: PortalFile) => {
    const nextName = window.prompt("Enter a new display name. The file contents will not change.", file.display_name);
    if (!nextName || nextName === file.display_name) return;
    await api(`/api/v1/files/${file.id}`, {
      method: "PATCH",
      body: JSON.stringify({ displayName: nextName }),
    });
    await onChanged();
  };

  return (
    <section className="card file-card">
      <h2>{title}</h2>
      {files.length === 0 ? <p className="empty-state">{empty}</p> : (
        <div className="portal-file-list">
          {files.map((file) => (
            <article className="portal-file" key={file.id}>
              <div className="file-icon" aria-hidden="true">▤</div>
              <div className="file-details">
                <strong>{file.display_name}</strong>
                <span>{formatBytes(file.plaintext_size)} · {new Date(file.created_at).toLocaleDateString()}</span>
              </div>
              <span className={`file-state ${file.status.toLowerCase()}`}>{file.status.replaceAll("_", " ")}</span>
              <div className="file-actions">
                {file.status === "AVAILABLE" ? <button type="button" onClick={() => void download(file.id)}>Download</button> : null}
                {(role === "ADMIN" || file.uploaded_by_me) && file.status !== "UPLOADING" ? (
                  <>
                    <button type="button" onClick={() => void rename(file)}>Rename</button>
                    <button className="danger-link" type="button" onClick={() => void remove(file.id)}>Delete</button>
                  </>
                ) : null}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function FileTransferPanel({ role }: { role: "ADMIN" | "CLIENT" }) {
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [spaceId, setSpaceId] = useState("");
  const [files, setFiles] = useState<PortalFile[]>([]);
  const [selected, setSelected] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error" | "info">("info");
  const [expiryDays, setExpiryDays] = useState("30");
  const [deliveryMode, setDeliveryMode] = useState<"PORTAL" | "PASSWORD_LINK">("PORTAL");
  const [secureTransfer, setSecureTransfer] = useState<OneTimeCredentials | null>(null);
  const [transfers, setTransfers] = useState<SecureTransfer[]>([]);
  const [showSpaceCreator, setShowSpaceCreator] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [creatingSpace, setCreatingSpace] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadSpaces = useCallback(async (selectId?: string) => {
    const result = await api<{ spaces: Space[] }>("/api/v1/spaces");
    setSpaces(result.spaces);
    setSpaceId((current) => selectId ?? (current || result.spaces[0]?.id || ""));
  }, []);

  useEffect(() => {
    let active = true;
    void api<{ spaces: Space[] }>("/api/v1/spaces").then((result) => {
      if (!active) return;
      setSpaces(result.spaces);
      setSpaceId((current) => current || result.spaces[0]?.id || "");
    });
    return () => { active = false; };
  }, []);

  const loadFiles = useCallback(async () => {
    if (!spaceId) return;
    const result = await api<{ files: PortalFile[] }>(`/api/v1/spaces/${spaceId}/files`);
    setFiles(result.files);
    if (role === "ADMIN") {
      const transferResult = await api<{ transfers: SecureTransfer[] }>(`/api/v1/spaces/${spaceId}/secure-transfers`);
      setTransfers(transferResult.transfers);
    }
  }, [role, spaceId]);

  useEffect(() => {
    if (!spaceId) return;
    let active = true;
    const initial = role === "ADMIN"
      ? Promise.all([
          api<{ files: PortalFile[] }>(`/api/v1/spaces/${spaceId}/files`),
          api<{ transfers: SecureTransfer[] }>(`/api/v1/spaces/${spaceId}/secure-transfers`),
        ]).then(([fileResult, transferResult]) => {
          if (!active) return;
          setFiles(fileResult.files);
          setTransfers(transferResult.transfers);
        })
      : api<{ files: PortalFile[] }>(`/api/v1/spaces/${spaceId}/files`).then((fileResult) => {
          if (active) setFiles(fileResult.files);
        });
    void initial;
    const timer = window.setInterval(() => void loadFiles(), 5_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [role, spaceId, loadFiles]);

  const choose = (fileList: FileList | null) => {
    setSelected(fileList?.item(0) ?? null);
    setMessage(null);
    setSecureTransfer(null);
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    choose(event.dataTransfer.files);
  };

  const upload = async () => {
    if (!selected) {
      setMessageType("error");
      setMessage("Choose a file before starting the upload.");
      return;
    }
    if (!spaceId) {
      setMessageType("error");
      setMessage("Create or select a client space before uploading.");
      return;
    }
    const extension = selected.name.includes(".") ? selected.name.slice(selected.name.lastIndexOf(".")).toLowerCase() : "";
    if (![".pdf", ".docx", ".xlsx", ".csv", ".txt", ".png", ".jpg", ".jpeg"].includes(extension)) {
      setMessageType("error");
      setMessage("This file type is not allowed. Choose PDF, DOCX, XLSX, CSV, TXT, PNG or JPEG.");
      return;
    }
    if (selected.size < 1 || selected.size > 2_147_483_648) {
      setMessageType("error");
      setMessage("Choose a non-empty file no larger than 2 GB.");
      return;
    }
    setProgress(0);
    setMessage(null);
    setSecureTransfer(null);
    try {
      const result = await uploadEncryptedFile({
        spaceId,
        file: selected,
        expiresInDays: deliveryMode === "PASSWORD_LINK" ? 7 : expiryDays === "never" ? null : Number(expiryDays),
        deliveryMode,
        onProgress: setProgress,
      });
      setMessageType("success");
      if (result.secureTransfer) {
        setSecureTransfer(result.secureTransfer);
        setMessage("Secure link created. It becomes downloadable after the malware scan passes.");
      } else {
        setMessage("Upload complete. The file is quarantined while its type and malware scan are checked.");
      }
      setSelected(null);
      await loadFiles();
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "The upload could not be completed.");
    } finally {
      setProgress(null);
    }
  };

  const createSpace = async () => {
    const name = newSpaceName.trim();
    if (!name) return;
    setCreatingSpace(true);
    setMessage(null);
    try {
      const created = await api<Space>("/api/v1/admin/spaces", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      await loadSpaces(created.id);
      setNewSpaceName("");
      setShowSpaceCreator(false);
      setMessageType("success");
      setMessage("Client space created without an account. You can now create a password-protected link.");
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "The client space could not be created.");
    } finally {
      setCreatingSpace(false);
    }
  };

  const revokeTransfer = async (id: string) => {
    try {
      await api<void>(`/api/v1/secure-transfers/${id}`, { method: "DELETE" });
      setMessageType("success");
      setMessage("Password-protected link revoked.");
      await loadFiles();
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "The link could not be revoked.");
    }
  };

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setMessageType("success");
    setMessage(`${label} copied. Share the link and password through separate channels.`);
  };

  const sent = files.filter((file) => file.direction === "CLIENT_TO_ADMIN");
  const reports = files.filter((file) => file.direction === "ADMIN_TO_CLIENT");
  return (
    <>
      {role === "ADMIN" ? (
        <div className="space-controls">
          {spaces.length > 0 ? (
            <label className="space-picker">Client space<select value={spaceId} onChange={(event) => setSpaceId(event.target.value)}>{spaces.map((space) => <option value={space.id} key={space.id}>{space.name}</option>)}</select></label>
          ) : <Notice type="info">Create a client space to start sharing files.</Notice>}
          <button className="secondary-button small" type="button" onClick={() => setShowSpaceCreator((value) => !value)}>{showSpaceCreator ? "Cancel" : "New space without login"}</button>
          {showSpaceCreator ? (
            <div className="inline-space-form">
              <label className="field"><span>Client or project name</span><input value={newSpaceName} maxLength={160} onChange={(event) => setNewSpaceName(event.target.value)} /></label>
              <button className="primary-button" type="button" disabled={creatingSpace || !newSpaceName.trim()} onClick={() => void createSpace()}>{creatingSpace ? "Creating…" : "Create private space"}</button>
            </div>
          ) : null}
        </div>
      ) : null}
      <section className="card upload-card">
        <div>
          <p className="eyebrow">ENCRYPTED BEFORE STORAGE</p>
          <h2>{role === "ADMIN" ? "Share a report" : "Send a document securely"}</h2>
          <p className="muted">PDF, DOCX, XLSX, CSV, TXT, PNG or JPEG · maximum 2 GB</p>
        </div>
        {role === "ADMIN" ? (
          <div className="delivery-mode" aria-label="How the client will receive this file">
            <button className={deliveryMode === "PORTAL" ? "active" : ""} type="button" onClick={() => { setDeliveryMode("PORTAL"); setSecureTransfer(null); setMessage(null); }}><strong>Client portal</strong><span>Account, password and MFA</span></button>
            <button className={deliveryMode === "PASSWORD_LINK" ? "active" : ""} type="button" onClick={() => { setDeliveryMode("PASSWORD_LINK"); setSecureTransfer(null); setMessage(null); }}><strong>Password-protected link</strong><span>No account · expires after 7 days</span></button>
          </div>
        ) : null}
        <div className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={drop}>
          <input ref={inputRef} type="file" accept=".pdf,.docx,.xlsx,.csv,.txt,.png,.jpg,.jpeg" hidden onChange={(event: ChangeEvent<HTMLInputElement>) => choose(event.target.files)} />
          <strong>{selected ? selected.name : "Drag and drop a file here"}</strong>
          <span>{selected ? formatBytes(selected.size) : "or choose one from your device"}</span>
          <button className="secondary-button small" type="button" onClick={() => inputRef.current?.click()}>{selected ? "Choose another" : "Choose file"}</button>
        </div>
        {deliveryMode === "PASSWORD_LINK" ? <Notice type="info">The encrypted file and link expire automatically after 7 days. Send the link and password using different channels.</Notice> : <label className="expiry-picker">Automatic deletion
          <select value={expiryDays} onChange={(event) => setExpiryDays(event.target.value)}>
            <option value="7">After 7 days</option>
            <option value="30">After 30 days</option>
            <option value="90">After 90 days</option>
            <option value="never">No automatic deletion</option>
          </select>
        </label>}
        {progress != null ? <div className="upload-progress"><progress max="100" value={progress} /><span>{progress}% encrypted and uploaded</span></div> : null}
        <button className="primary-button" type="button" disabled={!selected || !spaceId || progress != null} onClick={() => void upload()}>{progress != null ? `Encrypting and uploading… ${progress}%` : deliveryMode === "PASSWORD_LINK" ? "Encrypt and create secure link" : "Encrypt and upload"}</button>
        {message ? <Notice type={messageType}>{message}</Notice> : null}
        {secureTransfer ? (
          <section className="transfer-credentials" aria-labelledby="transfer-ready-title">
            <p className="eyebrow">SHOWN ONCE</p>
            <h3 id="transfer-ready-title">Save both transfer details now</h3>
            <p>The password cannot be recovered later. Send it through a different channel than the link.</p>
            <div><span>Secure link</span><code>{secureTransfer.url}</code><button className="secondary-button small" type="button" onClick={() => void copy(secureTransfer.url, "Secure link")}>Copy link</button></div>
            <div><span>Special password</span><code>{secureTransfer.password}</code><button className="secondary-button small" type="button" onClick={() => void copy(secureTransfer.password, "Password")}>Copy password</button></div>
            <small>Expires {new Date(secureTransfer.expiresAt).toLocaleString()}</small>
          </section>
        ) : null}
      </section>
      {role === "ADMIN" && transfers.length > 0 ? (
        <section className="card transfer-list-card">
          <h2>Password-protected links</h2>
          {transfers.map((transfer) => <article className="transfer-row" key={transfer.id}><div><strong>{transfer.display_name}</strong><span>{transfer.status.replaceAll("_", " ")} · {transfer.download_count} downloads · expires {new Date(transfer.expires_at).toLocaleDateString()}</span></div>{transfer.status === "ACTIVE" || transfer.status === "PENDING_SCAN" ? <button className="danger-link" type="button" onClick={() => void revokeTransfer(transfer.id)}>Revoke link</button> : null}</article>)}
        </section>
      ) : null}
      <div className="file-columns">
        <FileList files={sent} title="Files sent to Bitwise Security" empty="No client documents yet." role={role} onChanged={loadFiles} />
        <FileList files={reports} title="Reports shared with the client" empty="No reports have been shared yet." role={role} onChanged={loadFiles} />
      </div>
    </>
  );
}
