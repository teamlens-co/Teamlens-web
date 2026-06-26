package web

import (
	"encoding/json"
	"net/http"

	"github.com/teamlens/backend-go/internal/middleware"
	"github.com/teamlens/backend-go/internal/services"
)

type LeaveHandler struct {
	leaveSvc *services.LeaveService
}

func NewLeaveHandler(svc *services.LeaveService) *LeaveHandler {
	return &LeaveHandler{leaveSvc: svc}
}

// GetLeaveTypes handles GET /api/web/leaves/types
func (h *LeaveHandler) GetLeaveTypes(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	types, err := h.leaveSvc.GetLeaveTypes(r.Context(), auth.OrganizationID)
	if err != nil {
		middleware.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.Success(w, http.StatusOK, types)
}

// CreateLeaveType handles POST /api/web/leaves/types
func (h *LeaveHandler) CreateLeaveType(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var input struct {
		Name    string `json:"name"`
		MaxDays int    `json:"maxDays"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if input.Name == "" || input.MaxDays <= 0 {
		middleware.Error(w, http.StatusBadRequest, "name and positive maxDays are required")
		return
	}

	lt, err := h.leaveSvc.CreateLeaveType(r.Context(), auth.OrganizationID, input.Name, input.MaxDays)
	if err != nil {
		middleware.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.Success(w, http.StatusCreated, lt)
}

// GetLeaveBalances handles GET /api/web/leaves/balances
func (h *LeaveHandler) GetLeaveBalances(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	userID := r.URL.Query().Get("userId")
	if userID == "" {
		userID = auth.UserID
	}

	balances, err := h.leaveSvc.GetLeaveBalances(r.Context(), userID, auth.OrganizationID)
	if err != nil {
		middleware.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.Success(w, http.StatusOK, balances)
}

// RequestLeave handles POST /api/web/leaves
func (h *LeaveHandler) RequestLeave(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var input struct {
		LeaveTypeID string `json:"leaveTypeId"`
		StartDate   string `json:"startDate"`
		EndDate     string `json:"endDate"`
		Reason      string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if input.LeaveTypeID == "" || input.StartDate == "" || input.EndDate == "" {
		middleware.Error(w, http.StatusBadRequest, "leaveTypeId, startDate, and endDate are required")
		return
	}

	lr, err := h.leaveSvc.RequestLeave(r.Context(), auth.UserID, auth.OrganizationID, input.LeaveTypeID, input.StartDate, input.EndDate, input.Reason)
	if err != nil {
		middleware.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	middleware.Success(w, http.StatusCreated, lr)
}

// GetLeaveRequests handles GET /api/web/leaves
func (h *LeaveHandler) GetLeaveRequests(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	requests, err := h.leaveSvc.GetLeaveRequests(r.Context(), auth.OrganizationID, auth.UserID, string(auth.Role))
	if err != nil {
		middleware.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.Success(w, http.StatusOK, requests)
}

// ApproveLeave handles POST /api/web/leaves/{id}/approve
func (h *LeaveHandler) ApproveLeave(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	requestID := r.PathValue("id")
	if requestID == "" {
		middleware.Error(w, http.StatusBadRequest, "Request ID is required")
		return
	}

	var input struct {
		Approved bool   `json:"approved"`
		Comment  string `json:"comment"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	err := h.leaveSvc.ApproveLeave(r.Context(), requestID, auth.UserID, input.Approved, input.Comment)
	if err != nil {
		middleware.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	middleware.Success(w, http.StatusOK, map[string]string{"status": "processed"})
}

// GetHolidays handles GET /api/web/holidays
func (h *LeaveHandler) GetHolidays(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	holidays, err := h.leaveSvc.GetHolidays(r.Context(), auth.OrganizationID)
	if err != nil {
		middleware.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.Success(w, http.StatusOK, holidays)
}

// CreateHoliday handles POST /api/web/holidays
func (h *LeaveHandler) CreateHoliday(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var input struct {
		Name string `json:"name"`
		Date string `json:"date"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if input.Name == "" || input.Date == "" {
		middleware.Error(w, http.StatusBadRequest, "name and date are required")
		return
	}

	holiday, err := h.leaveSvc.CreateHoliday(r.Context(), auth.OrganizationID, input.Name, input.Date)
	if err != nil {
		middleware.Error(w, http.StatusInternalServerError, err.Error())
		return
	}

	middleware.Success(w, http.StatusCreated, holiday)
}
