import { randomBytes } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import QRCode from "qrcode";
import { z } from "zod";
import { getConfig } from "../config.js";
import { getPool, withTransaction } from "../db.js";
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
  createSession,
  requireAuth,
  requireCsrf,
  rotateCsrfToken,
  setSessionCookie,
} from "../security/sessions.js";
import {
  generateTotpSecret,
  makeOtpAuthUri,
  verifyTotp,
} from "../security/totp.js";
import { writeAuditEvent } from "../services/audit.js";
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
           WHEN failed_login_count + 1 >= 10 THEN now() + interval '24 hours'
           WHEN failed_login_count + 1 >= 5 THEN now() + interval '15 minutes'
           ELSE locked_until
         END,
         updated_at = now()
     WHERE id = $1
     RETURNING locked_until IS NOT NULL AND locked_until > now() AS locked`,
    [user.id],
  );
  await writeAuditEvent(request, {
    organizationId: user.organization_id,
    actorUserId: user.id,
    action: "AUTH_LOGIN",
    targetType: "USER",
    targetId: user.id,
    outcome: "FAILURE",
    metadata: { reason: "INVALID_CREDENTIALS", accountLocked: result.rows[0]?.locked ?? false },
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
      await withTransaction(async (client) => {
        await client.query(
          `UPDATE users SET failed_login_count = 0, locked_until = NULL, updated_at = now()
           WHERE id = $1`,
          [user.id],
        );
        await client.query(
          `INSERT INTO auth_challenges (user_id, token_digest, expires_at)
           VALUES ($1, $2, now() + interval '5 minutes')`,
          [user.id, tokenDigest(challengeToken)],
        );
      });
      return reply.send({ mfaRequired: true, challengeToken });
    },
  );

  app.post(
    "/api/v1/auth/mfa/verify",
    { config: { rateLimit: { max: 10, timeWindow: "5 minutes" } } },
    async (request, reply) => {
      const body = safeParse(mfaVerifySchema, request.body);
      const outcome = await withTransaction(async (client) => {
        const result = await client.query<{
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
           FOR UPDATE OF c, m`,
          [tokenDigest(body.challengeToken)],
        );
        const row = result.rows[0];
        if (!row || row.attempts >= 5) {
          return null;
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
          const recovery = await client.query<{ id: string }>(
            `SELECT id FROM mfa_recovery_codes
             WHERE user_id = $1 AND code_hash = $2 AND consumed_at IS NULL
             FOR UPDATE`,
            [row.user_id, tokenDigest(body.code.toUpperCase())],
          );
          recoveryCodeId = recovery.rows[0]?.id;
          authenticated = recoveryCodeId != null;
        }

        if (!authenticated) {
          await client.query(
            "UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = $1",
            [row.challenge_id],
          );
          await writeAuditEvent(
            request,
            {
              organizationId: row.organization_id,
              actorUserId: row.user_id,
              action: "AUTH_MFA",
              targetType: "USER",
              targetId: row.user_id,
              outcome: "FAILURE",
              metadata: { reason: "INVALID_CODE" },
            },
            client,
          );
          return null;
        }

        if (usedStep != null) {
          await client.query(
            "UPDATE mfa_credentials SET last_used_step = $2 WHERE user_id = $1",
            [row.user_id, usedStep],
          );
        }
        if (recoveryCodeId) {
          await client.query(
            "UPDATE mfa_recovery_codes SET consumed_at = now() WHERE id = $1",
            [recoveryCodeId],
          );
        }
        await client.query(
          "UPDATE auth_challenges SET consumed_at = now() WHERE id = $1",
          [row.challenge_id],
        );
        await client.query(
          "UPDATE users SET last_login_at = now(), updated_at = now() WHERE id = $1",
          [row.user_id],
        );
        const session = await createSession(client, request, row.user_id);
        await writeAuditEvent(
          request,
          {
            organizationId: row.organization_id,
            actorUserId: row.user_id,
            action: "AUTH_LOGIN",
            targetType: "USER",
            targetId: row.user_id,
            outcome: "SUCCESS",
            metadata: { method: recoveryCodeId ? "RECOVERY_CODE" : "TOTP" },
          },
          client,
        );
        return { ...row, ...session };
      });

      if (!outcome) {
        throw new AppError(401, "Invalid or expired verification code", "INVALID_MFA");
      }
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
      const accepted = await withTransaction(async (client) => {
        const result = await client.query<{ invitation_id: string; user_id: string }>(
          `SELECT i.id AS invitation_id, i.user_id
           FROM client_invitations i
           JOIN users u ON u.id = i.user_id AND u.status = 'INVITED'
           WHERE i.token_digest = $1 AND i.accepted_at IS NULL AND i.revoked_at IS NULL
             AND i.expires_at > now()
           FOR UPDATE OF i, u`,
          [tokenDigest(body.token)],
        );
        const invitation = result.rows[0];
        if (!invitation) return null;
        await client.query(
          `UPDATE users SET display_name = $2, password_hash = $3,
             status = 'PENDING_MFA', updated_at = now() WHERE id = $1`,
          [invitation.user_id, body.displayName, passwordHash],
        );
        await client.query(
          `INSERT INTO mfa_enrollment_sessions
             (user_id, invitation_id, token_digest, encrypted_secret, expires_at)
           VALUES ($1, $2, $3, $4, now() + interval '30 minutes')`,
          [
            invitation.user_id,
            invitation.invitation_id,
            tokenDigest(enrollmentToken),
            encryptSecret(secret),
          ],
        );
        return invitation;
      });
      if (!accepted) throw new AppError(400, "Invitation is invalid or expired", "INVALID_INVITATION");
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
      const result = await withTransaction(async (client) => {
        const enrollmentResult = await client.query<{
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
             AND e.expires_at > now()
           FOR UPDATE OF e, u`,
          [tokenDigest(body.enrollmentToken)],
        );
        const enrollment = enrollmentResult.rows[0];
        if (!enrollment || enrollment.attempts >= 5) return null;
        if (!enrollment.password_hash || !(await verifyPassword(enrollment.password_hash, body.password))) {
          await client.query(
            "UPDATE mfa_enrollment_sessions SET attempts = attempts + 1 WHERE id = $1",
            [enrollment.enrollment_id],
          );
          return null;
        }
        const verification = verifyTotp(decryptSecret(enrollment.encrypted_secret), body.code);
        if (!verification.valid || verification.step == null) {
          await client.query(
            "UPDATE mfa_enrollment_sessions SET attempts = attempts + 1 WHERE id = $1",
            [enrollment.enrollment_id],
          );
          return null;
        }
        await client.query(
          `INSERT INTO mfa_credentials
             (user_id, encrypted_secret, last_used_step, confirmed_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (user_id) DO UPDATE SET
             encrypted_secret = EXCLUDED.encrypted_secret,
             last_used_step = EXCLUDED.last_used_step,
             confirmed_at = now()`,
          [enrollment.user_id, enrollment.encrypted_secret, verification.step],
        );
        await client.query("DELETE FROM mfa_recovery_codes WHERE user_id = $1", [enrollment.user_id]);
        for (const code of codes) {
          await client.query(
            "INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES ($1, $2)",
            [enrollment.user_id, tokenDigest(code)],
          );
        }
        await client.query(
          "UPDATE users SET status = 'ACTIVE', updated_at = now() WHERE id = $1",
          [enrollment.user_id],
        );
        await client.query(
          "UPDATE mfa_enrollment_sessions SET consumed_at = now() WHERE id = $1",
          [enrollment.enrollment_id],
        );
        if (enrollment.invitation_id) {
          await client.query(
            "UPDATE client_invitations SET accepted_at = now() WHERE id = $1",
            [enrollment.invitation_id],
          );
        }
        const session = await createSession(client, request, enrollment.user_id);
        await writeAuditEvent(
          request,
          {
            organizationId: enrollment.organization_id,
            actorUserId: enrollment.user_id,
            action: "AUTH_MFA_ENROLLED",
            targetType: "USER",
            targetId: enrollment.user_id,
            outcome: "SUCCESS",
          },
          client,
        );
        return { ...enrollment, ...session };
      });
      if (!result) throw new AppError(400, "Invalid or expired verification code", "INVALID_MFA");
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
        await withTransaction(async (client) => {
          await client.query(
            "UPDATE password_reset_tokens SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL",
            [user.id],
          );
          await client.query(
            `INSERT INTO password_reset_tokens (user_id, token_digest, expires_at)
             VALUES ($1, $2, now() + ($3 * interval '1 minute'))`,
            [user.id, tokenDigest(token), getConfig().PASSWORD_RESET_MINUTES],
          );
        });
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
      const reset = await withTransaction(async (client) => {
        const result = await client.query<{ id: string; user_id: string; organization_id: string }>(
          `SELECT p.id, p.user_id, om.organization_id
           FROM password_reset_tokens p
           JOIN users u ON u.id = p.user_id AND u.status = 'ACTIVE'
           JOIN organization_memberships om ON om.user_id = u.id
           WHERE p.token_digest = $1 AND p.consumed_at IS NULL AND p.expires_at > now()
           FOR UPDATE OF p, u`,
          [tokenDigest(body.token)],
        );
        const row = result.rows[0];
        if (!row) return null;
        await client.query(
          `UPDATE users SET password_hash = $2, failed_login_count = 0,
             locked_until = NULL, updated_at = now() WHERE id = $1`,
          [row.user_id, passwordHash],
        );
        await client.query("UPDATE password_reset_tokens SET consumed_at = now() WHERE id = $1", [row.id]);
        await client.query("UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL", [row.user_id]);
        await writeAuditEvent(
          request,
          {
            organizationId: row.organization_id,
            actorUserId: row.user_id,
            action: "AUTH_PASSWORD_RESET",
            targetType: "USER",
            targetId: row.user_id,
            outcome: "SUCCESS",
            metadata: { sessionsRevoked: true, mfaPreserved: true },
          },
          client,
        );
        return row;
      });
      if (!reset) throw new AppError(400, "Reset link is invalid or expired", "INVALID_RESET");
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
