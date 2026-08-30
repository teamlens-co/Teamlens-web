package services

import (
	"math"
	"testing"
	"time"

	"github.com/teamlens/backend-go/internal/models"
)

func ptrF(v float64) *float64 { return &v }

// baseTime is an arbitrary fixed instant; only the deltas matter.
var baseTime = time.Date(2026, 8, 30, 9, 0, 0, 0, time.UTC)

func stateAt(lat, lng float64, at time.Time) *sessionTrackState {
	return &sessionTrackState{
		id:        "session-1",
		clockInAt: baseTime,
		lastLat:   &lat,
		lastLng:   &lng,
		lastAt:    &at,
	}
}

func TestSegmentMetersFirstFixHasNoSegment(t *testing.T) {
	state := &sessionTrackState{id: "session-1", clockInAt: baseTime}
	ping := models.LocationPingInput{Latitude: 19.0760, Longitude: 72.8777}

	if got := segmentMeters(state, ping, baseTime); got != 0 {
		t.Fatalf("first fix should contribute no distance, got %v", got)
	}
}

func TestSegmentMetersRejectsGPSJitter(t *testing.T) {
	// A stationary phone reporting fixes ~6 m apart with 20 m accuracy. Summing
	// these naively is what makes a parked employee "walk" kilometres a day.
	state := stateAt(19.0760, 72.8777, baseTime)
	ping := models.LocationPingInput{
		Latitude:       19.076054,
		Longitude:      72.877700,
		AccuracyMeters: ptrF(20),
	}

	if got := segmentMeters(state, ping, baseTime.Add(60*time.Second)); got != 0 {
		t.Fatalf("jitter within the accuracy budget should not count, got %v", got)
	}
}

func TestSegmentMetersCountsRealMovement(t *testing.T) {
	// ~111 m north, well outside a 5 m accuracy budget, over one minute.
	state := stateAt(19.0760, 72.8777, baseTime)
	ping := models.LocationPingInput{
		Latitude:       19.0770,
		Longitude:      72.8777,
		AccuracyMeters: ptrF(5),
	}

	got := segmentMeters(state, ping, baseTime.Add(60*time.Second))
	if math.Abs(got-111) > 5 {
		t.Fatalf("expected ~111 m, got %v", got)
	}
}

func TestSegmentMetersRejectsImplausibleSpeed(t *testing.T) {
	// A 10 km jump in 10 seconds is a bad fix, not a commute.
	state := stateAt(19.0760, 72.8777, baseTime)
	ping := models.LocationPingInput{
		Latitude:       19.1660,
		Longitude:      72.8777,
		AccuracyMeters: ptrF(5),
	}

	if got := segmentMeters(state, ping, baseTime.Add(10*time.Second)); got != 0 {
		t.Fatalf("teleporting fix should be discarded, got %v", got)
	}
}

func TestSegmentMetersIgnoresNonAdvancingClock(t *testing.T) {
	state := stateAt(19.0760, 72.8777, baseTime)
	ping := models.LocationPingInput{Latitude: 19.0770, Longitude: 72.8777, AccuracyMeters: ptrF(5)}

	if got := segmentMeters(state, ping, baseTime); got != 0 {
		t.Fatalf("zero elapsed time should contribute no distance, got %v", got)
	}
}

func TestValidCoordinateRejectsNullIslandAndOutOfRange(t *testing.T) {
	cases := []struct {
		name     string
		lat, lng float64
		want     bool
	}{
		{"mumbai", 19.0760, 72.8777, true},
		{"null island", 0, 0, false},
		{"lat out of range", 91, 10, false},
		{"lng out of range", 10, 181, false},
	}

	for _, tc := range cases {
		if got := validCoordinate(tc.lat, tc.lng); got != tc.want {
			t.Errorf("%s: validCoordinate(%v, %v) = %v, want %v", tc.name, tc.lat, tc.lng, got, tc.want)
		}
	}
}

func TestSortPingsOrdersByCaptureTime(t *testing.T) {
	pings := []models.LocationPingInput{
		{CapturedAt: baseTime.Add(2 * time.Minute).Format(time.RFC3339)},
		{CapturedAt: baseTime.Format(time.RFC3339)},
		{CapturedAt: baseTime.Add(time.Minute).Format(time.RFC3339)},
	}

	sorted := sortPings(pings)

	for i := 1; i < len(sorted); i++ {
		prev, _ := parsePingTime(sorted[i-1].CapturedAt)
		curr, _ := parsePingTime(sorted[i].CapturedAt)
		if curr.Before(prev) {
			t.Fatalf("pings out of order at index %d", i)
		}
	}
}

// trail builds points/times where each entry is (lat, lng, minutes-since-base).
func trail(entries ...[3]float64) ([]models.TrackPoint, []time.Time) {
	points := make([]models.TrackPoint, 0, len(entries))
	times := make([]time.Time, 0, len(entries))
	for _, e := range entries {
		points = append(points, models.TrackPoint{Latitude: e[0], Longitude: e[1]})
		times = append(times, baseTime.Add(time.Duration(e[2])*time.Minute))
	}
	return points, times
}

func TestDetectStopsFindsLongDwell(t *testing.T) {
	// Sitting at one place for 30 minutes, then driving away.
	points, times := trail(
		[3]float64{19.0760, 72.8777, 0},
		[3]float64{19.0761, 72.8778, 10},
		[3]float64{19.0760, 72.8776, 20},
		[3]float64{19.0762, 72.8777, 30},
		[3]float64{19.1500, 72.9000, 45},
	)

	stops := detectStops(points, times, nil)

	if len(stops) != 1 {
		t.Fatalf("expected 1 stop, got %d", len(stops))
	}
	if stops[0].DurationSeconds != 1800 {
		t.Errorf("expected a 1800 s stop, got %d", stops[0].DurationSeconds)
	}
	if stops[0].PointCount != 4 {
		t.Errorf("expected 4 points in the stop, got %d", stops[0].PointCount)
	}
}

func TestDetectStopsIgnoresBriefPause(t *testing.T) {
	// Two minutes at a traffic light is not a stop.
	points, times := trail(
		[3]float64{19.0760, 72.8777, 0},
		[3]float64{19.0760, 72.8777, 2},
		[3]float64{19.1500, 72.9000, 20},
	)

	if stops := detectStops(points, times, nil); len(stops) != 0 {
		t.Fatalf("expected no stops, got %d", len(stops))
	}
}

func TestDetectStopsFindsTwoSeparateVisits(t *testing.T) {
	points, times := trail(
		// Site A, 20 minutes.
		[3]float64{19.0760, 72.8777, 0},
		[3]float64{19.0761, 72.8778, 20},
		// Travelling.
		[3]float64{19.1100, 72.8900, 35},
		// Site B, 25 minutes.
		[3]float64{19.1500, 72.9000, 50},
		[3]float64{19.1501, 72.9001, 75},
	)

	stops := detectStops(points, times, nil)

	if len(stops) != 2 {
		t.Fatalf("expected 2 stops, got %d", len(stops))
	}
	if stops[0].DurationSeconds != 1200 || stops[1].DurationSeconds != 1500 {
		t.Errorf("unexpected stop durations: %d, %d", stops[0].DurationSeconds, stops[1].DurationSeconds)
	}
}

func TestDetectStopsLabelsOfficeVisits(t *testing.T) {
	offices := []models.OfficeLocation{
		{ID: "office-1", Label: "Andheri HQ", Latitude: 19.0760, Longitude: 72.8777, RadiusMeters: 200},
	}
	points, times := trail(
		[3]float64{19.0760, 72.8777, 0},
		[3]float64{19.0761, 72.8778, 30},
	)

	stops := detectStops(points, times, offices)

	if len(stops) != 1 {
		t.Fatalf("expected 1 stop, got %d", len(stops))
	}
	if stops[0].OfficeLabel == nil || *stops[0].OfficeLabel != "Andheri HQ" {
		t.Errorf("expected the stop to be labelled Andheri HQ, got %v", stops[0].OfficeLabel)
	}
}

func TestDetectStopsHandlesEmptyAndMismatchedInput(t *testing.T) {
	if got := detectStops(nil, nil, nil); len(got) != 0 {
		t.Errorf("empty trail should yield no stops, got %d", len(got))
	}

	points, times := trail([3]float64{19.0760, 72.8777, 0})
	if got := detectStops(points, times[:0], nil); len(got) != 0 {
		t.Errorf("mismatched lengths should yield no stops, got %d", len(got))
	}
}

func TestMatchGeofenceInsideRadius(t *testing.T) {
	offices := []models.OfficeLocation{
		{ID: "office-1", Label: "Andheri HQ", Latitude: 19.0760, Longitude: 72.8777, RadiusMeters: 200},
	}

	// ~111 m north of the centre, inside a 200 m radius.
	match := MatchGeofence(offices, 19.0770, 72.8777)

	if !match.Inside {
		t.Fatalf("expected the coordinate to be inside the geofence")
	}
	if !match.HasOfficeSetup {
		t.Error("expected HasOfficeSetup to be true")
	}
	if match.OfficeID == nil || *match.OfficeID != "office-1" {
		t.Errorf("expected office-1, got %v", match.OfficeID)
	}
}

func TestMatchGeofenceOutsideReportsNearestOffice(t *testing.T) {
	offices := []models.OfficeLocation{
		{ID: "far", Label: "Pune", Latitude: 18.5204, Longitude: 73.8567, RadiusMeters: 200},
		{ID: "near", Label: "Andheri HQ", Latitude: 19.0760, Longitude: 72.8777, RadiusMeters: 100},
	}

	// ~333 m north of Andheri HQ: outside its 100 m radius, but still nearest.
	match := MatchGeofence(offices, 19.0790, 72.8777)

	if match.Inside {
		t.Fatalf("expected the coordinate to be outside every geofence")
	}
	if match.OfficeID == nil || *match.OfficeID != "near" {
		t.Fatalf("expected the nearest office, got %v", match.OfficeID)
	}
	if math.Abs(match.DistanceMeters-333) > 15 {
		t.Errorf("expected ~333 m to the nearest office, got %v", match.DistanceMeters)
	}
}

func TestMatchGeofencePrefersContainingOfficeOverNearerOne(t *testing.T) {
	offices := []models.OfficeLocation{
		// Nearer centre, but a radius too small to contain the point.
		{ID: "tiny", Label: "Kiosk", Latitude: 19.0770, Longitude: 72.8777, RadiusMeters: 5},
		// Further centre, but generous enough to contain it.
		{ID: "campus", Label: "Campus", Latitude: 19.0760, Longitude: 72.8777, RadiusMeters: 2000},
	}

	match := MatchGeofence(offices, 19.07705, 72.8777)

	if !match.Inside {
		t.Fatalf("expected the coordinate to be inside Campus")
	}
	if match.OfficeID == nil || *match.OfficeID != "campus" {
		t.Errorf("expected campus to win over the nearer kiosk, got %v", match.OfficeID)
	}
}

func TestMatchGeofenceWithNoOfficesIsNotAViolation(t *testing.T) {
	match := MatchGeofence(nil, 19.0760, 72.8777)

	if match.HasOfficeSetup {
		t.Error("expected HasOfficeSetup to be false with no offices configured")
	}
	if GeofenceStatus(match) != nil {
		t.Error("expected no geofence status when the org has no offices")
	}
}

func TestGeofenceStatusStrings(t *testing.T) {
	inside := GeofenceStatus(models.GeofenceMatch{HasOfficeSetup: true, Inside: true})
	if inside == nil || *inside != "inside" {
		t.Errorf(`expected "inside", got %v`, inside)
	}

	outside := GeofenceStatus(models.GeofenceMatch{HasOfficeSetup: true, Inside: false})
	if outside == nil || *outside != "outside" {
		t.Errorf(`expected "outside", got %v`, outside)
	}
}

func TestNormalizeGeofencePolicyDefaultsToOff(t *testing.T) {
	cases := map[string]models.GeofencePolicy{
		"off":      models.GeofenceOff,
		"warn":     models.GeofenceWarn,
		"block":    models.GeofenceBlock,
		"":         models.GeofenceOff,
		"nonsense": models.GeofenceOff,
		"BLOCK":    models.GeofenceOff,
	}

	for raw, want := range cases {
		if got := normalizeGeofencePolicy(raw); got != want {
			t.Errorf("normalizeGeofencePolicy(%q) = %v, want %v", raw, got, want)
		}
	}
}
