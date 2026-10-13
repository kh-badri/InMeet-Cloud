-- 005_drive_trash_schema.sql
-- Add trash and quarantine lifecycle columns to drive_items
ALTER TABLE drive_items ADD COLUMN IF NOT EXISTS is_trashed BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE drive_items ADD COLUMN IF NOT EXISTS trashed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_drive_items_trashed ON drive_items(user_id, is_trashed);
