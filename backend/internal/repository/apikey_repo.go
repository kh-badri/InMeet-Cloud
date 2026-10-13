package repository

import (
	"context"
	"errors"
	"time"

	"backupvault/internal/model"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrAPIKeyNotFound = errors.New("api key not found")
	ErrAPIKeyRevoked  = errors.New("api key has been revoked")
)

type ApiKeyRepository struct {
	pool *pgxpool.Pool
}

func NewApiKeyRepository(pool *pgxpool.Pool) *ApiKeyRepository {
	return &ApiKeyRepository{pool: pool}
}

func (r *ApiKeyRepository) Create(ctx context.Context, k *model.ApiKey) error {
	if k.ID == uuid.Nil {
		k.ID = uuid.New()
	}
	k.CreatedAt = time.Now()

	_, err := r.pool.Exec(ctx, `
		INSERT INTO api_keys (id, application_id, name, key_prefix, key_hash, scope, ip_allowlist, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, k.ID, k.ApplicationID, k.Name, k.KeyPrefix, k.KeyHash, k.Scope, k.IPAllowlist, k.CreatedAt)
	return err
}

func (r *ApiKeyRepository) GetByHash(ctx context.Context, hash string) (*model.ApiKey, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, application_id, name, key_prefix, key_hash, scope, ip_allowlist, last_used_at, revoked_at, created_at
		FROM api_keys
		WHERE key_hash = $1
	`, hash)

	var k model.ApiKey
	err := row.Scan(&k.ID, &k.ApplicationID, &k.Name, &k.KeyPrefix, &k.KeyHash, &k.Scope, &k.IPAllowlist, &k.LastUsedAt, &k.RevokedAt, &k.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrAPIKeyNotFound
		}
		return nil, err
	}

	if k.RevokedAt != nil {
		return nil, ErrAPIKeyRevoked
	}

	return &k, nil
}

func (r *ApiKeyRepository) ListByAppID(ctx context.Context, appID uuid.UUID) ([]model.ApiKey, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, application_id, name, key_prefix, key_hash, scope, ip_allowlist, last_used_at, revoked_at, created_at
		FROM api_keys
		WHERE application_id = $1
		ORDER BY created_at DESC
	`, appID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var keys []model.ApiKey
	for rows.Next() {
		var k model.ApiKey
		err := rows.Scan(&k.ID, &k.ApplicationID, &k.Name, &k.KeyPrefix, &k.KeyHash, &k.Scope, &k.IPAllowlist, &k.LastUsedAt, &k.RevokedAt, &k.CreatedAt)
		if err != nil {
			return nil, err
		}
		keys = append(keys, k)
	}
	return keys, nil
}

func (r *ApiKeyRepository) Revoke(ctx context.Context, id uuid.UUID) error {
	now := time.Now()
	res, err := r.pool.Exec(ctx, `
		UPDATE api_keys SET revoked_at = $1 WHERE id = $2 AND revoked_at IS NULL
	`, now, id)
	if err != nil {
		return err
	}
	if res.RowsAffected() == 0 {
		return ErrAPIKeyNotFound
	}
	return nil
}

func (r *ApiKeyRepository) Touch(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE id = $1
	`, id)
	return err
}
