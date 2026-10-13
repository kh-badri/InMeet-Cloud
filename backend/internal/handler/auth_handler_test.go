package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"backupvault/internal/config"
	"backupvault/internal/database"
	"backupvault/internal/model"
	"backupvault/internal/repository"
	"backupvault/internal/security"
	"backupvault/internal/service"

	"github.com/go-chi/chi/v5"
	"github.com/pquerna/otp/totp"
)

func setupTestApp(t *testing.T) (*chi.Mux, *service.AuthService, *config.Config) {
	cfg, err := config.Load("../../.env")
	if err != nil {
		t.Fatalf("Failed to load config: %v", err)
	}

	ctx := context.Background()
	db, err := database.Connect(ctx, cfg.TestDatabaseURL, 5, 2)
	if err != nil {
		t.Fatalf("Failed to connect to test db: %v", err)
	}

	if err := db.Migrate(ctx); err != nil {
		t.Fatalf("Failed to run migrations: %v", err)
	}

	userRepo := repository.NewUserRepository(db.Pool)
	sessionRepo := repository.NewSessionRepository(db.Pool)
	auditRepo := repository.NewAuditRepository(db.Pool)
	lockoutRepo := repository.NewLockoutRepository(db.Pool)

	// Clean users and sessions for clean testing
	_, _ = db.Pool.Exec(ctx, "TRUNCATE TABLE users, sessions, audit_logs, login_attempts CASCADE")

	if err := userRepo.EnsureAdminUser(ctx, cfg.InitialAdminEmail, cfg.InitialAdminPassword); err != nil {
		t.Fatalf("Failed to ensure admin user: %v", err)
	}

	authService := service.NewAuthService(userRepo, sessionRepo, auditRepo, lockoutRepo)
	authHandler := NewAuthHandler(cfg, authService)

	r := chi.NewRouter()
	r.Use(AuthMiddleware(authService))
	r.Use(CSRFMiddleware())

	r.Route("/api/v1/auth", func(r chi.Router) {
		r.Post("/login", authHandler.HandleLogin)
		r.Post("/verify-2fa", authHandler.HandleVerify2FA)

		r.Group(func(r chi.Router) {
			r.Use(RequireAuth)
			r.Get("/me", authHandler.HandleMe)
			r.Post("/logout", authHandler.HandleLogout)
			r.Post("/totp/setup", authHandler.HandleSetupTOTP)
			r.Post("/totp/confirm", authHandler.HandleConfirmTOTP)
			r.Post("/totp/disable", authHandler.HandleDisableTOTP)
		})
	})

	return r, authService, cfg
}

func TestAuthFlow(t *testing.T) {
	router, _, cfg := setupTestApp(t)

	// 1. Test Login with incorrect password
	wrongLoginBody, _ := json.Marshal(map[string]string{
		"email":    cfg.InitialAdminEmail,
		"password": "WrongPassword123!",
	})
	req := httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewReader(wrongLoginBody))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("Expected 401 for wrong password, got: %d", w.Code)
	}

	// 2. Test Login with correct password
	loginBody, _ := json.Marshal(map[string]string{
		"email":    cfg.InitialAdminEmail,
		"password": cfg.InitialAdminPassword,
	})
	req = httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewReader(loginBody))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 for correct login, got: %d, body: %s", w.Code, w.Body.String())
	}

	// Extract session and CSRF cookies
	var sessionCookie *http.Cookie
	var csrfCookie *http.Cookie
	for _, c := range w.Result().Cookies() {
		if c.Name == security.SessionCookieName {
			sessionCookie = c
		}
		if c.Name == security.CSRFCookieName {
			csrfCookie = c
		}
	}

	if sessionCookie == nil || csrfCookie == nil {
		t.Fatalf("Expected session and CSRF cookies to be set")
	}

	// 3. Test /api/v1/auth/me with session
	req = httptest.NewRequest("GET", "/api/v1/auth/me", nil)
	req.AddCookie(sessionCookie)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 on /me, got: %d", w.Code)
	}

	var meRes struct {
		User      model.User `json:"user"`
		CSRFToken string     `json:"csrf_token"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &meRes)
	if meRes.User.Email != cfg.InitialAdminEmail {
		t.Errorf("Expected email %s, got: %s", cfg.InitialAdminEmail, meRes.User.Email)
	}

	// 4. Test Setup TOTP
	req = httptest.NewRequest("POST", "/api/v1/auth/totp/setup", nil)
	req.AddCookie(sessionCookie)
	req.Header.Set(security.CSRFHeaderName, csrfCookie.Value)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 on /totp/setup, got: %d, body: %s", w.Code, w.Body.String())
	}

	var setupRes security.TOTPSetup
	_ = json.Unmarshal(w.Body.Bytes(), &setupRes)
	if setupRes.Secret == "" || len(setupRes.RecoveryCodes) != 10 {
		t.Fatalf("Invalid TOTP setup response")
	}

	// 5. Test Confirm TOTP with valid passcode
	validCode, err := totp.GenerateCode(setupRes.Secret, time.Now())
	if err != nil {
		t.Fatalf("Failed to generate code: %v", err)
	}

	confirmBody, _ := json.Marshal(map[string]interface{}{
		"passcode":       validCode,
		"recovery_codes": setupRes.RecoveryCodes,
	})
	req = httptest.NewRequest("POST", "/api/v1/auth/totp/confirm", bytes.NewReader(confirmBody))
	req.AddCookie(sessionCookie)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(security.CSRFHeaderName, csrfCookie.Value)
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 on /totp/confirm, got: %d, body: %s", w.Code, w.Body.String())
	}

	// 6. Test Login now requires 2FA!
	req = httptest.NewRequest("POST", "/api/v1/auth/login", bytes.NewReader(loginBody))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 for step 1 login, got: %d", w.Code)
	}

	var step1Res struct {
		Requires2FA bool   `json:"requires_2fa"`
		Ticket      string `json:"ticket"`
	}
	_ = json.Unmarshal(w.Body.Bytes(), &step1Res)
	if !step1Res.Requires2FA || step1Res.Ticket == "" {
		t.Fatalf("Expected 2FA required with ticket, got: %+v", step1Res)
	}

	// 7. Verify 2FA using a recovery code!
	recoveryCodeToUse := setupRes.RecoveryCodes[0]
	verify2FABody, _ := json.Marshal(map[string]string{
		"ticket": step1Res.Ticket,
		"code":   recoveryCodeToUse,
	})
	req = httptest.NewRequest("POST", "/api/v1/auth/verify-2fa", bytes.NewReader(verify2FABody))
	req.Header.Set("Content-Type", "application/json")
	w = httptest.NewRecorder()
	router.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 on /verify-2fa with recovery code, got: %d, body: %s", w.Code, w.Body.String())
	}
}
