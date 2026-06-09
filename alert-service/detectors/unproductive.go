package detectors

import (
	"fmt"
	"github.com/teamlens-co/teamlens-web-server/alert-service/core"
)

// UnproductiveDetector checks if employee spent excessive time on non-work apps/websites
type UnproductiveDetector struct{}

func (d *UnproductiveDetector) Type() string { return "unproductive" }

func (d *UnproductiveDetector) Run(rule core.AlertRule, data *DataReaders) ([]core.DetectorResult, error) {
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

	thresholdMin := int(rule.ThresholdMs / 60000)
	if thresholdMin <= 0 {
		thresholdMin = 30 // default 30 min
	}

	for _, empID := range employeeIDs {
		unprodMin, err := data.SQLite.GetUnproductiveTime(empID)
		if err != nil || unprodMin < 0 {
			continue
		}

		if unprodMin >= thresholdMin && unprodMin > 0 {
			empName, _ := data.Postgres.GetEmployeeName(empID)
			results = append(results, core.DetectorResult{
				RuleType:     d.Type(),
				Severity:     core.SeverityWarning,
				Title:        "⚠️ Unproductive Activity",
				Message:      fmt.Sprintf("%s has spent %d minutes on unproductive apps/websites today (threshold: %d min). This may impact overall productivity.", empName, unprodMin, thresholdMin),
				EmployeeID:   empID,
				EmployeeName: empName,
				Metadata:     fmt.Sprintf(`{"unproductive_minutes":%d,"threshold_minutes":%d}`, unprodMin, thresholdMin),
			})
		}
	}
	return results, nil
}

func init() {
	Register(&UnproductiveDetector{})
}
