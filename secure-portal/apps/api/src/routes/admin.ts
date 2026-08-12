import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { getConfig } from "../config.js";
import { getPool } from "../db.js";
import type { DatabaseQuery } from "../db.js";
import { AppError } from "../errors.js";
import { getStorage } from "../files/storage.js";
import { encryptSecret, randomToken, tokenDigest } from "../security/crypto.js";
import { requireAdmin, requireCsrf } from "../security/sessions.js";
import { generateTotpSecret } from "../security/totp.js";
import { auditEventQuery, writeAuditEvent } from "../services/audit.js";
import { sendMail } from "../services/mail.js";

const inviteSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  displayName: z.string().trim().min(1).max(160),
  spaceName: z.string().trim().min(1).max(160),
});
const spaceSchema = z.object({
  name: z.string().trim().min(1).max(160),
});

const statusSchema = z.object({ status: z.enum(["ACTIVE", "DISABLED"]) });
const userIdSchema = z.object({ userId: z.string().uuid() });
const auditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(100_000).default(1),
});
const spaceIdSchema = z.object({ id: z.string().uuid() });
const deleteSpaceSchema = z.object({
  confirmation: z.string().min(1).max(160),
  deleteExclusiveClients: z.boolean().default(false),
});
const PAGE_SIZE = 10;

interface DeletionFile {
  storage_key: string;
  storage_upload_id: string | null;
  upload_state: string | null;
}

async function removeSpaceObjects(files: DeletionFile[]): Promise<void> {
  const storage = getStorage();
  for (let offset = 0; offset < files.length; offset += 10) {
    const batch = files.slice(offset, offset + 10);
    await Promise.all(batch.map(async (file) => {
      if (file.storage_upload_id && (file.upload_state === "OPEN" || file.upload_state === "COMPLETING")) {
        await storage.abortUpload(file.storage_key, file.storage_upload_id);
      }
      await storage.deleteObject(file.storage_key);
    }));
  }
}

export function registerAdminRoutes(app: FastifyInstance): void {
  app.post(
    "/api/v1/admin/spaces",
    { preHandler: [requireAdmin, requireCsrf] },
    async (request, reply) => {
      const parsed = spaceSchema.safeParse(request.body);
      if (!parsed.success) throw new AppError(400, "Invalid request", "INVALID_REQUEST");
      const auth = request.auth!;
      const duplicate = await getPool().query(
        `SELECT 1 FROM client_spaces
         WHERE organization_id = $1 AND name = $2 COLLATE NOCASE AND archived_at IS NULL`,
        [auth.organizationId, parsed.data.name],
      );
      if (duplicate.rowCount) throw new AppError(409, "A client space with this name already exists", "SPACE_EXISTS");
      const id = randomUUID();
      await getPool().batch([
        {
          sql: "INSERT INTO client_spaces (id, organization_id, name) VALUES ($1, $2, $3)",
          params: [id, auth.organizationId, parsed.data.name],
        },
        auditEventQuery(request, {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: "CLIENT_SPACE_CREATED",
          targetType: "CLIENT_SPACE",
          targetId: id,
          outcome: "SUCCESS",
          metadata: { accountRequired: false },
        }),
      ]);
      return reply.code(201).send({ id, name: parsed.data.name });
    },
  );

  app.get(
    "/api/v1/admin/spaces/:id/deletion-summary",
    { preHandler: requireAdmin },
    async (request) => {
      const params = spaceIdSchema.safeParse(request.params);
      if (!params.success) throw new AppError(400, "Invalid request", "INVALID_REQUEST");
      const auth = request.auth!;
      const result = await getPool().query<{
        id: string;
        name: string;
        file_count: number;
        secure_transfer_count: number;
        client_account_count: number;
        exclusive_client_count: number;
      }>(
        `SELECT cs.id, cs.name,
                (SELECT COUNT(*) FROM files f WHERE f.space_id = cs.id) AS file_count,
                (SELECT COUNT(*) FROM secure_transfers st
                 JOIN files f ON f.id = st.file_id WHERE f.space_id = cs.id) AS secure_transfer_count,
                (SELECT COUNT(*) FROM space_memberships sm WHERE sm.space_id = cs.id) AS client_account_count,
                (SELECT COUNT(*) FROM space_memberships sm
                 JOIN organization_memberships om ON om.user_id = sm.user_id
                   AND om.organization_id = cs.organization_id AND om.role = 'CLIENT'
                 WHERE sm.space_id = cs.id AND NOT EXISTS (
                   SELECT 1 FROM space_memberships other
                   JOIN client_spaces other_space ON other_space.id = other.space_id
                   WHERE other.user_id = sm.user_id AND other.space_id <> cs.id
                     AND other_space.organization_id = cs.organization_id
                 )) AS exclusive_client_count
         FROM client_spaces cs
         WHERE cs.id = $2 AND cs.organization_id = $1`,
        [auth.organizationId, params.data.id],
      );
      const summary = result.rows[0];
      if (!summary) throw new AppError(404, "Space not found", "NOT_FOUND");
      return {
        id: summary.id,
        name: summary.name,
        fileCount: Number(summary.file_count),
        secureTransferCount: Number(summary.secure_transfer_count),
        clientAccountCount: Number(summary.client_account_count),
        exclusiveClientCount: Number(summary.exclusive_client_count),
      };
    },
  );

  app.delete(
    "/api/v1/admin/spaces/:id",
    {
      preHandler: [requireAdmin, requireCsrf],
      config: { rateLimit: { max: 5, timeWindow: "1 hour" } },
    },
    async (request, reply) => {
      const params = spaceIdSchema.safeParse(request.params);
      const body = deleteSpaceSchema.safeParse(request.body);
      if (!params.success || !body.success) throw new AppError(400, "Invalid request", "INVALID_REQUEST");
      const auth = request.auth!;
      const spaceResult = await getPool().query<{ id: string; name: string }>(
        "SELECT id, name FROM client_spaces WHERE id = $2 AND organization_id = $1",
        [auth.organizationId, params.data.id],
      );
      const space = spaceResult.rows[0];
      if (!space) throw new AppError(404, "Space not found", "NOT_FOUND");
      if (body.data.confirmation !== space.name) {
        throw new AppError(400, "The confirmation does not match the space name", "CONFIRMATION_MISMATCH");
      }

      const files = await getPool().query<DeletionFile>(
        `SELECT f.storage_key, us.storage_upload_id, us.state AS upload_state
         FROM files f
         LEFT JOIN upload_sessions us ON us.file_id = f.id
         WHERE f.organization_id = $1 AND f.space_id = $2`,
        [auth.organizationId, space.id],
      );
      const transferCount = await getPool().query<{ total: number }>(
        `SELECT COUNT(*) AS total FROM secure_transfers st
         JOIN files f ON f.id = st.file_id
         WHERE f.organization_id = $1 AND f.space_id = $2`,
        [auth.organizationId, space.id],
      );
      const exclusiveClients = body.data.deleteExclusiveClients
        ? await getPool().query<{ id: string; email: string }>(
            `SELECT u.id, u.email
             FROM users u
             JOIN space_memberships sm ON sm.user_id = u.id AND sm.space_id = $2
             JOIN organization_memberships om ON om.user_id = u.id
               AND om.organization_id = $1 AND om.role = 'CLIENT'
             WHERE NOT EXISTS (
               SELECT 1 FROM space_memberships other
               JOIN client_spaces other_space ON other_space.id = other.space_id
               WHERE other.user_id = u.id AND other.space_id <> $2
                 AND other_space.organization_id = $1
             ) AND NOT EXISTS (
               SELECT 1 FROM organization_memberships other_org
               WHERE other_org.user_id = u.id AND other_org.organization_id <> $1
             )`,
            [auth.organizationId, space.id],
          )
        : { rows: [], rowCount: 0 };

      const now = Date.now();
      await getPool().batch([
        {
          sql: "UPDATE client_spaces SET archived_at = $3 WHERE id = $2 AND organization_id = $1",
          params: [auth.organizationId, space.id, now],
        },
        {
          sql: `UPDATE files SET status = 'DELETED', deleted_at = $3, updated_at = $3
                WHERE organization_id = $1 AND space_id = $2`,
          params: [auth.organizationId, space.id, now],
        },
        {
          sql: `UPDATE secure_transfers SET status = 'REVOKED', revoked_at = $3
                WHERE file_id IN (
                  SELECT id FROM files WHERE organization_id = $1 AND space_id = $2
                ) AND status IN ('PENDING_SCAN', 'ACTIVE')`,
          params: [auth.organizationId, space.id, now],
        },
      ]);

      try {
        await removeSpaceObjects(files.rows);
      } catch {
        await writeAuditEvent(request, {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: "CLIENT_SPACE_DELETION",
          targetType: "CLIENT_SPACE",
          targetId: space.id,
          outcome: "FAILURE",
          metadata: { reason: "STORAGE_CLEANUP_FAILED" },
        });
        throw new AppError(503, "Storage cleanup did not finish. Retry deletion before considering the space erased.", "STORAGE_CLEANUP_FAILED");
      }

      const deletionQueries: DatabaseQuery[] = [];
      if (exclusiveClients.rows.length > 0) {
        deletionQueries.push({
          sql: "DELETE FROM notification_outbox WHERE recipient_email IN (SELECT value FROM json_each($1))",
          params: [JSON.stringify(exclusiveClients.rows.map((client) => client.email))],
        });
      }
      deletionQueries.push({
        sql: "DELETE FROM client_spaces WHERE id = $2 AND organization_id = $1",
        params: [auth.organizationId, space.id],
      });
      if (exclusiveClients.rows.length > 0) {
        deletionQueries.push({
          sql: "DELETE FROM users WHERE id IN (SELECT value FROM json_each($1))",
          params: [JSON.stringify(exclusiveClients.rows.map((client) => client.id))],
        });
      }
      deletionQueries.push(auditEventQuery(request, {
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        action: "CLIENT_SPACE_DELETED",
        targetType: "CLIENT_SPACE",
        targetId: space.id,
        outcome: "SUCCESS",
        metadata: {
          filesDeleted: files.rows.length,
          secureTransfersDeleted: Number(transferCount.rows[0]?.total ?? 0),
          clientAccountsDeleted: exclusiveClients.rows.length,
        },
      }));
      await getPool().batch(deletionQueries);
      return reply.code(204).send();
    },
  );

  app.get(
    "/api/v1/admin/audit-events",
    { preHandler: requireAdmin },
    async (request) => {
      const query = auditQuerySchema.safeParse(request.query);
      if (!query.success) throw new AppError(400, "Invalid request", "INVALID_REQUEST");
      const auth = request.auth!;
      const count = await getPool().query<{ total: number }>(
        "SELECT COUNT(*) AS total FROM audit_events WHERE organization_id = $1",
        [auth.organizationId],
      );
      const total = Number(count.rows[0]?.total ?? 0);
      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const page = Math.min(query.data.page, totalPages);
      const result = await getPool().query(
        `SELECT ae.id, ae.action, ae.target_type, ae.target_id, ae.outcome,
                ae.ip_address::text, ae.user_agent, ae.metadata, ae.created_at,
                actor.email::text AS actor_email, actor.display_name AS actor_name
         FROM audit_events ae
         LEFT JOIN users actor ON actor.id = ae.actor_user_id
         WHERE ae.organization_id = $1
         ORDER BY ae.created_at DESC, ae.id DESC
         LIMIT $2 OFFSET $3`,
        [auth.organizationId, PAGE_SIZE, (page - 1) * PAGE_SIZE],
      );
      return {
        events: result.rows,
        pagination: { page, pageSize: PAGE_SIZE, total, totalPages },
      };
    },
  );

  app.get(
    "/api/v1/admin/clients",
    { preHandler: requireAdmin },
    async (request) => {
      const auth = request.auth!;
      const result = await getPool().query(
        `SELECT u.id, u.email::text, u.display_name, u.status, u.last_login_at,
                cs.id AS space_id, cs.name AS space_name
         FROM users u
         JOIN organization_memberships om ON om.user_id = u.id
           AND om.organization_id = $1 AND om.role = 'CLIENT'
         LEFT JOIN space_memberships sm ON sm.user_id = u.id
         LEFT JOIN client_spaces cs ON cs.id = sm.space_id AND cs.organization_id = $1
         ORDER BY u.display_name ASC`,
        [auth.organizationId],
      );
      return { clients: result.rows };
    },
  );

  app.post(
    "/api/v1/admin/clients/invitations",
    {
      preHandler: [requireAdmin, requireCsrf],
      config: { rateLimit: { max: 20, timeWindow: "1 hour" } },
    },
    async (request, reply) => {
      const parsed = inviteSchema.safeParse(request.body);
      if (!parsed.success) throw new AppError(400, "Invalid request", "INVALID_REQUEST");
      const auth = request.auth!;
      const invitationToken = randomToken();
      let invited: { userId: string; invitationId: string };
      try {
        const userId = randomUUID();
        const spaceId = randomUUID();
        const invitationId = randomUUID();
        await getPool().batch([
          { sql: `INSERT INTO users (id, email, display_name, status) VALUES ($1, $2, $3, 'INVITED')`, params: [userId, parsed.data.email, parsed.data.displayName] },
          { sql: `INSERT INTO client_spaces (id, organization_id, name) VALUES ($1, $2, $3)`, params: [spaceId, auth.organizationId, parsed.data.spaceName] },
          { sql: `INSERT INTO organization_memberships (organization_id, user_id, role) VALUES ($1, $2, 'CLIENT')`, params: [auth.organizationId, userId] },
          { sql: `INSERT INTO space_memberships (space_id, user_id) VALUES ($1, $2)`, params: [spaceId, userId] },
          {
            sql: `INSERT INTO client_invitations
                    (id, organization_id, space_id, user_id, invited_by, token_digest, expires_at)
                  VALUES ($1, $2, $3, $4, $5, $6, $7)`,
            params: [invitationId, auth.organizationId, spaceId, userId, auth.userId, tokenDigest(invitationToken), Date.now() + getConfig().INVITATION_EXPIRY_HOURS * 3_600_000],
          },
          auditEventQuery(request, {
            organizationId: auth.organizationId,
            actorUserId: auth.userId,
            action: "CLIENT_INVITED",
            targetType: "USER",
            targetId: userId,
            outcome: "SUCCESS",
          }),
        ]);
        invited = { userId, invitationId };
      } catch (error) {
        const duplicate = await getPool().query("SELECT 1 FROM users WHERE email = $1", [parsed.data.email]);
        if (duplicate.rowCount) {
          throw new AppError(409, "A client with this email already exists", "EMAIL_EXISTS");
        }
        throw error;
      }

      const invitationUrl = `${getConfig().PUBLIC_ORIGIN}/accept-invitation#token=${encodeURIComponent(invitationToken)}`;
      try {
        await sendMail({
          to: parsed.data.email,
          subject: "Your Bitwise Secure Portal invitation",
          text: `You have been invited to exchange files securely with Bitwise Security.\n\nSet up your account within ${getConfig().INVITATION_EXPIRY_HOURS} hours:\n${invitationUrl}\n\nYou will create a password and configure an authenticator app.`,
        });
      } catch {
        await writeAuditEvent(request, {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: "CLIENT_INVITATION_EMAIL",
          targetType: "INVITATION",
          targetId: invited.invitationId,
          outcome: "FAILURE",
          metadata: { reason: "DELIVERY_FAILED" },
        });
        throw new AppError(503, "The account was created, but the invitation email could not be delivered", "EMAIL_FAILED");
      }
      return reply.code(201).send({ id: invited.userId, email: parsed.data.email });
    },
  );

  app.patch(
    "/api/v1/admin/clients/:userId/status",
    { preHandler: [requireAdmin, requireCsrf] },
    async (request, reply) => {
      const params = userIdSchema.safeParse(request.params);
      const body = statusSchema.safeParse(request.body);
      if (!params.success || !body.success) throw new AppError(400, "Invalid request", "INVALID_REQUEST");
      const auth = request.auth!;
      const target = await getPool().query(
        `SELECT 1 FROM organization_memberships
         WHERE organization_id = $1 AND user_id = $2 AND role = 'CLIENT'`,
        [auth.organizationId, params.data.userId],
      );
      if (!target.rowCount) throw new AppError(404, "Client not found", "NOT_FOUND");
      await getPool().batch([
        { sql: `UPDATE users SET status = $2, updated_at = $3 WHERE id = $1`, params: [params.data.userId, body.data.status, Date.now()] },
        ...(body.data.status === "DISABLED" ? [{ sql: `UPDATE sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL`, params: [params.data.userId, Date.now()] }] : []),
        auditEventQuery(request, {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: "CLIENT_STATUS_CHANGED",
          targetType: "USER",
          targetId: params.data.userId,
          outcome: "SUCCESS",
          metadata: { status: body.data.status },
        }),
      ]);
      return reply.code(204).send();
    },
  );

  app.post(
    "/api/v1/admin/clients/:userId/mfa-reset",
    { preHandler: [requireAdmin, requireCsrf] },
    async (request, reply) => {
      const params = userIdSchema.safeParse(request.params);
      if (!params.success) throw new AppError(400, "Invalid request", "INVALID_REQUEST");
      const auth = request.auth!;
      const enrollmentToken = randomToken();
      const secret = generateTotpSecret();
      const target = await getPool().query<{ id: string; email: string }>(
          `SELECT u.id, u.email::text
           FROM users u JOIN organization_memberships om ON om.user_id = u.id
           WHERE u.id = $2 AND om.organization_id = $1 AND om.role = 'CLIENT'
             AND u.status IN ('ACTIVE', 'PENDING_MFA')
          `,
          [auth.organizationId, params.data.userId],
        );
      const user = target.rows[0];
      if (!user) throw new AppError(404, "Client not found", "NOT_FOUND");
      const now = Date.now();
      await getPool().batch([
        { sql: `DELETE FROM mfa_credentials WHERE user_id = $1`, params: [user.id] },
        { sql: `DELETE FROM mfa_recovery_codes WHERE user_id = $1`, params: [user.id] },
        { sql: `UPDATE sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL`, params: [user.id, now] },
        { sql: `UPDATE mfa_enrollment_sessions SET consumed_at = $2 WHERE user_id = $1 AND consumed_at IS NULL`, params: [user.id, now] },
        { sql: `UPDATE users SET status = 'PENDING_MFA', updated_at = $2 WHERE id = $1`, params: [user.id, now] },
        {
          sql: `INSERT INTO mfa_enrollment_sessions (id, user_id, token_digest, encrypted_secret, expires_at)
                VALUES ($1, $2, $3, $4, $5)`,
          params: [randomUUID(), user.id, tokenDigest(enrollmentToken), encryptSecret(secret), now + 1_800_000],
        },
        auditEventQuery(request, {
          organizationId: auth.organizationId,
          actorUserId: auth.userId,
          action: "CLIENT_MFA_RESET",
          targetType: "USER",
          targetId: user.id,
          outcome: "SUCCESS",
          metadata: { sessionsRevoked: true },
        }),
      ]);
      const url = `${getConfig().PUBLIC_ORIGIN}/enrol-mfa#token=${encodeURIComponent(enrollmentToken)}`;
      try {
        await sendMail({
          to: user.email,
          subject: "Set up MFA again for Bitwise Secure Portal",
          text: `An administrator reset MFA for your account after an identity-verification request.\n\nSet up MFA within 30 minutes:\n${url}\n\nIf you did not request this, contact Bitwise Security by phone.`,
        });
      } catch {
        throw new AppError(503, "MFA was reset, but the setup email could not be delivered", "EMAIL_FAILED");
      }
      return reply.code(202).send({ message: "MFA reset instructions sent" });
    },
  );
}
