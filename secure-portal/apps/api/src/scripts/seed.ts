import { randomUUID } from "node:crypto";
import { getConfig } from "../config.js";
import { closePool, getPool } from "../db.js";
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
  const database = getPool();
  let organization = await database.query<{ id: string }>(
      "SELECT id FROM organizations WHERE name = $1 ORDER BY created_at LIMIT 1",
      ["Bitwise Security"],
  );
  if (!organization.rows[0]) {
    const organizationId = randomUUID();
    await database.query("INSERT INTO organizations (id, name) VALUES ($1, $2)", [organizationId, "Bitwise Security"]);
    organization = { rows: [{ id: organizationId }], rowCount: 1 };
  }
  const organizationId = organization.rows[0]!.id;

  for (const account of accounts) {
      const proposedUserId = randomUUID();
      const user = await database.query<{ id: string }>(
        `INSERT INTO users (email, display_name, password_hash, status)
         VALUES ($1, $2, $3, $4, 'ACTIVE')
         ON CONFLICT (email) DO UPDATE SET
           display_name = EXCLUDED.display_name,
           password_hash = EXCLUDED.password_hash,
           status = 'ACTIVE',
           updated_at = now()
         RETURNING id`,
        [proposedUserId, account.email.toLowerCase(), account.displayName, account.passwordHash],
      );
      const userId = user.rows[0]!.id;
      await database.batch([
        {
          sql:
        `INSERT INTO organization_memberships (organization_id, user_id, role)
         VALUES ($1, $2, $3)
         ON CONFLICT (organization_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
          params: [organizationId, userId, account.role],
        },
        {
          sql:
        `INSERT INTO mfa_credentials (user_id, encrypted_secret, confirmed_at)
         VALUES ($1, $2, now())
         ON CONFLICT (user_id) DO UPDATE SET
           encrypted_secret = EXCLUDED.encrypted_secret,
           last_used_step = NULL,
           confirmed_at = now()`,
          params: [userId, encryptedTotp],
        },
        { sql: "DELETE FROM mfa_recovery_codes WHERE user_id = $1", params: [userId] },
        {
          sql: "INSERT INTO mfa_recovery_codes (id, user_id, code_hash) VALUES ($1, $2, $3)",
          params: [randomUUID(), userId, tokenDigest(`DEMO-${sha256(userId).slice(0, 20).toUpperCase()}`)],
        },
      ]);

      if (account.space) {
        let space = await database.query<{ id: string }>(
          "SELECT id FROM client_spaces WHERE organization_id = $1 AND name = $2",
          [organizationId, account.space],
        );
        if (!space.rows[0]) {
          const spaceId = randomUUID();
          await database.query(
            "INSERT INTO client_spaces (id, organization_id, name) VALUES ($1, $2, $3)",
            [spaceId, organizationId, account.space],
          );
          space = { rows: [{ id: spaceId }], rowCount: 1 };
        }
        await database.query(
          `INSERT INTO space_memberships (space_id, user_id) VALUES ($1, $2)
           ON CONFLICT DO NOTHING`,
          [space.rows[0]!.id, userId],
        );
      }
  }
  process.stdout.write("Created or updated one admin and two isolated demo clients.\n");
  process.stdout.write("Credentials and TOTP seed are read from environment; no secrets were printed.\n");
} finally {
  await closePool();
}
