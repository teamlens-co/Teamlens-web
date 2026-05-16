package database

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// Pool wraps a pgxpool connection pool
type Pool struct {
	*pgxpool.Pool
}

// Connect creates a connection pool to PostgreSQL
func Connect(ctx context.Context, databaseURL string) (*Pool, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse database config: %w", err)
	}

	config.MaxConns = 25
	config.MinConns = 5
	config.MaxConnLifetime = 30 * time.Minute
	config.MaxConnIdleTime = 5 * time.Minute

	pool, err := pgxpool.NewWithConfig(ctx, config)
	if err != nil {
		return nil, fmt.Errorf("create connection pool: %w", err)
	}

	if err := pool.Ping(ctx); err != nil {
		return nil, fmt.Errorf("ping database: %w", err)
	}

	if err := ensureCompatibilitySchema(ctx, pool); err != nil {
		return nil, fmt.Errorf("ensure compatibility schema: %w", err)
	}

	slog.Info("Connected to PostgreSQL", "maxConns", config.MaxConns)
	return &Pool{Pool: pool}, nil
}

func ensureCompatibilitySchema(ctx context.Context, pool *pgxpool.Pool) error {
	statements := []string{
		`ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS location_type text`,
		`ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS latitude double precision`,
		`ALTER TABLE work_sessions ADD COLUMN IF NOT EXISTS longitude double precision`,
	}

	for _, statement := range statements {
		if _, err := pool.Exec(ctx, statement); err != nil {
			return err
		}
	}

	return nil
}
