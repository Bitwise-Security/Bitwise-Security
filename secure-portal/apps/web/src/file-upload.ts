import { api, uploadBinary } from "./api";

interface UploadSession {
  id: string;
  fileId: string;
  chunkSize: number;
  chunkCount: number;
  noncePrefix: string;
  plaintextKey: string;
  completedParts: number[];
  secureTransfer?: {
    id: string;
    url: string;
    password: string;
    expiresAt: string;
  };
}

interface PartTarget {
  mode: "s3" | "proxy";
  url: string;
  ciphertextSize: number;
}

function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(decoded.length));
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
  return bytes;
}

function nonce(prefix: Uint8Array<ArrayBuffer>, partNumber: number): Uint8Array<ArrayBuffer> {
  const value = new Uint8Array(new ArrayBuffer(12));
  value.set(prefix, 0);
  new DataView(value.buffer).setUint32(8, partNumber - 1, false);
  return value;
}

export interface UploadResult {
  fileId: string;
  secureTransfer?: UploadSession["secureTransfer"];
}

function declaredContentType(file: File): string {
  if (file.type) return file.type;
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  return {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".csv": "text/csv",
    ".txt": "text/plain",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
  }[extension] ?? "application/octet-stream";
}

export async function uploadEncryptedFile(options: {
  spaceId: string;
  file: File;
  expiresInDays: number | null;
  deliveryMode?: "PORTAL" | "PASSWORD_LINK";
  onProgress: (percentage: number) => void;
  signal?: AbortSignal;
}): Promise<UploadResult> {
  const session = await api<UploadSession>(`/api/v1/spaces/${options.spaceId}/uploads`, {
    method: "POST",
    body: JSON.stringify({
      displayName: options.file.name,
      contentType: declaredContentType(options.file),
      size: options.file.size,
      expiresInDays: options.expiresInDays,
      deliveryMode: options.deliveryMode ?? "PORTAL",
    }),
    signal: options.signal ?? null,
  });
  const keyBytes = decodeBase64(session.plaintextKey);
  const prefix = decodeBase64(session.noncePrefix);
  const key = await crypto.subtle.importKey("raw", keyBytes, "AES-GCM", false, ["encrypt"]);
  keyBytes.fill(0);
  const completed = new Set(session.completedParts);

  for (let partNumber = 1; partNumber <= session.chunkCount; partNumber += 1) {
    if (options.signal?.aborted) throw new DOMException("Upload cancelled", "AbortError");
    if (completed.has(partNumber)) continue;
    const start = (partNumber - 1) * session.chunkSize;
    const end = Math.min(options.file.size, start + session.chunkSize);
    const plaintext = await options.file.slice(start, end).arrayBuffer();
    const aad = new TextEncoder().encode(
      `bitwise-file-v1:${session.fileId}:${partNumber}:${end - start}`,
    );
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: nonce(prefix, partNumber), additionalData: aad, tagLength: 128 },
      key,
      plaintext,
    );
    const target = await api<PartTarget>(
      `/api/v1/uploads/${session.id}/parts/${partNumber}/url`,
      { method: "POST", body: "{}", signal: options.signal ?? null },
    );
    if (ciphertext.byteLength !== target.ciphertextSize) throw new Error("Encrypted chunk size mismatch");
    const etag = await uploadBinary(target.url, ciphertext, target.mode === "s3", options.signal);
    if (target.mode === "s3") {
      await api<void>(`/api/v1/uploads/${session.id}/parts/${partNumber}/confirm`, {
        method: "POST",
        body: JSON.stringify({ etag, ciphertextSize: ciphertext.byteLength }),
        signal: options.signal ?? null,
      });
    }
    options.onProgress(Math.round((partNumber / session.chunkCount) * 100));
  }
  await api(`/api/v1/uploads/${session.id}/complete`, { method: "POST", body: "{}", signal: options.signal ?? null });
  return { fileId: session.fileId, secureTransfer: session.secureTransfer };
}
