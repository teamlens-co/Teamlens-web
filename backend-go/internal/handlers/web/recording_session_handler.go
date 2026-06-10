package web

import (
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/teamlens/backend-go/internal/middleware"
	"github.com/teamlens/backend-go/internal/models"
	"github.com/teamlens/backend-go/internal/services"
)

type RecordingSessionHandler struct {
	recordingSvc *services.RecordingSessionService
	uploadDir    string
}

func NewRecordingSessionHandler(svc *services.RecordingSessionService, uploadDir string) *RecordingSessionHandler {
	return &RecordingSessionHandler{recordingSvc: svc, uploadDir: uploadDir}
}

func (h *RecordingSessionHandler) List(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	employeeID := r.URL.Query().Get("employeeId")
	if auth.Role == models.RoleEmployee {
		employeeID = auth.UserID
	}
	var emp *string
	if employeeID != "" {
		emp = &employeeID
	}
	sessions, err := h.recordingSvc.ListSessions(r.Context(), auth.OrganizationID, emp, limit)
	if err != nil {
		slog.Error("List recording sessions failed", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to fetch recording sessions")
		return
	}
	if sessions == nil {
		sessions = []models.RecordingSession{}
	}
	middleware.Success(w, http.StatusOK, sessions)
}

func (h *RecordingSessionHandler) Active(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	sessions, err := h.recordingSvc.ListActiveSessions(r.Context(), auth.OrganizationID)
	if err != nil {
		slog.Error("List active recording sessions failed", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to fetch active recordings")
		return
	}
	if sessions == nil {
		sessions = []models.RecordingSession{}
	}
	middleware.Success(w, http.StatusOK, sessions)
}

func (h *RecordingSessionHandler) Get(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	sessionID := r.PathValue("id")
	session, err := h.recordingSvc.GetSession(r.Context(), sessionID, auth.OrganizationID, "")
	if err != nil {
		middleware.Error(w, http.StatusNotFound, "Recording session not found")
		return
	}
	if auth.Role == models.RoleEmployee && session.EmployeeID != auth.UserID {
		middleware.Error(w, http.StatusForbidden, "Forbidden")
		return
	}
	middleware.Success(w, http.StatusOK, session)
}

func (h *RecordingSessionHandler) Playlist(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	sessionID := r.PathValue("id")
	session, err := h.recordingSvc.GetSession(r.Context(), sessionID, auth.OrganizationID, "")
	if err != nil {
		middleware.Error(w, http.StatusNotFound, "Recording session not found")
		return
	}
	if auth.Role == models.RoleEmployee && session.EmployeeID != auth.UserID {
		middleware.Error(w, http.StatusForbidden, "Forbidden")
		return
	}
	chunks, err := h.recordingSvc.ListChunks(r.Context(), sessionID, auth.OrganizationID)
	if err != nil {
		slog.Error("List recording chunks failed", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to fetch recording playlist")
		return
	}
	for i := range chunks {
		chunks[i].PlaybackURL = "/api/web/recording-sessions/" + sessionID + "/chunks/" + chunks[i].ID + "/file"
	}
	middleware.Success(w, http.StatusOK, map[string]interface{}{
		"session": session,
		"chunks":  chunks,
	})
}

func (h *RecordingSessionHandler) ServeChunk(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	sessionID := r.PathValue("id")
	chunkID := r.PathValue("chunkId")
	chunk, err := h.recordingSvc.GetChunkByID(r.Context(), sessionID, chunkID, auth.OrganizationID)
	if err != nil {
		middleware.Error(w, http.StatusNotFound, "Recording chunk not found")
		return
	}
	fullPath, err := h.safeUploadPath(chunk.FilePath)
	if err != nil {
		slog.Warn("Invalid recording chunk path", "path", chunk.FilePath, "error", err)
		middleware.Error(w, http.StatusBadRequest, "Invalid recording chunk path")
		return
	}
	if _, err := os.Stat(fullPath); err != nil {
		middleware.Error(w, http.StatusNotFound, "Recording chunk file not found")
		return
	}
	w.Header().Set("Content-Type", "video/webm")
	http.ServeFile(w, r, fullPath)
}

func (h *RecordingSessionHandler) safeUploadPath(storedPath string) (string, error) {
	cleanUploadDir, err := filepath.Abs(filepath.Clean(h.uploadDir))
	if err != nil {
		return "", err
	}
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
	if rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", os.ErrPermission
	}
	return absPath, nil
}
