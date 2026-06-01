package agent

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

type ScreenshotHandler struct {
	screenshotSvc *services.ScreenshotService
	uploadDir     string
}

func NewScreenshotHandler(svc *services.ScreenshotService, uploadDir string) *ScreenshotHandler {
	return &ScreenshotHandler{screenshotSvc: svc, uploadDir: uploadDir}
}

func (h *ScreenshotHandler) Upload(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 50<<20) // 50MB max

	if err := r.ParseMultipartForm(10 << 20); err != nil {
		middleware.Error(w, http.StatusBadRequest, "File too large or invalid multipart form")
		return
	}

	file, header, err := r.FormFile("screenshot")
	if err != nil {
		middleware.Error(w, http.StatusBadRequest, "No screenshot file provided")
		return
	}
	defer file.Close()

	// Create upload directory
	dateDir := time.Now().UTC().Format("2006-01-02")
	uploadPath := filepath.Join(h.uploadDir, "screenshots", dateDir)
	if err := os.MkdirAll(uploadPath, 0755); err != nil {
		slog.Error("Failed to create screenshot dir", "path", uploadPath, "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to save screenshot")
		return
	}

	ext := filepath.Ext(header.Filename)
	if ext == "" {
		ext = ".png"
	}
	filename := services.RandomToken(16) + ext
	filePath := filepath.Join(uploadPath, filename)

	dst, err := os.Create(filePath)
	if err != nil {
		slog.Error("Failed to create screenshot file", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to save screenshot")
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		slog.Error("Failed to write screenshot", "error", err)
		os.Remove(filePath)
		middleware.Error(w, http.StatusInternalServerError, "Unable to save screenshot")
		return
	}

	capturedAtStr := r.FormValue("capturedAt")
	capturedAt := time.Now().UTC()
	if capturedAtStr != "" {
		if t, err := time.Parse(time.RFC3339, capturedAtStr); err == nil {
			capturedAt = t
		}
	}

	sessionID := r.FormValue("sessionId")
	activeApp := r.FormValue("activeApplication")
	windowTitle := r.FormValue("windowTitle")
	domain := r.FormValue("domain")
	url := r.FormValue("url")
	employeeName := r.FormValue("employeeName")
	projectName := r.FormValue("projectName")

	var sID *string
	if sessionID != "" {
		sID = &sessionID
	}

	screenshot, err := h.screenshotSvc.UploadScreenshot(r.Context(), &services.UploadScreenshotPayload{
		UserID:            auth.UserID,
		FilePath:          filePath,
		SessionID:         sID,
		ActiveApplication: nullable(activeApp),
		WindowTitle:       nullable(windowTitle),
		Domain:            nullable(domain),
		URL:               nullable(url),
		EmployeeName:      nullable(employeeName),
		ProjectName:       nullable(projectName),
		CapturedAt:        capturedAt,
	})
	if err != nil {
		slog.Error("Failed to save screenshot record", "error", err)
		os.Remove(filePath)
		middleware.Error(w, http.StatusInternalServerError, "Unable to save screenshot")
		return
	}

	middleware.Success(w, http.StatusCreated, screenshot)
}

func (h *ScreenshotHandler) List(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	userID := r.URL.Query().Get("userId")
	if userID == "" {
		userID = auth.UserID
	}

	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 50
	}

	sessionID := r.URL.Query().Get("sessionId")
	var sID *string
	if sessionID != "" {
		sID = &sessionID
	}

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

	screenshots, err := h.screenshotSvc.GetScreenshots(r.Context(), &services.GetScreenshotsPayload{
		UserID:    userID,
		SessionID: sID,
		Limit:     limit,
		StartDate: startDate,
		EndDate:   endDate,
	})
	if err != nil {
		slog.Error("Failed to list screenshots", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to fetch screenshots")
		return
	}

	if screenshots == nil {
		screenshots = []models.Screenshot{}
	}

	middleware.Success(w, http.StatusOK, screenshots)
}

func (h *ScreenshotHandler) Get(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	screenshotID := r.PathValue("screenshotId")
	if screenshotID == "" {
		screenshotID = r.PathValue("id")
	}
	if screenshotID == "" {
		middleware.Error(w, http.StatusBadRequest, "Screenshot ID is required")
		return
	}

	screenshot, err := h.screenshotSvc.GetScreenshotByID(r.Context(), screenshotID)
	if err != nil {
		middleware.Error(w, http.StatusNotFound, "Screenshot not found")
		return
	}

	if screenshot.UserID != auth.UserID && auth.Role != "MANAGER" {
		middleware.Error(w, http.StatusForbidden, "Forbidden")
		return
	}

	fullPath, err := h.safeUploadPath(screenshot.FilePath)
	if err != nil {
		slog.Warn("Invalid screenshot path", "id", screenshot.ID, "path", screenshot.FilePath, "error", err)
		middleware.Error(w, http.StatusBadRequest, "Invalid screenshot path")
		return
	}
	if _, err := os.Stat(fullPath); err != nil {
		if os.IsNotExist(err) {
			middleware.Error(w, http.StatusNotFound, "Screenshot file not found")
			return
		}
		slog.Warn("Unable to stat screenshot file", "id", screenshot.ID, "path", fullPath, "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to load screenshot")
		return
	}

	http.ServeFile(w, r, fullPath)
}

func (h *ScreenshotHandler) Delete(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	screenshotID := r.PathValue("screenshotId")
	if screenshotID == "" {
		middleware.Error(w, http.StatusBadRequest, "Screenshot ID is required")
		return
	}

	screenshot, err := h.screenshotSvc.GetScreenshotByID(r.Context(), screenshotID)
	if err != nil {
		middleware.Error(w, http.StatusNotFound, "Screenshot not found")
		return
	}

	// Only the owner (or manager) can delete
	if screenshot.UserID != auth.UserID && auth.Role != "MANAGER" {
		middleware.Error(w, http.StatusForbidden, "Forbidden")
		return
	}

	if err := os.Remove(screenshot.FilePath); err != nil && !os.IsNotExist(err) {
		slog.Warn("Failed to delete screenshot file", "path", screenshot.FilePath, "error", err)
	}

	if err := h.screenshotSvc.DeleteScreenshot(r.Context(), screenshotID); err != nil {
		middleware.Error(w, http.StatusInternalServerError, "Unable to delete screenshot")
		return
	}

	middleware.Success(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *ScreenshotHandler) ServeFile(w http.ResponseWriter, r *http.Request) {
	filePath := r.PathValue("filePath")
	if filePath == "" {
		middleware.Error(w, http.StatusBadRequest, "File path is required")
		return
	}

	fullPath := filepath.Join(h.uploadDir, "screenshots", filepath.Base(filePath))

	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		middleware.Error(w, http.StatusNotFound, "Screenshot not found")
		return
	}

	http.ServeFile(w, r, fullPath)
}

func (h *ScreenshotHandler) safeUploadPath(storedPath string) (string, error) {
	cleanUploadDir, err := filepath.Abs(filepath.Clean(h.uploadDir))
	if err != nil {
		return "", err
	}

	// DB stores paths like "uploads/screenshots/..." but uploadDir is "/app/uploads"
	// Strip "uploads/" prefix if uploadDir already ends with "uploads"
	cleanStored := filepath.Clean(storedPath)
	if strings.HasPrefix(cleanStored, "uploads/") || strings.HasPrefix(cleanStored, "uploads\\") {
		cleanStored = cleanStored[len("uploads/"):]
	}
	if !filepath.IsAbs(cleanStored) {
		cleanStored = filepath.Join(cleanUploadDir, cleanStored)
	}
	absPath, err := filepath.Abs(cleanStored)
	if err != nil {
		return "", err
	}
	rel, err := filepath.Rel(cleanUploadDir, absPath)
	if err != nil {
		return "", err
	}
	if rel == "." || rel == ".." || len(rel) >= 3 && rel[:3] == ".."+string(filepath.Separator) {
		return "", os.ErrPermission
	}

	return absPath, nil
}

func nullable(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}
