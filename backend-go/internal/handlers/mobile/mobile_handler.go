package mobile

import (
	"log/slog"
	"net/http"

	"github.com/teamlens/backend-go/internal/middleware"
	"github.com/teamlens/backend-go/internal/models"
	"github.com/teamlens/backend-go/internal/services"
)

type Handler struct {
	activitySvc *services.ActivityService
	locationSvc *services.LocationService
	trackingSvc *services.TrackingService
}

func NewHandler(
	activitySvc *services.ActivityService,
	locationSvc *services.LocationService,
	trackingSvc *services.TrackingService,
) *Handler {
	return &Handler{
		activitySvc: activitySvc,
		locationSvc: locationSvc,
		trackingSvc: trackingSvc,
	}
}

func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	middleware.Success(w, http.StatusOK, map[string]interface{}{
		"module":  "mobile",
		"message": "Mobile module ready",
	})
}

// BootstrapResponse is everything the phone app needs on a cold start: whether a
// shift is already running, how often to report location, and where the office
// geofences are so it can draw them and pre-check clock-in locally.
type BootstrapResponse struct {
	UserID          string                    `json:"userId"`
	OrganizationID  string                    `json:"organizationId"`
	Role            models.AuthRole           `json:"role"`
	ActiveSession   *models.WorkSessionRecord `json:"activeSession"`
	Tracking        *models.TrackingSettings  `json:"tracking"`
	OfficeLocations []models.OfficeLocation   `json:"officeLocations"`
}

// Bootstrap collapses the app's startup round trips into one request, which
// matters on a phone that may be on a weak mobile connection.
func (h *Handler) Bootstrap(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	session, err := h.activitySvc.GetActiveSession(r.Context(), auth.UserID)
	if err != nil {
		slog.Error("Mobile bootstrap: active session failed", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to load session")
		return
	}

	tracking, err := h.trackingSvc.GetSettings(r.Context(), auth.OrganizationID)
	if err != nil {
		slog.Error("Mobile bootstrap: tracking settings failed", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to load tracking settings")
		return
	}

	offices, err := h.locationSvc.ListOfficeLocations(r.Context(), auth.OrganizationID)
	if err != nil {
		slog.Error("Mobile bootstrap: office locations failed", "error", err)
		offices = nil
	}
	if offices == nil {
		offices = []models.OfficeLocation{}
	}

	middleware.Success(w, http.StatusOK, BootstrapResponse{
		UserID:          auth.UserID,
		OrganizationID:  auth.OrganizationID,
		Role:            auth.Role,
		ActiveSession:   session,
		Tracking:        tracking,
		OfficeLocations: offices,
	})
}
