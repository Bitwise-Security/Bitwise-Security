import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { Readable } from "node:stream";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { getConfig } from "../config.js";
import { getPool } from "../db.js";
import { AppError } from "../errors.js";
import { canAccessSpace, findAuthorizedFile } from "../files/authorization.js";
import { decryptChunk } from "../files/file-crypto.js";
import { getFileKeyProvider } from "../files/key-provider.js";
import { clientFilePolicy, declaredFileAllowed, sanitizeDisplayName } from "../files/policy.js";
import { getStorage } from "../files/storage.js";
import { constantTimeTextEqual, tokenDigest } from "../security/crypto.js";
import { requireAuth, requireCsrf } from "../security/sessions.js";
import { auditEventQuery, writeAuditEvent } from "../services/audit.js";

const uploadCreateSchema = z.object({
  displayName: z.string().min(1).max(500),
  contentType: z.string().min(1).max(200),
  size: z.number().int().positive(),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
});
const idParams = z.object({ id: z.string().uuid() });
const partParams = z.object({ id: z.string().uuid(), partNumber: z.coerce.number().int().min(1).max(10_000) });
const confirmPartSchema = z.object({ etag: z.string().min(1).max(300), ciphertextSize: z.number().int().positive() });
const ticketParams = z.object({ ticket: z.string().min(60).max(500) });
const fileUpdateSchema = z.object({
  displayName: z.string().min(1).max(500).optional(),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
}).refine((value) => value.displayName !== undefined || value.expiresInDays !== undefined);

function invalidRequest(): never {
  throw new AppError(400, "Invalid request", "INVALID_REQUEST");
}

export function expectedPartLengths(file: {
  plaintext_size: string;
  chunk_size: number;
  chunk_count: number;
}, partNumber: number): { plaintext: number; ciphertext: number } {
  if (partNumber > file.chunk_count) invalidRequest();
  const total = Number(file.plaintext_size);
  const plaintext = Math.min(file.chunk_size, total - (partNumber - 1) * file.chunk_size);
  return { plaintext, ciphertext: plaintext + 16 };
}

async function findOwnedUpload(request: FastifyRequest, uploadId: string) {
  const auth = request.auth!;
  const result = await getPool().query<{
    upload_session_id: string;
    storage_upload_id: string;
    state: string;
    file_id: string;
    storage_key: string;
    plaintext_size: string;
    chunk_size: number;
    chunk_count: number;
    nonce_prefix: Buffer;
    wrapped_dek: Buffer;
    key_version: string;
  }>(
    `SELECT us.id AS upload_session_id, us.storage_upload_id, us.state,
            f.id AS file_id, f.storage_key, f.plaintext_size, f.chunk_size,
            f.chunk_count, f.nonce_prefix, f.wrapped_dek, f.key_version
     FROM upload_sessions us
     JOIN files f ON f.id = us.file_id AND f.status = 'UPLOADING'
     WHERE us.id = $1 AND us.created_by = $2 AND us.state = 'OPEN'
       AND us.expires_at > now() AND f.organization_id = $3`,
    [uploadId, auth.userId, auth.organizationId],
  );
  return result.rows[0] ?? null;
}

function signDownloadTicket(payload: string): string {
  return createHmac("sha256", getConfig().SESSION_PEPPER).update(payload).digest("base64url");
}

function parseTicket(ticket: string): { id: string; expires: number } | null {
  const [id, expiresValue, random, signature, ...rest] = ticket.split(".");
  if (!id || !expiresValue || !random || !signature || rest.length > 0) return null;
  const payload = `${id}.${expiresValue}.${random}`;
  if (!constantTimeTextEqual(signature, signDownloadTicket(payload))) return null;
  const expires = Number(expiresValue);
  if (!Number.isSafeInteger(expires) || expires < Date.now()) return null;
  return { id, expires };
}

export function registerFileRoutes(app: FastifyInstance): void {
  app.get("/api/v1/spaces", { preHandler: requireAuth }, async (request) => {
    const auth = request.auth!;
    const result = await getPool().query<{ id: string; name: string }>(
      `SELECT cs.id, cs.name FROM client_spaces cs
       WHERE cs.organization_id = $1 AND cs.archived_at IS NULL
         AND ($2 = 'ADMIN' OR EXISTS (
           SELECT 1 FROM space_memberships sm WHERE sm.space_id = cs.id AND sm.user_id = $3
         ))
       ORDER BY cs.name`,
      [auth.organizationId, auth.role, auth.userId],
    );
    return { spaces: result.rows };
  });

  app.get("/api/v1/spaces/:id/files", { preHandler: requireAuth }, async (request) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) invalidRequest();
    const auth = request.auth!;
    if (!(await canAccessSpace(auth, params.data.id))) throw new AppError(404, "Space not found", "NOT_FOUND");
    const result = await getPool().query(
      `SELECT f.id, f.direction, f.display_name, f.plaintext_size, f.status,
              f.detected_content_type, f.expires_at, f.created_at,
              f.uploader_user_id = $3 AS uploaded_by_me
       FROM files f
       WHERE f.space_id = $2 AND f.organization_id = $1 AND f.deleted_at IS NULL
       ORDER BY f.created_at DESC`,
      [auth.organizationId, params.data.id, auth.userId],
    );
    return { files: result.rows };
  });

  app.get("/api/v1/files/policy", { preHandler: requireAuth }, () => ({
    ...clientFilePolicy,
    maxFileSizeBytes: getConfig().MAX_FILE_SIZE_BYTES,
    chunkSizeBytes: getConfig().UPLOAD_CHUNK_SIZE_BYTES,
  }));

  app.post(
    "/api/v1/spaces/:id/uploads",
    { preHandler: [requireAuth, requireCsrf] },
    async (request, reply) => {
      const params = idParams.safeParse(request.params);
      const body = uploadCreateSchema.safeParse(request.body);
      if (!params.success || !body.success) invalidRequest();
      const auth = request.auth!;
      if (!(await canAccessSpace(auth, params.data.id))) {
        throw new AppError(404, "Space not found", "NOT_FOUND");
      }
      if (body.data.size > getConfig().MAX_FILE_SIZE_BYTES) {
        throw new AppError(413, "File exceeds the 2 GB limit", "FILE_TOO_LARGE");
      }
      let displayName: string;
      try {
        displayName = sanitizeDisplayName(body.data.displayName);
      } catch {
        throw new AppError(400, "Filename is invalid", "INVALID_FILENAME");
      }
      if (!declaredFileAllowed(displayName, body.data.contentType)) {
        throw new AppError(415, "This file type is not allowed", "FILE_TYPE_BLOCKED");
      }

      const fileId = randomUUID();
      const storageKey = randomUUID().replaceAll("-", "");
      const noncePrefix = randomBytes(8);
      const chunkSize = getConfig().UPLOAD_CHUNK_SIZE_BYTES;
      const chunkCount = Math.ceil(body.data.size / chunkSize);
      const generatedKey = await getFileKeyProvider().generate();
      const storage = getStorage();
      let storageUploadId: string | null = null;
      try {
        storageUploadId = await storage.createUpload(storageKey);
        const uploadId = randomUUID();
        const now = Date.now();
        await getPool().batch([
          {
            sql:
            `INSERT INTO files
               (id, organization_id, space_id, uploader_user_id, direction,
                display_name, storage_key, declared_content_type, plaintext_size,
                chunk_size, chunk_count, nonce_prefix, wrapped_dek, key_provider,
                key_version, expires_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
                     $13, $14, $15, $16)`,
            params: [
              fileId,
              auth.organizationId,
              params.data.id,
              auth.userId,
              auth.role === "ADMIN" ? "ADMIN_TO_CLIENT" : "CLIENT_TO_ADMIN",
              displayName,
              storageKey,
              body.data.contentType.toLowerCase(),
              body.data.size,
              chunkSize,
              chunkCount,
              noncePrefix,
              generatedKey.wrappedKey,
              generatedKey.provider,
              generatedKey.version,
              body.data.expiresInDays == null ? null : now + body.data.expiresInDays * 86_400_000,
            ],
          },
          {
            sql: `INSERT INTO upload_sessions
                    (id, file_id, created_by, storage_upload_id, expires_at)
                  VALUES ($1, $2, $3, $4, $5)`,
            params: [uploadId, fileId, auth.userId, storageUploadId, now + 86_400_000],
          },
          auditEventQuery(request, {
            organizationId: auth.organizationId,
            actorUserId: auth.userId,
            action: "FILE_UPLOAD_STARTED",
            targetType: "FILE",
            targetId: fileId,
            outcome: "SUCCESS",
            metadata: { size: body.data.size, direction: auth.role === "ADMIN" ? "ADMIN_TO_CLIENT" : "CLIENT_TO_ADMIN" },
          }),
        ]);
        const plaintextKey = generatedKey.plaintextKey.toString("base64");
        generatedKey.plaintextKey.fill(0);
        return reply.code(201).send({
          id: uploadId,
          fileId,
          chunkSize,
          chunkCount,
          noncePrefix: noncePrefix.toString("base64"),
          plaintextKey,
          completedParts: [],
        });
      } catch (error) {
        generatedKey.plaintextKey.fill(0);
        if (storageUploadId) await storage.abortUpload(storageKey, storageUploadId).catch(() => undefined);
        throw error;
      }
    },
  );

  app.patch(
    "/api/v1/files/:id",
    { preHandler: [requireAuth, requireCsrf] },
    async (request) => {
      const params = idParams.safeParse(request.params);
      const body = fileUpdateSchema.safeParse(request.body);
      if (!params.success || !body.success) invalidRequest();
      const auth = request.auth!;
      const file = await findAuthorizedFile(auth, params.data.id);
      if (!file) throw new AppError(404, "File not found", "NOT_FOUND");
      if (auth.role !== "ADMIN" && file.uploader_user_id !== auth.userId) {
        throw new AppError(403, "Permission denied", "PERMISSION_DENIED");
      }
      let displayName: string | null = null;
      if (body.data.displayName !== undefined) {
        try {
          displayName = sanitizeDisplayName(body.data.displayName);
        } catch {
          throw new AppError(400, "Filename is invalid", "INVALID_FILENAME");
        }
        if (!declaredFileAllowed(displayName, file.declared_content_type)) {
          throw new AppError(415, "The renamed extension must match the original file type", "FILE_TYPE_BLOCKED");
        }
      }
      const now = Date.now();
      await getPool().batch([
        {
          sql:
          `UPDATE files SET
             display_name = COALESCE($2, display_name),
             expires_at = CASE WHEN $3 THEN $4 ELSE expires_at END,
             updated_at = $5
           WHERE id = $1`,
          params: [
            file.id,
            displayName,
            body.data.expiresInDays !== undefined,
            body.data.expiresInDays == null ? null : now + body.data.expiresInDays * 86_400_000,
            now,
          ],
        },
        auditEventQuery(request, {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: "FILE_METADATA_CHANGED",
          targetType: "FILE",
          targetId: file.id,
          outcome: "SUCCESS",
        }),
      ]);
      return { message: "File details updated" };
    },
  );

  app.delete(
    "/api/v1/files/:id",
    { preHandler: [requireAuth, requireCsrf] },
    async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) invalidRequest();
      const auth = request.auth!;
      const file = await findAuthorizedFile(auth, params.data.id);
      if (!file) throw new AppError(404, "File not found", "NOT_FOUND");
      if (auth.role !== "ADMIN" && file.uploader_user_id !== auth.userId) {
        throw new AppError(403, "Permission denied", "PERMISSION_DENIED");
      }
      if (file.status === "UPLOADING") throw new AppError(409, "Abort the active upload instead", "UPLOAD_ACTIVE");
      await getStorage().deleteObject(file.storage_key);
      const now = Date.now();
      await getPool().batch([
        {
          sql: "UPDATE files SET status = 'DELETED', deleted_at = $2, updated_at = $2 WHERE id = $1",
          params: [file.id, now],
        },
        auditEventQuery(request, {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: "FILE_DELETED",
          targetType: "FILE",
          targetId: file.id,
          outcome: "SUCCESS",
        }),
      ]);
      return reply.code(204).send();
    },
  );

  app.get(
    "/api/v1/uploads/:id",
    { preHandler: requireAuth },
    async (request) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) invalidRequest();
      const upload = await findOwnedUpload(request, params.data.id);
      if (!upload) throw new AppError(404, "Upload not found", "NOT_FOUND");
      const key = await getFileKeyProvider().unwrap(upload.wrapped_dek, upload.key_version);
      const parts = await getPool().query<{ part_number: number }>(
        "SELECT part_number FROM upload_parts WHERE upload_session_id = $1 ORDER BY part_number",
        [upload.upload_session_id],
      );
      const plaintextKey = key.toString("base64");
      key.fill(0);
      return {
        id: upload.upload_session_id,
        fileId: upload.file_id,
        chunkSize: upload.chunk_size,
        chunkCount: upload.chunk_count,
        noncePrefix: upload.nonce_prefix.toString("base64"),
        plaintextKey,
        completedParts: parts.rows.map((part) => part.part_number),
      };
    },
  );

  app.post(
    "/api/v1/uploads/:id/parts/:partNumber/url",
    { preHandler: [requireAuth, requireCsrf] },
    async (request) => {
      const params = partParams.safeParse(request.params);
      if (!params.success) invalidRequest();
      const upload = await findOwnedUpload(request, params.data.id);
      if (!upload) throw new AppError(404, "Upload not found", "NOT_FOUND");
      const lengths = expectedPartLengths(upload, params.data.partNumber);
      const storage = getStorage();
      const signedUrl = await storage.createPartUrl(
        upload.storage_key,
        upload.storage_upload_id,
        params.data.partNumber,
        lengths.ciphertext,
      );
      return signedUrl
        ? { mode: "s3", url: signedUrl, ciphertextSize: lengths.ciphertext }
        : {
            mode: "proxy",
            url: `/api/v1/uploads/${upload.upload_session_id}/parts/${params.data.partNumber}/content`,
            ciphertextSize: lengths.ciphertext,
          };
    },
  );

  app.put(
    "/api/v1/uploads/:id/parts/:partNumber/content",
    {
      preHandler: [requireAuth, requireCsrf],
      bodyLimit: getConfig().UPLOAD_CHUNK_SIZE_BYTES + 16,
    },
    async (request, reply) => {
      const params = partParams.safeParse(request.params);
      if (!params.success || !Buffer.isBuffer(request.body)) invalidRequest();
      const upload = await findOwnedUpload(request, params.data.id);
      if (!upload) throw new AppError(404, "Upload not found", "NOT_FOUND");
      const lengths = expectedPartLengths(upload, params.data.partNumber);
      const content = request.body;
      if (content.length !== lengths.ciphertext) invalidRequest();
      const storage = getStorage();
      if (storage.mode === "s3") throw new AppError(404, "Not found", "NOT_FOUND");
      const etag = await storage.writeProxyPart(
        upload.storage_key,
        upload.storage_upload_id,
        params.data.partNumber,
        content,
      );
      await getPool().query(
        `INSERT INTO upload_parts (upload_session_id, part_number, ciphertext_size, etag)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (upload_session_id, part_number) DO UPDATE SET
           ciphertext_size = EXCLUDED.ciphertext_size,
           etag = EXCLUDED.etag,
           confirmed_at = now()`,
        [upload.upload_session_id, params.data.partNumber, content.length, etag],
      );
      reply.header("ETag", etag);
      return reply.code(204).send();
    },
  );

  app.post(
    "/api/v1/uploads/:id/parts/:partNumber/confirm",
    { preHandler: [requireAuth, requireCsrf] },
    async (request, reply) => {
      const params = partParams.safeParse(request.params);
      const body = confirmPartSchema.safeParse(request.body);
      if (!params.success || !body.success) invalidRequest();
      const upload = await findOwnedUpload(request, params.data.id);
      if (!upload) throw new AppError(404, "Upload not found", "NOT_FOUND");
      if (getStorage().mode !== "s3") throw new AppError(409, "Part is already confirmed", "PART_ALREADY_CONFIRMED");
      const lengths = expectedPartLengths(upload, params.data.partNumber);
      if (body.data.ciphertextSize !== lengths.ciphertext) invalidRequest();
      await getPool().query(
        `INSERT INTO upload_parts (upload_session_id, part_number, ciphertext_size, etag)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (upload_session_id, part_number) DO UPDATE SET
           ciphertext_size = EXCLUDED.ciphertext_size,
           etag = EXCLUDED.etag,
           confirmed_at = now()`,
        [upload.upload_session_id, params.data.partNumber, body.data.ciphertextSize, body.data.etag],
      );
      return reply.code(204).send();
    },
  );

  app.post(
    "/api/v1/uploads/:id/complete",
    { preHandler: [requireAuth, requireCsrf] },
    async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) invalidRequest();
      const upload = await findOwnedUpload(request, params.data.id);
      if (!upload) throw new AppError(404, "Upload not found", "NOT_FOUND");
      const partsResult = await getPool().query<{ part_number: number; ciphertext_size: number; etag: string }>(
        `SELECT part_number, ciphertext_size, etag FROM upload_parts
         WHERE upload_session_id = $1 ORDER BY part_number`,
        [upload.upload_session_id],
      );
      if (partsResult.rows.length !== upload.chunk_count) {
        throw new AppError(409, "Upload is incomplete", "UPLOAD_INCOMPLETE");
      }
      for (let index = 0; index < partsResult.rows.length; index += 1) {
        const part = partsResult.rows[index]!;
        const expected = expectedPartLengths(upload, index + 1);
        if (part.part_number !== index + 1 || part.ciphertext_size !== expected.ciphertext) {
          throw new AppError(409, "Upload parts do not match the expected file", "UPLOAD_INCOMPLETE");
        }
      }
      const claimed = await getPool().query(
        `UPDATE upload_sessions SET state = 'COMPLETING'
         WHERE id = $1 AND state = 'OPEN' RETURNING id`,
        [upload.upload_session_id],
      );
      if (claimed.rowCount !== 1) throw new AppError(409, "Upload is already completing", "UPLOAD_STATE");
      try {
        await getStorage().completeUpload(
          upload.storage_key,
          upload.storage_upload_id,
          partsResult.rows.map((part) => ({ partNumber: part.part_number, etag: part.etag })),
        );
        const ciphertextSize = partsResult.rows.reduce((sum, part) => sum + part.ciphertext_size, 0);
        const now = Date.now();
        await getPool().batch([
          {
            sql: `UPDATE upload_sessions SET state = 'COMPLETED', completed_at = $2 WHERE id = $1`,
            params: [upload.upload_session_id, now],
          },
          {
            sql: `UPDATE files SET status = 'QUARANTINED', ciphertext_size = $2, updated_at = $3
                  WHERE id = $1`,
            params: [upload.file_id, ciphertextSize, now],
          },
          auditEventQuery(request, {
              organizationId: request.auth!.organizationId,
              actorUserId: request.auth!.userId,
              action: "FILE_UPLOAD_COMPLETED",
              targetType: "FILE",
              targetId: upload.file_id,
              outcome: "SUCCESS",
              metadata: { scanState: "QUARANTINED" },
          }),
        ]);
      } catch (error) {
        await getPool().query("UPDATE upload_sessions SET state = 'OPEN' WHERE id = $1", [upload.upload_session_id]);
        throw error;
      }
      return reply.code(202).send({ fileId: upload.file_id, status: "QUARANTINED" });
    },
  );

  app.delete(
    "/api/v1/uploads/:id",
    { preHandler: [requireAuth, requireCsrf] },
    async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) invalidRequest();
      const upload = await findOwnedUpload(request, params.data.id);
      if (!upload) throw new AppError(404, "Upload not found", "NOT_FOUND");
      await getStorage().abortUpload(upload.storage_key, upload.storage_upload_id);
      const now = Date.now();
      await getPool().batch([
        { sql: "UPDATE upload_sessions SET state = 'ABORTED' WHERE id = $1", params: [upload.upload_session_id] },
        { sql: "UPDATE files SET status = 'DELETED', deleted_at = $2, updated_at = $2 WHERE id = $1", params: [upload.file_id, now] },
        auditEventQuery(request, {
            organizationId: request.auth!.organizationId,
            actorUserId: request.auth!.userId,
            action: "FILE_UPLOAD_ABORTED",
            targetType: "FILE",
            targetId: upload.file_id,
            outcome: "SUCCESS",
        }),
      ]);
      return reply.code(204).send();
    },
  );

  app.post(
    "/api/v1/files/:id/download-ticket",
    { preHandler: [requireAuth, requireCsrf] },
    async (request) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) invalidRequest();
      const file = await findAuthorizedFile(request.auth!, params.data.id);
      if (!file || file.status !== "AVAILABLE" || (file.expires_at && file.expires_at.getTime() <= Date.now())) {
        throw new AppError(404, "File not found", "NOT_FOUND");
      }
      const id = randomUUID();
      const expires = Date.now() + 60_000;
      const payload = `${id}.${expires}.${randomBytes(18).toString("base64url")}`;
      const ticket = `${payload}.${signDownloadTicket(payload)}`;
      await getPool().query(
        `INSERT INTO download_tickets (id, file_id, user_id, token_digest, expires_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, file.id, request.auth!.userId, tokenDigest(ticket), expires],
      );
      return { url: `/api/v1/downloads/${encodeURIComponent(ticket)}`, expiresInSeconds: 60 };
    },
  );

  app.get(
    "/api/v1/downloads/:ticket",
    { preHandler: requireAuth },
    async (request, reply) => {
      const params = ticketParams.safeParse(request.params);
      if (!params.success) throw new AppError(404, "Download not found", "NOT_FOUND");
      const parsed = parseTicket(params.data.ticket);
      if (!parsed) throw new AppError(404, "Download not found", "NOT_FOUND");
      const auth = request.auth!;
      const result = await getPool().query<{ file_id: string }>(
          `UPDATE download_tickets SET consumed_at = $4
           WHERE id = $1 AND user_id = $2 AND token_digest = $3
             AND consumed_at IS NULL AND expires_at > $4
           RETURNING file_id`,
          [parsed.id, auth.userId, tokenDigest(params.data.ticket), Date.now()],
        );
      const ticketResult = result.rows[0] ?? null;
      if (!ticketResult) throw new AppError(404, "Download not found", "NOT_FOUND");
      const file = await findAuthorizedFile(auth, ticketResult.file_id);
      if (!file || file.status !== "AVAILABLE" || (file.expires_at && file.expires_at.getTime() <= Date.now())) {
        throw new AppError(404, "Download not found", "NOT_FOUND");
      }

      const storage = getStorage();
      const keyProvider = getFileKeyProvider();
      const stream = Readable.from((async function* () {
        const key = await keyProvider.unwrap(file.wrapped_dek, file.key_version);
        let absoluteOffset = 0;
        try {
          for (let partNumber = 1; partNumber <= file.chunk_count; partNumber += 1) {
            const lengths = expectedPartLengths(file, partNumber);
            const encrypted = await storage.readPart(
              file.storage_key,
              partNumber,
              storage.mode === "local" ? 0 : absoluteOffset,
              lengths.ciphertext,
            );
            yield decryptChunk(
              encrypted,
              key,
              file.nonce_prefix,
              file.id,
              partNumber,
              lengths.plaintext,
            );
            absoluteOffset += lengths.ciphertext;
          }
        } finally {
          key.fill(0);
        }
      })());

      const asciiName = file.display_name.replace(/[^a-zA-Z0-9._ -]/gu, "_").replaceAll('"', "_");
      reply.header("Content-Type", "application/octet-stream");
      reply.header("Content-Length", file.plaintext_size);
      const encodedName = encodeURIComponent(file.display_name).replace(/[!'()*]/gu, (character) =>
        `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
      );
      reply.header("Content-Disposition", `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`);
      reply.header("Cache-Control", "no-store, private");
      reply.header("X-Content-Type-Options", "nosniff");
      await writeAuditEvent(request, {
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        action: "FILE_DOWNLOAD",
        targetType: "FILE",
        targetId: file.id,
        outcome: "SUCCESS",
      });
      return reply.send(stream);
    },
  );
}
