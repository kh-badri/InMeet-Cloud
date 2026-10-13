package repository

import (
	"context"
	"errors"

	"backupvault/internal/model"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrSessionNotFound = errors.New("session not found or expired")
)

type SessionRepository struct {
	pool *pgxpool.Pool
}

func NewSessionRepository(pool *pgxpool.Pool) *SessionRepository {
	return &SessionRepository{pool: pool}
}

func (r *SessionRepository) Create(ctx context.Context, s *model.Session) error {
	_, err := r.pool.Exec(ctx, `
		INSERT INTO sessions (id, user_id, csrf_token, ip_address, user_agent, expires_at, created_at, last_active_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, s.ID, s.UserID, s.CSRFToken, s.IPAddress, s.UserAgent, s.ExpiresAt, s.CreatedAt, s.LastActiveAt)
	return err
}

func (r *SessionRepository) GetByID(ctx context.Context, id string) (*model.Session, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, user_id, csrf_token, ip_address, user_agent, expires_at, created_at, last_active_at
		FROM sessions
		WHERE id = $1 AND expires_at > CURRENT_TIMESTAMP
	`, id)

	var s model.Session
	err := row.Scan(&s.ID, &s.UserID, &s.CSRFToken, &s.IPAddress, &s.UserAgent, &s.ExpiresAt, &s.CreatedAt, &s.LastActiveAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrSessionNotFound
		}
		return nil, err
	}
	return &s, nil
}

func (r *SessionRepository) Touch(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE sessions SET last_active_at = CURRENT_TIMESTAMP WHERE id = $1
	`, id)
	return err
}

func (r *SessionRepository) Delete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM sessions WHERE id = $1`, id)
	return err
}

func (r *SessionRepository) DeleteByUserID(ctx context.Context, userID string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM sessions WHERE user_id = $1`, userID)
	return err
}

func (r *SessionRepository) CleanupExpired(ctx context.Context) (int64, error) {
	cmd, err := r.pool.Exec(ctx, `DELETE FROM sessions WHERE expires_at <= CURRENT_TIMESTAMP`)
	if err != nil {
		return 0, err
	}
	return cmd.RowsAffected(), nil
}
