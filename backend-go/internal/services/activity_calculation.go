package services

import (
	"context"
	"math"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ActivitySample represents a single activity data point
type ActivitySample struct {
	Timestamp  int64
	MouseMoves int32
	KeyPresses int32
}

// ActivitySegment represents a contiguous active or idle period
type ActivitySegment struct {
	Start      string `json:"start"`
	End        string `json:"end"`
	Kind       string `json:"kind"`
	MouseMoves int    `json:"mouseMoves"`
	KeyPresses int    `json:"keyPresses"`
}

// ActivityCalculationResult holds the computed activity stats
type ActivityCalculationResult struct {
	WorkSeconds   int64             `json:"workSeconds"`
	ActiveSeconds int64             `json:"activeSeconds"`
	IdleSeconds   int64             `json:"idleSeconds"`
	MouseMoves    int64             `json:"mouseMoves"`
	KeyPresses    int64             `json:"keyPresses"`
	Segments      []ActivitySegment `json:"segments"`
}

type ActivityCalculationInput struct {
	SessionStart             int64
	SessionEnd               int64
	Samples                  []ActivitySample
	IdleThresholdSeconds     int
	SampleWindowSeconds      int
	MinMouseMovesPerWindow   int
	MinKeyPressesPerWindow   int
}

const defaultIdleThresholdSeconds = 30
const defaultSampleWindowSeconds = 10

// CalculateActivitySegments computes active/idle time from activity samples.
//
// Each active sample represents activity over the previous SampleWindow.
// Active samples are grouped into clusters: a gap of <= IdleThreshold between
// the end of one activity window and the start of the next keeps the user
// marked active across the gap. This matches how most productivity trackers
// (e.g. Insightful) report active time instead of adding a long idle tail to
// every single interaction.
func CalculateActivitySegments(input ActivityCalculationInput) ActivityCalculationResult {
	if input.SessionEnd <= input.SessionStart {
		return ActivityCalculationResult{}
	}

	idleThresholdMs := defaultIdleThresholdSeconds * 1000
	if input.IdleThresholdSeconds > 0 {
		idleThresholdMs = input.IdleThresholdSeconds * 1000
	}
	sampleWindowMs := defaultSampleWindowSeconds * 1000
	if input.SampleWindowSeconds > 0 {
		sampleWindowMs = input.SampleWindowSeconds * 1000
	}

	minMM := int32(math.Max(0, float64(input.MinMouseMovesPerWindow)))
	minKP := int32(math.Max(0, float64(input.MinKeyPressesPerWindow)))

	// Filter and sort interactions
	type interaction struct {
		timestampMs int64
		startMs     int64
		endMs       int64
		mouseMoves  int32
		keyPresses  int32
	}

	var interactions []interaction
	for _, s := range input.Samples {
		mouseMoves := int32(math.Max(0, float64(s.MouseMoves)))
		keyPresses := int32(math.Max(0, float64(s.KeyPresses)))
		if !(mouseMoves > 0 || keyPresses > 0) {
			continue
		}
		mouseOk := mouseMoves > 0 && mouseMoves >= minMM
		keyOk := keyPresses > 0 && keyPresses >= minKP
		if !mouseOk && !keyOk {
			continue
		}
		ts := clamp(s.Timestamp, input.SessionStart, input.SessionEnd)
		interactions = append(interactions, interaction{
			timestampMs: ts,
			startMs:     clamp(ts-int64(sampleWindowMs), input.SessionStart, input.SessionEnd),
			endMs:       ts,
			mouseMoves:  mouseMoves,
			keyPresses:  keyPresses,
		})
	}

	sort.Slice(interactions, func(i, j int) bool {
		return interactions[i].timestampMs < interactions[j].timestampMs
	})

	var segments []ActivitySegment
	cursorMs := input.SessionStart
	var activeStartMs, activeEndMs *int64
	var activeMouseMoves, activeKeyPresses int
	var totalMouseMoves, totalKeyPresses int64

	closeActiveWindow := func() {
		if activeStartMs == nil || activeEndMs == nil {
			return
		}
		end := clamp(*activeEndMs, input.SessionStart, input.SessionEnd)
		addSegment(&segments, *activeStartMs, end, "active", activeMouseMoves, activeKeyPresses)
		cursorMs = max64(cursorMs, end)
		activeStartMs = nil
		activeEndMs = nil
		activeMouseMoves = 0
		activeKeyPresses = 0
	}

	for _, inter := range interactions {
		totalMouseMoves += int64(inter.mouseMoves)
		totalKeyPresses += int64(inter.keyPresses)

		if activeEndMs == nil || inter.startMs > *activeEndMs+int64(idleThresholdMs) {
			closeActiveWindow()
			addSegment(&segments, cursorMs, inter.startMs, "idle", 0, 0)
			cursorMs = inter.startMs
			start := inter.startMs
			end := inter.endMs
			activeStartMs = &start
			activeEndMs = &end
			activeMouseMoves = int(inter.mouseMoves)
			activeKeyPresses = int(inter.keyPresses)
			continue
		}

		if inter.endMs > *activeEndMs {
			activeEndMs = &inter.endMs
		}
		activeMouseMoves += int(inter.mouseMoves)
		activeKeyPresses += int(inter.keyPresses)
	}

	closeActiveWindow()
	addSegment(&segments, cursorMs, input.SessionEnd, "idle", 0, 0)

	var activeSeconds, idleSeconds int64
	for _, seg := range segments {
		startTime, _ := time.Parse(time.RFC3339, seg.Start)
		endTime, _ := time.Parse(time.RFC3339, seg.End)
		secs := int64(endTime.Sub(startTime).Seconds())
		if seg.Kind == "active" {
			activeSeconds += secs
		} else {
			idleSeconds += secs
		}
	}

	workSeconds := int64((input.SessionEnd - input.SessionStart) / 1000)
	if activeSeconds > workSeconds {
		activeSeconds = workSeconds
	}
	if idleSeconds > workSeconds {
		idleSeconds = workSeconds
	}

	return ActivityCalculationResult{
		WorkSeconds:   workSeconds,
		ActiveSeconds: activeSeconds,
		IdleSeconds:   idleSeconds,
		MouseMoves:    totalMouseMoves,
		KeyPresses:    totalKeyPresses,
		Segments:      segments,
	}
}

func addSegment(segments *[]ActivitySegment, startMs, endMs int64, kind string, mouseMoves, keyPresses int) {
	if endMs <= startMs {
		return
	}
	startStr := time.UnixMilli(startMs).UTC().Format(time.RFC3339)
	endStr := time.UnixMilli(endMs).UTC().Format(time.RFC3339)

	if len(*segments) > 0 {
		prev := &(*segments)[len(*segments)-1]
		if prev.Kind == kind && prev.End == startStr {
			prev.End = endStr
			prev.MouseMoves += mouseMoves
			prev.KeyPresses += keyPresses
			return
		}
	}

	*segments = append(*segments, ActivitySegment{
		Start:      startStr,
		End:        endStr,
		Kind:       kind,
		MouseMoves: mouseMoves,
		KeyPresses: keyPresses,
	})
}

func clamp(value, min, max int64) int64 {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}

func max64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}

func min64(a, b int64) int64 {
	if a < b {
		return a
	}
	return b
}

// ActivityThresholds holds the organization-level minimum-input settings for
// marking a sample window as "active".
type ActivityThresholds struct {
	MinMouseMovesPerWindow int
	MinKeyPressesPerWindow int
}

// GetOrganizationActivityThresholds reads the active-window thresholds for an
// organization. Defaults to (0, 0) when the row can't be read, preserving the
// legacy behavior where any input makes a sample active.
func GetOrganizationActivityThresholds(ctx context.Context, pool *pgxpool.Pool, organizationID string) (ActivityThresholds, error) {
	var t ActivityThresholds
	if organizationID == "" || organizationID == "combined" {
		return t, nil
	}
	err := pool.QueryRow(ctx,
		`SELECT COALESCE(min_mouse_moves_per_active_window, 0),
		        COALESCE(min_key_presses_per_active_window, 0)
		 FROM organizations
		 WHERE id = $1`,
		organizationID,
	).Scan(&t.MinMouseMovesPerWindow, &t.MinKeyPressesPerWindow)
	if err != nil {
		return t, err
	}
	if t.MinMouseMovesPerWindow < 0 {
		t.MinMouseMovesPerWindow = 0
	}
	if t.MinKeyPressesPerWindow < 0 {
		t.MinKeyPressesPerWindow = 0
	}
	return t, nil
}
