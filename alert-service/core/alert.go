package core

import "time"

// Severity levels
const (
	SeverityInfo     = "info"
	SeverityWarning  = "warning"
	SeverityCritical = "critical"
)

// AlertEvent represents a triggered alert
type AlertEvent struct {
	ID           string    `json:"id"`
	RuleID       string    `json:"rule_id"`
	RuleName     string    `json:"rule_name"`
	RuleType     string    `json:"rule_type"`
	Severity     string    `json:"severity"`
	Title        string    `json:"title"`
	Message      string    `json:"message"`
	EmployeeID   string    `json:"employee_id"`
	EmployeeName string    `json:"employee_name"`
	Metadata     string    `json:"metadata"` // JSON string with context
	TriggeredAt  time.Time `json:"triggered_at"`
	Acknowledged  bool      `json:"acknowledged"`
	AcknowledgedBy string  `json:"acknowledged_by,omitempty"`
}

// DetectorResult is what a detector returns
type DetectorResult struct {
	RuleType     string
	Severity     string
	Title        string
	Message      string
	EmployeeID   string
	EmployeeName string
	Metadata     string
}
