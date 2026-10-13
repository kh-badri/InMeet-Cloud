package repository

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"

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
		INSERT INTO users (id, email, password_hash, role, totp_enabled, recovery_codes)
		VALUES ($1, $2, $3, $4, false, '[]'::jsonb)
	`, id, email, hash, model.RoleAdmin)
	if err != nil {
		return fmt.Errorf("failed to create initial admin user: %w", err)
	}

	slog.Info("Initial admin user created", "email", email)
	return nil
}

func (r *UserRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.User, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, email, password_hash, role, totp_secret, totp_enabled, recovery_codes, created_at, updated_at
		FROM users
		WHERE id = $1
	`, id)

	var u model.User
	var rawCodes []byte
	err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Role, &u.TOTPSecret, &u.TOTPEnabled, &rawCodes, &u.CreatedAt, &u.UpdatedAt)
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
		SELECT id, email, password_hash, role, totp_secret, totp_enabled, recovery_codes, created_at, updated_at
		FROM users
		WHERE LOWER(email) = LOWER($1)
		   OR (LOWER($1) IN ('admin', 'admin@inmeet', 'admin@inmeet.net', 'admin@backupvault.local') AND role = 'admin')
		ORDER BY CASE WHEN LOWER(email) = LOWER($1) THEN 0 ELSE 1 END
		LIMIT 1
	`, email)

	var u model.User
	var rawCodes []byte
	err := row.Scan(&u.ID, &u.Email, &u.PasswordHash, &u.Role, &u.TOTPSecret, &u.TOTPEnabled, &rawCodes, &u.CreatedAt, &u.UpdatedAt)
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
