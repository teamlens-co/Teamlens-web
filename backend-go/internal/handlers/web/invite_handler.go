package web

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/teamlens/backend-go/internal/middleware"
	"github.com/teamlens/backend-go/internal/models"
	"github.com/teamlens/backend-go/internal/services"
)

type InviteHandler struct {
	inviteSvc *services.InviteService
}

func NewInviteHandler(svc *services.InviteService) *InviteHandler {
	return &InviteHandler{inviteSvc: svc}
}

func (h *InviteHandler) CreateInvite(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if auth.Role != models.RoleManager {
		middleware.Error(w, http.StatusForbidden, "Forbidden")
		return
	}

	var input struct {
		Email string          `json:"email"`
		Role  *models.AuthRole `json:"role"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if input.Email == "" {
		middleware.Error(w, http.StatusBadRequest, "Email is required")
		return
	}

	result, err := h.inviteSvc.CreateInvite(r.Context(), auth.UserID, auth.OrganizationID, input.Email, input.Role)
	if err != nil {
		msg := err.Error()
		if strings.Contains(msg, "already invited") || strings.Contains(msg, "already registered") {
			middleware.Error(w, http.StatusConflict, msg)
			return
		}
		middleware.Error(w, http.StatusInternalServerError, msg)
		return
	}

	middleware.Success(w, http.StatusCreated, result)
}

func (h *InviteHandler) ListInvites(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if auth.Role != models.RoleManager {
		middleware.Error(w, http.StatusForbidden, "Forbidden")
		return
	}

	invites, err := h.inviteSvc.ListInvites(r.Context(), auth.OrganizationID)
	if err != nil {
		middleware.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	if invites == nil {
		invites = []models.InviteResponse{}
	}

	middleware.Success(w, http.StatusOK, invites)
}

func (h *InviteHandler) RevokeInvite(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if auth.Role != models.RoleManager {
		middleware.Error(w, http.StatusForbidden, "Forbidden")
		return
	}

	inviteID := r.PathValue("inviteId")
	if inviteID == "" {
		middleware.Error(w, http.StatusBadRequest, "Invite ID is required")
		return
	}

	if err := h.inviteSvc.RevokeInvite(r.Context(), auth.OrganizationID, inviteID); err != nil {
		middleware.Error(w, http.StatusNotFound, err.Error())
		return
	}

	middleware.Success(w, http.StatusOK, map[string]string{"status": "revoked"})
}

func (h *InviteHandler) ValidateInvite(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		middleware.Error(w, http.StatusBadRequest, "Token is required")
		return
	}

	result, err := h.inviteSvc.ValidateInvite(r.Context(), token)
	if err != nil {
		msg := err.Error()
		if strings.Contains(msg, "not found") || strings.Contains(msg, "expired") || strings.Contains(msg, "active") {
			middleware.Error(w, http.StatusNotFound, msg)
			return
		}
		middleware.Error(w, http.StatusInternalServerError, msg)
		return
	}

	middleware.Success(w, http.StatusOK, result)
}

func (h *InviteHandler) AcceptInvite(w http.ResponseWriter, r *http.Request) {
	var input models.AcceptInviteInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if input.FullName == "" || input.Password == "" || input.Token == "" {
		middleware.Error(w, http.StatusBadRequest, "fullName, password, and token are required")
		return
	}

	if len(input.Password) < 8 {
		middleware.Error(w, http.StatusBadRequest, "Password must be at least 8 characters")
		return
	}

	result, err := h.inviteSvc.AcceptInvite(r.Context(), input.Token, input.FullName, input.Password)
	if err != nil {
		msg := err.Error()
		if strings.Contains(msg, "not found") || strings.Contains(msg, "expired") || strings.Contains(msg, "exists") {
			middleware.Error(w, http.StatusBadRequest, msg)
			return
		}
		middleware.Error(w, http.StatusInternalServerError, msg)
		return
	}

	middleware.Success(w, http.StatusOK, result)
}
