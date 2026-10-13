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
	ErrSessionExpired   = errors.New("upload session expired or not active")
	ErrSessionNotFound2 = errors.New("upload session not found")
)

type UploadRepository struct {
	pool *pgxpool.Pool
}

func NewUploadRepository(pool *pgxpool.Pool) *UploadRepository {
	return &UploadRepository{pool: pool}
}

func (r *UploadRepository) Create(ctx context.Context, s *model.UploadSession) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	now := time.Now()
	s.CreatedAt = now
	s.UpdatedAt = now
	s.Status = model.UploadSessionActive

	_, err := r.pool.Exec(ctx, `
		INSERT INTO upload_sessions (id, application_id, filename, file_type, expected_size, expected_sha256, current_offset, temp_file_path, status, expires_at, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
	`, s.ID, s.ApplicationID, s.Filename, s.FileType, s.ExpectedSize, s.ExpectedSHA256, s.CurrentOffset, s.TempFilePath, s.Status, s.ExpiresAt, s.CreatedAt, s.UpdatedAt)
	return err
}

func (r *UploadRepository) GetByID(ctx context.Context, id uuid.UUID) (*model.UploadSession, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT id, application_id, filename, file_type, expected_size, expected_sha256, current_offset, temp_file_path, status, expires_at, created_at, updated_at
		FROM upload_sessions
		WHERE id = $1
	`, id)

	var s model.UploadSession
	err := row.Scan(&s.ID, &s.ApplicationID, &s.Filename, &s.FileType, &s.ExpectedSize, &s.ExpectedSHA256, &s.CurrentOffset, &s.TempFilePath, &s.Status, &s.ExpiresAt, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrSessionNotFound2
		}
		return nil, err
	}

	if s.Status != model.UploadSessionActive || time.Now().After(s.ExpiresAt) {
		return nil, ErrSessionExpired
	}

	return &s, nil
}

func (r *UploadRepository) UpdateOffset(ctx context.Context, id uuid.UUID, offset int64) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE upload_sessions
		SET current_offset = $1, updated_at = CURRENT_TIMESTAMP
		WHERE id = $2 AND status = 'active'
	`, offset, id)
	return err
}

func (r *UploadRepository) MarkCompleted(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE upload_sessions
		SET status = 'completed', updated_at = CURRENT_TIMESTAMP
		WHERE id = $1
	`, id)
	return err
}

func (r *UploadRepository) MarkAborted(ctx context.Context, id uuid.UUID) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE upload_sessions
		SET status = 'aborted', updated_at = CURRENT_TIMESTAMP
		WHERE id = $1
	`, id)
	return err
}

func (r *UploadRepository) GetExpiredSessions(ctx context.Context) ([]model.UploadSession, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, application_id, filename, file_type, expected_size, expected_sha256, current_offset, temp_file_path, status, expires_at, created_at, updated_at
		FROM upload_sessions
		WHERE status = 'active' AND expires_at < CURRENT_TIMESTAMP
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var sessions []model.UploadSession
	for rows.Next() {
		var s model.UploadSession
		err := rows.Scan(&s.ID, &s.ApplicationID, &s.Filename, &s.FileType, &s.ExpectedSize, &s.ExpectedSHA256, &s.CurrentOffset, &s.TempFilePath, &s.Status, &s.ExpiresAt, &s.CreatedAt, &s.UpdatedAt)
		if err != nil {
			return nil, err
		}
		sessions = append(sessions, s)
	}
	return sessions, nil
}
