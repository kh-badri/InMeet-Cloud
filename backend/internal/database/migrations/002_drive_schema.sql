-- 002_drive_schema.sql
-- Drive storage items table (files and folders)
CREATE TABLE IF NOT EXISTS drive_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES drive_items(id) ON DELETE CASCADE,
    name VARCHAR(512) NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('file', 'folder')),
    size_bytes BIGINT NOT NULL DEFAULT 0,
    mime_type VARCHAR(255) NOT NULL DEFAULT 'application/octet-stream',
    storage_path TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_drive_items_user_parent ON drive_items(user_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_drive_items_name ON drive_items(name);
CREATE INDEX IF NOT EXISTS idx_drive_items_type ON drive_items(type);
CREATE INDEX IF NOT EXISTS idx_drive_items_created ON drive_items(created_at DESC);
