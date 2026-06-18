package web

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/teamlens/backend-go/internal/middleware"
	"github.com/teamlens/backend-go/internal/models"
)

type LeadHandler struct {
	pool *pgxpool.Pool
}

func NewLeadHandler(pool *pgxpool.Pool) *LeadHandler {
	return &LeadHandler{pool: pool}
}

func (h *LeadHandler) ListLeads(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	rows, err := h.pool.Query(ctx, `
		SELECT id, name, email, company, phone, status, notes, created_at, updated_at
		FROM leads
		ORDER BY created_at DESC
	`)
	if err != nil {
		slog.Error("ListLeads: failed to query leads", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Failed to list leads")
		return
	}
	defer rows.Close()

	leads := []models.Lead{}
	for rows.Next() {
		var lead models.Lead
		err := rows.Scan(
			&lead.ID,
			&lead.Name,
			&lead.Email,
			&lead.Company,
			&lead.Phone,
			&lead.Status,
			&lead.Notes,
			&lead.CreatedAt,
			&lead.UpdatedAt,
		)
		if err != nil {
			slog.Error("ListLeads: failed to scan lead row", "error", err)
			continue
		}
		leads = append(leads, lead)
	}

	middleware.Success(w, http.StatusOK, leads)
}

func (h *LeadHandler) CreateLead(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	var input struct {
		Name    string  `json:"name"`
		Email   string  `json:"email"`
		Company string  `json:"company"`
		Phone   *string `json:"phone"`
		Notes   *string `json:"notes"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if input.Name == "" || input.Email == "" || input.Company == "" {
		middleware.Error(w, http.StatusBadRequest, "Name, Email, and Company are required fields")
		return
	}

	var lead models.Lead
	lead.Status = models.LeadStatusNew

	err := h.pool.QueryRow(ctx, `
		INSERT INTO leads (id, name, email, company, phone, status, notes, created_at, updated_at)
		VALUES (
			'lead_' || lower(substring(replace(gen_random_uuid()::text, '-', ''), 1, 16)),
			$1, $2, $3, $4, $5, $6, NOW(), NOW()
		)
		RETURNING id, name, email, company, phone, status, notes, created_at, updated_at
	`, input.Name, input.Email, input.Company, input.Phone, lead.Status, input.Notes).Scan(
		&lead.ID,
		&lead.Name,
		&lead.Email,
		&lead.Company,
		&lead.Phone,
		&lead.Status,
		&lead.Notes,
		&lead.CreatedAt,
		&lead.UpdatedAt,
	)

	if err != nil {
		slog.Error("CreateLead: failed to insert lead", "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Failed to create lead")
		return
	}

	middleware.Success(w, http.StatusCreated, lead)
}

func (h *LeadHandler) UpdateLeadStatus(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	leadID := r.PathValue("leadId")
	if leadID == "" {
		middleware.Error(w, http.StatusBadRequest, "Lead ID is required")
		return
	}

	var input struct {
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	status := models.LeadStatus(input.Status)
	if status != models.LeadStatusNew &&
		status != models.LeadStatusContacted &&
		status != models.LeadStatusQualified &&
		status != models.LeadStatusLost {
		middleware.Error(w, http.StatusBadRequest, "Invalid status value")
		return
	}

	result, err := h.pool.Exec(ctx, `
		UPDATE leads SET status = $1, updated_at = NOW() WHERE id = $2
	`, status, leadID)
	if err != nil {
		slog.Error("UpdateLeadStatus: failed to update status", "leadId", leadID, "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Failed to update lead status")
		return
	}

	if result.RowsAffected() == 0 {
		middleware.Error(w, http.StatusNotFound, "Lead not found")
		return
	}

	middleware.Success(w, http.StatusOK, map[string]interface{}{
		"id":     leadID,
		"status": status,
	})
}

func (h *LeadHandler) UpdateLeadNotes(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	leadID := r.PathValue("leadId")
	if leadID == "" {
		middleware.Error(w, http.StatusBadRequest, "Lead ID is required")
		return
	}

	var input struct {
		Notes string `json:"notes"`
	}
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		middleware.Error(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	result, err := h.pool.Exec(ctx, `
		UPDATE leads SET notes = $1, updated_at = NOW() WHERE id = $2
	`, input.Notes, leadID)
	if err != nil {
		slog.Error("UpdateLeadNotes: failed to update notes", "leadId", leadID, "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Failed to update lead notes")
		return
	}

	if result.RowsAffected() == 0 {
		middleware.Error(w, http.StatusNotFound, "Lead not found")
		return
	}

	middleware.Success(w, http.StatusOK, map[string]interface{}{
		"id":    leadID,
		"notes": input.Notes,
	})
}

func (h *LeadHandler) DeleteLead(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	leadID := r.PathValue("leadId")
	if leadID == "" {
		middleware.Error(w, http.StatusBadRequest, "Lead ID is required")
		return
	}

	result, err := h.pool.Exec(ctx, `DELETE FROM leads WHERE id = $1`, leadID)
	if err != nil {
		slog.Error("DeleteLead: failed to delete lead", "leadId", leadID, "error", err)
		middleware.Error(w, http.StatusInternalServerError, "Failed to delete lead")
		return
	}

	if result.RowsAffected() == 0 {
		middleware.Error(w, http.StatusNotFound, "Lead not found")
		return
	}

	middleware.Success(w, http.StatusOK, map[string]interface{}{
		"id": leadID,
	})
}
