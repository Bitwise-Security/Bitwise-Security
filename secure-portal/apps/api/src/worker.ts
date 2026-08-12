import { createHash, randomUUID } from "node:crypto";
import { once } from "node:events";
import { PassThrough } from "node:stream";
import { setTimeout as delay } from "node:timers/promises";
import { closePool, getPool } from "./db.js";
import { decryptChunk } from "./files/file-crypto.js";
import { getFileKeyProvider } from "./files/key-provider.js";
import { verifyDetectedType } from "./files/policy.js";
import { getMalwareScanner } from "./files/scanner.js";
import { getStorage } from "./files/storage.js";
import { sendMail } from "./services/mail.js";

interface ScanFile {
  id: string;
  organization_id: string;
  display_name: string;
  storage_key: string;
  plaintext_size: string;
  chunk_size: number;
  chunk_count: number;
  nonce_prefix: Buffer;
  wrapped_dek: Buffer;
  key_version: string;
  scan_attempts: number;
}

let stopping = false;
process.on("SIGTERM", () => { stopping = true; });
process.on("SIGINT", () => { stopping = true; });

async function claimFile(): Promise<ScanFile | null> {
  const now = Date.now();
  const result = await getPool().query<ScanFile>(
    `UPDATE files SET status = 'SCANNING', scan_started_at = $1,
       scan_attempts = scan_attempts + 1, updated_at = $1
     WHERE id = (
       SELECT id FROM files
       WHERE status = 'QUARANTINED'
          OR (status = 'SCANNING' AND scan_started_at < $2)
       ORDER BY created_at LIMIT 1
     )
     AND (status = 'QUARANTINED' OR (status = 'SCANNING' AND scan_started_at < $2))
     RETURNING id, organization_id, display_name, storage_key, plaintext_size, chunk_size,
       chunk_count, nonce_prefix, wrapped_dek, key_version, scan_attempts`,
    [now, now - 7_200_000],
  );
  return result.rows[0] ?? null;
}

async function scanFile(file: ScanFile): Promise<void> {
  const storage = getStorage();
  const key = await getFileKeyProvider().unwrap(file.wrapped_dek, file.key_version);
  const plaintextHash = createHash("sha256");
  const scanInput = new PassThrough({ highWaterMark: 1024 * 1024 });
  const scanPromise = getMalwareScanner().scan(scanInput);
  // The scanner connects while encrypted chunks are fetched and decrypted. Attach
  // a handler immediately so an early socket failure cannot become an unhandled
  // rejection and terminate the maintenance process before Promise.all awaits it.
  void scanPromise.catch(() => undefined);
  let firstBytes = Buffer.alloc(0);
  let absoluteOffset = 0;
  try {
    for (let partNumber = 1; partNumber <= file.chunk_count; partNumber += 1) {
      const plaintextLength = Math.min(
        file.chunk_size,
        Number(file.plaintext_size) - (partNumber - 1) * file.chunk_size,
      );
      const ciphertextLength = plaintextLength + 16;
      const encrypted = await storage.readPart(
        file.storage_key,
        partNumber,
        storage.mode === "local" ? 0 : absoluteOffset,
        ciphertextLength,
      );
      const plaintext = decryptChunk(
        encrypted,
        key,
        file.nonce_prefix,
        file.id,
        partNumber,
        plaintextLength,
      );
      plaintextHash.update(plaintext);
      if (firstBytes.length < 8192) {
        firstBytes = Buffer.concat([firstBytes, plaintext.subarray(0, 8192 - firstBytes.length)]);
      }
      if (!scanInput.write(plaintext)) await once(scanInput, "drain");
      absoluteOffset += ciphertextLength;
    }
    scanInput.end();
    const [scanResult, typeResult] = await Promise.all([
      scanPromise,
      verifyDetectedType(file.display_name, firstBytes),
    ]);
    if (!scanResult.clean || !typeResult.allowed) {
      const rejectionCode = !scanResult.clean ? "MALWARE_DETECTED" : (typeResult.reason ?? "CONTENT_TYPE_MISMATCH");
      const now = Date.now();
      const transitioned = await getPool().query(
        `UPDATE files SET status = 'REJECTED', rejection_code = $2,
          detected_content_type = $3, scan_completed_at = $4, updated_at = $4
         WHERE id = $1 AND status = 'SCANNING' RETURNING id`,
        [file.id, rejectionCode, typeResult.detectedType, now],
      );
      if (!transitioned.rowCount) return;
      await getPool().batch([
        {
          sql: `INSERT INTO audit_events
                  (organization_id, action, target_type, target_id, outcome, metadata)
                VALUES ($1, 'FILE_SCAN_REJECTED', 'FILE', $2, 'SUCCESS', $3)`,
          params: [file.organization_id, file.id, JSON.stringify({ reason: rejectionCode })],
        },
        {
          sql: `UPDATE secure_transfers SET status = 'REVOKED', revoked_at = $2
                WHERE file_id = $1 AND status = 'PENDING_SCAN'`,
          params: [file.id, now],
        },
      ]);
      await storage.deleteObject(file.storage_key);
      return;
    }
    const now = Date.now();
    const transitioned = await getPool().query(
      `UPDATE files SET status = 'AVAILABLE', plaintext_sha256 = $2,
        detected_content_type = $3, scan_completed_at = $4, updated_at = $4
       WHERE id = $1 AND status = 'SCANNING' RETURNING id`,
      [file.id, plaintextHash.digest("hex"), typeResult.detectedType, now],
    );
    if (!transitioned.rowCount) return;
    await getPool().batch([
      {
        sql: `INSERT INTO audit_events
                (organization_id, action, target_type, target_id, outcome, metadata)
              VALUES ($1, 'FILE_SCAN_PASSED', 'FILE', $2, 'SUCCESS', '{}')`,
        params: [file.organization_id, file.id],
      },
      {
        sql: `UPDATE secure_transfers SET status = 'ACTIVE'
              WHERE file_id = $1 AND status = 'PENDING_SCAN' AND expires_at > $2`,
        params: [file.id, now],
      },
    ]);
    const recipients = await getPool().query<{
      email: string;
      direction: "CLIENT_TO_ADMIN" | "ADMIN_TO_CLIENT";
    }>(
      `SELECT DISTINCT u.email, f.direction
       FROM files f
       JOIN users u ON u.status = 'ACTIVE'
       WHERE f.id = $1 AND (
         (f.direction = 'CLIENT_TO_ADMIN' AND EXISTS (
           SELECT 1 FROM organization_memberships om
           WHERE om.user_id = u.id AND om.organization_id = f.organization_id AND om.role = 'ADMIN'
         )) OR
         (f.direction = 'ADMIN_TO_CLIENT' AND EXISTS (
           SELECT 1 FROM space_memberships sm WHERE sm.user_id = u.id AND sm.space_id = f.space_id
         ))
       )`,
      [file.id],
    );
    if (recipients.rows.length) {
      await getPool().batch(recipients.rows.map((recipient) => ({
        sql: `INSERT INTO notification_outbox (id, kind, recipient_email, subject, text_body)
              VALUES ($1, 'FILE_AVAILABLE', $2, $3, $4)`,
        params: [
          randomUUID(),
          recipient.email,
          recipient.direction === "CLIENT_TO_ADMIN"
            ? "A client uploaded a file securely"
            : "A report is available in your secure portal",
          recipient.direction === "CLIENT_TO_ADMIN"
            ? "A client file passed validation and is available in the Bitwise Secure Portal. Sign in to review it."
            : "A new report passed validation and is available in your Bitwise Secure Portal client space.",
        ],
      })));
    }
  } catch (error) {
    scanInput.destroy(error as Error);
    await scanPromise.catch(() => undefined);
    console.error(JSON.stringify({
      event: "file_scan_failed",
      fileId: file.id,
      attempt: file.scan_attempts,
      error: error instanceof Error ? error.message : "unknown",
    }));
    await getPool().query(
      `UPDATE files SET status = CASE WHEN scan_attempts >= 3 THEN 'REJECTED'::file_status
                                     ELSE 'QUARANTINED'::file_status END,
         rejection_code = CASE WHEN scan_attempts >= 3 THEN 'SCAN_FAILED' ELSE NULL END,
         updated_at = now()
       WHERE id = $1 AND status = 'SCANNING'`,
      [file.id],
    );
  } finally {
    key.fill(0);
  }
}

async function sendNextNotification(): Promise<boolean> {
  const now = Date.now();
  const claimed = await getPool().query<{
    id: string;
    recipient_email: string;
    subject: string;
    text_body: string;
    attempts: number;
  }>(
    `UPDATE notification_outbox SET status = 'SENDING', attempts = attempts + 1
     WHERE id = (
       SELECT id FROM notification_outbox
       WHERE status = 'PENDING' AND available_at <= $1
       ORDER BY created_at LIMIT 1
     )
     AND status = 'PENDING'
     RETURNING id, recipient_email, subject, text_body, attempts`,
    [now],
  );
  const message = claimed.rows[0];
  if (!message) return false;
  try {
    await sendMail({
      to: message.recipient_email,
      subject: message.subject,
      text: message.text_body,
      idempotencyKey: `portal-notification-${message.id}`,
    });
    await getPool().query(
      "UPDATE notification_outbox SET status = 'SENT', sent_at = $2, last_error_code = NULL WHERE id = $1",
      [message.id, Date.now()],
    );
  } catch {
    await getPool().query(
      `UPDATE notification_outbox
       SET status = CASE WHEN attempts >= 5 THEN 'FAILED' ELSE 'PENDING' END,
           available_at = $2,
           last_error_code = 'DELIVERY_FAILED'
       WHERE id = $1`,
      [message.id, Date.now() + Math.min(message.attempts * message.attempts, 60) * 60_000],
    );
  }
  return true;
}

async function expireNextFile(): Promise<boolean> {
  const now = Date.now();
  const result = await getPool().query<{
    id: string;
    storage_key: string;
    organization_id: string;
  }>(
    `SELECT id, storage_key, organization_id FROM files
     WHERE status = 'AVAILABLE' AND expires_at IS NOT NULL AND expires_at <= $1
     ORDER BY expires_at LIMIT 1`,
    [now],
  );
  const file = result.rows[0];
  if (!file) return false;
  const claimed = await getPool().query(
    "UPDATE files SET status = 'EXPIRED', deleted_at = $2, updated_at = $2 WHERE id = $1 AND status = 'AVAILABLE' RETURNING id",
    [file.id, now],
  );
  if (!claimed.rowCount) return true;
  await getStorage().deleteObject(file.storage_key);
  await getPool().batch([
    {
      sql: `UPDATE secure_transfers SET status = 'EXPIRED'
            WHERE file_id = $1 AND status IN ('PENDING_SCAN', 'ACTIVE')`,
      params: [file.id],
    },
    {
      sql: `INSERT INTO audit_events
             (organization_id, action, target_type, target_id, outcome, metadata)
            VALUES ($1, 'FILE_EXPIRED', 'FILE', $2, 'SUCCESS', '{"objectDeleted":true}')`,
      params: [file.organization_id, file.id],
    },
  ]);
  return true;
}

async function cleanupNextUpload(): Promise<boolean> {
  const now = Date.now();
  const result = await getPool().query<{
    id: string;
    file_id: string;
    storage_upload_id: string;
    storage_key: string;
    organization_id: string;
  }>(
    `SELECT us.id, us.file_id, us.storage_upload_id, f.storage_key, f.organization_id
     FROM upload_sessions us JOIN files f ON f.id = us.file_id
     WHERE us.state = 'OPEN' AND us.expires_at <= $1
     ORDER BY us.expires_at LIMIT 1`,
    [now],
  );
  const upload = result.rows[0];
  if (!upload) return false;
  const claimed = await getPool().query(
    "UPDATE upload_sessions SET state = 'EXPIRED' WHERE id = $1 AND state = 'OPEN' RETURNING file_id",
    [upload.id],
  );
  if (!claimed.rowCount) return true;
  await getStorage().abortUpload(upload.storage_key, upload.storage_upload_id);
  await getPool().batch([
    {
      sql: "UPDATE files SET status = 'EXPIRED', deleted_at = $2, updated_at = $2 WHERE id = $1",
      params: [upload.file_id, now],
    },
    {
      sql: `UPDATE secure_transfers SET status = 'EXPIRED'
            WHERE file_id = $1 AND status = 'PENDING_SCAN'`,
      params: [upload.file_id],
    },
    {
      sql: `INSERT INTO audit_events
              (organization_id, action, target_type, target_id, outcome, metadata)
            VALUES ($1, 'FILE_UPLOAD_EXPIRED', 'FILE', $2, 'SUCCESS', '{"incompleteUploadAborted":true}')`,
      params: [upload.organization_id, upload.file_id],
    },
  ]);
  return true;
}

try {
  while (!stopping) {
    const file = await claimFile();
    if (file) await scanFile(file);
    const sentNotification = await sendNextNotification();
    const expiredFile = await expireNextFile();
    const cleanedUpload = await cleanupNextUpload();
    if (!file && !sentNotification && !expiredFile && !cleanedUpload) await delay(5_000);
  }
} finally {
  await closePool();
}
