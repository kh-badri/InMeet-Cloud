package scheduler

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"strings"

	"backupvault/internal/notification"
	"backupvault/internal/repository"
	"backupvault/pkg/storage"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type IntegrityScrubber struct {
	pool       *pgxpool.Pool
	storage    storage.StorageBackend
	backupRepo *repository.BackupRepository
	notifier   *notification.Notifier
}

func NewIntegrityScrubber(
	pool *pgxpool.Pool,
	storage storage.StorageBackend,
	backupRepo *repository.BackupRepository,
	notifier *notification.Notifier,
) *IntegrityScrubber {
	return &IntegrityScrubber{
		pool:       pool,
		storage:    storage,
		backupRepo: backupRepo,
		notifier:   notifier,
	}
}

// Scrub verifies SHA-256 checksums of stored files
func (s *IntegrityScrubber) Scrub(ctx context.Context, batchSize int) (int, int, error) {
	if batchSize <= 0 {
		batchSize = 25
	}

	rows, err := s.pool.Query(ctx, `
		SELECT b.id, b.filename, b.storage_path, b.sha256, a.name
		FROM backups b
		JOIN applications a ON a.id = b.application_id
		WHERE b.status = 'verified'
		ORDER BY b.uploaded_at ASC
		LIMIT $1
	`, batchSize)
	if err != nil {
		return 0, 0, err
	}
	defer rows.Close()

	type ScrubTarget struct {
		id      uuid.UUID
		name    string
		path    string
		sha256  string
		appName string
	}
	var targets []ScrubTarget
	for rows.Next() {
		var t ScrubTarget
		if err := rows.Scan(&t.id, &t.name, &t.path, &t.sha256, &t.appName); err == nil {
			targets = append(targets, t)
		}
	}
	rows.Close()

	verifiedCount := 0
	corruptCount := 0

	for _, target := range targets {
		reader, err := s.storage.Read(ctx, target.path)
		if err != nil {
			slog.Error("Scrub: backup file missing from storage", "id", target.id, "path", target.path)
			corruptCount++
			_, _ = s.pool.Exec(ctx, `UPDATE backups SET status = 'failed' WHERE id = $1`, target.id)
			s.notifier.Send(ctx, "File Backup Hilang!", fmt.Sprintf("File %s (%s) tidak ditemukan pada disk storage.", target.name, target.appName), true)
			continue
		}

		hasher := sha256.New()
		_, err = io.Copy(hasher, reader)
		_ = reader.Close()
		if err != nil {
			corruptCount++
			continue
		}

		actual := hex.EncodeToString(hasher.Sum(nil))
		if !strings.EqualFold(actual, target.sha256) {
			slog.Error("Scrub: SHA-256 mismatch detected!", "id", target.id, "expected", target.sha256, "actual", actual)
			corruptCount++
			_, _ = s.pool.Exec(ctx, `UPDATE backups SET status = 'failed' WHERE id = $1`, target.id)
			s.notifier.Send(ctx, "Kerusakan File Terdeteksi (Bitrot/Korupsi)!", fmt.Sprintf("File %s (%s) mengalami korupsi checksum.\nExpected: %s\nActual: %s", target.name, target.appName, target.sha256, actual), true)
		} else {
			verifiedCount++
		}
	}

	slog.Info("Integrity scrub completed", "verified", verifiedCount, "corrupt", corruptCount)
	return verifiedCount, corruptCount, nil
}
