-- Migration 009: Allow cascading delete from applications to backups
ALTER TABLE backups DROP CONSTRAINT IF EXISTS backups_application_id_fkey;
ALTER TABLE backups ADD CONSTRAINT backups_application_id_fkey FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE;
