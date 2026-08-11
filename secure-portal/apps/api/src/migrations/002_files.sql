DO $$ BEGIN
  CREATE TYPE file_direction AS ENUM ('CLIENT_TO_ADMIN', 'ADMIN_TO_CLIENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE file_status AS ENUM (
    'UPLOADING', 'QUARANTINED', 'SCANNING', 'AVAILABLE', 'REJECTED', 'DELETED', 'EXPIRED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  space_id uuid NOT NULL REFERENCES client_spaces(id) ON DELETE CASCADE,
  uploader_user_id uuid NOT NULL REFERENCES users(id),
  direction file_direction NOT NULL,
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 255),
  storage_key text NOT NULL UNIQUE CHECK (char_length(storage_key) BETWEEN 20 AND 300),
  declared_content_type text NOT NULL CHECK (char_length(declared_content_type) BETWEEN 1 AND 200),
  detected_content_type text,
  plaintext_size bigint NOT NULL CHECK (plaintext_size >= 1 AND plaintext_size <= 2147483648),
  ciphertext_size bigint,
  plaintext_sha256 char(64),
  status file_status NOT NULL DEFAULT 'UPLOADING',
  rejection_code text,
  chunk_size integer NOT NULL CHECK (chunk_size >= 5242880),
  chunk_count integer NOT NULL CHECK (chunk_count >= 1 AND chunk_count <= 10000),
  nonce_prefix bytea NOT NULL CHECK (octet_length(nonce_prefix) = 8),
  wrapped_dek bytea NOT NULL,
  key_provider text NOT NULL,
  key_version text NOT NULL,
  expires_at timestamptz,
  scan_started_at timestamptz,
  scan_completed_at timestamptz,
  scan_attempts integer NOT NULL DEFAULT 0 CHECK (scan_attempts >= 0),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS files_space_status_created_idx
  ON files(space_id, status, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS files_expiry_idx
  ON files(expires_at) WHERE status = 'AVAILABLE' AND expires_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS upload_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id uuid NOT NULL UNIQUE REFERENCES files(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES users(id),
  storage_upload_id text NOT NULL,
  state text NOT NULL DEFAULT 'OPEN' CHECK (state IN ('OPEN', 'COMPLETING', 'COMPLETED', 'ABORTED', 'EXPIRED')),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS upload_parts (
  upload_session_id uuid NOT NULL REFERENCES upload_sessions(id) ON DELETE CASCADE,
  part_number integer NOT NULL CHECK (part_number BETWEEN 1 AND 10000),
  ciphertext_size integer NOT NULL CHECK (ciphertext_size > 16),
  etag text NOT NULL CHECK (char_length(etag) BETWEEN 1 AND 300),
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (upload_session_id, part_number)
);

CREATE TABLE IF NOT EXISTS download_tickets (
  id uuid PRIMARY KEY,
  file_id uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_digest char(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS download_tickets_expiry_idx
  ON download_tickets(expires_at) WHERE consumed_at IS NULL;
