package web

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/teamlens/backend-go/internal/middleware"
	"github.com/teamlens/backend-go/internal/models"
	"github.com/teamlens/backend-go/internal/services"
)

type AuthHandler struct {
	authSvc *services.AuthService
}

func NewAuthHandler(authSvc *services.AuthService) *AuthHandler {
	return &AuthHandler{authSvc: authSvc}
}

func (h *AuthHandler) Signup(w http.ResponseWriter, r *http.Request) {
	var input struct {
		FullName         string `json:"fullName" validate:"required,min=1,max=200"`
		Email            string `json:"email" validate:"required,email"`
		Password         string `json:"password" validate:"required,min=8"`
		OrganizationName string `json:"organizationName" validate:"required,min=1,max=200"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	input.FullName = strings.TrimSpace(input.FullName)
	input.Email = strings.TrimSpace(input.Email)
	input.OrganizationName = strings.TrimSpace(input.OrganizationName)

	if input.FullName == "" || input.Email == "" || input.Password == "" || input.OrganizationName == "" {
		middleware.Error(w, http.StatusBadRequest, "All fields are required")
		return
	}

	if len(input.Password) < 8 {
		middleware.Error(w, http.StatusBadRequest, "Password must be at least 8 characters")
		return
	}

	result, err := h.authSvc.SignupManager(r.Context(), struct {
		FullName         string
		Email            string
		Password         string
		OrganizationName string
	}{
		FullName:         input.FullName,
		Email:            input.Email,
		Password:         input.Password,
		OrganizationName: input.OrganizationName,
	})
	if err != nil {
		msg := err.Error()
		if strings.Contains(msg, "already registered") {
			middleware.Error(w, http.StatusConflict, msg)
			return
		}
		middleware.Error(w, http.StatusInternalServerError, msg)
		return
	}

	middleware.Success(w, http.StatusCreated, result)
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email    string `json:"email" validate:"required,email"`
		Password string `json:"password" validate:"required"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if input.Email == "" || input.Password == "" {
		middleware.Error(w, http.StatusBadRequest, "Email and password are required")
		return
	}

	result, err := h.authSvc.Login(r.Context(), input.Email, input.Password)
	if err != nil {
		msg := err.Error()
		if strings.Contains(msg, "Invalid") {
			middleware.Error(w, http.StatusUnauthorized, msg)
			return
		}
		middleware.Error(w, http.StatusInternalServerError, msg)
		return
	}

	middleware.Success(w, http.StatusOK, result)
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	user, err := h.authSvc.Me(r.Context(), auth.UserID)
	if err != nil {
		middleware.Error(w, http.StatusNotFound, err.Error())
		return
	}

	middleware.Success(w, http.StatusOK, user)
}

func (h *AuthHandler) GenerateAgentToken(w http.ResponseWriter, r *http.Request) {
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
		UserID string `json:"userId" validate:"required"`
		Label  string `json:"label"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	user, err := h.authSvc.GetUserByID(r.Context(), input.UserID)
	if err != nil {
		middleware.Error(w, http.StatusNotFound, "User not found")
		return
	}

	if user.OrganizationID != auth.OrganizationID {
		middleware.Error(w, http.StatusForbidden, "Forbidden")
		return
	}

	var label *string
	if input.Label != "" {
		label = &input.Label
	}

	result, err := h.authSvc.CreateAgentConnectToken(r.Context(), input.UserID, auth.OrganizationID, user.Role, label)
	if err != nil {
		middleware.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.Success(w, http.StatusCreated, result)
}

func (h *AuthHandler) ListUsers(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	users, err := h.authSvc.GetTeamUsers(r.Context(), auth.OrganizationID)
	if err != nil {
		middleware.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.Success(w, http.StatusOK, users)
}

func (h *AuthHandler) DeleteEmployee(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if auth.Role != models.RoleManager {
		middleware.Error(w, http.StatusForbidden, "Forbidden")
		return
	}

	employeeID := r.PathValue("employeeId")
	if employeeID == "" {
		middleware.Error(w, http.StatusBadRequest, "Employee ID is required")
		return
	}

	user, err := h.authSvc.DeleteEmployee(r.Context(), auth.OrganizationID, employeeID)
	if err != nil {
		middleware.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	if user == nil {
		middleware.Error(w, http.StatusNotFound, "Employee not found")
		return
	}

	middleware.Success(w, http.StatusOK, user)
}
