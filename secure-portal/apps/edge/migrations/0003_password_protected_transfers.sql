CREATE TABLE secure_transfers (
  id TEXT PRIMARY KEY,
  file_id TEXT NOT NULL UNIQUE REFERENCES files(id) ON DELETE CASCADE,
  created_by TEXT NOT NULL REFERENCES users(id),
  token_digest TEXT NOT NULL UNIQUE CHECK (length(token_digest) = 64),
  password_hash TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'PENDING_SCAN'
    CHECK (status IN ('PENDING_SCAN', 'ACTIVE', 'REVOKED', 'EXPIRED')),
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until INTEGER,
  download_count INTEGER NOT NULL DEFAULT 0 CHECK (download_count >= 0),
  last_download_at INTEGER,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
) STRICT;

CREATE INDEX secure_transfers_expiry_idx
  ON secure_transfers(expires_at)
  WHERE status IN ('PENDING_SCAN', 'ACTIVE');

CREATE TABLE secure_transfer_download_tickets (
  id TEXT PRIMARY KEY,
  transfer_id TEXT NOT NULL REFERENCES secure_transfers(id) ON DELETE CASCADE,
  token_digest TEXT NOT NULL UNIQUE CHECK (length(token_digest) = 64),
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
) STRICT;

CREATE INDEX secure_transfer_download_tickets_expiry_idx
  ON secure_transfer_download_tickets(expires_at)
  WHERE consumed_at IS NULL;
