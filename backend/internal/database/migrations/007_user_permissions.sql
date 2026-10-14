-- 007_user_permissions.sql
-- Add granular permission checkboxes: can_view, can_edit, can_delete
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_edit BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_delete BOOLEAN NOT NULL DEFAULT true;

-- Update role check constraint to only 2 roles: 'admin' and 'user'
UPDATE users SET role = 'admin', can_view = true, can_edit = false, can_delete = false WHERE role = 'viewer';
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user'));
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'user';
