package db

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"

	_ "github.com/lib/pq"
	"github.com/google/uuid"
	"github.com/teamlens-co/teamlens-web-server/alert-service/core"
)

// PostgresDB manages alert rules and user data
type PostgresDB struct {
	db       *sql.DB
	cache    map[string]pgCache
	cacheTTL time.Duration
	mu       sync.RWMutex
}

type pgCache struct {
	value     interface{}
	expiresAt time.Time
}

// NewPostgresDB connects to PostgreSQL
func NewPostgresDB(connStr string) (*PostgresDB, error) {
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, fmt.Errorf("open postgres: %w", err)
	}

	db.SetMaxOpenConns(10)
	db.SetMaxIdleConns(3)
	db.SetConnMaxLifetime(5 * time.Minute)

	p := &PostgresDB{
		db:       db,
		cache:    make(map[string]pgCache),
		cacheTTL: 30 * time.Second,
	}

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("postgres ping: %w", err)
	}

	if err := p.ensureTables(); err != nil {
		return nil, fmt.Errorf("ensure tables: %w", err)
	}

	log.Println("[Postgres] Connected and tables ensured")
	return p, nil
}

func (p *PostgresDB) getCache(key string) (interface{}, bool) {
	p.mu.RLock()
	defer p.mu.RUnlock()
	c, ok := p.cache[key]
	if !ok || time.Now().After(c.expiresAt) {
		return nil, false
	}
	return c.value, true
}

func (p *PostgresDB) setCache(key string, value interface{}) {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.cache[key] = pgCache{
		value:     value,
		expiresAt: time.Now().Add(p.cacheTTL),
	}
}

func (p *PostgresDB) ensureTables() error {
	queries := []string{
		`CREATE TABLE IF NOT EXISTS alert_rules (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			type TEXT NOT NULL,
			entity_type TEXT NOT NULL DEFAULT 'global',
			entity_id TEXT DEFAULT '',
			org_id TEXT NOT NULL DEFAULT '',
			enabled BOOLEAN NOT NULL DEFAULT true,
			threshold_ms BIGINT NOT NULL DEFAULT 0,
			threshold_pct INTEGER NOT NULL DEFAULT 0,
			severity TEXT NOT NULL DEFAULT 'warning',
			notify_via TEXT NOT NULL DEFAULT '["websocket"]',
			created_by TEXT DEFAULT '',
			created_at TIMESTAMP NOT NULL DEFAULT NOW(),
			updated_at TIMESTAMP NOT NULL DEFAULT NOW()
		)`,
		`CREATE TABLE IF NOT EXISTS alert_events (
			id TEXT PRIMARY KEY,
			rule_id TEXT NOT NULL,
			rule_name TEXT NOT NULL,
			rule_type TEXT NOT NULL,
			severity TEXT NOT NULL DEFAULT 'warning',
			title TEXT NOT NULL,
			message TEXT NOT NULL,
			employee_id TEXT DEFAULT '',
			employee_name TEXT DEFAULT '',
			metadata TEXT DEFAULT '{}',
			triggered_at TIMESTAMP NOT NULL DEFAULT NOW(),
			acknowledged BOOLEAN NOT NULL DEFAULT false,
			acknowledged_by TEXT DEFAULT '',
			acknowledged_at TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_alert_events_triggered ON alert_events(triggered_at DESC)`,
		`CREATE INDEX IF NOT EXISTS idx_alert_events_employee ON alert_events(employee_id)`,
		`CREATE INDEX IF NOT EXISTS idx_alert_rules_type ON alert_rules(type)`,
		`CREATE INDEX IF NOT EXISTS idx_alert_rules_entity ON alert_rules(entity_type, entity_id)`,
	}

	for _, q := range queries {
		if _, err := p.db.Exec(q); err != nil {
			return fmt.Errorf("exec migration: %w (query: %.100s)", err, q)
		}
	}

	return nil
}

// GetEnabledRules returns all enabled rules
func (p *PostgresDB) GetEnabledRules(entityType, entityID string) ([]core.AlertRule, error) {
	var rows *sql.Rows
	var err error

	if entityType != "" && entityID != "" {
		rows, err = p.db.Query(`
			SELECT id, name, type, entity_type, COALESCE(entity_id,''), COALESCE(org_id,''),
			       enabled, threshold_ms, threshold_pct, severity, notify_via,
			       created_by, created_at, updated_at
			FROM alert_rules
			WHERE enabled = true AND (entity_type = 'global' OR (entity_type = $1 AND entity_id = $2))
			ORDER BY type
		`, entityType, entityID)
	} else {
		rows, err = p.db.Query(`
			SELECT id, name, type, entity_type, COALESCE(entity_id,''), COALESCE(org_id,''),
			       enabled, threshold_ms, threshold_pct, severity, notify_via,
			       created_by, created_at, updated_at
			FROM alert_rules
			WHERE enabled = true
			ORDER BY type
		`)
	}
	if err != nil {
		return nil, fmt.Errorf("query rules: %w", err)
	}
	defer rows.Close()

	var rules []core.AlertRule
	for rows.Next() {
		var r core.AlertRule
		var notifyViaStr string
		if err := rows.Scan(&r.ID, &r.Name, &r.Type, &r.EntityType, &r.EntityID, &r.OrgID,
			&r.Enabled, &r.ThresholdMs, &r.ThresholdPct, &r.Severity, &notifyViaStr,
			&r.CreatedBy, &r.CreatedAt, &r.UpdatedAt); err != nil {
			continue
		}
		json.Unmarshal([]byte(notifyViaStr), &r.NotifyVia)
		rules = append(rules, r)
	}
	return rules, nil
}

// GetEmployeeName returns employee's full name
func (p *PostgresDB) GetEmployeeName(userID string) (string, error) {
	cacheKey := "empname:" + userID
	if cached, ok := p.getCache(cacheKey); ok {
		if name, ok := cached.(string); ok {
			return name, nil
		}
	}

	var name string
	err := p.db.QueryRow(`SELECT full_name FROM users WHERE id = $1`, userID).Scan(&name)
	if err != nil {
		return userID, err
	}
	p.setCache(cacheKey, name)
	return name, nil
}

// GetAllEmployees returns all employee IDs
func (p *PostgresDB) GetAllEmployees(orgID string) ([]string, error) {
	rows, err := p.db.Query(`SELECT id FROM users WHERE organization_id = $1 AND role = 'EMPLOYEE'`, orgID)
	if err != nil {
		return nil, fmt.Errorf("query employees: %w", err)
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			continue
		}
		ids = append(ids, id)
	}
	return ids, nil
}

// GetAlertHistory returns recent alerts
func (p *PostgresDB) GetAlertHistory(limit int) ([]core.AlertEvent, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := p.db.Query(`
		SELECT id, rule_id, rule_name, rule_type, severity, title, message,
		       COALESCE(employee_id,''), COALESCE(employee_name,''), COALESCE(metadata,'{}'),
		       triggered_at, acknowledged, COALESCE(acknowledged_by,''), acknowledged_at
		FROM alert_events
		ORDER BY triggered_at DESC LIMIT $1
	`, limit)
	if err != nil {
		return nil, fmt.Errorf("query alerts: %w", err)
	}
	defer rows.Close()

	var events []core.AlertEvent
	for rows.Next() {
		var e core.AlertEvent
		var triggeredAt time.Time
		var ackdAt sql.NullTime
		if err := rows.Scan(&e.ID, &e.RuleID, &e.RuleName, &e.RuleType, &e.Severity,
			&e.Title, &e.Message, &e.EmployeeID, &e.EmployeeName, &e.Metadata,
			&triggeredAt, &e.Acknowledged, &e.AcknowledgedBy, &ackdAt); err != nil {
			continue
		}
		e.TriggeredAt = triggeredAt
		events = append(events, e)
	}
	return events, nil
}

// SaveAlert persists an alert event
func (p *PostgresDB) SaveAlert(event *core.AlertEvent) error {
	_, err := p.db.Exec(`
		INSERT INTO alert_events (id, rule_id, rule_name, rule_type, severity, title, message,
		                          employee_id, employee_name, metadata, triggered_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`, event.ID, event.RuleID, event.RuleName, event.RuleType, event.Severity,
		event.Title, event.Message, event.EmployeeID, event.EmployeeName,
		event.Metadata, event.TriggeredAt)
	if err != nil {
		return fmt.Errorf("save alert: %w", err)
	}
	return nil
}

// HasRecentUnacknowledged checks if a similar unacknowledged alert exists
// for the same employee + rule type within the given window
func (p *PostgresDB) HasRecentUnacknowledged(ruleID, employeeID, ruleType string, window time.Duration) (bool, error) {
	var count int
	err := p.db.QueryRow(`
		SELECT COUNT(*)
		FROM alert_events
		WHERE rule_id = $1
		  AND employee_id = $2
		  AND rule_type = $3
		  AND acknowledged = false
		  AND triggered_at > NOW() - $4::interval
	`, ruleID, employeeID, ruleType, fmt.Sprintf("%d seconds", int(window.Seconds()))).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("check unacknowledged alert: %w", err)
	}
	return count > 0, nil
}

// AckAlert marks an alert as acknowledged
func (p *PostgresDB) AckAlert(alertID, ackBy string) error {
	_, err := p.db.Exec(`
		UPDATE alert_events
		SET acknowledged = true, acknowledged_by = $1, acknowledged_at = NOW()
		WHERE id = $2
	`, ackBy, alertID)
	return err
}

// UpsertRule creates or updates an alert rule
func (p *PostgresDB) UpsertRule(rule *core.AlertRule) error {
	notifyVia, _ := json.Marshal(rule.NotifyVia)
	if rule.ID == "" {
		rule.ID = uuid.New().String()
	}
	rule.UpdatedAt = time.Now()

	_, err := p.db.Exec(`
		INSERT INTO alert_rules (id, name, type, entity_type, entity_id, org_id,
		                         enabled, threshold_ms, threshold_pct, severity, notify_via,
		                         created_by, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
		ON CONFLICT (id) DO UPDATE SET
			name = EXCLUDED.name,
			type = EXCLUDED.type,
			entity_type = EXCLUDED.entity_type,
			entity_id = EXCLUDED.entity_id,
			org_id = EXCLUDED.org_id,
			enabled = EXCLUDED.enabled,
			threshold_ms = EXCLUDED.threshold_ms,
			threshold_pct = EXCLUDED.threshold_pct,
			severity = EXCLUDED.severity,
			notify_via = EXCLUDED.notify_via,
			updated_at = EXCLUDED.updated_at
	`, rule.ID, rule.Name, rule.Type, rule.EntityType, rule.EntityID, rule.OrgID,
		rule.Enabled, rule.ThresholdMs, rule.ThresholdPct, rule.Severity, string(notifyVia),
		rule.CreatedBy, rule.CreatedAt, rule.UpdatedAt)
	if err != nil {
		return fmt.Errorf("upsert rule: %w", err)
	}
	return nil
}

// DeleteRule removes an alert rule
func (p *PostgresDB) DeleteRule(ruleID string) error {
	_, err := p.db.Exec(`DELETE FROM alert_rules WHERE id = $1`, ruleID)
	return err
}

// GetAllRules returns all rules (for management UI)
func (p *PostgresDB) GetAllRules() ([]core.AlertRule, error) {
	rows, err := p.db.Query(`
		SELECT id, name, type, entity_type, COALESCE(entity_id,''), COALESCE(org_id,''),
		       enabled, threshold_ms, threshold_pct, severity, notify_via,
		       created_by, created_at, updated_at
		FROM alert_rules ORDER BY type, name
	`)
	if err != nil {
		return nil, fmt.Errorf("query all rules: %w", err)
	}
	defer rows.Close()

	var rules []core.AlertRule
	for rows.Next() {
		var r core.AlertRule
		var notifyViaStr string
		if err := rows.Scan(&r.ID, &r.Name, &r.Type, &r.EntityType, &r.EntityID, &r.OrgID,
			&r.Enabled, &r.ThresholdMs, &r.ThresholdPct, &r.Severity, &notifyViaStr,
			&r.CreatedBy, &r.CreatedAt, &r.UpdatedAt); err != nil {
			continue
		}
		json.Unmarshal([]byte(notifyViaStr), &r.NotifyVia)
		rules = append(rules, r)
	}
	return rules, nil
}

// SeedDefaultRules inserts default rules if none exist
func (p *PostgresDB) SeedDefaultRules(orgID string) error {
	var count int
	p.db.QueryRow(`SELECT COUNT(*) FROM alert_rules`).Scan(&count)
	if count > 0 {
		return nil // already seeded
	}

	defaults := core.RuleDefaults()
	for _, r := range defaults {
		r.OrgID = orgID
		p.UpsertRule(&r)
	}
	log.Printf("[Postgres] Seeded %d default alert rules", len(defaults))
	return nil
}

// Close closes the database
func (p *PostgresDB) Close() error {
	return p.db.Close()
}
