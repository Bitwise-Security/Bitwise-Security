import { getConfig } from "../config.js";
import { closePool, withTransaction } from "../db.js";
import { encryptSecret, hashPassword, randomToken, tokenDigest } from "../security/crypto.js";
import { passwordSchema } from "../security/password-policy.js";
import { generateTotpSecret } from "../security/totp.js";
import { sendMail } from "../services/mail.js";

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

    const created = await withTransaction(async (client) => {
      await client.query("SELECT pg_advisory_xact_lock(hashtext('bitwise-secure-portal-admin-bootstrap'))");
      const existing = await client.query(
        `SELECT 1 FROM organization_memberships WHERE role = 'ADMIN' LIMIT 1`,
      );
      if (existing.rowCount) return false;

      const organization = await client.query<{ id: string }>(
        `INSERT INTO organizations (name) VALUES ($1) RETURNING id`,
        [config.BOOTSTRAP_ORGANIZATION_NAME],
      );
      const organizationId = organization.rows[0]!.id;
      const user = await client.query<{ id: string }>(
        `INSERT INTO users (email, display_name, password_hash, status)
         VALUES ($1, $2, $3, 'PENDING_MFA') RETURNING id`,
        [email, config.BOOTSTRAP_ADMIN_DISPLAY_NAME, passwordHash],
      );
      const userId = user.rows[0]!.id;
      await client.query(
        `INSERT INTO organization_memberships (organization_id, user_id, role)
         VALUES ($1, $2, 'ADMIN')`,
        [organizationId, userId],
      );
      await client.query(
        `INSERT INTO mfa_enrollment_sessions
           (user_id, token_digest, encrypted_secret, expires_at)
         VALUES ($1, $2, $3, now() + interval '24 hours')`,
        [userId, tokenDigest(enrollmentToken), encryptedSecret],
      );
      await client.query(
        `INSERT INTO audit_events
           (organization_id, action, target_type, target_id, outcome, metadata)
         VALUES ($1, 'ADMIN_BOOTSTRAPPED', 'USER', $2, 'SUCCESS',
                 '{"requiresMfaEnrollment":true}'::jsonb)`,
        [organizationId, userId],
      );

      const url = `${config.PUBLIC_ORIGIN}/enrol-mfa#token=${encodeURIComponent(enrollmentToken)}`;
      await sendMail({
        to: email,
        subject: "Complete Bitwise Secure Portal administrator setup",
        text: `Complete mandatory MFA setup within 24 hours:\n${url}\n\nUse the administrator password supplied through the separate setup channel. If you did not initiate this setup, contact Bitwise Security immediately.`,
        idempotencyKey: `portal-admin-bootstrap-${userId}`,
      });
      return true;
    });

    process.stdout.write(created
      ? "Created the initial administrator and sent the MFA setup email.\n"
      : "An administrator already exists; bootstrap made no changes.\n");
  }
} finally {
  await closePool();
}
