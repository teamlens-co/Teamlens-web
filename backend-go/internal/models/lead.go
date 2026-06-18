package models

import "time"

type LeadStatus string

const (
	LeadStatusNew       LeadStatus = "NEW"
	LeadStatusContacted LeadStatus = "CONTACTED"
	LeadStatusQualified LeadStatus = "QUALIFIED"
	LeadStatusLost      LeadStatus = "LOST"
)

type Lead struct {
	ID        string     `json:"id"`
	Name      string     `json:"name"`
	Email     string     `json:"email"`
	Company   string     `json:"company"`
	Phone     *string    `json:"phone"`
	Status    LeadStatus `json:"status"`
	Notes     *string    `json:"notes"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
}
