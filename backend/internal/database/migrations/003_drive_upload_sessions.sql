-- 003_drive_upload_sessions.sql
CREATE TABLE IF NOT EXISTS drive_upload_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES drive_items(id) ON DELETE SET NULL,
    filename VARCHAR(512) NOT NULL,
    relative_path TEXT NOT NULL DEFAULT '',
    total_bytes BIGINT NOT NULL,
    uploaded_bytes BIGINT NOT NULL DEFAULT 0,
    chunk_size INT NOT NULL,
    total_chunks INT NOT NULL,
    last_chunk_index INT NOT NULL DEFAULT -1,
    mime_type VARCHAR(255) NOT NULL DEFAULT 'application/octet-stream',
    temp_path TEXT NOT NULL DEFAULT '',
    status VARCHAR(50) NOT NULL DEFAULT 'in_progress',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_drive_upload_sessions_user ON drive_upload_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_drive_upload_sessions_updated ON drive_upload_sessions(updated_at DESC);
