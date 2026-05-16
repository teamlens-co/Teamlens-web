package services

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/teamlens/backend-go/internal/models"
)

type AuthService struct {
	pool *pgxpool.Pool
	jwt  *JWTService
}

func NewAuthService(pool *pgxpool.Pool, jwt *JWTService) *AuthService {
	return &AuthService{pool: pool, jwt: jwt}
}

func (s *AuthService) SignupManager(ctx context.Context, input struct {
	FullName         string
	Email            string
	Password         string
	OrganizationName string
}) (*models.TokenPair, error) {
	email := strings.ToLower(strings.TrimSpace(input.Email))

	// Check if email exists
	var exists bool
	err := s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)`, email).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("check email: %w", err)
	}
	if exists {
		return nil, errors.New("Email is already registered")
	}

	passwordHash, err := HashPassword(input.Password)
	if err != nil {
		return nil, err
	}

	slug := buildUniqueSlug(ctx, s.pool, input.OrganizationName)

	// Create organization and user in transaction
	orgID := RandomToken(16)
	userID := RandomToken(16)

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	_, err = tx.Exec(ctx,
		`INSERT INTO organizations (id, name, slug, created_at, updated_at)
		 VALUES ($1, $2, $3, NOW(), NOW())`,
		orgID, strings.TrimSpace(input.OrganizationName), slug,
	)
	if err != nil {
		return nil, fmt.Errorf("create organization: %w", err)
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO users (id, organization_id, full_name, email, password_hash, role, status, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, 'MANAGER', 'ACTIVE', NOW(), NOW())`,
		userID, orgID, strings.TrimSpace(input.FullName), email, passwordHash,
	)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}

	accessToken, err := s.jwt.SignAccessToken(userID, orgID, models.RoleManager)
	if err != nil {
		return nil, err
	}

	return &models.TokenPair{
		AccessToken: accessToken,
		User: models.UserResponse{
			ID:             userID,
			FullName:       strings.TrimSpace(input.FullName),
			Email:          email,
			Role:           models.RoleManager,
			OrganizationID: orgID,
			Organization: &models.OrgResponse{
				ID:   orgID,
				Name: strings.TrimSpace(input.OrganizationName),
				Slug: slug,
			},
		},
		Organization: models.OrgResponse{
			ID:   orgID,
			Name: strings.TrimSpace(input.OrganizationName),
			Slug: slug,
		},
	}, nil
}

func (s *AuthService) Login(ctx context.Context, email, password string) (*models.TokenPair, error) {
	email = strings.ToLower(strings.TrimSpace(email))

	var user struct {
		ID             string
		FullName       string
		Email          string
		PasswordHash   string
		Role           string
		Status         string
		OrganizationID string
		OrgName        string
		OrgSlug        string
	}

	err := s.pool.QueryRow(ctx,
		`SELECT u.id, u.full_name, u.email, u.password_hash, u.role, u.status, u.organization_id,
		        o.name, o.slug
		 FROM users u
		 JOIN organizations o ON o.id = u.organization_id
		 WHERE u.email = $1`, email,
	).Scan(
		&user.ID, &user.FullName, &user.Email, &user.PasswordHash,
		&user.Role, &user.Status, &user.OrganizationID,
		&user.OrgName, &user.OrgSlug,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errors.New("Invalid email or password")
		}
		return nil, fmt.Errorf("query user: %w", err)
	}

	if !ComparePassword(password, user.PasswordHash) {
		return nil, errors.New("Invalid email or password")
	}

	if user.Status != "ACTIVE" {
		return nil, errors.New("User account is not active")
	}

	accessToken, err := s.jwt.SignAccessToken(user.ID, user.OrganizationID, models.AuthRole(user.Role))
	if err != nil {
		return nil, err
	}

	return &models.TokenPair{
		AccessToken: accessToken,
		User: models.UserResponse{
			ID:             user.ID,
			FullName:       user.FullName,
			Email:          user.Email,
			Role:           models.AuthRole(user.Role),
			OrganizationID: user.OrganizationID,
			Organization: &models.OrgResponse{
				ID:   user.OrganizationID,
				Name: user.OrgName,
				Slug: user.OrgSlug,
			},
		},
		Organization: models.OrgResponse{
			ID:   user.OrganizationID,
			Name: user.OrgName,
			Slug: user.OrgSlug,
		},
	}, nil
}

func (s *AuthService) Me(ctx context.Context, userID string) (*models.UserResponse, error) {
	var user models.UserResponse
	var orgName, orgSlug, status string
	var orgID string

	err := s.pool.QueryRow(ctx,
		`SELECT u.id, u.full_name, u.email, u.role, u.status, u.organization_id, o.name, o.slug
		 FROM users u
		 JOIN organizations o ON o.id = u.organization_id
		 WHERE u.id = $1`, userID,
	).Scan(&user.ID, &user.FullName, &user.Email, &user.Role, &status, &orgID, &orgName, &orgSlug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errors.New("User not found")
		}
		return nil, fmt.Errorf("query user: %w", err)
	}

	user.Status = status
	user.OrganizationID = orgID
	user.Organization = &models.OrgResponse{
		ID:   orgID,
		Name: orgName,
		Slug: orgSlug,
	}
	return &user, nil
}

func (s *AuthService) CreateAgentConnectToken(ctx context.Context, userID, organizationID string, role models.AuthRole, label *string) (*struct {
	AgentToken string `json:"agentToken"`
	ExpiresAt  string `json:"expiresAt"`
	ConnectURL string `json:"connectUrl"`
}, error) {
	tokenID := RandomToken(16)
	agentToken, err := s.jwt.SignAgentToken(userID, organizationID, role, tokenID)
	if err != nil {
		return nil, err
	}

	tokenHash := SHA256(agentToken)
	lbl := "Desktop Agent"
	if label != nil && *label != "" {
		lbl = *label
	}

	_, err = s.pool.Exec(ctx,
		`INSERT INTO agent_tokens (id, organization_id, user_id, token_hash, label, status, expires_at, created_at)
		 VALUES ($1, $2, $3, $4, $5, 'ACTIVE', NOW() + INTERVAL '30 days', NOW())`,
		RandomToken(16), organizationID, userID, tokenHash, lbl,
	)
	if err != nil {
		return nil, fmt.Errorf("create agent token: %w", err)
	}

	expiresAt := "30d" // approximate

	return &struct {
		AgentToken string `json:"agentToken"`
		ExpiresAt  string `json:"expiresAt"`
		ConnectURL string `json:"connectUrl"`
	}{
		AgentToken: agentToken,
		ExpiresAt:  expiresAt,
		ConnectURL: fmt.Sprintf("/agent/connect?token=%s", agentToken),
	}, nil
}

func (s *AuthService) GetTeamUsers(ctx context.Context, organizationID string) ([]models.UserResponse, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, full_name, email, role, status, created_at
		 FROM users
		 WHERE organization_id = $1
		 ORDER BY created_at ASC`,
		organizationID,
	)
	if err != nil {
		return nil, fmt.Errorf("query team users: %w", err)
	}
	defer rows.Close()

	var users []models.UserResponse
	for rows.Next() {
		var u models.UserResponse
		var createdAt time.Time
		if err := rows.Scan(&u.ID, &u.FullName, &u.Email, &u.Role, &u.Status, &createdAt); err != nil {
			return nil, fmt.Errorf("scan user: %w", err)
		}
		u.OrganizationID = organizationID
		users = append(users, u)
	}
	return users, nil
}

func (s *AuthService) DeleteEmployee(ctx context.Context, organizationID, employeeID string) (*models.UserResponse, error) {
	// Verify the employee belongs to this organization
	var employee models.UserResponse
	err := s.pool.QueryRow(ctx,
		`SELECT id, full_name, email, role FROM users
		 WHERE id = $1 AND organization_id = $2 AND role = 'EMPLOYEE'`,
		employeeID, organizationID,
	).Scan(&employee.ID, &employee.FullName, &employee.Email, &employee.Role)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("query employee: %w", err)
	}

	// Delete in transaction (cascading)
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	tables := []string{
		"agent_tokens", "team_memberships", "manual_time_requests",
		"activity_logs", "work_sessions", "screenshots",
		"activity_usage_logs", "live_screen_sessions", "screen_recordings",
	}
	for _, table := range tables {
		_, err := tx.Exec(ctx, fmt.Sprintf(`DELETE FROM "%s" WHERE user_id = $1`, table), employeeID)
		if err != nil {
			return nil, fmt.Errorf("delete from %s: %w", table, err)
		}
	}

	// Also delete where employee is manager in some tables
	_, _ = tx.Exec(ctx, `DELETE FROM live_screen_sessions WHERE manager_id = $1`, employeeID)
	_, _ = tx.Exec(ctx, `DELETE FROM screen_recordings WHERE manager_id = $1`, employeeID)

	// Also handle manual_time_requests for requested_by_id and reviewed_by_id
	_, _ = tx.Exec(ctx, `DELETE FROM manual_time_requests WHERE requested_by_id = $1`, employeeID)
	_, _ = tx.Exec(ctx, `UPDATE manual_time_requests SET reviewed_by_id = NULL WHERE reviewed_by_id = $1`, employeeID)

	_, err = tx.Exec(ctx, `DELETE FROM users WHERE id = $1`, employeeID)
	if err != nil {
		return nil, fmt.Errorf("delete user: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}

	employee.Role = models.RoleEmployee
	return &employee, nil
}

func buildUniqueSlug(ctx context.Context, pool *pgxpool.Pool, name string) string {
	base := Slugify(name)
	if base == "" {
		base = "teamlens-org"
	}
	candidate := base
	for i := 1; ; i++ {
		var exists bool
		err := pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM organizations WHERE slug = $1)`, candidate).Scan(&exists)
		if err != nil || !exists {
			return candidate
		}
		candidate = fmt.Sprintf("%s-%d", base, i)
	}
}

func (s *AuthService) GetUserByID(ctx context.Context, userID string) (*models.UserResponse, error) {
	var u models.UserResponse
	err := s.pool.QueryRow(ctx,
		`SELECT id, full_name, email, role, status, organization_id
		 FROM users WHERE id = $1`, userID,
	).Scan(&u.ID, &u.FullName, &u.Email, &u.Role, &u.Status, &u.OrganizationID)
	if err != nil {
		return nil, fmt.Errorf("get user: %w", err)
	}
	return &u, nil
}
