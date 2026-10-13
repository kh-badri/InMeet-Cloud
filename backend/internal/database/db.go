package database

import (
	"context"
	"embed"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

type DB struct {
	Pool *pgxpool.Pool
}

func Connect(ctx context.Context, databaseURL string, maxOpen, maxIdle int) (*DB, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("unable to parse database config: %w", err)
	}

	cfg.MaxConns = int32(maxOpen)
	cfg.MinConns = int32(maxIdle)
	cfg.MaxConnLifetime = 1 * time.Hour
	cfg.MaxConnIdleTime = 15 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("unable to create connection pool: %w", err)
	}

	// Ping database
	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("unable to ping database: %w", err)
	}

	slog.Info("Connected to PostgreSQL database successfully")
	return &DB{Pool: pool}, nil
}

func (db *DB) Close() {
	if db.Pool != nil {
		db.Pool.Close()
	}
}

// Migrate executes all embedded SQL migration scripts
func (db *DB) Migrate(ctx context.Context) error {
	migrationFiles := []string{
		"migrations/001_initial_schema.sql",
		"migrations/002_drive_schema.sql",
		"migrations/003_drive_upload_sessions.sql",
	}

	for _, file := range migrationFiles {
		slog.Info("Executing database migration", "file", file)
		content, err := migrationsFS.ReadFile(file)
		if err != nil {
			return fmt.Errorf("failed to read migration %s: %w", file, err)
		}

		_, err = db.Pool.Exec(ctx, string(content))
		if err != nil {
			return fmt.Errorf("failed to execute migration %s: %w", file, err)
		}
	}

	slog.Info("Database migrations completed successfully")
	return nil
}
