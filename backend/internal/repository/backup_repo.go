package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"backupvault/internal/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrBackupNotFound = errors.New("backup not found")
)

type BackupRepository struct {
	pool *pgxpool.Pool
}

func NewBackupRepository(pool *pgxpool.Pool) *BackupRepository {
	return &BackupRepository{pool: pool}
}

func (r *BackupRepository) Create(ctx context.Context, b *model.Backup) error {
	if b.ID == uuid.Nil {
		b.ID = uuid.New()
	}
	if b.UploadedAt.IsZero() {
		b.UploadedAt = time.Now()
	}
	if b.Tags == nil {
		b.Tags = []string{}
	}

	metaJSON, err := json.Marshal(b.Metadata)
	if err != nil {
		metaJSON = []byte("{}")
	}

	_, err = r.pool.Exec(ctx, `
		INSERT INTO backups (id, application_id, filename, storage_path, size_bytes, sha256, file_type, status, backup_date, uploaded_at, tags, metadata)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`, b.ID, b.ApplicationID, b.Filename, b.StoragePath, b.SizeBytes, b.SHA256, b.FileType, b.Status, b.BackupDate, b.UploadedAt, b.Tags, metaJSON)
	return err
}

func (r *BackupRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Backup, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT b.id, b.application_id, a.name AS app_name, b.filename, b.storage_path, b.size_bytes, b.sha256, b.file_type, b.status, b.backup_date, b.uploaded_at, b.quarantined_at, b.deleted_at, b.tags, b.metadata
		FROM backups b
		JOIN applications a ON a.id = b.application_id
		WHERE b.id = $1
	`, id)

	var b model.Backup
	var rawMeta []byte
	err := row.Scan(&b.ID, &b.ApplicationID, &b.ApplicationName, &b.Filename, &b.StoragePath, &b.SizeBytes, &b.SHA256, &b.FileType, &b.Status, &b.BackupDate, &b.UploadedAt, &b.QuarantinedAt, &b.DeletedAt, &b.Tags, &rawMeta)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrBackupNotFound
		}
		return nil, err
	}

	if len(rawMeta) > 0 {
		_ = json.Unmarshal(rawMeta, &b.Metadata)
	}
	return &b, nil
}

func (r *BackupRepository) GetVerifiedBySHA256(ctx context.Context, appID uuid.UUID, sha256 string) (*model.Backup, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT b.id, b.application_id, a.name AS app_name, b.filename, b.storage_path, b.size_bytes, b.sha256, b.file_type, b.status, b.backup_date, b.uploaded_at, b.quarantined_at, b.deleted_at, b.tags, b.metadata
		FROM backups b
		JOIN applications a ON a.id = b.application_id
		WHERE b.application_id = $1 AND b.sha256 = $2 AND b.status = 'verified'
		LIMIT 1
	`, appID, sha256)

	var b model.Backup
	var rawMeta []byte
	err := row.Scan(&b.ID, &b.ApplicationID, &b.ApplicationName, &b.Filename, &b.StoragePath, &b.SizeBytes, &b.SHA256, &b.FileType, &b.Status, &b.BackupDate, &b.UploadedAt, &b.QuarantinedAt, &b.DeletedAt, &b.Tags, &rawMeta)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrBackupNotFound
		}
		return nil, err
	}
	if len(rawMeta) > 0 {
		_ = json.Unmarshal(rawMeta, &b.Metadata)
	}
	return &b, nil
}

type BackupFilter struct {
	AppID    *uuid.UUID
	Status   string
	FileType string
	DateFrom *time.Time
	DateTo   *time.Time
	Query    string
	Limit    int
	Offset   int
}

func (r *BackupRepository) List(ctx context.Context, f BackupFilter) ([]model.Backup, int64, error) {
	if f.Limit <= 0 || f.Limit > 100 {
		f.Limit = 50
	}
	if f.Offset < 0 {
		f.Offset = 0
	}

	query := `FROM backups b JOIN applications a ON a.id = b.application_id WHERE 1=1`
	args := []interface{}{}
	argIdx := 1

	if f.AppID != nil {
		query += fmt.Sprintf(" AND b.application_id = $%d", argIdx)
		args = append(args, *f.AppID)
		argIdx++
	}
	if f.Status != "" {
		query += fmt.Sprintf(" AND b.status = $%d", argIdx)
		args = append(args, f.Status)
		argIdx++
	} else {
		// By default do not show hard deleted
		query += " AND b.status != 'deleted'"
	}
	if f.FileType != "" {
		query += fmt.Sprintf(" AND b.file_type = $%d", argIdx)
		args = append(args, f.FileType)
		argIdx++
	}
	if f.DateFrom != nil {
		query += fmt.Sprintf(" AND b.backup_date >= $%d", argIdx)
		args = append(args, *f.DateFrom)
		argIdx++
	}
	if f.DateTo != nil {
		query += fmt.Sprintf(" AND b.backup_date <= $%d", argIdx)
		args = append(args, *f.DateTo)
		argIdx++
	}
	if f.Query != "" {
		query += fmt.Sprintf(" AND (b.filename ILIKE '%%' || $%d || '%%' OR a.name ILIKE '%%' || $%d || '%%')", argIdx, argIdx)
		args = append(args, f.Query)
		argIdx++
	}

	var total int64
	countQuery := "SELECT COUNT(*) " + query
	err := r.pool.QueryRow(ctx, countQuery, args...).Scan(&total)
	if err != nil {
		return nil, 0, err
	}

	selectQuery := fmt.Sprintf(`
		SELECT b.id, b.application_id, a.name AS app_name, b.filename, b.storage_path, b.size_bytes, b.sha256, b.file_type, b.status, b.backup_date, b.uploaded_at, b.quarantined_at, b.deleted_at, b.tags, b.metadata
		%s
		ORDER BY b.backup_date DESC, b.uploaded_at DESC
		LIMIT $%d OFFSET $%d
	`, query, argIdx, argIdx+1)

	args = append(args, f.Limit, f.Offset)

	rows, err := r.pool.Query(ctx, selectQuery, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var backups []model.Backup
	for rows.Next() {
		var b model.Backup
		var rawMeta []byte
		err := rows.Scan(&b.ID, &b.ApplicationID, &b.ApplicationName, &b.Filename, &b.StoragePath, &b.SizeBytes, &b.SHA256, &b.FileType, &b.Status, &b.BackupDate, &b.UploadedAt, &b.QuarantinedAt, &b.DeletedAt, &b.Tags, &rawMeta)
		if err != nil {
			return nil, 0, err
		}
		if len(rawMeta) > 0 {
			_ = json.Unmarshal(rawMeta, &b.Metadata)
		}
		backups = append(backups, b)
	}

	return backups, total, nil
}

func (r *BackupRepository) Quarantine(ctx context.Context, id uuid.UUID) error {
	now := time.Now()
	res, err := r.pool.Exec(ctx, `
		UPDATE backups SET status = 'quarantined', quarantined_at = $1 WHERE id = $2 AND status = 'verified'
	`, now, id)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrBackupNotFound
	}
	return nil
}

func (r *BackupRepository) MarkDeleted(ctx context.Context, id uuid.UUID) error {
	now := time.Now()
	res, err := r.pool.Exec(ctx, `
		UPDATE backups SET status = 'deleted', deleted_at = $1 WHERE id = $2
	`, now, id)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrBackupNotFound
	}
	return nil
}

func (r *BackupRepository) GetStats(ctx context.Context, days int) (*model.StatsSummary, error) {
	summary := &model.StatsSummary{
		DailyStats: []model.DailyStatPoint{},
	}

	// 1. Total verified backups and size
	_ = r.pool.QueryRow(ctx, `
		SELECT COALESCE(COUNT(*), 0), COALESCE(SUM(size_bytes), 0)
		FROM backups WHERE status = 'verified'
	`).Scan(&summary.TotalBackups, &summary.TotalSizeBytes)

	// 2. Today backups count
	_ = r.pool.QueryRow(ctx, `
		SELECT COALESCE(COUNT(*), 0)
		FROM backups WHERE status = 'verified' AND backup_date = CURRENT_DATE
	`).Scan(&summary.TodayBackups)

	// 3. Active apps count and today status
	_ = r.pool.QueryRow(ctx, `
		SELECT COALESCE(COUNT(*), 0) FROM applications WHERE is_active = true
	`).Scan(&summary.ActiveAppsCount)

	_ = r.pool.QueryRow(ctx, `
		SELECT COALESCE(COUNT(DISTINCT application_id), 0)
		FROM backups WHERE status = 'verified' AND backup_date = CURRENT_DATE
	`).Scan(&summary.AppsWithBackupToday)

	// 4. Missing apps list for today
	rows, err := r.pool.Query(ctx, `
		SELECT name FROM applications
		WHERE is_active = true AND id NOT IN (
			SELECT DISTINCT application_id FROM backups
			WHERE status = 'verified' AND backup_date = CURRENT_DATE
		)
		ORDER BY name ASC
	`)
	if err == nil {
		defer rows.Close()
		for rows.Next() {
			var appName string
			if err := rows.Scan(&appName); err == nil {
				summary.AppsMissingToday = append(summary.AppsMissingToday, appName)
			}
		}
	}

	// 5. Daily trend for past N days
	if days <= 0 {
		days = 30
	}
	trendRows, err := r.pool.Query(ctx, `
		SELECT TO_CHAR(d.day, 'YYYY-MM-DD') AS day_str,
		       COALESCE(SUM(b.size_bytes), 0) AS daily_bytes,
		       COALESCE(COUNT(b.id), 0) AS daily_count
		FROM (
			SELECT generate_series(CURRENT_DATE - INTERVAL '1 day' * ($1 - 1), CURRENT_DATE, '1 day'::interval)::date AS day
		) d
		LEFT JOIN backups b ON b.backup_date = d.day AND b.status = 'verified'
		GROUP BY d.day
		ORDER BY d.day ASC
	`, days)
	if err == nil {
		defer trendRows.Close()
		for trendRows.Next() {
			var p model.DailyStatPoint
			if err := trendRows.Scan(&p.Date, &p.TotalBytes, &p.Count); err == nil {
				summary.DailyStats = append(summary.DailyStats, p)
			}
		}
	}

	return summary, nil
}
