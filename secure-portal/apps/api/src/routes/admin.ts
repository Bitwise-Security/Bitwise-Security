import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getConfig } from "../config.js";
import { getPool, withTransaction } from "../db.js";
import { AppError } from "../errors.js";
import { encryptSecret, randomToken, tokenDigest } from "../security/crypto.js";
import { requireAdmin, requireCsrf } from "../security/sessions.js";
import { generateTotpSecret } from "../security/totp.js";
import { writeAuditEvent } from "../services/audit.js";
import { sendMail } from "../services/mail.js";

const inviteSchema = z.object({
  email: z.string().trim().email().max(320).transform((value) => value.toLowerCase()),
  displayName: z.string().trim().min(1).max(160),
  spaceName: z.string().trim().min(1).max(160),
});

const statusSchema = z.object({ status: z.enum(["ACTIVE", "DISABLED"]) });
const userIdSchema = z.object({ userId: z.string().uuid() });
const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().datetime({ offset: true }).optional(),
});

export function registerAdminRoutes(app: FastifyInstance): void {
  app.get(
    "/api/v1/admin/audit-events",
    { preHandler: requireAdmin },
    async (request) => {
      const query = auditQuerySchema.safeParse(request.query);
      if (!query.success) throw new AppError(400, "Invalid request", "INVALID_REQUEST");
      const auth = request.auth!;
      const result = await getPool().query(
        `SELECT ae.id, ae.action, ae.target_type, ae.target_id, ae.outcome,
                ae.ip_address::text, ae.user_agent, ae.metadata, ae.created_at,
                actor.email::text AS actor_email, actor.display_name AS actor_name
         FROM audit_events ae
         LEFT JOIN users actor ON actor.id = ae.actor_user_id
         WHERE ae.organization_id = $1
           AND ($2::timestamptz IS NULL OR ae.created_at < $2)
         ORDER BY ae.created_at DESC, ae.id DESC
         LIMIT $3`,
        [auth.organizationId, query.data.before ?? null, query.data.limit],
      );
      return { events: result.rows };
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
        invited = await withTransaction(async (client) => {
          const userResult = await client.query<{ id: string }>(
            `INSERT INTO users (email, display_name, status)
             VALUES ($1, $2, 'INVITED') RETURNING id`,
            [parsed.data.email, parsed.data.displayName],
          );
          const userId = userResult.rows[0]!.id;
          const spaceResult = await client.query<{ id: string }>(
            `INSERT INTO client_spaces (organization_id, name)
             VALUES ($1, $2) RETURNING id`,
            [auth.organizationId, parsed.data.spaceName],
          );
          const spaceId = spaceResult.rows[0]!.id;
          await client.query(
            `INSERT INTO organization_memberships (organization_id, user_id, role)
             VALUES ($1, $2, 'CLIENT')`,
            [auth.organizationId, userId],
          );
          await client.query(
            "INSERT INTO space_memberships (space_id, user_id) VALUES ($1, $2)",
            [spaceId, userId],
          );
          const invitationResult = await client.query<{ id: string }>(
            `INSERT INTO client_invitations
               (organization_id, space_id, user_id, invited_by, token_digest, expires_at)
             VALUES ($1, $2, $3, $4, $5,
               now() + ($6 * interval '1 hour')) RETURNING id`,
            [
              auth.organizationId,
              spaceId,
              userId,
              auth.userId,
              tokenDigest(invitationToken),
              getConfig().INVITATION_EXPIRY_HOURS,
            ],
          );
          await writeAuditEvent(
            request,
            {
              organizationId: auth.organizationId,
              actorUserId: auth.userId,
              action: "CLIENT_INVITED",
              targetType: "USER",
              targetId: userId,
              outcome: "SUCCESS",
            },
            client,
          );
          return { userId, invitationId: invitationResult.rows[0]!.id };
        });
      } catch (error) {
        if ((error as { code?: string }).code === "23505") {
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
      const result = await withTransaction(async (client) => {
        const updated = await client.query<{ id: string }>(
          `UPDATE users u SET status = $3, updated_at = now()
           FROM organization_memberships om
           WHERE u.id = $2 AND om.user_id = u.id AND om.organization_id = $1
             AND om.role = 'CLIENT'
           RETURNING u.id`,
          [auth.organizationId, params.data.userId, body.data.status],
        );
        if (updated.rowCount !== 1) return false;
        if (body.data.status === "DISABLED") {
          await client.query(
            "UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
            [params.data.userId],
          );
        }
        await writeAuditEvent(
          request,
          {
            organizationId: auth.organizationId,
            actorUserId: auth.userId,
            action: "CLIENT_STATUS_CHANGED",
            targetType: "USER",
            targetId: params.data.userId,
            outcome: "SUCCESS",
            metadata: { status: body.data.status },
          },
          client,
        );
        return true;
      });
      if (!result) throw new AppError(404, "Client not found", "NOT_FOUND");
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
      const result = await withTransaction(async (client) => {
        const target = await client.query<{ id: string; email: string }>(
          `SELECT u.id, u.email::text
           FROM users u JOIN organization_memberships om ON om.user_id = u.id
           WHERE u.id = $2 AND om.organization_id = $1 AND om.role = 'CLIENT'
             AND u.status IN ('ACTIVE', 'PENDING_MFA')
           FOR UPDATE OF u`,
          [auth.organizationId, params.data.userId],
        );
        const user = target.rows[0];
        if (!user) return null;
        await client.query("DELETE FROM mfa_credentials WHERE user_id = $1", [user.id]);
        await client.query("DELETE FROM mfa_recovery_codes WHERE user_id = $1", [user.id]);
        await client.query("UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [user.id]);
        await client.query("UPDATE users SET status = 'PENDING_MFA', updated_at = now() WHERE id = $1", [user.id]);
        await client.query(
          `INSERT INTO mfa_enrollment_sessions
             (user_id, token_digest, encrypted_secret, expires_at)
           VALUES ($1, $2, $3, now() + interval '30 minutes')`,
          [user.id, tokenDigest(enrollmentToken), encryptSecret(secret)],
        );
        await writeAuditEvent(
          request,
          {
            organizationId: auth.organizationId,
            actorUserId: auth.userId,
            action: "CLIENT_MFA_RESET",
            targetType: "USER",
            targetId: user.id,
            outcome: "SUCCESS",
            metadata: { sessionsRevoked: true },
          },
          client,
        );
        return user;
      });
      if (!result) throw new AppError(404, "Client not found", "NOT_FOUND");
      const url = `${getConfig().PUBLIC_ORIGIN}/enrol-mfa#token=${encodeURIComponent(enrollmentToken)}`;
      try {
        await sendMail({
          to: result.email,
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
