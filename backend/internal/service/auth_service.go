package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"backupvault/internal/model"
	"backupvault/internal/repository"
	"backupvault/internal/security"

	"github.com/google/uuid"
)

var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrAccountLocked      = errors.New("account is temporarily locked due to multiple failed login attempts")
	ErrInvalid2FACode     = errors.New("invalid 2FA passcode or recovery code")
	Err2FARequired        = errors.New("two-factor authentication is required")
	ErrInvalidTicket      = errors.New("2FA authentication ticket is invalid or expired")
	ErrUnauthorized       = errors.New("unauthorized")
)

type Temp2FATicket struct {
	UserID    uuid.UUID
	ExpiresAt time.Time
}

type AuthService struct {
	userRepo    *repository.UserRepository
	sessionRepo *repository.SessionRepository
	auditRepo   *repository.AuditRepository
	lockoutRepo *repository.LockoutRepository

	// In-memory 2FA tickets store (short lived, 5 minutes)
	ticketsMu sync.RWMutex
	tickets   map[string]Temp2FATicket
}

func NewAuthService(
	userRepo *repository.UserRepository,
	sessionRepo *repository.SessionRepository,
	auditRepo *repository.AuditRepository,
	lockoutRepo *repository.LockoutRepository,
) *AuthService {
	return &AuthService{
		userRepo:    userRepo,
		sessionRepo: sessionRepo,
		auditRepo:   auditRepo,
		lockoutRepo: lockoutRepo,
		tickets:     make(map[string]Temp2FATicket),
	}
}

type LoginResult struct {
	Session     *model.Session `json:"session,omitempty"`
	User        *model.User    `json:"user,omitempty"`
	Requires2FA bool           `json:"requires_2fa"`
	TwoFATicket string         `json:"two_fa_ticket,omitempty"`
}

func (s *AuthService) Login(ctx context.Context, email, password, ip, userAgent string) (*LoginResult, error) {
	// 1. Check IP lockout
	locked, dur, err := s.lockoutRepo.IsLocked(ctx, ip)
	if err != nil {
		return nil, err
	}
	if locked {
		return nil, fmt.Errorf("%w: please try again in %v", ErrAccountLocked, dur.Round(time.Second))
	}

	// 2. Check user exists
	user, err := s.userRepo.GetByEmail(ctx, email)
	if err != nil {
		_, _, _ = s.lockoutRepo.RecordFailure(ctx, ip)
		_ = s.auditRepo.Log(ctx, "user", "anonymous", email, "login_failed", "auth", "", ip, userAgent, map[string]interface{}{"reason": "user not found"})
		return nil, ErrInvalidCredentials
	}

	// 3. Verify Argon2id password
	match, err := security.ComparePassword(password, user.PasswordHash)
	if err != nil || !match {
		isLocked, lockoutDur, _ := s.lockoutRepo.RecordFailure(ctx, ip)
		_ = s.auditRepo.Log(ctx, "user", user.ID.String(), user.Email, "login_failed", "auth", "", ip, userAgent, map[string]interface{}{"reason": "invalid password"})
		if isLocked {
			return nil, fmt.Errorf("%w: please try again in %v", ErrAccountLocked, lockoutDur.Round(time.Second))
		}
		return nil, ErrInvalidCredentials
	}

	// Password valid: reset IP failures
	_ = s.lockoutRepo.Reset(ctx, ip)

	// 4. Check if 2FA is required (always required if enabled, and Admin MUST have 2FA enabled)
	if user.TOTPEnabled {
		ticketToken, err := s.createTemp2FATicket(user.ID)
		if err != nil {
			return nil, fmt.Errorf("failed to create 2FA session ticket: %w", err)
		}

		_ = s.auditRepo.Log(ctx, "user", user.ID.String(), user.Email, "login_step1_success", "auth", "", ip, userAgent, nil)

		return &LoginResult{
			Requires2FA: true,
			TwoFATicket: ticketToken,
		}, nil
	}

	// If 2FA not enabled (e.g. initial login before setup)
	sess, err := s.createSession(ctx, user.ID, ip, userAgent)
	if err != nil {
		return nil, err
	}

	_ = s.auditRepo.Log(ctx, "user", user.ID.String(), user.Email, "login_success", "auth", "", ip, userAgent, map[string]interface{}{"totp_enabled": false})

	return &LoginResult{
		Session:     sess,
		User:        user,
		Requires2FA: false,
	}, nil
}

func (s *AuthService) Verify2FA(ctx context.Context, ticketToken, code, ip, userAgent string) (*model.Session, *model.User, error) {
	userID, ok := s.consumeTemp2FATicket(ticketToken)
	if !ok {
		return nil, nil, ErrInvalidTicket
	}

	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return nil, nil, ErrUnauthorized
	}

	if !user.TOTPEnabled || user.TOTPSecret == nil {
		return nil, nil, errors.New("2FA is not configured for this user")
	}

	// Try validating as 6-digit TOTP passcode
	isValid := security.ValidatePasscode(code, *user.TOTPSecret)

	// If passcode failed, try validating as recovery code
	if !isValid && len(user.RecoveryCodes) > 0 {
		var remaining []string
		isValid, remaining = security.VerifyAndConsumeRecoveryCode(code, user.RecoveryCodes)
		if isValid {
			// Update remaining recovery codes in DB
			_ = s.userRepo.UpdateRecoveryCodes(ctx, user.ID, remaining)
			_ = s.auditRepo.Log(ctx, "user", user.ID.String(), user.Email, "recovery_code_used", "auth", "", ip, userAgent, map[string]interface{}{
				"remaining_count": len(remaining),
			})
		}
	}

	if !isValid {
		_ = s.auditRepo.Log(ctx, "user", user.ID.String(), user.Email, "2fa_verify_failed", "auth", "", ip, userAgent, nil)
		return nil, nil, ErrInvalid2FACode
	}

	sess, err := s.createSession(ctx, user.ID, ip, userAgent)
	if err != nil {
		return nil, nil, err
	}

	_ = s.auditRepo.Log(ctx, "user", user.ID.String(), user.Email, "login_2fa_success", "auth", "", ip, userAgent, nil)

	return sess, user, nil
}

// ReAuth2FA verifies passcode for critical operations like manual delete
func (s *AuthService) ReAuth2FA(ctx context.Context, userID uuid.UUID, code string) error {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return ErrUnauthorized
	}

	if !user.TOTPEnabled || user.TOTPSecret == nil {
		// If 2FA not enabled, check password? PRD requires 2FA for destructive actions.
		return errors.New("2FA must be enabled to perform sensitive actions")
	}

	if !security.ValidatePasscode(code, *user.TOTPSecret) {
		return ErrInvalid2FACode
	}

	return nil
}

func (s *AuthService) SetupTOTP(ctx context.Context, userID uuid.UUID) (*security.TOTPSetup, error) {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	setup, err := security.GenerateTOTP(user.Email, "BackupVault")
	if err != nil {
		return nil, err
	}

	// Store secret provisionally (totp_enabled remains false until confirmed)
	if err := s.userRepo.SetTOTPSecret(ctx, user.ID, setup.Secret); err != nil {
		return nil, err
	}

	return setup, nil
}

func (s *AuthService) ConfirmEnableTOTP(ctx context.Context, userID uuid.UUID, passcode string, recoveryCodes []string, ip, userAgent string) error {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return err
	}

	if user.TOTPSecret == nil {
		return errors.New("TOTP setup has not been initiated")
	}

	if !security.ValidatePasscode(passcode, *user.TOTPSecret) {
		return ErrInvalid2FACode
	}

	// Hash recovery codes before saving
	hashedCodes := make([]string, len(recoveryCodes))
	for i, c := range recoveryCodes {
		hashedCodes[i] = security.HashRecoveryCode(c)
	}

	if err := s.userRepo.EnableTOTP(ctx, user.ID, hashedCodes); err != nil {
		return err
	}

	_ = s.auditRepo.Log(ctx, "user", user.ID.String(), user.Email, "totp_enabled", "auth", "", ip, userAgent, nil)
	return nil
}

func (s *AuthService) DisableTOTP(ctx context.Context, userID uuid.UUID, passcode, ip, userAgent string) error {
	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return err
	}

	if !user.TOTPEnabled || user.TOTPSecret == nil {
		return nil
	}

	if !security.ValidatePasscode(passcode, *user.TOTPSecret) {
		return ErrInvalid2FACode
	}

	if err := s.userRepo.DisableTOTP(ctx, user.ID); err != nil {
		return err
	}

	_ = s.auditRepo.Log(ctx, "user", user.ID.String(), user.Email, "totp_disabled", "auth", "", ip, userAgent, nil)
	return nil
}

func (s *AuthService) ValidateSession(ctx context.Context, sessionID string) (*model.User, *model.Session, error) {
	sess, err := s.sessionRepo.GetByID(ctx, sessionID)
	if err != nil {
		return nil, nil, err
	}

	user, err := s.userRepo.GetByID(ctx, sess.UserID)
	if err != nil {
		return nil, nil, err
	}

	// Touch session timestamp asynchronously or lazily
	_ = s.sessionRepo.Touch(ctx, sess.ID)

	return user, sess, nil
}

func (s *AuthService) Logout(ctx context.Context, sessionID string, ip, userAgent string) error {
	sess, err := s.sessionRepo.GetByID(ctx, sessionID)
	if err == nil && sess != nil {
		_ = s.auditRepo.Log(ctx, "user", sess.UserID.String(), "", "logout", "auth", "", ip, userAgent, nil)
	}
	return s.sessionRepo.Delete(ctx, sessionID)
}

func (s *AuthService) createSession(ctx context.Context, userID uuid.UUID, ip, userAgent string) (*model.Session, error) {
	sessionID, err := security.GenerateSessionID()
	if err != nil {
		return nil, err
	}

	csrfToken, err := security.GenerateCSRFToken()
	if err != nil {
		return nil, err
	}

	now := time.Now()
	sess := &model.Session{
		ID:           sessionID,
		UserID:       userID,
		CSRFToken:    csrfToken,
		IPAddress:    ip,
		UserAgent:    userAgent,
		ExpiresAt:    now.Add(security.SessionDuration),
		CreatedAt:    now,
		LastActiveAt: now,
	}

	if err := s.sessionRepo.Create(ctx, sess); err != nil {
		return nil, err
	}

	return sess, nil
}

func (s *AuthService) createTemp2FATicket(userID uuid.UUID) (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	token := hex.EncodeToString(b)

	s.ticketsMu.Lock()
	defer s.ticketsMu.Unlock()

	s.tickets[token] = Temp2FATicket{
		UserID:    userID,
		ExpiresAt: time.Now().Add(5 * time.Minute),
	}

	return token, nil
}

func (s *AuthService) consumeTemp2FATicket(token string) (uuid.UUID, bool) {
	s.ticketsMu.Lock()
	defer s.ticketsMu.Unlock()

	ticket, ok := s.tickets[token]
	if !ok {
		return uuid.Nil, false
	}

	delete(s.tickets, token)

	if time.Now().After(ticket.ExpiresAt) {
		return uuid.Nil, false
	}

	return ticket.UserID, true
}

func (s *AuthService) ChangePassword(ctx context.Context, userID uuid.UUID, currentPassword, newPassword, ip, userAgent string) error {
	if len(newPassword) < 8 {
		return errors.New("password baru minimal 8 karakter")
	}

	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return err
	}

	match, err := security.ComparePassword(currentPassword, user.PasswordHash)
	if err != nil || !match {
		return errors.New("password saat ini salah")
	}

	newHash, err := security.HashPassword(newPassword)
	if err != nil {
		return fmt.Errorf("gagal meng-enkripsi password baru: %w", err)
	}

	if err := s.userRepo.UpdatePassword(ctx, userID, newHash); err != nil {
		return err
	}

	_ = s.auditRepo.Log(ctx, "user", userID.String(), "", "change_password", "auth", "", ip, userAgent, map[string]interface{}{
		"email": user.Email,
	})

	return nil
}

func (s *AuthService) UpdateEmail(ctx context.Context, userID uuid.UUID, newEmail, currentPassword, ip, userAgent string) (*model.User, error) {
	newEmail = strings.TrimSpace(newEmail)
	if newEmail == "" || !strings.Contains(newEmail, "@") {
		return nil, errors.New("format email tidak valid")
	}

	user, err := s.userRepo.GetByID(ctx, userID)
	if err != nil {
		return nil, err
	}

	match, err := security.ComparePassword(currentPassword, user.PasswordHash)
	if err != nil || !match {
		return nil, errors.New("password saat ini salah")
	}

	// Check if already used by another user
	existing, err := s.userRepo.GetByEmail(ctx, newEmail)
	if err == nil && existing != nil && existing.ID != userID {
		return nil, errors.New("email sudah digunakan oleh akun lain")
	}

	oldEmail := user.Email
	if err := s.userRepo.UpdateEmail(ctx, userID, newEmail); err != nil {
		return nil, err
	}

	user.Email = newEmail

	_ = s.auditRepo.Log(ctx, "user", userID.String(), "", "change_email", "auth", "", ip, userAgent, map[string]interface{}{
		"old_email": oldEmail,
		"new_email": newEmail,
	})

	return user, nil
}

func (s *AuthService) CreateTeamUser(ctx context.Context, adminID uuid.UUID, email, password string, role model.Role, quotaBytes int64) (*model.User, error) {
	email = strings.TrimSpace(email)
	if email == "" || !strings.Contains(email, "@") {
		return nil, errors.New("format email tidak valid")
	}

	if len(password) < 8 {
		return nil, errors.New("password minimal 8 karakter")
	}

	if role == "" {
		role = model.RoleUser
	}
	if role != model.RoleUser && role != model.RoleViewer {
		return nil, errors.New("hanya dapat membuat peran user atau viewer untuk tim")
	}

	if quotaBytes <= 0 {
		quotaBytes = 16106127360 // 15 GB
	}

	// Check if already used
	existing, err := s.userRepo.GetByEmail(ctx, email)
	if err == nil && existing != nil && strings.EqualFold(existing.Email, email) {
		return nil, errors.New("email sudah terdaftar dalam sistem")
	}

	hash, err := security.HashPassword(password)
	if err != nil {
		return nil, fmt.Errorf("gagal mengenkripsi password: %w", err)
	}

	user, err := s.userRepo.CreateUser(ctx, email, hash, role, quotaBytes)
	if err != nil {
		return nil, err
	}

	s.auditRepo.LogCtx(ctx, "user", adminID.String(), "team_user_created", "auth", user.ID.String(), map[string]interface{}{
		"email":               email,
		"role":                role,
		"storage_quota_bytes": quotaBytes,
	})

	return user, nil
}

func (s *AuthService) ListTeamUsers(ctx context.Context) ([]*model.User, error) {
	return s.userRepo.ListUsers(ctx)
}

func (s *AuthService) DeleteTeamUser(ctx context.Context, adminID, targetUserID uuid.UUID) error {
	if adminID == targetUserID {
		return errors.New("tidak dapat menghapus akun Anda sendiri")
	}

	target, err := s.userRepo.GetByID(ctx, targetUserID)
	if err != nil {
		return err
	}

	if target.Role == model.RoleAdmin {
		return errors.New("tidak dapat menghapus akun administrator")
	}

	if err := s.userRepo.DeleteUser(ctx, targetUserID); err != nil {
		return err
	}

	s.auditRepo.LogCtx(ctx, "user", adminID.String(), "team_user_deleted", "auth", targetUserID.String(), map[string]interface{}{
		"email": target.Email,
		"role":  target.Role,
	})

	return nil
}

func (s *AuthService) ResetTeamUserPassword(ctx context.Context, adminID, targetUserID uuid.UUID, newPassword string) error {
	if len(newPassword) < 8 {
		return errors.New("password baru minimal 8 karakter")
	}

	target, err := s.userRepo.GetByID(ctx, targetUserID)
	if err != nil {
		return err
	}

	hash, err := security.HashPassword(newPassword)
	if err != nil {
		return fmt.Errorf("gagal mengenkripsi password: %w", err)
	}

	if err := s.userRepo.UpdatePassword(ctx, targetUserID, hash); err != nil {
		return err
	}

	s.auditRepo.LogCtx(ctx, "user", adminID.String(), "team_user_password_reset", "auth", targetUserID.String(), map[string]interface{}{
		"email": target.Email,
	})

	return nil
}
