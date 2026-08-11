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
  const [expiryDays, setExpiryDays] = useState("30");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void api<{ spaces: Space[] }>("/api/v1/spaces").then((result) => {
      setSpaces(result.spaces);
      setSpaceId((current) => current || result.spaces[0]?.id || "");
    });
  }, []);

  const loadFiles = useCallback(async () => {
    if (!spaceId) return;
    const result = await api<{ files: PortalFile[] }>(`/api/v1/spaces/${spaceId}/files`);
    setFiles(result.files);
  }, [spaceId]);

  useEffect(() => {
    if (!spaceId) return;
    const timer = window.setInterval(() => void loadFiles(), 5_000);
    return () => window.clearInterval(timer);
  }, [spaceId, loadFiles]);

  useEffect(() => {
    if (!spaceId) return;
    let active = true;
    void api<{ files: PortalFile[] }>(`/api/v1/spaces/${spaceId}/files`).then((result) => {
      if (active) setFiles(result.files);
    });
    return () => { active = false; };
  }, [spaceId]);

  const choose = (fileList: FileList | null) => {
    const file = fileList?.item(0) ?? null;
    setSelected(file);
    setMessage(null);
  };
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    choose(event.dataTransfer.files);
  };
  const upload = async () => {
    if (!selected || !spaceId) return;
    setProgress(0);
    setMessage(null);
    try {
      await uploadEncryptedFile({
        spaceId,
        file: selected,
        expiresInDays: expiryDays === "never" ? null : Number(expiryDays),
        onProgress: setProgress,
      });
      setMessage("Upload complete. The file is quarantined while its type and malware scan are checked.");
      setSelected(null);
      await loadFiles();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The upload could not be completed.");
    } finally {
      setProgress(null);
    }
  };

  const sent = files.filter((file) => file.direction === "CLIENT_TO_ADMIN");
  const reports = files.filter((file) => file.direction === "ADMIN_TO_CLIENT");
  return (
    <>
      {role === "ADMIN" && spaces.length > 0 ? (
        <label className="space-picker">Client space<select value={spaceId} onChange={(event) => setSpaceId(event.target.value)}>{spaces.map((space) => <option value={space.id} key={space.id}>{space.name}</option>)}</select></label>
      ) : null}
      <section className="card upload-card">
        <div>
          <p className="eyebrow">ENCRYPTED BEFORE STORAGE</p>
          <h2>{role === "ADMIN" ? "Share a report" : "Send a document securely"}</h2>
          <p className="muted">PDF, DOCX, XLSX, CSV, TXT, PNG or JPEG · maximum 2 GB</p>
        </div>
        {message ? <Notice type={message.startsWith("Upload complete") ? "success" : "error"}>{message}</Notice> : null}
        <div className="drop-zone" onDragOver={(event) => event.preventDefault()} onDrop={drop}>
          <input ref={inputRef} type="file" hidden onChange={(event: ChangeEvent<HTMLInputElement>) => choose(event.target.files)} />
          <strong>{selected ? selected.name : "Drag and drop a file here"}</strong>
          <span>{selected ? formatBytes(selected.size) : "or choose one from your device"}</span>
          <button className="secondary-button small" type="button" onClick={() => inputRef.current?.click()}>{selected ? "Choose another" : "Choose file"}</button>
        </div>
        <label className="expiry-picker">Automatic deletion
          <select value={expiryDays} onChange={(event) => setExpiryDays(event.target.value)}>
            <option value="7">After 7 days</option>
            <option value="30">After 30 days</option>
            <option value="90">After 90 days</option>
            <option value="never">No automatic deletion</option>
          </select>
        </label>
        {progress != null ? <div className="upload-progress"><progress max="100" value={progress} /><span>{progress}% encrypted and uploaded</span></div> : null}
        {selected ? <button className="primary-button" type="button" disabled={progress != null} onClick={() => void upload()}>Encrypt and upload</button> : null}
      </section>
      <div className="file-columns">
        <FileList files={sent} title="Files sent to Bitwise Security" empty="No client documents yet." role={role} onChanged={loadFiles} />
        <FileList files={reports} title="Reports shared with the client" empty="No reports have been shared yet." role={role} onChanged={loadFiles} />
      </div>
    </>
  );
}
