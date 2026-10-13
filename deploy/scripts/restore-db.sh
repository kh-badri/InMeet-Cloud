#!/usr/bin/env bash
set -euo pipefail

# Restore Script for BackupVault Metadata Database
# Usage: ./restore-db.sh /path/to/backupvault_db_YYYYMMDD_HHMMSS.sql.gz

if [ $# -lt 1 ]; then
  echo "Usage: $0 <path_to_backup_file.sql.gz>"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "Error: Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

DB_HOST="${DB_HOST:-127.0.0.1}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:-backupvault_db}"
DB_USER="${DB_USER:-backupvault}"

echo "==========================================================="
echo "  PERINGATAN: RESTORE DATABASE METADATA BACKUPVAULT"
echo "==========================================================="
echo "Target Database : ${DB_NAME} on ${DB_HOST}:${DB_PORT}"
echo "Source File     : ${BACKUP_FILE}"
echo ""
read -p "Apakah Anda yakin ingin menimpa database dengan file ini? (ketik 'RESTORE' untuk lanjut): " CONFIRM

if [ "${CONFIRM}" != "RESTORE" ]; then
  echo "Restore dibatalkan."
  exit 0
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Memulai proses restore..."

gunzip -c "${BACKUP_FILE}" | PGPASSWORD="${PGPASSWORD:-backupvault_secret}" psql \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Restore database selesai dengan sukses!"
