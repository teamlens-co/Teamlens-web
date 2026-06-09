package detectors

import (
	"fmt"

	"github.com/teamlens-co/teamlens-web-server/alert-service/core"
)

// OvertimeDetector checks if an employee has been active without significant breaks
type OvertimeDetector struct{}

func (d *OvertimeDetector) Type() string { return "continuous_activity" }

func (d *OvertimeDetector) Run(rule core.AlertRule, data *DataReaders) ([]core.DetectorResult, error) {
	var results []core.DetectorResult
	var employeeIDs []string

	if rule.EntityType == "global" {
		var err error
		employeeIDs, err = data.SQLite.GetAllEmployeeIDs()
		if err != nil {
			return nil, fmt.Errorf("get employees: %w", err)
		}
	} else if rule.EntityType == "employee" && rule.EntityID != "" {
		employeeIDs = []string{rule.EntityID}
	} else {
		return nil, nil // team scope — skip for now
	}

	for _, empID := range employeeIDs {
		activeMin, lastActive, err := data.SQLite.GetContinuousActivity(empID)
		if err != nil {
			continue
		}

		thresholdMin := int(rule.ThresholdMs / 60000)
		if activeMin >= thresholdMin && activeMin > 0 {
			empName, _ := data.Postgres.GetEmployeeName(empID)

			results = append(results, core.DetectorResult{
				RuleType:     d.Type(),
				Severity:     core.SeverityWarning,
				Title:        "🚨 Continuous Work Detected",
				Message:      fmt.Sprintf("%s has been continuously active for %d minutes without a break (threshold: %d min). Possible mouse jiggler or overwork.", empName, activeMin, thresholdMin),
				EmployeeID:   empID,
				EmployeeName: empName,
				Metadata:     fmt.Sprintf(`{"active_minutes":%d,"threshold_minutes":%d,"last_active":"%s"}`, activeMin, thresholdMin, lastActive),
			})
		}
	}
	return results, nil
}

// IdleDetector checks if an employee has been idle for too long
type IdleDetector struct{}

func (d *IdleDetector) Type() string { return "idle" }

func (d *IdleDetector) Run(rule core.AlertRule, data *DataReaders) ([]core.DetectorResult, error) {
	var results []core.DetectorResult
	var employeeIDs []string

	if rule.EntityType == "global" {
		var err error
		employeeIDs, err = data.SQLite.GetAllEmployeeIDs()
		if err != nil {
			return nil, fmt.Errorf("get employees: %w", err)
		}
	} else if rule.EntityType == "employee" && rule.EntityID != "" {
		employeeIDs = []string{rule.EntityID}
	} else {
		return nil, nil
	}

	for _, empID := range employeeIDs {
		idleMin, lastSeen, err := data.SQLite.GetIdleTime(empID)
		if err != nil {
			continue
		}

		thresholdMin := int(rule.ThresholdMs / 60000)
		if idleMin >= thresholdMin && idleMin > 0 {
			empName, _ := data.Postgres.GetEmployeeName(empID)

			results = append(results, core.DetectorResult{
				RuleType:     d.Type(),
				Severity:     core.SeverityWarning,
				Title:        "⚠️ Extended Idle Period",
				Message:      fmt.Sprintf("%s has been idle for %d minutes (threshold: %d min). Last activity was at %s.", empName, idleMin, thresholdMin, lastSeen),
				EmployeeID:   empID,
				EmployeeName: empName,
				Metadata:     fmt.Sprintf(`{"idle_minutes":%d,"threshold_minutes":%d,"last_seen":"%s"}`, idleMin, thresholdMin, lastSeen),
			})
		}
	}
	return results, nil
}

// init registers both detectors
func init() {
	Register(&OvertimeDetector{})
	Register(&IdleDetector{})
}

var registry []Detector

func Register(d Detector) {
	registry = append(registry, d)
}

func GetRegisteredDetectors() []Detector {
	return registry
}
