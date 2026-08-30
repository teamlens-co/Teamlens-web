package agent

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/teamlens/backend-go/internal/middleware"
	"github.com/teamlens/backend-go/internal/models"
	"github.com/teamlens/backend-go/internal/services"
)

// TrackingHandler serves the client side of field tracking. It is mounted under
// both /api/agent and /api/mobile so the desktop agent and the phone app speak
// the same protocol.
type TrackingHandler struct {
	trackingSvc *services.TrackingService
}

func NewTrackingHandler(svc *services.TrackingService) *TrackingHandler {
	return &TrackingHandler{trackingSvc: svc}
}

// PostPings ingests a batch of location breadcrumbs for the caller's open
// session. Clients buffer breadcrumbs while offline and flush them here; the
// endpoint is idempotent so a retried batch does not double-count distance.
func (h *TrackingHandler) PostPings(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var batch models.LocationPingBatch
	if err := json.NewDecoder(r.Body).Decode(&batch); err != nil {
		middleware.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	result, err := h.trackingSvc.RecordPings(r.Context(), auth.UserID, auth.OrganizationID, &batch)
	if err != nil {
		if errors.Is(err, services.ErrNoActiveSession) {
			middleware.Error(w, http.StatusConflict, "Not clocked in")
			return
		}
		slog.Error("Record location pings failed", "error", err, "userId", auth.UserID)
		middleware.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	middleware.Success(w, http.StatusCreated, result)
}

// GetSettings tells the client whether to track at all and how often to report,
// so tracking cadence is controlled by the org rather than baked into the app.
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
