package services

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/teamlens/backend-go/internal/models"
)

type ScreenshotService struct {
	pool *pgxpool.Pool
}

func NewScreenshotService(pool *pgxpool.Pool) *ScreenshotService {
	return &ScreenshotService{pool: pool}
}

type UploadScreenshotPayload struct {
	UserID            string
	FilePath          string
	SessionID         *string
	ActiveApplication *string
	WindowTitle       *string
	Domain            *string
	URL               *string
	EmployeeName      *string
	ProjectName       *string
	CapturedAt        time.Time
}

type GetScreenshotsPayload struct {
	UserID    string
	UserIDs   []string // Multiple user IDs (ANY match)
	SessionID *string
	Limit     int
	Offset    int
	StartDate *time.Time
	EndDate   *time.Time
}

func (s *ScreenshotService) UploadScreenshot(ctx context.Context, payload *UploadScreenshotPayload) (*models.Screenshot, error) {
	id := RandomToken(16)

	var s3 struct {
		ID     string
		UserID string
	}

	err := s.pool.QueryRow(ctx,
		`INSERT INTO screenshots
		 (id, user_id, session_id, file_path, active_application, window_title,
		  domain, url, employee_name, project_name, captured_at, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
		 RETURNING id`,
		id, payload.UserID, payload.SessionID, payload.FilePath,
		payload.ActiveApplication, payload.WindowTitle,
		payload.Domain, payload.URL, payload.EmployeeName, payload.ProjectName,
		payload.CapturedAt,
	).Scan(&s3.ID)
	if err != nil {
		return nil, fmt.Errorf("insert screenshot: %w", err)
	}

	return &models.Screenshot{
		ID:                id,
		UserID:            payload.UserID,
		SessionID:         payload.SessionID,
		FilePath:          payload.FilePath,
		ActiveApplication: payload.ActiveApplication,
		WindowTitle:       payload.WindowTitle,
		Domain:            payload.Domain,
		URL:               payload.URL,
		EmployeeName:      payload.EmployeeName,
		ProjectName:       payload.ProjectName,
		CapturedAt:        payload.CapturedAt,
		CreatedAt:         time.Now().UTC(),
	}, nil
}

func (s *ScreenshotService) GetScreenshots(ctx context.Context, payload *GetScreenshotsPayload) ([]models.Screenshot, error) {
	limit := payload.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	query := `SELECT s.id, s.user_id, s.session_id, s.file_path, s.active_application, s.window_title,
	                 s.domain, s.url, s.employee_name, s.project_name, s.captured_at, s.created_at
	          FROM screenshots s`
	args := []interface{}{}
	paramIdx := 1

	if len(payload.UserIDs) > 0 {
		// Multiple user IDs: WHERE user_id = ANY($1)
		query += fmt.Sprintf(` WHERE s.user_id = ANY($%d)`, paramIdx)
		args = append(args, payload.UserIDs)
		paramIdx++
	} else if payload.UserID != "" {
		query += fmt.Sprintf(` WHERE s.user_id = $%d`, paramIdx)
		args = append(args, payload.UserID)
		paramIdx++
	}

	if payload.SessionID != nil && *payload.SessionID != "" {
		query += fmt.Sprintf(` AND s.session_id = $%d`, paramIdx)
		args = append(args, *payload.SessionID)
		paramIdx++
	}
	if payload.StartDate != nil {
		query += fmt.Sprintf(` AND s.captured_at >= $%d`, paramIdx)
		args = append(args, *payload.StartDate)
		paramIdx++
	}
	if payload.EndDate != nil {
		query += fmt.Sprintf(` AND s.captured_at <= $%d`, paramIdx)
		args = append(args, *payload.EndDate)
		paramIdx++
	}

	query += ` ORDER BY s.captured_at DESC`
	query += fmt.Sprintf(` LIMIT $%d`, paramIdx)
	args = append(args, limit)
	paramIdx++

	if payload.Offset > 0 {
		query += fmt.Sprintf(` OFFSET $%d`, paramIdx)
		args = append(args, payload.Offset)
		paramIdx++
	}

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query screenshots: %w", err)
	}
	defer rows.Close()

	var screenshots []models.Screenshot
	for rows.Next() {
		var ss models.Screenshot
		if err := rows.Scan(&ss.ID, &ss.UserID, &ss.SessionID, &ss.FilePath,
			&ss.ActiveApplication, &ss.WindowTitle, &ss.Domain, &ss.URL,
			&ss.EmployeeName, &ss.ProjectName, &ss.CapturedAt, &ss.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan screenshot: %w", err)
		}
		screenshots = append(screenshots, ss)
	}
	return screenshots, nil
}

func (s *ScreenshotService) GetScreenshotByID(ctx context.Context, id string) (*models.Screenshot, error) {
	var ss models.Screenshot
	err := s.pool.QueryRow(ctx,
		`SELECT id, user_id, session_id, file_path, active_application, window_title,
		        domain, url, employee_name, project_name, captured_at, created_at
		 FROM screenshots WHERE id = $1`, id,
	).Scan(&ss.ID, &ss.UserID, &ss.SessionID, &ss.FilePath,
		&ss.ActiveApplication, &ss.WindowTitle, &ss.Domain, &ss.URL,
		&ss.EmployeeName, &ss.ProjectName, &ss.CapturedAt, &ss.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get screenshot: %w", err)
	}
	return &ss, nil
}

func (s *ScreenshotService) DeleteScreenshot(ctx context.Context, id string) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM screenshots WHERE id = $1`, id)
	return err
}

func (s *ScreenshotService) DeleteOldScreenshots(ctx context.Context, daysOld int) error {
	cutoff := time.Now().AddDate(0, 0, -daysOld)
	_, err := s.pool.Exec(ctx, `DELETE FROM screenshots WHERE created_at < $1`, cutoff)
	return err
}

// BuildScreenshotURL constructs the URL path to serve the screenshot file
func BuildScreenshotURL(filePath string) string {
	if strings.HasPrefix(filePath, "/") {
		return "/api/v1/screenshots/serve/" + strings.TrimPrefix(filePath, "/uploads/")
	}
	return "/api/v1/screenshots/serve/" + strings.TrimPrefix(filePath, "uploads/")
}
