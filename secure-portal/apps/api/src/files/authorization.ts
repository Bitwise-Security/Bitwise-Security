import type { AuthContext } from "../types.js";
import { getPool } from "../db.js";

export interface AuthorizedFile {
  id: string;
  organization_id: string;
  space_id: string;
  uploader_user_id: string;
  direction: "CLIENT_TO_ADMIN" | "ADMIN_TO_CLIENT";
  display_name: string;
  storage_key: string;
  declared_content_type: string;
  detected_content_type: string | null;
  plaintext_size: string;
  ciphertext_size: string | null;
  status: string;
  chunk_size: number;
  chunk_count: number;
  nonce_prefix: Buffer;
  wrapped_dek: Buffer;
  key_version: string;
  expires_at: Date | null;
}

export const FILE_ACCESS_SQL = `SELECT f.* FROM files f
     WHERE f.id = $2 AND f.organization_id = $1 AND f.deleted_at IS NULL
       AND (
         $3 = 'ADMIN'
         OR EXISTS (
           SELECT 1 FROM space_memberships sm
           WHERE sm.space_id = f.space_id AND sm.user_id = $4
         )
       )`;

export async function findAuthorizedFile(
  auth: AuthContext,
  fileId: string,
): Promise<AuthorizedFile | null> {
  const result = await getPool().query<AuthorizedFile>(
    FILE_ACCESS_SQL,
    [auth.organizationId, fileId, auth.role, auth.userId],
  );
  return result.rows[0] ?? null;
}

export async function canAccessSpace(auth: AuthContext, spaceId: string): Promise<boolean> {
  const result = await getPool().query(
    `SELECT 1 FROM client_spaces cs
     WHERE cs.id = $2 AND cs.organization_id = $1 AND cs.archived_at IS NULL
       AND ($3 = 'ADMIN' OR EXISTS (
         SELECT 1 FROM space_memberships sm WHERE sm.space_id = cs.id AND sm.user_id = $4
       ))`,
    [auth.organizationId, spaceId, auth.role, auth.userId],
  );
  return result.rowCount === 1;
}
