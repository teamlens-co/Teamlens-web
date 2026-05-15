package web

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/teamlens/backend-go/internal/middleware"
	"github.com/teamlens/backend-go/internal/models"
	"github.com/teamlens/backend-go/internal/services"
)

type TeamHandler struct {
	teamSvc *services.TeamService
}

func NewTeamHandler(svc *services.TeamService) *TeamHandler {
	return &TeamHandler{teamSvc: svc}
}

func (h *TeamHandler) Create(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if auth.Role != models.RoleManager {
		middleware.Error(w, http.StatusForbidden, "Forbidden")
		return
	}

	var input models.CreateTeamInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if input.Name == "" {
		middleware.Error(w, http.StatusBadRequest, "Team name is required")
		return
	}

	team, err := h.teamSvc.CreateTeam(r.Context(), input.Name, auth.UserID)
	if err != nil {
		middleware.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.Success(w, http.StatusCreated, team)
}

func (h *TeamHandler) List(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if auth.Role != models.RoleManager {
		middleware.Error(w, http.StatusForbidden, "Forbidden")
		return
	}

	teams, err := h.teamSvc.ListTeams(r.Context(), auth.UserID)
	if err != nil {
		middleware.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	if teams == nil {
		teams = []models.TeamResponse{}
	}

	middleware.Success(w, http.StatusOK, teams)
}

func (h *TeamHandler) Get(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	teamID := r.PathValue("teamId")
	if teamID == "" {
		teamID = r.URL.Query().Get("teamId")
	}
	if teamID == "" {
		middleware.Error(w, http.StatusBadRequest, "Team ID is required")
		return
	}

	team, err := h.teamSvc.GetTeam(r.Context(), teamID, auth.UserID)
	if err != nil {
		middleware.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if team == nil {
		middleware.Error(w, http.StatusNotFound, "Team not found")
		return
	}

	middleware.Success(w, http.StatusOK, team)
}

func (h *TeamHandler) Update(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	teamID := r.PathValue("teamId")
	if teamID == "" {
		middleware.Error(w, http.StatusBadRequest, "Team ID is required")
		return
	}

	var input models.UpdateTeamInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if input.Name == "" {
		middleware.Error(w, http.StatusBadRequest, "Team name is required")
		return
	}

	team, err := h.teamSvc.UpdateTeam(r.Context(), teamID, auth.UserID, input.Name)
	if err != nil {
		middleware.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if team == nil {
		middleware.Error(w, http.StatusNotFound, "Team not found")
		return
	}

	middleware.Success(w, http.StatusOK, team)
}

func (h *TeamHandler) Delete(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	teamID := r.PathValue("teamId")
	if teamID == "" {
		middleware.Error(w, http.StatusBadRequest, "Team ID is required")
		return
	}

	if err := h.teamSvc.DeleteTeam(r.Context(), teamID, auth.UserID); err != nil {
		middleware.Error(w, http.StatusNotFound, err.Error())
		return
	}

	middleware.Success(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *TeamHandler) ListMembers(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	teamID := r.PathValue("teamId")
	if teamID == "" {
		teamID = r.URL.Query().Get("teamId")
	}
	if teamID == "" {
		middleware.Error(w, http.StatusBadRequest, "Team ID is required")
		return
	}

	members, err := h.teamSvc.ListMembers(r.Context(), teamID, auth.UserID)
	if err != nil {
		middleware.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	if members == nil {
		members = []models.UserResponse{}
	}

	middleware.Success(w, http.StatusOK, members)
}

func (h *TeamHandler) AddMember(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if auth.Role != models.RoleManager {
		middleware.Error(w, http.StatusForbidden, "Forbidden")
		return
	}

	teamID := r.PathValue("teamId")
	if teamID == "" {
		middleware.Error(w, http.StatusBadRequest, "Team ID is required")
		return
	}

	var input models.AddMemberInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if input.UserID == "" {
		middleware.Error(w, http.StatusBadRequest, "userId is required")
		return
	}

	result, err := h.teamSvc.AddMember(r.Context(), teamID, auth.UserID, auth.OrganizationID, input.UserID)
	if err != nil {
		msg := err.Error()
		if strings.Contains(msg, "not found") {
			middleware.Error(w, http.StatusNotFound, msg)
			return
		}
		middleware.Error(w, http.StatusInternalServerError, msg)
		return
	}

	middleware.Success(w, http.StatusOK, result)
}

func (h *TeamHandler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if auth.Role != models.RoleManager {
		middleware.Error(w, http.StatusForbidden, "Forbidden")
		return
	}

	teamID := r.PathValue("teamId")
	userID := r.PathValue("userId")
	if teamID == "" || userID == "" {
		middleware.Error(w, http.StatusBadRequest, "Team ID and User ID are required")
		return
	}

	if err := h.teamSvc.RemoveMember(r.Context(), teamID, auth.UserID, userID); err != nil {
		middleware.Error(w, http.StatusNotFound, err.Error())
		return
	}

	middleware.Success(w, http.StatusOK, map[string]string{"status": "removed"})
}

func (h *TeamHandler) GetAnalytics(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	teamID := r.PathValue("teamId")
	if teamID == "" {
		teamID = r.URL.Query().Get("teamId")
	}
	if teamID == "" {
		middleware.Error(w, http.StatusBadRequest, "Team ID is required")
		return
	}

	if auth.Role != models.RoleManager {
		middleware.Error(w, http.StatusForbidden, "Forbidden")
		return
	}

	startStr := r.URL.Query().Get("startDate")
	endStr := r.URL.Query().Get("endDate")
	if startStr == "" || endStr == "" {
		middleware.Error(w, http.StatusBadRequest, "startDate and endDate are required")
		return
	}

	start, err := time.Parse(time.RFC3339, startStr)
	if err != nil {
		start, err = time.Parse("2006-01-02", startStr)
		if err != nil {
			middleware.Error(w, http.StatusBadRequest, "Invalid startDate format")
			return
		}
	}
	end, err := time.Parse(time.RFC3339, endStr)
	if err != nil {
		end, err = time.Parse("2006-01-02", endStr)
		if err != nil {
			middleware.Error(w, http.StatusBadRequest, "Invalid endDate format")
			return
		}
	}

	result, err := h.teamSvc.GetAnalytics(r.Context(), teamID, auth.UserID, start.UTC(), end.UTC())
	if err != nil {
		middleware.Error(w, http.StatusNotFound, err.Error())
		return
	}

	middleware.Success(w, http.StatusOK, result)
}
