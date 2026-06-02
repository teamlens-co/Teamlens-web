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

type AttendanceSession struct {
	ID                 string  `json:"id"`
	ClockInAt          string  `json:"clockInAt"`
	ClockOutAt         *string `json:"clockOutAt"`
	WorkSeconds        int64   `json:"workSeconds"`
	ShiftName          string  `json:"shiftName"`
	LocationType       *string `json:"locationType"`
	IsCurrentlyWorking bool    `json:"isCurrentlyWorking"`
}

type AttendanceCell struct {
	Date           string              `json:"date"`
	Day            int                 `json:"day"`
	Status         string              `json:"status"`
	WorkSeconds    int64               `json:"workSeconds"`
	ShiftName      *string             `json:"shiftName"`
	LocationStatus *string             `json:"locationStatus"`
	ClockInAt      *string             `json:"clockInAt"`
	ClockOutAt     *string             `json:"clockOutAt"`
	Sessions       []AttendanceSession `json:"sessions"`
}

type AttendanceEmployee struct {
	UserID             string           `json:"userId"`
	EmployeeName       string           `json:"employeeName"`
	Email              string           `json:"email"`
	Initials           string           `json:"initials"`
	AttendedDays       int              `json:"attendedDays"`
	BelowThresholdDays int              `json:"belowThresholdDays"`
	AbsentDays         int              `json:"absentDays"`
	WorkingDays        int              `json:"workingDays"`
	OfficeDays         int              `json:"officeDays"`
	RemoteDays         int              `json:"remoteDays"`
	ShiftSummary       string           `json:"shiftSummary"`
	Cells              []AttendanceCell `json:"cells"`
}

type AttendanceStats struct {
	AttendedDays     int `json:"attendedDays"`
	CurrentlyWorking int `json:"currentlyWorking"`
	BelowThreshold   int `json:"belowThreshold"`
	Employees        int `json:"employees"`
	OfficeDays       int `json:"officeDays"`
	RemoteDays       int `json:"remoteDays"`
}

type TimesheetEntry struct {
	ID                 string  `json:"id"`
	UserID             string  `json:"userId"`
	EmployeeName       string  `json:"employeeName"`
	TeamName           *string `json:"teamName"`
	LocationStatus     *string `json:"locationStatus"`
	ShiftName          string  `json:"shiftName"`
	Date               string  `json:"date"`
	ClockInAt          string  `json:"clockInAt"`
	ClockOutAt         *string `json:"clockOutAt"`
	WorkSeconds        int64   `json:"workSeconds"`
	ActiveSeconds      int64   `json:"activeSeconds"`
	IsCurrentlyWorking bool    `json:"isCurrentlyWorking"`
}

type AttendanceOverview struct {
	Month            string               `json:"month"`
	ThresholdMinutes int                  `json:"thresholdMinutes"`
	DaysInMonth      int                  `json:"daysInMonth"`
	Stats            AttendanceStats      `json:"stats"`
	Employees        []AttendanceEmployee `json:"employees"`
	Timesheets       []TimesheetEntry     `json:"timesheets"`
}

func NewDashboardService(pool *pgxpool.Pool, locationSvc *LocationService) *DashboardService {
	return &DashboardService{
		pool:            pool,
		locationService: locationSvc,
	}
}

func (s *DashboardService) GetAttendance(ctx context.Context, organizationID, viewerUserID string, role models.AuthRole, requestedUserID *string, start, end time.Time) (*AttendanceOverview, error) {
	threshold := 180
	_ = s.pool.QueryRow(ctx,
		`SELECT COALESCE(productivity_threshold_minutes, 180)
		 FROM organizations
		 WHERE id = $1`,
		organizationID,
	).Scan(&threshold)

	rangeStart := time.Date(start.UTC().Year(), start.UTC().Month(), start.UTC().Day(), 0, 0, 0, 0, time.UTC)
	rangeEnd := time.Date(end.UTC().Year(), end.UTC().Month(), end.UTC().Day(), 23, 59, 59, int(time.Second-time.Nanosecond), time.UTC)
	days := enumerateDays(rangeStart, rangeEnd)

	userFilter := ""
	args := []interface{}{organizationID}
	if role == models.RoleEmployee {
		userFilter = " AND id = $2"
		args = append(args, viewerUserID)
	} else if requestedUserID != nil && *requestedUserID != "" {
		userFilter = " AND id = $2"
		args = append(args, *requestedUserID)
	}

	rows, err := s.pool.Query(ctx,
		`SELECT id, full_name, email
		 FROM users
		 WHERE organization_id = $1 AND role = 'EMPLOYEE'`+userFilter+`
		 ORDER BY full_name ASC, email ASC`,
		args...,
	)
	if err != nil {
		return nil, fmt.Errorf("query attendance users: %w", err)
	}
	defer rows.Close()

	type userRow struct {
		id    string
		name  string
		email string
	}
	var users []userRow
	for rows.Next() {
		var user userRow
		if err := rows.Scan(&user.id, &user.name, &user.email); err != nil {
			return nil, fmt.Errorf("scan attendance user: %w", err)
		}
		users = append(users, user)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate attendance users: %w", err)
	}

	overview := &AttendanceOverview{
		Month:            rangeStart.Format("2006-01"),
		ThresholdMinutes: threshold,
		DaysInMonth:      len(days),
		Employees:        []AttendanceEmployee{},
		Timesheets:       []TimesheetEntry{},
	}
	overview.Stats.Employees = len(users)

	for _, user := range users {
		employee, timesheets, err := s.buildAttendanceEmployee(ctx, user.id, user.name, user.email, days, threshold, rangeStart, rangeEnd)
		if err != nil {
			return nil, err
		}
		overview.Employees = append(overview.Employees, employee)
		overview.Timesheets = append(overview.Timesheets, timesheets...)
		overview.Stats.AttendedDays += employee.AttendedDays
		overview.Stats.BelowThreshold += employee.BelowThresholdDays
		overview.Stats.CurrentlyWorking += employee.WorkingDays
		overview.Stats.OfficeDays += employee.OfficeDays
		overview.Stats.RemoteDays += employee.RemoteDays
	}

	return overview, nil
}

func (s *DashboardService) buildAttendanceEmployee(ctx context.Context, userID, name, email string, days []time.Time, thresholdMinutes int, start, end time.Time) (AttendanceEmployee, []TimesheetEntry, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT ws.id, ws.clock_in_at, ws.clock_out_at, ws.location_type,
		        COALESCE((
		          SELECT tm.name
		          FROM team_memberships mt
		          JOIN teams tm ON tm.id = mt.team_id
		          WHERE mt.user_id = ws.user_id
		          ORDER BY tm.name ASC
		          LIMIT 1
		        ), '') AS team_name
		 FROM work_sessions ws
		 WHERE ws.user_id = $1
		   AND ws.clock_in_at < $3
		   AND COALESCE(ws.clock_out_at, NOW()) > $2
		 ORDER BY ws.clock_in_at ASC`,
		userID, start, end,
	)
	if err != nil {
		return AttendanceEmployee{}, nil, fmt.Errorf("query attendance sessions: %w", err)
	}
	defer rows.Close()

	type sessionRow struct {
		id           string
		clockInAt    time.Time
		clockOutAt   *time.Time
		locationType *string
		teamName     string
	}
	var sessions []sessionRow
	for rows.Next() {
		var session sessionRow
		if err := rows.Scan(&session.id, &session.clockInAt, &session.clockOutAt, &session.locationType, &session.teamName); err != nil {
			return AttendanceEmployee{}, nil, fmt.Errorf("scan attendance session: %w", err)
		}
		sessions = append(sessions, session)
	}
	if err := rows.Err(); err != nil {
		return AttendanceEmployee{}, nil, fmt.Errorf("iterate attendance sessions: %w", err)
	}

	now := time.Now().UTC()
	thresholdSeconds := int64(thresholdMinutes * 60)
	employee := AttendanceEmployee{
		UserID:       userID,
		EmployeeName: name,
		Email:        email,
		Initials:     initialsForName(name, email),
		ShiftSummary: "Flexible",
		Cells:        []AttendanceCell{},
	}
	var timesheets []TimesheetEntry

	for _, day := range days {
		dayStart := day
		dayEnd := day.Add(24*time.Hour - time.Nanosecond)
		cell := AttendanceCell{
			Date:     day.Format("2006-01-02"),
			Day:      day.Day(),
			Status:   "absent",
			Sessions: []AttendanceSession{},
		}
		if day.Weekday() == time.Saturday || day.Weekday() == time.Sunday {
			cell.Status = "weekend"
		}
		if dayStart.After(time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)) {
			cell.Status = "future"
		}

		for _, session := range sessions {
			sessionEnd := now
			if session.clockOutAt != nil {
				sessionEnd = session.clockOutAt.UTC()
			}
			if !session.clockInAt.Before(dayEnd) || !sessionEnd.After(dayStart) {
				continue
			}

			sliceStart := maxTime(session.clockInAt.UTC(), dayStart)
			sliceEnd := minTime(sessionEnd, dayEnd)
			if sliceEnd.Before(sliceStart) || sliceEnd.Equal(sliceStart) {
				continue
			}
			workSeconds := int64(sliceEnd.Sub(sliceStart).Seconds())
			clockIn := session.clockInAt.UTC().Format(time.RFC3339)
			var clockOut *string
			if session.clockOutAt != nil {
				v := session.clockOutAt.UTC().Format(time.RFC3339)
				clockOut = &v
			}
			locationStatus := locationDisplay(session.locationType)
			isWorking := session.clockOutAt == nil

			cell.WorkSeconds += workSeconds
			if cell.ClockInAt == nil || clockIn < *cell.ClockInAt {
				cell.ClockInAt = &clockIn
			}
			if clockOut != nil {
				if cell.ClockOutAt == nil || *clockOut > *cell.ClockOutAt {
					cell.ClockOutAt = clockOut
				}
			}
			if cell.LocationStatus == nil && locationStatus != nil {
				cell.LocationStatus = locationStatus
			}
			shift := "Flexible"
			cell.ShiftName = &shift
			cell.Sessions = append(cell.Sessions, AttendanceSession{
				ID:                 session.id,
				ClockInAt:          clockIn,
				ClockOutAt:         clockOut,
				WorkSeconds:        workSeconds,
				ShiftName:          shift,
				LocationType:       session.locationType,
				IsCurrentlyWorking: isWorking,
			})
		}

		if cell.WorkSeconds > 0 && (cell.Status == "absent" || cell.Status == "weekend") {
			if hasOpenSession(cell.Sessions) {
				cell.Status = "working"
				employee.WorkingDays++
			} else if cell.WorkSeconds >= thresholdSeconds {
				cell.Status = "attended"
				employee.AttendedDays++
			} else {
				cell.Status = "below"
				employee.BelowThresholdDays++
			}
		} else if cell.Status == "absent" {
			employee.AbsentDays++
		}
		if cell.LocationStatus != nil {
			switch *cell.LocationStatus {
			case "Office":
				employee.OfficeDays++
			case "Remote":
				employee.RemoteDays++
			}
		}
		employee.Cells = append(employee.Cells, cell)
	}

	for _, session := range sessions {
		sessionEnd := now
		if session.clockOutAt != nil {
			sessionEnd = session.clockOutAt.UTC()
		}
		workStart := maxTime(session.clockInAt.UTC(), start)
		workEnd := minTime(sessionEnd, end)
		if !workEnd.After(workStart) {
			continue
		}
		clockIn := session.clockInAt.UTC().Format(time.RFC3339)
		var clockOut *string
		if session.clockOutAt != nil {
			v := session.clockOutAt.UTC().Format(time.RFC3339)
			clockOut = &v
		}
		var teamName *string
		if session.teamName != "" {
			teamName = &session.teamName
		}
		timesheets = append(timesheets, TimesheetEntry{
			ID:                 session.id,
			UserID:             userID,
			EmployeeName:       name,
			TeamName:           teamName,
			LocationStatus:     locationDisplay(session.locationType),
			ShiftName:          "Flexible",
			Date:               session.clockInAt.UTC().Format("2006-01-02"),
			ClockInAt:          clockIn,
			ClockOutAt:         clockOut,
			WorkSeconds:        int64(workEnd.Sub(workStart).Seconds()),
			ActiveSeconds:      0,
			IsCurrentlyWorking: session.clockOutAt == nil,
		})
	}

	return employee, timesheets, nil
}

const implicitEndSeconds = 90
const idleThresholdSeconds = 15

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
		SessionID  string
		Timestamp  time.Time
		MouseMoves int32
		KeyPresses int32
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
		UserID:              userID,
		Range:               "custom",
		WorkSeconds:         workSeconds,
		ActiveSeconds:       activeSeconds,
		IdleSeconds:         idleSeconds,
		ManualSeconds:       totalManualSeconds,
		ProductivityPercent: productivityPct,
		TotalMouseMoves:     totalMouseMoves,
		TotalKeyPresses:     totalKeyPresses,
		Sessions:            dashSessions,
		LocationStatus:      locationStatus,
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
		workMs    int64
		activeSec int64
		manualSec int64
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

func enumerateDays(start, end time.Time) []time.Time {
	var days []time.Time
	cursor := time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, time.UTC)
	last := time.Date(end.Year(), end.Month(), end.Day(), 0, 0, 0, 0, time.UTC)
	for !cursor.After(last) {
		days = append(days, cursor)
		cursor = cursor.Add(24 * time.Hour)
	}
	return days
}

func maxTime(a, b time.Time) time.Time {
	if a.After(b) {
		return a
	}
	return b
}

func minTime(a, b time.Time) time.Time {
	if a.Before(b) {
		return a
	}
	return b
}

func initialsForName(name, email string) string {
	source := strings.TrimSpace(name)
	if source == "" {
		source = strings.Split(email, "@")[0]
	}
	parts := strings.Fields(source)
	if len(parts) == 0 {
		return "U"
	}
	initials := ""
	for _, part := range parts {
		if part == "" {
			continue
		}
		initials += strings.ToUpper(part[:1])
		if len(initials) >= 2 {
			return initials
		}
	}
	return initials
}

func locationDisplay(locationType *string) *string {
	if locationType == nil || *locationType == "" {
		return nil
	}
	value := strings.ToLower(*locationType)
	display := strings.ToUpper(value[:1]) + value[1:]
	return &display
}

func hasOpenSession(sessions []AttendanceSession) bool {
	for _, session := range sessions {
		if session.IsCurrentlyWorking {
			return true
		}
	}
	return false
}
