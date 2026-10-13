package handler

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"backupvault/internal/config"
	"backupvault/internal/database"
	"backupvault/internal/model"
	"backupvault/internal/repository"
	"backupvault/internal/security"
	"backupvault/internal/service"
	"backupvault/pkg/storage"

	"github.com/go-chi/chi/v5"
	"github.com/pquerna/otp/totp"
)

func setupFullTestApp(t *testing.T) (*chi.Mux, *config.Config, *service.AuthService, *model.User, *model.Session, *model.Backup, *service.BackupService, string) {
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

	_, _ = db.Pool.Exec(ctx, "TRUNCATE TABLE users, sessions, applications, api_keys, backups, upload_sessions, download_tokens, audit_logs CASCADE")

	userRepo := repository.NewUserRepository(db.Pool)
	sessionRepo := repository.NewSessionRepository(db.Pool)
	auditRepo := repository.NewAuditRepository(db.Pool)
	lockoutRepo := repository.NewLockoutRepository(db.Pool)
	appRepo := repository.NewAppRepository(db.Pool)
	apiKeyRepo := repository.NewApiKeyRepository(db.Pool)
	backupRepo := repository.NewBackupRepository(db.Pool)
	uploadRepo := repository.NewUploadRepository(db.Pool)
	tokenRepo := repository.NewDownloadTokenRepository(db.Pool)

	tempDir, err := os.MkdirTemp("", "bv_backup_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	localStorage, err := storage.NewLocalStorage(tempDir, cfg.StorageEncryptionKey)
	if err != nil {
		t.Fatalf("Failed to init storage: %v", err)
	}

	// Create test admin with 2FA enabled
	adminUser := &model.User{
		Email:       "superadmin@backupvault.local",
		Role:        model.RoleAdmin,
		TOTPEnabled: true,
	}
	totpSetup, _ := security.GenerateTOTP(adminUser.Email, "BackupVault")
	adminUser.TOTPSecret = &totpSetup.Secret
	hash, _ := security.HashPassword("TestPass123!")
	adminUser.PasswordHash = hash

	_ = userRepo.EnsureAdminUser(ctx, adminUser.Email, "TestPass123!")
	adminUser, _ = userRepo.GetByEmail(ctx, adminUser.Email)
	_ = userRepo.SetTOTPSecret(ctx, adminUser.ID, totpSetup.Secret)
	_ = userRepo.EnableTOTP(ctx, adminUser.ID, []string{})

	authService := service.NewAuthService(userRepo, sessionRepo, auditRepo, lockoutRepo)
	appService := service.NewAppService(appRepo, apiKeyRepo, auditRepo)
	uploadService := service.NewUploadService(localStorage, uploadRepo, backupRepo, auditRepo)
	backupService := service.NewBackupService(localStorage, backupRepo, tokenRepo, auditRepo, authService)

	// Create admin session
	sessID, _ := security.GenerateSessionID()
	csrfTok, _ := security.GenerateCSRFToken()
	session := &model.Session{
		ID:           sessID,
		UserID:       adminUser.ID,
		CSRFToken:    csrfTok,
		IPAddress:    "127.0.0.1",
		UserAgent:    "TestAgent",
		ExpiresAt:    time.Now().Add(24 * time.Hour),
		CreatedAt:    time.Now(),
		LastActiveAt: time.Now(),
	}
	_ = sessionRepo.Create(ctx, session)

	// Create app and dummy backup
	app, _ := appService.CreateApp(ctx, "inventory-app", "Inventory App", "", 30, 3, adminUser.ID.String(), adminUser.Email, "127.0.0.1", "test")
	content := []byte("PostgreSQL database dump: 0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ")
	h := sha256.Sum256(content)
	shaHex := hex.EncodeToString(h[:])

	backup, err := uploadService.UploadDirect(ctx, app, "inventory_db.dump", shaHex, bytes.NewReader(content), "127.0.0.1")
	if err != nil {
		t.Fatalf("Failed to upload test backup: %v", err)
	}

	authHandler := NewAuthHandler(cfg, authService)
	appHandler := NewAppHandler(appService)
	uploadHandler := NewUploadHandler(appService, uploadService)
	backupHandler := NewBackupHandler(backupService)
	statsHandler := NewStatsHandler(cfg, backupService, auditRepo)

	r := chi.NewRouter()
	r.Use(AuthMiddleware(authService))
	r.Use(CSRFMiddleware())

	r.Get("/api/v1/download/{token}", backupHandler.HandleDownload)

	r.Route("/api/v1/backups", func(r chi.Router) {
		r.Use(RequireAuth)
		r.Get("/", backupHandler.HandleList)
		r.Get("/{id}", backupHandler.HandleGet)
		r.Post("/{id}/download-link", backupHandler.HandleCreateDownloadLink)
		r.Delete("/{id}", backupHandler.HandleDelete)
	})

	r.Route("/api/v1/stats", func(r chi.Router) {
		r.Use(RequireAuth)
		r.Get("/", statsHandler.HandleGetStats)
	})

	_ = authHandler
	_ = appHandler
	_ = uploadHandler

	return r, cfg, authService, adminUser, session, backup, backupService, totpSetup.Secret
}

func TestBackupListAndFilter(t *testing.T) {
	router, _, _, _, sess, backup, _, _ := setupFullTestApp(t)

	// 1. List backups without filter
	req := httptest.NewRequest("GET", "/api/v1/backups", nil)
	req.AddCookie(&http.Cookie{Name: security.SessionCookieName, Value: sess.ID})
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 on /api/v1/backups, got: %d", w.Code)
	}

	var listRes struct {
		Backups []model.Backup `json:"backups"`
		Total   int64          `json:"total"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &listRes)
	if listRes.Total != 1 || len(listRes.Backups) != 1 {
		t.Fatalf("Expected 1 backup in list, got total %d", listRes.Total)
	}
	if listRes.Backups[0].ID != backup.ID {
		t.Errorf("Expected backup ID %s, got %s", backup.ID, listRes.Backups[0].ID)
	}

	// 2. Search query filter
	req = httptest.NewRequest("GET", "/api/v1/backups?q=inventory", nil)
	req.AddCookie(&http.Cookie{Name: security.SessionCookieName, Value: sess.ID})
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	var matchRes struct {
		Total int64 `json:"total"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &matchRes)
	if matchRes.Total != 1 {
		t.Errorf("Expected 1 match for q=inventory, got: %d", matchRes.Total)
	}

	// 3. Search non-matching query
	req = httptest.NewRequest("GET", "/api/v1/backups?q=nonexistent", nil)
	req.AddCookie(&http.Cookie{Name: security.SessionCookieName, Value: sess.ID})
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	var nonMatchRes struct {
		Total int64 `json:"total"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &nonMatchRes)
	if nonMatchRes.Total != 0 {
		t.Errorf("Expected 0 matches, got: %d", nonMatchRes.Total)
	}
}

func TestDownloadTokenAndRangeSupport(t *testing.T) {
	router, _, _, _, sess, backup, _, _ := setupFullTestApp(t)

	// 1. Generate download link
	req := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/backups/%s/download-link", backup.ID), nil)
	req.AddCookie(&http.Cookie{Name: security.SessionCookieName, Value: sess.ID})
	req.Header.Set(security.CSRFHeaderName, sess.CSRFToken)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 on download-link, got: %d, body: %s", w.Code, w.Body.String())
	}

	var linkRes struct {
		DownloadURL string `json:"download_url"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &linkRes)
	if linkRes.DownloadURL == "" {
		t.Fatalf("Expected non-empty download URL")
	}

	// 2. Download whole file using the token
	req = httptest.NewRequest("GET", linkRes.DownloadURL, nil)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 on file download, got: %d", w.Code)
	}

	downloadedBytes, _ := io.ReadAll(w.Body)
	if int64(len(downloadedBytes)) != backup.SizeBytes {
		t.Errorf("Expected %d bytes downloaded, got %d", backup.SizeBytes, len(downloadedBytes))
	}

	// 3. Second download attempt with same token must fail (single-use enforced!)
	req2 := httptest.NewRequest("GET", linkRes.DownloadURL, nil)
	w2 := httptest.NewRecorder()
	router.ServeHTTP(w2, req2)

	if w2.Code != http.StatusGone {
		t.Errorf("Expected 410 Gone for reused download token, got: %d", w2.Code)
	}

	// 4. Test HTTP Range request with a new token
	reqNewLink := httptest.NewRequest("POST", fmt.Sprintf("/api/v1/backups/%s/download-link", backup.ID), nil)
	reqNewLink.AddCookie(&http.Cookie{Name: security.SessionCookieName, Value: sess.ID})
	reqNewLink.Header.Set(security.CSRFHeaderName, sess.CSRFToken)
	wNewLink := httptest.NewRecorder()
	router.ServeHTTP(wNewLink, reqNewLink)

	_ = json.Unmarshal(wNewLink.Body.Bytes(), &linkRes)

	rangeReq := httptest.NewRequest("GET", linkRes.DownloadURL, nil)
	rangeReq.Header.Set("Range", "bytes=0-9")
	rangeW := httptest.NewRecorder()
	router.ServeHTTP(rangeW, rangeReq)

	if rangeW.Code != http.StatusPartialContent {
		t.Errorf("Expected 206 Partial Content for Range header, got: %d", rangeW.Code)
	}

	rangeBody, _ := io.ReadAll(rangeW.Body)
	if len(rangeBody) != 10 {
		t.Errorf("Expected exactly 10 bytes for range 0-9, got: %d", len(rangeBody))
	}
}

func TestManualDeleteWith2FA(t *testing.T) {
	router, _, _, _, sess, backup, _, totpSecret := setupFullTestApp(t)

	// 1. Delete without 2FA code should fail
	req := httptest.NewRequest("DELETE", fmt.Sprintf("/api/v1/backups/%s", backup.ID), nil)
	req.AddCookie(&http.Cookie{Name: security.SessionCookieName, Value: sess.ID})
	req.Header.Set(security.CSRFHeaderName, sess.CSRFToken)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for missing 2FA code, got: %d", w.Code)
	}

	// 2. Delete with invalid 2FA code should fail
	reqBad2FA := httptest.NewRequest("DELETE", fmt.Sprintf("/api/v1/backups/%s", backup.ID), nil)
	reqBad2FA.AddCookie(&http.Cookie{Name: security.SessionCookieName, Value: sess.ID})
	reqBad2FA.Header.Set(security.CSRFHeaderName, sess.CSRFToken)
	reqBad2FA.Header.Set("X-2FA-Code", "999999")
	wBad2FA := httptest.NewRecorder()
	router.ServeHTTP(wBad2FA, reqBad2FA)

	if wBad2FA.Code != http.StatusBadRequest {
		t.Errorf("Expected 400 for wrong 2FA code, got: %d", wBad2FA.Code)
	}

	// 3. Delete with valid 2FA code succeeds
	validCode, err := totp.GenerateCode(totpSecret, time.Now())
	if err != nil {
		t.Fatalf("Failed to generate valid 2FA code: %v", err)
	}

	reqGood2FA := httptest.NewRequest("DELETE", fmt.Sprintf("/api/v1/backups/%s", backup.ID), nil)
	reqGood2FA.AddCookie(&http.Cookie{Name: security.SessionCookieName, Value: sess.ID})
	reqGood2FA.Header.Set(security.CSRFHeaderName, sess.CSRFToken)
	reqGood2FA.Header.Set("X-2FA-Code", validCode)
	wGood2FA := httptest.NewRecorder()
	router.ServeHTTP(wGood2FA, reqGood2FA)

	if wGood2FA.Code != http.StatusOK {
		t.Fatalf("Expected 200 for valid 2FA manual delete, got: %d, body: %s", wGood2FA.Code, wGood2FA.Body.String())
	}
}
