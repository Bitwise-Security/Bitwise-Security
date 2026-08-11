import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4100),
  PUBLIC_ORIGIN: z.string().url(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  RATE_LIMIT_BACKEND: z.enum(["memory", "redis"]).default("redis"),
  TRUSTED_EDGE_GATEWAY: booleanString.default(false),
  MFA_ENCRYPTION_KEY: z.string().min(1),
  SESSION_PEPPER: z.string().min(32),
  SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(120).default(30),
  SESSION_ABSOLUTE_HOURS: z.coerce.number().int().min(1).max(24).default(12),
  PASSWORD_RESET_MINUTES: z.coerce.number().int().min(5).max(60).default(30),
  INVITATION_EXPIRY_HOURS: z.coerce.number().int().min(1).max(168).default(72),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(1025),
  SMTP_SECURE: booleanString.default(false),
  SMTP_USER: z.string().default(""),
  SMTP_PASSWORD: z.string().default(""),
  EMAIL_FROM: z.string().min(3),
  EMAIL_PROVIDER: z.enum(["smtp", "resend"]).default("smtp"),
  RESEND_API_KEY: z.string().optional(),
  STORAGE_MODE: z.enum(["local", "s3", "r2-binding"]).default("local"),
  R2_BINDING_ORIGIN: z.string().url().default("http://portal-files.internal"),
  LOCAL_STORAGE_PATH: z.string().default("./data/private-files"),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  FILE_KEY_PROVIDER: z.enum(["local", "aws-kms", "cloudflare-secret"]).default("local"),
  FILE_KEY_ENCRYPTION_KEY: z.string().optional(),
  FILE_KEY_RING: z.string().optional(),
  AWS_KMS_KEY_ID: z.string().optional(),
  SCANNER_MODE: z.enum(["stub", "clamav"]).default("stub"),
  CLAMAV_HOST: z.string().default("clamav"),
  CLAMAV_PORT: z.coerce.number().int().min(1).max(65_535).default(3310),
  MAX_FILE_SIZE_BYTES: z.coerce.number().int().min(1).max(2_147_483_648).default(2_147_483_648),
  UPLOAD_CHUNK_SIZE_BYTES: z.coerce.number().int().min(5_242_880).max(33_554_432).default(8_388_608),
  SEED_ADMIN_EMAIL: z.string().email().optional(),
  SEED_ADMIN_PASSWORD: z.string().optional(),
  SEED_CLIENT_PASSWORD: z.string().optional(),
  SEED_TOTP_SECRET: z.string().optional(),
  BOOTSTRAP_ADMIN_EMAIL: z.string().email().optional(),
  BOOTSTRAP_ADMIN_PASSWORD: z.string().optional(),
  BOOTSTRAP_ADMIN_DISPLAY_NAME: z.string().min(1).max(160).default("Bitwise Administrator"),
  BOOTSTRAP_ORGANIZATION_NAME: z.string().min(1).max(160).default("Bitwise Security"),
});

export type Config = z.infer<typeof schema>;

let cached: Config | undefined;

export function getConfig(): Config {
  cached ??= schema.parse(process.env);

  const key = Buffer.from(cached.MFA_ENCRYPTION_KEY, "base64");
  if (key.length !== 32) {
    throw new Error("MFA_ENCRYPTION_KEY must be exactly 32 bytes encoded as base64");
  }
  if (
    cached.NODE_ENV === "production" &&
    cached.MFA_ENCRYPTION_KEY === "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
  ) {
    throw new Error("The development MFA encryption key cannot be used in production");
  }
  if (cached.FILE_KEY_PROVIDER === "local") {
    const fileKey = Buffer.from(cached.FILE_KEY_ENCRYPTION_KEY ?? "", "base64");
    if (fileKey.length !== 32) {
      throw new Error("FILE_KEY_ENCRYPTION_KEY must be exactly 32 bytes encoded as base64");
    }
  }
  if (cached.FILE_KEY_PROVIDER === "aws-kms" && !cached.AWS_KMS_KEY_ID) {
    throw new Error("AWS_KMS_KEY_ID is required for the aws-kms file key provider");
  }
  if (cached.FILE_KEY_PROVIDER === "cloudflare-secret") {
    let keyRing: { current?: unknown; keys?: unknown };
    try {
      keyRing = JSON.parse(cached.FILE_KEY_RING ?? "") as { current?: unknown; keys?: unknown };
    } catch {
      throw new Error("FILE_KEY_RING must be valid JSON for the cloudflare-secret provider");
    }
    if (typeof keyRing.current !== "string" || typeof keyRing.keys !== "object" || keyRing.keys === null) {
      throw new Error("FILE_KEY_RING must contain a current version and keys object");
    }
    const keys = keyRing.keys as Record<string, unknown>;
    if (
      typeof keys[keyRing.current] !== "string" ||
      Buffer.from(keys[keyRing.current] as string, "base64").length !== 32 ||
      Object.values(keys).some((value) => typeof value !== "string" || Buffer.from(value, "base64").length !== 32)
    ) {
      throw new Error("Every FILE_KEY_RING key must be exactly 32 bytes encoded as base64");
    }
  }
  if (cached.STORAGE_MODE === "s3") {
    if (!cached.S3_ENDPOINT || !cached.S3_BUCKET || !cached.S3_ACCESS_KEY_ID || !cached.S3_SECRET_ACCESS_KEY) {
      throw new Error("S3 endpoint, bucket, access key, and secret key are required for S3 storage");
    }
  }
  if (cached.NODE_ENV === "production" && (cached.STORAGE_MODE === "local" || cached.FILE_KEY_PROVIDER === "local" || cached.SCANNER_MODE === "stub")) {
    throw new Error("Production requires private object storage, a production file-key provider, and a non-stub scanner");
  }
  if (cached.NODE_ENV === "production" && cached.RATE_LIMIT_BACKEND === "memory" && !cached.TRUSTED_EDGE_GATEWAY) {
    throw new Error("Production in-memory rate limiting requires the trusted Cloudflare edge limiter");
  }
  if (cached.EMAIL_PROVIDER === "resend" && !cached.RESEND_API_KEY) {
    throw new Error("RESEND_API_KEY is required when EMAIL_PROVIDER=resend");
  }
  if (cached.NODE_ENV === "production" && cached.EMAIL_PROVIDER !== "resend") {
    throw new Error("Production email must use the Resend provider");
  }
  if (cached.NODE_ENV === "production") {
    const databaseUrl = new URL(cached.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol) || databaseUrl.searchParams.get("sslmode") !== "verify-full") {
      throw new Error("Production DATABASE_URL must be PostgreSQL with sslmode=verify-full");
    }
  }
  if (Boolean(cached.BOOTSTRAP_ADMIN_EMAIL) !== Boolean(cached.BOOTSTRAP_ADMIN_PASSWORD)) {
    throw new Error("BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD must be provided together");
  }
  return cached;
}

export function resetConfigForTests(): void {
  cached = undefined;
}
