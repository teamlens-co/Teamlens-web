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

type TeamService struct {
	pool             *pgxpool.Pool
	dashboardService *DashboardService
}

func NewTeamService(pool *pgxpool.Pool, dashSvc *DashboardService) *TeamService {
	return &TeamService{pool: pool, dashboardService: dashSvc}
}

func (s *TeamService) CreateTeam(ctx context.Context, name, managerID string) (*models.TeamResponse, error) {
	id := RandomToken(16)

	var team models.TeamResponse
	err := s.pool.QueryRow(ctx,
		`INSERT INTO teams (id, name, manager_id, created_at)
		 VALUES ($1, $2, $3, NOW())
		 RETURNING id, name, manager_id, created_at`,
		id, strings.TrimSpace(name), managerID,
	).Scan(&team.ID, &team.Name, &team.ManagerID, &team.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("create team: %w", err)
	}
	team.MemberCount = 0
	team.Members = []models.UserResponse{}

	return &team, nil
}

func (s *TeamService) ListTeams(ctx context.Context, managerID string) ([]models.TeamResponse, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT t.id, t.name, t.manager_id, t.created_at,
		        COUNT(tm.id)::int AS member_count
		 FROM teams t
		 LEFT JOIN team_memberships tm ON tm.team_id = t.id
		 WHERE t.manager_id = $1
		 GROUP BY t.id
		 ORDER BY t.created_at DESC`,
		managerID,
	)
	if err != nil {
		return nil, fmt.Errorf("list teams: %w", err)
	}
	defer rows.Close()

	var teams []models.TeamResponse
	for rows.Next() {
		var team models.TeamResponse
		if err := rows.Scan(&team.ID, &team.Name, &team.ManagerID, &team.CreatedAt, &team.MemberCount); err != nil {
			return nil, fmt.Errorf("scan team: %w", err)
		}
		members, _ := s.ListMembersForTeam(ctx, team.ID)
		team.Members = members
		teams = append(teams, team)
	}
	return teams, nil
}

func (s *TeamService) GetTeam(ctx context.Context, teamID, managerID string) (*models.TeamResponse, error) {
	team, err := s.getOwnedTeam(ctx, teamID, managerID)
	if err != nil {
		return nil, err
	}
	if team == nil {
		return nil, nil
	}

	members, err := s.ListMembers(ctx, teamID, managerID)
	if err != nil {
		return nil, err
	}
	team.Members = members
	if members != nil {
		team.MemberCount = len(members)
	}

	return team, nil
}

func (s *TeamService) UpdateTeam(ctx context.Context, teamID, managerID, name string) (*models.TeamResponse, error) {
	_, err := s.pool.Exec(ctx,
		`UPDATE teams SET name = $1 WHERE id = $2 AND manager_id = $3`,
		strings.TrimSpace(name), teamID, managerID,
	)
	if err != nil {
		return nil, fmt.Errorf("update team: %w", err)
	}
	return s.GetTeam(ctx, teamID, managerID)
}

func (s *TeamService) DeleteTeam(ctx context.Context, teamID, managerID string) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM teams WHERE id = $1 AND manager_id = $2`,
		teamID, managerID,
	)
	if err != nil {
		return fmt.Errorf("delete team: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return errors.New("team not found")
	}
	return nil
}

func (s *TeamService) AddMember(ctx context.Context, teamID, managerID, organizationID, userID string) (*struct {
	Members []models.UserResponse
}, error) {
	team, err := s.getOwnedTeam(ctx, teamID, managerID)
	if err != nil || team == nil {
		return nil, errors.New("team not found")
	}

	// Verify user exists in this org and is active
	var exists bool
	err = s.pool.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM users WHERE id = $1 AND organization_id = $2 AND status = 'ACTIVE')`,
		userID, organizationID,
	).Scan(&exists)
	if err != nil {
		return nil, fmt.Errorf("check user: %w", err)
	}
	if !exists {
		return nil, errors.New("user not found")
	}

	_, err = s.pool.Exec(ctx,
		`INSERT INTO team_memberships (id, team_id, user_id)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (team_id, user_id) DO NOTHING`,
		RandomToken(16), teamID, userID,
	)
	if err != nil {
		return nil, fmt.Errorf("add member: %w", err)
	}

	members, err := s.ListMembers(ctx, teamID, managerID)
	if err != nil {
		return nil, err
	}

	return &struct{ Members []models.UserResponse }{Members: members}, nil
}

func (s *TeamService) RemoveMember(ctx context.Context, teamID, managerID, userID string) error {
	team, err := s.getOwnedTeam(ctx, teamID, managerID)
	if err != nil || team == nil {
		return errors.New("team not found")
	}

	_, err = s.pool.Exec(ctx,
		`DELETE FROM team_memberships WHERE team_id = $1 AND user_id = $2`,
		teamID, userID,
	)
	if err != nil {
		return fmt.Errorf("remove member: %w", err)
	}
	return nil
}

func (s *TeamService) ListMembers(ctx context.Context, teamID, managerID string) ([]models.UserResponse, error) {
	team, err := s.getOwnedTeam(ctx, teamID, managerID)
	if err != nil || team == nil {
		return nil, nil
	}
	return s.ListMembersForTeam(ctx, teamID)
}

func (s *TeamService) ListMembersForTeam(ctx context.Context, teamID string) ([]models.UserResponse, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT u.id, u.full_name, u.email, u.role, u.status
		 FROM team_memberships tm
		 JOIN users u ON u.id = tm.user_id
		 WHERE tm.team_id = $1
		 ORDER BY u.full_name ASC`,
		teamID,
	)
	if err != nil {
		return nil, fmt.Errorf("list members: %w", err)
	}
	defer rows.Close()

	var members []models.UserResponse
	for rows.Next() {
		var m models.UserResponse
		if err := rows.Scan(&m.ID, &m.FullName, &m.Email, &m.Role, &m.Status); err != nil {
			return nil, fmt.Errorf("scan member: %w", err)
		}
		members = append(members, m)
	}
	return members, nil
}

func (s *TeamService) GetAnalytics(ctx context.Context, teamID, managerID string, start, end time.Time) (*models.TeamAnalytics, error) {
	team, err := s.getOwnedTeam(ctx, teamID, managerID)
	if err != nil || team == nil {
		return nil, errors.New("team not found")
	}

	members, err := s.ListMembers(ctx, teamID, managerID)
	if err != nil || members == nil {
		return nil, errors.New("team not found")
	}

	var memberAnalytics []models.TeamMemberAnalytics
	var totalActiveSeconds, totalTrackedSeconds, totalMeasuredWorkSeconds int64

	for _, m := range members {
		analytics, err := s.dashboardService.GetAnalytics(ctx, m.ID, start, end)
		if err != nil {
			continue
		}

		trackedSec := analytics.WorkSeconds + analytics.ManualSeconds
		ma := models.TeamMemberAnalytics{
			UserID:             m.ID,
			FullName:           m.FullName,
			Email:              m.Email,
			ActiveSeconds:      analytics.ActiveSeconds,
			TrackedSeconds:     trackedSec,
			WorkSeconds:        analytics.WorkSeconds,
			ManualSeconds:      analytics.ManualSeconds,
			ProductivityPercent: analytics.ProductivityPercent,
		}
		memberAnalytics = append(memberAnalytics, ma)
		totalActiveSeconds += ma.ActiveSeconds
		totalTrackedSeconds += ma.TrackedSeconds
		totalMeasuredWorkSeconds += analytics.WorkSeconds
	}

	avgActivityPct := 0
	if totalMeasuredWorkSeconds > 0 {
		avgActivityPct = int(maRound(float64(totalActiveSeconds) * 100 / float64(totalMeasuredWorkSeconds)))
	}

	return &models.TeamAnalytics{
		Team:               *team,
		Start:              start.Format(time.RFC3339),
		End:                end.Format(time.RFC3339),
		MemberCount:        len(members),
		TotalActiveSeconds: totalActiveSeconds,
		TotalTrackedSeconds: totalTrackedSeconds,
		AvgActivityPercent: avgActivityPct,
		Members:            memberAnalytics,
	}, nil
}

func (s *TeamService) getOwnedTeam(ctx context.Context, teamID, managerID string) (*models.TeamResponse, error) {
	var team models.TeamResponse
	err := s.pool.QueryRow(ctx,
		`SELECT t.id, t.name, t.manager_id, t.created_at,
		        COUNT(tm.id)::int AS member_count
		 FROM teams t
		 LEFT JOIN team_memberships tm ON tm.team_id = t.id
		 WHERE t.id = $1 AND t.manager_id = $2
		 GROUP BY t.id
		 LIMIT 1`,
		teamID, managerID,
	).Scan(&team.ID, &team.Name, &team.ManagerID, &team.CreatedAt, &team.MemberCount)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, fmt.Errorf("get owned team: %w", err)
	}
	return &team, nil
}

func maRound(f float64) float64 {
	return float64(int(f + 0.5))
}
