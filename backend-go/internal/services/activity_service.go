package services

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/teamlens/backend-go/internal/models"
)

type ActivityService struct {
	pool            *pgxpool.Pool
	locationService *LocationService
	dashboardSvc    *DashboardService
}

func NewActivityService(pool *pgxpool.Pool, locationSvc *LocationService, dashSvc *DashboardService) *ActivityService {
	return &ActivityService{pool: pool, locationService: locationSvc, dashboardSvc: dashSvc}
}

func (s *ActivityService) GetActiveSession(ctx context.Context, userID string) (*models.WorkSessionRecord, error) {
	var row struct {
		id           string
		userID       string
		clockInAt    time.Time
		clockOutAt   *time.Time
		locationType *string
		latitude     *float64
		longitude    *float64
	}

	err := s.pool.QueryRow(ctx,
		`SELECT id, user_id, clock_in_at, clock_out_at, location_type, latitude, longitude
		 FROM work_sessions
		 WHERE user_id = $1 AND clock_out_at IS NULL
		 ORDER BY clock_in_at DESC
		 LIMIT 1`,
		userID,
	).Scan(&row.id, &row.userID, &row.clockInAt, &row.clockOutAt, &row.locationType, &row.latitude, &row.longitude)
	if err != nil {
		return nil, nil // No active session
	}

	record := &models.WorkSessionRecord{
		ID:        row.id,
		UserID:    row.userID,
		ClockInAt: row.clockInAt.Format(time.RFC3339),
	}
	if row.clockOutAt != nil {
		record.ClockOutAt = row.clockOutAt.Format(time.RFC3339)
	}
	if row.locationType != nil {
		record.LocationType = row.locationType
	}
	if row.latitude != nil {
		record.Latitude = row.latitude
	}
	if row.longitude != nil {
		record.Longitude = row.longitude
	}

	return record, nil
}

func (s *ActivityService) ClockIn(ctx context.Context, payload *models.ClockInPayload, organizationID string) (*models.WorkSessionRecord, error) {
	existing, err := s.GetActiveSession(ctx, payload.UserID)
	if err != nil {
		return nil, err
	}
	if existing != nil {
		if payload.ActiveAfter != nil {
			activeAfter, err := time.Parse(time.RFC3339, *payload.ActiveAfter)
			if err == nil {
				existingStarted, err := time.Parse(time.RFC3339, existing.ClockInAt)
				if err == nil && existingStarted.Before(activeAfter) {
					// Close stale session
					_ = s.closeStaleSession(ctx, existing.ID, payload.UserID)
				} else {
					return existing, nil
				}
			}
		} else {
			return existing, nil
		}
	}

	startedAt := time.Now().UTC()
	if payload.Timestamp != nil {
		if t, err := time.Parse(time.RFC3339, *payload.Timestamp); err == nil {
			startedAt = t.UTC()
		}
	}

	id := RandomToken(16)

	// Determine location type
	var locationType *string
	if organizationID != "" && payload.Latitude != nil && payload.Longitude != nil {
		lt := s.locationService.DetermineLocationType(ctx, organizationID, *payload.Latitude, *payload.Longitude,
			nil, payload.AccuracyMeters)
		if lt != nil {
			locationType = lt
		}
	}

	_, err = s.pool.Exec(ctx,
		`INSERT INTO work_sessions (id, user_id, clock_in_at, latitude, longitude, location_type, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
		id, payload.UserID, startedAt, payload.Latitude, payload.Longitude, locationType,
	)
	if err != nil {
		return nil, fmt.Errorf("clock in: %w", err)
	}

	record := &models.WorkSessionRecord{
		ID:        id,
		UserID:    payload.UserID,
		ClockInAt: startedAt.Format(time.RFC3339),
	}
	if locationType != nil {
		record.LocationType = locationType
	}
	return record, nil
}

func (s *ActivityService) closeStaleSession(ctx context.Context, sessionID, userID string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE work_sessions
		 SET clock_out_at = (
		   SELECT COALESCE(MAX(COALESCE(captured_at, created_at)), work_sessions.clock_in_at)
		   FROM activity_logs
		   WHERE session_id = $1
		 ),
		 updated_at = NOW()
		 WHERE id = $1 AND user_id = $2 AND clock_out_at IS NULL`,
		sessionID, userID,
	)
	return err
}

func (s *ActivityService) ClockOut(ctx context.Context, payload *models.ClockOutPayload) (*models.WorkSessionRecord, error) {
	endedAt := time.Now().UTC()
	if payload.Timestamp != nil {
		if t, err := time.Parse(time.RFC3339, *payload.Timestamp); err == nil {
			endedAt = t.UTC()
		}
	}

	var row struct {
		id        string
		clockInAt time.Time
	}

	if payload.SessionID != nil && *payload.SessionID != "" {
		err := s.pool.QueryRow(ctx,
			`UPDATE work_sessions
			 SET clock_out_at = $1, updated_at = NOW()
			 WHERE id = $2 AND user_id = $3 AND clock_out_at IS NULL
			 RETURNING id, clock_in_at`,
			endedAt, *payload.SessionID, payload.UserID,
		).Scan(&row.id, &row.clockInAt)
		if err != nil {
			return nil, nil
		}
	} else {
		err := s.pool.QueryRow(ctx,
			`UPDATE work_sessions
			 SET clock_out_at = $1, updated_at = NOW()
			 WHERE id = (
			   SELECT id FROM work_sessions
			   WHERE user_id = $2 AND clock_out_at IS NULL
			   ORDER BY clock_in_at DESC LIMIT 1
			 )
			 RETURNING id, clock_in_at`,
			endedAt, payload.UserID,
		).Scan(&row.id, &row.clockInAt)
		if err != nil {
			return nil, nil
		}
	}

	return &models.WorkSessionRecord{
		ID:        row.id,
		UserID:    payload.UserID,
		ClockInAt: row.clockInAt.Format(time.RFC3339),
		ClockOutAt: endedAt.Format(time.RFC3339),
	}, nil
}

func (s *ActivityService) CreateActivity(ctx context.Context, payload *models.ActivityPayload) (*models.ActivityRecord, error) {
	capturedAt := time.Now().UTC()
	if payload.CapturedAt != nil {
		if t, err := time.Parse(time.RFC3339, *payload.CapturedAt); err == nil {
			capturedAt = t.UTC()
		}
	}

	isActive := payload.MouseMoves > 0 || payload.KeyPresses > 0

	_, err := s.pool.Exec(ctx,
		`INSERT INTO activity_logs (user_id, session_id, mouse_moves, key_presses, is_active, captured_at, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
		payload.UserID, payload.SessionID, payload.MouseMoves, payload.KeyPresses, isActive, capturedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create activity: %w", err)
	}

	return &models.ActivityRecord{
		ID:         RandomToken(16),
		UserID:     payload.UserID,
		MouseMoves: payload.MouseMoves,
		KeyPresses: payload.KeyPresses,
		CreatedAt:  time.Now().UTC().Format(time.RFC3339),
		CapturedAt: capturedAt.Format(time.RFC3339),
	}, nil
}

func (s *ActivityService) AddManualHours(ctx context.Context, userID, dateStr string, hours float64) error {
	id := RandomToken(16)
	clockInAt, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return fmt.Errorf("parse date: %w", err)
	}
	duration := time.Duration(hours * float64(time.Hour))
	clockOutAt := clockInAt.Add(duration)

	_, err = s.pool.Exec(ctx,
		`INSERT INTO work_sessions (id, user_id, clock_in_at, clock_out_at, location_type, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, 'manual', NOW(), NOW())`,
		id, userID, clockInAt, clockOutAt,
	)
	return err
}

func (s *ActivityService) GetAnalytics(ctx context.Context, userID string, start, end time.Time) (*models.DashboardAnalytics, error) {
	return s.dashboardSvc.GetAnalytics(ctx, userID, start, end)
}

func (s *ActivityService) GetCalendarHeatmap(ctx context.Context, userID string, year, month int) ([]models.CalendarHeatmapEntry, error) {
	return s.dashboardSvc.GetCalendarHeatmap(ctx, userID, year, month)
}
