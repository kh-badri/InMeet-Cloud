package repository

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	MaxFailedLoginAttempts = 5
	LockoutDuration        = 15 * time.Minute
)

type LockoutRepository struct {
	pool *pgxpool.Pool
}

func NewLockoutRepository(pool *pgxpool.Pool) *LockoutRepository {
	return &LockoutRepository{pool: pool}
}

// IsLocked checks if key (e.g. IP or email) is currently locked out
func (r *LockoutRepository) IsLocked(ctx context.Context, key string) (bool, time.Duration, error) {
	var lockedUntil *time.Time
	err := r.pool.QueryRow(ctx, `
		SELECT locked_until FROM login_attempts WHERE key = $1
	`, key).Scan(&lockedUntil)

	if err != nil {
		if err == pgx.ErrNoRows {
			return false, 0, nil
		}
		return false, 0, err
	}

	if lockedUntil != nil && lockedUntil.After(time.Now()) {
		remaining := time.Until(*lockedUntil)
		return true, remaining, nil
	}

	return false, 0, nil
}

// RecordFailure increments failed attempts and triggers lockout if max reached
func (r *LockoutRepository) RecordFailure(ctx context.Context, key string) (bool, time.Duration, error) {
	now := time.Now()
	var attempts int
	var lockedUntil *time.Time

	err := r.pool.QueryRow(ctx, `
		SELECT attempts, locked_until FROM login_attempts WHERE key = $1
	`, key).Scan(&attempts, &lockedUntil)

	if err != nil && err != pgx.ErrNoRows {
		return false, 0, err
	}

	if err == pgx.ErrNoRows {
		// First failure
		_, err := r.pool.Exec(ctx, `
			INSERT INTO login_attempts (key, attempts, locked_until, last_attempt)
			VALUES ($1, 1, NULL, $2)
		`, key, now)
		return false, 0, err
	}

	// If previously locked but lock expired, reset count to 1
	if lockedUntil != nil && lockedUntil.Before(now) {
		attempts = 0
	}

	attempts++
	if attempts >= MaxFailedLoginAttempts {
		until := now.Add(LockoutDuration)
		_, err := r.pool.Exec(ctx, `
			UPDATE login_attempts
			SET attempts = $1, locked_until = $2, last_attempt = $3
			WHERE key = $4
		`, attempts, until, now, key)
		return true, LockoutDuration, err
	}

	_, err = r.pool.Exec(ctx, `
		UPDATE login_attempts
		SET attempts = $1, last_attempt = $2
		WHERE key = $3
	`, attempts, now, key)
	return false, 0, err
}

// Reset clears failure count on successful login
func (r *LockoutRepository) Reset(ctx context.Context, key string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM login_attempts WHERE key = $1`, key)
	return err
}
