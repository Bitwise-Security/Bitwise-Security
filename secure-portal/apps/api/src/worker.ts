import { createHash } from "node:crypto";
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
  const result = await getPool().query<ScanFile>(
    `UPDATE files SET status = 'SCANNING', scan_started_at = now(),
       scan_attempts = scan_attempts + 1, updated_at = now()
     WHERE id = (
       SELECT id FROM files
       WHERE status = 'QUARANTINED'
          OR (status = 'SCANNING' AND scan_started_at < now() - interval '2 hours')
       ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
     )
     RETURNING id, display_name, storage_key, plaintext_size, chunk_size,
       chunk_count, nonce_prefix, wrapped_dek, key_version, scan_attempts`,
  );
  return result.rows[0] ?? null;
}

async function scanFile(file: ScanFile): Promise<void> {
  const storage = getStorage();
  const key = await getFileKeyProvider().unwrap(file.wrapped_dek, file.key_version);
  const plaintextHash = createHash("sha256");
  const scanInput = new PassThrough({ highWaterMark: 1024 * 1024 });
  const scanPromise = getMalwareScanner().scan(scanInput);
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
      await getPool().query(
        `WITH rejected AS (
           UPDATE files SET status = 'REJECTED', rejection_code = $2,
             detected_content_type = $3, scan_completed_at = now(), updated_at = now()
           WHERE id = $1 RETURNING id, organization_id
         )
         INSERT INTO audit_events
           (organization_id, action, target_type, target_id, outcome, metadata)
         SELECT organization_id, 'FILE_SCAN_REJECTED', 'FILE', id, 'SUCCESS',
                jsonb_build_object('reason', $2::text) FROM rejected`,
        [file.id, rejectionCode, typeResult.detectedType],
      );
      await storage.deleteObject(file.storage_key);
      return;
    }
    await getPool().query(
      `WITH available AS (
         UPDATE files SET status = 'AVAILABLE', plaintext_sha256 = $2,
           detected_content_type = $3, scan_completed_at = now(), updated_at = now()
         WHERE id = $1 RETURNING id, organization_id
       )
       INSERT INTO audit_events
         (organization_id, action, target_type, target_id, outcome, metadata)
       SELECT organization_id, 'FILE_SCAN_PASSED', 'FILE', id, 'SUCCESS', '{}'::jsonb
       FROM available`,
      [file.id, plaintextHash.digest("hex"), typeResult.detectedType],
    );
    await getPool().query(
      `INSERT INTO notification_outbox (kind, recipient_email, subject, text_body)
       SELECT 'FILE_AVAILABLE', recipients.email,
              CASE WHEN f.direction = 'CLIENT_TO_ADMIN'
                   THEN 'A client uploaded a file securely'
                   ELSE 'A report is available in your secure portal' END,
              CASE WHEN f.direction = 'CLIENT_TO_ADMIN'
                   THEN 'A client file passed validation and is available in the Bitwise Secure Portal. Sign in to review it.'
                   ELSE 'A new report passed validation and is available in your Bitwise Secure Portal client space.' END
       FROM files f
       JOIN LATERAL (
         SELECT DISTINCT u.email
         FROM users u
         WHERE u.status = 'ACTIVE' AND (
           (f.direction = 'CLIENT_TO_ADMIN' AND EXISTS (
             SELECT 1 FROM organization_memberships om
             WHERE om.user_id = u.id AND om.organization_id = f.organization_id AND om.role = 'ADMIN'
           )) OR
           (f.direction = 'ADMIN_TO_CLIENT' AND EXISTS (
             SELECT 1 FROM space_memberships sm WHERE sm.user_id = u.id AND sm.space_id = f.space_id
           ))
         )
       ) recipients ON true
       WHERE f.id = $1`,
      [file.id],
    );
  } catch (error) {
    scanInput.destroy(error as Error);
    await scanPromise.catch(() => undefined);
    await getPool().query(
      `UPDATE files SET status = CASE WHEN scan_attempts >= 3 THEN 'REJECTED'::file_status
                                     ELSE 'QUARANTINED'::file_status END,
         rejection_code = CASE WHEN scan_attempts >= 3 THEN 'SCAN_FAILED' ELSE NULL END,
         updated_at = now()
       WHERE id = $1`,
      [file.id],
    );
  } finally {
    key.fill(0);
  }
}

async function sendNextNotification(): Promise<boolean> {
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
       WHERE status = 'PENDING' AND available_at <= now()
       ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
     )
     RETURNING id, recipient_email::text, subject, text_body, attempts`,
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
      "UPDATE notification_outbox SET status = 'SENT', sent_at = now(), last_error_code = NULL WHERE id = $1",
      [message.id],
    );
  } catch {
    await getPool().query(
      `UPDATE notification_outbox
       SET status = CASE WHEN attempts >= 5 THEN 'FAILED' ELSE 'PENDING' END,
           available_at = now() + (LEAST(attempts * attempts, 60) * interval '1 minute'),
           last_error_code = 'DELIVERY_FAILED'
       WHERE id = $1`,
      [message.id],
    );
  }
  return true;
}

async function expireNextFile(): Promise<boolean> {
  const result = await getPool().query<{
    id: string;
    storage_key: string;
    organization_id: string;
  }>(
    `SELECT id, storage_key, organization_id FROM files
     WHERE status = 'AVAILABLE' AND expires_at IS NOT NULL AND expires_at <= now()
     ORDER BY expires_at FOR UPDATE SKIP LOCKED LIMIT 1`,
  );
  const file = result.rows[0];
  if (!file) return false;
  await getStorage().deleteObject(file.storage_key);
  await getPool().query(
    `WITH expired AS (
       UPDATE files SET status = 'EXPIRED', deleted_at = now(), updated_at = now()
       WHERE id = $1 AND status = 'AVAILABLE' RETURNING id, organization_id
     )
     INSERT INTO audit_events
       (organization_id, action, target_type, target_id, outcome, metadata)
     SELECT organization_id, 'FILE_EXPIRED', 'FILE', id, 'SUCCESS',
            '{"objectDeleted":true}'::jsonb FROM expired`,
    [file.id],
  );
  return true;
}

async function cleanupNextUpload(): Promise<boolean> {
  const result = await getPool().query<{
    id: string;
    file_id: string;
    storage_upload_id: string;
    storage_key: string;
    organization_id: string;
  }>(
    `SELECT us.id, us.file_id, us.storage_upload_id, f.storage_key, f.organization_id
     FROM upload_sessions us JOIN files f ON f.id = us.file_id
     WHERE us.state = 'OPEN' AND us.expires_at <= now()
     ORDER BY us.expires_at FOR UPDATE OF us SKIP LOCKED LIMIT 1`,
  );
  const upload = result.rows[0];
  if (!upload) return false;
  await getStorage().abortUpload(upload.storage_key, upload.storage_upload_id);
  await getPool().query(
    `WITH abandoned AS (
       UPDATE upload_sessions SET state = 'EXPIRED' WHERE id = $1 RETURNING file_id
     ), removed AS (
       UPDATE files SET status = 'EXPIRED', deleted_at = now(), updated_at = now()
       WHERE id = (SELECT file_id FROM abandoned) RETURNING id, organization_id
     )
     INSERT INTO audit_events
       (organization_id, action, target_type, target_id, outcome, metadata)
     SELECT organization_id, 'FILE_UPLOAD_EXPIRED', 'FILE', id, 'SUCCESS',
            '{"incompleteUploadAborted":true}'::jsonb FROM removed`,
    [upload.id],
  );
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
