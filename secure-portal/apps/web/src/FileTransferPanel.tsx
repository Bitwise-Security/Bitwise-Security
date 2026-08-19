import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import { api } from "./api";
import { uploadEncryptedFile } from "./file-upload";
import { Notice, Pagination } from "./components";
import type { PaginationState } from "./components";

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
interface SpaceDeletionSummary {
  id: string;
  name: string;
  fileCount: number;
  secureTransferCount: number;
  clientAccountCount: number;
  exclusiveClientCount: number;
}
type TransferPhase = "selecting" | "uploading" | "scanning";
type WorkflowPhase = TransferPhase | "ready" | "rejected";

function formatBytes(value: string | number): string {
  const bytes = Number(value);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function fileStatusLabel(status: string): string {
  return {
    QUARANTINED: "AWAITING SCAN",
    SCANNING: "SCANNING",
    AVAILABLE: "SCAN PASSED",
    REJECTED: "BLOCKED BY SCAN",
    UPLOADING: "UPLOADING",
    DELETED: "DELETED",
    EXPIRED: "EXPIRED",
  }[status] ?? status.replaceAll("_", " ");
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
              <span className={`file-state ${file.status.toLowerCase()}`}>{fileStatusLabel(file.status)}</span>
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
  const [transferPhase, setTransferPhase] = useState<TransferPhase>("selecting");
  const [trackedFileId, setTrackedFileId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [messageType, setMessageType] = useState<"success" | "error" | "info">("info");
  const [expiryDays, setExpiryDays] = useState("30");
  const [deliveryMode, setDeliveryMode] = useState<"PORTAL" | "PASSWORD_LINK">("PORTAL");
  const [secureTransfer, setSecureTransfer] = useState<OneTimeCredentials | null>(null);
  const [transfers, setTransfers] = useState<SecureTransfer[]>([]);
  const [transferPage, setTransferPage] = useState(1);
  const [transferPagination, setTransferPagination] = useState<PaginationState>({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [showSpaceCreator, setShowSpaceCreator] = useState(false);
  const [newSpaceName, setNewSpaceName] = useState("");
  const [creatingSpace, setCreatingSpace] = useState(false);
  const [deletionSummary, setDeletionSummary] = useState<SpaceDeletionSummary | null>(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [deleteExclusiveClients, setDeleteExclusiveClients] = useState(false);
  const [deletingSpace, setDeletingSpace] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadSpaces = useCallback(async (selectId?: string) => {
    const result = await api<{ spaces: Space[] }>("/api/v1/spaces");
    setSpaces(result.spaces);
    setSpaceId((current) => {
      if (selectId && result.spaces.some((space) => space.id === selectId)) return selectId;
      if (result.spaces.some((space) => space.id === current)) return current;
      return result.spaces[0]?.id ?? "";
    });
  }, []);

  useEffect(() => {
    let active = true;
    void api<{ spaces: Space[] }>("/api/v1/spaces").then((result) => {
      if (!active) return;
      setSpaces(result.spaces);
      setSpaceId((current) => result.spaces.some((space) => space.id === current) ? current : (result.spaces[0]?.id ?? ""));
    });
    return () => { active = false; };
  }, []);

  const loadFiles = useCallback(async () => {
    if (!spaceId) return;
    const result = await api<{ files: PortalFile[] }>(`/api/v1/spaces/${spaceId}/files`);
    setFiles(result.files);
  }, [spaceId]);

  const loadTransfers = useCallback(async (requestedPage = transferPage) => {
    if (role !== "ADMIN" || !spaceId) return;
    const result = await api<{ transfers: SecureTransfer[]; pagination: PaginationState }>(
      `/api/v1/spaces/${spaceId}/secure-transfers?page=${requestedPage}`,
    );
    setTransfers(result.transfers);
    setTransferPagination(result.pagination);
    if (result.pagination.page !== requestedPage) setTransferPage(result.pagination.page);
  }, [role, spaceId, transferPage]);

  useEffect(() => {
    if (!spaceId) return;
    let active = true;
    void api<{ files: PortalFile[] }>(`/api/v1/spaces/${spaceId}/files`).then((fileResult) => {
      if (active) setFiles(fileResult.files);
    });
    const timer = window.setInterval(() => void loadFiles(), 5_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [spaceId, loadFiles]);

  useEffect(() => {
    if (role !== "ADMIN" || !spaceId) return;
    let active = true;
    void api<{ transfers: SecureTransfer[]; pagination: PaginationState }>(
      `/api/v1/spaces/${spaceId}/secure-transfers?page=${transferPage}`,
    ).then((result) => {
      if (!active) return;
      setTransfers(result.transfers);
      setTransferPagination(result.pagination);
      if (result.pagination.page !== transferPage) setTransferPage(result.pagination.page);
    });
    const timer = window.setInterval(() => void loadTransfers(), 5_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [role, spaceId, transferPage, loadTransfers]);

  const choose = (fileList: FileList | null) => {
    setSelected(fileList?.item(0) ?? null);
    setTransferPhase("selecting");
    setTrackedFileId(null);
    setMessage(null);
    setSecureTransfer(null);
  };
  const changeSpace = (nextSpaceId: string) => {
    setSpaceId(nextSpaceId);
    setTransferPage(1);
    setDeletionSummary(null);
    setDeleteConfirmation("");
    setDeleteExclusiveClients(false);
    setTransferPhase("selecting");
    setTrackedFileId(null);
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!spaceId) {
      setMessageType("error");
      setMessage(role === "ADMIN" ? "Create or select a client workspace before choosing a file." : "No client workspace is available. Contact Bitwise Security.");
      return;
    }
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
    setTransferPhase("uploading");
    setTrackedFileId(null);
    setMessage(null);
    setSecureTransfer(null);
    const uploadController = new AbortController();
    let stallTimer: number | undefined;
    const refreshStallTimer = () => {
      if (stallTimer !== undefined) window.clearTimeout(stallTimer);
      stallTimer = window.setTimeout(() => uploadController.abort(), 90_000);
    };
    refreshStallTimer();
    try {
      const result = await uploadEncryptedFile({
        spaceId,
        file: selected,
        expiresInDays: deliveryMode === "PASSWORD_LINK" ? 7 : expiryDays === "never" ? null : Number(expiryDays),
        deliveryMode,
        onProgress: (percentage) => {
          setProgress(percentage);
          refreshStallTimer();
        },
        signal: uploadController.signal,
      });
      setTrackedFileId(result.fileId);
      setTransferPhase("scanning");
      setMessageType("info");
      if (result.secureTransfer) {
        setSecureTransfer(result.secureTransfer);
        setMessage("Secure link created. Follow the live security-scan status above; access activates only after the file passes.");
      } else {
        setMessage("Upload complete. Follow the live security-scan status above; the file remains unavailable unless it passes.");
      }
      setSelected(null);
      await loadFiles();
      if (role === "ADMIN") {
        setTransferPage(1);
        await loadTransfers(1);
      }
    } catch (error) {
      setTransferPhase("selecting");
      setMessageType("error");
      setMessage(error instanceof DOMException && error.name === "AbortError"
        ? "The upload stopped because no progress was received for 90 seconds. Check your connection and try again; incomplete encrypted upload data is cleaned up automatically."
        : error instanceof Error ? error.message : "The upload could not be completed.");
    } finally {
      if (stallTimer !== undefined) window.clearTimeout(stallTimer);
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
      await loadTransfers();
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "The link could not be revoked.");
    }
  };

  const openSpaceDeletion = async () => {
    if (!spaceId) return;
    setMessage(null);
    try {
      const summary = await api<SpaceDeletionSummary>(`/api/v1/admin/spaces/${spaceId}/deletion-summary`);
      setDeletionSummary(summary);
      setDeleteConfirmation("");
      setDeleteExclusiveClients(false);
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "The deletion summary could not be loaded.");
    }
  };

  const deleteSpace = async () => {
    if (!deletionSummary || deleteConfirmation !== deletionSummary.name) return;
    setDeletingSpace(true);
    setMessage(null);
    try {
      await api<void>(`/api/v1/admin/spaces/${deletionSummary.id}`, {
        method: "DELETE",
        body: JSON.stringify({
          confirmation: deleteConfirmation,
          deleteExclusiveClients,
        }),
      });
      setDeletionSummary(null);
      setDeleteConfirmation("");
      setFiles([]);
      setTransfers([]);
      setTransferPagination({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
      await loadSpaces();
      setMessageType("success");
      setMessage("The client space, encrypted files and protected links were permanently deleted.");
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "The client space could not be deleted.");
    } finally {
      setDeletingSpace(false);
    }
  };

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setMessageType("success");
    setMessage(`${label} copied. Share the link and password through separate channels.`);
  };

  const sent = files.filter((file) => file.direction === "CLIENT_TO_ADMIN");
  const reports = files.filter((file) => file.direction === "ADMIN_TO_CLIENT");
  const trackedFile = trackedFileId ? files.find((file) => file.id === trackedFileId) : null;
  const workflowPhase: WorkflowPhase = transferPhase === "scanning" && trackedFile?.status === "AVAILABLE"
    ? "ready"
    : transferPhase === "scanning" && trackedFile?.status === "REJECTED"
      ? "rejected"
      : transferPhase;
  return (
    <section className="portal-section workspace-section" id="workspace">
      <div className="section-heading">
        <div>
          <p className="eyebrow">PRIVATE FILE EXCHANGE</p>
          <h2>{role === "ADMIN" ? "Client workspace" : "Your secure workspace"}</h2>
          <p>{role === "ADMIN" ? "Select a client space, choose how to deliver the file, then let the portal encrypt and screen it." : "Send documents to Bitwise Security and collect completed reports from one private place."}</p>
        </div>
        <span className="section-kicker">Up to 2 GB per file</span>
      </div>
      {role === "ADMIN" ? (
        <div className="space-controls card workspace-toolbar">
          <div className="workspace-toolbar-copy"><span>01</span><div><strong>Choose a workspace</strong><small>Every client space is isolated from the others.</small></div></div>
          {spaces.length > 0 ? (
            <label className="space-picker"><span className="sr-only">Client space</span><select value={spaceId} aria-label="Client space" onChange={(event) => changeSpace(event.target.value)}>{spaces.map((space) => <option value={space.id} key={space.id}>{space.name}</option>)}</select></label>
          ) : <Notice type="info">Create a client space to start sharing files.</Notice>}
          <div className="space-action-buttons">
            <button className="secondary-button small" type="button" onClick={() => setShowSpaceCreator((value) => !value)}>{showSpaceCreator ? "Cancel" : "New space without login"}</button>
            <button className="danger-button small" type="button" disabled={!spaceId} onClick={() => void openSpaceDeletion()}>Delete current space</button>
          </div>
          {showSpaceCreator ? (
            <div className="inline-space-form">
              <label className="field"><span>Client or project name</span><input value={newSpaceName} maxLength={160} onChange={(event) => setNewSpaceName(event.target.value)} /></label>
              <button className="primary-button" type="button" disabled={creatingSpace || !newSpaceName.trim()} onClick={() => void createSpace()}>{creatingSpace ? "Creating…" : "Create private space"}</button>
            </div>
          ) : null}
          {deletionSummary ? (
            <section className="space-deletion-panel" role="alertdialog" aria-labelledby="delete-space-title" aria-describedby="delete-space-warning">
              <p className="eyebrow">PERMANENT GDPR DELETION</p>
              <h2 id="delete-space-title">Delete “{deletionSummary.name}”?</h2>
              <p id="delete-space-warning">This permanently removes the space, {deletionSummary.fileCount} encrypted file{deletionSummary.fileCount === 1 ? "" : "s"}, {deletionSummary.secureTransferCount} protected link{deletionSummary.secureTransferCount === 1 ? "" : "s"}, and unfinished upload data. It cannot be undone.</p>
              <dl className="deletion-summary">
                <div><dt>Files</dt><dd>{deletionSummary.fileCount}</dd></div>
                <div><dt>Protected links</dt><dd>{deletionSummary.secureTransferCount}</dd></div>
                <div><dt>Client accounts</dt><dd>{deletionSummary.clientAccountCount}</dd></div>
              </dl>
              <p className="retention-note">Minimal security audit records are retained for accountability. They do not contain the file contents.</p>
              {deletionSummary.exclusiveClientCount > 0 ? (
                <label className="deletion-checkbox">
                  <input type="checkbox" checked={deleteExclusiveClients} onChange={(event) => setDeleteExclusiveClients(event.target.checked)} />
                  Also delete {deletionSummary.exclusiveClientCount} client account{deletionSummary.exclusiveClientCount === 1 ? "" : "s"} used only by this space
                </label>
              ) : null}
              <label className="field confirmation-field">
                <span>Type <strong>{deletionSummary.name}</strong> to confirm</span>
                <input value={deleteConfirmation} autoComplete="off" onChange={(event) => setDeleteConfirmation(event.target.value)} />
              </label>
              <div className="deletion-actions">
                <button className="secondary-button" type="button" disabled={deletingSpace} onClick={() => { setDeletionSummary(null); setDeleteConfirmation(""); }}>Cancel</button>
                <button className="danger-button" type="button" disabled={deletingSpace || deleteConfirmation !== deletionSummary.name} onClick={() => void deleteSpace()}>{deletingSpace ? "Deleting securely…" : "Permanently delete space"}</button>
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
      <div className="workflow-steps" aria-label="Secure transfer workflow">
        <div className={workflowPhase === "selecting" ? "active" : "complete"} aria-current={workflowPhase === "selecting" ? "step" : undefined}><span>{workflowPhase === "selecting" ? "01" : "✓"}</span><div><strong>{role === "ADMIN" ? "Choose recipient" : "Choose document"}</strong><small>{workflowPhase === "selecting" ? selected ? "File selected — start the encrypted upload below" : (role === "ADMIN" ? "Select a workspace, delivery method and file" : "Select an approved file type") : "Selection complete"}</small></div></div>
        <div className={workflowPhase === "uploading" || workflowPhase === "scanning" ? "active" : workflowPhase === "ready" ? "complete" : workflowPhase === "rejected" ? "error" : ""} aria-current={workflowPhase === "uploading" || workflowPhase === "scanning" ? "step" : undefined}><span>{workflowPhase === "ready" ? "✓" : workflowPhase === "rejected" ? "!" : "02"}</span><div><strong>{workflowPhase === "uploading" ? "Encrypting and uploading" : workflowPhase === "scanning" ? "Security scan running" : workflowPhase === "rejected" ? "File blocked" : "Encrypt and screen"}</strong><small>{workflowPhase === "uploading" ? `${progress ?? 0}% encrypted and uploaded` : workflowPhase === "scanning" ? "Quarantined until malware and file-type checks pass" : workflowPhase === "rejected" ? "The file was never made available" : "AES-GCM encryption and malware scan"}</small></div></div>
        <div className={workflowPhase === "ready" ? "active complete" : ""} aria-current={workflowPhase === "ready" ? "step" : undefined}><span>{workflowPhase === "ready" ? "✓" : "03"}</span><div><strong>{workflowPhase === "ready" ? "Ready for secure delivery" : role === "ADMIN" ? "Deliver securely" : "Available to Bitwise"}</strong><small>{workflowPhase === "ready" ? "Scan passed and controlled access is active" : "Starts only after the security scan passes"}</small></div></div>
      </div>
      <div className={`scan-status ${workflowPhase}`} role="status" aria-live="polite">
        <span aria-hidden="true" />
        {workflowPhase === "selecting" ? selected ? `Selected: ${selected.name} — not uploaded yet. Click “Start encrypted upload” below.` : "Step 1 of 3 — choose the delivery method and file." : null}
        {workflowPhase === "uploading" ? `Step 2 of 3 — encrypting in your browser and uploading (${progress ?? 0}%).` : null}
        {workflowPhase === "scanning" ? "Step 2 of 3 — upload complete; the quarantined file is being scanned. This page checks for the result automatically." : null}
        {workflowPhase === "ready" ? "Step 3 of 3 — scan passed; the file is available through controlled access." : null}
        {workflowPhase === "rejected" ? "Blocked — the file failed the malware or file-type scan and cannot be downloaded." : null}
      </div>
      <div className={role === "ADMIN" && transferPagination.total > 0 ? "workspace-main-grid" : ""}>
      <section className="card upload-card featured-card">
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
        {!spaceId ? <Notice type="info">{role === "ADMIN" ? "No active client workspace exists yet. Create one above before choosing a file." : "No client workspace is available. Contact Bitwise Security before uploading."}</Notice> : null}
        <div className={`drop-zone ${!spaceId ? "disabled" : ""}`} onDragOver={(event) => event.preventDefault()} onDrop={drop}>
          <input ref={inputRef} type="file" accept=".pdf,.docx,.xlsx,.csv,.txt,.png,.jpg,.jpeg" disabled={!spaceId} hidden onChange={(event: ChangeEvent<HTMLInputElement>) => choose(event.target.files)} />
          <strong>{!spaceId ? "Create or select a client workspace first" : selected ? selected.name : "Drag and drop a file here"}</strong>
          <span>{!spaceId ? "Files cannot be uploaded without an isolated destination." : selected ? formatBytes(selected.size) : "or choose one from your device"}</span>
          <button className="secondary-button small" type="button" disabled={!spaceId} onClick={() => inputRef.current?.click()}>{selected ? "Choose another" : "Choose file"}</button>
        </div>
        {deliveryMode === "PASSWORD_LINK" ? <Notice type="info">The encrypted file and link expire automatically after 7 days. Send the link and password using different channels.</Notice> : <label className="expiry-picker">Automatic deletion
          <select value={expiryDays} onChange={(event) => setExpiryDays(event.target.value)}>
            <option value="7">After 7 days</option>
            <option value="30">After 30 days</option>
            <option value="90">After 90 days</option>
            <option value="never">No automatic deletion</option>
          </select>
        </label>}
        {selected && progress == null && spaceId ? <div className="selection-ready" role="status"><span aria-hidden="true">✓</span><div><strong>Ready to upload</strong><small>The file is still only on this device. Start the encrypted upload when you are ready.</small></div></div> : null}
        {progress != null ? <div className="upload-progress"><progress max="100" value={progress} /><span>{progress}% encrypted and uploaded</span></div> : null}
        <button className="primary-button upload-start-button" data-testid="start-upload" type="button" disabled={!selected || !spaceId || progress != null} onClick={() => void upload()}>{progress != null ? `Encrypting and uploading… ${progress}%` : !spaceId ? "Create or select a client workspace first" : deliveryMode === "PASSWORD_LINK" ? "Start encrypted upload and create link" : "Start encrypted upload"}</button>
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
      {role === "ADMIN" && transferPagination.total > 0 ? (
        <section className="card transfer-list-card">
          <div className="card-heading"><div><p className="eyebrow">ACTIVE DELIVERY</p><h2>Password-protected links</h2></div><span className="count">{transferPagination.total}</span></div>
          {transfers.map((transfer) => <article className="transfer-row" key={transfer.id}><div><strong>{transfer.display_name}</strong><span>{transfer.status.replaceAll("_", " ")} · {transfer.download_count} downloads · expires {new Date(transfer.expires_at).toLocaleDateString()}</span></div>{transfer.status === "ACTIVE" || transfer.status === "PENDING_SCAN" ? <button className="danger-link" type="button" onClick={() => void revokeTransfer(transfer.id)}>Revoke link</button> : null}</article>)}
          <Pagination value={transferPagination} itemLabel="links" disabled={progress != null} onChange={setTransferPage} />
        </section>
      ) : null}
      </div>
      <div className="file-columns">
        <FileList files={sent} title="Files sent to Bitwise Security" empty="No client documents yet." role={role} onChanged={loadFiles} />
        <FileList files={reports} title="Reports shared with the client" empty="No reports have been shared yet." role={role} onChanged={loadFiles} />
      </div>
    </section>
  );
}
