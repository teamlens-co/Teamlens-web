package web

import (
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/teamlens/backend-go/internal/middleware"
	"github.com/teamlens/backend-go/internal/models"
	"github.com/teamlens/backend-go/internal/services"
)

type RecordingHandler struct {
	recordingSvc *services.RecordingService
	uploadDir    string
}

func NewRecordingHandler(svc *services.RecordingService, uploadDir string) *RecordingHandler {
	return &RecordingHandler{recordingSvc: svc, uploadDir: uploadDir}
}

func (h *RecordingHandler) Upload(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 200<<20) // 200MB max

	if err := r.ParseMultipartForm(32 << 20); err != nil {
		middleware.Error(w, http.StatusBadRequest, "File too large or invalid multipart form")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		middleware.Error(w, http.StatusBadRequest, "No file provided")
		return
	}
	defer file.Close()

	employeeID := r.FormValue("employeeId")
	if employeeID == "" {
		middleware.Error(w, http.StatusBadRequest, "employeeId is required")
		return
	}

	// Create upload path
	dateDir := time.Now().UTC().Format("2006-01-02")
	uploadPath := filepath.Join(h.uploadDir, "recordings", dateDir)
	if err := os.MkdirAll(uploadPath, 0755); err != nil {
		slog.Error("Failed to create upload dir", "path", uploadPath, "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to save recording")
		return
	}

	ext := filepath.Ext(header.Filename)
	filename := services.RandomToken(16) + ext
	filePath := filepath.Join(uploadPath, filename)

	dst, err := os.Create(filePath)
	if err != nil {
		slog.Error("Failed to create file", "path", filePath, "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to save recording")
		return
	}
	defer dst.Close()

	written, err := io.Copy(dst, file)
	if err != nil {
		slog.Error("Failed to write file", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to save recording")
		return
	}

	mimeType := header.Header.Get("Content-Type")
	if mimeType == "" {
		mimeType = "video/webm"
	}

	durationStr := r.FormValue("durationMs")
	durationMs := 0
	if durationStr != "" {
		durationMs, _ = strconv.Atoi(durationStr)
	}

	recordedAtStr := r.FormValue("recordedAt")
	recordedAt := time.Now().UTC()
	if recordedAtStr != "" {
		if t, err := time.Parse(time.RFC3339, recordedAtStr); err == nil {
			recordedAt = t
		}
	}

	recording := &models.ScreenRecording{
		ManagerID:      auth.UserID,
		EmployeeID:     employeeID,
		OrganizationID: auth.OrganizationID,
		FilePath:       filePath,
		FileSize:       int(written),
		DurationMs:     durationMs,
		MimeType:       mimeType,
		RecordedAt:     recordedAt,
	}

	if liveSessionID := r.FormValue("liveSessionId"); liveSessionID != "" {
		recording.LiveSessionID = &liveSessionID
	}

	if err := h.recordingSvc.SaveRecording(r.Context(), recording); err != nil {
		slog.Error("Failed to save recording record", "error", err)
		os.Remove(filePath)
		middleware.Error(w, http.StatusInternalServerError, "Unable to save recording")
		return
	}

	middleware.Success(w, http.StatusCreated, map[string]string{
		"id":       recording.ID,
		"filePath": recording.FilePath,
	})
}

func (h *RecordingHandler) List(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	employeeID := r.URL.Query().Get("employeeId")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	startDateStr := r.URL.Query().Get("startDate")
	endDateStr := r.URL.Query().Get("endDate")
	var startDate, endDate *time.Time
	if startDateStr != "" {
		if t, err := time.Parse(time.RFC3339, startDateStr); err == nil {
			startDate = &t
		}
	}
	if endDateStr != "" {
		if t, err := time.Parse(time.RFC3339, endDateStr); err == nil {
			endDate = &t
		}
	}

	var empID *string
	if employeeID != "" {
		empID = &employeeID
	}

	recordings, err := h.recordingSvc.GetRecordings(r.Context(), auth.OrganizationID, empID, nil, limit, startDate, endDate)
	if err != nil {
		slog.Error("Failed to list recordings", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to fetch recordings")
		return
	}

	if recordings == nil {
		recordings = []models.ScreenRecording{}
	}

	middleware.Success(w, http.StatusOK, recordings)
}

func (h *RecordingHandler) Get(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	recordingID := r.PathValue("recordingId")
	if recordingID == "" {
		middleware.Error(w, http.StatusBadRequest, "Recording ID is required")
		return
	}

	recording, err := h.recordingSvc.GetRecordingByID(r.Context(), recordingID)
	if err != nil {
		middleware.Error(w, http.StatusNotFound, "Recording not found")
		return
	}

	// Check access
	if recording.OrganizationID != auth.OrganizationID {
		middleware.Error(w, http.StatusForbidden, "Forbidden")
		return
	}
	if auth.Role == models.RoleEmployee && recording.EmployeeID != auth.UserID && recording.ManagerID != auth.UserID {
		middleware.Error(w, http.StatusForbidden, "Forbidden")
		return
	}

	middleware.Success(w, http.StatusOK, recording)
}

func (h *RecordingHandler) ServeFile(w http.ResponseWriter, r *http.Request) {
	filePath := r.PathValue("filePath")
	if filePath == "" {
		middleware.Error(w, http.StatusBadRequest, "File path is required")
		return
	}

	// Prevent path traversal
	cleanPath := filepath.Clean("/" + filePath)
	cleanPath = strings.TrimPrefix(cleanPath, "/")
	fullPath := filepath.Join(h.uploadDir, cleanPath)

	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		middleware.Error(w, http.StatusNotFound, "File not found")
		return
	}

	http.ServeFile(w, r, fullPath)
}

// ServeFileByID looks up a recording by ID and serves its file
func (h *RecordingHandler) ServeFileByID(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	recordingID := r.PathValue("recordingId")
	if recordingID == "" {
		middleware.Error(w, http.StatusBadRequest, "Recording ID is required")
		return
	}

	recording, err := h.recordingSvc.GetRecordingByID(r.Context(), recordingID)
	if err != nil {
		middleware.Error(w, http.StatusNotFound, "Recording not found")
		return
	}

	// Check access
	if recording.OrganizationID != auth.OrganizationID {
		middleware.Error(w, http.StatusForbidden, "Forbidden")
		return
	}

	fullPath := recording.FilePath
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		// Try with uploadDir prefix
		fullPath = filepath.Join(h.uploadDir, recording.FilePath)
		if _, err := os.Stat(fullPath); os.IsNotExist(err) {
			middleware.Error(w, http.StatusNotFound, "File not found on disk")
			return
		}
	}

	http.ServeFile(w, r, fullPath)
}

func (h *RecordingHandler) Delete(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	recordingID := r.PathValue("recordingId")
	if recordingID == "" {
		middleware.Error(w, http.StatusBadRequest, "Recording ID is required")
		return
	}

	recording, err := h.recordingSvc.GetRecordingByID(r.Context(), recordingID)
	if err != nil {
		middleware.Error(w, http.StatusNotFound, "Recording not found")
		return
	}

	if recording.OrganizationID != auth.OrganizationID {
		middleware.Error(w, http.StatusForbidden, "Forbidden")
		return
	}

	// Delete file
	if err := os.Remove(recording.FilePath); err != nil && !os.IsNotExist(err) {
		slog.Warn("Failed to delete recording file", "path", recording.FilePath, "error", err)
	}

	// Delete DB
	if err := h.recordingSvc.DeleteRecording(r.Context(), recordingID); err != nil {
		middleware.Error(w, http.StatusInternalServerError, "Unable to delete recording")
		return
	}

	middleware.Success(w, http.StatusOK, map[string]string{"status": "deleted"})
}
