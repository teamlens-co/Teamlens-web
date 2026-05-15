package services

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/teamlens/backend-go/internal/models"
)

type RecordingService struct {
	pool *pgxpool.Pool
}

func NewRecordingService(pool *pgxpool.Pool) *RecordingService {
	return &RecordingService{pool: pool}
}

func (s *RecordingService) SaveRecording(ctx context.Context, recording *models.ScreenRecording) error {
	recording.ID = RandomToken(16)
	recording.CreatedAt = time.Now().UTC()
	_, err := s.pool.Exec(ctx,
		`INSERT INTO screen_recordings (id, manager_id, employee_id, organization_id, live_session_id, file_path, file_size, duration_ms, mime_type, recorded_at, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
		recording.ID,
		recording.ManagerID,
		recording.EmployeeID,
		recording.OrganizationID,
		recording.LiveSessionID,
		recording.FilePath,
		recording.FileSize,
		recording.DurationMs,
		recording.MimeType,
		recording.RecordedAt,
		recording.CreatedAt,
	)
	if err != nil {
		return fmt.Errorf("save recording: %w", err)
	}
	return nil
}

func (s *RecordingService) GetRecordings(ctx context.Context, organizationID string, employeeID, managerID *string, limit int, startDate, endDate *time.Time) ([]models.ScreenRecording, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	query := `SELECT id, manager_id, employee_id, organization_id, live_session_id, file_path, file_size, duration_ms, mime_type, recorded_at, created_at
	          FROM screen_recordings
	          WHERE organization_id = $1`

	args := []interface{}{organizationID}
	paramIdx := 2

	if employeeID != nil {
		query += fmt.Sprintf(` AND employee_id = $%d`, paramIdx)
		args = append(args, *employeeID)
		paramIdx++
	}
	if managerID != nil {
		query += fmt.Sprintf(` AND manager_id = $%d`, paramIdx)
		args = append(args, *managerID)
		paramIdx++
	}
	if startDate != nil {
		query += fmt.Sprintf(` AND recorded_at >= $%d`, paramIdx)
		args = append(args, *startDate)
		paramIdx++
	}
	if endDate != nil {
		query += fmt.Sprintf(` AND recorded_at <= $%d`, paramIdx)
		args = append(args, *endDate)
		paramIdx++
	}

	query += ` ORDER BY recorded_at DESC`
	query += fmt.Sprintf(` LIMIT $%d`, paramIdx)
	args = append(args, limit)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query recordings: %w", err)
	}
	defer rows.Close()

	var recordings []models.ScreenRecording
	for rows.Next() {
		var rec models.ScreenRecording
		var liveSessionID *string
		if err := rows.Scan(&rec.ID, &rec.ManagerID, &rec.EmployeeID, &rec.OrganizationID, &liveSessionID,
			&rec.FilePath, &rec.FileSize, &rec.DurationMs, &rec.MimeType, &rec.RecordedAt, &rec.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan recording: %w", err)
		}
		rec.LiveSessionID = liveSessionID
		recordings = append(recordings, rec)
	}
	return recordings, nil
}

func (s *RecordingService) GetRecordingByID(ctx context.Context, id string) (*models.ScreenRecording, error) {
	var rec models.ScreenRecording
	var liveSessionID *string
	err := s.pool.QueryRow(ctx,
		`SELECT id, manager_id, employee_id, organization_id, live_session_id, file_path, file_size, duration_ms, mime_type, recorded_at, created_at
		 FROM screen_recordings WHERE id = $1`, id,
	).Scan(&rec.ID, &rec.ManagerID, &rec.EmployeeID, &rec.OrganizationID, &liveSessionID,
		&rec.FilePath, &rec.FileSize, &rec.DurationMs, &rec.MimeType, &rec.RecordedAt, &rec.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get recording: %w", err)
	}
	rec.LiveSessionID = liveSessionID
	return &rec, nil
}

func (s *RecordingService) DeleteRecording(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM screen_recordings WHERE id = $1`, id)
	return fmt.Errorf("delete recording: %w", err)
}

// ListRecordingsByEmployee returns recordings for a manager's employee
func (s *RecordingService) ListRecordingsByEmployee(ctx context.Context, organizationID, managerID, employeeID string) ([]models.ScreenRecording, error) {
	return s.GetRecordings(ctx, organizationID, &employeeID, &managerID, 50, nil, nil)
}
