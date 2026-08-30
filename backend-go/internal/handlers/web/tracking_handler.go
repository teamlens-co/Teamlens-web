package web

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/teamlens/backend-go/internal/middleware"
	"github.com/teamlens/backend-go/internal/models"
	"github.com/teamlens/backend-go/internal/services"
)

// TrackingHandler serves the manager-facing field tracking views: the live map,
// per-session route replay, and the travel summary table.
type TrackingHandler struct {
	trackingSvc *services.TrackingService
}

func NewTrackingHandler(svc *services.TrackingService) *TrackingHandler {
	return &TrackingHandler{trackingSvc: svc}
}

// GetLive returns the last known position of everyone currently clocked in.
func (h *TrackingHandler) GetLive(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	locations, err := h.trackingSvc.GetLiveLocations(r.Context(), auth.OrganizationID)
	if err != nil {
		slog.Error("Get live locations failed", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to load live locations")
		return
	}

	middleware.Success(w, http.StatusOK, locations)
}

// GetSessionTrack returns the breadcrumb trail, detected stops, and travel
// totals for one work session.
func (h *TrackingHandler) GetSessionTrack(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	sessionID := r.PathValue("sessionId")
	if sessionID == "" {
		middleware.Error(w, http.StatusBadRequest, "Session ID is required")
		return
	}

	// Employees may replay their own day; anyone else needs a manager role.
	track, err := h.trackingSvc.GetSessionTrack(r.Context(), auth.OrganizationID, sessionID)
	if err != nil {
		middleware.Error(w, http.StatusNotFound, "Session not found")
		return
	}
	if auth.Role != models.RoleManager && track.UserID != auth.UserID {
		middleware.Error(w, http.StatusForbidden, "Forbidden")
		return
	}

	middleware.Success(w, http.StatusOK, track)
}

// ListSessions returns shifts in a range so a manager can pick one to replay,
// including shifts that have already ended.
func (h *TrackingHandler) ListSessions(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	start, end, ok := parseTrackingRange(r)
	if !ok {
		middleware.Error(w, http.StatusBadRequest, "Invalid date format (use RFC3339 or YYYY-MM-DD)")
		return
	}

	userID := r.URL.Query().Get("userId")
	// Employees may only ever list their own shifts.
	if auth.Role != models.RoleManager {
		userID = auth.UserID
	}

	sessions, err := h.trackingSvc.ListSessions(r.Context(), auth.OrganizationID, start, end, userID)
	if err != nil {
		slog.Error("List tracked sessions failed", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to load sessions")
		return
	}

	middleware.Success(w, http.StatusOK, sessions)
}

// GetSummary aggregates distance, steps, and stops per employee over a range.
func (h *TrackingHandler) GetSummary(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if auth.Role != models.RoleManager {
		middleware.Error(w, http.StatusForbidden, "Forbidden")
		return
	}

	start, end, ok := parseTrackingRange(r)
	if !ok {
		middleware.Error(w, http.StatusBadRequest, "Invalid date format (use RFC3339 or YYYY-MM-DD)")
		return
	}

	summary, err := h.trackingSvc.GetFieldSummary(r.Context(), auth.OrganizationID, start, end)
	if err != nil {
		slog.Error("Get field summary failed", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to load field summary")
		return
	}

	middleware.Success(w, http.StatusOK, summary)
}

func (h *TrackingHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	settings, err := h.trackingSvc.GetSettings(r.Context(), auth.OrganizationID)
	if err != nil {
		slog.Error("Get tracking settings failed", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to load tracking settings")
		return
	}

	middleware.Success(w, http.StatusOK, settings)
}

func (h *TrackingHandler) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if auth.Role != models.RoleManager {
		middleware.Error(w, http.StatusForbidden, "Forbidden")
		return
	}

	var input models.UpdateTrackingSettingsInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	settings, err := h.trackingSvc.UpdateSettings(r.Context(), auth.OrganizationID, &input)
	if err != nil {
		middleware.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	middleware.Success(w, http.StatusOK, settings)
}

// parseTrackingRange reads startDate/endDate, defaulting to the last 7 days so
// the dashboard can load without arguments.
func parseTrackingRange(r *http.Request) (time.Time, time.Time, bool) {
	startStr := r.URL.Query().Get("startDate")
	endStr := r.URL.Query().Get("endDate")

	if startStr == "" && endStr == "" {
		end := time.Now().UTC()
		return end.AddDate(0, 0, -7), end, true
	}

	start, ok := parseFlexibleDate(startStr, false)
	if !ok {
		return time.Time{}, time.Time{}, false
	}
	end, ok := parseFlexibleDate(endStr, true)
	if !ok {
		return time.Time{}, time.Time{}, false
	}

	return start, end, true
}

func parseFlexibleDate(raw string, endOfDay bool) (time.Time, bool) {
	if t, err := time.Parse(time.RFC3339, raw); err == nil {
		return t.UTC(), true
	}
	if t, err := time.Parse("2006-01-02", raw); err == nil {
		if endOfDay {
			t = t.Add(24*time.Hour - time.Second)
		}
		return t.UTC(), true
	}
	return time.Time{}, false
}
