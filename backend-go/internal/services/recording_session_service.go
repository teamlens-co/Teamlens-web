package services

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/teamlens/backend-go/internal/models"
)

type RecordingSessionService struct {
	pool *pgxpool.Pool
}

type StartRecordingSessionPayload struct {
	EmployeeID     string
	OrganizationID string
	WorkSessionID  *string
	FPS            int
	Width          int
	Height         int
	Codec          string
	MimeType       string
	StartedAt      time.Time
}

type SaveRecordingChunkPayload struct {
	SessionID  string
	ChunkIndex int
	FilePath   string
	FileSize   int64
	DurationMs int64
}

func NewRecordingSessionService(pool *pgxpool.Pool) *RecordingSessionService {
	return &RecordingSessionService{pool: pool}
}

func (s *RecordingSessionService) StartSession(ctx context.Context, payload StartRecordingSessionPayload) (*models.RecordingSession, error) {
	id := RandomToken(16)
	startedAt := payload.StartedAt
	if startedAt.IsZero() {
		startedAt = time.Now().UTC()
	}
	if payload.FPS <= 0 {
		payload.FPS = 10
	}
	if payload.Codec == "" {
		payload.Codec = "vp8"
	}
	if payload.MimeType == "" {
		payload.MimeType = "video/webm"
	}

	_, err := s.pool.Exec(ctx,
		`INSERT INTO recording_sessions
		 (id, employee_id, organization_id, work_session_id, started_at, fps, width, height, codec, mime_type, status, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'recording', NOW(), NOW())`,
		id, payload.EmployeeID, payload.OrganizationID, payload.WorkSessionID, startedAt.UTC(),
		payload.FPS, payload.Width, payload.Height, payload.Codec, payload.MimeType,
	)
	if err != nil {
		return nil, fmt.Errorf("start recording session: %w", err)
	}

	_, _ = s.pool.Exec(ctx,
		`UPDATE work_sessions
		 SET is_recording = TRUE, recording_started_at = COALESCE(recording_started_at, $2), updated_at = NOW()
		 WHERE id = $1`,
		payload.WorkSessionID, startedAt.UTC(),
	)

	return s.GetSession(ctx, id, payload.OrganizationID, payload.EmployeeID)
}

func (s *RecordingSessionService) SaveChunk(ctx context.Context, payload SaveRecordingChunkPayload, employeeID string) (*models.RecordingChunk, error) {
	id := RandomToken(16)
	_, err := s.pool.Exec(ctx,
		`INSERT INTO recording_chunks
		 (id, recording_session_id, chunk_index, file_path, file_size, duration_ms, uploaded_at, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
		 ON CONFLICT (recording_session_id, chunk_index)
		 DO UPDATE SET file_path = EXCLUDED.file_path, file_size = EXCLUDED.file_size, duration_ms = EXCLUDED.duration_ms, uploaded_at = NOW()
		 RETURNING id`,
		id, payload.SessionID, payload.ChunkIndex, payload.FilePath, payload.FileSize, payload.DurationMs,
	)
	if err != nil {
		return nil, fmt.Errorf("save recording chunk: %w", err)
	}

	_, err = s.pool.Exec(ctx,
		`UPDATE recording_sessions
		 SET status = CASE WHEN status = 'recording' THEN 'uploading' ELSE status END,
		     total_size = COALESCE((SELECT SUM(file_size) FROM recording_chunks WHERE recording_session_id = $1), 0),
		     duration_ms = GREATEST(duration_ms, COALESCE((SELECT SUM(duration_ms) FROM recording_chunks WHERE recording_session_id = $1), 0)),
		     updated_at = NOW()
		 WHERE id = $1 AND employee_id = $2 AND deleted_at IS NULL`,
		payload.SessionID, employeeID,
	)
	if err != nil {
		return nil, fmt.Errorf("update recording session totals: %w", err)
	}

	return s.GetChunk(ctx, payload.SessionID, payload.ChunkIndex)
}

func (s *RecordingSessionService) FinishSession(ctx context.Context, sessionID, employeeID string, stoppedAt time.Time, failed bool) (*models.RecordingSession, error) {
	if stoppedAt.IsZero() {
		stoppedAt = time.Now().UTC()
	}
	status := models.RecordingStatusComplete
	if failed {
		status = models.RecordingStatusFailed
	}
	var orgID string
	err := s.pool.QueryRow(ctx,
		`UPDATE recording_sessions
		 SET stopped_at = $1,
		     status = $2,
		     total_size = COALESCE((SELECT SUM(file_size) FROM recording_chunks WHERE recording_session_id = $3), 0),
		     duration_ms = GREATEST(EXTRACT(EPOCH FROM ($1 - started_at))::bigint * 1000,
		                           COALESCE((SELECT SUM(duration_ms) FROM recording_chunks WHERE recording_session_id = $3), 0)),
		     updated_at = NOW()
		 WHERE id = $3 AND employee_id = $4 AND deleted_at IS NULL
		 RETURNING organization_id`,
		stoppedAt.UTC(), status, sessionID, employeeID,
	).Scan(&orgID)
	if err != nil {
		return nil, fmt.Errorf("finish recording session: %w", err)
	}

	_, _ = s.pool.Exec(ctx,
		`UPDATE work_sessions
		 SET is_recording = FALSE, recording_stopped_at = $2, updated_at = NOW()
		 WHERE id = (SELECT work_session_id FROM recording_sessions WHERE id = $1)`,
		sessionID, stoppedAt.UTC(),
	)

	return s.GetSession(ctx, sessionID, orgID, "")
}

func (s *RecordingSessionService) ListSessions(ctx context.Context, organizationID string, employeeID *string, limit int) ([]models.RecordingSession, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	query := `SELECT rs.id, rs.employee_id, rs.organization_id, rs.work_session_id, rs.started_at, rs.stopped_at,
	                 rs.fps, rs.width, rs.height, rs.codec, rs.mime_type, rs.status, rs.total_size, rs.duration_ms,
	                 rs.deleted_at, rs.created_at, rs.updated_at, u.full_name, u.email, COUNT(rc.id)::int
	          FROM recording_sessions rs
	          JOIN users u ON u.id = rs.employee_id
	          LEFT JOIN recording_chunks rc ON rc.recording_session_id = rs.id
	          WHERE rs.organization_id = $1 AND rs.deleted_at IS NULL`
	args := []interface{}{organizationID}
	if employeeID != nil && *employeeID != "" {
		query += ` AND rs.employee_id = $2`
		args = append(args, *employeeID)
	}
	query += ` GROUP BY rs.id, u.full_name, u.email ORDER BY rs.started_at DESC LIMIT $` + fmt.Sprint(len(args)+1)
	args = append(args, limit)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list recording sessions: %w", err)
	}
	defer rows.Close()

	return scanRecordingSessions(rows)
}

func (s *RecordingSessionService) ListActiveSessions(ctx context.Context, organizationID string) ([]models.RecordingSession, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT rs.id, rs.employee_id, rs.organization_id, rs.work_session_id, rs.started_at, rs.stopped_at,
		        rs.fps, rs.width, rs.height, rs.codec, rs.mime_type, rs.status, rs.total_size, rs.duration_ms,
		        rs.deleted_at, rs.created_at, rs.updated_at, u.full_name, u.email, COUNT(rc.id)::int
		 FROM recording_sessions rs
		 JOIN users u ON u.id = rs.employee_id
		 LEFT JOIN recording_chunks rc ON rc.recording_session_id = rs.id
		 WHERE rs.organization_id = $1
		   AND rs.deleted_at IS NULL
		   AND rs.status IN ('recording', 'uploading')
		   AND rs.started_at >= NOW() - INTERVAL '24 hours'
		 GROUP BY rs.id, u.full_name, u.email
		 ORDER BY rs.started_at DESC`,
		organizationID,
	)
	if err != nil {
		return nil, fmt.Errorf("list active recording sessions: %w", err)
	}
	defer rows.Close()
	return scanRecordingSessions(rows)
}

func (s *RecordingSessionService) GetSession(ctx context.Context, id, organizationID, employeeID string) (*models.RecordingSession, error) {
	query := `SELECT rs.id, rs.employee_id, rs.organization_id, rs.work_session_id, rs.started_at, rs.stopped_at,
	                 rs.fps, rs.width, rs.height, rs.codec, rs.mime_type, rs.status, rs.total_size, rs.duration_ms,
	                 rs.deleted_at, rs.created_at, rs.updated_at, u.full_name, u.email, COUNT(rc.id)::int
	          FROM recording_sessions rs
	          JOIN users u ON u.id = rs.employee_id
	          LEFT JOIN recording_chunks rc ON rc.recording_session_id = rs.id
	          WHERE rs.id = $1 AND rs.deleted_at IS NULL`
	args := []interface{}{id}
	if organizationID != "" {
		query += ` AND rs.organization_id = $2`
		args = append(args, organizationID)
	}
	if employeeID != "" {
		query += ` AND rs.employee_id = $` + fmt.Sprint(len(args)+1)
		args = append(args, employeeID)
	}
	query += ` GROUP BY rs.id, u.full_name, u.email`

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("get recording session: %w", err)
	}
	defer rows.Close()
	sessions, err := scanRecordingSessions(rows)
	if err != nil {
		return nil, err
	}
	if len(sessions) == 0 {
		return nil, pgx.ErrNoRows
	}
	return &sessions[0], nil
}

func (s *RecordingSessionService) ListChunks(ctx context.Context, sessionID, organizationID string) ([]models.RecordingChunk, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT rc.id, rc.recording_session_id, rc.chunk_index, rc.file_path, rc.file_size, rc.duration_ms, rc.uploaded_at, rc.created_at
		 FROM recording_chunks rc
		 JOIN recording_sessions rs ON rs.id = rc.recording_session_id
		 WHERE rc.recording_session_id = $1 AND rs.organization_id = $2 AND rs.deleted_at IS NULL
		 ORDER BY rc.chunk_index ASC`,
		sessionID, organizationID,
	)
	if err != nil {
		return nil, fmt.Errorf("list recording chunks: %w", err)
	}
	defer rows.Close()

	var chunks []models.RecordingChunk
	for rows.Next() {
		var chunk models.RecordingChunk
		if err := rows.Scan(&chunk.ID, &chunk.RecordingSessionID, &chunk.ChunkIndex, &chunk.FilePath, &chunk.FileSize, &chunk.DurationMs, &chunk.UploadedAt, &chunk.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan recording chunk: %w", err)
		}
		chunks = append(chunks, chunk)
	}
	return chunks, rows.Err()
}

func (s *RecordingSessionService) GetChunkByID(ctx context.Context, sessionID, chunkID, organizationID string) (*models.RecordingChunk, error) {
	var chunk models.RecordingChunk
	err := s.pool.QueryRow(ctx,
		`SELECT rc.id, rc.recording_session_id, rc.chunk_index, rc.file_path, rc.file_size, rc.duration_ms, rc.uploaded_at, rc.created_at
		 FROM recording_chunks rc
		 JOIN recording_sessions rs ON rs.id = rc.recording_session_id
		 WHERE rc.recording_session_id = $1 AND rc.id = $2 AND rs.organization_id = $3 AND rs.deleted_at IS NULL`,
		sessionID, chunkID, organizationID,
	).Scan(&chunk.ID, &chunk.RecordingSessionID, &chunk.ChunkIndex, &chunk.FilePath, &chunk.FileSize, &chunk.DurationMs, &chunk.UploadedAt, &chunk.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &chunk, nil
}

func (s *RecordingSessionService) GetChunk(ctx context.Context, sessionID string, chunkIndex int) (*models.RecordingChunk, error) {
	var chunk models.RecordingChunk
	err := s.pool.QueryRow(ctx,
		`SELECT id, recording_session_id, chunk_index, file_path, file_size, duration_ms, uploaded_at, created_at
		 FROM recording_chunks WHERE recording_session_id = $1 AND chunk_index = $2`,
		sessionID, chunkIndex,
	).Scan(&chunk.ID, &chunk.RecordingSessionID, &chunk.ChunkIndex, &chunk.FilePath, &chunk.FileSize, &chunk.DurationMs, &chunk.UploadedAt, &chunk.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &chunk, nil
}

func (s *RecordingSessionService) ExpireOldSessions(ctx context.Context, cutoff time.Time) ([]string, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT rc.file_path
		 FROM recording_chunks rc
		 JOIN recording_sessions rs ON rs.id = rc.recording_session_id
		 WHERE rs.started_at < $1 AND rs.deleted_at IS NULL`,
		cutoff.UTC(),
	)
	if err != nil {
		return nil, fmt.Errorf("query old recording chunks: %w", err)
	}
	defer rows.Close()

	var paths []string
	for rows.Next() {
		var path string
		if err := rows.Scan(&path); err != nil {
			return nil, fmt.Errorf("scan old recording chunk: %w", err)
		}
		paths = append(paths, path)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	_, err = s.pool.Exec(ctx,
		`UPDATE recording_sessions
		 SET status = 'expired', deleted_at = NOW(), updated_at = NOW()
		 WHERE started_at < $1 AND deleted_at IS NULL`,
		cutoff.UTC(),
	)
	if err != nil {
		return nil, fmt.Errorf("expire old recording sessions: %w", err)
	}
	return paths, nil
}

func scanRecordingSessions(rows pgx.Rows) ([]models.RecordingSession, error) {
	var sessions []models.RecordingSession
	for rows.Next() {
		var session models.RecordingSession
		if err := rows.Scan(&session.ID, &session.EmployeeID, &session.OrganizationID, &session.WorkSessionID,
			&session.StartedAt, &session.StoppedAt, &session.FPS, &session.Width, &session.Height,
			&session.Codec, &session.MimeType, &session.Status, &session.TotalSize, &session.DurationMs,
			&session.DeletedAt, &session.CreatedAt, &session.UpdatedAt, &session.EmployeeName, &session.EmployeeEmail,
			&session.ChunkCount); err != nil {
			return nil, fmt.Errorf("scan recording session: %w", err)
		}
		sessions = append(sessions, session)
	}
	return sessions, rows.Err()
}
