package services

import (
	"context"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/teamlens/backend-go/internal/models"
)

type DashboardService struct {
	pool            *pgxpool.Pool
	locationService *LocationService
}

func NewDashboardService(pool *pgxpool.Pool, locationSvc *LocationService) *DashboardService {
	return &DashboardService{
		pool:            pool,
		locationService: locationSvc,
	}
}

const implicitEndSeconds = 90
const idleThresholdSeconds = 60

// GetAnalytics computes dashboard analytics for a user in a date range
func (s *DashboardService) GetAnalytics(ctx context.Context, userID string, start, end time.Time) (*models.DashboardAnalytics, error) {
	return s.computeAnalytics(ctx, userID, start, end)
}

func (s *DashboardService) computeAnalytics(ctx context.Context, userID string, start, end time.Time) (*models.DashboardAnalytics, error) {
	result := &models.DashboardAnalytics{
		UserID: userID,
		Range:  "custom",
	}

	// Fetch sessions in range
	rows, err := s.pool.Query(ctx,
		`SELECT id, user_id, clock_in_at, clock_out_at, location_type, latitude, longitude
		 FROM work_sessions
		 WHERE user_id = $1
		   AND clock_in_at < $3
		   AND COALESCE(clock_out_at, $3) > $2
		 ORDER BY clock_in_at DESC
		 LIMIT 30`,
		userID, start, end,
	)
	if err != nil {
		return nil, fmt.Errorf("query sessions: %w", err)
	}
	defer rows.Close()

	type sessionRow struct {
		id           string
		clockInAt    time.Time
		clockOutAt   *time.Time
		locationType *string
		latitude     *float64
		longitude    *float64
	}

	var sessions []sessionRow
	for rows.Next() {
		var s sessionRow
		if err := rows.Scan(&s.id, &userID, &s.clockInAt, &s.clockOutAt, &s.locationType, &s.latitude, &s.longitude); err != nil {
			return nil, fmt.Errorf("scan session: %w", err)
		}
		sessions = append(sessions, s)
	}

	if len(sessions) == 0 {
		return result, nil
	}

	// Collect session IDs
	sessionIDs := make([]string, len(sessions))
	for i, s := range sessions {
		sessionIDs[i] = s.id
	}

	// Fetch all activity logs for these sessions
	type activityLog struct {
		SessionID    string
		Timestamp    time.Time
		MouseMoves   int32
		KeyPresses   int32
	}

	var logs []activityLog

	if len(sessionIDs) > 0 {
		// Build query with IN clause
		query := `SELECT session_id, COALESCE(captured_at, created_at) AS ts, mouse_moves, key_presses
		          FROM activity_logs
		          WHERE session_id = ANY($1)
		            AND COALESCE(captured_at, created_at) >= $2
		            AND COALESCE(captured_at, created_at) <= $3
		          ORDER BY session_id, ts`

		logRows, err := s.pool.Query(ctx, query, sessionIDs, start, end)
		if err != nil {
			return nil, fmt.Errorf("query activity logs: %w", err)
		}
		defer logRows.Close()

		for logRows.Next() {
			var l activityLog
			if err := logRows.Scan(&l.SessionID, &l.Timestamp, &l.MouseMoves, &l.KeyPresses); err != nil {
				return nil, fmt.Errorf("scan activity log: %w", err)
			}
			logs = append(logs, l)
		}
	}

	// Group by session
	snapshotsBySession := make(map[string][]ActivitySample)
	for _, l := range logs {
		snapshotsBySession[l.SessionID] = append(snapshotsBySession[l.SessionID], ActivitySample{
			Timestamp:  l.Timestamp.UnixMilli(),
			MouseMoves: l.MouseMoves,
			KeyPresses: l.KeyPresses,
		})
	}

	rangeStartMs := start.UnixMilli()
	rangeEndMs := end.UnixMilli()
	now := time.Now().UnixMilli()
	implicitEndMs := int64(implicitEndSeconds * 1000)

	var totalWorkMs int64
	var totalActiveSeconds int64
	var totalIdleSeconds int64
	var totalManualSeconds int64
	var totalMouseMoves int64
	var totalKeyPresses int64
	var dashSessions []models.WorkSessionRecord
	var locationTypes []*string

	for _, row := range sessions {
		clockInMs := row.clockInAt.UnixMilli()

		var clockOutMs int64
		if row.clockOutAt != nil {
			clockOutMs = row.clockOutAt.UnixMilli()
		} else {
			snaps := snapshotsBySession[row.id]
			var lastActivityMs int64
			if len(snaps) > 0 {
				lastActivityMs = snaps[0].Timestamp
				for _, snap := range snaps {
					if snap.Timestamp > lastActivityMs {
						lastActivityMs = snap.Timestamp
					}
				}
			} else {
				lastActivityMs = clockInMs
			}

			// Check if range is current
			isCurrentRange := rangeEndMs >= now-60000

			if isCurrentRange && lastActivityMs >= now-implicitEndMs {
				clockOutMs = now
			} else {
				clockOutMs = min64(lastActivityMs, rangeEndMs)
			}
		}

		sessionStart := max64(clockInMs, rangeStartMs)
		sessionEnd := min64(clockOutMs, rangeEndMs)

		if sessionEnd <= sessionStart {
			continue
		}

		workMs := sessionEnd - sessionStart

		record := models.WorkSessionRecord{
			ID:        row.id,
			UserID:    userID,
			ClockInAt: row.clockInAt.Format(time.RFC3339),
		}
		if row.clockOutAt != nil {
			record.ClockOutAt = row.clockOutAt.Format(time.RFC3339)
		}
		if row.locationType != nil {
			record.LocationType = row.locationType
			locationTypes = append(locationTypes, row.locationType)
		}
		if row.latitude != nil {
			record.Latitude = row.latitude
		}
		if row.longitude != nil {
			record.Longitude = row.longitude
		}
		dashSessions = append(dashSessions, record)

		if row.locationType != nil && *row.locationType == "manual" {
			totalManualSeconds += workMs / 1000
		} else {
			totalWorkMs += workMs
			snaps := snapshotsBySession[row.id]
			calc := CalculateActivitySegments(ActivityCalculationInput{
				SessionStart:         sessionStart,
				SessionEnd:           sessionEnd,
				Samples:              snaps,
				IdleThresholdSeconds: idleThresholdSeconds,
			})
			totalActiveSeconds += calc.ActiveSeconds
			totalIdleSeconds += calc.IdleSeconds
			totalMouseMoves += calc.MouseMoves
			totalKeyPresses += calc.KeyPresses
		}
	}

	workSeconds := totalWorkMs / 1000
	activeSeconds := min64(totalActiveSeconds, workSeconds)
	idleSeconds := min64(totalIdleSeconds, max64(workSeconds-activeSeconds, 0))

	productivityPct := 0
	if workSeconds > 0 {
		productivityPct = int(math.Min(100, math.Round(float64(activeSeconds*100)/float64(workSeconds))))
	}

	locationStatus := s.locationService.ComputeDailyLocationStatus(locationTypes)

	return &models.DashboardAnalytics{
		UserID:             userID,
		Range:              "custom",
		WorkSeconds:        workSeconds,
		ActiveSeconds:      activeSeconds,
		IdleSeconds:        idleSeconds,
		ManualSeconds:      totalManualSeconds,
		ProductivityPercent: productivityPct,
		TotalMouseMoves:    totalMouseMoves,
		TotalKeyPresses:    totalKeyPresses,
		Sessions:           dashSessions,
		LocationStatus:     locationStatus,
	}, nil
}

// GetCalendarHeatmap returns per-day aggregation for a given month
func (s *DashboardService) GetCalendarHeatmap(ctx context.Context, userID string, year, month int) ([]models.CalendarHeatmapEntry, error) {
	start := time.Date(year, time.Month(month), 1, 0, 0, 0, 0, time.UTC)
	end := time.Date(year, time.Month(month+1), 0, 23, 59, 59, 999999999, time.UTC)

	// Fetch sessions that overlap this month
	rows, err := s.pool.Query(ctx,
		`SELECT id, clock_in_at, clock_out_at, location_type
		 FROM work_sessions
		 WHERE user_id = $1
		   AND clock_in_at < $3
		   AND COALESCE(clock_out_at, $3) > $2
		 ORDER BY clock_in_at ASC
		 LIMIT 200`,
		userID, start, end,
	)
	if err != nil {
		return nil, fmt.Errorf("query heatmap sessions: %w", err)
	}
	defer rows.Close()

	type heatmapSession struct {
		id           string
		clockInAt    time.Time
		clockOutAt   *time.Time
		locationType *string
	}
	var sessions []heatmapSession
	for rows.Next() {
		var s heatmapSession
		if err := rows.Scan(&s.id, &s.clockInAt, &s.clockOutAt, &s.locationType); err != nil {
			return nil, fmt.Errorf("scan heatmap session: %w", err)
		}
		sessions = append(sessions, s)
	}

	if len(sessions) == 0 {
		return nil, nil
	}

	// Get activity logs
	sessionIDs := make([]string, len(sessions))
	for i, s := range sessions {
		sessionIDs[i] = s.id
	}

	type activityLog struct {
		SessionID string
		Timestamp time.Time
		Mouse     int32
		Keys      int32
	}
	var logs []activityLog
	logRows, err := s.pool.Query(ctx,
		`SELECT session_id, COALESCE(captured_at, created_at) AS ts, mouse_moves, key_presses
		 FROM activity_logs
		 WHERE session_id = ANY($1)
		   AND COALESCE(captured_at, created_at) >= $2
		   AND COALESCE(captured_at, created_at) <= $3
		 ORDER BY session_id, ts`,
		sessionIDs, start, end,
	)
	if err != nil {
		return nil, fmt.Errorf("query heatmap logs: %w", err)
	}
	defer logRows.Close()

	for logRows.Next() {
		var l activityLog
		if err := logRows.Scan(&l.SessionID, &l.Timestamp, &l.Mouse, &l.Keys); err != nil {
			return nil, fmt.Errorf("scan heatmap log: %w", err)
		}
		logs = append(logs, l)
	}

	snapshotsBySession := make(map[string][]ActivitySample)
	for _, l := range logs {
		snapshotsBySession[l.SessionID] = append(snapshotsBySession[l.SessionID], ActivitySample{
			Timestamp:  l.Timestamp.UnixMilli(),
			MouseMoves: l.Mouse,
			KeyPresses: l.Keys,
		})
	}

	// Aggregate by calendar day
	type dayAccum struct {
		workMs       int64
		activeSec    int64
		manualSec    int64
	}
	dayMap := make(map[string]*dayAccum)
	implicitEndMs := int64(implicitEndSeconds * 1000)
	nowMs := time.Now().UnixMilli()
	rangeEndMs := end.UnixMilli()

	for _, row := range sessions {
		clockInMs := row.clockInAt.UnixMilli()

		var clockOutMs int64
		if row.clockOutAt != nil {
			clockOutMs = row.clockOutAt.UnixMilli()
		} else {
			snaps := snapshotsBySession[row.id]
			var lastActivityMs int64
			if len(snaps) > 0 {
				lastActivityMs = snaps[0].Timestamp
				for _, snap := range snaps {
					if snap.Timestamp > lastActivityMs {
						lastActivityMs = snap.Timestamp
					}
				}
			} else {
				lastActivityMs = clockInMs
			}
			isCurrentRange := rangeEndMs >= nowMs-60000
			if isCurrentRange && lastActivityMs >= nowMs-implicitEndMs {
				clockOutMs = nowMs
			} else {
				clockOutMs = min64(lastActivityMs, rangeEndMs)
			}
		}

		sessionStart := max64(clockInMs, start.UnixMilli())
		sessionEnd := min64(clockOutMs, rangeEndMs)
		if sessionEnd <= sessionStart {
			continue
		}

		// Walk each day
		cursor := time.UnixMilli(sessionStart).UTC()
		cursor = time.Date(cursor.Year(), cursor.Month(), cursor.Day(), 0, 0, 0, 0, time.UTC)

		for cursor.UnixMilli() <= sessionEnd {
			dayStart := cursor.UnixMilli()
			dayEnd := dayStart + 86400000 - 1

			sliceStart := max64(sessionStart, dayStart)
			sliceEnd := min64(sessionEnd, dayEnd)
			if sliceEnd <= sliceStart {
				cursor = cursor.Add(24 * time.Hour)
				continue
			}

			dateKey := cursor.Format("2006-01-02")
			if dayMap[dateKey] == nil {
				dayMap[dateKey] = &dayAccum{}
			}
			acc := dayMap[dateKey]

			if row.locationType != nil && *row.locationType == "manual" {
				acc.manualSec += (sliceEnd - sliceStart) / 1000
			} else {
				acc.workMs += sliceEnd - sliceStart
				snaps := snapshotsBySession[row.id]
				calc := CalculateActivitySegments(ActivityCalculationInput{
					SessionStart:         sliceStart,
					SessionEnd:           sliceEnd,
					Samples:              snaps,
					IdleThresholdSeconds: idleThresholdSeconds,
				})
				acc.activeSec += calc.ActiveSeconds
			}

			cursor = cursor.Add(24 * time.Hour)
		}
	}

	// Build sorted result
	dates := make([]string, 0, len(dayMap))
	for d := range dayMap {
		dates = append(dates, d)
	}
	sortStrings(dates)

	var entries []models.CalendarHeatmapEntry
	for _, d := range dates {
		acc := dayMap[d]
		workSec := acc.workMs / 1000
		activeSec := min64(acc.activeSec, workSec)
		entries = append(entries, models.CalendarHeatmapEntry{
			Date:          d,
			WorkSeconds:   workSec,
			ActiveSeconds: activeSec,
			ManualSeconds: acc.manualSec,
		})
	}

	return entries, nil
}

func sortStrings(s []string) {
	for i := 0; i < len(s); i++ {
		for j := i + 1; j < len(s); j++ {
			if strings.Compare(s[i], s[j]) > 0 {
				s[i], s[j] = s[j], s[i]
			}
		}
	}
}
