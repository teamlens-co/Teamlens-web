package agent

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/teamlens/backend-go/internal/middleware"
	"github.com/teamlens/backend-go/internal/models"
	"github.com/teamlens/backend-go/internal/services"
)

type UsageHandler struct {
	usageSvc *services.UsageService
}

func NewUsageHandler(svc *services.UsageService) *UsageHandler {
	return &UsageHandler{usageSvc: svc}
}

func (h *UsageHandler) CreateUsageLog(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var input struct {
		AppName        string     `json:"appName"`
		WindowTitle    *string    `json:"windowTitle,omitempty"`
		Domain         *string    `json:"domain,omitempty"`
		URL            *string    `json:"url,omitempty"`
		DurationSeconds int       `json:"durationSeconds"`
		IdleSeconds    int        `json:"idleSeconds"`
		IsIdle         bool       `json:"isIdle"`
		SessionID      *string    `json:"sessionId,omitempty"`
		CapturedAt     string     `json:"capturedAt,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if input.AppName == "" {
		middleware.Error(w, http.StatusBadRequest, "appName is required")
		return
	}

	capturedAt := time.Now().UTC()
	if input.CapturedAt != "" {
		if t, err := time.Parse(time.RFC3339, input.CapturedAt); err == nil {
			capturedAt = t
		}
	}

	payload := &models.UsageLogPayload{
		OrganizationID:  auth.OrganizationID,
		UserID:          auth.UserID,
		SessionID:       input.SessionID,
		AppName:         input.AppName,
		WindowTitle:     input.WindowTitle,
		Domain:          input.Domain,
		URL:             input.URL,
		DurationSeconds: input.DurationSeconds,
		IdleSeconds:     input.IdleSeconds,
		IsIdle:          input.IsIdle,
		CapturedAt:      capturedAt,
	}

	result, err := h.usageSvc.CreateUsageLog(r.Context(), payload)
	if err != nil {
		slog.Error("Failed to create usage log", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to log activity usage")
		return
	}

	middleware.Success(w, http.StatusCreated, result)
}

func (h *UsageHandler) GetUsageReport(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	userID := r.URL.Query().Get("userId")
	teamID := r.URL.Query().Get("teamId")
	groupBy := r.URL.Query().Get("groupBy")
	if groupBy == "" {
		groupBy = "total"
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
	end = end.Add(24*time.Hour - time.Second)

	var uID, tID *string
	if userID != "" {
		uID = &userID
	}
	if teamID != "" {
		tID = &teamID
	}

	report, err := h.usageSvc.GetUsageReport(r.Context(), struct {
		OrganizationID string
		UserID         *string
		TeamID         *string
		Start          time.Time
		End            time.Time
		GroupBy        string
	}{
		OrganizationID: auth.OrganizationID,
		UserID:         uID,
		TeamID:         tID,
		Start:          start.UTC(),
		End:            end.UTC(),
		GroupBy:        groupBy,
	})
	if err != nil {
		slog.Error("Failed to get usage report", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to fetch usage report")
		return
	}

	middleware.Success(w, http.StatusOK, report)
}

func (h *UsageHandler) UpsertRule(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var input struct {
		TargetType  string `json:"targetType"`
		TargetValue string `json:"targetValue"`
		Category    string `json:"category"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if input.TargetType == "" || input.TargetValue == "" || input.Category == "" {
		middleware.Error(w, http.StatusBadRequest, "targetType, targetValue, and category are required")
		return
	}

	allowedTypes := map[string]bool{"APP": true, "DOMAIN": true, "URL": true}
	allowedCats := map[string]bool{"PRODUCTIVE": true, "UNPRODUCTIVE": true, "NEUTRAL": true}

	if !allowedTypes[strings.ToUpper(input.TargetType)] {
		middleware.Error(w, http.StatusBadRequest, "Invalid targetType (use APP, DOMAIN, or URL)")
		return
	}
	if !allowedCats[strings.ToUpper(input.Category)] {
		middleware.Error(w, http.StatusBadRequest, "Invalid category (use PRODUCTIVE, UNPRODUCTIVE, or NEUTRAL)")
		return
	}

	rule, err := h.usageSvc.UpsertRule(r.Context(), auth.OrganizationID, &models.UpsertRuleInput{
		TargetType:  models.ActivityTargetType(strings.ToUpper(input.TargetType)),
		TargetValue: input.TargetValue,
		Category:    models.ActivityCategory(strings.ToUpper(input.Category)),
	})
	if err != nil {
		slog.Error("Failed to upsert rule", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to save rule")
		return
	}

	middleware.Success(w, http.StatusCreated, rule)
}

func (h *UsageHandler) ListRules(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	rules, err := h.usageSvc.ListRules(r.Context(), auth.OrganizationID)
	if err != nil {
		slog.Error("Failed to list rules", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to fetch rules")
		return
	}

	if rules == nil {
		rules = []models.ClassificationRule{}
	}

	middleware.Success(w, http.StatusOK, rules)
}

func (h *UsageHandler) DeleteRule(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	ruleID := r.PathValue("ruleId")
	if ruleID == "" {
		middleware.Error(w, http.StatusBadRequest, "Rule ID is required")
		return
	}

	if err := h.usageSvc.DeleteRule(r.Context(), auth.OrganizationID, ruleID); err != nil {
		slog.Error("Failed to delete rule", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to delete rule")
		return
	}

	middleware.Success(w, http.StatusOK, map[string]string{"status": "deleted"})
}
