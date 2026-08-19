declare namespace Cloudflare {
  interface Env {
    BOOTSTRAP_ADMIN_EMAIL?: string;
    BOOTSTRAP_ADMIN_PASSWORD?: string;
    /** Unset disables the /control/container routes entirely. */
    CONTAINER_CONTROL_TOKEN?: string;
    FILE_KEY_RING: string;
    MFA_ENCRYPTION_KEY: string;
    RESEND_API_KEY: string;
    SESSION_PEPPER: string;
  }
}
