package services

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// RetentionService handles organization data-retention settings and cleanup.
type RetentionService struct {
	pool      *pgxpool.Pool
	uploadDir string
}

// NewRetentionService creates a new retention service.
func NewRetentionService(pool *pgxpool.Pool, uploadDir string) *RetentionService {
	return &RetentionService{pool: pool, uploadDir: uploadDir}
}

// GetRetention returns the configured retention days for an organization.
func (s *RetentionService) GetRetention(ctx context.Context, orgID string) (screenshotDays, recordingDays int, err error) {
	if orgID == "" {
		return 0, 0, fmt.Errorf("organization ID is required")
	}
	err = s.pool.QueryRow(ctx,
		`SELECT COALESCE(screenshot_retention_days, 30), COALESCE(recording_retention_days, 30)
		 FROM organizations WHERE id = $1`,
		orgID,
	).Scan(&screenshotDays, &recordingDays)
	if err != nil {
		return 0, 0, fmt.Errorf("query retention: %w", err)
	}
	return screenshotDays, recordingDays, nil
}

// UpdateRetention updates the configured retention days for an organization.
// 0 days means "keep forever".
func (s *RetentionService) UpdateRetention(ctx context.Context, orgID string, screenshotDays, recordingDays int) error {
	if orgID == "" {
		return fmt.Errorf("organization ID is required")
	}
	if screenshotDays < 0 || recordingDays < 0 {
		return fmt.Errorf("retention days cannot be negative")
	}
	_, err := s.pool.Exec(ctx,
		`UPDATE organizations
		 SET screenshot_retention_days = $1, recording_retention_days = $2, updated_at = NOW()
		 WHERE id = $3`,
		screenshotDays, recordingDays, orgID,
	)
	if err != nil {
		return fmt.Errorf("update retention: %w", err)
	}
	return nil
}

// RunCleanup purges screenshots and recording sessions older than each
// organization's retention policy. Run it periodically (e.g. once per day).
func (s *RetentionService) RunCleanup(ctx context.Context) error {
	orgs, err := s.listOrgs(ctx)
	if err != nil {
		return fmt.Errorf("list orgs: %w", err)
	}
	for _, org := range orgs {
		if org.ScreenshotDays > 0 {
			if err := s.purgeScreenshots(ctx, org.ID, org.ScreenshotDays); err != nil {
				slog.Error("Failed to purge screenshots", "org", org.ID, "error", err)
			}
		}
		if org.RecordingDays > 0 {
			if err := s.purgeRecordings(ctx, org.ID, org.RecordingDays); err != nil {
				slog.Error("Failed to purge recordings", "org", org.ID, "error", err)
			}
		}
	}
	return nil
}

type orgRetention struct {
	ID             string
	ScreenshotDays int
	RecordingDays  int
}

func (s *RetentionService) listOrgs(ctx context.Context) ([]orgRetention, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, COALESCE(screenshot_retention_days, 30), COALESCE(recording_retention_days, 30)
		 FROM organizations
		 WHERE is_active = TRUE`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []orgRetention
	for rows.Next() {
		var o orgRetention
		if err := rows.Scan(&o.ID, &o.ScreenshotDays, &o.RecordingDays); err != nil {
			return nil, err
		}
		out = append(out, o)
	}
	return out, rows.Err()
}

func (s *RetentionService) purgeScreenshots(ctx context.Context, orgID string, days int) error {
	cutoff := time.Now().UTC().Add(-time.Duration(days) * 24 * time.Hour)

	// Fetch file paths before deleting rows so we can remove files.
	rows, err := s.pool.Query(ctx,
		`SELECT file_path FROM screenshots
		 WHERE user_id IN (SELECT id FROM users WHERE organization_id = $1)
		   AND captured_at < $2`,
		orgID, cutoff,
	)
	if err != nil {
		return fmt.Errorf("fetch old screenshots: %w", err)
	}
	defer rows.Close()

	var paths []string
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return err
		}
		paths = append(paths, p)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	tag, err := s.pool.Exec(ctx,
		`DELETE FROM screenshots
		 WHERE user_id IN (SELECT id FROM users WHERE organization_id = $1)
		   AND captured_at < $2`,
		orgID, cutoff,
	)
	if err != nil {
		return fmt.Errorf("delete old screenshots: %w", err)
	}

	deleted := tag.RowsAffected()
	slog.Info("Purged screenshots", "org", orgID, "cutoff", cutoff, "count", deleted)

	for _, p := range paths {
		s.deleteFile(p)
	}
	return nil
}

func (s *RetentionService) purgeRecordings(ctx context.Context, orgID string, days int) error {
	cutoff := time.Now().UTC().Add(-time.Duration(days) * 24 * time.Hour)

	// Fetch chunk file paths for affected sessions.
	rows, err := s.pool.Query(ctx,
		`SELECT rc.file_path
		 FROM recording_chunks rc
		 JOIN recording_sessions rs ON rc.recording_session_id = rs.id
		 WHERE rs.organization_id = $1
		   AND rs.started_at < $2`,
		orgID, cutoff,
	)
	if err != nil {
		return fmt.Errorf("fetch old recording chunks: %w", err)
	}
	defer rows.Close()

	var paths []string
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			return err
		}
		paths = append(paths, p)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	// Chunks cascade on session delete, so just delete sessions.
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM recording_sessions
		 WHERE organization_id = $1
		   AND started_at < $2`,
		orgID, cutoff,
	)
	if err != nil {
		return fmt.Errorf("delete old recording sessions: %w", err)
	}

	deleted := tag.RowsAffected()
	slog.Info("Purged recording sessions", "org", orgID, "cutoff", cutoff, "count", deleted)

	for _, p := range paths {
		s.deleteFile(p)
	}
	return nil
}

func (s *RetentionService) deleteFile(path string) {
	if strings.TrimSpace(path) == "" {
		return
	}
	fullPath := path
	if !filepath.IsAbs(path) {
		fullPath = filepath.Join(s.uploadDir, path)
	}
	if err := os.Remove(fullPath); err != nil && !os.IsNotExist(err) {
		slog.Warn("Failed to delete file", "path", fullPath, "error", err)
	}
}

// StartCleanupScheduler starts a goroutine that runs retention cleanup once
// per day. Call once at application startup.
func (s *RetentionService) StartCleanupScheduler() {
	go func() {
		// Run once at startup, then daily.
		for {
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
			if err := s.RunCleanup(ctx); err != nil {
				slog.Error("Retention cleanup failed", "error", err)
			}
			cancel()
			time.Sleep(24 * time.Hour)
		}
	}()
}

// Helper to let tests / admin endpoints trigger cleanup synchronously.
func (s *RetentionService) CleanupNow(ctx context.Context) error {
	return s.RunCleanup(ctx)
}
