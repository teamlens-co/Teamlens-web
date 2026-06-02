package services

import (
	"math"
	"sort"
	"time"
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
	SessionStart         int64
	SessionEnd           int64
	Samples              []ActivitySample
	IdleThresholdSeconds int
	SampleWindowSeconds  int
}

const defaultIdleThresholdSeconds = 15
const defaultSampleWindowSeconds = 10

// CalculateActivitySegments computes active/idle time from activity samples
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

	// Filter and sort interactions
	type interaction struct {
		timestampMs int64
		startMs     int64
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
		ts := clamp(s.Timestamp, input.SessionStart, input.SessionEnd)
		interactions = append(interactions, interaction{
			timestampMs: ts,
			startMs:     clamp(ts-int64(sampleWindowMs), input.SessionStart, input.SessionEnd),
			mouseMoves:  mouseMoves,
			keyPresses:  keyPresses,
		})
	}

	sort.Slice(interactions, func(i, j int) bool {
		return interactions[i].timestampMs < interactions[j].timestampMs
	})

	var segments []ActivitySegment
	cursorMs := input.SessionStart
	var activeStartMs, activeUntilMs *int64
	var activeMouseMoves, activeKeyPresses int
	var totalMouseMoves, totalKeyPresses int64

	closeActiveWindow := func() {
		if activeStartMs == nil || activeUntilMs == nil {
			return
		}
		activeEndMs := clamp(*activeUntilMs, input.SessionStart, input.SessionEnd)
		addSegment(&segments, *activeStartMs, activeEndMs, "active", activeMouseMoves, activeKeyPresses)
		cursorMs = max64(cursorMs, activeEndMs)
		activeStartMs = nil
		activeUntilMs = nil
		activeMouseMoves = 0
		activeKeyPresses = 0
	}

	for _, inter := range interactions {
		totalMouseMoves += int64(inter.mouseMoves)
		totalKeyPresses += int64(inter.keyPresses)

		if activeUntilMs == nil || inter.startMs > *activeUntilMs {
			closeActiveWindow()
			addSegment(&segments, cursorMs, inter.startMs, "idle", 0, 0)
			cursorMs = inter.startMs
			start := inter.startMs
			until := inter.timestampMs + int64(idleThresholdMs)
			activeStartMs = &start
			activeUntilMs = &until
			activeMouseMoves = int(inter.mouseMoves)
			activeKeyPresses = int(inter.keyPresses)
			continue
		}

		extendedUntil := inter.timestampMs + int64(idleThresholdMs)
		if extendedUntil > *activeUntilMs {
			activeUntilMs = &extendedUntil
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
