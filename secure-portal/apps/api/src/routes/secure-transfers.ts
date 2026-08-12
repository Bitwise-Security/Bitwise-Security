import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getPool } from "../db.js";
import { AppError } from "../errors.js";
import type { AuthorizedFile } from "../files/authorization.js";
import { canAccessSpace } from "../files/authorization.js";
import { createDecryptedFileStream, setAttachmentHeaders } from "../files/download.js";
import { hashPassword, randomToken, tokenDigest, verifyPassword } from "../security/crypto.js";
import { requireAdmin, requireCsrf } from "../security/sessions.js";
import { auditEventQuery, writeAuditEvent } from "../services/audit.js";

const unlockSchema = z.object({
  token: z.string().min(40).max(100),
  password: z.string().trim().min(20).max(100),
});
const ticketParams = z.object({ ticket: z.string().min(40).max(100) });
const idParams = z.object({ id: z.string().uuid() });

interface TransferFile extends AuthorizedFile {
  transfer_id: string;
  transfer_status: "PENDING_SCAN" | "ACTIVE" | "REVOKED" | "EXPIRED";
  transfer_expires_at: Date;
  password_hash: string;
  failed_attempts: number;
  locked_until: Date | null;
  download_count: number;
}

function unavailable(): never {
  throw new AppError(404, "This secure transfer is invalid, locked, or expired", "TRANSFER_UNAVAILABLE");
}

export function registerSecureTransferRoutes(app: FastifyInstance): void {
  app.get(
    "/api/v1/spaces/:id/secure-transfers",
    { preHandler: requireAdmin },
    async (request) => {
      const params = idParams.safeParse(request.params);
      if (!params.success || !(await canAccessSpace(request.auth!, params.data.id))) {
        throw new AppError(404, "Space not found", "NOT_FOUND");
      }
      const result = await getPool().query(
        `SELECT st.id, st.status, st.expires_at, st.download_count, st.created_at,
                f.id AS file_id, f.display_name, f.status AS file_status
         FROM secure_transfers st
         JOIN files f ON f.id = st.file_id
         WHERE f.organization_id = $1 AND f.space_id = $2
         ORDER BY st.created_at DESC`,
        [request.auth!.organizationId, params.data.id],
      );
      return { transfers: result.rows };
    },
  );

  app.delete(
    "/api/v1/secure-transfers/:id",
    { preHandler: [requireAdmin, requireCsrf] },
    async (request, reply) => {
      const params = idParams.safeParse(request.params);
      if (!params.success) throw new AppError(400, "Invalid request", "INVALID_REQUEST");
      const auth = request.auth!;
      const now = Date.now();
      const result = await getPool().query<{ id: string }>(
        `UPDATE secure_transfers SET status = 'REVOKED', revoked_at = $3
         WHERE id = $2 AND status IN ('PENDING_SCAN', 'ACTIVE')
           AND EXISTS (
             SELECT 1 FROM files f
             WHERE f.id = secure_transfers.file_id AND f.organization_id = $1
           )
         RETURNING id`,
        [auth.organizationId, params.data.id, now],
      );
      if (!result.rowCount) throw new AppError(404, "Secure transfer not found", "NOT_FOUND");
      await writeAuditEvent(request, {
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        action: "SECURE_TRANSFER_REVOKED",
        targetType: "SECURE_TRANSFER",
        targetId: params.data.id,
        outcome: "SUCCESS",
      });
      return reply.code(204).send();
    },
  );

  app.post(
    "/api/v1/public/secure-transfers/unlock",
    { config: { rateLimit: { max: 10, timeWindow: "5 minutes" } } },
    async (request) => {
      const body = unlockSchema.safeParse(request.body);
      if (!body.success) unavailable();
      const now = Date.now();
      const result = await getPool().query<TransferFile>(
        `SELECT f.*, st.id AS transfer_id, st.status AS transfer_status,
                st.expires_at AS transfer_expires_at, st.password_hash,
                st.failed_attempts, st.locked_until, st.download_count
         FROM secure_transfers st
         JOIN files f ON f.id = st.file_id
         WHERE st.token_digest = $1`,
        [tokenDigest(body.data.token)],
      );
      const transfer = result.rows[0];
      const validPassword = transfer
        ? await verifyPassword(transfer.password_hash, body.data.password.toUpperCase())
        : (await hashPassword(body.data.password), false);
      if (!transfer) unavailable();
      if (
        transfer.transfer_status !== "ACTIVE" ||
        transfer.status !== "AVAILABLE" ||
        transfer.transfer_expires_at.getTime() <= now ||
        (transfer.expires_at && transfer.expires_at.getTime() <= now) ||
        (transfer.locked_until && transfer.locked_until.getTime() > now)
      ) unavailable();
      if (!validPassword) {
        const attempts = transfer.failed_attempts + 1;
        const lockedUntil = attempts >= 5 ? now + 15 * 60_000 : null;
        await getPool().batch([
          {
            sql: `UPDATE secure_transfers
                  SET failed_attempts = $2, locked_until = $3
                  WHERE id = $1 AND status = 'ACTIVE'`,
            params: [transfer.transfer_id, attempts, lockedUntil],
          },
          auditEventQuery(request, {
            organizationId: transfer.organization_id,
            action: "SECURE_TRANSFER_UNLOCK",
            targetType: "SECURE_TRANSFER",
            targetId: transfer.transfer_id,
            outcome: "FAILURE",
            metadata: { reason: "INVALID_PASSWORD", locked: lockedUntil != null },
          }),
        ]);
        unavailable();
      }

      const ticket = randomToken();
      const ticketId = randomUUID();
      await getPool().batch([
        {
          sql: `UPDATE secure_transfers SET failed_attempts = 0, locked_until = NULL
                WHERE id = $1 AND status = 'ACTIVE'`,
          params: [transfer.transfer_id],
        },
        {
          sql: `INSERT INTO secure_transfer_download_tickets
                  (id, transfer_id, token_digest, expires_at)
                VALUES ($1, $2, $3, $4)`,
          params: [ticketId, transfer.transfer_id, tokenDigest(ticket), now + 60_000],
        },
        auditEventQuery(request, {
          organizationId: transfer.organization_id,
          action: "SECURE_TRANSFER_UNLOCK",
          targetType: "SECURE_TRANSFER",
          targetId: transfer.transfer_id,
          outcome: "SUCCESS",
        }),
      ]);
      return {
        displayName: transfer.display_name,
        expiresAt: transfer.transfer_expires_at.toISOString(),
        downloadUrl: `/api/v1/public/secure-downloads/${encodeURIComponent(ticket)}`,
        downloadUrlExpiresInSeconds: 60,
      };
    },
  );

  app.get(
    "/api/v1/public/secure-downloads/:ticket",
    { config: { rateLimit: { max: 20, timeWindow: "5 minutes" } } },
    async (request, reply) => {
      const params = ticketParams.safeParse(request.params);
      if (!params.success) unavailable();
      const now = Date.now();
      const claimed = await getPool().query<{ transfer_id: string }>(
        `UPDATE secure_transfer_download_tickets SET consumed_at = $2
         WHERE token_digest = $1 AND consumed_at IS NULL AND expires_at > $2
         RETURNING transfer_id`,
        [tokenDigest(params.data.ticket), now],
      );
      const transferId = claimed.rows[0]?.transfer_id;
      if (!transferId) unavailable();
      const result = await getPool().query<TransferFile>(
        `SELECT f.*, st.id AS transfer_id, st.status AS transfer_status,
                st.expires_at AS transfer_expires_at, st.password_hash,
                st.failed_attempts, st.locked_until, st.download_count
         FROM secure_transfers st JOIN files f ON f.id = st.file_id
         WHERE st.id = $1`,
        [transferId],
      );
      const transfer = result.rows[0];
      if (
        !transfer ||
        transfer.transfer_status !== "ACTIVE" ||
        transfer.status !== "AVAILABLE" ||
        transfer.transfer_expires_at.getTime() <= now ||
        (transfer.expires_at && transfer.expires_at.getTime() <= now)
      ) {
        unavailable();
      }
      await getPool().batch([
        {
          sql: `UPDATE secure_transfers
                SET download_count = download_count + 1, last_download_at = $2
                WHERE id = $1 AND status = 'ACTIVE'`,
          params: [transfer.transfer_id, now],
        },
        auditEventQuery(request, {
          organizationId: transfer.organization_id,
          action: "SECURE_TRANSFER_DOWNLOAD",
          targetType: "SECURE_TRANSFER",
          targetId: transfer.transfer_id,
          outcome: "SUCCESS",
        }),
      ]);
      setAttachmentHeaders(reply, transfer);
      return reply.send(createDecryptedFileStream(transfer));
    },
  );
}
