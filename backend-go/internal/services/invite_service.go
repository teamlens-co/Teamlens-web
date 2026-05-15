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

type InviteService struct {
	pool         *pgxpool.Pool
	jwt          *JWTService
	inviteTTL    int
	webAppURL    string
}

func NewInviteService(pool *pgxpool.Pool, jwt *JWTService, inviteTTL int, webAppURL string) *InviteService {
	return &InviteService{
		pool: pool,
		jwt: jwt,
		inviteTTL: inviteTTL,
		webAppURL: webAppURL,
	}
}

func (s *InviteService) CreateInvite(ctx context.Context, managerID, organizationID, email string, role *models.AuthRole) (*models.InviteResponse, error) {
	email = strings.ToLower(strings.TrimSpace(email))

	r := models.RoleEmployee
	if role != nil {
		r = *role
	}

	expiresAt := time.Now().Add(time.Duration(s.inviteTTL) * time.Hour)
	token := RandomToken(24)

	id := RandomToken(16)
	_, err := s.pool.Exec(ctx,
		`INSERT INTO invite_tokens (id, organization_id, invited_by_id, email, role, token, status, expires_at, created_at)
		 VALUES ($1, $2, $3, $4, $5, $6, 'PENDING', $7, NOW())`,
		id, organizationID, managerID, email, r, token, expiresAt,
	)
	if err != nil {
		return nil, fmt.Errorf("create invite: %w", err)
	}

	return &models.InviteResponse{
		ID:         id,
		Email:      email,
		Role:       r,
		Status:     "PENDING",
		ExpiresAt:  expiresAt.Format(time.RFC3339),
		InviteLink: fmt.Sprintf("%s/accept-invite?token=%s", s.webAppURL, token),
	}, nil
}

func (s *InviteService) ValidateInvite(ctx context.Context, token string) (*models.ValidateInviteResponse, error) {
	var invite struct {
		id         string
		email      string
		role       string
		status     string
		expiresAt  time.Time
		orgID      string
		orgName    string
		orgSlug    string
	}

	err := s.pool.QueryRow(ctx,
		`SELECT i.id, i.email, i.role::text, i.status::text, i.expires_at,
		        o.id, o.name, o.slug
		 FROM invite_tokens i
		 JOIN organizations o ON o.id = i.organization_id
		 WHERE i.token = $1`, token,
	).Scan(&invite.id, &invite.email, &invite.role, &invite.status, &invite.expiresAt,
		&invite.orgID, &invite.orgName, &invite.orgSlug)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, errors.New("Invite not found")
		}
		return nil, fmt.Errorf("query invite: %w", err)
	}

	if invite.status != "PENDING" {
		return nil, errors.New("Invite is no longer active")
	}

	if invite.expiresAt.Before(time.Now()) {
		_, _ = s.pool.Exec(ctx, `UPDATE invite_tokens SET status = 'EXPIRED' WHERE id = $1`, invite.id)
		return nil, errors.New("Invite has expired")
	}

	return &models.ValidateInviteResponse{
		Token: token,
		Email: invite.email,
		Role:  models.AuthRole(invite.role),
		Organization: models.OrgResponse{
			ID:   invite.orgID,
			Name: invite.orgName,
			Slug: invite.orgSlug,
		},
		ExpiresAt: invite.expiresAt.Format(time.RFC3339),
	}, nil
}

func (s *InviteService) AcceptInvite(ctx context.Context, token, fullName, password string) (*models.TokenPair, error) {
	// Validate the invite first
	v, err := s.ValidateInvite(ctx, token)
	if err != nil {
		return nil, err
	}

	// Check user doesn't already exist
	var exists bool
	err = s.pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE email = $1)`, v.Email).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("check existing user: %w", err)
	}
	if exists {
		return nil, errors.New("User with this email already exists")
	}

	passwordHash, err := HashPassword(password)
	if err != nil {
		return nil, err
	}

	// Create user and update invite in transaction
	userID := RandomToken(16)
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Get invited_by_id from the invite
	var invitedByID string
	err = tx.QueryRow(ctx, `SELECT invited_by_id FROM invite_tokens WHERE token = $1`, token).Scan(&invitedByID)
	if err != nil {
		return nil, fmt.Errorf("get invited_by: %w", err)
	}

	_, err = tx.Exec(ctx,
		`INSERT INTO users (id, organization_id, full_name, email, password_hash, role, status, invited_by_id, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVE', $7, NOW(), NOW())`,
		userID, v.Organization.ID, strings.TrimSpace(fullName), v.Email, passwordHash, v.Role, invitedByID,
	)
	if err != nil {
		return nil, fmt.Errorf("create user: %w", err)
	}

	_, err = tx.Exec(ctx,
		`UPDATE invite_tokens SET status = 'ACCEPTED', accepted_at = NOW() WHERE token = $1`, token,
	)
	if err != nil {
		return nil, fmt.Errorf("update invite: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, fmt.Errorf("commit tx: %w", err)
	}

	accessToken, err := s.jwt.SignAccessToken(userID, v.Organization.ID, v.Role)
	if err != nil {
		return nil, err
	}

	return &models.TokenPair{
		AccessToken: accessToken,
		User: models.UserResponse{
			ID:             userID,
			FullName:       strings.TrimSpace(fullName),
			Email:          v.Email,
			Role:           v.Role,
			OrganizationID: v.Organization.ID,
		},
		Organization: v.Organization,
	}, nil
}

func (s *InviteService) ListInvites(ctx context.Context, organizationID string) ([]models.InviteResponse, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, email, role::text, status::text, expires_at
		 FROM invite_tokens
		 WHERE organization_id = $1
		 ORDER BY created_at DESC`,
		organizationID,
	)
	if err != nil {
		return nil, fmt.Errorf("list invites: %w", err)
	}
	defer rows.Close()

	var invites []models.InviteResponse
	for rows.Next() {
		var inv models.InviteResponse
		var expiresAt time.Time
		var roleStr string
		if err := rows.Scan(&inv.ID, &inv.Email, &roleStr, &inv.Status, &expiresAt); err != nil {
			return nil, fmt.Errorf("scan invite: %w", err)
		}
		inv.Role = models.AuthRole(roleStr)
		inv.ExpiresAt = expiresAt.Format(time.RFC3339)
		invites = append(invites, inv)
	}
	return invites, nil
}

func (s *InviteService) RevokeInvite(ctx context.Context, organizationID, inviteID string) error {
	tag, err := s.pool.Exec(ctx,
		`UPDATE invite_tokens SET status = 'REVOKED' WHERE id = $1 AND organization_id = $2 AND status = 'PENDING'`,
		inviteID, organizationID,
	)
	if err != nil {
		return fmt.Errorf("revoke invite: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return errors.New("invite not found or already processed")
	}
	return nil
}
