package models

import "time"

// ─── Auth ──────────────────────────────────────────────────────────────────

type AuthRole string

const (
	RoleManager    AuthRole = "MANAGER"
	RoleEmployee   AuthRole = "EMPLOYEE"
	RoleSuperAdmin AuthRole = "SUPERADMIN"
)

type AuthTokenType string

const (
	TokenTypeAccess AuthTokenType = "access"
	TokenTypeAgent  AuthTokenType = "agent"
)

type AuthContext struct {
	UserID         string
	OrganizationID string
	Role           AuthRole
	TokenType      AuthTokenType
	Token          string
}

type AccessTokenClaims struct {
	Sub  string   `json:"sub"`
	Org  string   `json:"orgId"`
	Role AuthRole `json:"role"`
	Type string   `json:"type"`
	Iat  int64    `json:"iat,omitempty"`
	Exp  int64    `json:"exp,omitempty"`
}

type AgentTokenClaims struct {
	Sub  string   `json:"sub"`
	Org  string   `json:"orgId"`
	Role AuthRole `json:"role"`
	Type string   `json:"type"`
	Jti  string   `json:"jti"`
	Iat  int64    `json:"iat,omitempty"`
	Exp  int64    `json:"exp,omitempty"`
}

type TokenPair struct {
	AccessToken  string       `json:"accessToken"`
	User         UserResponse `json:"user"`
	Organization OrgResponse  `json:"organization,omitempty"`
}

type AgentLoginResponse struct {
	Token        string       `json:"token"`
	ExpiresAt    string       `json:"expiresAt"`
	User         UserResponse `json:"user"`
	Organization OrgResponse  `json:"organization,omitempty"`
}

type UserResponse struct {
	ID             string        `json:"id"`
	FullName       string        `json:"fullName"`
	Email          string        `json:"email"`
	Role           AuthRole      `json:"role"`
	OrganizationID string        `json:"organizationId,omitempty"`
	Organization   *OrgResponse  `json:"organization,omitempty"`
	Organizations  []OrgResponse `json:"organizations,omitempty"`
	Status         string        `json:"status,omitempty"`
}

type OrgResponse struct {
	ID                           string `json:"id"`
	Name                         string `json:"name"`
	Slug                         string `json:"slug"`
	ScreenshotRetentionDays      int    `json:"screenshotRetentionDays"`
	RecordingRetentionDays       int    `json:"recordingRetentionDays"`
	MinMouseMovesPerActiveWindow int    `json:"minMouseMovesPerActiveWindow"`
	MinKeyPressesPerActiveWindow int    `json:"minKeyPressesPerActiveWindow"`
}

// ─── API Response ──────────────────────────────────────────────────────────

type APIResponse struct {
	Success bool        `json:"success"`
	Data    interface{} `json:"data,omitempty"`
	Message string      `json:"message,omitempty"`
	Issues  interface{} `json:"issues,omitempty"`
}

// ─── Work Session ──────────────────────────────────────────────────────────

type LocationType string

const (
	LocationOffice LocationType = "office"
	LocationRemote LocationType = "remote"
	LocationManual LocationType = "manual"
)

type LocationSource string

const (
	LocSourceGPS LocationSource = "gps"
	LocSourceIP  LocationSource = "ip"
)

type WorkSessionRecord struct {
	ID           string   `json:"id"`
	UserID       string   `json:"userId"`
	ClockInAt    string   `json:"clockInAt"`
	ClockOutAt   string   `json:"clockOutAt,omitempty"`
	LocationType *string  `json:"locationType,omitempty"`
	Latitude     *float64 `json:"latitude,omitempty"`
	Longitude    *float64 `json:"longitude,omitempty"`
}

type ClockInPayload struct {
	UserID         string          `json:"userID"`
	Timestamp      *string         `json:"timestamp,omitempty"`
	ActiveAfter    *string         `json:"activeAfter,omitempty"`
	Latitude       *float64        `json:"latitude,omitempty"`
	Longitude      *float64        `json:"longitude,omitempty"`
	LocationSource *LocationSource `json:"locationSource,omitempty"`
	AccuracyMeters *float64        `json:"accuracyMeters,omitempty"`
}

type ClockOutPayload struct {
	UserID    string  `json:"userID"`
	SessionID *string `json:"sessionId,omitempty"`
	Timestamp *string `json:"timestamp,omitempty"`
	// Where the shift ended, so a completed shift shows both endpoints on the map.
	Latitude  *float64 `json:"latitude,omitempty"`
	Longitude *float64 `json:"longitude,omitempty"`
}

// ─── Activity ──────────────────────────────────────────────────────────────

type ActivityPayload struct {
	UserID     string  `json:"userID"`
	SessionID  *string `json:"sessionId,omitempty"`
	MouseMoves int32   `json:"mouseMoves"`
	KeyPresses int32   `json:"keyPresses"`
	CapturedAt *string `json:"capturedAt,omitempty"`
}

type ActivityRecord struct {
	ID         string `json:"id"`
	UserID     string `json:"userId"`
	MouseMoves int32  `json:"mouseMoves"`
	KeyPresses int32  `json:"keyPresses"`
	CreatedAt  string `json:"createdAt"`
	CapturedAt string `json:"capturedAt,omitempty"`
}

// ─── Dashboard ─────────────────────────────────────────────────────────────

type DashboardAnalytics struct {
	UserID              string              `json:"userId"`
	Range               string              `json:"range"`
	WorkSeconds         int64               `json:"workSeconds"`
	ActiveSeconds       int64               `json:"activeSeconds"`
	IdleSeconds         int64               `json:"idleSeconds"`
	ManualSeconds       int64               `json:"manualSeconds"`
	ProductivityPercent int                 `json:"productivityPercent"`
	TotalMouseMoves     int64               `json:"totalMouseMoves"`
	TotalKeyPresses     int64               `json:"totalKeyPresses"`
	Sessions            []WorkSessionRecord `json:"sessions"`
	LocationStatus      *string             `json:"locationStatus"`
}

type CalendarHeatmapEntry struct {
	Date          string `json:"date"`
	WorkSeconds   int64  `json:"workSeconds"`
	ActiveSeconds int64  `json:"activeSeconds"`
	ManualSeconds int64  `json:"manualSeconds"`
}

type TeamAnalytics struct {
	Team                TeamResponse          `json:"team"`
	Start               string                `json:"start"`
	End                 string                `json:"end"`
	MemberCount         int                   `json:"memberCount"`
	TotalActiveSeconds  int64                 `json:"totalActiveSeconds"`
	TotalTrackedSeconds int64                 `json:"totalTrackedSeconds"`
	AvgActivityPercent  int                   `json:"avgActivityPercent"`
	Members             []TeamMemberAnalytics `json:"members"`
}

type TeamMemberAnalytics struct {
	UserID              string `json:"userId"`
	FullName            string `json:"fullName"`
	Email               string `json:"email"`
	ActiveSeconds       int64  `json:"activeSeconds"`
	TrackedSeconds      int64  `json:"trackedSeconds"`
	WorkSeconds         int64  `json:"workSeconds"`
	ManualSeconds       int64  `json:"manualSeconds"`
	ProductivityPercent int    `json:"productivityPercent"`
}

// ─── Location ──────────────────────────────────────────────────────────────

type LocationSearchResult struct {
	ID        string  `json:"id"`
	Label     string  `json:"label"`
	Address   string  `json:"address"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Provider  string  `json:"provider"`
}

type OfficeLocation struct {
	ID             string  `json:"id"`
	OrganizationID string  `json:"organizationId"`
	Label          string  `json:"label"`
	Latitude       float64 `json:"latitude"`
	Longitude      float64 `json:"longitude"`
	RadiusMeters   int     `json:"radiusMeters"`
	CreatedAt      string  `json:"createdAt"`
}

type UpsertOfficeLocationInput struct {
	Label        string  `json:"label" validate:"required,min=1,max=200"`
	Latitude     float64 `json:"latitude" validate:"required,min=-90,max=90"`
	Longitude    float64 `json:"longitude" validate:"required,min=-180,max=180"`
	RadiusMeters int     `json:"radiusMeters" validate:"required,min=1,max=100000"`
}

// ─── Field tracking ────────────────────────────────────────────────────────

// GeofencePolicy controls what happens when someone clocks in away from every
// office geofence.
type GeofencePolicy string

const (
	GeofenceOff   GeofencePolicy = "off"
	GeofenceWarn  GeofencePolicy = "warn"
	GeofenceBlock GeofencePolicy = "block"
)

// GeofenceMatch is the outcome of testing a coordinate against an org's offices.
type GeofenceMatch struct {
	Inside         bool    `json:"inside"`
	OfficeID       *string `json:"officeId,omitempty"`
	OfficeLabel    *string `json:"officeLabel,omitempty"`
	DistanceMeters float64 `json:"distanceMeters"`
	RadiusMeters   int     `json:"radiusMeters"`
	HasOfficeSetup bool    `json:"hasOfficeSetup"`
}

// TrackingSettings is the org-level field-tracking configuration.
type TrackingSettings struct {
	GeofencePolicy              GeofencePolicy `json:"geofencePolicy"`
	LocationPingIntervalSeconds int            `json:"locationPingIntervalSeconds"`
	TrackLocationWhileClockedIn bool           `json:"trackLocationWhileClockedIn"`
}

// UpdateTrackingSettingsInput is the manager-facing settings payload.
type UpdateTrackingSettingsInput struct {
	GeofencePolicy              *string `json:"geofencePolicy,omitempty"`
	LocationPingIntervalSeconds *int    `json:"locationPingIntervalSeconds,omitempty"`
	TrackLocationWhileClockedIn *bool   `json:"trackLocationWhileClockedIn,omitempty"`
}

// LocationPingInput is a single breadcrumb reported by a client.
type LocationPingInput struct {
	CapturedAt     string   `json:"capturedAt"`
	Latitude       float64  `json:"latitude"`
	Longitude      float64  `json:"longitude"`
	AccuracyMeters *float64 `json:"accuracyMeters,omitempty"`
	AltitudeMeters *float64 `json:"altitudeMeters,omitempty"`
	SpeedMps       *float64 `json:"speedMps,omitempty"`
	HeadingDegrees *float64 `json:"headingDegrees,omitempty"`
	Source         *string  `json:"source,omitempty"`
	BatteryLevel   *int     `json:"batteryLevel,omitempty"`
	IsMoving       *bool    `json:"isMoving,omitempty"`
	// StepCount is cumulative steps since clock-in, as reported by the device
	// pedometer. Clients that cannot count steps omit it.
	StepCount *int `json:"stepCount,omitempty"`
}

// LocationPingBatch is what a client POSTs; batching lets the app buffer
// breadcrumbs while offline and flush them when connectivity returns.
type LocationPingBatch struct {
	SessionID *string             `json:"sessionId,omitempty"`
	Pings     []LocationPingInput `json:"pings"`
}

// LocationPingResult reports what the server did with a batch.
type LocationPingResult struct {
	SessionID      string  `json:"sessionId"`
	Accepted       int     `json:"accepted"`
	Rejected       int     `json:"rejected"`
	Duplicates     int     `json:"duplicates"`
	DistanceMeters float64 `json:"distanceMeters"`
	StepCount      int     `json:"stepCount"`
	GeofenceStatus *string `json:"geofenceStatus,omitempty"`
	NextPingAfterS int     `json:"nextPingAfterSeconds"`
}

// TrackPoint is one breadcrumb as served to the dashboard.
type TrackPoint struct {
	CapturedAt     string   `json:"capturedAt"`
	Latitude       float64  `json:"latitude"`
	Longitude      float64  `json:"longitude"`
	AccuracyMeters *float64 `json:"accuracyMeters,omitempty"`
	SpeedMps       *float64 `json:"speedMps,omitempty"`
	Source         string   `json:"source"`
	BatteryLevel   *int     `json:"batteryLevel,omitempty"`
	SegmentMeters  float64  `json:"segmentMeters"`
	GeofenceStatus *string  `json:"geofenceStatus,omitempty"`
}

// TrackStop is a dwell period detected from the breadcrumb trail.
type TrackStop struct {
	StartedAt       string  `json:"startedAt"`
	EndedAt         string  `json:"endedAt"`
	DurationSeconds int64   `json:"durationSeconds"`
	Latitude        float64 `json:"latitude"`
	Longitude       float64 `json:"longitude"`
	PointCount      int     `json:"pointCount"`
	OfficeLabel     *string `json:"officeLabel,omitempty"`
}

// SessionTrack is the full movement story of one work session.
type SessionTrack struct {
	SessionID      string  `json:"sessionId"`
	UserID         string  `json:"userId"`
	FullName       string  `json:"fullName"`
	ClockInAt      string  `json:"clockInAt"`
	ClockOutAt     *string `json:"clockOutAt,omitempty"`
	LocationType   *string `json:"locationType,omitempty"`
	GeofenceStatus *string `json:"geofenceStatus,omitempty"`
	DistanceMeters float64 `json:"distanceMeters"`
	StepCount      int     `json:"stepCount"`
	MovingSeconds  int64   `json:"movingSeconds"`
	StoppedSeconds int64   `json:"stoppedSeconds"`
	// Clock-in and clock-out coordinates are carried separately from the
	// breadcrumb trail so the map can pin where the shift actually started and
	// ended, even when tracking recorded nothing in between.
	ClockInLat  *float64         `json:"clockInLatitude,omitempty"`
	ClockInLng  *float64         `json:"clockInLongitude,omitempty"`
	ClockOutLat *float64         `json:"clockOutLatitude,omitempty"`
	ClockOutLng *float64         `json:"clockOutLongitude,omitempty"`
	Offices     []OfficeLocation `json:"offices"`
	Points      []TrackPoint     `json:"points"`
	Stops       []TrackStop      `json:"stops"`
}

// LiveEmployeeLocation is one row of the manager live map.
type LiveEmployeeLocation struct {
	UserID         string   `json:"userId"`
	FullName       string   `json:"fullName"`
	Email          string   `json:"email"`
	SessionID      string   `json:"sessionId"`
	ClockInAt      string   `json:"clockInAt"`
	Latitude       *float64 `json:"latitude,omitempty"`
	Longitude      *float64 `json:"longitude,omitempty"`
	LastLocationAt *string  `json:"lastLocationAt,omitempty"`
	StaleSeconds   *int64   `json:"staleSeconds,omitempty"`
	DistanceMeters float64  `json:"distanceMeters"`
	StepCount      int      `json:"stepCount"`
	LocationType   *string  `json:"locationType,omitempty"`
	GeofenceStatus *string  `json:"geofenceStatus,omitempty"`
	BatteryLevel   *int     `json:"batteryLevel,omitempty"`
}

// TrackedSessionRow is one shift in the history list: enough to pick it from a
// list and see where it started and ended without loading the whole trail.
type TrackedSessionRow struct {
	SessionID       string   `json:"sessionId"`
	UserID          string   `json:"userId"`
	FullName        string   `json:"fullName"`
	Email           string   `json:"email"`
	ClockInAt       string   `json:"clockInAt"`
	ClockOutAt      *string  `json:"clockOutAt,omitempty"`
	IsActive        bool     `json:"isActive"`
	DurationSeconds int64    `json:"durationSeconds"`
	DistanceMeters  float64  `json:"distanceMeters"`
	StepCount       int      `json:"stepCount"`
	PointCount      int      `json:"pointCount"`
	LocationType    *string  `json:"locationType,omitempty"`
	GeofenceStatus  *string  `json:"geofenceStatus,omitempty"`
	ClockInLat      *float64 `json:"clockInLatitude,omitempty"`
	ClockInLng      *float64 `json:"clockInLongitude,omitempty"`
	ClockOutLat     *float64 `json:"clockOutLatitude,omitempty"`
	ClockOutLng     *float64 `json:"clockOutLongitude,omitempty"`
}

// FieldSummaryRow aggregates one employee's travel over a date range.
type FieldSummaryRow struct {
	UserID          string  `json:"userId"`
	FullName        string  `json:"fullName"`
	Email           string  `json:"email"`
	SessionCount    int     `json:"sessionCount"`
	DistanceMeters  float64 `json:"distanceMeters"`
	StepCount       int     `json:"stepCount"`
	StopCount       int     `json:"stopCount"`
	TrackedSeconds  int64   `json:"trackedSeconds"`
	OutsideGeofence int     `json:"outsideGeofenceSessions"`
}

// ─── Invite ────────────────────────────────────────────────────────────────

type InviteResponse struct {
	ID         string   `json:"id"`
	Email      string   `json:"email"`
	Role       AuthRole `json:"role"`
	Status     string   `json:"status"`
	ExpiresAt  string   `json:"expiresAt"`
	InviteLink string   `json:"inviteLink"`
}

type ValidateInviteResponse struct {
	Token        string      `json:"token"`
	Email        string      `json:"email"`
	Role         AuthRole    `json:"role"`
	Organization OrgResponse `json:"organization"`
	ExpiresAt    string      `json:"expiresAt"`
}

type AcceptInviteInput struct {
	Token    string `json:"token" validate:"required"`
	FullName string `json:"fullName" validate:"required,min=1,max=200"`
	Password string `json:"password" validate:"required,min=8"`
}

// ─── Team ──────────────────────────────────────────────────────────────────

type TeamResponse struct {
	ID             string         `json:"id"`
	OrganizationID string         `json:"organizationId,omitempty"`
	Name           string         `json:"name"`
	ManagerID      string         `json:"managerId"`
	CreatedAt      string         `json:"createdAt"`
	MemberCount    int            `json:"memberCount"`
	Members        []UserResponse `json:"members,omitempty"`
}

type CreateTeamInput struct {
	Name string `json:"name" validate:"required,min=1,max=200"`
}

type UpdateTeamInput struct {
	Name string `json:"name" validate:"required,min=1,max=200"`
}

type AddMemberInput struct {
	UserID string `json:"userId" validate:"required"`
}

// ─── Recording ─────────────────────────────────────────────────────────────

type ScreenRecording struct {
	ID             string    `json:"id"`
	ManagerID      string    `json:"managerId"`
	EmployeeID     string    `json:"employeeId"`
	OrganizationID string    `json:"organizationId"`
	LiveSessionID  *string   `json:"liveSessionId,omitempty"`
	FilePath       string    `json:"filePath"`
	FileSize       int       `json:"fileSize"`
	DurationMs     int       `json:"durationMs"`
	MimeType       string    `json:"mimeType"`
	RecordedAt     time.Time `json:"recordedAt"`
	CreatedAt      time.Time `json:"createdAt"`
}

type RecordingSessionStatus string

const (
	RecordingStatusRecording RecordingSessionStatus = "recording"
	RecordingStatusUploading RecordingSessionStatus = "uploading"
	RecordingStatusComplete  RecordingSessionStatus = "complete"
	RecordingStatusFailed    RecordingSessionStatus = "failed"
	RecordingStatusExpired   RecordingSessionStatus = "expired"
)

type RecordingSession struct {
	ID             string                 `json:"id"`
	EmployeeID     string                 `json:"employeeId"`
	OrganizationID string                 `json:"organizationId"`
	WorkSessionID  *string                `json:"workSessionId,omitempty"`
	StartedAt      time.Time              `json:"startedAt"`
	StoppedAt      *time.Time             `json:"stoppedAt,omitempty"`
	FPS            int                    `json:"fps"`
	Width          int                    `json:"width"`
	Height         int                    `json:"height"`
	Codec          string                 `json:"codec"`
	MimeType       string                 `json:"mimeType"`
	Status         RecordingSessionStatus `json:"status"`
	TotalSize      int64                  `json:"totalSize"`
	DurationMs     int64                  `json:"durationMs"`
	DeletedAt      *time.Time             `json:"deletedAt,omitempty"`
	CreatedAt      time.Time              `json:"createdAt"`
	UpdatedAt      time.Time              `json:"updatedAt"`
	EmployeeName   string                 `json:"employeeName,omitempty"`
	EmployeeEmail  string                 `json:"employeeEmail,omitempty"`
	ChunkCount     int                    `json:"chunkCount,omitempty"`
	Chunks         []RecordingChunk       `json:"chunks,omitempty"`
}

// RecordingSegment represents a single actual recorded interval within a session.
type RecordingSegment struct {
	SessionID   string    `json:"sessionId"`
	ChunkID     string    `json:"chunkId"`
	ChunkIndex  int       `json:"chunkIndex"`
	StartedAt   time.Time `json:"startedAt"`
	DurationMs  int64     `json:"durationMs"`
	FileSize    int64     `json:"fileSize"`
	PlaybackURL string    `json:"playbackUrl,omitempty"`
}

type RecordingChunk struct {
	ID                 string    `json:"id"`
	RecordingSessionID string    `json:"recordingSessionId"`
	ChunkIndex         int       `json:"chunkIndex"`
	FilePath           string    `json:"filePath,omitempty"`
	FileSize           int64     `json:"fileSize"`
	DurationMs         int64     `json:"durationMs"`
	UploadedAt         time.Time `json:"uploadedAt"`
	CreatedAt          time.Time `json:"createdAt"`
	PlaybackURL        string    `json:"playbackUrl,omitempty"`
}

// ─── Screenshot ────────────────────────────────────────────────────────────

type Screenshot struct {
	ID                string    `json:"id"`
	UserID            string    `json:"userId"`
	SessionID         *string   `json:"sessionId,omitempty"`
	FilePath          string    `json:"filePath"`
	ActiveApplication *string   `json:"activeApplication,omitempty"`
	WindowTitle       *string   `json:"windowTitle,omitempty"`
	Domain            *string   `json:"domain,omitempty"`
	URL               *string   `json:"url,omitempty"`
	EmployeeName      *string   `json:"employeeName,omitempty"`
	ProjectName       *string   `json:"projectName,omitempty"`
	CapturedAt        time.Time `json:"capturedAt"`
	CreatedAt         time.Time `json:"createdAt"`
}

// ─── Live Screen Session ───────────────────────────────────────────────────

type LiveScreenSession struct {
	ID             string     `json:"id"`
	ManagerID      string     `json:"managerId"`
	EmployeeID     string     `json:"employeeId"`
	OrganizationID string     `json:"organizationId"`
	SessionStart   time.Time  `json:"sessionStart"`
	SessionEnd     *time.Time `json:"sessionEnd,omitempty"`
	Status         string     `json:"status"`
}

// ─── Usage / Activity ──────────────────────────────────────────────────────

type ActivityCategory string

const (
	CatProductive   ActivityCategory = "PRODUCTIVE"
	CatUnproductive ActivityCategory = "UNPRODUCTIVE"
	CatNeutral      ActivityCategory = "NEUTRAL"
)

type ActivityTargetType string

const (
	TargetAPP    ActivityTargetType = "APP"
	TargetDOMAIN ActivityTargetType = "DOMAIN"
	TargetURL    ActivityTargetType = "URL"
)

type UsageLogPayload struct {
	OrganizationID  string    `json:"organizationID"`
	UserID          string    `json:"userID"`
	SessionID       *string   `json:"sessionId,omitempty"`
	AppName         string    `json:"appName" validate:"required,min=1,max=200"`
	WindowTitle     *string   `json:"windowTitle,omitempty"`
	Domain          *string   `json:"domain,omitempty"`
	URL             *string   `json:"url,omitempty"`
	DurationSeconds int       `json:"durationSeconds" validate:"min=0"`
	IdleSeconds     int       `json:"idleSeconds" validate:"min=0"`
	IsIdle          bool      `json:"isIdle"`
	CapturedAt      time.Time `json:"capturedAt"`
}

type UsageLogResult struct {
	Category        ActivityCategory `json:"category"`
	TargetType      string           `json:"targetType"`
	DurationSeconds int              `json:"durationSeconds"`
}

type ClassificationRule struct {
	ID          string             `json:"id"`
	TargetType  ActivityTargetType `json:"targetType"`
	TargetValue string             `json:"targetValue"`
	Category    ActivityCategory   `json:"category"`
}

type UpsertRuleInput struct {
	TargetType  ActivityTargetType `json:"targetType" validate:"required"`
	TargetValue string             `json:"targetValue" validate:"required,min=1"`
	Category    ActivityCategory   `json:"category" validate:"required"`
}

type UsageReport struct {
	Items      []UsageReportItem        `json:"items"`
	Categories []UsageCategoryBreakdown `json:"categories"`
	Breakdowns []UsageBreakdownItem     `json:"breakdowns"`
	GroupBy    string                   `json:"groupBy"`
}

type UsageReportItem struct {
	Name            string           `json:"name"`
	TargetType      string           `json:"targetType"`
	AppName         string           `json:"appName"`
	Domain          string           `json:"domain"`
	Category        ActivityCategory `json:"category"`
	DurationSeconds int              `json:"durationSeconds"`
	Samples         int              `json:"samples"`
}

type UsageCategoryBreakdown struct {
	Name            string           `json:"name"`
	Category        ActivityCategory `json:"category"`
	DurationSeconds int              `json:"durationSeconds"`
}

type UsageBreakdownItem struct {
	Name            string `json:"name"`
	EmployeeName    string `json:"employeeName"`
	TeamName        string `json:"teamName"`
	LocationName    string `json:"locationName"`
	DurationSeconds int    `json:"durationSeconds"`
	Samples         int    `json:"samples"`
}

// ─── Manual Time Request ───────────────────────────────────────────────────

type ManualTimeStatus string

const (
	MTSPending  ManualTimeStatus = "PENDING"
	MTSApproved ManualTimeStatus = "APPROVED"
	MTSRejected ManualTimeStatus = "REJECTED"
)

type ManualTimeRequest struct {
	ID              string           `json:"id"`
	OrganizationID  string           `json:"organizationId"`
	UserID          string           `json:"userId"`
	RequestedByID   string           `json:"requestedById"`
	ReviewedByID    *string          `json:"reviewedById,omitempty"`
	StartAt         time.Time        `json:"startAt"`
	EndAt           time.Time        `json:"endAt"`
	DurationSeconds int              `json:"durationSeconds"`
	Reason          string           `json:"reason"`
	Status          ManualTimeStatus `json:"status"`
	ReviewNote      *string          `json:"reviewNote,omitempty"`
	ReviewedAt      *time.Time       `json:"reviewedAt,omitempty"`
	CreatedAt       time.Time        `json:"createdAt"`
	UpdatedAt       time.Time        `json:"updatedAt"`
	EmployeeName    string           `json:"employeeName,omitempty"`
}
