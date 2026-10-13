package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"backupvault/internal/config"
	"backupvault/internal/model"
	"backupvault/internal/notification"
	"backupvault/internal/repository"
	"backupvault/pkg/storage"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type RetentionManager struct {
	pool       *pgxpool.Pool
	cfg        *config.Config
	storage    storage.StorageBackend
	appRepo    *repository.AppRepository
	backupRepo *repository.BackupRepository
	auditRepo  *repository.AuditRepository
	notifier   *notification.Notifier
}

func NewRetentionManager(
	pool *pgxpool.Pool,
	cfg *config.Config,
	storage storage.StorageBackend,
	appRepo *repository.AppRepository,
	backupRepo *repository.BackupRepository,
	auditRepo *repository.AuditRepository,
	notifier *notification.Notifier,
) *RetentionManager {
	return &RetentionManager{
		pool:       pool,
		cfg:        cfg,
		storage:    storage,
		appRepo:    appRepo,
		backupRepo: backupRepo,
		auditRepo:  auditRepo,
		notifier:   notifier,
	}
}

// IsTriggerDay checks if date t matches the retention execution day (handles Feb 28/29 edge cases)
func IsTriggerDay(t time.Time, targetDay int) bool {
	day := t.Day()
	loc := t.Location()

	// Find the last day of the current month
	// Date(year, month+1, 0, ...) gives the last day of month
	lastDayOfMonth := time.Date(t.Year(), t.Month()+1, 0, 0, 0, 0, 0, loc).Day()

	// If current month has fewer days than targetDay (e.g. February has 28 or 29 days)
	effectiveTarget := targetDay
	if lastDayOfMonth < targetDay {
		effectiveTarget = lastDayOfMonth
	}

	return day == effectiveTarget
}

// Run executes retention lifecycle: evaluates previous month data, applies min-keep and quarantine
func (m *RetentionManager) Run(ctx context.Context, evalTime time.Time, isDryRun bool) (*model.RetentionRun, error) {
	loc := m.cfg.Location()
	evalTime = evalTime.In(loc)

	slog.Info("Starting retention job run", "eval_time", evalTime.Format("2006-01-02"), "dry_run", isDryRun)

	run := &model.RetentionRun{
		ID:          uuid.New(),
		TriggeredAt: evalTime,
		IsDryRun:    isDryRun,
		Status:      "running",
		LogDetails:  make(map[string]interface{}),
	}

	apps, err := m.appRepo.List(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed fetching apps: %w", err)
	}

	quarantinedCount := 0
	deletedCount := 0
	var bytesFreed int64 = 0

	quarantineLog := []map[string]interface{}{}

	// 1. First, purge previously quarantined files that have exceeded quarantine_days
	quarantineDays := m.cfg.QuarantineDays
	if quarantineDays <= 0 {
		quarantineDays = 7
	}
	cutoffQuarantine := evalTime.AddDate(0, 0, -quarantineDays)

	rows, err := m.pool.Query(ctx, `
		SELECT id, filename, storage_path, size_bytes
		FROM backups
		WHERE status = 'quarantined' AND quarantined_at <= $1
	`, cutoffQuarantine)
	if err == nil {
		defer rows.Close()
		type ExpiredBackup struct {
			id   uuid.UUID
			path string
			size int64
		}
		var expired []ExpiredBackup
		for rows.Next() {
			var eb ExpiredBackup
			var fn string
			if err := rows.Scan(&eb.id, &fn, &eb.path, &eb.size); err == nil {
				expired = append(expired, eb)
			}
		}
		rows.Close()

		for _, eb := range expired {
			if !isDryRun {
				_ = m.storage.Delete(ctx, eb.path)
				_ = m.backupRepo.MarkDeleted(ctx, eb.id)
			}
			deletedCount++
			bytesFreed += eb.size
		}
	}

	// 2. Evaluate backups for quarantine based on each application's custom RetentionDays
	for _, app := range apps {
		minKeep := app.MinKeep
		if minKeep <= 0 {
			minKeep = m.cfg.DefaultMinKeep
		}

		retentionDays := app.RetentionDays
		if retentionDays <= 0 {
			retentionDays = 30
		}

		// Calculate exact cutoff date for this application based on its custom retention_days
		// Example: If evalTime is 2026-10-13 and retentionDays is 5, cutoffDate is 2026-10-08.
		// Backups with backup_date strictly before cutoffDate are older than the retention threshold.
		cutoffDate := time.Date(evalTime.Year(), evalTime.Month(), evalTime.Day(), 0, 0, 0, 0, loc).AddDate(0, 0, -retentionDays)

		// Fetch all verified backups for this app ordered by backup_date DESC, uploaded_at DESC
		bRows, err := m.pool.Query(ctx, `
			SELECT id, filename, backup_date, size_bytes
			FROM backups
			WHERE application_id = $1 AND status = 'verified'
			ORDER BY backup_date DESC, uploaded_at DESC
		`, app.ID)
		if err != nil {
			continue
		}

		type BackupCandidate struct {
			id         uuid.UUID
			filename   string
			backupDate time.Time
			sizeBytes  int64
		}
		var candidates []BackupCandidate
		for bRows.Next() {
			var bc BackupCandidate
			if err := bRows.Scan(&bc.id, &bc.filename, &bc.backupDate, &bc.sizeBytes); err == nil {
				candidates = append(candidates, bc)
			}
		}
		bRows.Close()

		// Safeguard: Never touch the latest minKeep verified backups!
		if len(candidates) <= minKeep {
			continue
		}

		eligibleBackups := candidates[minKeep:]
		for _, b := range eligibleBackups {
			bDate := time.Date(b.backupDate.Year(), b.backupDate.Month(), b.backupDate.Day(), 0, 0, 0, 0, loc)
			if bDate.Before(cutoffDate) {
				quarantinedCount++
				quarantineLog = append(quarantineLog, map[string]interface{}{
					"backup_id":      b.id.String(),
					"app_name":       app.Name,
					"filename":       b.filename,
					"backup_date":    b.backupDate.Format("2006-01-02"),
					"size_bytes":     b.sizeBytes,
					"retention_days": retentionDays,
				})

				if !isDryRun {
					_ = m.backupRepo.Quarantine(ctx, b.id)
				}
			}
		}
	}

	now := time.Now()
	run.CompletedAt = &now
	run.ItemsQuarantined = quarantinedCount
	run.ItemsDeleted = deletedCount
	run.BytesFreed = bytesFreed
	run.Status = "completed"
	run.LogDetails["quarantined_files"] = quarantineLog
	run.LogDetails["apps_evaluated"] = len(apps)

	// Save retention run record in DB
	detailsJSON, _ := json.Marshal(run.LogDetails)
	_, _ = m.pool.Exec(ctx, `
		INSERT INTO retention_runs (id, triggered_at, completed_at, items_quarantined, items_deleted, bytes_freed, is_dry_run, status, log_details)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`, run.ID, run.TriggeredAt, run.CompletedAt, run.ItemsQuarantined, run.ItemsDeleted, run.BytesFreed, run.IsDryRun, run.Status, detailsJSON)

	// Dispatch notification
	notifTitle := fmt.Sprintf("Job Retensi Selesai (%s)", map[bool]string{true: "Dry-Run", false: "Live"}[isDryRun])
	notifMsg := fmt.Sprintf("File dikarantina: %d\nFile dihapus permanen: %d\nRuang dibebaskan: %s",
		quarantinedCount, deletedCount, formatBytes(bytesFreed))
	m.notifier.Send(ctx, notifTitle, notifMsg, false)

	return run, nil
}

func formatBytes(bytes int64) string {
	if bytes < 1024 {
		return fmt.Sprintf("%d B", bytes)
	}
	div, exp := int64(1024), 0
	for n := bytes / 1024; n >= 1024; n /= 1024 {
		div *= 1024
		exp++
	}
	return fmt.Sprintf("%.2f %cB", float64(bytes)/float64(div), "KMGTPE"[exp])
}
