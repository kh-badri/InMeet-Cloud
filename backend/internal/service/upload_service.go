package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"backupvault/internal/model"
	"backupvault/internal/repository"
	"backupvault/internal/security"
	"backupvault/pkg/storage"

	"github.com/google/uuid"
)

var (
	ErrChecksumMismatch = errors.New("SHA-256 checksum mismatch")
	ErrInvalidFileType  = errors.New("file extension is not in allowed whitelist")
	ErrInvalidFilename  = errors.New("invalid filename")
	ErrUploadIncomplete = errors.New("uploaded bytes do not match expected size")
	ErrStorageFull      = errors.New("storage quota or disk space exceeded")
)

var allowedExtensions = []string{
	".sql", ".sql.gz", ".dump", ".bak", ".tar.gz", ".zip", ".bson", ".rdb",
	".age", ".gz", ".zst", ".tar", ".7z", ".bz2",
}

type UploadService struct {
	storage    storage.StorageBackend
	uploadRepo *repository.UploadRepository
	backupRepo *repository.BackupRepository
	auditRepo  *repository.AuditRepository
}

func NewUploadService(
	storage storage.StorageBackend,
	uploadRepo *repository.UploadRepository,
	backupRepo *repository.BackupRepository,
	auditRepo *repository.AuditRepository,
) *UploadService {
	return &UploadService{
		storage:    storage,
		uploadRepo: uploadRepo,
		backupRepo: backupRepo,
		auditRepo:  auditRepo,
	}
}

// SanitizeFilename cleans and validates filename to prevent path traversal
func SanitizeFilename(raw string) (string, string, error) {
	clean := filepath.Base(filepath.Clean(raw))
	clean = strings.ReplaceAll(clean, "/", "")
	clean = strings.ReplaceAll(clean, "\\", "")
	clean = strings.ReplaceAll(clean, "..", "")
	clean = strings.TrimSpace(clean)

	if clean == "" || clean == "." {
		return "", "", ErrInvalidFilename
	}

	// Determine matching extension from whitelist
	lower := strings.ToLower(clean)
	var matchedExt string
	for _, ext := range allowedExtensions {
		if strings.HasSuffix(lower, ext) {
			if len(ext) > len(matchedExt) {
				matchedExt = ext
			}
		}
	}

	if matchedExt == "" {
		return "", "", fmt.Errorf("%w: supported types are %s", ErrInvalidFileType, strings.Join(allowedExtensions, ", "))
	}

	// Safe regex for filename characters
	safeRe := regexp.MustCompile(`[^a-zA-Z0-9_\-\.]`)
	clean = safeRe.ReplaceAllString(clean, "_")

	fileType := strings.TrimPrefix(matchedExt, ".")
	return clean, fileType, nil
}

// BuildStoragePath creates path format: {app}/{YYYY}/{MM}/{DD}/{timestamp}_{filename}
func BuildStoragePath(appName, filename string, t time.Time) string {
	loc := time.FixedZone("WIB", 7*3600)
	localTime := t.In(loc)
	year := localTime.Format("2006")
	month := localTime.Format("01")
	day := localTime.Format("02")
	ts := localTime.Format("20060102_150405")

	return fmt.Sprintf("%s/%s/%s/%s/%s_%s", appName, year, month, day, ts, filename)
}

// CreateSession initiates a chunked upload session
func (s *UploadService) CreateSession(ctx context.Context, app *model.Application, filename string, size int64, sha256Hex string) (*model.UploadSession, error) {
	cleanName, fileType, err := SanitizeFilename(filename)
	if err != nil {
		return nil, err
	}

	sha256Hex = strings.ToLower(strings.TrimSpace(sha256Hex))
	if len(sha256Hex) != 64 {
		return nil, errors.New("expected valid 64-character SHA-256 hex checksum")
	}

	sessionID := uuid.New()
	tempPath := fmt.Sprintf("_temp/%s/%s.part", app.Name, sessionID.String())

	sess := &model.UploadSession{
		ID:             sessionID,
		ApplicationID:  app.ID,
		Filename:       cleanName,
		FileType:       fileType,
		ExpectedSize:   size,
		ExpectedSHA256: sha256Hex,
		CurrentOffset:  0,
		TempFilePath:   tempPath,
		ExpiresAt:      time.Now().Add(24 * time.Hour),
	}

	if err := s.uploadRepo.Create(ctx, sess); err != nil {
		return nil, err
	}

	return sess, nil
}

// GetSession returns session info
func (s *UploadService) GetSession(ctx context.Context, id uuid.UUID) (*model.UploadSession, error) {
	return s.uploadRepo.GetByID(ctx, id)
}

// AppendChunk writes streaming data into the session's temp storage file
func (s *UploadService) AppendChunk(ctx context.Context, sessionID uuid.UUID, r io.Reader, expectedOffset int64) (int64, error) {
	sess, err := s.uploadRepo.GetByID(ctx, sessionID)
	if err != nil {
		return 0, err
	}

	newOffset, err := s.storage.Append(ctx, sess.TempFilePath, r, expectedOffset)
	if err != nil {
		return 0, err
	}

	if err := s.uploadRepo.UpdateOffset(ctx, sessionID, newOffset); err != nil {
		return 0, err
	}

	return newOffset, nil
}

// CompleteSession verifies checksum and moves file to verified backup storage
func (s *UploadService) CompleteSession(ctx context.Context, sessionID uuid.UUID, app *model.Application, clientIP string) (*model.Backup, error) {
	sess, err := s.uploadRepo.GetByID(ctx, sessionID)
	if err != nil {
		return nil, err
	}

	// Check uploaded size
	actualSize, err := s.storage.Size(ctx, sess.TempFilePath)
	if err != nil {
		return nil, err
	}

	if sess.ExpectedSize > 0 && actualSize != sess.ExpectedSize {
		_ = s.storage.Delete(ctx, sess.TempFilePath)
		_ = s.uploadRepo.MarkAborted(ctx, sessionID)
		return nil, fmt.Errorf("%w: uploaded %d bytes, expected %d bytes", ErrUploadIncomplete, actualSize, sess.ExpectedSize)
	}

	// Stream file to calculate SHA-256 (memory efficient, 32KB buffer)
	fileRead, err := s.storage.Read(ctx, sess.TempFilePath)
	if err != nil {
		return nil, err
	}

	hasher := sha256.New()
	_, err = io.Copy(hasher, fileRead)
	_ = fileRead.Close()
	if err != nil {
		return nil, fmt.Errorf("failed calculating checksum: %w", err)
	}

	actualSHA256 := hex.EncodeToString(hasher.Sum(nil))
	if !strings.EqualFold(actualSHA256, sess.ExpectedSHA256) {
		// Cleanup corrupt file
		_ = s.storage.Delete(ctx, sess.TempFilePath)
		_ = s.uploadRepo.MarkAborted(ctx, sessionID)
		_ = s.auditRepo.Log(ctx, "api_key", app.ID.String(), app.Name, "upload_checksum_mismatch", "backup", sessionID.String(), clientIP, "", map[string]interface{}{
			"expected": sess.ExpectedSHA256,
			"actual":   actualSHA256,
		})
		return nil, fmt.Errorf("%w: expected %s, got %s", ErrChecksumMismatch, sess.ExpectedSHA256, actualSHA256)
	}

	// Idempotency check: if backup with same SHA-256 already exists for this app, return it
	existing, err := s.backupRepo.GetVerifiedBySHA256(ctx, app.ID, actualSHA256)
	if err == nil && existing != nil {
		// File already exists and verified, remove temporary part
		_ = s.storage.Delete(ctx, sess.TempFilePath)
		_ = s.uploadRepo.MarkCompleted(ctx, sessionID)
		return existing, nil
	}

	// Move file to final path: {app}/{YYYY}/{MM}/{DD}/{timestamp}_{filename}
	now := time.Now()
	finalPath := BuildStoragePath(app.Name, sess.Filename, now)

	// Stream move from temp to final
	tempReader, err := s.storage.Read(ctx, sess.TempFilePath)
	if err != nil {
		return nil, err
	}

	_, err = s.storage.Write(ctx, finalPath, tempReader)
	_ = tempReader.Close()
	_ = s.storage.Delete(ctx, sess.TempFilePath)
	if err != nil {
		return nil, fmt.Errorf("failed moving file to permanent storage: %w", err)
	}

	// Create backup record
	loc := time.FixedZone("WIB", 7*3600)
	backupDate := now.In(loc).Truncate(24 * time.Hour)

	backup := &model.Backup{
		ID:            uuid.New(),
		ApplicationID: app.ID,
		Filename:      sess.Filename,
		StoragePath:   finalPath,
		SizeBytes:     actualSize,
		SHA256:        actualSHA256,
		FileType:      sess.FileType,
		Status:        model.BackupStatusVerified,
		BackupDate:    backupDate,
		Tags:          []string{sess.FileType},
		Metadata: map[string]interface{}{
			"client_ip":  clientIP,
			"session_id": sessionID.String(),
		},
	}

	if err := s.backupRepo.Create(ctx, backup); err != nil {
		return nil, err
	}

	_ = s.uploadRepo.MarkCompleted(ctx, sessionID)

	_ = s.auditRepo.Log(ctx, "api_key", app.ID.String(), app.Name, "backup_uploaded", "backup", backup.ID.String(), clientIP, "", map[string]interface{}{
		"filename":   backup.Filename,
		"size_bytes": backup.SizeBytes,
		"sha256":     backup.SHA256,
	})

	return backup, nil
}

// UploadDirect streams an entire backup in one shot with inline checksum computation
func (s *UploadService) UploadDirect(ctx context.Context, app *model.Application, filename, expectedSHA256 string, r io.Reader, clientIP string) (*model.Backup, error) {
	cleanName, fileType, err := SanitizeFilename(filename)
	if err != nil {
		return nil, err
	}

	now := time.Now()
	finalPath := BuildStoragePath(app.Name, cleanName, now)

	// Stream write into storage while calculating SHA-256 inline
	teeReader, getHash := security.NewStreamingHasher(r)

	written, err := s.storage.Write(ctx, finalPath, teeReader)
	if err != nil {
		return nil, err
	}

	actualSHA256 := getHash()
	if expectedSHA256 != "" && !strings.EqualFold(actualSHA256, expectedSHA256) {
		// Mismatch: remove file from disk
		_ = s.storage.Delete(ctx, finalPath)
		_ = s.auditRepo.Log(ctx, "api_key", app.ID.String(), app.Name, "upload_checksum_mismatch", "backup", "", clientIP, "", map[string]interface{}{
			"expected": expectedSHA256,
			"actual":   actualSHA256,
		})
		return nil, fmt.Errorf("%w: expected %s, got %s", ErrChecksumMismatch, expectedSHA256, actualSHA256)
	}

	// Idempotency check
	existing, err := s.backupRepo.GetVerifiedBySHA256(ctx, app.ID, actualSHA256)
	if err == nil && existing != nil {
		_ = s.storage.Delete(ctx, finalPath)
		return existing, nil
	}

	loc := time.FixedZone("WIB", 7*3600)
	backupDate := now.In(loc).Truncate(24 * time.Hour)

	backup := &model.Backup{
		ID:            uuid.New(),
		ApplicationID: app.ID,
		Filename:      cleanName,
		StoragePath:   finalPath,
		SizeBytes:     written,
		SHA256:        actualSHA256,
		FileType:      fileType,
		Status:        model.BackupStatusVerified,
		BackupDate:    backupDate,
		Tags:          []string{fileType},
		Metadata: map[string]interface{}{
			"client_ip": clientIP,
			"method":    "direct_stream",
		},
	}

	if err := s.backupRepo.Create(ctx, backup); err != nil {
		return nil, err
	}

	_ = s.auditRepo.Log(ctx, "api_key", app.ID.String(), app.Name, "backup_uploaded", "backup", backup.ID.String(), clientIP, "", map[string]interface{}{
		"filename":   backup.Filename,
		"size_bytes": backup.SizeBytes,
		"sha256":     backup.SHA256,
	})

	return backup, nil
}
