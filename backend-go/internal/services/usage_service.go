package services

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/teamlens/backend-go/internal/models"
)

type UsageService struct {
	pool *pgxpool.Pool
}

func NewUsageService(pool *pgxpool.Pool) *UsageService {
	return &UsageService{pool: pool}
}

var productiveApps = []string{
	"visual studio code", "code.exe", "cursor", "intellij", "webstorm",
	"pycharm", "rider", "android studio", "xcode", "terminal",
	"windows terminal", "powershell", "git", "slack", "microsoft teams",
	"figma", "postman", "notion", "jira", "trello", "linear",
	"github", "gitlab", "bitbucket", "excel", "winword", "powerpnt",
	"outlook", "zoom", "docker", "dbeaver", "tableplus", "datagrip",
	"sublime text", "notepad++", "obsidian",
}

var unproductiveApps = []string{
	"spotify", "netflix", "prime video", "instagram", "facebook",
	"tiktok", "steam", "epic games", "riot client", "valorant",
	"minecraft", "vlc", "media player",
}

var productiveDomains = []string{
	"github.com", "gitlab.com", "bitbucket.org", "stackoverflow.com",
	"docs.microsoft.com", "developer.mozilla.org", "vercel.com",
	"linear.app", "jira.com", "atlassian.net", "notion.so", "figma.com",
	"slack.com", "teams.microsoft.com", "google.com",
}

var unproductiveDomains = []string{
	"youtube.com", "netflix.com", "primevideo.com", "hotstar.com",
	"instagram.com", "facebook.com", "x.com", "twitter.com",
	"reddit.com", "tiktok.com", "twitch.tv", "spotify.com",
}

var aiDomains = []string{
	"chatgpt.com", "openai.com", "claude.ai", "gemini.google.com",
	"copilot.microsoft.com", "perplexity.ai", "poe.com", "cursor.com",
}

var aiApps = []string{"chatgpt", "claude", "gemini", "copilot", "perplexity"}

var appAliases = map[string]string{
	"code":          "Visual Studio Code",
	"code.exe":      "Visual Studio Code",
	"brave":         "Brave Browser",
	"brave.exe":     "Brave Browser",
	"chrome":        "Google Chrome",
	"chrome.exe":    "Google Chrome",
	"msedge":        "Microsoft Edge",
	"msedge.exe":    "Microsoft Edge",
	"firefox":       "Mozilla Firefox",
	"firefox.exe":   "Mozilla Firefox",
	"discord":       "Discord",
	"discord.exe":   "Discord",
}

var invalidDomainSuffixes = map[string]bool{
	"app": true, "css": true, "html": true, "js": true, "jsx": true,
	"json": true, "md": true, "py": true, "rs": true, "tsx": true,
	"ts": true, "txt": true, "vue": true, "xml": true,
}

func (s *UsageService) Classify(organizationID, targetType, appName, domain, url string) models.ActivityCategory {
	checks := []struct {
		targetType string
		value      string
	}{
		{"URL", url},
		{"DOMAIN", domain},
		{"APP", appName},
	}

	for _, check := range checks {
		if check.value == "" {
			continue
		}
		// Try to find in classification_rules
		var category string
		err := s.pool.QueryRow(context.Background(),
			`SELECT category::text
			 FROM classification_rules
			 WHERE organization_id = $1
			   AND target_type = $2::"ActivityTargetType"
			   AND target_value = $3
			 LIMIT 1`,
			organizationID, check.targetType, strings.ToLower(strings.TrimSpace(check.value)),
		).Scan(&category)
		if err == nil {
			return models.ActivityCategory(category)
		}
	}

	// Fall back to built-in classification
	appNormalized := strings.ToLower(strings.TrimSpace(appName))
	domainClean := cleanDomain(domain)

	if domainMatch(domainClean, aiDomains) || appMatchAny(appNormalized, aiApps) {
		return models.CatNeutral
	}
	if domainMatch(domainClean, unproductiveDomains) {
		return models.CatUnproductive
	}
	if domainMatch(domainClean, productiveDomains) {
		return models.CatProductive
	}
	if appMatchAny(appNormalized, unproductiveApps) {
		return models.CatUnproductive
	}
	if appMatchAny(appNormalized, productiveApps) {
		return models.CatProductive
	}

	return models.CatNeutral
}

func (s *UsageService) CreateUsageLog(ctx context.Context, payload *models.UsageLogPayload) (*models.UsageLogResult, error) {
	var domain string
	if payload.Domain != nil {
		domain = cleanDomain(*payload.Domain)
	}
	url := ""
	if payload.URL != nil {
		url = *payload.URL
	}

	targetType := "APP"
	if url != "" {
		targetType = "URL"
	} else if domain != "" {
		targetType = "DOMAIN"
	}

	category := s.Classify(payload.OrganizationID, targetType, payload.AppName, domain, url)

	durationSeconds := payload.DurationSeconds
	if durationSeconds < 0 {
		durationSeconds = 0
	}
	idleSeconds := payload.IdleSeconds
	if idleSeconds < 0 {
		idleSeconds = 0
	}

	_, err := s.pool.Exec(ctx,
		`INSERT INTO activity_usage_logs
		 (id, organization_id, user_id, session_id, target_type, app_name, window_title,
		  domain, url, category, duration_seconds, idle_seconds, is_idle, captured_at, created_at)
		 VALUES ($1, $2, $3, $4, $5::"ActivityTargetType", $6, $7, $8, $9, $10::"ActivityCategory", $11, $12, $13, $14, NOW())`,
		RandomToken(16),
		payload.OrganizationID,
		payload.UserID,
		payload.SessionID,
		targetType,
		payload.AppName,
		payload.WindowTitle,
		domain,
		url,
		category,
		durationSeconds,
		idleSeconds,
		payload.IsIdle,
		payload.CapturedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create usage log: %w", err)
	}

	return &models.UsageLogResult{
		Category:       category,
		TargetType:     targetType,
		DurationSeconds: durationSeconds,
	}, nil
}

func (s *UsageService) UpsertRule(ctx context.Context, organizationID string, input *models.UpsertRuleInput) (*models.ClassificationRule, error) {
	targetValue := strings.ToLower(strings.TrimSpace(input.TargetValue))

	var rule models.ClassificationRule
	err := s.pool.QueryRow(ctx,
		`INSERT INTO classification_rules (id, organization_id, target_type, target_value, category, created_at, updated_at)
		 VALUES ($1, $2, $3::"ActivityTargetType", $4, $5::"ActivityCategory", NOW(), NOW())
		 ON CONFLICT (organization_id, target_type, target_value)
		 DO UPDATE SET category = EXCLUDED.category, updated_at = NOW()
		 RETURNING id, target_type::text, target_value, category::text`,
		RandomToken(16), organizationID, input.TargetType, targetValue, input.Category,
	).Scan(&rule.ID, &rule.TargetType, &rule.TargetValue, &rule.Category)
	if err != nil {
		return nil, fmt.Errorf("upsert rule: %w", err)
	}
	return &rule, nil
}

func (s *UsageService) ListRules(ctx context.Context, organizationID string) ([]models.ClassificationRule, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, target_type::text, target_value, category::text
		 FROM classification_rules
		 WHERE organization_id = $1
		 ORDER BY updated_at DESC`,
		organizationID,
	)
	if err != nil {
		return nil, fmt.Errorf("list rules: %w", err)
	}
	defer rows.Close()

	var rules []models.ClassificationRule
	for rows.Next() {
		var r models.ClassificationRule
		if err := rows.Scan(&r.ID, &r.TargetType, &r.TargetValue, &r.Category); err != nil {
			return nil, fmt.Errorf("scan rule: %w", err)
		}
		rules = append(rules, r)
	}
	return rules, nil
}

func (s *UsageService) DeleteRule(ctx context.Context, organizationID, ruleID string) error {
	_, err := s.pool.Exec(ctx,
		`DELETE FROM classification_rules WHERE id = $1 AND organization_id = $2`,
		ruleID, organizationID,
	)
	return err
}

func cleanDomain(value string) string {
	domain := strings.ToLower(strings.TrimSpace(value))
	domain = strings.TrimPrefix(domain, "https://")
	domain = strings.TrimPrefix(domain, "http://")
	domain = strings.TrimPrefix(domain, "www.")
	if idx := strings.IndexAny(domain, "/?#"); idx >= 0 {
		domain = domain[:idx]
	}
	if !isValidDomain(domain) {
		return ""
	}
	return domain
}

func isValidDomain(value string) bool {
	if value == "" {
		return false
	}
	parts := strings.Split(value, ".")
	if len(parts) < 2 {
		return false
	}
	suffix := parts[len(parts)-1]
	if invalidDomainSuffixes[suffix] {
		return false
	}
	if strings.Contains(value, "..") {
		return false
	}
	for _, p := range parts {
		if p == "" {
			return false
		}
	}
	return true
}

func domainMatch(domain string, candidates []string) bool {
	if domain == "" {
		return false
	}
	for _, c := range candidates {
		if domain == c || strings.HasSuffix(domain, "."+c) {
			return true
		}
	}
	return false
}

func appMatchAny(app string, candidates []string) bool {
	app = strings.ToLower(app)
	for _, c := range candidates {
		if strings.Contains(app, c) {
			return true
		}
	}
	return false
}

func (s *UsageService) GetUsageReport(ctx context.Context, params struct {
	OrganizationID string
	UserID         *string
	TeamID         *string
	Start          time.Time
	End            time.Time
	GroupBy        string
}) (*models.UsageReport, error) {
	// Build a simplified usage report
	rows, err := s.pool.Query(ctx,
		`SELECT COALESCE(NULLIF(domain, ''), app_name) AS name,
		        MAX(target_type::text) AS target_type,
		        MAX(app_name) AS app_name,
		        MAX(domain) AS domain,
		        MAX(category::text) AS category,
		        SUM(duration_seconds)::int AS duration_seconds,
		        COUNT(*)::int AS samples
		 FROM activity_usage_logs
		 WHERE organization_id = $1
		   AND captured_at >= $2
		   AND captured_at <= $3
		   AND ($4::text IS NULL OR user_id = $4::text)
		   AND ($5::text IS NULL OR EXISTS(
		       SELECT 1 FROM team_memberships tm WHERE tm.user_id = user_id AND tm.team_id = $5::text
		   ))
		 GROUP BY COALESCE(NULLIF(domain, ''), app_name)
		 ORDER BY SUM(duration_seconds) DESC
		 LIMIT 100`,
		params.OrganizationID, params.Start, params.End, params.UserID, params.TeamID,
	)
	if err != nil {
		return nil, fmt.Errorf("query usage: %w", err)
	}
	defer rows.Close()

	var items []models.UsageReportItem
	for rows.Next() {
		var item models.UsageReportItem
		if err := rows.Scan(&item.Name, &item.TargetType, &item.AppName, &item.Domain,
			&item.Category, &item.DurationSeconds, &item.Samples); err != nil {
			return nil, fmt.Errorf("scan usage item: %w", err)
		}
		items = append(items, item)
	}

	if items == nil {
		items = []models.UsageReportItem{}
	}

	return &models.UsageReport{
		Items:      items,
		Categories: []models.UsageCategoryBreakdown{},
		Breakdowns: []models.UsageBreakdownItem{},
		GroupBy:    params.GroupBy,
	}, nil
}
