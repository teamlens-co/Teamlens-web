package services

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/teamlens/backend-go/internal/config"
	"github.com/teamlens/backend-go/internal/models"
)

type AgentAuthService struct {
	pool *pgxpool.Pool
	jwt  *JWTService
	cfg  *config.Config
}

func NewAgentAuthService(pool *pgxpool.Pool, jwt *JWTService, cfg *config.Config) *AgentAuthService {
	return &AgentAuthService{pool: pool, jwt: jwt, cfg: cfg}
}

func (s *AgentAuthService) Me(ctx context.Context, userID string) (*models.AgentLoginResponse, error) {
	var user struct {
		ID             string
		FullName       string
		Email          string
		Role           models.AuthRole
		Status         string
		OrganizationID string
		OrgName        string
		OrgSlug        string
	}

	err := s.pool.QueryRow(ctx,
		`SELECT u.id, u.full_name, u.email, u.role, u.status, u.organization_id,
		        o.name, o.slug
		 FROM users u
		 JOIN organizations o ON o.id = u.organization_id
		 WHERE u.id = $1`, userID,
	).Scan(
		&user.ID, &user.FullName, &user.Email, &user.Role, &user.Status,
		&user.OrganizationID, &user.OrgName, &user.OrgSlug,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errors.New("User not found")
		}
		return nil, fmt.Errorf("query user: %w", err)
	}

	if user.Status != "ACTIVE" {
		return nil, errors.New("User account is not active")
	}

	if user.Role != models.RoleEmployee {
		return nil, errors.New("Desktop agent login is only available for employees")
	}

	return &models.AgentLoginResponse{
		User: models.UserResponse{
			ID:       user.ID,
			FullName: user.FullName,
			Email:    user.Email,
			Role:     user.Role,
		},
		Organization: models.OrgResponse{
			ID:   user.OrganizationID,
			Name: user.OrgName,
			Slug: user.OrgSlug,
		},
	}, nil
}

func (s *AgentAuthService) Login(ctx context.Context, email, password string, deviceLabel *string) (*models.AgentLoginResponse, error) {
	email = strings.ToLower(strings.TrimSpace(email))

	var user struct {
		ID             string
		FullName       string
		Email          string
		PasswordHash   string
		Role           models.AuthRole
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

	if user.Role != models.RoleEmployee {
		return nil, errors.New("Desktop agent login is only available for employees")
	}

	tokenID := RandomToken(16)
	agentToken, err := s.jwt.SignAgentToken(user.ID, user.OrganizationID, user.Role, tokenID)
	if err != nil {
		return nil, err
	}

	expiresAt := time.Now().Add(s.cfg.JWTOAgentTTL)
	tokenHash := SHA256(agentToken)
	lbl := "Desktop Agent"
	if deviceLabel != nil && *deviceLabel != "" {
		lbl = *deviceLabel
	}

	_, err = s.pool.Exec(ctx,
		`INSERT INTO agent_tokens (id, organization_id, user_id, token_hash, label, status, expires_at, created_at)
		 VALUES ($1, $2, $3, $4, $5, 'ACTIVE', $6, NOW())`,
		RandomToken(16), user.OrganizationID, user.ID, tokenHash, lbl, expiresAt,
	)
	if err != nil {
		return nil, fmt.Errorf("save agent token: %w", err)
	}

	return &models.AgentLoginResponse{
		Token:     agentToken,
		ExpiresAt: expiresAt.Format(time.RFC3339),
		User: models.UserResponse{
			ID:       user.ID,
			FullName: user.FullName,
			Email:    user.Email,
			Role:     user.Role,
		},
		Organization: models.OrgResponse{
			ID:   user.OrganizationID,
			Name: user.OrgName,
			Slug: user.OrgSlug,
		},
	}, nil
}
