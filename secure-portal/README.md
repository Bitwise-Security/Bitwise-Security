# Bitwise Secure Portal

The customer-facing file-transfer application intended for
`portal.bitwise-security.nl`. It is isolated under `secure-portal/`; the public
Cloudflare Pages website does not build or deploy this directory.

The Cloudflare deployment uses a React/TypeScript client served by a Worker, a
private Fastify/TypeScript API and maintenance process inside a Cloudflare
Container, a Durable Object edge limiter, dedicated D1 and R2 bindings,
ClamAV in the container, and Resend. Fastify preserves explicit schema-oriented
security controls and streaming support while the edge Worker is the only public
entry point. The Cloudflare account, Worker, bucket, and hostname scope is recorded
in [CLOUDFLARE_SCOPE.md](CLOUDFLARE_SCOPE.md).

See [SECURITY.md](SECURITY.md) for the threat model, data model, security design,
OWASP self-review, and residual risks.

## User workflow

- An administrator creates a client. The client receives an invitation, chooses a
  password, and scans a TOTP QR code.
- Clients see one clearly labelled space with **Files you sent** and **Files shared
  with you**. Administrators can switch between all client spaces.
- Files can be dropped onto the page. Upload progress and scan status are visible;
  interrupted uploads resume by checking completed chunks.
- Uploaders may choose an expiry date. Display names can be changed without
  changing the private storage key.
- Administrators can review authentication, file, and permission activity in the
  audit view.

## Local evaluation with Docker Compose

Docker is required. The local stack intentionally substitutes private filesystem
storage, a development-only local wrapping key, a no-op scan stub, and Mailpit.
Those modes are rejected when `NODE_ENV=production`.

```powershell
cd secure-portal
Copy-Item .env.example .env
docker compose up --build
```

Open the portal at <http://localhost:4100> and captured development mail at
<http://localhost:8025>. Before evaluation, replace `MFA_ENCRYPTION_KEY`,
`FILE_KEY_ENCRYPTION_KEY`, `SESSION_PEPPER`, and all seed passwords. The values in
`.env.example` are deliberately unsafe.

The seed creates the configured administrator plus two demo clients. Passwords and
the development TOTP seed come from `.env` and are never printed. The seed refuses
to run in production.

## Local development without the application container

Start the local D1-compatible bridge, Redis, and Mailpit from Compose, set their
hosts to `localhost`,
then run:

```powershell
npm ci
$env:D1_BINDING_ORIGIN = "http://127.0.0.1:8788"
npm run db:seed
npm run dev --workspace @bitwise-portal/api
```

In another terminal:

```powershell
npm run dev --workspace @bitwise-portal/web
```

The Vite URL is <http://localhost:4173>; set `PUBLIC_ORIGIN` to that exact origin.

## Cloudflare staging deployment

Staging is deliberately isolated at `portal-test.bitwise-security.nl` and uses only:

- Worker `bitwise-secure-portal-staging`
- D1 database `bitwise-secure-portal-staging-db`
- R2 bucket `bitwise-secure-portal-staging-files`
- the Worker-owned `PortalContainer` and `AuthRateLimiter` Durable Objects

Docker must be running because Wrangler builds the Cloudflare Container locally.
Wrangler applies versioned migrations to the exact dedicated D1 database before
deploying the Worker. Set secrets as environment variables, never in source:

```powershell
$env:CLOUDFLARE_API_TOKEN = [Environment]::GetEnvironmentVariable("CLOUDFLARE_API_TOKEN", "User")
$env:PORTAL_STAGING_MFA_ENCRYPTION_KEY = "<32 random bytes, base64>"
$env:PORTAL_STAGING_SESSION_PEPPER = "<independent random secret>"
$env:PORTAL_STAGING_FILE_KEY_RING = '{"current":"v1","keys":{"v1":"<32 random bytes, base64>"}}'
$env:PORTAL_STAGING_RESEND_API_KEY = "<new restricted Resend key>"
$env:PORTAL_STAGING_ADMIN_EMAIL = "<administrator email>"
$env:PORTAL_STAGING_ADMIN_PASSWORD = "<unique 12+ character password>"
./scripts/provision-cloudflare-staging.ps1
```

The deployment applies D1 migrations and startup creates the first administrator
only when no administrator exists. The setup email requires both its one-time token and the
separately known password before revealing or confirming the TOTP secret. After MFA
is active, remove the two bootstrap secrets from the staging Worker.

## Alternative production configuration

Deploy the Worker and Container from the same reviewed release. Apply D1 migrations
before the Worker deployment and never run the demo seed in production. Required settings:

| Setting | Production value |
| --- | --- |
| `NODE_ENV` | `production` |
| `PUBLIC_ORIGIN` | Exact HTTPS portal origin |
| `D1_BINDING_ORIGIN` | Internal hostname intercepted by the Worker and backed by the dedicated D1 binding |
| `RATE_LIMIT_BACKEND` | `memory` only behind the trusted Durable Object edge limiter |
| `STORAGE_MODE` | `r2-binding` in the Cloudflare Container deployment |
| `FILE_KEY_PROVIDER` | `cloudflare-secret` with a versioned `FILE_KEY_RING` |
| `SCANNER_MODE` | `clamav` |
| `CLAMAV_HOST`, `CLAMAV_PORT` | `127.0.0.1:3310` inside the private container |
| `EMAIL_PROVIDER` | `resend` |
| `RESEND_API_KEY` | Restricted send-only key from the secret manager |
| `EMAIL_FROM` | Address on a verified Bitwise Security sending domain |
| `MFA_ENCRYPTION_KEY`, `SESSION_PEPPER` | Independent random secrets from the secret manager |

Do not put production secrets in `.env`, Compose, GitHub variables visible to
untrusted jobs, container layers, or Cloudflare Pages. Rotate the Resend key after
initial setup and immediately after any suspected exposure.

### Resend

The production provider calls `POST https://api.resend.com/emails` with a 15-second
timeout and an outbox-derived idempotency key. Configure and verify the
`bitwise-security.nl` sending domain in Resend, then store a newly created restricted
API key as `RESEND_API_KEY`. Delivery failures are reduced to error codes; response
bodies and credentials are not logged. Mailpit/SMTP is only a local-development path.

### Object storage and browser uploads

- Use a dedicated bucket with no public access, no website hosting, and no sharing
  with the public-site deployment identity.
- R2 is never public and has no browser CORS policy. Encrypted chunks travel through
  the authenticated portal API to a private Worker binding; the container has no R2
  credential and reaches the binding only through an internal outbound handler.
- Apply a bucket lifecycle rule to abort incomplete multipart uploads after one day.
- Storage credentials must be restricted to this one bucket and prefix. The API
  permits only exact authenticated multipart operations; downloads never use public
  object URLs.

### Malware scanner

ClamAV must be reachable only from the worker. Set its `StreamMaxLength` to at least
`2147483648` bytes and size timeouts/memory for a 2 GB stream. Keep signatures updated,
monitor update age, and fail closed: files remain quarantined if scanning fails. A scan
left in progress by a crashed worker is reclaimed after two hours; alert on scans
approaching that lease so two workers never process one healthy long-running scan.

### File-key rotation

Each file has a random AES-256 data-encryption key. The Cloudflare secret binding holds
a versioned JSON wrapping-key ring; the database stores the version used for each
wrapped file key. Add a new key, make it current for new files, rewrap existing data
keys in a controlled verified job, and remove the old version only after every affected
file is verified. Removing a key version early makes those files unreadable. A service
compromise can access the wrapping ring, so this is envelope encryption, not HSM-backed
zero knowledge.

### Network and TLS

TLS terminates at the Cloudflare Worker and HSTS is returned on every response. The
Container is reachable only through its Worker binding, which replaces spoofable
forwarding headers with `CF-Connecting-IP`. Container egress is allowlisted to the
internal D1 and R2 virtual hosts, Resend, and ClamAV updates. Keep the
portal on a separate hostname from the marketing site to preserve cookie and CSP
boundaries.

## Verification

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

Docker integration verification:

1. Run `docker compose up --build`; migrations and the seed must finish once.
2. Sign in as each demo client and verify neither can list, rename, delete, resume,
   or download the other client's file when an object UUID is substituted.
3. Upload a supported file, interrupt it, resume it, and confirm progress continues.
4. Upload a renamed executable/archive and confirm magic-byte validation rejects it.
5. Configure a real test ClamAV and upload the EICAR test file; it must never become
   downloadable.
6. Reuse a download ticket and expect `404`; wait more than 60 seconds and expect the
   same result.
7. Omit or alter `X-CSRF-Token` on a mutation and expect `403`.
8. Fail login five times and confirm lockout; verify the response remains generic.
9. Inspect production cookies and headers for `Secure`, `HttpOnly`, `SameSite=Strict`,
   HSTS, CSP, frame denial, `nosniff`, and `no-store`.
10. Attempt `UPDATE` or `DELETE` on `audit_events` as the application role; the
    append-only trigger must reject it.

## Operations checklist

- D1 Time Travel/backup recovery drills and private, authenticated Redis where used.
- Alerts for lockouts, MFA resets, scanner/update failures, outbox failures, and audit
  write failures.
- Expiry worker and abandoned-upload cleanup running continuously.
- Retention policy and deletion expectations agreed with clients; backup retention is
  disclosed because deleting live data does not instantly purge immutable backups.
- Dependency and container scanning in CI; reviewed lockfile updates.
- Incident runbook covering session revocation, credential/key rotation, affected-file
  analysis, and client notification.
- Cloudflare Access must not be added in a way that makes client onboarding confusing;
  if used, test the full invitation/reset/MFA flow with nontechnical users.
