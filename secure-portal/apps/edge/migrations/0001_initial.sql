PRAGMA foreign_keys = ON;

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
) STRICT;

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 160),
  password_hash TEXT,
  status TEXT NOT NULL DEFAULT 'INVITED' CHECK (status IN ('INVITED', 'PENDING_MFA', 'ACTIVE', 'DISABLED')),
  failed_login_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_login_count >= 0),
  locked_until INTEGER,
  last_login_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
) STRICT;

CREATE TABLE organization_memberships (
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('ADMIN', 'CLIENT')),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (organization_id, user_id)
) STRICT;

CREATE TABLE client_spaces (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  archived_at INTEGER
) STRICT;

CREATE TABLE space_memberships (
  space_id TEXT NOT NULL REFERENCES client_spaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (space_id, user_id)
) STRICT;

CREATE TABLE mfa_credentials (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  encrypted_secret TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  last_used_step INTEGER,
  confirmed_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
) STRICT;

CREATE TABLE mfa_recovery_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
) STRICT;

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_digest TEXT NOT NULL UNIQUE CHECK (length(token_digest) = 64),
  csrf_digest TEXT CHECK (csrf_digest IS NULL OR length(csrf_digest) = 64),
  ip_address TEXT,
  user_agent TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  last_seen_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  idle_expires_at INTEGER NOT NULL,
  absolute_expires_at INTEGER NOT NULL,
  revoked_at INTEGER
) STRICT;

CREATE INDEX sessions_user_active_idx ON sessions(user_id, absolute_expires_at) WHERE revoked_at IS NULL;

CREATE TABLE auth_challenges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_digest TEXT NOT NULL UNIQUE CHECK (length(token_digest) = 64),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
) STRICT;

CREATE TABLE mfa_enrollment_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invitation_id TEXT REFERENCES client_invitations(id) ON DELETE SET NULL,
  token_digest TEXT NOT NULL UNIQUE CHECK (length(token_digest) = 64),
  encrypted_secret TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
) STRICT;

CREATE TABLE client_invitations (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  space_id TEXT NOT NULL REFERENCES client_spaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invited_by TEXT NOT NULL REFERENCES users(id),
  token_digest TEXT NOT NULL UNIQUE CHECK (length(token_digest) = 64),
  expires_at INTEGER NOT NULL,
  enrollment_started_at INTEGER,
  accepted_at INTEGER,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
) STRICT;

CREATE TABLE password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_digest TEXT NOT NULL UNIQUE CHECK (length(token_digest) = 64),
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
) STRICT;

CREATE TABLE audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id TEXT REFERENCES organizations(id) ON DELETE SET NULL,
  actor_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (length(action) BETWEEN 1 AND 100),
  target_type TEXT CHECK (target_type IS NULL OR length(target_type) <= 80),
  target_id TEXT,
  outcome TEXT NOT NULL CHECK (outcome IN ('SUCCESS', 'FAILURE')),
  ip_address TEXT,
  user_agent TEXT,
  metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata)),
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
) STRICT;

CREATE INDEX audit_events_org_created_idx ON audit_events(organization_id, created_at DESC);
CREATE INDEX audit_events_actor_created_idx ON audit_events(actor_user_id, created_at DESC);

CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events are append-only');
END;

CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events are append-only');
END;

CREATE TABLE notification_outbox (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (length(kind) BETWEEN 1 AND 80),
  recipient_email TEXT NOT NULL COLLATE NOCASE,
  subject TEXT NOT NULL,
  text_body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  sent_at INTEGER,
  last_error_code TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
) STRICT;

CREATE TABLE files (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  space_id TEXT NOT NULL REFERENCES client_spaces(id) ON DELETE CASCADE,
  uploader_user_id TEXT NOT NULL REFERENCES users(id),
  direction TEXT NOT NULL CHECK (direction IN ('CLIENT_TO_ADMIN', 'ADMIN_TO_CLIENT')),
  display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 1 AND 255),
  storage_key TEXT NOT NULL UNIQUE CHECK (length(storage_key) BETWEEN 20 AND 300),
  declared_content_type TEXT NOT NULL CHECK (length(declared_content_type) BETWEEN 1 AND 200),
  detected_content_type TEXT,
  plaintext_size INTEGER NOT NULL CHECK (plaintext_size BETWEEN 1 AND 2147483648),
  ciphertext_size INTEGER,
  plaintext_sha256 TEXT CHECK (plaintext_sha256 IS NULL OR length(plaintext_sha256) = 64),
  status TEXT NOT NULL DEFAULT 'UPLOADING' CHECK (status IN ('UPLOADING', 'QUARANTINED', 'SCANNING', 'AVAILABLE', 'REJECTED', 'DELETED', 'EXPIRED')),
  rejection_code TEXT,
  chunk_size INTEGER NOT NULL CHECK (chunk_size >= 5242880),
  chunk_count INTEGER NOT NULL CHECK (chunk_count BETWEEN 1 AND 10000),
  nonce_prefix BLOB NOT NULL CHECK (length(nonce_prefix) = 8),
  wrapped_dek BLOB NOT NULL,
  key_provider TEXT NOT NULL,
  key_version TEXT NOT NULL,
  expires_at INTEGER,
  scan_started_at INTEGER,
  scan_completed_at INTEGER,
  scan_attempts INTEGER NOT NULL DEFAULT 0 CHECK (scan_attempts >= 0),
  deleted_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
) STRICT;

CREATE INDEX files_space_status_created_idx ON files(space_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX files_expiry_idx ON files(expires_at) WHERE status = 'AVAILABLE' AND expires_at IS NOT NULL;

CREATE TABLE upload_sessions (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL UNIQUE REFERENCES files(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  storage_upload_id TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN', 'COMPLETING', 'COMPLETED', 'ABORTED', 'EXPIRED')),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  completed_at INTEGER
) STRICT;

CREATE TABLE upload_parts (
  upload_session_id TEXT NOT NULL REFERENCES upload_sessions(id) ON DELETE CASCADE,
  part_number INTEGER NOT NULL CHECK (part_number BETWEEN 1 AND 10000),
  ciphertext_size INTEGER NOT NULL CHECK (ciphertext_size > 16),
  etag TEXT NOT NULL CHECK (length(etag) BETWEEN 1 AND 300),
  confirmed_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (upload_session_id, part_number)
) STRICT;

CREATE TABLE download_tickets (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_digest TEXT NOT NULL UNIQUE CHECK (length(token_digest) = 64),
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
) STRICT;

CREATE INDEX download_tickets_expiry_idx ON download_tickets(expires_at) WHERE consumed_at IS NULL;
