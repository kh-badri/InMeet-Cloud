#!/usr/bin/env bash
set -euo pipefail

# Backup Script for BackupVault Metadata Database
# Usage: ./backup-db.sh [/target/backup/directory]

BACKUP_DIR="${1:-/var/backupvault/db-backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/backupvault_db_${TIMESTAMP}.sql.gz"

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-backupvault_db}"
DB_USER="${DB_USER:-backupvault}"

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting PostgreSQL metadata backup for ${DB_NAME}..."

PGPASSWORD="${PGPASSWORD:-backupvault_secret}" pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  --clean --if-exists --no-owner --no-privileges | gzip -9 > "${BACKUP_FILE}"

chmod 600 "${BACKUP_FILE}"

FILE_SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup successfully created: ${BACKUP_FILE} (${FILE_SIZE})"

# Retain last 14 days of database metadata dumps
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Cleaning up local DB dumps older than 14 days..."
find "${BACKUP_DIR}" -name "backupvault_db_*.sql.gz" -type f -mtime +14 -delete

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup job finished successfully."
