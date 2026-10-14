package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"backupvault/internal/model"
	"backupvault/internal/security"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrUserNotFound      = errors.New("user not found")
	ErrUserAlreadyExists = errors.New("user with this email already exists")
)

type UserRepository struct {
	pool *pgxpool.Pool
}

func NewUserRepository(pool *pgxpool.Pool) *UserRepository {
	return &UserRepository{pool: pool}
}

func (r *UserRepository) EnsureAdminUser(ctx context.Context, email, password string) error {
	var exists bool
	err := r.pool.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM users WHERE role = 'admin' OR LOWER(email) = LOWER($1))", email).Scan(&exists)
	if err != nil {
		return fmt.Errorf("failed to check existing admin user: %w", err)
	}

	if exists {
		return nil
	}

	hash, err := security.HashPassword(password)
	if err != nil {
		return fmt.Errorf("failed to hash initial admin password: %w", err)
	}

	id := uuid.New()
	_, err = r.pool.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, role, can_view, can_edit, can_delete, storage_quota_bytes, totp_enabled, recovery_codes)
		VALUES ($1, $2, $3, $4, true, true, true, 0, false, '[]'::jsonb)
	`, id, email, hash, model.RoleAdmin)
	if err != nil {
		return fmt.Errorf("failed to create initial admin user: %w", err)
	}

	slog.Info("Initial admin user created", "email", email)
	return nil
}

func (r *UserRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.User, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT u.id, u.email, u.password_hash, u.role, u.can_view, u.can_edit, u.can_delete, u.storage_quota_bytes, u.totp_secret, u.totp_enabled, u.recovery_codes, u.created_at, u.updated_at,
		       COALESCE((
		         SELECT SUM(size_bytes)
		         FROM drive_items
		         WHERE user_id = u.id AND type = 'file' AND is_trashed = false
		       ), 0) AS storage_used_bytes
		FROM users u
		WHERE u.id = $1
	`, id)

	var u model.User
	var rawCodes []byte
	err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Role, &u.CanView, &u.CanEdit, &u.CanDelete, &u.StorageQuotaBytes, &u.TOTPSecret, &u.TOTPEnabled, &rawCodes, &u.CreatedAt, &u.UpdatedAt, &u.StorageUsedBytes)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}

	if len(rawCodes) > 0 {
		_ = json.Unmarshal(rawCodes, &u.RecoveryCodes)
	}
	return &u, nil
}

func (r *UserRepository) GetByEmail(ctx context.Context, email string) (*model.User, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT u.id, u.email, u.password_hash, u.role, u.can_view, u.can_edit, u.can_delete, u.storage_quota_bytes, u.totp_secret, u.totp_enabled, u.recovery_codes, u.created_at, u.updated_at,
		       COALESCE((
		         SELECT SUM(size_bytes)
		         FROM drive_items
		         WHERE user_id = u.id AND type = 'file' AND is_trashed = false
		       ), 0) AS storage_used_bytes
		FROM users u
		WHERE LOWER(u.email) = LOWER($1)
		   OR (LOWER($1) IN ('admin', 'admin@inmeet', 'admin@inmeet.net', 'admin@backupvault.local') AND u.role = 'admin')
		ORDER BY CASE WHEN LOWER(u.email) = LOWER($1) THEN 0 ELSE 1 END
		LIMIT 1
	`, email)

	var u model.User
	var rawCodes []byte
	err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Role, &u.CanView, &u.CanEdit, &u.CanDelete, &u.StorageQuotaBytes, &u.TOTPSecret, &u.TOTPEnabled, &rawCodes, &u.CreatedAt, &u.UpdatedAt, &u.StorageUsedBytes)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrUserNotFound
		}
		return nil, err
	}

	if len(rawCodes) > 0 {
		_ = json.Unmarshal(rawCodes, &u.RecoveryCodes)
	}
	return &u, nil
}

func (r *UserRepository) CreateUser(ctx context.Context, email, passwordHash string, role model.Role, canView, canEdit, canDelete bool, quotaBytes int64) (*model.User, error) {
	id := uuid.New()
	now := time.Now()
	if quotaBytes <= 0 && role == model.RoleUser {
		quotaBytes = 16106127360 // 15 GB default
	}
	_, err := r.pool.Exec(ctx, `
		INSERT INTO users (id, email, password_hash, role, can_view, can_edit, can_delete, storage_quota_bytes, totp_enabled, recovery_codes, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, false, '[]'::jsonb, $9, $9)
	`, id, email, passwordHash, role, canView, canEdit, canDelete, quotaBytes, now)
	if err != nil {
		return nil, err
	}
	return &model.User{
		ID:                id,
		Email:             email,
		Role:              role,
		CanView:           canView,
		CanEdit:           canEdit,
		CanDelete:         canDelete,
		StorageQuotaBytes: quotaBytes,
		StorageUsedBytes:  0,
		CreatedAt:         now,
		UpdatedAt:         now,
	}, nil
}

func (r *UserRepository) ListUsers(ctx context.Context) ([]*model.User, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT u.id, u.email, u.role, u.can_view, u.can_edit, u.can_delete, u.storage_quota_bytes, u.totp_enabled, u.created_at, u.updated_at,
		       COALESCE((
		         SELECT SUM(size_bytes)
		         FROM drive_items
		         WHERE user_id = u.id AND type = 'file' AND is_trashed = false
		       ), 0) AS storage_used_bytes
		FROM users u
		ORDER BY (u.role = 'admin') DESC, u.created_at ASC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	users := make([]*model.User, 0)
	for rows.Next() {
		var u model.User
		err := rows.Scan(&u.ID, &u.Email, &u.Role, &u.CanView, &u.CanEdit, &u.CanDelete, &u.StorageQuotaBytes, &u.TOTPEnabled, &u.CreatedAt, &u.UpdatedAt, &u.StorageUsedBytes)
		if err != nil {
			return nil, err
		}
		users = append(users, &u)
	}
	return users, nil
}

func (r *UserRepository) DeleteUser(ctx context.Context, id uuid.UUID) error {
	res, err := r.pool.Exec(ctx, `
		DELETE FROM users WHERE id = $1 AND email != 'admin@inmeet'
	`, id)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return errors.New("pengguna tidak ditemukan atau tidak dapat menghapus akun administrator utama")
	}
	return nil
}

func (r *UserRepository) UpdateUserQuota(ctx context.Context, id uuid.UUID, quotaBytes int64) error {
	res, err := r.pool.Exec(ctx, `
		UPDATE users SET storage_quota_bytes = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
	`, quotaBytes, id)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

func (r *UserRepository) UpdateUserPermissionsAndQuota(ctx context.Context, id uuid.UUID, canView, canEdit, canDelete bool, quotaBytes int64) error {
	res, err := r.pool.Exec(ctx, `
		UPDATE users 
		SET can_view = $1, can_edit = $2, can_delete = $3, storage_quota_bytes = $4, updated_at = CURRENT_TIMESTAMP 
		WHERE id = $5
	`, canView, canEdit, canDelete, quotaBytes, id)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

func (r *UserRepository) UpdatePassword(ctx context.Context, id uuid.UUID, newPasswordHash string) error {
	res, err := r.pool.Exec(ctx, `
		UPDATE users SET password_hash = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
	`, newPasswordHash, id)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

func (r *UserRepository) UpdateEmail(ctx context.Context, id uuid.UUID, newEmail string) error {
	res, err := r.pool.Exec(ctx, `
		UPDATE users SET email = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
	`, newEmail, id)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrUserNotFound
	}
	return nil
}

func (r *UserRepository) SetTOTPSecret(ctx context.Context, id uuid.UUID, secret string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE users SET totp_secret = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2
	`, secret, id)
	return err
}

func (r *UserRepository) EnableTOTP(ctx context.Context, id uuid.UUID, hashedCodes []string) error {
	rawCodes, err := json.Marshal(hashedCodes)
	if err != nil {
		return err
	}

	_, err = r.pool.Exec(ctx, `
		UPDATE users
		SET totp_enabled = true, recovery_codes = $1, updated_at = CURRENT_TIMESTAMP
		WHERE id = $2
	`, rawCodes, id)
	return err
}

func (r *UserRepository) DisableTOTP(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE users
		SET totp_enabled = false, totp_secret = NULL, recovery_codes = '[]'::jsonb, updated_at = CURRENT_TIMESTAMP
		WHERE id = $1
	`, id)
	return err
}

func (r *UserRepository) UpdateRecoveryCodes(ctx context.Context, id uuid.UUID, hashedCodes []string) error {
	rawCodes, err := json.Marshal(hashedCodes)
	if err != nil {
		return err
	}

	_, err = r.pool.Exec(ctx, `
		UPDATE users
		SET recovery_codes = $1, updated_at = CURRENT_TIMESTAMP
		WHERE id = $2
	`, rawCodes, id)
	return err
}
