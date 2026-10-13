-- 004_drive_upload_chunks_array.sql
ALTER TABLE drive_upload_sessions ADD COLUMN IF NOT EXISTS uploaded_chunks INT[] NOT NULL DEFAULT '{}';
