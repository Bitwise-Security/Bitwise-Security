import { getConfig } from "../config.js";
import { closePool, withTransaction } from "../db.js";
import { encryptSecret, hashPassword, sha256, tokenDigest } from "../security/crypto.js";

const config = getConfig();
if (config.NODE_ENV === "production") {
  throw new Error("The demo seed script is disabled in production");
}
if (
  !config.SEED_ADMIN_EMAIL ||
  !config.SEED_ADMIN_PASSWORD ||
  !config.SEED_CLIENT_PASSWORD ||
  !config.SEED_TOTP_SECRET
) {
  throw new Error("Seed credentials are required; copy and review .env.example");
}

const adminHash = await hashPassword(config.SEED_ADMIN_PASSWORD);
const clientHash = await hashPassword(config.SEED_CLIENT_PASSWORD);
const encryptedTotp = encryptSecret(config.SEED_TOTP_SECRET);

const accounts = [
  {
    email: config.SEED_ADMIN_EMAIL,
    displayName: "Bitwise Administrator",
    passwordHash: adminHash,
    role: "ADMIN" as const,
    space: null,
  },
  {
    email: "demo-client-one@example.test",
    displayName: "Demo Client One",
    passwordHash: clientHash,
    role: "CLIENT" as const,
    space: "Demo Client One",
  },
  {
    email: "demo-client-two@example.test",
    displayName: "Demo Client Two",
    passwordHash: clientHash,
    role: "CLIENT" as const,
    space: "Demo Client Two",
  },
];

try {
  await withTransaction(async (client) => {
    let organization = await client.query<{ id: string }>(
      "SELECT id FROM organizations WHERE name = $1 ORDER BY created_at LIMIT 1",
      ["Bitwise Security"],
    );
    if (!organization.rows[0]) {
      organization = await client.query<{ id: string }>(
        "INSERT INTO organizations (name) VALUES ($1) RETURNING id",
        ["Bitwise Security"],
      );
    }
    const organizationId = organization.rows[0]!.id;

    for (const account of accounts) {
      const user = await client.query<{ id: string }>(
        `INSERT INTO users (email, display_name, password_hash, status)
         VALUES ($1, $2, $3, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           password_hash = EXCLUDED.password_hash,
           status = 'ACTIVE',
           updated_at = now()
         RETURNING id`,
        [account.email.toLowerCase(), account.displayName, account.passwordHash],
      );
      const userId = user.rows[0]!.id;
      await client.query(
        `INSERT INTO organization_memberships (organization_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
        [organizationId, userId, account.role],
      );
      await client.query(
        `INSERT INTO mfa_credentials (user_id, encrypted_secret, confirmed_at)
         VALUES ($1, $2, now())
         ON CONFLICT (user_id) DO UPDATE SET
           encrypted_secret = EXCLUDED.encrypted_secret,
           last_used_step = NULL,
           confirmed_at = now()`,
        [userId, encryptedTotp],
      );
      await client.query("DELETE FROM mfa_recovery_codes WHERE user_id = $1", [userId]);
      await client.query(
        "INSERT INTO mfa_recovery_codes (user_id, code_hash) VALUES ($1, $2)",
        [userId, tokenDigest(`DEMO-${sha256(userId).slice(0, 20).toUpperCase()}`)],
      );

      if (account.space) {
        let space = await client.query<{ id: string }>(
          "SELECT id FROM client_spaces WHERE organization_id = $1 AND name = $2",
          [organizationId, account.space],
        );
        if (!space.rows[0]) {
          space = await client.query<{ id: string }>(
            "INSERT INTO client_spaces (organization_id, name) VALUES ($1, $2) RETURNING id",
            [organizationId, account.space],
          );
        }
        await client.query(
          `INSERT INTO space_memberships (space_id, user_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [space.rows[0]!.id, userId],
        );
      }
    }
  });
  process.stdout.write("Created or updated one admin and two isolated demo clients.\n");
  process.stdout.write("Credentials and TOTP seed are read from environment; no secrets were printed.\n");
} finally {
  await closePool();
}
