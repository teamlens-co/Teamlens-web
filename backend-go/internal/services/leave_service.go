package services

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type LeaveStatus string

const (
	StatusPending  LeaveStatus = "PENDING"
	StatusApproved LeaveStatus = "APPROVED"
	StatusRejected LeaveStatus = "REJECTED"
)

type LeaveType struct {
	ID             string    `json:"id"`
	OrganizationID string    `json:"organizationId"`
	Name           string    `json:"name"`
	MaxDays        int       `json:"maxDays"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`
}

type LeaveBalance struct {
	ID            string    `json:"id"`
	UserID        string    `json:"userId"`
	LeaveTypeID   string    `json:"leaveTypeId"`
	LeaveTypeName string    `json:"leaveTypeName"`
	AllocatedDays int       `json:"allocatedDays"`
	UsedDays      int       `json:"usedDays"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`
}

type LeaveRequest struct {
	ID             string      `json:"id"`
	UserID         string      `json:"userId"`
	EmployeeName   string      `json:"employeeName"`
	Email          string      `json:"email"`
	LeaveTypeID    string      `json:"leaveTypeId"`
	LeaveTypeName  string      `json:"leaveTypeName"`
	StartDate      string      `json:"startDate"`
	EndDate        string      `json:"endDate"`
	TotalDays      int         `json:"totalDays"`
	Reason         string      `json:"reason"`
	Status         LeaveStatus `json:"status"`
	ApprovedBy     *string     `json:"approvedBy,omitempty"`
	ManagerComment *string     `json:"managerComment,omitempty"`
	CreatedAt      time.Time   `json:"createdAt"`
	UpdatedAt      time.Time   `json:"updatedAt"`
}

type Holiday struct {
	ID             string `json:"id"`
	OrganizationID string `json:"organizationId"`
	Name           string `json:"name"`
	Date           string `json:"date"`
}

type LeaveService struct {
	pool *pgxpool.Pool
}

func NewLeaveService(pool *pgxpool.Pool) *LeaveService {
	return &LeaveService{pool: pool}
}

// GetLeaveTypes returns all leave types for an organization
func (s *LeaveService) GetLeaveTypes(ctx context.Context, orgID string) ([]LeaveType, error) {
	var query string
	var args []interface{}

	if orgID == "combined" {
		// Just returns leave types for all organizations - in real code we might scope by organizations the user has access to
		query = `SELECT id, organization_id, name, max_days, created_at, updated_at FROM leave_types ORDER BY name ASC`
	} else {
		query = `SELECT id, organization_id, name, max_days, created_at, updated_at FROM leave_types WHERE organization_id = $1 ORDER BY name ASC`
		args = []interface{}{orgID}
	}

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query leave types: %w", err)
	}
	defer rows.Close()

	types := []LeaveType{}
	for rows.Next() {
		var lt LeaveType
		if err := rows.Scan(&lt.ID, &lt.OrganizationID, &lt.Name, &lt.MaxDays, &lt.CreatedAt, &lt.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan leave type: %w", err)
		}
		types = append(types, lt)
	}
	return types, nil
}

// CreateLeaveType adds a new leave type
func (s *LeaveService) CreateLeaveType(ctx context.Context, orgID, name string, maxDays int) (*LeaveType, error) {
	if orgID == "combined" || orgID == "" {
		return nil, errors.New("cannot create leave type under combined organization view")
	}
	id := uuid.New().String()
	query := `INSERT INTO leave_types (id, organization_id, name, max_days, created_at, updated_at)
	          VALUES ($1, $2, $3, $4, NOW(), NOW())
	          RETURNING id, organization_id, name, max_days, created_at, updated_at`
	var lt LeaveType
	err := s.pool.QueryRow(ctx, query, id, orgID, name, maxDays).
		Scan(&lt.ID, &lt.OrganizationID, &lt.Name, &lt.MaxDays, &lt.CreatedAt, &lt.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("insert leave type: %w", err)
	}
	return &lt, nil
}

// GetLeaveBalances returns balances for a user
func (s *LeaveService) GetLeaveBalances(ctx context.Context, userID, orgID string) ([]LeaveBalance, error) {
	// First ensure default leave balances exist for this user based on organization's leave types
	err := s.ensureUserLeaveBalances(ctx, userID, orgID)
	if err != nil {
		return nil, err
	}

	query := `SELECT lb.id, lb.user_id, lb.leave_type_id, lt.name, lb.allocated_days, lb.used_days, lb.created_at, lb.updated_at
	          FROM leave_balances lb
	          JOIN leave_types lt ON lb.leave_type_id = lt.id
	          WHERE lb.user_id = $1
	          ORDER BY lt.name ASC`
	rows, err := s.pool.Query(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("query leave balances: %w", err)
	}
	defer rows.Close()

	balances := []LeaveBalance{}
	for rows.Next() {
		var lb LeaveBalance
		if err := rows.Scan(&lb.ID, &lb.UserID, &lb.LeaveTypeID, &lb.LeaveTypeName, &lb.AllocatedDays, &lb.UsedDays, &lb.CreatedAt, &lb.UpdatedAt); err != nil {
			return nil, fmt.Errorf("scan leave balance: %w", err)
		}
		balances = append(balances, lb)
	}
	return balances, nil
}

// RequestLeave creates a leave request
func (s *LeaveService) RequestLeave(ctx context.Context, userID, orgID, leaveTypeID, startDateStr, endDateStr, reason string) (*LeaveRequest, error) {
	// Parse dates
	start, err := time.Parse("2006-01-02", startDateStr)
	if err != nil {
		return nil, fmt.Errorf("parse start date: %w", err)
	}
	end, err := time.Parse("2006-01-02", endDateStr)
	if err != nil {
		return nil, fmt.Errorf("parse end date: %w", err)
	}

	if end.Before(start) {
		return nil, errors.New("end date cannot be before start date")
	}

	// Calculate total days excluding holidays and weekends
	totalDays, err := s.calculateLeaveDays(ctx, orgID, start, end)
	if err != nil {
		return nil, fmt.Errorf("calculate leave days: %w", err)
	}
	if totalDays <= 0 {
		return nil, errors.New("requested leave range consists only of weekends/holidays")
	}

	// Check leave balance
	var allocated, used int
	err = s.pool.QueryRow(ctx,
		`SELECT allocated_days, used_days FROM leave_balances
		 WHERE user_id = $1 AND leave_type_id = $2`,
		userID, leaveTypeID).Scan(&allocated, &used)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			// Initialize balance first
			err = s.ensureUserLeaveBalances(ctx, userID, orgID)
			if err != nil {
				return nil, err
			}
			err = s.pool.QueryRow(ctx,
				`SELECT allocated_days, used_days FROM leave_balances
				 WHERE user_id = $1 AND leave_type_id = $2`,
				userID, leaveTypeID).Scan(&allocated, &used)
			if err != nil {
				return nil, fmt.Errorf("fetch leave balance: %w", err)
			}
		} else {
			return nil, fmt.Errorf("query leave balance: %w", err)
		}
	}

	if (allocated - used) < totalDays {
		return nil, fmt.Errorf("insufficient leave balance (requested %d days, available %d days)", totalDays, allocated-used)
	}

	id := uuid.New().String()
	query := `INSERT INTO leave_requests (id, user_id, leave_type_id, start_date, end_date, total_days, reason, status, created_at, updated_at)
	          VALUES ($1, $2, $3, $4, $5, $6, $7, 'PENDING', NOW(), NOW())
	          RETURNING id, user_id, leave_type_id, start_date, end_date, total_days, reason, status, created_at, updated_at`
	
	var lr LeaveRequest
	var dbStart, dbEnd time.Time
	err = s.pool.QueryRow(ctx, query, id, userID, leaveTypeID, start, end, totalDays, reason).
		Scan(&lr.ID, &lr.UserID, &lr.LeaveTypeID, &dbStart, &dbEnd, &lr.TotalDays, &lr.Reason, &lr.Status, &lr.CreatedAt, &lr.UpdatedAt)
	if err != nil {
		return nil, fmt.Errorf("insert leave request: %w", err)
	}
	lr.StartDate = dbStart.Format("2006-01-02")
	lr.EndDate = dbEnd.Format("2006-01-02")

	// Fill names
	_ = s.pool.QueryRow(ctx, `SELECT full_name, email FROM users WHERE id = $1`, userID).Scan(&lr.EmployeeName, &lr.Email)
	_ = s.pool.QueryRow(ctx, `SELECT name FROM leave_types WHERE id = $1`, leaveTypeID).Scan(&lr.LeaveTypeName)

	return &lr, nil
}

// GetLeaveRequests retrieves requests scoped by organization (or combined)
func (s *LeaveService) GetLeaveRequests(ctx context.Context, orgID, viewerUserID, role string) ([]LeaveRequest, error) {
	var query string
	var args []interface{}

	// If employee, only get their own requests
	if role == "EMPLOYEE" {
		query = `SELECT lr.id, lr.user_id, u.full_name, u.email, lr.leave_type_id, lt.name, lr.start_date, lr.end_date, lr.total_days, lr.reason, lr.status, lr.approved_by, lr.manager_comment, lr.created_at, lr.updated_at
		         FROM leave_requests lr
		         JOIN users u ON lr.user_id = u.id
		         JOIN leave_types lt ON lr.leave_type_id = lt.id
		         WHERE lr.user_id = $1
		         ORDER BY lr.created_at DESC`
		args = []interface{}{viewerUserID}
	} else {
		// Manager/Admin: get all requests in their organization
		if orgID == "combined" {
			query = `SELECT lr.id, lr.user_id, u.full_name, u.email, lr.leave_type_id, lt.name, lr.start_date, lr.end_date, lr.total_days, lr.reason, lr.status, lr.approved_by, lr.manager_comment, lr.created_at, lr.updated_at
			         FROM leave_requests lr
			         JOIN users u ON lr.user_id = u.id
			         JOIN leave_types lt ON lr.leave_type_id = lt.id
			         WHERE u.organization_id IN (SELECT organization_id FROM organization_memberships WHERE user_id = $1)
			         ORDER BY lr.created_at DESC`
			args = []interface{}{viewerUserID}
		} else {
			query = `SELECT lr.id, lr.user_id, u.full_name, u.email, lr.leave_type_id, lt.name, lr.start_date, lr.end_date, lr.total_days, lr.reason, lr.status, lr.approved_by, lr.manager_comment, lr.created_at, lr.updated_at
			         FROM leave_requests lr
			         JOIN users u ON lr.user_id = u.id
			         JOIN leave_types lt ON lr.leave_type_id = lt.id
			         WHERE u.organization_id = $1
			         ORDER BY lr.created_at DESC`
			args = []interface{}{orgID}
		}
	}

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query leave requests: %w", err)
	}
	defer rows.Close()

	requests := []LeaveRequest{}
	for rows.Next() {
		var lr LeaveRequest
		var dbStart, dbEnd time.Time
		var approvedBy, comment sql.NullString
		err := rows.Scan(
			&lr.ID, &lr.UserID, &lr.EmployeeName, &lr.Email, &lr.LeaveTypeID, &lr.LeaveTypeName,
			&dbStart, &dbEnd, &lr.TotalDays, &lr.Reason, &lr.Status, &approvedBy, &comment,
			&lr.CreatedAt, &lr.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scan leave request: %w", err)
		}
		lr.StartDate = dbStart.Format("2006-01-02")
		lr.EndDate = dbEnd.Format("2006-01-02")
		if approvedBy.Valid {
			val := approvedBy.String
			lr.ApprovedBy = &val
		}
		if comment.Valid {
			val := comment.String
			lr.ManagerComment = &val
		}
		requests = append(requests, lr)
	}
	return requests, nil
}

// ApproveLeave updates leave status and decrements balance if approved
func (s *LeaveService) ApproveLeave(ctx context.Context, requestID, managerID string, approved bool, comment string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin transaction: %w", err)
	}
	defer func() { _ = tx.Rollback(ctx) }()

	// Get current request details
	var userID, leaveTypeID string
	var totalDays int
	var status LeaveStatus
	err = tx.QueryRow(ctx,
		`SELECT user_id, leave_type_id, total_days, status FROM leave_requests WHERE id = $1 FOR UPDATE`,
		requestID).Scan(&userID, &leaveTypeID, &totalDays, &status)
	if err != nil {
		return fmt.Errorf("fetch leave request details: %w", err)
	}

	if status != StatusPending {
		return errors.New("leave request is already processed")
	}

	newStatus := StatusRejected
	if approved {
		newStatus = StatusApproved

		// Update used days in leave balance
		res, err := tx.Exec(ctx,
			`UPDATE leave_balances 
			 SET used_days = used_days + $3, updated_at = NOW() 
			 WHERE user_id = $1 AND leave_type_id = $2`,
			userID, leaveTypeID, totalDays)
		if err != nil {
			return fmt.Errorf("update user leave balance: %w", err)
		}
		if res.RowsAffected() == 0 {
			return errors.New("user leave balance record not found")
		}
	}

	// Update leave request status
	_, err = tx.Exec(ctx,
		`UPDATE leave_requests 
		 SET status = $2, approved_by = $3, manager_comment = $4, updated_at = NOW()
		 WHERE id = $1`,
		requestID, newStatus, managerID, comment)
	if err != nil {
		return fmt.Errorf("update leave request: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit transaction: %w", err)
	}
	return nil
}

// GetHolidays returns all holidays for an organization
func (s *LeaveService) GetHolidays(ctx context.Context, orgID string) ([]Holiday, error) {
	var query string
	var args []interface{}

	if orgID == "combined" {
		query = `SELECT id, organization_id, name, date FROM holidays ORDER BY date ASC`
	} else {
		query = `SELECT id, organization_id, name, date FROM holidays WHERE organization_id = $1 ORDER BY date ASC`
		args = []interface{}{orgID}
	}

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("query holidays: %w", err)
	}
	defer rows.Close()

	holidays := []Holiday{}
	for rows.Next() {
		var h Holiday
		var dbDate time.Time
		if err := rows.Scan(&h.ID, &h.OrganizationID, &h.Name, &dbDate); err != nil {
			return nil, fmt.Errorf("scan holiday: %w", err)
		}
		h.Date = dbDate.Format("2006-01-02")
		holidays = append(holidays, h)
	}
	return holidays, nil
}

// CreateHoliday adds a public holiday
func (s *LeaveService) CreateHoliday(ctx context.Context, orgID, name, dateStr string) (*Holiday, error) {
	if orgID == "combined" || orgID == "" {
		return nil, errors.New("cannot create holiday under combined organization view")
	}
	parsedDate, err := time.Parse("2006-01-02", dateStr)
	if err != nil {
		return nil, fmt.Errorf("parse holiday date: %w", err)
	}

	id := uuid.New().String()
	query := `INSERT INTO holidays (id, organization_id, name, date)
	          VALUES ($1, $2, $3, $4)
	          ON CONFLICT (organization_id, date) DO UPDATE SET name = EXCLUDED.name
	          RETURNING id, organization_id, name, date`
	
	var h Holiday
	var dbDate time.Time
	err = s.pool.QueryRow(ctx, query, id, orgID, name, parsedDate).Scan(&h.ID, &h.OrganizationID, &h.Name, &dbDate)
	if err != nil {
		return nil, fmt.Errorf("insert holiday: %w", err)
	}
	h.Date = dbDate.Format("2006-01-02")
	return &h, nil
}

// Helper: check leave request days (excluding weekends & holidays)
func (s *LeaveService) calculateLeaveDays(ctx context.Context, orgID string, start, end time.Time) (int, error) {
	// Query holidays in this range
	holidayRows, err := s.pool.Query(ctx,
		`SELECT date FROM holidays WHERE organization_id = $1 AND date >= $2 AND date <= $3`,
		orgID, start, end)
	if err != nil {
		return 0, err
	}
	defer holidayRows.Close()

	holidayMap := make(map[string]bool)
	for holidayRows.Next() {
		var d time.Time
		if err := holidayRows.Scan(&d); err == nil {
			holidayMap[d.Format("2006-01-02")] = true
		}
	}

	days := 0
	for current := start; !current.After(end); current = current.AddDate(0, 0, 1) {
		// Skip weekends (Saturday and Sunday)
		if current.Weekday() == time.Saturday || current.Weekday() == time.Sunday {
			continue
		}
		// Skip holidays
		if holidayMap[current.Format("2006-01-02")] {
			continue
		}
		days++
	}
	return days, nil
}

// Helper: automatically create missing leave balance items for a user
func (s *LeaveService) ensureUserLeaveBalances(ctx context.Context, userID, orgID string) error {
	// Find all leave types for user's organization
	rows, err := s.pool.Query(ctx, `SELECT id, max_days FROM leave_types WHERE organization_id = $1`, orgID)
	if err != nil {
		return fmt.Errorf("query leave types for balance init: %w", err)
	}
	defer rows.Close()

	type Item struct {
		id      string
		maxDays int
	}
	items := []Item{}
	for rows.Next() {
		var it Item
		if err := rows.Scan(&it.id, &it.maxDays); err == nil {
			items = append(items, it)
		}
	}

	for _, item := range items {
		id := uuid.New().String()
		_, _ = s.pool.Exec(ctx,
			`INSERT INTO leave_balances (id, user_id, leave_type_id, allocated_days, used_days, created_at, updated_at)
			 VALUES ($1, $2, $3, $4, 0, NOW(), NOW())
			 ON CONFLICT (user_id, leave_type_id) DO NOTHING`,
			id, userID, item.id, item.maxDays)
	}
	return nil
}
