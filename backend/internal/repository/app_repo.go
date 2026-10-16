package repository

import (
	"context"
	"errors"
	"fmt"
	"time"

	"backupvault/internal/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrAppNotFound      = errors.New("application not found")
	ErrAppNameDuplicate = errors.New("application with this name already exists")
)

type AppRepository struct {
	pool *pgxpool.Pool
}

func NewAppRepository(pool *pgxpool.Pool) *AppRepository {
	return &AppRepository{pool: pool}
}

func (r *AppRepository) Create(ctx context.Context, app *model.Application) error {
	if app.ID == uuid.Nil {
		app.ID = uuid.New()
	}
	now := time.Now()
	app.CreatedAt = now
	app.UpdatedAt = now

	_, err := r.pool.Exec(ctx, `
		INSERT INTO applications (id, name, display_name, description, retention_days, min_keep, is_active, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, app.ID, app.Name, app.DisplayName, app.Description, app.RetentionDays, app.MinKeep, app.IsActive, app.CreatedAt, app.UpdatedAt)
	if err != nil {
		if stringsContains(err.Error(), "duplicate key") || stringsContains(err.Error(), "unique constraint") {
			return ErrAppNameDuplicate
		}
		return err
	}
	return nil
}

func (r *AppRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.Application, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, name, display_name, description, retention_days, min_keep, is_active, created_at, updated_at
		FROM applications
		WHERE id = $1
	`, id)

	var app model.Application
	err := row.Scan(&app.ID, &app.Name, &app.DisplayName, &app.Description, &app.RetentionDays, &app.MinKeep, &app.IsActive, &app.CreatedAt, &app.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAppNotFound
		}
		return nil, err
	}
	return &app, nil
}

func (r *AppRepository) GetByName(ctx context.Context, name string) (*model.Application, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, name, display_name, description, retention_days, min_keep, is_active, created_at, updated_at
		FROM applications
		WHERE LOWER(name) = LOWER($1)
	`, name)

	var app model.Application
	err := row.Scan(&app.ID, &app.Name, &app.DisplayName, &app.Description, &app.RetentionDays, &app.MinKeep, &app.IsActive, &app.CreatedAt, &app.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAppNotFound
		}
		return nil, err
	}
	return &app, nil
}

func (r *AppRepository) List(ctx context.Context) ([]model.Application, error) {
	query := `
		SELECT 
			a.id, a.name, a.display_name, a.description, a.retention_days, a.min_keep, a.is_active, a.created_at, a.updated_at,
			COALESCE(COUNT(b.id) FILTER (WHERE b.status = 'verified'), 0) AS total_backups,
			COALESCE(SUM(b.size_bytes) FILTER (WHERE b.status = 'verified'), 0) AS total_bytes,
			EXISTS(
				SELECT 1 FROM backups b2 
				WHERE b2.application_id = a.id 
				AND b2.status = 'verified' 
				AND b2.backup_date = CURRENT_DATE
			) AS has_today_backup,
			MAX(b.uploaded_at) FILTER (WHERE b.status = 'verified') AS last_backup_at
		FROM applications a
		LEFT JOIN backups b ON b.application_id = a.id
		GROUP BY a.id
		ORDER BY a.name ASC
	`

	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var apps []model.Application
	for rows.Next() {
		var a model.Application
		err := rows.Scan(
			&a.ID, &a.Name, &a.DisplayName, &a.Description, &a.RetentionDays, &a.MinKeep, &a.IsActive, &a.CreatedAt, &a.UpdatedAt,
			&a.TotalBackups, &a.TotalBytes, &a.HasTodayBackup, &a.LastBackupAt,
		)
		if err != nil {
			return nil, err
		}
		apps = append(apps, a)
	}
	return apps, nil
}

func (r *AppRepository) Update(ctx context.Context, app *model.Application) error {
	app.UpdatedAt = time.Now()
	res, err := r.pool.Exec(ctx, `
		UPDATE applications
		SET name = $1, display_name = $2, description = $3, retention_days = $4, min_keep = $5, is_active = $6, updated_at = $7
		WHERE id = $8
	`, app.Name, app.DisplayName, app.Description, app.RetentionDays, app.MinKeep, app.IsActive, app.UpdatedAt, app.ID)
	if err != nil {
		if stringsContains(err.Error(), "duplicate key") || stringsContains(err.Error(), "unique constraint") {
			return ErrAppNameDuplicate
		}
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrAppNotFound
	}
	return nil
}

func (r *AppRepository) CountActiveBackups(ctx context.Context, id uuid.UUID) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, `SELECT COUNT(*) FROM backups WHERE application_id = $1 AND status = 'verified'`, id).Scan(&count)
	if err != nil {
		return 0, err
	}
	return count, nil
}

func (r *AppRepository) GetBackupStoragePaths(ctx context.Context, appID uuid.UUID) ([]string, error) {
	rows, err := r.pool.Query(ctx, `SELECT storage_path FROM backups WHERE application_id = $1`, appID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var paths []string
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err == nil && p != "" {
			paths = append(paths, p)
		}
	}
	return paths, nil
}

func (r *AppRepository) Delete(ctx context.Context, id uuid.UUID) error {
	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// Clean up any remaining backup records (deleted / quarantined tombstones)
	_, _ = tx.Exec(ctx, `DELETE FROM backups WHERE application_id = $1`, id)

	res, err := tx.Exec(ctx, `DELETE FROM applications WHERE id = $1`, id)
	if err != nil {
		return fmt.Errorf("gagal menghapus aplikasi: %w", err)
	}
	if res.RowsAffected() == 0 {
		return ErrAppNotFound
	}

	return tx.Commit(ctx)
}

func stringsContains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || findSubstr(s, substr))
}

func findSubstr(s, substr string) bool {
	for i := 0; i+len(substr) <= len(s); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
