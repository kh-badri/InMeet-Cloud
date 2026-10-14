-- 006_team_users_quota.sql
-- Expand user roles to include 'user' (team member)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'viewer', 'user'));

-- Add storage quota column in bytes (default 15 GB = 16106127360 bytes for regular users, 0 = unlimited for admin)
ALTER TABLE users ADD COLUMN IF NOT EXISTS storage_quota_bytes BIGINT NOT NULL DEFAULT 16106127360;

-- Ensure administrator role has unlimited quota (0)
UPDATE users SET storage_quota_bytes = 0 WHERE role = 'admin';
