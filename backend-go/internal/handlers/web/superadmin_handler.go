package web

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/teamlens/backend-go/internal/middleware"
)

type SuperAdminHandler struct {
	pool *pgxpool.Pool
}

func NewSuperAdminHandler(pool *pgxpool.Pool) *SuperAdminHandler {
	return &SuperAdminHandler{pool: pool}
}

type SuperAdminStats struct {
	TotalCompanies     int64  `json:"totalCompanies"`
	ActiveCompanies    int64  `json:"activeCompanies"`
	SuspendedCompanies int64  `json:"suspendedCompanies"`
	TotalEmployees     int64  `json:"totalEmployees"`
	ActiveSessions     int64  `json:"activeSessions"`
	DatabaseSizeBytes  int64  `json:"databaseSizeBytes"`
	DatabaseSizePretty string `json:"databaseSizePretty"`
}

func (h *SuperAdminHandler) GetStats(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var stats SuperAdminStats

	// 1. Active companies count
	err := h.pool.QueryRow(ctx, `SELECT COUNT(*) FROM organizations WHERE is_active = true`).Scan(&stats.ActiveCompanies)
	if err != nil {
		slog.Error("GetStats: failed to count active organizations", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Failed to query active organizations")
		return
	}

	// 2. Suspended companies count
	err = h.pool.QueryRow(ctx, `SELECT COUNT(*) FROM organizations WHERE is_active = false`).Scan(&stats.SuspendedCompanies)
	if err != nil {
		slog.Error("GetStats: failed to count suspended organizations", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Failed to query suspended organizations")
		return
	}
	stats.TotalCompanies = stats.ActiveCompanies + stats.SuspendedCompanies

	// 3. Total employees
	err = h.pool.QueryRow(ctx, `SELECT COUNT(*) FROM users WHERE role = 'EMPLOYEE'`).Scan(&stats.TotalEmployees)
	if err != nil {
		slog.Error("GetStats: failed to count total employees", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Failed to query employees count")
		return
	}

	// 4. Current active clock-in sessions
	err = h.pool.QueryRow(ctx, `SELECT COUNT(*) FROM work_sessions WHERE clock_out_at IS NULL`).Scan(&stats.ActiveSessions)
	if err != nil {
		slog.Error("GetStats: failed to count active sessions", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Failed to query active work sessions")
		return
	}

	// 5. Database size
	err = h.pool.QueryRow(ctx, `
		SELECT pg_database_size(current_database()), pg_size_pretty(pg_database_size(current_database()))
	`).Scan(&stats.DatabaseSizeBytes, &stats.DatabaseSizePretty)
	if err != nil {
		slog.Warn("GetStats: failed to query database size", "error", err)
		// Set sensible fallbacks if pg_database_size fails or permissions restrict it
		stats.DatabaseSizeBytes = 0
		stats.DatabaseSizePretty = "Unknown"
	}

	middleware.Success(w, http.StatusOK, stats)
}

type SuperAdminUserItem struct {
	ID             string `json:"id"`
	FullName       string `json:"fullName"`
	Email          string `json:"email"`
	Role           string `json:"role"`
	Status         string `json:"status"`
	OrganizationID string `json:"organizationId"`
	Organization   string `json:"organization"`
	CreatedAt      string `json:"createdAt"`
}

func (h *SuperAdminHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	roleFilter := r.URL.Query().Get("role")
	search := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("search")))

	query := `
		SELECT u.id, u.full_name, u.email, u.role, u.status, u.organization_id, o.name, u.created_at
		FROM users u
		JOIN organizations o ON o.id = u.organization_id
		WHERE 1=1
	`
	args := []interface{}{}
	argIdx := 1

	if roleFilter != "" {
		query += fmt.Sprintf(" AND u.role = $%d", argIdx)
		args = append(args, roleFilter)
		argIdx++
	}
	if search != "" {
		query += fmt.Sprintf(" AND (LOWER(u.full_name) LIKE $%d OR LOWER(u.email) LIKE $%d)", argIdx, argIdx+1)
		args = append(args, "%"+search+"%", "%"+search+"%")
		argIdx += 2
	}

	query += ` ORDER BY u.created_at DESC`

	rows, err := h.pool.Query(ctx, query, args...)
	if err != nil {
		slog.Error("ListUsers: failed to query users", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Failed to list users")
		return
	}
	defer rows.Close()

	users := []SuperAdminUserItem{}
	for rows.Next() {
		var u SuperAdminUserItem
		var createdAt time.Time
		if err := rows.Scan(&u.ID, &u.FullName, &u.Email, &u.Role, &u.Status, &u.OrganizationID, &u.Organization, &createdAt); err != nil {
			slog.Error("ListUsers: failed to scan user row", "error", err)
			continue
		}
		u.CreatedAt = createdAt.Format("2006-01-02 15:04")
		users = append(users, u)
	}

	middleware.Success(w, http.StatusOK, users)
}

type SuperAdminOrgItem struct {
	ID                string  `json:"id"`
	Name              string  `json:"name"`
	Slug              string  `json:"slug"`
	CreatedAt         string  `json:"createdAt"`
	IsActive          bool    `json:"isActive"`
	ManagerCount      int64   `json:"managerCount"`
	EmployeeCount     int64   `json:"employeeCount"`
	SubscriptionPlan  string  `json:"subscriptionPlan"`
	SubscriptionPrice float64 `json:"subscriptionPrice"`
	EmployeeLimit     int64   `json:"employeeLimit"`
	BillingCycle      string  `json:"billingCycle"`
	RenewalDate       *string `json:"renewalDate"`
}

func (h *SuperAdminHandler) ListOrganizations(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	rows, err := h.pool.Query(ctx, `
		SELECT o.id, o.name, o.slug, o.created_at, COALESCE(o.is_active, TRUE),
		       COUNT(CASE WHEN u.role = 'MANAGER' THEN 1 END) as manager_count,
		       COUNT(CASE WHEN u.role = 'EMPLOYEE' THEN 1 END) as employee_count,
		       COALESCE(o.subscription_plan, 'BASIC') as subscription_plan,
		       COALESCE(o.subscription_price, 0.0) as subscription_price,
		       COALESCE(o.employee_limit, 10) as employee_limit,
		       COALESCE(o.billing_cycle, 'MONTHLY') as billing_cycle,
		       o.renewal_date
		FROM organizations o
		LEFT JOIN users u ON u.organization_id = o.id
		GROUP BY o.id, o.name, o.slug, o.created_at, o.is_active, o.subscription_plan, o.subscription_price, o.employee_limit, o.billing_cycle, o.renewal_date
		ORDER BY o.created_at DESC
	`)
	if err != nil {
		slog.Error("ListOrganizations: failed to query organizations", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Failed to list organizations")
		return
	}
	defer rows.Close()

	orgs := []SuperAdminOrgItem{}
	for rows.Next() {
		var item SuperAdminOrgItem
		var createdAt interface{}
		var renewalDate interface{}
		err := rows.Scan(
			&item.ID, &item.Name, &item.Slug, &createdAt, &item.IsActive, 
			&item.ManagerCount, &item.EmployeeCount,
			&item.SubscriptionPlan, &item.SubscriptionPrice, &item.EmployeeLimit,
			&item.BillingCycle, &renewalDate,
		)
		if err != nil {
			slog.Error("ListOrganizations: failed to scan row", "error", err)
			continue
		}
		if createdAt != nil {
			if t, ok := createdAt.(string); ok {
				item.CreatedAt = t
			} else if t, ok := createdAt.(time.Time); ok {
				item.CreatedAt = t.Format("2006-01-02 15:04:05")
			} else {
				item.CreatedAt = ""
			}
		}
		if renewalDate != nil {
			if t, ok := renewalDate.(time.Time); ok {
				f := t.Format("2006-01-02")
				item.RenewalDate = &f
			} else if t, ok := renewalDate.(string); ok {
				item.RenewalDate = &t
			}
		}
		orgs = append(orgs, item)
	}

	middleware.Success(w, http.StatusOK, orgs)
}

func (h *SuperAdminHandler) UpdateOrgStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	orgID := r.PathValue("orgId")
	if orgID == "" {
		middleware.Error(w, http.StatusBadRequest, "Organization ID is required")
		return
	}

	var input struct {
		IsActive bool `json:"isActive"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	result, err := h.pool.Exec(ctx, `
		UPDATE organizations SET is_active = $1, updated_at = NOW() WHERE id = $2
	`, input.IsActive, orgID)
	if err != nil {
		slog.Error("UpdateOrgStatus: failed to update status", "orgId", orgID, "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Failed to update organization status")
		return
	}

	if result.RowsAffected() == 0 {
		middleware.Error(w, http.StatusNotFound, "Organization not found")
		return
	}

	middleware.Success(w, http.StatusOK, map[string]interface{}{
		"id":       orgID,
		"isActive": input.IsActive,
	})
}

type SuperAdminManagerItem struct {
	ID            string `json:"id"`
	FullName      string `json:"fullName"`
	Email         string `json:"email"`
	EmployeeCount int64  `json:"employeeCount"`
}

type SuperAdminOrgDetails struct {
	Managers                 []SuperAdminManagerItem `json:"managers"`
	UnassignedEmployeesCount int64                   `json:"unassignedEmployeesCount"`
}

func (h *SuperAdminHandler) GetOrgDetails(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	orgID := r.PathValue("orgId")
	if orgID == "" {
		middleware.Error(w, http.StatusBadRequest, "Organization ID is required")
		return
	}

	var details SuperAdminOrgDetails
	details.Managers = []SuperAdminManagerItem{}

	// Query managers and their managed employee counts
	rows, err := h.pool.Query(ctx, `
		SELECT u.id, u.full_name, u.email,
		       COALESCE(COUNT(DISTINCT tm.user_id), 0) as employee_count
		FROM users u
		LEFT JOIN teams t ON t.manager_id = u.id
		LEFT JOIN team_memberships tm ON tm.team_id = t.id
		WHERE u.organization_id = $1 AND u.role = 'MANAGER'
		GROUP BY u.id, u.full_name, u.email
		ORDER BY u.full_name ASC
	`, orgID)
	if err != nil {
		slog.Error("GetOrgDetails: failed to query managers", "orgId", orgID, "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Failed to query managers list")
		return
	}
	defer rows.Close()

	for rows.Next() {
		var mgr SuperAdminManagerItem
		if err := rows.Scan(&mgr.ID, &mgr.FullName, &mgr.Email, &mgr.EmployeeCount); err != nil {
			slog.Error("GetOrgDetails: failed to scan manager row", "orgId", orgID, "error", err)
			continue
		}
		details.Managers = append(details.Managers, mgr)
	}

	// Query unassigned employees count (employees not in any team)
	err = h.pool.QueryRow(ctx, `
		SELECT COUNT(*)
		FROM users u
		WHERE u.organization_id = $1
		  AND u.role = 'EMPLOYEE'
		  AND u.id NOT IN (
		      SELECT tm.user_id
		      FROM team_memberships tm
		  )
	`, orgID).Scan(&details.UnassignedEmployeesCount)
	if err != nil {
		slog.Error("GetOrgDetails: failed to query unassigned employees count", "orgId", orgID, "error", err)
		details.UnassignedEmployeesCount = 0
	}

	middleware.Success(w, http.StatusOK, details)
}

func (h *SuperAdminHandler) UpdateOrgSubscription(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	orgID := r.PathValue("orgId")
	if orgID == "" {
		middleware.Error(w, http.StatusBadRequest, "Organization ID is required")
		return
	}

	var input struct {
		SubscriptionPlan  string  `json:"subscriptionPlan"`
		SubscriptionPrice float64 `json:"subscriptionPrice"`
		EmployeeLimit     int64   `json:"employeeLimit"`
		BillingCycle      string  `json:"billingCycle"`
		RenewalDate       *string `json:"renewalDate"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	var renewal interface{}
	if input.RenewalDate != nil && *input.RenewalDate != "" {
		t, err := time.Parse("2006-01-02", *input.RenewalDate)
		if err != nil {
			middleware.Error(w, http.StatusBadRequest, "Invalid renewal date format. Expected YYYY-MM-DD")
			return
		}
		renewal = t
	} else {
		renewal = nil
	}

	result, err := h.pool.Exec(ctx, `
		UPDATE organizations 
		SET subscription_plan = $1, subscription_price = $2, employee_limit = $3, billing_cycle = $4, renewal_date = $5, updated_at = NOW() 
		WHERE id = $6
	`, input.SubscriptionPlan, input.SubscriptionPrice, input.EmployeeLimit, input.BillingCycle, renewal, orgID)
	if err != nil {
		slog.Error("UpdateOrgSubscription: failed to update", "orgId", orgID, "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Failed to update subscription details")
		return
	}

	if result.RowsAffected() == 0 {
		middleware.Error(w, http.StatusNotFound, "Organization not found")
		return
	}

	middleware.Success(w, http.StatusOK, map[string]interface{}{
		"id":                orgID,
		"subscriptionPlan":  input.SubscriptionPlan,
		"subscriptionPrice": input.SubscriptionPrice,
		"employeeLimit":     input.EmployeeLimit,
		"billingCycle":      input.BillingCycle,
		"renewalDate":       input.RenewalDate,
	})
}
