package middleware

import (
	"encoding/json"
	"net/http"
	"strings"
)

type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Message string      `json:"message,omitempty"`
	Issues  interface{} `json:"issues,omitempty"`
}

func RespondJSON(w http.ResponseWriter, status int, resp APIResponse) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(resp)
}

func Success(w http.ResponseWriter, status int, data interface{}) {
	RespondJSON(w, status, APIResponse{
		Success: true,
		Data:    data,
	})
}

func Error(w http.ResponseWriter, status int, msg string) {
	RespondJSON(w, status, APIResponse{
		Success: false,
		Message: msg,
	})
}

func ErrorWithIssues(w http.ResponseWriter, status int, msg string, issues interface{}) {
	RespondJSON(w, status, APIResponse{
		Success: false,
		Message: msg,
		Issues:  issues,
	})
}

// GetFileExtension extracts extension from filename
func GetFileExtension(filename string) string {
	if idx := strings.LastIndex(filename, "."); idx >= 0 {
		return filename[idx:]
	}
	return ""
}
