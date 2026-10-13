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
	ErrTokenNotFound = errors.New("download token is invalid, expired, or already used")
)

type DownloadTokenRepository struct {
	pool *pgxpool.Pool
}

func NewDownloadTokenRepository(pool *pgxpool.Pool) *DownloadTokenRepository {
	return &DownloadTokenRepository{pool: pool}
}

func (r *DownloadTokenRepository) Create(ctx context.Context, t *model.DownloadToken) error {
	if t.ID == uuid.Nil {
		t.ID = uuid.New()
	}
	t.CreatedAt = time.Now()

	_, err := r.pool.Exec(ctx, `
		INSERT INTO download_tokens (id, backup_id, user_id, token_hash, ip_address, expires_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7)
	`, t.ID, t.BackupID, t.UserID, t.TokenHash, t.IPAddress, t.ExpiresAt, t.CreatedAt)
	return err
}

func (r *DownloadTokenRepository) GetValidByHash(ctx context.Context, tokenHash, clientIP string) (*model.DownloadToken, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, backup_id, user_id, token_hash, ip_address, expires_at, used_at, created_at
		FROM download_tokens
		WHERE token_hash = $1
		  AND used_at IS NULL
		  AND expires_at > CURRENT_TIMESTAMP
	`, tokenHash)

	var t model.DownloadToken
	err := row.Scan(&t.ID, &t.BackupID, &t.UserID, &t.TokenHash, &t.IPAddress, &t.ExpiresAt, &t.UsedAt, &t.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrTokenNotFound
		}
		return nil, err
	}

	return &t, nil
}

func (r *DownloadTokenRepository) MarkUsed(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE download_tokens SET used_at = CURRENT_TIMESTAMP WHERE id = $1
	`, id)
	return err
}
