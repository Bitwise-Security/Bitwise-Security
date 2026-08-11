-- The first release intentionally supports one administrator. Remove this
-- index as part of the future multi-admin feature and its authorization review.
CREATE UNIQUE INDEX IF NOT EXISTS one_initial_admin_idx
ON organization_memberships(role)
WHERE role = 'ADMIN';
