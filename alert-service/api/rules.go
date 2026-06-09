package api

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

	"github.com/teamlens-co/teamlens-web-server/alert-service/core"
	"github.com/teamlens-co/teamlens-web-server/alert-service/db"
)

// RulesHandler manages alert rules via HTTP API
type RulesHandler struct {
	pg *db.PostgresDB
}

// NewRulesHandler creates a new rules handler
func NewRulesHandler(pg *db.PostgresDB) *RulesHandler {
	return &RulesHandler{pg: pg}
}

func respondJSON(w http.ResponseWriter, status int, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(data)
}

func respondError(w http.ResponseWriter, status int, msg string) {
	respondJSON(w, status, map[string]string{"error": msg})
}

// HandleRules handles CRUD for alert rules
func (h *RulesHandler) HandleRules(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.listRules(w, r)
	case http.MethodPost:
		h.createRule(w, r)
	default:
		respondError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

// HandleRule handles single rule operations
func (h *RulesHandler) HandleRule(w http.ResponseWriter, r *http.Request) {
	ruleID := strings.TrimPrefix(r.URL.Path, "/api/rules/")
	if ruleID == "" {
		respondError(w, http.StatusBadRequest, "rule id required")
		return
	}

	switch r.Method {
	case http.MethodPut:
		h.updateRule(w, r, ruleID)
	case http.MethodDelete:
		h.deleteRule(w, r, ruleID)
	default:
		respondError(w, http.StatusMethodNotAllowed, "method not allowed")
	}
}

func (h *RulesHandler) listRules(w http.ResponseWriter, r *http.Request) {
	rules, err := h.pg.GetAllRules()
	if err != nil {
		log.Printf("[Rules] List error: %v", err)
		respondError(w, http.StatusInternalServerError, "failed to list rules")
		return
	}
	if rules == nil {
		rules = []core.AlertRule{}
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    rules,
	})
}

func (h *RulesHandler) createRule(w http.ResponseWriter, r *http.Request) {
	var rule core.AlertRule
	if err := json.NewDecoder(r.Body).Decode(&rule); err != nil {
		respondError(w, http.StatusBadRequest, "invalid json")
		return
	}

	if rule.Name == "" || rule.Type == "" {
		respondError(w, http.StatusBadRequest, "name and type required")
		return
	}

	if err := h.pg.UpsertRule(&rule); err != nil {
		log.Printf("[Rules] Create error: %v", err)
		respondError(w, http.StatusInternalServerError, "failed to create rule")
		return
	}

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"success": true,
		"data":    rule,
	})
}

func (h *RulesHandler) updateRule(w http.ResponseWriter, r *http.Request, ruleID string) {
	var rule core.AlertRule
	if err := json.NewDecoder(r.Body).Decode(&rule); err != nil {
		respondError(w, http.StatusBadRequest, "invalid json")
		return
	}
	rule.ID = ruleID

	if err := h.pg.UpsertRule(&rule); err != nil {
		log.Printf("[Rules] Update error: %v", err)
		respondError(w, http.StatusInternalServerError, "failed to update rule")
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    rule,
	})
}

func (h *RulesHandler) deleteRule(w http.ResponseWriter, r *http.Request, ruleID string) {
	if err := h.pg.DeleteRule(ruleID); err != nil {
		log.Printf("[Rules] Delete error: %v", err)
		respondError(w, http.StatusInternalServerError, "failed to delete rule")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}

// AlertEventsHandler handles alert event queries
type AlertEventsHandler struct {
	pg *db.PostgresDB
}

func NewAlertEventsHandler(pg *db.PostgresDB) *AlertEventsHandler {
	return &AlertEventsHandler{pg: pg}
}

func (h *AlertEventsHandler) HandleEvents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		respondError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	events, err := h.pg.GetAlertHistory(50)
	if err != nil {
		log.Printf("[Events] List error: %v", err)
		respondError(w, http.StatusInternalServerError, "failed to get events")
		return
	}
	if events == nil {
		events = []core.AlertEvent{}
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    events,
	})
}

func (h *AlertEventsHandler) HandleAck(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		respondError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	alertID := strings.TrimPrefix(r.URL.Path, "/api/alerts/")
	alertID = strings.TrimSuffix(alertID, "/ack")

	var body struct {
		AcknowledgedBy string `json:"acknowledged_by"`
	}
	json.NewDecoder(r.Body).Decode(&body)

	if err := h.pg.AckAlert(alertID, body.AcknowledgedBy); err != nil {
		log.Printf("[Events] Ack error: %v", err)
		respondError(w, http.StatusInternalServerError, "failed to ack")
		return
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"success": true,
	})
}
