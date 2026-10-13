package scheduler

import (
	"context"
	"os"
	"testing"
	"time"

	"backupvault/internal/config"
	"backupvault/internal/database"
	"backupvault/internal/model"
	"backupvault/internal/notification"
	"backupvault/internal/repository"
	"backupvault/pkg/storage"

	"github.com/google/uuid"
)

func TestIsTriggerDay(t *testing.T) {
	loc, _ := time.LoadLocation("Asia/Jakarta")

	tests := []struct {
		name      string
		date      time.Time
		targetDay int
		expected  bool
	}{
		// Regular 31-day month: trigger on 30
		{"March 30 (31 days)", time.Date(2026, time.March, 30, 0, 0, 0, 0, loc), 30, true},
		{"March 31 (31 days)", time.Date(2026, time.March, 31, 0, 0, 0, 0, loc), 30, false},
		{"March 29 (31 days)", time.Date(2026, time.March, 29, 0, 0, 0, 0, loc), 30, false},

		// 30-day month: trigger on 30
		{"April 30 (30 days)", time.Date(2026, time.April, 30, 0, 0, 0, 0, loc), 30, true},
		{"April 29 (30 days)", time.Date(2026, time.April, 29, 0, 0, 0, 0, loc), 30, false},

		// February 2026 (non-leap year, 28 days) -> triggers on Feb 28!
		{"Feb 28 non-leap year (last day)", time.Date(2026, time.February, 28, 0, 0, 0, 0, loc), 30, true},
		{"Feb 27 non-leap year", time.Date(2026, time.February, 27, 0, 0, 0, 0, loc), 30, false},

		// February 2028 (leap year, 29 days) -> triggers on Feb 29!
		{"Feb 29 leap year (last day)", time.Date(2028, time.February, 29, 0, 0, 0, 0, loc), 30, true},
		{"Feb 28 leap year", time.Date(2028, time.February, 28, 0, 0, 0, 0, loc), 30, false},
	}

	for _, tc := range tests {
		actual := IsTriggerDay(tc.date, tc.targetDay)
		if actual != tc.expected {
			t.Errorf("[%s] Expected %v, got %v for %s", tc.name, tc.expected, actual, tc.date.Format("2006-01-02"))
		}
	}
}

func TestRetentionEvaluationAndMinKeep(t *testing.T) {
	cfg, err := config.Load("../../.env")
	if err != nil {
		t.Fatalf("Failed to load config: %v", err)
	}

	ctx := context.Background()
	db, err := database.Connect(ctx, cfg.DatabaseURL, 5, 2)
	if err != nil {
		t.Fatalf("Failed to connect to db: %v", err)
	}
	defer db.Close()

	_ = db.Migrate(ctx)

	_, _ = db.Pool.Exec(ctx, "TRUNCATE TABLE applications, backups, retention_runs, audit_logs CASCADE")

	appRepo := repository.NewAppRepository(db.Pool)
	backupRepo := repository.NewBackupRepository(db.Pool)
	auditRepo := repository.NewAuditRepository(db.Pool)
	notifier := notification.NewNotifier(cfg)

	tempDir, _ := os.MkdirTemp("", "bv_retention_test_*")
	defer os.RemoveAll(tempDir)
	localStorage, _ := storage.NewLocalStorage(tempDir, cfg.StorageEncryptionKey)

	retentionMgr := NewRetentionManager(db.Pool, cfg, localStorage, appRepo, backupRepo, auditRepo, notifier)

	// Create App with min_keep = 3
	app := &model.Application{
		ID:            uuid.New(),
		Name:          "prod-db",
		DisplayName:   "Production DB",
		RetentionDays: 30,
		MinKeep:       3,
		IsActive:      true,
	}
	_ = appRepo.Create(ctx, app)

	// Skenario: Current evaluation date is October 30, 2026.
	// We insert:
	// - 2 backups from September 2026 (previous month)
	// - 3 backups from October 2026 (current month)
	// Total = 5 backups.
	loc := cfg.Location()
	evalDate := time.Date(2026, time.October, 30, 23, 30, 0, 0, loc)

	dates := []time.Time{
		time.Date(2026, time.September, 15, 0, 0, 0, 0, loc), // Old 1
		time.Date(2026, time.September, 25, 0, 0, 0, 0, loc), // Old 2
		time.Date(2026, time.October, 5, 0, 0, 0, 0, loc),    // Recent 1
		time.Date(2026, time.October, 15, 0, 0, 0, 0, loc),   // Recent 2
		time.Date(2026, time.October, 25, 0, 0, 0, 0, loc),   // Recent 3
	}

	for i, d := range dates {
		b := &model.Backup{
			ID:            uuid.New(),
			ApplicationID: app.ID,
			Filename:      "backup.sql.gz",
			StoragePath:   "test/path",
			SizeBytes:     1024 * 1024,
			SHA256:        "abc123hash",
			FileType:      "sql.gz",
			Status:        model.BackupStatusVerified,
			BackupDate:    d,
			UploadedAt:    d.Add(2 * time.Hour),
		}
		if err := backupRepo.Create(ctx, b); err != nil {
			t.Fatalf("Failed creating test backup: %v", err)
		}
		_ = i
	}

	// 1. Run retention: The 2 September backups should be quarantined!
	// The 3 October backups are protected by min_keep AND because they are in the current month.
	run, err := retentionMgr.Run(ctx, evalDate, false)
	if err != nil {
		t.Fatalf("Retention Run failed: %v", err)
	}

	if run.ItemsQuarantined != 2 {
		t.Errorf("Expected 2 backups quarantined, got %d", run.ItemsQuarantined)
	}

	// 2. Minimum Keep Guarantee Edge Case:
	// Suppose an app failed to upload all month, and ONLY has 3 backups, ALL from September.
	// With min_keep = 3, NONE should be quarantined to prevent data loss!
	_, _ = db.Pool.Exec(ctx, "TRUNCATE TABLE applications, backups, retention_runs CASCADE")

	appOnlyOld := &model.Application{
		ID:            uuid.New(),
		Name:          "stale-app",
		DisplayName:   "Stale App",
		RetentionDays: 30,
		MinKeep:       3,
		IsActive:      true,
	}
	_ = appRepo.Create(ctx, appOnlyOld)

	oldDates := []time.Time{
		time.Date(2026, time.September, 1, 0, 0, 0, 0, loc),
		time.Date(2026, time.September, 10, 0, 0, 0, 0, loc),
		time.Date(2026, time.September, 20, 0, 0, 0, 0, loc),
	}
	for _, d := range oldDates {
		b := &model.Backup{
			ID:            uuid.New(),
			ApplicationID: appOnlyOld.ID,
			Filename:      "backup.sql.gz",
			StoragePath:   "test/path",
			SizeBytes:     1024,
			SHA256:        "hash",
			FileType:      "sql.gz",
			Status:        model.BackupStatusVerified,
			BackupDate:    d,
			UploadedAt:    d,
		}
		if err := backupRepo.Create(ctx, b); err != nil {
			t.Fatalf("Failed creating old backup: %v", err)
		}
	}

	run2, err := retentionMgr.Run(ctx, evalDate, false)
	if err != nil {
		t.Fatalf("Retention Run 2 failed: %v", err)
	}

	if run2.ItemsQuarantined != 0 {
		t.Errorf("Expected 0 backups quarantined due to min_keep safeguard, got %d", run2.ItemsQuarantined)
	}

	// 3. Custom Retention Test:
	// App with RetentionDays = 5 and MinKeep = 2.
	// Evaluation date: Oct 13, 2026.
	// Backups:
	// - Oct 5 (8 days old -> older than 5 days -> quarantine)
	// - Oct 6 (7 days old -> older than 5 days -> quarantine)
	// - Oct 9 (4 days old -> within 5 days -> keep)
	// - Oct 10 (3 days old -> within 5 days -> keep)
	// - Oct 12 (1 day old -> within 5 days -> keep)
	_, _ = db.Pool.Exec(ctx, "TRUNCATE TABLE applications, backups, retention_runs CASCADE")
	customApp := &model.Application{
		ID:            uuid.New(),
		Name:          "custom-app-5d",
		DisplayName:   "Custom 5-Day App",
		RetentionDays: 5,
		MinKeep:       2,
		IsActive:      true,
	}
	_ = appRepo.Create(ctx, customApp)

	customDates := []time.Time{
		time.Date(2026, time.October, 5, 0, 0, 0, 0, loc),  // Old (> 5 days)
		time.Date(2026, time.October, 6, 0, 0, 0, 0, loc),  // Old (> 5 days)
		time.Date(2026, time.October, 9, 0, 0, 0, 0, loc),  // Recent (<= 5 days)
		time.Date(2026, time.October, 10, 0, 0, 0, 0, loc), // Recent (<= 5 days)
		time.Date(2026, time.October, 12, 0, 0, 0, 0, loc), // Recent (<= 5 days)
	}
	for _, d := range customDates {
		b := &model.Backup{
			ID:            uuid.New(),
			ApplicationID: customApp.ID,
			Filename:      "backup.sql.gz",
			StoragePath:   "test/path",
			SizeBytes:     2048,
			SHA256:        "hash5d",
			FileType:      "sql.gz",
			Status:        model.BackupStatusVerified,
			BackupDate:    d,
			UploadedAt:    d,
		}
		if err := backupRepo.Create(ctx, b); err != nil {
			t.Fatalf("Failed creating custom backup: %v", err)
		}
	}

	evalCustomDate := time.Date(2026, time.October, 13, 23, 30, 0, 0, loc)
	run3, err := retentionMgr.Run(ctx, evalCustomDate, false)
	if err != nil {
		t.Fatalf("Retention Run 3 failed: %v", err)
	}

	if run3.ItemsQuarantined != 2 {
		t.Errorf("Expected 2 backups quarantined for 5-day retention, got %d", run3.ItemsQuarantined)
	}
}
