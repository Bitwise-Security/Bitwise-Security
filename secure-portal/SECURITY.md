# Security architecture and self-review

## Trust boundaries and data flow

The browser talks only to the portal origin. Authentication, authorization, upload
coordination, and decrypted download streaming pass through the API. The browser
encrypts each upload chunk with a server-issued per-file key before sending it to
private object storage. The background worker reads encrypted chunks, unwraps the
file key through the versioned Worker secret ring, decrypts into a stream, verifies magic bytes, scans the stream,
and marks the file available only after all checks pass.

This is **not zero knowledge**: the API returns the file data key to an authenticated
uploader for browser encryption, and the worker/API can unwrap it for scanning and
downloads. That is required for malware scanning, policy enforcement, and usable
account recovery. Browser encryption reduces exposure to storage compromise but does
not protect against a compromised portal service or malicious frontend release.

```text
Browser --TLS--> Cloudflare Worker --> private Container --> internal D1 binding
                        |                 |       |
                        |                 |       +--> local ClamAV
                        |                 +----------> Resend (edge-injected credential)
                        +--> Durable Object limiter
                        +--> private R2 binding <---- encrypted chunk stream
```

## Data model

| Entity | Purpose and isolation key |
| --- | --- |
| `organizations` | Top-level tenant; current release seeds one Bitwise organization |
| `users` | Email, Argon2id hash, status, lockout counters |
| `organization_memberships` | User role (`ADMIN` or `CLIENT`) within an organization |
| `client_spaces` | One client-facing area, always keyed by `organization_id` |
| `space_memberships` | Explicit client access to a space |
| `mfa_credentials`, `mfa_recovery_codes` | Encrypted TOTP secret, replay counter, hashed single-use codes |
| `sessions` | Opaque hashed session and CSRF material, idle/absolute expiry, revocation |
| `invitations`, `password_reset_tokens`, `mfa_enrollment_sessions` | Hashed one-time capabilities with expiry/consumption |
| `files` | Tenant/space/uploader/direction, private storage key, wrapped DEK, status, expiry |
| `upload_sessions`, `upload_parts` | Creator-bound multipart state and confirmed part metadata |
| `download_tickets` | User-bound, hashed, 60-second, single-use capability |
| `secure_transfers` | Admin-created, seven-day password-gated delivery; hashed link token and Argon2id password only |
| `secure_transfer_download_tickets` | Hashed, 60-second, single-use public-download capability after password verification |
| `audit_events` | Append-only actor/action/target/outcome/IP/user-agent/metadata ledger |
| `notification_outbox` | Retryable mail without putting secrets or file contents into messages |

Every object query includes the authenticated organization and either the admin role
or an explicit space membership. Object UUIDs are identifiers, never authorization.

## API design

| Area | Endpoints |
| --- | --- |
| Authentication | `/api/v1/auth/login`, `/mfa`, `/logout`, `/me`, invitation, MFA enrolment, password-reset request/confirm |
| Administration | `/api/v1/admin/clients`, client status/MFA reset, paginated `/api/v1/admin/audit-events` |
| Spaces | `/api/v1/spaces`, `/api/v1/spaces/:id/files`, admin creation, deletion summary, permanent deletion |
| Upload | create under a space, resume state, exact-part URL, confirm part, complete, abort |
| File management | `PATCH /api/v1/files/:id`, `DELETE /api/v1/files/:id` |
| Download | create authenticated ticket, then consume it once at `/api/v1/downloads/:ticket` |
| Password-protected delivery | unlock with separate link token + password, then consume a 60-second single-use ticket |

All state-changing authenticated endpoints require the session cookie, exact trusted
origin, and synchronizer CSRF token. Zod validates JSON and route parameters. Upload
chunks pass through narrowly scoped internal R2 binding operations.

## Threat model

| Threat | Mitigation | Enforcement point |
| --- | --- | --- |
| Network interception | TLS 1.2+, HSTS, Secure cookies, private/authenticated origin | Cloudflare/origin and Helmet |
| Stolen password | Mandatory TOTP, recovery-code rotation, generic login responses | Auth routes and atomic D1 batches/CAS updates |
| Brute force / credential stuffing | Durable Object edge limits, secondary API limits, atomic account lockouts | Edge Worker, Fastify, `users` update |
| Session theft | Opaque hashed tokens, HttpOnly/Secure/Strict cookie, idle and absolute expiry, revocation | Session middleware and DB |
| Cross-site request forgery | Exact Origin checks plus synchronizer token | Global request hook and mutation handlers |
| IDOR / malicious client | Tenant + space membership predicates on every file/space/upload operation | Authorization SQL and route role checks |
| Public or replayed download URL | Auth-bound, hashed, signed, 60-second, one-use ticket; attachment-only response | Download route compare-and-set claim |
| Password-link theft or guessing | 256-bit link token plus separately delivered generated password, keyed token digest, Argon2id password hash, IP throttling, per-transfer lockout, seven-day hard expiry, revocation, and 60-second one-use download tickets | Edge limiter, secure-transfer routes, D1 compare-and-set updates |
| Object-storage disclosure | AES-256-GCM chunks, random per-file DEK, private R2 binding, versioned envelope encryption | Browser crypto, container/Worker binding |
| Ciphertext tampering/reordering | Per-chunk GCM tag and AAD containing file ID, part number, and length | Encrypt/decrypt helpers |
| Dangerous or disguised upload | Extension policy, magic-byte verification, quarantine, ClamAV hook, no inline serving | Create route, worker, download headers |
| Filename/path attack | Random storage keys, normalized display-only filenames, storage-root containment | Policy and local storage adapter |
| Token leakage | Keyed digests at rest, fragments in email links, request logging disabled, redacted structured logs | Auth/admin links, logger, token tables |
| Server/database compromise | Encrypted object bytes and wrapped DEKs; secrets remain in Worker bindings, not D1 | Container isolation, D1/R2 bindings, envelope encryption |
| Audit tampering | No update/delete code path plus database append-only trigger | Migration and audit service |
| Mail outage/duplication | Transactional outbox, retry schedule, Resend idempotency key | Worker and mail adapter |
| Expired/abandoned data | Worker deletes expired files and abandoned multipart uploads | Worker maintenance loop |
| Post-engagement data retention | Admin-only, CSRF-protected, rate-limited space deletion first revokes access, then removes R2 objects and cascaded D1 metadata; exact-name confirmation prevents accidental deletion | Admin routes, authorization SQL, R2 binding, D1 foreign keys |

Residual risk: a fully compromised API container can access the active wrapping-key
ring and can therefore read files. Isolation, constrained egress, deployment review,
logging, rotation, and rapid revocation reduce but do not remove that risk. True
end-to-end zero knowledge would prevent server-side malware scanning, admin recovery,
and convenient browser downloads and is not claimed here.

## Key management

- File contents use independent random 256-bit DEKs and AES-256-GCM per chunk.
- Production DEKs are wrapped under the current 256-bit key in a versioned Cloudflare
  secret ring with file/version-bound AES-GCM AAD. Only wrapped DEKs are persisted;
  plaintext key buffers are cleared after use.
- The wrapping-key version is stored per file. Old versions remain until a verified
  rewrap migration completes.
- TOTP secrets use AES-256-GCM under an independent secret-manager key. Rotate it using
  a dual-read/new-write migration; do not simply replace it or current MFA credentials
  become unusable.
- Passwords use Argon2id with 64 MiB memory, three iterations, one lane. One-time tokens,
  recovery codes, and session tokens are stored only as keyed/cryptographic digests.

## OWASP Top 10 (2021) self-review

| Category | Status |
| --- | --- |
| A01 Broken Access Control | Tenant and membership predicates, creator-bound uploads, role checks, CSRF, one-use auth-bound downloads; automated query/IDOR regression coverage |
| A02 Cryptographic Failures | TLS/HSTS deployment requirement, AES-256-GCM envelope encryption, Argon2id, random opaque tokens; backup encryption is an operator control |
| A03 Injection | Parameterized SQL, Zod validation, React output encoding, no shell execution; CSP adds containment |
| A04 Insecure Design | Explicit trust boundaries, deny-by-default object access, quarantine state machine, threat model; accountless delivery requires two separately shared credentials and never creates a bearer-only public URL |
| A05 Security Misconfiguration | Production refuses local storage/key, stub scanner, or SMTP; Helmet headers and private bucket guidance; final infrastructure review still required |
| A06 Vulnerable Components | Exact lockfile and pinned direct dependencies, audit/test gate; ongoing CI/container scanning remains operational work |
| A07 Identification and Authentication Failures | Argon2id, TOTP/recovery codes, lockout, shared throttling, session rotation/revocation, generic reset/login responses |
| A08 Software and Data Integrity Failures | AEAD/AAD integrity, magic-byte and malware checks, immutable audit trigger; signed releases/SBOM are recommended deployment additions |
| A09 Security Logging and Monitoring Failures | Append-only audit events for required activity; alerts, export retention, and SIEM integration remain operational work |
| A10 Server-Side Request Forgery | No user-controlled outbound URLs; production container egress is allowlisted to internal D1/R2, Resend, and ClamAV update hosts |

## Test scope and limitations

Automated tests cover cryptography/tamper rejection, TOTP replay, filename/path and
magic-byte policy, request origin/CSRF boundaries, security headers, D1 migrations,
secure-transfer credential storage, single-use ticket invariants, and authorization
query invariants. They do not replace full D1/R2 staging tests,
real ClamAV/Resend staging tests, infrastructure review, or an
independent penetration test. Complete those before production authorization.
