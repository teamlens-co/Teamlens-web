package core

import "time"

// AlertRule defines a configurable notification rule
type AlertRule struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`                   // "Overtime Alert", "Idle Alert"
	Type        string    `json:"type"`                   // detector type: "continuous_activity", "idle", "low_score", "no_deep_work", "social_media"
	EntityType  string    `json:"entity_type"`            // "global", "employee", "team"
	EntityID    string    `json:"entity_id,omitempty"`    // employee_id or team_id (empty for global)
	OrgID       string    `json:"org_id"`
	Enabled     bool      `json:"enabled"`
	ThresholdMs int64     `json:"threshold_ms"`           // e.g. 7200000 (2 hours)
	ThresholdPct int     `json:"threshold_pct,omitempty"` // e.g. 40 for score below 40%
	Severity     string  `json:"severity"`                // info, warning, critical
	NotifyVia   []string  `json:"notify_via"`             // ["websocket", "push", "email"]
	CreatedBy   string    `json:"created_by"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// RuleDefaults returns sensible default thresholds per rule type
func RuleDefaults() []AlertRule {
	return []AlertRule{
		{
			Name:        "Continuous Work Alert",
			Type:        "continuous_activity",
			EntityType:  "global",
			Enabled:     true,
			ThresholdMs: 7_200_000, // 2 hours
			Severity:    "warning",
			NotifyVia:   []string{"websocket", "push"},
		},
		{
			Name:        "Idle Alert",
			Type:        "idle",
			EntityType:  "global",
			Enabled:     true,
			ThresholdMs: 3_600_000, // 1 hour
			Severity:    "warning",
			NotifyVia:   []string{"websocket", "push"},
		},
		{
			Name:         "Low Score Alert",
			Type:         "low_score",
			EntityType:   "global",
			Enabled:      true,
			ThresholdPct: 40, // score below 40%
			Severity:     "warning",
			NotifyVia:    []string{"websocket", "email"},
		},
		{
			Name:        "No Deep Work Alert",
			Type:        "no_deep_work",
			EntityType:  "global",
			Enabled:     true,
			ThresholdMs: 28_800_000, // 8 hours (end of day)
			Severity:    "info",
			NotifyVia:   []string{"websocket"},
		},
		{
			Name:         "Social Media Alert",
			Type:         "social_media",
			EntityType:   "global",
			Enabled:      true,
			ThresholdMs:  1_800_000, // 30 minutes
			ThresholdPct: 20,        // or 20% of total time
			Severity:     "warning",
			NotifyVia:    []string{"websocket", "push"},
		},
		{
			Name:         "Unproductive Alert",
			Type:         "unproductive",
			EntityType:   "global",
			Enabled:      true,
			ThresholdMs:  1_800_000, // 30 minutes
			Severity:     "warning",
			NotifyVia:    []string{"websocket", "push"},
		},
	}
}
