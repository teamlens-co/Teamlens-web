package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/teamlens/backend-go/internal/models"
)

type LocationService struct {
	pool               *pgxpool.Pool
	googlePlacesAPIKey string
	httpClient         *http.Client
}

func NewLocationService(pool *pgxpool.Pool, googlePlacesAPIKey string) *LocationService {
	return &LocationService{
		pool:               pool,
		googlePlacesAPIKey: strings.TrimSpace(googlePlacesAPIKey),
		httpClient: &http.Client{
			Timeout: 8 * time.Second,
		},
	}
}

// Haversine distance in meters
func haversineMeters(lat1, lon1, lat2, lon2 float64) float64 {
	const R = 6371000.0
	dLat := (lat2 - lat1) * math.Pi / 180
	dLon := (lon2 - lon1) * math.Pi / 180
	a := math.Sin(dLat/2)*math.Sin(dLat/2) +
		math.Cos(lat1*math.Pi/180)*math.Cos(lat2*math.Pi/180)*
			math.Sin(dLon/2)*math.Sin(dLon/2)
	c := 2 * math.Atan2(math.Sqrt(a), math.Sqrt(1-a))
	return R * c
}

func (s *LocationService) DetermineLocationType(ctx context.Context, organizationID string, latitude, longitude float64, locationSource *string, accuracyMeters *float64) *string {
	rows, err := s.pool.Query(ctx,
		`SELECT id, latitude, longitude, radius_meters
		 FROM office_locations
		 WHERE organization_id = $1`,
		organizationID,
	)
	if err != nil {
		return nil
	}
	defer rows.Close()

	for rows.Next() {
		var id string
		var lat, lng float64
		var radius int
		if err := rows.Scan(&id, &lat, &lng, &radius); err != nil {
			continue
		}
		dist := haversineMeters(latitude, longitude, lat, lng)
		if dist <= float64(radius) {
			r := "office"
			return &r
		}
	}

	r := "remote"
	return &r
}

func (s *LocationService) ComputeDailyLocationStatus(locationTypes []*string) *string {
	hasOffice := false
	hasRemote := false
	hasManual := false

	for _, lt := range locationTypes {
		if lt == nil {
			continue
		}
		switch *lt {
		case "office":
			hasOffice = true
		case "remote":
			hasRemote = true
		case "manual":
			hasManual = true
		}
	}

	if hasOffice && !hasRemote && !hasManual {
		r := "Office"
		return &r
	}
	if hasRemote && !hasOffice && !hasManual {
		r := "Remote"
		return &r
	}
	if hasManual && !hasOffice && !hasRemote {
		r := "Manual"
		return &r
	}
	if hasOffice || hasRemote || hasManual {
		r := "Mixed"
		return &r
	}
	return nil
}

func (s *LocationService) ListOfficeLocations(ctx context.Context, organizationID string) ([]models.OfficeLocation, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, organization_id, label, latitude, longitude, radius_meters, created_at::text
		 FROM office_locations
		 WHERE organization_id = $1
		 ORDER BY created_at ASC`,
		organizationID,
	)
	if err != nil {
		return nil, fmt.Errorf("query office locations: %w", err)
	}
	defer rows.Close()

	var locations []models.OfficeLocation
	for rows.Next() {
		var loc models.OfficeLocation
		if err := rows.Scan(&loc.ID, &loc.OrganizationID, &loc.Label, &loc.Latitude, &loc.Longitude, &loc.RadiusMeters, &loc.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan office location: %w", err)
		}
		locations = append(locations, loc)
	}
	return locations, nil
}

func (s *LocationService) UpsertOfficeLocation(ctx context.Context, organizationID string, input *models.UpsertOfficeLocationInput) (*models.OfficeLocation, error) {
	// Check if a location with this label already exists
	var existingID string
	err := s.pool.QueryRow(ctx,
		`SELECT id FROM office_locations WHERE organization_id = $1 AND label = $2`,
		organizationID, input.Label,
	).Scan(&existingID)

	if err == nil && existingID != "" {
		// Update existing
		_, err := s.pool.Exec(ctx,
			`UPDATE office_locations
			 SET latitude = $1, longitude = $2, radius_meters = $3, updated_at = NOW()
			 WHERE id = $4`,
			input.Latitude, input.Longitude, input.RadiusMeters, existingID,
		)
		if err != nil {
			return nil, fmt.Errorf("update office location: %w", err)
		}
		return s.GetOfficeLocation(ctx, existingID)
	}

	id := RandomToken(16)
	_, err = s.pool.Exec(ctx,
		`INSERT INTO office_locations (id, organization_id, label, latitude, longitude, radius_meters, created_at, updated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
		id, organizationID, input.Label, input.Latitude, input.Longitude, input.RadiusMeters,
	)
	if err != nil {
		return nil, fmt.Errorf("create office location: %w", err)
	}

	return s.GetOfficeLocation(ctx, id)
}

func (s *LocationService) DeleteOfficeLocation(ctx context.Context, organizationID, locationID string) error {
	tag, err := s.pool.Exec(ctx,
		`DELETE FROM office_locations WHERE id = $1 AND organization_id = $2`,
		locationID, organizationID,
	)
	if err != nil {
		return fmt.Errorf("delete office location: %w", err)
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("office location not found")
	}
	return nil
}

func (s *LocationService) GetOfficeLocation(ctx context.Context, id string) (*models.OfficeLocation, error) {
	var loc models.OfficeLocation
	err := s.pool.QueryRow(ctx,
		`SELECT id, organization_id, label, latitude, longitude, radius_meters, created_at::text
		 FROM office_locations WHERE id = $1`, id,
	).Scan(&loc.ID, &loc.OrganizationID, &loc.Label, &loc.Latitude, &loc.Longitude, &loc.RadiusMeters, &loc.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("get office location: %w", err)
	}
	return &loc, nil
}

// SearchLocations returns Google Places results when configured, falling back to saved office locations for local dev.
func (s *LocationService) SearchLocations(ctx context.Context, query string) ([]models.LocationSearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return []models.LocationSearchResult{}, nil
	}

	if s.googlePlacesAPIKey != "" {
		return s.searchGoogleLocations(ctx, query)
	}

	return s.searchSavedOfficeLocations(ctx, query)
}

func (s *LocationService) searchSavedOfficeLocations(ctx context.Context, query string) ([]models.LocationSearchResult, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT id, label, latitude, longitude
		 FROM office_locations
		 WHERE LOWER(label) LIKE LOWER($1)
		 LIMIT 10`,
		"%"+query+"%",
	)
	if err != nil {
		return nil, fmt.Errorf("search locations: %w", err)
	}
	defer rows.Close()

	var results []models.LocationSearchResult
	for rows.Next() {
		var r models.LocationSearchResult
		if err := rows.Scan(&r.ID, &r.Label, &r.Latitude, &r.Longitude); err != nil {
			continue
		}
		r.Address = r.Label
		r.Provider = "database"
		results = append(results, r)
	}

	return results, nil
}

type googleTextSearchRequest struct {
	TextQuery string `json:"textQuery"`
	PageSize  int    `json:"pageSize"`
}

type googleTextSearchResponse struct {
	Places []googlePlace `json:"places"`
	Error  *googleError  `json:"error,omitempty"`
}

type googlePlace struct {
	ID               string            `json:"id"`
	DisplayName      googleDisplayName `json:"displayName"`
	FormattedAddress string            `json:"formattedAddress"`
	Location         googleLocation    `json:"location"`
}

type googleDisplayName struct {
	Text string `json:"text"`
}

type googleLocation struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

type googleError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
	Status  string `json:"status"`
}

func (s *LocationService) searchGoogleLocations(ctx context.Context, query string) ([]models.LocationSearchResult, error) {
	payload, err := json.Marshal(googleTextSearchRequest{
		TextQuery: query,
		PageSize:  10,
	})
	if err != nil {
		return nil, fmt.Errorf("build google places request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://places.googleapis.com/v1/places:searchText", bytes.NewReader(payload))
	if err != nil {
		return nil, fmt.Errorf("create google places request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Goog-Api-Key", s.googlePlacesAPIKey)
	req.Header.Set("X-Goog-FieldMask", "places.id,places.displayName,places.formattedAddress,places.location")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("call google places: %w", err)
	}
	defer resp.Body.Close()

	var googleResp googleTextSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&googleResp); err != nil {
		return nil, fmt.Errorf("decode google places response: %w", err)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		if googleResp.Error != nil && googleResp.Error.Message != "" {
			return nil, fmt.Errorf("google places search failed: %s", googleResp.Error.Message)
		}
		return nil, fmt.Errorf("google places search failed: status %d", resp.StatusCode)
	}

	results := make([]models.LocationSearchResult, 0, len(googleResp.Places))
	for _, place := range googleResp.Places {
		if place.Location.Latitude == 0 && place.Location.Longitude == 0 {
			continue
		}

		label := strings.TrimSpace(place.DisplayName.Text)
		address := strings.TrimSpace(place.FormattedAddress)
		if label == "" {
			label = address
		}
		if address == "" {
			address = label
		}
		if label == "" {
			continue
		}

		results = append(results, models.LocationSearchResult{
			ID:        place.ID,
			Label:     label,
			Address:   address,
			Latitude:  place.Location.Latitude,
			Longitude: place.Location.Longitude,
			Provider:  "google",
		})
	}

	return results, nil
}

// ComputeDistance returns distance in meters between two coordinates
func (s *LocationService) ComputeDistance(lat1, lon1, lat2, lon2 float64) float64 {
	return haversineMeters(lat1, lon1, lat2, lon2)
}

// FormatGoogleType formats Google Places types to human-readable
func FormatGoogleType(types []string) string {
	if len(types) == 0 {
		return "Unknown"
	}
	typeMap := map[string]string{
		"street_address":              "Street Address",
		"route":                       "Route",
		"premise":                     "Premise",
		"establishment":               "Establishment",
		"point_of_interest":           "Point of Interest",
		"locality":                    "Locality",
		"administrative_area_level_1": "City",
		"country":                     "Country",
		"postal_code":                 "Postal Code",
		"subpremise":                  "Subpremise",
	}
	if label, ok := typeMap[types[0]]; ok {
		return label
	}
	return strings.Title(strings.ReplaceAll(types[0], "_", " "))
}
