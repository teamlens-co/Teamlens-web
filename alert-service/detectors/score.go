package detectors

import (
	"fmt"
	"github.com/teamlens-co/teamlens-web-server/alert-service/core"
)

// LowScoreDetector checks if productivity score is below threshold
type LowScoreDetector struct{}

func (d *LowScoreDetector) Type() string { return "low_score" }

func (d *LowScoreDetector) Run(rule core.AlertRule, data *DataReaders) ([]core.DetectorResult, error) {
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
		score, err := data.SQLite.GetLatestScore(empID)
		if err != nil || score < 0 {
			continue
		}

		if score < rule.ThresholdPct {
			empName, _ := data.Postgres.GetEmployeeName(empID)
			results = append(results, core.DetectorResult{
				RuleType:     d.Type(),
				Severity:     core.SeverityWarning,
				Title:        "📉 Low Productivity Score",
				Message:      fmt.Sprintf("%s has a productivity score of %d/100, below the threshold of %d%%. Review their activity and provide guidance.", empName, score, rule.ThresholdPct),
				EmployeeID:   empID,
				EmployeeName: empName,
				Metadata:     fmt.Sprintf(`{"score":%d,"threshold":%d}`, score, rule.ThresholdPct),
			})
		}
	}
	return results, nil
}

// SocialMediaDetector checks if social media/leisure usage exceeds threshold
type SocialMediaDetector struct{}

func (d *SocialMediaDetector) Type() string { return "social_media" }

func (d *SocialMediaDetector) Run(rule core.AlertRule, data *DataReaders) ([]core.DetectorResult, error) {
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

	for _, empID := range employeeIDs {
		socialMin, err := data.SQLite.GetSocialMediaTime(empID)
		if err != nil || socialMin < 0 {
			continue
		}

		if socialMin >= thresholdMin && socialMin > 0 {
			empName, _ := data.Postgres.GetEmployeeName(empID)
			results = append(results, core.DetectorResult{
				RuleType:     d.Type(),
				Severity:     core.SeverityInfo,
				Title:        "📱 Social Media Usage",
				Message:      fmt.Sprintf("%s has spent %d minutes on social media / leisure activities today (threshold: %d min).", empName, socialMin, thresholdMin),
				EmployeeID:   empID,
				EmployeeName: empName,
				Metadata:     fmt.Sprintf(`{"social_media_minutes":%d,"threshold_minutes":%d}`, socialMin, thresholdMin),
			})
		}
	}
	return results, nil
}

// init registers score-related detectors
func init() {
	Register(&LowScoreDetector{})
	Register(&SocialMediaDetector{})
}
