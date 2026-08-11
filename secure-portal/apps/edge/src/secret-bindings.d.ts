declare namespace Cloudflare {
  interface Env {
    BOOTSTRAP_ADMIN_EMAIL?: string;
    BOOTSTRAP_ADMIN_PASSWORD?: string;
    DATABASE_URL: string;
    FILE_KEY_RING: string;
    MFA_ENCRYPTION_KEY: string;
    RESEND_API_KEY: string;
    SESSION_PEPPER: string;
  }
}
