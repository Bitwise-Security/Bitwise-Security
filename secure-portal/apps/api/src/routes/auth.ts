import { randomBytes, randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import QRCode from "qrcode";
import { z } from "zod";
import { getConfig } from "../config.js";
import { getPool } from "../db.js";
import { AppError } from "../errors.js";
import {
  decryptSecret,
  encryptSecret,
  hashPassword,
  randomToken,
  tokenDigest,
  verifyPassword,
} from "../security/crypto.js";
import { passwordSchema } from "../security/password-policy.js";
import {
  clearSessionCookie,
  requireAuth,
  requireCsrf,
  rotateCsrfToken,
  sessionInsertQuery,
  setSessionCookie,
} from "../security/sessions.js";
import {
  generateTotpSecret,
  makeOtpAuthUri,
  verifyTotp,
} from "../security/totp.js";
import { auditEventQuery, writeAuditEvent } from "../services/audit.js";
import { sendMail } from "../services/mail.js";

const emailSchema = z.string().trim().email().max(320).transform((email) => email.toLowerCase());
const loginSchema = z.object({ email: emailSchema, password: z.string().max(128) });
const mfaVerifySchema = z.object({
  challengeToken: z.string().min(32).max(200),
  code: z.string().trim().min(6).max(40),
});
const invitationAcceptSchema = z.object({
  token: z.string().min(32).max(200),
  displayName: z.string().trim().min(1).max(160),
  password: passwordSchema,
});
const enrollmentSchema = z.object({
  enrollmentToken: z.string().min(32).max(200),
  password: z.string().min(1).max(128),
});
const enrollmentConfirmSchema = enrollmentSchema.extend({ code: z.string().regex(/^\d{6}$/u) });
const resetRequestSchema = z.object({ email: emailSchema });
const resetConfirmSchema = z.object({
  token: z.string().min(32).max(200),
  password: passwordSchema,
});

function recoveryCodes(): string[] {
  return Array.from({ length: 10 }, () => {
    const raw = randomBytes(10).toString("hex").toUpperCase();
    return `${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15, 20)}`;
  });
}

function safeParse<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError(400, "Invalid request", "INVALID_REQUEST");
  }
  return result.data;
}

async function recordLoginFailure(
  request: FastifyRequest,
  user: { id: string; organization_id: string | null } | null,
): Promise<void> {
  if (!user) {
    await writeAuditEvent(request, {
      action: "AUTH_LOGIN",
      outcome: "FAILURE",
      metadata: { reason: "INVALID_CREDENTIALS" },
    });
    return;
  }
  const result = await getPool().query<{ locked: boolean }>(
    `UPDATE users
     SET failed_login_count = failed_login_count + 1,
         locked_until = CASE
           WHEN failed_login_count + 1 >= 10 THEN $2
           WHEN failed_login_count + 1 >= 5 THEN $3
           ELSE locked_until
         END,
         updated_at = $4
     WHERE id = $1
     RETURNING locked_until IS NOT NULL AND locked_until > $4 AS locked`,
    [user.id, Date.now() + 86_400_000, Date.now() + 900_000, Date.now()],
  );
  await writeAuditEvent(request, {
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: "AUTH_LOGIN",
    targetType: "USER",
    targetId: user.id,
    outcome: "FAILURE",
    metadata: { reason: "INVALID_CREDENTIALS", accountLocked: Boolean(result.rows[0]?.locked) },
  });
}

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post(
    "/api/v1/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = safeParse(loginSchema, request.body);
      const result = await getPool().query<{
        id: string;
        password_hash: string | null;
        status: "INVITED" | "PENDING_MFA" | "ACTIVE" | "DISABLED";
        failed_login_count: number;
        locked_until: Date | null;
        organization_id: string | null;
      }>(
        `SELECT u.id, u.password_hash, u.status, u.failed_login_count, u.locked_until,
                om.organization_id
         FROM users u
         LEFT JOIN organization_memberships om ON om.user_id = u.id
         WHERE u.email = $1`,
        [body.email],
      );
      const user = result.rows[0] ?? null;
      const validPassword = user?.password_hash
        ? await verifyPassword(user.password_hash, body.password)
        : (await hashPassword(body.password), false);
      const locked = user?.locked_until != null && user.locked_until.getTime() > Date.now();

      if (!user || !validPassword || locked || user.status !== "ACTIVE") {
        await recordLoginFailure(request, user);
        throw new AppError(401, "Invalid email, password, or verification state", "INVALID_LOGIN");
      }

      const challengeToken = randomToken();
      await getPool().batch([
        { sql: `UPDATE users SET failed_login_count = 0, locked_until = NULL, updated_at = $2 WHERE id = $1`, params: [user.id, Date.now()] },
        {
          sql: `INSERT INTO auth_challenges (id, user_id, token_digest, expires_at) VALUES ($1, $2, $3, $4)`,
          params: [randomUUID(), user.id, tokenDigest(challengeToken), Date.now() + 300_000],
        },
      ]);
      return reply.send({ mfaRequired: true, challengeToken });
    },
  );

  app.post(
    "/api/v1/auth/mfa/verify",
    { config: { rateLimit: { max: 10, timeWindow: "5 minutes" } } },
    async (request, reply) => {
      const body = safeParse(mfaVerifySchema, request.body);
      const result = await getPool().query<{
          challenge_id: string;
          user_id: string;
          attempts: number;
          encrypted_secret: string;
          last_used_step: string | null;
          organization_id: string;
          role: "ADMIN" | "CLIENT";
          email: string;
          display_name: string;
        }>(
          `SELECT c.id AS challenge_id, c.user_id, c.attempts,
                  m.encrypted_secret, m.last_used_step,
                  om.organization_id, om.role, u.email::text, u.display_name
           FROM auth_challenges c
           JOIN users u ON u.id = c.user_id AND u.status = 'ACTIVE'
           JOIN mfa_credentials m ON m.user_id = u.id
           JOIN organization_memberships om ON om.user_id = u.id
           WHERE c.token_digest = $1 AND c.consumed_at IS NULL
             AND c.expires_at > now()
          `,
          [tokenDigest(body.challengeToken)],
        );
        const row = result.rows[0];
        if (!row || row.attempts >= 5) {
          throw new AppError(401, "Invalid or expired verification code", "INVALID_MFA");
        }

        let authenticated = false;
        let usedStep: number | undefined;
        let recoveryCodeId: string | undefined;
        if (/^\d{6}$/u.test(body.code)) {
          const verification = verifyTotp(decryptSecret(row.encrypted_secret), body.code, {
            lastUsedStep: row.last_used_step == null ? null : Number(row.last_used_step),
          });
          authenticated = verification.valid;
          usedStep = verification.step;
        } else {
          const recovery = await getPool().query<{ id: string }>(
            `SELECT id FROM mfa_recovery_codes
             WHERE user_id = $1 AND code_hash = $2 AND consumed_at IS NULL
            `,
            [row.user_id, tokenDigest(body.code.toUpperCase())],
          );
          recoveryCodeId = recovery.rows[0]?.id;
          authenticated = recoveryCodeId != null;
        }

        if (!authenticated) {
          await getPool().batch([
            { sql: "UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = $1 AND consumed_at IS NULL", params: [row.challenge_id] },
            auditEventQuery(request, {
              organizationId: row.organization_id,
              actorUserId: row.user_id,
              action: "AUTH_MFA",
              targetType: "USER",
              targetId: row.user_id,
              outcome: "FAILURE",
              metadata: { reason: "INVALID_CODE" },
            }),
          ]);
          throw new AppError(401, "Invalid or expired verification code", "INVALID_MFA");
        }

        const now = Date.now();
        const challengeClaim = await getPool().query(
          `UPDATE auth_challenges SET consumed_at = $2
           WHERE id = $1 AND consumed_at IS NULL AND expires_at > $2 AND attempts < 5
           RETURNING id`,
          [row.challenge_id, now],
        );
        if (!challengeClaim.rowCount) throw new AppError(401, "Invalid or expired verification code", "INVALID_MFA");
        if (usedStep != null) {
          const claimedStep = await getPool().query(
            `UPDATE mfa_credentials SET last_used_step = $2
             WHERE user_id = $1 AND (last_used_step IS NULL OR last_used_step < $2)
             RETURNING user_id`,
            [row.user_id, usedStep],
          );
          if (!claimedStep.rowCount) throw new AppError(401, "Verification code was already used", "INVALID_MFA");
        }
        if (recoveryCodeId) {
          const claimedRecovery = await getPool().query(
            `UPDATE mfa_recovery_codes SET consumed_at = $2
             WHERE id = $1 AND consumed_at IS NULL RETURNING id`,
            [recoveryCodeId, now],
          );
          if (!claimedRecovery.rowCount) throw new AppError(401, "Recovery code was already used", "INVALID_MFA");
        }
        const session = sessionInsertQuery(request, row.user_id);
        await getPool().batch([
          { sql: "UPDATE users SET last_login_at = $2, updated_at = $2 WHERE id = $1", params: [row.user_id, now] },
          session.query,
          auditEventQuery(request, {
            organizationId: row.organization_id,
            actorUserId: row.user_id,
            action: "AUTH_LOGIN",
            targetType: "USER",
            targetId: row.user_id,
            outcome: "SUCCESS",
            metadata: { method: recoveryCodeId ? "RECOVERY_CODE" : "TOTP" },
          }),
        ]);
      const outcome = { ...row, sessionToken: session.sessionToken, csrfToken: session.csrfToken };
      setSessionCookie(reply, outcome.sessionToken);
      return reply.send({
        csrfToken: outcome.csrfToken,
        user: {
          id: outcome.user_id,
          email: outcome.email,
          displayName: outcome.display_name,
          role: outcome.role,
        },
      });
    },
  );

  app.post(
    "/api/v1/invitations/accept",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const body = safeParse(invitationAcceptSchema, request.body);
      const passwordHash = await hashPassword(body.password);
      const secret = generateTotpSecret();
      const enrollmentToken = randomToken();
      const result = await getPool().query<{ invitation_id: string; user_id: string }>(
          `SELECT i.id AS invitation_id, i.user_id
           FROM client_invitations i
           JOIN users u ON u.id = i.user_id AND u.status = 'INVITED'
           WHERE i.token_digest = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL
             AND i.expires_at > $2
             AND (i.enrollment_started_at IS NULL OR i.enrollment_started_at < $3)`,
          [tokenDigest(body.token), Date.now(), Date.now() - 1_800_000],
        );
        const invitation = result.rows[0];
      if (!invitation) throw new AppError(400, "Invitation is invalid or expired", "INVALID_INVITATION");
      const now = Date.now();
      const claimed = await getPool().query(
        `UPDATE client_invitations SET enrollment_started_at = $2
         WHERE id = $1 AND accepted_at IS NULL AND revoked_at IS NULL
           AND (enrollment_started_at IS NULL OR enrollment_started_at < $3)
         RETURNING id`,
        [invitation.invitation_id, now, now - 1_800_000],
      );
      if (!claimed.rowCount) throw new AppError(400, "Invitation is invalid or expired", "INVALID_INVITATION");
      await getPool().batch([
        {
          sql: `UPDATE users SET display_name = $2, password_hash = $3,
                  status = 'PENDING_MFA', updated_at = $4 WHERE id = $1`,
          params: [invitation.user_id, body.displayName, passwordHash, now],
        },
        {
          sql: `INSERT INTO mfa_enrollment_sessions
                  (id, user_id, invitation_id, token_digest, encrypted_secret, expires_at)
                VALUES ($1, $2, $3, $4, $5, $6)`,
          params: [randomUUID(), invitation.user_id, invitation.invitation_id, tokenDigest(enrollmentToken), encryptSecret(secret), now + 1_800_000],
        },
      ]);
      return reply.send({ enrollmentToken });
    },
  );

  app.post(
    "/api/v1/auth/mfa/enrol",
    { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const body = safeParse(enrollmentSchema, request.body);
      const result = await getPool().query<{ email: string; encrypted_secret: string; password_hash: string | null }>(
        `SELECT u.email::text, u.password_hash, e.encrypted_secret
         FROM mfa_enrollment_sessions e
         JOIN users u ON u.id = e.user_id AND u.status = 'PENDING_MFA'
         WHERE e.token_digest = $1 AND e.consumed_at IS NULL
           AND e.expires_at > now() AND e.attempts < 5`,
        [tokenDigest(body.enrollmentToken)],
      );
      const row = result.rows[0];
      if (!row?.password_hash || !(await verifyPassword(row.password_hash, body.password))) {
        throw new AppError(400, "Enrollment is invalid or expired", "INVALID_ENROLLMENT");
      }
      const secret = decryptSecret(row.encrypted_secret);
      const otpAuthUri = makeOtpAuthUri(row.email, secret);
      const qrDataUrl = await QRCode.toDataURL(otpAuthUri, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 240,
      });
      return reply.send({ qrDataUrl, manualKey: secret, otpAuthUri });
    },
  );

  app.post(
    "/api/v1/auth/mfa/confirm",
    { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } },
    async (request, reply) => {
      const body = safeParse(enrollmentConfirmSchema, request.body);
      const codes = recoveryCodes();
      const enrollmentResult = await getPool().query<{
          enrollment_id: string;
          user_id: string;
          invitation_id: string | null;
          encrypted_secret: string;
          attempts: number;
          email: string;
          display_name: string;
          organization_id: string;
          role: "ADMIN" | "CLIENT";
          password_hash: string | null;
        }>(
          `SELECT e.id AS enrollment_id, e.user_id, e.invitation_id,
                  e.encrypted_secret, e.attempts, u.email::text, u.display_name,
                  om.organization_id, om.role, u.password_hash
           FROM mfa_enrollment_sessions e
           JOIN users u ON u.id = e.user_id AND u.status = 'PENDING_MFA'
           JOIN organization_memberships om ON om.user_id = u.id
           WHERE e.token_digest = $1 AND e.consumed_at IS NULL
             AND e.expires_at > $2`,
          [tokenDigest(body.enrollmentToken), Date.now()],
        );
        const enrollment = enrollmentResult.rows[0];
        if (!enrollment || enrollment.attempts >= 5) throw new AppError(400, "Invalid or expired verification code", "INVALID_MFA");
        if (!enrollment.password_hash || !(await verifyPassword(enrollment.password_hash, body.password))) {
          await getPool().query(
            "UPDATE mfa_enrollment_sessions SET attempts = attempts + 1 WHERE id = $1",
            [enrollment.enrollment_id],
          );
          throw new AppError(400, "Invalid or expired verification code", "INVALID_MFA");
        }
        const verification = verifyTotp(decryptSecret(enrollment.encrypted_secret), body.code);
        if (!verification.valid || verification.step == null) {
          await getPool().query(
            "UPDATE mfa_enrollment_sessions SET attempts = attempts + 1 WHERE id = $1",
            [enrollment.enrollment_id],
          );
          throw new AppError(400, "Invalid or expired verification code", "INVALID_MFA");
        }
        const now = Date.now();
        const claimed = await getPool().query(
          `UPDATE mfa_enrollment_sessions SET consumed_at = $2
           WHERE id = $1 AND consumed_at IS NULL AND expires_at > $2 AND attempts < 5
           RETURNING id`,
          [enrollment.enrollment_id, now],
        );
        if (!claimed.rowCount) throw new AppError(400, "Invalid or expired verification code", "INVALID_MFA");
        const session = sessionInsertQuery(request, enrollment.user_id);
        await getPool().batch([
          {
            sql: `INSERT INTO mfa_credentials (user_id, encrypted_secret, last_used_step, confirmed_at)
                  VALUES ($1, $2, $3, $4)
                  ON CONFLICT (user_id) DO UPDATE SET encrypted_secret = excluded.encrypted_secret,
                    last_used_step = excluded.last_used_step, confirmed_at = excluded.confirmed_at`,
            params: [enrollment.user_id, enrollment.encrypted_secret, verification.step, now],
          },
          { sql: "DELETE FROM mfa_recovery_codes WHERE user_id = $1", params: [enrollment.user_id] },
          ...codes.map((code) => ({
            sql: "INSERT INTO mfa_recovery_codes (id, user_id, code_hash) VALUES ($1, $2, $3)",
            params: [randomUUID(), enrollment.user_id, tokenDigest(code)],
          })),
          { sql: "UPDATE users SET status = 'ACTIVE', updated_at = $2 WHERE id = $1", params: [enrollment.user_id, now] },
          ...(enrollment.invitation_id ? [{ sql: "UPDATE client_invitations SET accepted_at = $2 WHERE id = $1", params: [enrollment.invitation_id, now] }] : []),
          session.query,
          auditEventQuery(request, {
            organizationId: enrollment.organization_id,
            actorUserId: enrollment.user_id,
            action: "AUTH_MFA_ENROLLED",
            targetType: "USER",
            targetId: enrollment.user_id,
            outcome: "SUCCESS",
          }),
        ]);
      const result = { ...enrollment, sessionToken: session.sessionToken, csrfToken: session.csrfToken };
      setSessionCookie(reply, result.sessionToken);
      return reply.send({
        csrfToken: result.csrfToken,
        recoveryCodes: codes,
        user: {
          id: result.user_id,
          email: result.email,
          displayName: result.display_name,
          role: result.role,
        },
      });
    },
  );

  app.post(
    "/api/v1/auth/password-reset/request",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const body = safeParse(resetRequestSchema, request.body);
      const result = await getPool().query<{ id: string; email: string }>(
        "SELECT id, email::text FROM users WHERE email = $1 AND status = 'ACTIVE'",
        [body.email],
      );
      const user = result.rows[0];
      if (user) {
        const token = randomToken();
        const now = Date.now();
        await getPool().batch([
          {
            sql: "UPDATE password_reset_tokens SET consumed_at = $2 WHERE user_id = $1 AND consumed_at IS NULL",
            params: [user.id, now],
          },
          {
            sql: `INSERT INTO password_reset_tokens (id, user_id, token_digest, expires_at)
                  VALUES ($1, $2, $3, $4)`,
            params: [randomUUID(), user.id, tokenDigest(token), now + getConfig().PASSWORD_RESET_MINUTES * 60_000],
          },
        ]);
        const url = `${getConfig().PUBLIC_ORIGIN}/reset-password#token=${encodeURIComponent(token)}`;
        try {
          await sendMail({
            to: user.email,
            subject: "Reset your Bitwise Secure Portal password",
            text: `A password reset was requested for your account.\n\nOpen this link within ${getConfig().PASSWORD_RESET_MINUTES} minutes:\n${url}\n\nThis does not disable MFA. If you did not request this, ignore this message.`,
          });
        } catch {
          await writeAuditEvent(request, {
            actorUserId: user.id,
            action: "AUTH_PASSWORD_RESET_EMAIL",
            targetType: "USER",
            targetId: user.id,
            outcome: "FAILURE",
            metadata: { reason: "DELIVERY_FAILED" },
          });
        }
      }
      return reply.code(202).send({
        message: "If the account exists, password reset instructions will be sent.",
      });
    },
  );

  app.post(
    "/api/v1/auth/password-reset/confirm",
    { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } },
    async (request, reply) => {
      const body = safeParse(resetConfirmSchema, request.body);
      const passwordHash = await hashPassword(body.password);
      const now = Date.now();
      const result = await getPool().query<{ id: string; user_id: string; organization_id: string }>(
        `SELECT p.id, p.user_id, om.organization_id
         FROM password_reset_tokens p
         JOIN users u ON u.id = p.user_id AND u.status = 'ACTIVE'
         JOIN organization_memberships om ON om.user_id = u.id
         WHERE p.token_digest = $1 AND p.consumed_at IS NULL AND p.expires_at > $2`,
        [tokenDigest(body.token), now],
      );
      const reset = result.rows[0];
      if (!reset) throw new AppError(400, "Reset link is invalid or expired", "INVALID_RESET");
      const claim = await getPool().query(
        `UPDATE password_reset_tokens SET consumed_at = $2
         WHERE id = $1 AND consumed_at IS NULL AND expires_at > $2 RETURNING id`,
        [reset.id, now],
      );
      if (!claim.rowCount) throw new AppError(400, "Reset link is invalid or expired", "INVALID_RESET");
      await getPool().batch([
        {
          sql: `UPDATE users SET password_hash = $2, failed_login_count = 0,
                locked_until = NULL, updated_at = $3 WHERE id = $1`,
          params: [reset.user_id, passwordHash, now],
        },
        {
          sql: "UPDATE sessions SET revoked_at = $2 WHERE user_id = $1 AND revoked_at IS NULL",
          params: [reset.user_id, now],
        },
        auditEventQuery(request, {
          organizationId: reset.organization_id,
          actorUserId: reset.user_id,
          action: "AUTH_PASSWORD_RESET",
          targetType: "USER",
          targetId: reset.user_id,
          outcome: "SUCCESS",
          metadata: { sessionsRevoked: true, mfaPreserved: true },
        }),
      ]);
      clearSessionCookie(reply);
      return reply.send({ message: "Password updated. Sign in using your password and MFA code." });
    },
  );

  app.get(
    "/api/v1/auth/session",
    { preHandler: requireAuth },
    async (request) => {
      const auth = request.auth!;
      const csrfToken = await rotateCsrfToken(auth.sessionId);
      return {
        csrfToken,
        user: {
          id: auth.userId,
          email: auth.email,
          displayName: auth.displayName,
          role: auth.role,
        },
      };
    },
  );

  app.post(
    "/api/v1/auth/logout",
    { preHandler: [requireAuth, requireCsrf] },
    async (request, reply) => {
      const auth = request.auth!;
      await getPool().query("UPDATE sessions SET revoked_at = now() WHERE id = $1", [auth.sessionId]);
      await writeAuditEvent(request, {
        organizationId: auth.organizationId,
        actorUserId: auth.userId,
        action: "AUTH_LOGOUT",
        targetType: "USER",
        targetId: auth.userId,
        outcome: "SUCCESS",
      });
      clearSessionCookie(reply);
      return reply.code(204).send();
    },
  );
}
