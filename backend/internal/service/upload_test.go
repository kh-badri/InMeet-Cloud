package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"backupvault/internal/config"
	"backupvault/internal/database"
	"backupvault/internal/model"
	"backupvault/internal/repository"
	"backupvault/pkg/storage"
)

func setupTestDB(t *testing.T) (*database.DB, *config.Config) {
	cfg, err := config.Load("../../.env")
	if err != nil {
		t.Fatalf("Failed to load config: %v", err)
	}

	ctx := context.Background()
	db, err := database.Connect(ctx, cfg.DatabaseURL, 5, 2)
	if err != nil {
		t.Fatalf("Failed to connect to test db: %v", err)
	}

	if err := db.Migrate(ctx); err != nil {
		t.Fatalf("Failed to run migrations: %v", err)
	}

	_, _ = db.Pool.Exec(ctx, "TRUNCATE TABLE applications, api_keys, backups, upload_sessions, audit_logs CASCADE")
	return db, cfg
}

func TestFilenameSanitization(t *testing.T) {
	tests := []struct {
		input       string
		shouldError bool
		expectedExt string
	}{
		{"backup.sql.gz", false, "sql.gz"},
		{"db_dump.tar.gz", false, "tar.gz"},
		{"mydb.sql", false, "sql"},
		{"../../etc/shadow.sql", false, "sql"}, // Path traversal should be stripped
		{"malicious_script.sh", true, ""},      // Not whitelisted
		{"virus.exe", true, ""},                // Not whitelisted
		{"..", true, ""},
		{"", true, ""},
	}

	for _, tc := range tests {
		clean, ext, err := SanitizeFilename(tc.input)
		if tc.shouldError {
			if err == nil {
				t.Errorf("Expected error for input: %s, got: %s", tc.input, clean)
			}
		} else {
			if err != nil {
				t.Errorf("Unexpected error for input: %s: %v", tc.input, err)
			}
			if ext != tc.expectedExt {
				t.Errorf("Expected ext %s, got %s", tc.expectedExt, ext)
			}
			if strings.Contains(clean, "..") || strings.Contains(clean, "/") {
				t.Errorf("Path traversal detected in cleaned filename: %s", clean)
			}
		}
	}
}

func TestStoragePathBuilder(t *testing.T) {
	loc := time.FixedZone("WIB", 7*3600)
	fixedTime := time.Date(2026, 10, 12, 14, 30, 0, 0, loc)
	path := BuildStoragePath("toko-online", "mydb.sql.gz", fixedTime)

	expectedPrefix := "toko-online/2026/10/12/20261012_143000_mydb.sql.gz"
	if path != expectedPrefix {
		t.Errorf("Expected path %s, got %s", expectedPrefix, path)
	}
}

func TestIPAllowlist(t *testing.T) {
	// Single IP match
	if !checkIPAllowlist("192.168.1.100", "192.168.1.100, 10.0.0.1") {
		t.Errorf("Expected IP 192.168.1.100 to be allowed")
	}

	// CIDR match
	if !checkIPAllowlist("10.0.5.23", "10.0.0.0/16") {
		t.Errorf("Expected 10.0.5.23 to match 10.0.0.0/16 CIDR")
	}

	// Disallowed IP
	if checkIPAllowlist("203.0.113.5", "192.168.1.100, 10.0.0.0/16") {
		t.Errorf("Expected 203.0.113.5 to be rejected")
	}
}

func TestResumableUploadAndIntegrity(t *testing.T) {
	db, cfg := setupTestDB(t)
	defer db.Close()

	ctx := context.Background()
	appRepo := repository.NewAppRepository(db.Pool)
	apiKeyRepo := repository.NewApiKeyRepository(db.Pool)
	backupRepo := repository.NewBackupRepository(db.Pool)
	uploadRepo := repository.NewUploadRepository(db.Pool)
	auditRepo := repository.NewAuditRepository(db.Pool)

	tempDir, err := os.MkdirTemp("", "bv_test_storage_*")
	if err != nil {
		t.Fatalf("Failed to create temp storage dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	localStorage, err := storage.NewLocalStorage(tempDir, cfg.StorageEncryptionKey)
	if err != nil {
		t.Fatalf("Failed to init storage: %v", err)
	}

	appService := NewAppService(appRepo, apiKeyRepo, auditRepo)
	uploadService := NewUploadService(localStorage, uploadRepo, backupRepo, auditRepo)

	// 1. Create Application and API Key
	app, err := appService.CreateApp(ctx, "billing-service", "Billing Service", "Billing database backups", 30, 3, "tester", "tester@test.com", "127.0.0.1", "test-agent")
	if err != nil {
		t.Fatalf("Failed to create app: %v", err)
	}

	apiKey, err := appService.CreateApiKey(ctx, app.ID, "Server 1 Key", "127.0.0.1", "tester", "tester@test.com", "127.0.0.1", "test-agent")
	if err != nil {
		t.Fatalf("Failed to create api key: %v", err)
	}

	// 2. Prepare mock backup data in 3 chunks
	chunk1 := []byte("HEADER: PostgreSQL database dump\n")
	chunk2 := []byte("TABLE users (id int, email text);\nINSERT INTO users VALUES (1, 'alice@example.com');\n")
	chunk3 := []byte("FOOTER: Dump completed successfully.\n")

	var fullData bytes.Buffer
	fullData.Write(chunk1)
	fullData.Write(chunk2)
	fullData.Write(chunk3)

	hasher := sha256.New()
	hasher.Write(fullData.Bytes())
	expectedSHA256 := hex.EncodeToString(hasher.Sum(nil))
	totalSize := int64(fullData.Len())

	// 3. Initiate upload session
	sess, err := uploadService.CreateSession(ctx, app, "billing.sql.gz", totalSize, expectedSHA256)
	if err != nil {
		t.Fatalf("Failed to create upload session: %v", err)
	}

	// 4. Send Chunk 1
	offset1, err := uploadService.AppendChunk(ctx, sess.ID, bytes.NewReader(chunk1), 0)
	if err != nil {
		t.Fatalf("Failed to write chunk 1: %v", err)
	}
	if offset1 != int64(len(chunk1)) {
		t.Errorf("Expected offset %d, got %d", len(chunk1), offset1)
	}

	// 5. Send Chunk 2
	offset2, err := uploadService.AppendChunk(ctx, sess.ID, bytes.NewReader(chunk2), offset1)
	if err != nil {
		t.Fatalf("Failed to write chunk 2: %v", err)
	}
	if offset2 != int64(len(chunk1)+len(chunk2)) {
		t.Errorf("Expected offset %d, got %d", len(chunk1)+len(chunk2), offset2)
	}

	// 6. Test invalid offset rejection (e.g. duplicate or out-of-order chunk)
	_, err = uploadService.AppendChunk(ctx, sess.ID, bytes.NewReader(chunk3), 0)
	if err == nil {
		t.Errorf("Expected error for out-of-order offset, got nil")
	}

	// 7. Send Chunk 3 with correct offset
	offset3, err := uploadService.AppendChunk(ctx, sess.ID, bytes.NewReader(chunk3), offset2)
	if err != nil {
		t.Fatalf("Failed to write chunk 3: %v", err)
	}
	if offset3 != totalSize {
		t.Errorf("Expected offset %d, got %d", totalSize, offset3)
	}

	// 8. Complete session & verify SHA-256
	backup, err := uploadService.CompleteSession(ctx, sess.ID, app, "127.0.0.1")
	if err != nil {
		t.Fatalf("CompleteSession failed: %v", err)
	}

	if backup.Status != model.BackupStatusVerified {
		t.Errorf("Expected backup status %s, got %s", model.BackupStatusVerified, backup.Status)
	}
	if backup.SHA256 != expectedSHA256 {
		t.Errorf("Expected sha256 %s, got %s", expectedSHA256, backup.SHA256)
	}
	if backup.SizeBytes != totalSize {
		t.Errorf("Expected size %d, got %d", totalSize, backup.SizeBytes)
	}

	// Verify file exists on permanent disk
	fullPath, err := localStorage.GetFullPath(backup.StoragePath)
	if err != nil {
		t.Fatalf("Failed to resolve storage path: %v", err)
	}
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		t.Fatalf("Backup file does not exist at permanent path: %s", fullPath)
	}

	// 9. Test SHA-256 mismatch detection on corrupt upload
	sessBad, err := uploadService.CreateSession(ctx, app, "corrupted.sql", int64(len("hello")), "0000000000000000000000000000000000000000000000000000000000000000")
	if err != nil {
		t.Fatalf("Failed to create session for bad upload: %v", err)
	}

	_, _ = uploadService.AppendChunk(ctx, sessBad.ID, bytes.NewReader([]byte("hello")), 0)
	_, err = uploadService.CompleteSession(ctx, sessBad.ID, app, "127.0.0.1")
	if err == nil {
		t.Errorf("Expected error for checksum mismatch, got nil")
	}

	// Verify temporary part was purged
	tempPartPath := filepath.Join(tempDir, sessBad.TempFilePath)
	if _, err := os.Stat(tempPartPath); !os.IsNotExist(err) {
		t.Errorf("Expected corrupted temp file to be deleted upon failure")
	}

	_ = apiKey
}
