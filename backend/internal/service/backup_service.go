package service

import (
	"archive/zip"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"backupvault/internal/model"
	"backupvault/internal/repository"
	"backupvault/internal/security"
	"backupvault/pkg/storage"

	"github.com/google/uuid"
)

var (
	ErrDownloadExpired = errors.New("download link has expired or was already used")
	ErrReAuthFailed    = errors.New("2FA re-authentication failed for sensitive action")
)

type BackupService struct {
	storage     storage.StorageBackend
	backupRepo  *repository.BackupRepository
	tokenRepo   *repository.DownloadTokenRepository
	auditRepo   *repository.AuditRepository
	authService *AuthService
}

func NewBackupService(
	storage storage.StorageBackend,
	backupRepo *repository.BackupRepository,
	tokenRepo *repository.DownloadTokenRepository,
	auditRepo *repository.AuditRepository,
	authService *AuthService,
) *BackupService {
	return &BackupService{
		storage:     storage,
		backupRepo:  backupRepo,
		tokenRepo:   tokenRepo,
		auditRepo:   auditRepo,
		authService: authService,
	}
}

func (s *BackupService) ListBackups(ctx context.Context, filter repository.BackupFilter) ([]model.Backup, int64, error) {
	return s.backupRepo.List(ctx, filter)
}

func (s *BackupService) GetBackup(ctx context.Context, id uuid.UUID) (*model.Backup, error) {
	return s.backupRepo.GetByID(ctx, id)
}

type DownloadLinkResult struct {
	DownloadURL string    `json:"download_url"`
	ExpiresAt   time.Time `json:"expires_at"`
}

// CreateDownloadLink generates a single-use, 5-minute tokenized download link bound to the user
func (s *BackupService) CreateDownloadLink(ctx context.Context, backupID, userID uuid.UUID, clientIP, userAgent string) (*DownloadLinkResult, error) {
	backup, err := s.backupRepo.GetByID(ctx, backupID)
	if err != nil {
		return nil, err
	}

	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	rawToken := hex.EncodeToString(b)
	tokenHash := security.SHA256String([]byte(rawToken))

	expiresAt := time.Now().Add(5 * time.Minute)

	token := &model.DownloadToken{
		BackupID:  backup.ID,
		UserID:    userID,
		TokenHash: tokenHash,
		IPAddress: clientIP,
		ExpiresAt: expiresAt,
	}

	if err := s.tokenRepo.Create(ctx, token); err != nil {
		return nil, err
	}

	_ = s.auditRepo.Log(ctx, "user", userID.String(), "", "download_link_generated", "backup", backup.ID.String(), clientIP, userAgent, map[string]interface{}{
		"filename": backup.Filename,
	})

	return &DownloadLinkResult{
		DownloadURL: fmt.Sprintf("/api/v1/download/%s", rawToken),
		ExpiresAt:   expiresAt,
	}, nil
}

// ResolveDownload validates token, marks it used, and returns backup & storage stream
func (s *BackupService) ResolveDownload(ctx context.Context, rawToken, clientIP, userAgent string) (*model.Backup, string, int64, error) {
	tokenHash := security.SHA256String([]byte(rawToken))
	token, err := s.tokenRepo.GetValidByHash(ctx, tokenHash, clientIP)
	if err != nil {
		return nil, "", 0, ErrDownloadExpired
	}

	backup, err := s.backupRepo.GetByID(ctx, token.BackupID)
	if err != nil {
		return nil, "", 0, err
	}

	fullPath, err := s.storage.GetFullPath(backup.StoragePath)
	if err != nil {
		return nil, "", 0, err
	}

	// Mark single-use token as consumed
	_ = s.tokenRepo.MarkUsed(ctx, token.ID)

	_ = s.auditRepo.Log(ctx, "user", token.UserID.String(), "", "backup_downloaded", "backup", backup.ID.String(), clientIP, userAgent, map[string]interface{}{
		"filename":   backup.Filename,
		"size_bytes": backup.SizeBytes,
	})

	return backup, fullPath, backup.SizeBytes, nil
}

// ManualDelete requires 2FA re-authentication and moves to quarantine or deletes
func (s *BackupService) ManualDelete(ctx context.Context, backupID, adminID uuid.UUID, twoFACode string, permanent bool, clientIP, userAgent string) error {
	// Re-authenticate 2FA
	if err := s.authService.ReAuth2FA(ctx, adminID, twoFACode); err != nil {
		return fmt.Errorf("%w: %v", ErrReAuthFailed, err)
	}

	backup, err := s.backupRepo.GetByID(ctx, backupID)
	if err != nil {
		return err
	}

	if permanent {
		_ = s.storage.Delete(ctx, backup.StoragePath)
		if err := s.backupRepo.MarkDeleted(ctx, backupID); err != nil {
			return err
		}
		_ = s.auditRepo.Log(ctx, "user", adminID.String(), "", "backup_permanently_deleted", "backup", backupID.String(), clientIP, userAgent, map[string]interface{}{
			"filename": backup.Filename,
		})
	} else {
		if err := s.backupRepo.Quarantine(ctx, backupID); err != nil {
			return err
		}
		_ = s.auditRepo.Log(ctx, "user", adminID.String(), "", "backup_quarantined", "backup", backupID.String(), clientIP, userAgent, map[string]interface{}{
			"filename": backup.Filename,
		})
	}

	return nil
}

// GetStats returns comprehensive storage, backup counts, today's status, and disk usage
func (s *BackupService) GetStats(ctx context.Context, storagePath string) (*model.StatsSummary, error) {
	summary, err := s.backupRepo.GetStats(ctx, 30)
	if err != nil {
		return nil, err
	}

	// Read real filesystem disk space stats using statfs
	var stat syscall.Statfs_t
	if err := syscall.Statfs(storagePath, &stat); err == nil {
		summary.DiskFreeBytes = stat.Bavail * uint64(stat.Bsize)
		summary.DiskTotalBytes = stat.Blocks * uint64(stat.Bsize)
		if summary.DiskTotalBytes > 0 {
			usedBytes := summary.DiskTotalBytes - summary.DiskFreeBytes
			summary.DiskUsedPercent = (float64(usedBytes) / float64(summary.DiskTotalBytes)) * 100
		}
	}

	return summary, nil
}

func (s *BackupService) OpenRange(ctx context.Context, path string, offset, length int64) (io.ReadCloser, error) {
	return s.storage.ReadRange(ctx, path, offset, length)
}

// BatchDelete deletes or quarantines multiple backups after a single 2FA check
func (s *BackupService) BatchDelete(ctx context.Context, backupIDs []uuid.UUID, adminID uuid.UUID, twoFACode string, permanent bool, clientIP, userAgent string) (int, error) {
	if len(backupIDs) == 0 {
		return 0, errors.New("tidak ada backup yang dipilih")
	}

	// Re-authenticate 2FA (or password)
	if err := s.authService.ReAuth2FA(ctx, adminID, twoFACode); err != nil {
		return 0, fmt.Errorf("%w: %v", ErrReAuthFailed, err)
	}

	deletedCount := 0
	for _, id := range backupIDs {
		backup, err := s.backupRepo.GetByID(ctx, id)
		if err != nil {
			continue
		}

		if permanent {
			_ = s.storage.Delete(ctx, backup.StoragePath)
			if err := s.backupRepo.MarkDeleted(ctx, id); err != nil {
				continue
			}
			_ = s.auditRepo.Log(ctx, "user", adminID.String(), "", "backup_permanently_deleted", "backup", id.String(), clientIP, userAgent, map[string]interface{}{
				"filename": backup.Filename,
			})
		} else {
			if err := s.backupRepo.Quarantine(ctx, id); err != nil {
				continue
			}
			_ = s.auditRepo.Log(ctx, "user", adminID.String(), "", "backup_quarantined", "backup", id.String(), clientIP, userAgent, map[string]interface{}{
				"filename": backup.Filename,
			})
		}
		deletedCount++
	}

	return deletedCount, nil
}

// BatchZipBackups streams a ZIP archive containing all requested backup files
func (s *BackupService) BatchZipBackups(ctx context.Context, backupIDs []uuid.UUID, adminID uuid.UUID, clientIP, userAgent string, w http.ResponseWriter) error {
	if len(backupIDs) == 0 {
		return errors.New("tidak ada backup yang dipilih untuk diunduh")
	}

	w.Header().Set("Content-Disposition", `attachment; filename="InMeet-Backups-Selection.zip"`)
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("X-Content-Type-Options", "nosniff")

	zipWriter := zip.NewWriter(w)
	defer zipWriter.Close()

	usedNames := make(map[string]int)
	downloadedCount := 0

	for _, id := range backupIDs {
		backup, err := s.backupRepo.GetByID(ctx, id)
		if err != nil || backup == nil {
			continue
		}

		fullPath, err := s.storage.GetFullPath(backup.StoragePath)
		if err != nil {
			continue
		}

		file, err := os.Open(fullPath)
		if err != nil {
			continue
		}

		entryName := deduplicateBackupZipName(backup.Filename, usedNames)
		fileEntry, err := zipWriter.Create(entryName)
		if err != nil {
			_ = file.Close()
			continue
		}

		_, _ = io.Copy(fileEntry, file)
		_ = file.Close()
		downloadedCount++
	}

	_ = s.auditRepo.Log(ctx, "user", adminID.String(), "", "backups_batch_downloaded", "backup", "", clientIP, userAgent, map[string]interface{}{
		"total_requested": len(backupIDs),
		"total_archived":  downloadedCount,
	})

	return nil
}

func deduplicateBackupZipName(filename string, usedNames map[string]int) string {
	base := filepath.Base(filename)
	ext := filepath.Ext(base)
	nameWithoutExt := strings.TrimSuffix(base, ext)

	if usedNames[base] == 0 {
		usedNames[base] = 1
		return base
	}

	count := usedNames[base]
	for {
		candidate := fmt.Sprintf("%s (%d)%s", nameWithoutExt, count, ext)
		if usedNames[candidate] == 0 {
			usedNames[base] = count + 1
			usedNames[candidate] = 1
			return candidate
		}
		count++
	}
}

