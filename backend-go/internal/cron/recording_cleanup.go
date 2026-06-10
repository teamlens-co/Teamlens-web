package cron

import (
	"context"
	"log/slog"
	"os"
	"time"

	"github.com/teamlens/backend-go/internal/services"
)

type RecordingCleanupJob struct {
	recordingSvc   *services.RecordingSessionService
	retentionHours int
}

func NewRecordingCleanupJob(recordingSvc *services.RecordingSessionService, retentionHours int) *RecordingCleanupJob {
	if retentionHours <= 0 {
		retentionHours = 48
	}
	return &RecordingCleanupJob{recordingSvc: recordingSvc, retentionHours: retentionHours}
}

func (j *RecordingCleanupJob) Start(ctx context.Context) {
	ticker := time.NewTicker(6 * time.Hour)
	go func() {
		defer ticker.Stop()
		j.Run(ctx)
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				j.Run(ctx)
			}
		}
	}()
}

func (j *RecordingCleanupJob) Run(ctx context.Context) {
	cutoff := time.Now().UTC().Add(-time.Duration(j.retentionHours) * time.Hour)
	paths, err := j.recordingSvc.ExpireOldSessions(ctx, cutoff)
	if err != nil {
		slog.Error("Recording cleanup failed", "error", err)
		return
	}
	for _, path := range paths {
		if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
			slog.Warn("Failed to delete recording chunk", "path", path, "error", err)
		}
	}
	if len(paths) > 0 {
		slog.Info("Recording cleanup completed", "filesDeleted", len(paths), "retentionHours", j.retentionHours)
	}
}
