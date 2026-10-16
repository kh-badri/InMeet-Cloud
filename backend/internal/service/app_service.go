package service

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net"
	"strings"

	"backupvault/internal/model"
	"backupvault/internal/repository"
	"backupvault/internal/security"

	"github.com/google/uuid"
)

var (
	ErrIPNotAllowed = errors.New("request IP is not in allowed IP list for this API key")
)

type AppService struct {
	appRepo    *repository.AppRepository
	apiKeyRepo *repository.ApiKeyRepository
	auditRepo  *repository.AuditRepository
}

func NewAppService(appRepo *repository.AppRepository, apiKeyRepo *repository.ApiKeyRepository, auditRepo *repository.AuditRepository) *AppService {
	return &AppService{
		appRepo:    appRepo,
		apiKeyRepo: apiKeyRepo,
		auditRepo:  auditRepo,
	}
}

func (s *AppService) CreateApp(ctx context.Context, name, displayName, description string, retentionDays, minKeep int, actorID, actorEmail, ip, ua string) (*model.Application, error) {
	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" {
		return nil, errors.New("application name is required")
	}
	if displayName == "" {
		displayName = name
	}
	if retentionDays <= 0 {
		retentionDays = 30
	}
	if minKeep <= 0 {
		minKeep = 3
	}

	app := &model.Application{
		Name:          name,
		DisplayName:   displayName,
		Description:   description,
		RetentionDays: retentionDays,
		MinKeep:       minKeep,
		IsActive:      true,
	}

	if err := s.appRepo.Create(ctx, app); err != nil {
		return nil, err
	}

	_ = s.auditRepo.Log(ctx, "user", actorID, actorEmail, "app_created", "application", app.ID.String(), ip, ua, map[string]interface{}{"name": name})
	return app, nil
}

func (s *AppService) ListApps(ctx context.Context) ([]model.Application, error) {
	return s.appRepo.List(ctx)
}

func (s *AppService) GetApp(ctx context.Context, id uuid.UUID) (*model.Application, error) {
	return s.appRepo.GetByID(ctx, id)
}

func (s *AppService) UpdateApp(ctx context.Context, id uuid.UUID, name, displayName, description string, retentionDays, minKeep int, isActive bool, actorID, actorEmail, ip, ua string) (*model.Application, error) {
	app, err := s.appRepo.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	name = strings.ToLower(strings.TrimSpace(name))
	if name == "" {
		return nil, errors.New("nama slug aplikasi wajib diisi")
	}
	if displayName == "" {
		displayName = name
	}
	if retentionDays <= 0 {
		retentionDays = 30
	}
	if minKeep <= 0 {
		minKeep = 3
	}

	oldName := app.Name
	app.Name = name
	app.DisplayName = displayName
	app.Description = description
	app.RetentionDays = retentionDays
	app.MinKeep = minKeep
	app.IsActive = isActive

	if err := s.appRepo.Update(ctx, app); err != nil {
		if errors.Is(err, repository.ErrAppNameDuplicate) {
			return nil, errors.New("nama slug aplikasi sudah digunakan oleh aplikasi lain")
		}
		return nil, err
	}

	_ = s.auditRepo.Log(ctx, "user", actorID, actorEmail, "app_updated", "application", app.ID.String(), ip, ua, map[string]interface{}{
		"old_name":     oldName,
		"new_name":     name,
		"display_name": displayName,
		"is_active":    isActive,
	})
	return app, nil
}

func (s *AppService) DeleteApp(ctx context.Context, id uuid.UUID, actorID, actorEmail, ip, ua string) error {
	app, err := s.appRepo.GetByID(ctx, id)
	if err != nil {
		return err
	}

	count, err := s.appRepo.CountBackups(ctx, id)
	if err != nil {
		return err
	}
	if count > 0 {
		return fmt.Errorf("aplikasi '%s' tidak dapat dihapus karena masih memiliki %d file backup. Hapus file backup terlebih dahulu", app.DisplayName, count)
	}

	if err := s.appRepo.Delete(ctx, id); err != nil {
		return err
	}

	_ = s.auditRepo.Log(ctx, "user", actorID, actorEmail, "app_deleted", "application", id.String(), ip, ua, map[string]interface{}{
		"name":         app.Name,
		"display_name": app.DisplayName,
	})
	return nil
}

func (s *AppService) CreateApiKey(ctx context.Context, appID uuid.UUID, name, ipAllowlist string, actorID, actorEmail, ip, ua string) (*model.ApiKey, error) {
	app, err := s.appRepo.GetByID(ctx, appID)
	if err != nil {
		return nil, err
	}

	// Generate 256-bit random API key (32 bytes = 64 hex characters)
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return nil, err
	}
	rawRandom := hex.EncodeToString(b)
	rawKey := fmt.Sprintf("bv_live_%s", rawRandom)

	// Hash the raw key with SHA-256 for database storage
	keyHash := security.SHA256String([]byte(rawKey))
	prefix := rawKey[:14] // e.g. "bv_live_ab12cd"

	apiKey := &model.ApiKey{
		ApplicationID: app.ID,
		Name:          name,
		KeyPrefix:     prefix,
		KeyHash:       keyHash,
		Scope:         "upload_only",
		IPAllowlist:   strings.TrimSpace(ipAllowlist),
		RawKey:        rawKey, // Returned once
	}

	if err := s.apiKeyRepo.Create(ctx, apiKey); err != nil {
		return nil, err
	}

	_ = s.auditRepo.Log(ctx, "user", actorID, actorEmail, "api_key_created", "api_key", apiKey.ID.String(), ip, ua, map[string]interface{}{"app_name": app.Name, "prefix": prefix})
	return apiKey, nil
}

func (s *AppService) ListApiKeys(ctx context.Context, appID uuid.UUID) ([]model.ApiKey, error) {
	return s.apiKeyRepo.ListByAppID(ctx, appID)
}

func (s *AppService) RevokeApiKey(ctx context.Context, keyID uuid.UUID, actorID, actorEmail, ip, ua string) error {
	if err := s.apiKeyRepo.Revoke(ctx, keyID); err != nil {
		return err
	}

	_ = s.auditRepo.Log(ctx, "user", actorID, actorEmail, "api_key_revoked", "api_key", keyID.String(), ip, ua, nil)
	return nil
}

// AuthenticateAPIKey validates bearer token against hash, checks scope and IP allowlist
func (s *AppService) AuthenticateAPIKey(ctx context.Context, rawKey, clientIP string) (*model.ApiKey, *model.Application, error) {
	rawKey = strings.TrimSpace(rawKey)
	if rawKey == "" {
		return nil, nil, errors.New("empty api key")
	}

	keyHash := security.SHA256String([]byte(rawKey))
	apiKey, err := s.apiKeyRepo.GetByHash(ctx, keyHash)
	if err != nil {
		return nil, nil, err
	}

	// Verify IP allowlist if set
	if apiKey.IPAllowlist != "" {
		if !checkIPAllowlist(clientIP, apiKey.IPAllowlist) {
			return nil, nil, ErrIPNotAllowed
		}
	}

	// Get associated app
	app, err := s.appRepo.GetByID(ctx, apiKey.ApplicationID)
	if err != nil {
		return nil, nil, err
	}

	if !app.IsActive {
		return nil, nil, errors.New("application is inactive")
	}

	// Update last used
	_ = s.apiKeyRepo.Touch(ctx, apiKey.ID)

	return apiKey, app, nil
}

func checkIPAllowlist(clientIP, allowlist string) bool {
	clientParsed := net.ParseIP(clientIP)
	if clientParsed == nil {
		return false
	}

	entries := strings.Split(allowlist, ",")
	for _, entry := range entries {
		entry = strings.TrimSpace(entry)
		if entry == "" {
			continue
		}

		// Check CIDR format
		if strings.Contains(entry, "/") {
			_, ipNet, err := net.ParseCIDR(entry)
			if err == nil && ipNet.Contains(clientParsed) {
				return true
			}
		} else {
			// Single IP check
			allowIP := net.ParseIP(entry)
			if allowIP != nil && allowIP.Equal(clientParsed) {
				return true
			}
		}
	}
	return false
}
