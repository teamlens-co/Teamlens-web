package agent

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/teamlens/backend-go/internal/middleware"
	"github.com/teamlens/backend-go/internal/models"
	"github.com/teamlens/backend-go/internal/services"
)

func parseTimeRange(startStr, endStr string) (time.Time, time.Time) {
	start, err := time.Parse(time.RFC3339, startStr)
	if err != nil {
		start, err = time.Parse("2006-01-02", startStr)
		if err != nil {
			return time.Time{}, time.Time{}
		}
	}
	end, err := time.Parse(time.RFC3339, endStr)
	if err != nil {
		end, err = time.Parse("2006-01-02", endStr)
		if err != nil {
			return time.Time{}, time.Time{}
		}
		end = end.Add(24*time.Hour - time.Second)
	}
	return start.UTC(), end.UTC()
}

type ActivityHandler struct {
	activitySvc *services.ActivityService
}

func NewActivityHandler(svc *services.ActivityService) *ActivityHandler {
	return &ActivityHandler{activitySvc: svc}
}

func (h *ActivityHandler) ClockIn(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var input struct {
		Timestamp      *string  `json:"timestamp,omitempty"`
		ActiveAfter    *string  `json:"activeAfter,omitempty"`
		Latitude       *float64 `json:"latitude,omitempty"`
		Longitude      *float64 `json:"longitude,omitempty"`
		LocationSource *string  `json:"locationSource,omitempty"`
		AccuracyMeters *float64 `json:"accuracyMeters,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	payload := &models.ClockInPayload{
		UserID:         auth.UserID,
		Timestamp:      input.Timestamp,
		ActiveAfter:    input.ActiveAfter,
		Latitude:       input.Latitude,
		Longitude:      input.Longitude,
		AccuracyMeters: input.AccuracyMeters,
	}

	session, err := h.activitySvc.ClockIn(r.Context(), payload, auth.OrganizationID)
	if err != nil {
		slog.Error("Clock in failed", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to clock in")
		return
	}

	middleware.Success(w, http.StatusOK, session)
}

func (h *ActivityHandler) ClockOut(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var input struct {
		Timestamp *string `json:"timestamp,omitempty"`
		SessionID *string `json:"sessionId,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	payload := &models.ClockOutPayload{
		UserID:    auth.UserID,
		Timestamp: input.Timestamp,
		SessionID: input.SessionID,
	}

	session, err := h.activitySvc.ClockOut(r.Context(), payload)
	if err != nil {
		slog.Error("Clock out failed", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to clock out")
		return
	}

	if session == nil {
		middleware.Error(w, http.StatusNotFound, "No active session found")
		return
	}

	middleware.Success(w, http.StatusOK, session)
}

func (h *ActivityHandler) GetActiveSession(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	session, err := h.activitySvc.GetActiveSession(r.Context(), auth.UserID)
	if err != nil {
		slog.Error("Get active session failed", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to get active session")
		return
	}

	if session == nil {
		middleware.Success(w, http.StatusOK, nil)
		return
	}

	middleware.Success(w, http.StatusOK, session)
}

func (h *ActivityHandler) PostActivity(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var payload models.ActivityPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		middleware.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	payload.UserID = auth.UserID

	if payload.MouseMoves < 0 || payload.KeyPresses < 0 {
		middleware.Error(w, http.StatusBadRequest, "Mouse moves and key presses must be non-negative")
		return
	}

	result, err := h.activitySvc.CreateActivity(r.Context(), &payload)
	if err != nil {
		slog.Error("Post activity failed", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to log activity")
		return
	}

	middleware.Success(w, http.StatusCreated, result)
}

func (h *ActivityHandler) GetAnalytics(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	userID := r.URL.Query().Get("userId")
	if userID == "" {
		userID = auth.UserID
	}

	startStr := r.URL.Query().Get("startDate")
	endStr := r.URL.Query().Get("endDate")
	if startStr == "" || endStr == "" {
		middleware.Error(w, http.StatusBadRequest, "startDate and endDate are required")
		return
	}

	start, end := parseTimeRange(startStr, endStr)
	if start.IsZero() || end.IsZero() {
		middleware.Error(w, http.StatusBadRequest, "Invalid date format (use RFC3339 or YYYY-MM-DD)")
		return
	}

	result, err := h.activitySvc.GetAnalytics(r.Context(), userID, start, end)
	if err != nil {
		slog.Error("Get analytics failed", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to fetch analytics")
		return
	}

	middleware.Success(w, http.StatusOK, result)
}
