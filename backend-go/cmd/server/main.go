package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/go-chi/chi/v5"
	chimiddleware "github.com/go-chi/chi/v5/middleware"
	"github.com/teamlens/backend-go/internal/config"
	"github.com/teamlens/backend-go/internal/database"
	handlersagent "github.com/teamlens/backend-go/internal/handlers/agent"
	handlersmobile "github.com/teamlens/backend-go/internal/handlers/mobile"
	handlersweb "github.com/teamlens/backend-go/internal/handlers/web"
	"github.com/teamlens/backend-go/internal/middleware"
	"github.com/teamlens/backend-go/internal/services"
)

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	// ─── Config & DB ────────────────────────────────────────────────────────

	cfg, err := config.Load()
	if err != nil {
		slog.Error("Failed to load config", "error", err)
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	pool, err := database.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		slog.Error("Failed to connect to database", "error", err)
		os.Exit(1)
	}
	defer pool.Close()

	// ─── Services ───────────────────────────────────────────────────────────

	jwtSvc := services.NewJWTService(cfg)
	authSvc := services.NewAuthService(pool.Pool, jwtSvc)
	locationSvc := services.NewLocationService(pool.Pool, cfg.GooglePlacesAPIKey)
	dashSvc := services.NewDashboardService(pool.Pool, locationSvc)
	activitySvc := services.NewActivityService(pool.Pool, locationSvc, dashSvc)
	inviteSvc := services.NewInviteService(pool.Pool, jwtSvc, cfg.InviteTTLHours, cfg.WebAppURL)
	teamSvc := services.NewTeamService(pool.Pool, dashSvc)
	recordingSvc := services.NewRecordingService(pool.Pool)
	screenshotSvc := services.NewScreenshotService(pool.Pool)
	usageSvc := services.NewUsageService(pool.Pool)
	agentAuthSvc := services.NewAgentAuthService(pool.Pool, jwtSvc, cfg)

	// ─── Handlers ───────────────────────────────────────────────────────────

	webAuthHandler := handlersweb.NewAuthHandler(authSvc)
	webDashHandler := handlersweb.NewDashboardHandler(dashSvc, activitySvc)
	webInviteHandler := handlersweb.NewInviteHandler(inviteSvc)
	webLocHandler := handlersweb.NewLocationHandler(locationSvc)
	webTeamHandler := handlersweb.NewTeamHandler(teamSvc)
	webRecHandler := handlersweb.NewRecordingHandler(recordingSvc, cfg.UploadDir)
	webSettingsHandler := handlersweb.NewSettingsHandler(pool.Pool, locationSvc, activitySvc, authSvc)

	agentAuthHandler := handlersagent.NewAuthHandler(agentAuthSvc)
	agentActivityHandler := handlersagent.NewActivityHandler(activitySvc)
	agentScreenshotHandler := handlersagent.NewScreenshotHandler(screenshotSvc, cfg.UploadDir)
	agentUsageHandler := handlersagent.NewUsageHandler(usageSvc)

	mobileHandler := handlersmobile.NewHandler()

	// ─── Router ─────────────────────────────────────────────────────────────

	r := chi.NewRouter()

	// Global middleware
	r.Use(chimiddleware.RequestID)
	r.Use(chimiddleware.RealIP)
	r.Use(chimiddleware.Logger)
	r.Use(chimiddleware.Recoverer)
	r.Use(chimiddleware.Timeout(60 * time.Second))
	r.Use(middleware.CORSMiddleware(cfg.CORSOrigins))

	// Serve uploaded files
	fileServer := http.FileServer(http.Dir(cfg.UploadDir))
	r.Handle("/uploads/*", http.StripPrefix("/uploads/", fileServer))

	// Health check
	r.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"message":"OK"}`))
	})

	// ─── Web API (Web App for Managers/Employees) ───────────────────────────

	webr := chi.NewRouter()

	// Public endpoints
	webr.Post("/auth/signup", webAuthHandler.Signup)
	webr.Post("/auth/signup-manager", webAuthHandler.Signup) // Frontend alias
	webr.Post("/auth/login", webAuthHandler.Login)
	webr.Get("/auth/invite/validate", webInviteHandler.ValidateInvite)
	webr.Post("/auth/invite/accept", webInviteHandler.AcceptInvite)
	webr.Get("/invites/validate", webInviteHandler.ValidateInvite)
	webr.Post("/invites/accept", webInviteHandler.AcceptInvite)

	// Protected endpoints
	webr.Group(func(r chi.Router) {
		r.Use(middleware.AuthMiddleware(jwtSvc, pool.Pool))

		r.Get("/auth/me", webAuthHandler.Me)
		r.Get("/auth/users", webAuthHandler.ListUsers)
		r.Get("/users", webAuthHandler.ListUsers)          // Frontend: /api/web/users
		r.Get("/users/{userId}", webAuthHandler.ListUsers) // Frontend: /api/web/users/{id}

		// Invites (manager only)
		r.Post("/invites", webInviteHandler.CreateInvite)
		r.Get("/invites", webInviteHandler.ListInvites)
		r.Post("/invites/{inviteId}/revoke", webInviteHandler.RevokeInvite)
		r.Put("/invites/{inviteId}/revoke", webInviteHandler.RevokeInvite)

		// Teams (manager only)
		r.Post("/teams", webTeamHandler.Create)
		r.Get("/teams", webTeamHandler.List)
		r.Get("/teams/{teamId}", webTeamHandler.Get)
		r.Put("/teams/{teamId}", webTeamHandler.Update)
		r.Delete("/teams/{teamId}", webTeamHandler.Delete)
		r.Get("/teams/{teamId}/members", webTeamHandler.ListMembers)
		r.Post("/teams/{teamId}/members", webTeamHandler.AddMember)
		r.Delete("/teams/{teamId}/members/{userId}", webTeamHandler.RemoveMember)
		r.Get("/teams/{teamId}/analytics", webTeamHandler.GetAnalytics)

		// Location / Office
		r.Post("/office-locations", webLocHandler.UpsertOfficeLocation)
		r.Get("/office-locations", webLocHandler.ListOfficeLocations)
		r.Delete("/office-locations/{locationId}", webLocHandler.DeleteOfficeLocation)
		r.Post("/locations", webLocHandler.UpsertOfficeLocation)                // Frontend alias
		r.Put("/locations", webLocHandler.UpsertOfficeLocation)                 // Frontend alias
		r.Get("/locations", webLocHandler.ListOfficeLocations)                  // Frontend alias
		r.Delete("/locations/{locationId}", webLocHandler.DeleteOfficeLocation) // Frontend alias
		r.Get("/locations/search", webLocHandler.SearchLocations)

		// Dashboard
		r.Get("/analytics", webDashHandler.GetAnalytics)
		r.Get("/analytics/calendar", webDashHandler.GetCalendarHeatmap)

		// Recordings
		r.Post("/recordings", webRecHandler.Upload)
		r.Get("/recordings", webRecHandler.List)
		r.Get("/recordings/{recordingId}", webRecHandler.Get)
		r.Delete("/recordings/{recordingId}", webRecHandler.Delete)
		r.Get("/recordings/serve/{filePath}", webRecHandler.ServeFile)
		r.Get("/recordings/{recordingId}/file", webRecHandler.ServeFileByID)

		// Settings / Manual Time
		r.Post("/manual-hours", webSettingsHandler.AddManualHours)
		r.Post("/manual-time-requests", webSettingsHandler.CreateManualTimeRequest)
		r.Get("/manual-time-requests", webSettingsHandler.ListManualTimeRequests)

		// Agent token management (manager only)
		r.Post("/agent-tokens", webAuthHandler.GenerateAgentToken)

		// Employee management (manager only)
		r.Delete("/employees/{employeeId}", webAuthHandler.DeleteEmployee)

		// Environment
		r.Get("/env", webSettingsHandler.GetPublicEnv)
		r.Get("/users/me", webSettingsHandler.GetUser)

		// Dashboard aliases (Node.js path style)
		r.Get("/dashboard/analytics", webDashHandler.GetAnalytics)
		r.Get("/dashboard/calendar", webDashHandler.GetCalendarHeatmap)
		r.Post("/dashboard/manual-hours", webSettingsHandler.AddManualHours)
		r.Get("/dashboard/manual-time-requests", webSettingsHandler.ListManualTimeRequests)
		r.Post("/dashboard/manual-time-requests", webSettingsHandler.CreateManualTimeRequest)
		r.Patch("/dashboard/manual-time-requests/{id}/review", webSettingsHandler.ReviewManualTimeRequest)

		// Classification rules
		r.Get("/classification-rules", agentUsageHandler.ListRules)
		r.Post("/classification-rules", agentUsageHandler.UpsertRule)

		// Logout (clear cookie on client side, just acknowledge)
		r.Post("/auth/logout", func(w http.ResponseWriter, r *http.Request) {
			http.SetCookie(w, &http.Cookie{
				Name:     "teamlens_access_token",
				Value:    "",
				Path:     "/",
				MaxAge:   -1,
				HttpOnly: true,
				SameSite: http.SameSiteLaxMode,
				Secure:   true,
			})
			middleware.Success(w, http.StatusOK, map[string]string{"status": "logged_out"})
		})

		// Settings
		r.Get("/settings", webSettingsHandler.GetPublicEnv)
		r.Put("/settings", webSettingsHandler.UpdateSettings)
		r.Patch("/settings", webSettingsHandler.UpdateSettings)

		// Attendance
		r.Get("/dashboard/attendance", webDashHandler.GetAttendance)
		r.Get("/dashboard/activity-timeline", webDashHandler.GetActivityTimeline)
		r.Get("/dashboard/usage-report", agentUsageHandler.GetUsageReport)
	})

	r.Mount("/api/web", webr)

	// ─── Agent API ──────────────────────────────────────────────────────────

	agentr := chi.NewRouter()

	// Public
	agentr.Post("/auth/login", agentAuthHandler.Login)

	// Protected
	agentr.Group(func(r chi.Router) {
		r.Use(middleware.AuthMiddleware(jwtSvc, pool.Pool))

		r.Post("/sessions/clock-in", agentActivityHandler.ClockIn)
		r.Post("/sessions/clock-out", agentActivityHandler.ClockOut)
		r.Get("/sessions/active", agentActivityHandler.GetActiveSession)

		r.Post("/activity", agentActivityHandler.PostActivity)
		r.Get("/analytics", agentActivityHandler.GetAnalytics)

		r.Post("/screenshots", agentScreenshotHandler.Upload)
		r.Get("/screenshots", agentScreenshotHandler.List)
		r.Get("/screenshots/{screenshotId}", agentScreenshotHandler.Get)
		r.Delete("/screenshots/{screenshotId}", agentScreenshotHandler.Delete)
		r.Get("/screenshots/serve/{filePath}", agentScreenshotHandler.ServeFile)

		r.Post("/usage/log", agentUsageHandler.CreateUsageLog)
		r.Post("/usage", agentUsageHandler.CreateUsageLog)
		r.Get("/usage/report", agentUsageHandler.GetUsageReport)
		r.Post("/usage/rules", agentUsageHandler.UpsertRule)
		r.Get("/usage/rules", agentUsageHandler.ListRules)
		r.Delete("/usage/rules/{ruleId}", agentUsageHandler.DeleteRule)

		// Deprecated/alias routes
		r.Post("/clock-in", agentActivityHandler.ClockIn)
		r.Post("/clock-out", agentActivityHandler.ClockOut)
		r.Get("/active-session", agentActivityHandler.GetActiveSession)
		r.Get("/screenshots/{id}", agentScreenshotHandler.Get) // Legacy simple path
	})

	r.Mount("/api/agent", agentr)

	// ─── Mobile API ─────────────────────────────────────────────────────────

	mobiler := chi.NewRouter()
	mobiler.Get("/health", mobileHandler.Health)
	r.Mount("/api/mobile", mobiler)

	// ─── Start Server ───────────────────────────────────────────────────────

	addr := fmt.Sprintf(":%s", cfg.Port)
	srv := &http.Server{
		Addr:         addr,
		Handler:      r,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 5 * time.Minute, // Allow file uploads
		IdleTimeout:  120 * time.Second,
	}

	// Graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh

		slog.Info("Shutting down server...")
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer shutdownCancel()

		if err := srv.Shutdown(shutdownCtx); err != nil {
			slog.Error("Server forced to shutdown", "error", err)
		}
	}()

	slog.Info("TeamLens API server starting", "addr", addr)
	if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Error("Server error", "error", err)
		os.Exit(1)
	}

	slog.Info("Server stopped")
}
