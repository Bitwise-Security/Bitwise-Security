import { randomUUID } from "node:crypto";
import { getConfig } from "../config.js";
import { closePool, getPool } from "../db.js";
import { encryptSecret, hashPassword, randomToken, tokenDigest } from "../security/crypto.js";
import { passwordSchema } from "../security/password-policy.js";
import { generateTotpSecret } from "../security/totp.js";

const config = getConfig();

try {
  if (!config.BOOTSTRAP_ADMIN_EMAIL || !config.BOOTSTRAP_ADMIN_PASSWORD) {
    process.stdout.write("Initial administrator bootstrap is not configured.\n");
  } else {
    const password = passwordSchema.parse(config.BOOTSTRAP_ADMIN_PASSWORD);
    const passwordHash = await hashPassword(password);
    const enrollmentToken = randomToken();
    const encryptedSecret = encryptSecret(generateTotpSecret());
    const email = config.BOOTSTRAP_ADMIN_EMAIL.toLowerCase();

    const existing = await getPool().query(
      `SELECT 1 FROM organization_memberships WHERE role = 'ADMIN' LIMIT 1`,
    );
    let created = false;
    if (!existing.rowCount) {
      const organizationId = randomUUID();
      const userId = randomUUID();
      const enrollmentId = randomUUID();
      const notificationId = randomUUID();
      const url = `${config.PUBLIC_ORIGIN}/enrol-mfa#token=${encodeURIComponent(enrollmentToken)}`;
      await getPool().batch([
        {
          sql: `INSERT INTO organizations (id, name) VALUES ($1, $2)`,
          params: [organizationId, config.BOOTSTRAP_ORGANIZATION_NAME],
        },
        {
          sql: `INSERT INTO users (id, email, display_name, password_hash, status)
                VALUES ($1, $2, $3, $4, 'PENDING_MFA')`,
          params: [userId, email, config.BOOTSTRAP_ADMIN_DISPLAY_NAME, passwordHash],
        },
        {
          sql: `INSERT INTO organization_memberships (organization_id, user_id, role)
                VALUES ($1, $2, 'ADMIN')`,
          params: [organizationId, userId],
        },
        {
          sql: `INSERT INTO mfa_enrollment_sessions
                  (id, user_id, token_digest, encrypted_secret, expires_at)
                VALUES ($1, $2, $3, $4, $5)`,
          params: [enrollmentId, userId, tokenDigest(enrollmentToken), encryptedSecret, Date.now() + 86_400_000],
        },
        {
          sql: `INSERT INTO audit_events
                  (organization_id, action, target_type, target_id, outcome, metadata)
                VALUES ($1, 'ADMIN_BOOTSTRAPPED', 'USER', $2, 'SUCCESS', $3)`,
          params: [organizationId, userId, JSON.stringify({ requiresMfaEnrollment: true })],
        },
        {
          sql: `INSERT INTO notification_outbox
                  (id, kind, recipient_email, subject, text_body)
                VALUES ($1, 'ADMIN_BOOTSTRAP', $2, $3, $4)`,
          params: [
            notificationId,
            email,
            "Complete Bitwise Secure Portal administrator setup",
            `Complete mandatory MFA setup within 24 hours:\n${url}\n\nUse the administrator password supplied through the separate setup channel. If you did not initiate this setup, contact Bitwise Security immediately.`,
          ],
        },
      ]);
      created = true;
    }

    process.stdout.write(created
      ? "Created the initial administrator and sent the MFA setup email.\n"
      : "An administrator already exists; bootstrap made no changes.\n");
  }
} finally {
  await closePool();
}
