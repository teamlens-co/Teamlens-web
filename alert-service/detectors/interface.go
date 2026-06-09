package detectors

import "github.com/teamlens-co/teamlens-web-server/alert-service/core"

// DataReaders provides access to all data sources
type DataReaders struct {
	SQLite    SQLiteReader
	Postgres  PostgresReader
}

// SQLiteReader interface for screenshot-ai data
type SQLiteReader interface {
	// GetContinuousActivity checks if an employee has been active without significant breaks
	GetContinuousActivity(userID string) (activeMinutes int, lastActiveTime string, err error)

	// GetIdleTime checks how long an employee has been idle
	GetIdleTime(userID string) (idleMinutes int, lastSeenTime string, err error)

	// GetLatestScore returns the latest productivity score
	GetLatestScore(userID string) (score int, err error)

	// GetSocialMediaTime returns minutes spent on leisure/social media today
	GetSocialMediaTime(userID string) (minutes int, err error)

	// HasDeepWorkToday checks if any deep work session was logged today
	HasDeepWorkToday(userID string) (bool, error)

	// GetAllEmployeeIDs returns all employees with data today
	GetAllEmployeeIDs() ([]string, error)

	// GetUnproductiveTime returns minutes spent on non-work apps/websites today
	GetUnproductiveTime(userID string) (minutes int, err error)
}

// PostgresReader interface for rule and user data
type PostgresReader interface {
	// GetEnabledRules returns all enabled rules (optionally filtered by scope)
	GetEnabledRules(entityType string, entityID string) ([]core.AlertRule, error)

	// GetEmployeeName returns employee's full name
	GetEmployeeName(userID string) (string, error)

	// GetAllEmployees returns all employee IDs for an org
	GetAllEmployees(orgID string) ([]string, error)

	// GetAlertHistory returns recent alerts
	GetAlertHistory(limit int) ([]core.AlertEvent, error)

	// SaveAlert persists an alert event
	SaveAlert(event *core.AlertEvent) error

	// AckAlert marks an alert as acknowledged
	AckAlert(alertID string, ackBy string) error
}

// Detector is the interface all detectors must implement
type Detector interface {
	// Type returns the unique rule type string (e.g. "continuous_activity")
	Type() string

	// Run checks conditions and returns alert results
	Run(rule core.AlertRule, data *DataReaders) ([]core.DetectorResult, error)
}
