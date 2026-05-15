package agent

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/teamlens/backend-go/internal/middleware"
	"github.com/teamlens/backend-go/internal/services"
)

type AuthHandler struct {
	agentAuthSvc *services.AgentAuthService
}

func NewAuthHandler(svc *services.AgentAuthService) *AuthHandler {
	return &AuthHandler{agentAuthSvc: svc}
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email       string  `json:"email"`
		Password    string  `json:"password"`
		DeviceLabel *string `json:"deviceLabel,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if input.Email == "" || input.Password == "" {
		middleware.Error(w, http.StatusBadRequest, "Email and password are required")
		return
	}

	if len(input.Password) < 8 {
		middleware.Error(w, http.StatusBadRequest, "Password must be at least 8 characters")
		return
	}

	result, err := h.agentAuthSvc.Login(r.Context(), input.Email, input.Password, input.DeviceLabel)
	if err != nil {
		msg := err.Error()
		if strings.Contains(msg, "Invalid") || strings.Contains(msg, "not active") || strings.Contains(msg, "only available") {
			middleware.Error(w, http.StatusUnauthorized, msg)
			return
		}
		middleware.Error(w, http.StatusInternalServerError, msg)
		return
	}

	middleware.Success(w, http.StatusOK, result)
}
