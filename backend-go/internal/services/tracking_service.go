package services

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/teamlens/backend-go/internal/models"
)

// Breadcrumb filtering. Raw phone GPS is noisy enough that summing every
// reported fix makes a stationary device "walk" several kilometres a day, so
// each segment has to clear all three gates before it counts as travel.
const (
	// Fixes less precise than this are dropped outright.
	maxAccuracyMeters = 100.0
	// A segment must be longer than the fixes' own error budget, floored here,
	// before it is treated as movement rather than jitter.
	minSegmentMeters = 10.0
	// ~198 km/h. Anything faster is a bad fix, not a commute.
	maxSpeedMps = 55.0

	// Dwell clustering: consecutive fixes staying within this radius for at
	// least this long become a "stop".
	stopRadiusMeters = 75.0
	minStopSeconds   = 300

	// Guard rails on client-supplied batches and settings.
	maxPingsPerBatch       = 500
	minPingIntervalSeconds = 30
	maxPingIntervalSeconds = 1800
)

// ErrNoActiveSession is returned when a client posts breadcrumbs without being
// clocked in.
var ErrNoActiveSession = errors.New("no active work session")

type TrackingService struct {
	pool        *pgxpool.Pool
	locationSvc *LocationService
}

func NewTrackingService(pool *pgxpool.Pool, locationSvc *LocationService) *TrackingService {
	return &TrackingService{pool: pool, locationSvc: locationSvc}
}

// ─── Settings ──────────────────────────────────────────────────────────────

func (s *TrackingService) GetSettings(ctx context.Context, organizationID string) (*models.TrackingSettings, error) {
	var settings models.TrackingSettings
	var policy string

	err := s.pool.QueryRow(ctx,
		`SELECT geofence_policy, location_ping_interval_seconds, track_location_while_clocked_in
		 FROM organizations WHERE id = $1`,
		organizationID,
	).Scan(&policy, &settings.LocationPingIntervalSeconds, &settings.TrackLocationWhileClockedIn)
	if err != nil {
		return nil, fmt.Errorf("get tracking settings: %w", err)
	}

	settings.GeofencePolicy = normalizeGeofencePolicy(policy)
	return &settings, nil
}

func (s *TrackingService) UpdateSettings(ctx context.Context, organizationID string, input *models.UpdateTrackingSettingsInput) (*models.TrackingSettings, error) {
	current, err := s.GetSettings(ctx, organizationID)
	if err != nil {
		return nil, err
	}

	if input.GeofencePolicy != nil {
		policy := models.GeofencePolicy(*input.GeofencePolicy)
		switch policy {
		case models.GeofenceOff, models.GeofenceWarn, models.GeofenceBlock:
			current.GeofencePolicy = policy
		default:
			return nil, fmt.Errorf("geofencePolicy must be one of: off, warn, block")
		}
	}

	if input.LocationPingIntervalSeconds != nil {
		interval := *input.LocationPingIntervalSeconds
		if interval < minPingIntervalSeconds || interval > maxPingIntervalSeconds {
			return nil, fmt.Errorf("locationPingIntervalSeconds must be between %d and %d", minPingIntervalSeconds, maxPingIntervalSeconds)
		}
		current.LocationPingIntervalSeconds = interval
	}

	if input.TrackLocationWhileClockedIn != nil {
		current.TrackLocationWhileClockedIn = *input.TrackLocationWhileClockedIn
	}

	_, err = s.pool.Exec(ctx,
		`UPDATE organizations
		 SET geofence_policy = $1,
		     location_ping_interval_seconds = $2,
		     track_location_while_clocked_in = $3,
		     updated_at = NOW()
		 WHERE id = $4`,
		string(current.GeofencePolicy), current.LocationPingIntervalSeconds,
		current.TrackLocationWhileClockedIn, organizationID,
	)
	if err != nil {
		return nil, fmt.Errorf("update tracking settings: %w", err)
	}

	return current, nil
}

func normalizeGeofencePolicy(raw string) models.GeofencePolicy {
	switch models.GeofencePolicy(raw) {
	case models.GeofenceWarn:
		return models.GeofenceWarn
	case models.GeofenceBlock:
		return models.GeofenceBlock
	default:
		return models.GeofenceOff
	}
}

// ─── Ingest ────────────────────────────────────────────────────────────────

type sessionTrackState struct {
	id        string
	clockInAt time.Time
	lastLat   *float64
	lastLng   *float64
	lastAt    *time.Time
	distance  float64
	steps     int
}

// RecordPings validates a batch of breadcrumbs, accumulates travelled distance,
// and rolls the totals up onto the work session. Batches may be replayed safely:
// a ping that collides with one already stored is counted as a duplicate and
// contributes no extra distance.
func (s *TrackingService) RecordPings(ctx context.Context, userID, organizationID string, batch *models.LocationPingBatch) (*models.LocationPingResult, error) {
	if len(batch.Pings) == 0 {
		return nil, fmt.Errorf("pings must not be empty")
	}
	if len(batch.Pings) > maxPingsPerBatch {
		return nil, fmt.Errorf("a batch may contain at most %d pings", maxPingsPerBatch)
	}

	state, err := s.loadSessionState(ctx, userID, batch.SessionID)
	if err != nil {
		return nil, err
	}

	offices, err := s.locationSvc.ListOfficeLocations(ctx, organizationID)
	if err != nil {
		// Geofence labelling is advisory; losing it must not drop breadcrumbs.
		offices = nil
	}

	settings, err := s.GetSettings(ctx, organizationID)
	if err != nil {
		return nil, err
	}

	accepted, rejected, duplicates := 0, 0, 0
	var lastStatus *string

	for _, ping := range sortPings(batch.Pings) {
		capturedAt, ok := parsePingTime(ping.CapturedAt)
		if !ok || !validCoordinate(ping.Latitude, ping.Longitude) {
			rejected++
			continue
		}
		// A fix from before clock-in belongs to a different session.
		if capturedAt.Before(state.clockInAt) {
			rejected++
			continue
		}
		if ping.AccuracyMeters != nil && *ping.AccuracyMeters > maxAccuracyMeters {
			rejected++
			continue
		}

		segment := segmentMeters(state, ping, capturedAt)

		match := MatchGeofence(offices, ping.Latitude, ping.Longitude)
		status := GeofenceStatus(match)

		inserted, err := s.insertPing(ctx, state.id, userID, organizationID, ping, capturedAt, segment, status)
		if err != nil {
			return nil, err
		}

		// The point joins the trail either way, so the next segment measures from
		// here. Only a genuinely new row adds to the total — a replayed one was
		// already counted when it first arrived.
		//
		// Copied to locals rather than pointing at the loop variable, so the
		// stored position cannot be rewritten by the next iteration.
		lat, lng, at := ping.Latitude, ping.Longitude, capturedAt
		state.lastLat = &lat
		state.lastLng = &lng
		state.lastAt = &at
		lastStatus = status

		if !inserted {
			duplicates++
			continue
		}

		accepted++
		state.distance += segment
		if ping.StepCount != nil && *ping.StepCount > state.steps {
			// Pedometer counts are cumulative since clock-in, so the highest
			// value seen wins and out-of-order batches cannot walk it backwards.
			state.steps = *ping.StepCount
		}
	}

	if accepted == 0 && duplicates == 0 {
		return nil, fmt.Errorf("no usable pings in batch")
	}

	if err := s.updateSessionRollup(ctx, state, lastStatus); err != nil {
		return nil, err
	}

	return &models.LocationPingResult{
		SessionID:      state.id,
		Accepted:       accepted,
		Rejected:       rejected,
		Duplicates:     duplicates,
		DistanceMeters: state.distance,
		StepCount:      state.steps,
		GeofenceStatus: lastStatus,
		NextPingAfterS: settings.LocationPingIntervalSeconds,
	}, nil
}

// segmentMeters returns how far this fix moved from the previous one, or 0 when
// the movement is indistinguishable from GPS noise.
func segmentMeters(state *sessionTrackState, ping models.LocationPingInput, capturedAt time.Time) float64 {
	if state.lastLat == nil || state.lastLng == nil || state.lastAt == nil {
		return 0
	}

	elapsed := capturedAt.Sub(*state.lastAt).Seconds()
	if elapsed <= 0 {
		return 0
	}

	dist := haversineMeters(*state.lastLat, *state.lastLng, ping.Latitude, ping.Longitude)

	// The floor scales with the reported accuracy: a fix good to 5 m can prove a
	// 12 m walk, but one good to 80 m cannot.
	threshold := minSegmentMeters
	if ping.AccuracyMeters != nil && *ping.AccuracyMeters > threshold {
		threshold = *ping.AccuracyMeters
	}
	if dist < threshold {
		return 0
	}

	if dist/elapsed > maxSpeedMps {
		return 0
	}

	return dist
}

func (s *TrackingService) insertPing(
	ctx context.Context,
	sessionID, userID, organizationID string,
	ping models.LocationPingInput,
	capturedAt time.Time,
	segment float64,
	status *string,
) (bool, error) {
	source := "gps"
	if ping.Source != nil && *ping.Source != "" {
		source = *ping.Source
	}

	var id int64
	err := s.pool.QueryRow(ctx,
		`INSERT INTO location_pings (
		   session_id, user_id, organization_id, captured_at,
		   latitude, longitude, accuracy_meters, altitude_meters,
		   speed_mps, heading_degrees, source, battery_level,
		   is_moving, step_count, segment_meters, geofence_status
		 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
		 ON CONFLICT (session_id, captured_at) DO NOTHING
		 RETURNING id`,
		sessionID, userID, organizationID, capturedAt,
		ping.Latitude, ping.Longitude, ping.AccuracyMeters, ping.AltitudeMeters,
		ping.SpeedMps, ping.HeadingDegrees, source, ping.BatteryLevel,
		ping.IsMoving, ping.StepCount, segment, status,
	).Scan(&id)

	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("insert location ping: %w", err)
	}
	return true, nil
}

func (s *TrackingService) loadSessionState(ctx context.Context, userID string, sessionID *string) (*sessionTrackState, error) {
	state := &sessionTrackState{}

	query := `SELECT id, clock_in_at, last_latitude, last_longitude, last_location_at,
	                 distance_meters, step_count
	          FROM work_sessions
	          WHERE user_id = $1 AND clock_out_at IS NULL`
	args := []interface{}{userID}

	if sessionID != nil && *sessionID != "" {
		query += ` AND id = $2`
		args = append(args, *sessionID)
	}
	query += ` ORDER BY clock_in_at DESC LIMIT 1`

	err := s.pool.QueryRow(ctx, query, args...).Scan(
		&state.id, &state.clockInAt, &state.lastLat, &state.lastLng,
		&state.lastAt, &state.distance, &state.steps,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNoActiveSession
	}
	if err != nil {
		return nil, fmt.Errorf("load session for tracking: %w", err)
	}

	return state, nil
}

func (s *TrackingService) updateSessionRollup(ctx context.Context, state *sessionTrackState, status *string) error {
	_, err := s.pool.Exec(ctx,
		`UPDATE work_sessions
		 SET distance_meters = $1,
		     step_count = $2,
		     last_latitude = $3,
		     last_longitude = $4,
		     last_location_at = $5,
		     geofence_status = COALESCE($6, geofence_status),
		     updated_at = NOW()
		 WHERE id = $7`,
		state.distance, state.steps, state.lastLat, state.lastLng,
		state.lastAt, status, state.id,
	)
	if err != nil {
		return fmt.Errorf("update session travel totals: %w", err)
	}
	return nil
}

func sortPings(pings []models.LocationPingInput) []models.LocationPingInput {
	ordered := make([]models.LocationPingInput, len(pings))
	copy(ordered, pings)
	sort.SliceStable(ordered, func(i, j int) bool {
		a, aOK := parsePingTime(ordered[i].CapturedAt)
		b, bOK := parsePingTime(ordered[j].CapturedAt)
		if !aOK || !bOK {
			return aOK && !bOK
		}
		return a.Before(b)
	})
	return ordered
}

func parsePingTime(raw string) (time.Time, bool) {
	t, err := time.Parse(time.RFC3339, raw)
	if err != nil {
		return time.Time{}, false
	}
	return t.UTC(), true
}

func validCoordinate(lat, lng float64) bool {
	if lat < -90 || lat > 90 || lng < -180 || lng > 180 {
		return false
	}
	// Null Island is what a device reports when it has no fix at all.
	return lat != 0 || lng != 0
}

// ─── Reads ─────────────────────────────────────────────────────────────────

// GetSessionTrack returns the full movement story of one session: the breadcrumb
// trail, the stops detected in it, and the travel totals.
func (s *TrackingService) GetSessionTrack(ctx context.Context, organizationID, sessionID string) (*models.SessionTrack, error) {
	track := &models.SessionTrack{SessionID: sessionID}

	var clockOutAt *time.Time
	var clockInAt time.Time

	err := s.pool.QueryRow(ctx,
		`SELECT ws.user_id, u.full_name, ws.clock_in_at, ws.clock_out_at,
		        ws.location_type, ws.geofence_status, ws.distance_meters, ws.step_count,
		        ws.latitude, ws.longitude,
		        COALESCE(ws.clock_out_latitude, ws.last_latitude),
		        COALESCE(ws.clock_out_longitude, ws.last_longitude)
		 FROM work_sessions ws
		 JOIN users u ON u.id = ws.user_id
		 WHERE ws.id = $1 AND u.organization_id = $2`,
		sessionID, organizationID,
	).Scan(&track.UserID, &track.FullName, &clockInAt, &clockOutAt,
		&track.LocationType, &track.GeofenceStatus, &track.DistanceMeters, &track.StepCount,
		&track.ClockInLat, &track.ClockInLng, &track.ClockOutLat, &track.ClockOutLng)

	if errors.Is(err, pgx.ErrNoRows) {
		return nil, fmt.Errorf("session not found")
	}
	if err != nil {
		return nil, fmt.Errorf("load session track: %w", err)
	}

	track.ClockInAt = clockInAt.Format(time.RFC3339)
	if clockOutAt != nil {
		out := clockOutAt.Format(time.RFC3339)
		track.ClockOutAt = &out
	}

	points, times, err := s.loadTrackPoints(ctx, sessionID)
	if err != nil {
		return nil, err
	}
	track.Points = points

	offices, err := s.locationSvc.ListOfficeLocations(ctx, organizationID)
	if err != nil {
		offices = nil
	}
	if offices == nil {
		offices = []models.OfficeLocation{}
	}
	// The map draws the geofences alongside the route, so it ships with the track.
	track.Offices = offices

	track.Stops = detectStops(points, times, offices)
	for _, stop := range track.Stops {
		track.StoppedSeconds += stop.DurationSeconds
	}

	if len(times) >= 2 {
		total := int64(times[len(times)-1].Sub(times[0]).Seconds())
		track.MovingSeconds = total - track.StoppedSeconds
		if track.MovingSeconds < 0 {
			track.MovingSeconds = 0
		}
	}

	return track, nil
}

func (s *TrackingService) loadTrackPoints(ctx context.Context, sessionID string) ([]models.TrackPoint, []time.Time, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT captured_at, latitude, longitude, accuracy_meters, speed_mps,
		        source, battery_level, segment_meters, geofence_status
		 FROM location_pings
		 WHERE session_id = $1
		 ORDER BY captured_at ASC`,
		sessionID,
	)
	if err != nil {
		return nil, nil, fmt.Errorf("query location pings: %w", err)
	}
	defer rows.Close()

	points := []models.TrackPoint{}
	times := []time.Time{}

	for rows.Next() {
		var point models.TrackPoint
		var capturedAt time.Time
		if err := rows.Scan(&capturedAt, &point.Latitude, &point.Longitude,
			&point.AccuracyMeters, &point.SpeedMps, &point.Source,
			&point.BatteryLevel, &point.SegmentMeters, &point.GeofenceStatus); err != nil {
			return nil, nil, fmt.Errorf("scan location ping: %w", err)
		}
		point.CapturedAt = capturedAt.Format(time.RFC3339)
		points = append(points, point)
		times = append(times, capturedAt)
	}

	return points, times, rows.Err()
}

// detectStops groups consecutive fixes that stay within stopRadiusMeters of
// their running centroid. A group that lasts at least minStopSeconds becomes a
// stop, which is how "when did they stop, and for how long" is answered.
func detectStops(points []models.TrackPoint, times []time.Time, offices []models.OfficeLocation) []models.TrackStop {
	stops := []models.TrackStop{}
	if len(points) != len(times) {
		return stops
	}

	i := 0
	for i < len(points) {
		sumLat, sumLng := points[i].Latitude, points[i].Longitude
		j := i + 1

		for j < len(points) {
			centroidLat := sumLat / float64(j-i)
			centroidLng := sumLng / float64(j-i)
			if haversineMeters(centroidLat, centroidLng, points[j].Latitude, points[j].Longitude) > stopRadiusMeters {
				break
			}
			sumLat += points[j].Latitude
			sumLng += points[j].Longitude
			j++
		}

		count := j - i
		duration := int64(times[j-1].Sub(times[i]).Seconds())

		if count >= 2 && duration >= minStopSeconds {
			stop := models.TrackStop{
				StartedAt:       times[i].Format(time.RFC3339),
				EndedAt:         times[j-1].Format(time.RFC3339),
				DurationSeconds: duration,
				Latitude:        sumLat / float64(count),
				Longitude:       sumLng / float64(count),
				PointCount:      count,
			}
			if match := MatchGeofence(offices, stop.Latitude, stop.Longitude); match.Inside {
				stop.OfficeLabel = match.OfficeLabel
			}
			stops = append(stops, stop)
			i = j
			continue
		}

		i++
	}

	return stops
}

// ListSessions returns shifts in a date range, active and completed alike, so a
// manager can review yesterday's route and not only what is happening now.
func (s *TrackingService) ListSessions(ctx context.Context, organizationID string, start, end time.Time, userID string) ([]models.TrackedSessionRow, error) {
	query := `SELECT ws.id, ws.user_id, u.full_name, u.email,
	                 ws.clock_in_at, ws.clock_out_at,
	                 ws.distance_meters, ws.step_count,
	                 ws.location_type, ws.geofence_status,
	                 ws.latitude, ws.longitude,
	                 COALESCE(ws.clock_out_latitude, ws.last_latitude),
	                 COALESCE(ws.clock_out_longitude, ws.last_longitude),
	                 (SELECT count(*) FROM location_pings lp WHERE lp.session_id = ws.id)
	          FROM work_sessions ws
	          JOIN users u ON u.id = ws.user_id
	          WHERE u.organization_id = $1
	            AND ws.clock_in_at >= $2
	            AND ws.clock_in_at <= $3`
	args := []interface{}{organizationID, start, end}

	if userID != "" {
		query += ` AND ws.user_id = $4`
		args = append(args, userID)
	}
	query += ` ORDER BY ws.clock_in_at DESC LIMIT 200`

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list tracked sessions: %w", err)
	}
	defer rows.Close()

	sessions := []models.TrackedSessionRow{}
	now := time.Now().UTC()

	for rows.Next() {
		var row models.TrackedSessionRow
		var clockInAt time.Time
		var clockOutAt *time.Time
		var pointCount int64

		if err := rows.Scan(&row.SessionID, &row.UserID, &row.FullName, &row.Email,
			&clockInAt, &clockOutAt, &row.DistanceMeters, &row.StepCount,
			&row.LocationType, &row.GeofenceStatus,
			&row.ClockInLat, &row.ClockInLng, &row.ClockOutLat, &row.ClockOutLng,
			&pointCount); err != nil {
			return nil, fmt.Errorf("scan tracked session: %w", err)
		}

		row.ClockInAt = clockInAt.Format(time.RFC3339)
		row.PointCount = int(pointCount)

		if clockOutAt != nil {
			out := clockOutAt.Format(time.RFC3339)
			row.ClockOutAt = &out
			row.DurationSeconds = int64(clockOutAt.Sub(clockInAt).Seconds())
		} else {
			row.IsActive = true
			row.DurationSeconds = int64(now.Sub(clockInAt).Seconds())
		}
		if row.DurationSeconds < 0 {
			row.DurationSeconds = 0
		}

		sessions = append(sessions, row)
	}

	return sessions, rows.Err()
}

// GetLiveLocations returns the last known position of everyone currently clocked
// in, for the manager's live map.
func (s *TrackingService) GetLiveLocations(ctx context.Context, organizationID string) ([]models.LiveEmployeeLocation, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT ws.id, ws.user_id, u.full_name, u.email, ws.clock_in_at,
		        COALESCE(ws.last_latitude, ws.latitude),
		        COALESCE(ws.last_longitude, ws.longitude),
		        ws.last_location_at, ws.distance_meters, ws.step_count,
		        ws.location_type, ws.geofence_status,
		        (SELECT lp.battery_level FROM location_pings lp
		          WHERE lp.session_id = ws.id AND lp.battery_level IS NOT NULL
		          ORDER BY lp.captured_at DESC LIMIT 1)
		 FROM work_sessions ws
		 JOIN users u ON u.id = ws.user_id
		 WHERE ws.clock_out_at IS NULL AND u.organization_id = $1
		 ORDER BY ws.clock_in_at DESC`,
		organizationID,
	)
	if err != nil {
		return nil, fmt.Errorf("query live locations: %w", err)
	}
	defer rows.Close()

	now := time.Now().UTC()
	locations := []models.LiveEmployeeLocation{}

	for rows.Next() {
		var loc models.LiveEmployeeLocation
		var clockInAt time.Time
		var lastLocationAt *time.Time

		if err := rows.Scan(&loc.SessionID, &loc.UserID, &loc.FullName, &loc.Email, &clockInAt,
			&loc.Latitude, &loc.Longitude, &lastLocationAt, &loc.DistanceMeters,
			&loc.StepCount, &loc.LocationType, &loc.GeofenceStatus, &loc.BatteryLevel); err != nil {
			return nil, fmt.Errorf("scan live location: %w", err)
		}

		loc.ClockInAt = clockInAt.Format(time.RFC3339)
		if lastLocationAt != nil {
			at := lastLocationAt.Format(time.RFC3339)
			// A device whose clock runs ahead would otherwise report a negative
			// age, which reads as nonsense in the UI.
			stale := int64(now.Sub(*lastLocationAt).Seconds())
			if stale < 0 {
				stale = 0
			}
			loc.LastLocationAt = &at
			loc.StaleSeconds = &stale
		}

		locations = append(locations, loc)
	}

	return locations, rows.Err()
}

// GetFieldSummary aggregates travel per employee over a date range, which is the
// table managers export at the end of a week.
func (s *TrackingService) GetFieldSummary(ctx context.Context, organizationID string, start, end time.Time) ([]models.FieldSummaryRow, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT u.id, u.full_name, u.email,
		        COUNT(ws.id),
		        COALESCE(SUM(ws.distance_meters), 0),
		        COALESCE(SUM(ws.step_count), 0),
		        COALESCE(SUM(
		          EXTRACT(EPOCH FROM (COALESCE(ws.clock_out_at, NOW()) - ws.clock_in_at))
		        ), 0),
		        COUNT(*) FILTER (WHERE ws.geofence_status = 'outside')
		 FROM work_sessions ws
		 JOIN users u ON u.id = ws.user_id
		 WHERE u.organization_id = $1
		   AND ws.clock_in_at >= $2
		   AND ws.clock_in_at <= $3
		 GROUP BY u.id, u.full_name, u.email
		 ORDER BY SUM(ws.distance_meters) DESC NULLS LAST`,
		organizationID, start, end,
	)
	if err != nil {
		return nil, fmt.Errorf("query field summary: %w", err)
	}
	defer rows.Close()

	summary := []models.FieldSummaryRow{}

	for rows.Next() {
		var row models.FieldSummaryRow
		var trackedSeconds float64
		if err := rows.Scan(&row.UserID, &row.FullName, &row.Email, &row.SessionCount,
			&row.DistanceMeters, &row.StepCount, &trackedSeconds, &row.OutsideGeofence); err != nil {
			return nil, fmt.Errorf("scan field summary: %w", err)
		}
		row.TrackedSeconds = int64(trackedSeconds)
		summary = append(summary, row)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	if err := s.attachStopCounts(ctx, organizationID, start, end, summary); err != nil {
		return nil, err
	}

	return summary, nil
}

// attachStopCounts fills in StopCount by replaying stop detection over the
// breadcrumbs of every session in the range, read in one pass.
func (s *TrackingService) attachStopCounts(ctx context.Context, organizationID string, start, end time.Time, summary []models.FieldSummaryRow) error {
	if len(summary) == 0 {
		return nil
	}

	offices, err := s.locationSvc.ListOfficeLocations(ctx, organizationID)
	if err != nil {
		offices = nil
	}

	rows, err := s.pool.Query(ctx,
		`SELECT ws.user_id, lp.session_id, lp.captured_at, lp.latitude, lp.longitude
		 FROM location_pings lp
		 JOIN work_sessions ws ON ws.id = lp.session_id
		 JOIN users u ON u.id = ws.user_id
		 WHERE u.organization_id = $1
		   AND ws.clock_in_at >= $2
		   AND ws.clock_in_at <= $3
		 ORDER BY lp.session_id, lp.captured_at ASC`,
		organizationID, start, end,
	)
	if err != nil {
		return fmt.Errorf("query breadcrumbs for stop counts: %w", err)
	}
	defer rows.Close()

	type trail struct {
		userID string
		points []models.TrackPoint
		times  []time.Time
	}
	trails := map[string]*trail{}

	for rows.Next() {
		var userID, sessionID string
		var capturedAt time.Time
		var lat, lng float64
		if err := rows.Scan(&userID, &sessionID, &capturedAt, &lat, &lng); err != nil {
			return fmt.Errorf("scan breadcrumb for stop counts: %w", err)
		}
		t, ok := trails[sessionID]
		if !ok {
			t = &trail{userID: userID}
			trails[sessionID] = t
		}
		t.points = append(t.points, models.TrackPoint{Latitude: lat, Longitude: lng})
		t.times = append(t.times, capturedAt)
	}
	if err := rows.Err(); err != nil {
		return err
	}

	stopsByUser := map[string]int{}
	for _, t := range trails {
		stopsByUser[t.userID] += len(detectStops(t.points, t.times, offices))
	}

	for i := range summary {
		summary[i].StopCount = stopsByUser[summary[i].UserID]
	}

	return nil
}
