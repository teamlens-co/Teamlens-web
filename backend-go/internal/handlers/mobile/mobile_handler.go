package mobile

import (
	"net/http"

	"github.com/teamlens/backend-go/internal/middleware"
)

type Handler struct{}

func NewHandler() *Handler {
	return &Handler{}
}

func (h *Handler) Health(w http.ResponseWriter, r *http.Request) {
	middleware.Success(w, http.StatusOK, map[string]interface{}{
		"module":  "mobile",
		"message": "Mobile module placeholder ready",
	})
}
