package agent

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/teamlens/backend-go/internal/middleware"
	"github.com/teamlens/backend-go/internal/services"
)

type RecordingSessionHandler struct {
	recordingSvc *services.RecordingSessionService
	uploadDir    string
	enabled      bool
}

func NewRecordingSessionHandler(svc *services.RecordingSessionService, uploadDir string, enabled bool) *RecordingSessionHandler {
	return &RecordingSessionHandler{recordingSvc: svc, uploadDir: uploadDir, enabled: enabled}
}

func (h *RecordingSessionHandler) Start(w http.ResponseWriter, r *http.Request) {
	if !h.enabled {
		middleware.Error(w, http.StatusForbidden, "Recording is disabled")
		return
	}
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}

	var input struct {
		WorkSessionID *string `json:"workSessionId,omitempty"`
		FPS           int     `json:"fps,omitempty"`
		Width         int     `json:"width,omitempty"`
		Height        int     `json:"height,omitempty"`
		Codec         string  `json:"codec,omitempty"`
		MimeType      string  `json:"mimeType,omitempty"`
		StartedAt     *string `json:"startedAt,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	startedAt := time.Now().UTC()
	if input.StartedAt != nil {
		if parsed, err := time.Parse(time.RFC3339, *input.StartedAt); err == nil {
			startedAt = parsed.UTC()
		}
	}

	session, err := h.recordingSvc.StartSession(r.Context(), services.StartRecordingSessionPayload{
		EmployeeID:     auth.UserID,
		OrganizationID: auth.OrganizationID,
		WorkSessionID:  input.WorkSessionID,
		FPS:            input.FPS,
		Width:          input.Width,
		Height:         input.Height,
		Codec:          input.Codec,
		MimeType:       input.MimeType,
		StartedAt:      startedAt,
	})
	if err != nil {
		slog.Error("Start recording session failed", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to start recording")
		return
	}
	middleware.Success(w, http.StatusCreated, session)
}

func (h *RecordingSessionHandler) UploadChunk(w http.ResponseWriter, r *http.Request) {
	if !h.enabled {
		middleware.Error(w, http.StatusForbidden, "Recording is disabled")
		return
	}
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	sessionID := r.PathValue("id")
	if sessionID == "" {
		middleware.Error(w, http.StatusBadRequest, "Recording session ID is required")
		return
	}
	if _, err := h.recordingSvc.GetSession(r.Context(), sessionID, auth.OrganizationID, auth.UserID); err != nil {
		middleware.Error(w, http.StatusNotFound, "Recording session not found")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 200<<20)
	if err := r.ParseMultipartForm(20 << 20); err != nil {
		middleware.Error(w, http.StatusBadRequest, "File too large or invalid multipart form")
		return
	}
	file, header, err := r.FormFile("chunk")
	if err != nil {
		middleware.Error(w, http.StatusBadRequest, "No recording chunk provided")
		return
	}
	defer file.Close()

	chunkIndex, err := strconv.Atoi(r.FormValue("chunkIndex"))
	if err != nil || chunkIndex < 0 {
		middleware.Error(w, http.StatusBadRequest, "Invalid chunk index")
		return
	}
	durationMs, _ := strconv.ParseInt(r.FormValue("durationMs"), 10, 64)

	uploadPath := filepath.Join(h.uploadDir, "recording-sessions", sessionID)
	if err := os.MkdirAll(uploadPath, 0755); err != nil {
		slog.Error("Failed to create recording chunk dir", "path", uploadPath, "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to save recording chunk")
		return
	}

	ext := filepath.Ext(header.Filename)
	if ext == "" {
		ext = ".webm"
	}
	filePath := filepath.Join(uploadPath, "chunk-"+strconv.Itoa(chunkIndex)+ext)
	dst, err := os.Create(filePath)
	if err != nil {
		slog.Error("Failed to create recording chunk", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to save recording chunk")
		return
	}
	size, copyErr := io.Copy(dst, file)
	closeErr := dst.Close()
	if copyErr != nil || closeErr != nil {
		_ = os.Remove(filePath)
		slog.Error("Failed to write recording chunk", "copyErr", copyErr, "closeErr", closeErr)
		middleware.Error(w, http.StatusInternalServerError, "Unable to save recording chunk")
		return
	}

	chunk, err := h.recordingSvc.SaveChunk(r.Context(), services.SaveRecordingChunkPayload{
		SessionID:  sessionID,
		ChunkIndex: chunkIndex,
		FilePath:   filePath,
		FileSize:   size,
		DurationMs: durationMs,
	}, auth.UserID)
	if err != nil {
		_ = os.Remove(filePath)
		slog.Error("Save recording chunk failed", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to save recording chunk")
		return
	}
	middleware.Success(w, http.StatusCreated, chunk)
}

func (h *RecordingSessionHandler) Finish(w http.ResponseWriter, r *http.Request) {
	auth := middleware.GetAuthContext(r.Context())
	if auth == nil {
		middleware.Error(w, http.StatusUnauthorized, "Unauthorized")
		return
	}
	sessionID := r.PathValue("id")
	if sessionID == "" {
		middleware.Error(w, http.StatusBadRequest, "Recording session ID is required")
		return
	}

	var input struct {
		StoppedAt *string `json:"stoppedAt,omitempty"`
		Failed    bool    `json:"failed,omitempty"`
	}
	_ = json.NewDecoder(r.Body).Decode(&input)

	stoppedAt := time.Now().UTC()
	if input.StoppedAt != nil {
		if parsed, err := time.Parse(time.RFC3339, *input.StoppedAt); err == nil {
			stoppedAt = parsed.UTC()
		}
	}

	session, err := h.recordingSvc.FinishSession(r.Context(), sessionID, auth.UserID, stoppedAt, input.Failed)
	if err != nil {
		slog.Error("Finish recording session failed", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Unable to finish recording")
		return
	}
	middleware.Success(w, http.StatusOK, session)
}
