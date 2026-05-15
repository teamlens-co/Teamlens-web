package web

import (
	"encoding/json"
	"net/http"

	"github.com/teamlens/backend-go/internal/middleware"
	"github.com/teamlens/backend-go/internal/models"
	"github.com/teamlens/backend-go/internal/services"
)

type LocationHandler struct {
	locationSvc *services.LocationService
}

func NewLocationHandler(svc *services.LocationService) *LocationHandler {
	return &LocationHandler{locationSvc: svc}
}

func (h *LocationHandler) SearchLocations(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	query := r.URL.Query().Get("query")
	if query == "" {
		middleware.Error(w, http.StatusBadRequest, "Query parameter is required")
		return
	}

	results, err := h.locationSvc.SearchLocations(r.Context(), query)
	if err != nil {
		middleware.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.Success(w, http.StatusOK, results)
}

func (h *LocationHandler) ListOfficeLocations(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	locations, err := h.locationSvc.ListOfficeLocations(r.Context(), auth.OrganizationID)
	if err != nil {
		middleware.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	if locations == nil {
		locations = []models.OfficeLocation{}
	}

	middleware.Success(w, http.StatusOK, locations)
}

func (h *LocationHandler) UpsertOfficeLocation(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if auth.Role != models.RoleManager {
		middleware.Error(w, http.StatusForbidden, "Forbidden")
		return
	}

	var input models.UpsertOfficeLocationInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if input.Label == "" || input.RadiusMeters <= 0 {
		middleware.Error(w, http.StatusBadRequest, "Label and radiusMeters are required")
		return
	}

	location, err := h.locationSvc.UpsertOfficeLocation(r.Context(), auth.OrganizationID, &input)
	if err != nil {
		middleware.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.Success(w, http.StatusOK, location)
}

func (h *LocationHandler) DeleteOfficeLocation(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	if auth.Role != models.RoleManager {
		middleware.Error(w, http.StatusForbidden, "Forbidden")
		return
	}

	locationID := r.PathValue("locationId")
	if locationID == "" {
		middleware.Error(w, http.StatusBadRequest, "Location ID is required")
		return
	}

	if err := h.locationSvc.DeleteOfficeLocation(r.Context(), auth.OrganizationID, locationID); err != nil {
		middleware.Error(w, http.StatusNotFound, err.Error())
		return
	}

	middleware.Success(w, http.StatusOK, map[string]string{"status": "deleted"})
}
