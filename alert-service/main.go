package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/teamlens-co/teamlens-web-server/alert-service/api"
	"github.com/teamlens-co/teamlens-web-server/alert-service/core"
	"github.com/teamlens-co/teamlens-web-server/alert-service/db"
	"github.com/teamlens-co/teamlens-web-server/alert-service/detectors"
)

type AlertService struct {
	pubsub    *core.PubSub
	wsHub     *api.WSHub
	sqlite    *db.SQLiteDB
	postgres  *db.PostgresDB
	detectors []detectors.Detector
	ruleChan  chan bool // signal to reload rules
}

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)
	log.Println("[AlertService] Starting...")

	// ── Config ──────────────────────────────────────────────
	port := getEnv("PORT", "5057")
	sqlitePath := getEnv("SQLITE_PATH", "/app/data/screenshot_ai.sqlite3")
	pgConn := getEnv("DATABASE_URL", "postgres://teamlens:teamlens@localhost:5432/teamlens")
	checkInterval := getDuration("CHECK_INTERVAL", "60s")
	orgID := getEnv("ORG_ID", "")

	// ── PubSub ──────────────────────────────────────────────
	pubsub := core.NewPubSub()

	// ── WebSocket Hub ───────────────────────────────────────
	wsHub := api.NewWSHub()
	go wsHub.Run()
	wsHub.SubscribeToAlerts(pubsub)

	// ── Database Connections ────────────────────────────────
	log.Printf("[AlertService] Connecting to SQLite: %s", sqlitePath)
	sqliteDB, err := db.NewSQLiteDB(sqlitePath)
	if err != nil {
		log.Fatalf("[AlertService] SQLite connection failed: %v", err)
	}
	defer sqliteDB.Close()

	log.Println("[AlertService] Connecting to PostgreSQL...")
	pgDB, err := db.NewPostgresDB(pgConn)
	if err != nil {
		log.Fatalf("[AlertService] PostgreSQL connection failed: %v", err)
	}
	defer pgDB.Close()

	// Seed default rules if empty
	if orgID != "" {
		pgDB.SeedDefaultRules(orgID)
	}

	// ── Detectors ───────────────────────────────────────────
	detectorList := detectors.GetRegisteredDetectors()
	log.Printf("[AlertService] Loaded %d detectors", len(detectorList))

	dataReaders := &detectors.DataReaders{
		SQLite:   sqliteDB,
		Postgres: pgDB,
	}

	// ── Alert Engine (background ticker) ────────────────────
	svc := &AlertService{
		pubsub:    pubsub,
		wsHub:     wsHub,
		sqlite:    sqliteDB,
		postgres:  pgDB,
		detectors: detectorList,
		ruleChan:  make(chan bool, 1),
	}

	go svc.runEngine(checkInterval, dataReaders)

	// ── HTTP Routes ────────────────────────────────────────
	rulesHandler := api.NewRulesHandler(pgDB)
	eventsHandler := api.NewAlertEventsHandler(pgDB)

	mux := http.NewServeMux()

	// REST API
	mux.HandleFunc("/api/rules", rulesHandler.HandleRules)
	mux.HandleFunc("/api/rules/", rulesHandler.HandleRule)
	mux.HandleFunc("/api/alerts", eventsHandler.HandleEvents)
	mux.HandleFunc("/api/alerts/", eventsHandler.HandleAck)

	// WebSocket
	mux.HandleFunc("/ws", wsHub.HandleWebSocket)

	// Health
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status":  "ok",
			"service": "alert-service",
			"uptime":  time.Since(startTime).String(),
			"detectors": len(svc.detectors),
		})
	})

	startTime = time.Now()

	// ── Start Server ────────────────────────────────────────
	addr := ":" + port
	log.Printf("[AlertService] HTTP server listening on %s", addr)
	log.Printf("[AlertService] WebSocket endpoint: ws://localhost%s/ws", addr)
	log.Printf("[AlertService] Health: http://localhost%s/health", addr)
	log.Printf("[AlertService] Rules API: http://localhost%s/api/rules", addr)

	if err := http.ListenAndServe(addr, withCORS(mux)); err != nil {
		log.Fatalf("[AlertService] Server error: %v", err)
	}
}

var startTime time.Time

func (s *AlertService) runEngine(interval time.Duration, readers *detectors.DataReaders) {
	log.Printf("[Engine] Alert engine starting, checking every %s", interval)

	// Run immediately on start
	go s.checkAlerts(readers)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for range ticker.C {
		s.checkAlerts(readers)
	}
}

func (s *AlertService) checkAlerts(readers *detectors.DataReaders) {
	log.Println("[Engine] Checking alerts...")

	rules, err := s.postgres.GetEnabledRules("", "")
	if err != nil {
		log.Printf("[Engine] Error fetching rules: %v", err)
		return
	}

	if len(rules) == 0 {
		log.Println("[Engine] No enabled rules found")
		return
	}

	for _, rule := range rules {
		for _, det := range s.detectors {
			if det.Type() != rule.Type {
				continue
			}

			results, err := det.Run(rule, readers)
			if err != nil {
				log.Printf("[Engine] Detector %q error: %v", rule.Type, err)
				continue
			}

			for _, result := range results {
				// Dedup: skip if an unacknowledged alert for same employee+rule already exists
				dupWindow := 24 * time.Hour
				exists, err := s.postgres.HasRecentUnacknowledged(rule.ID, result.EmployeeID, result.RuleType, dupWindow)
				if err != nil {
					log.Printf("[Engine] Dedup check error: %v", err)
				}
				if exists {
					log.Printf("[Engine] Skipping duplicate alert for %s (%s) — unacknowledged alert already exists", result.EmployeeName, result.RuleType)
					continue
				}

				event := core.AlertEvent{
					ID:           uuid.New().String(),
					RuleID:       rule.ID,
					RuleName:     rule.Name,
					RuleType:     result.RuleType,
					Severity:     result.Severity,
					Title:        result.Title,
					Message:      result.Message,
					EmployeeID:   result.EmployeeID,
					EmployeeName: result.EmployeeName,
					Metadata:     result.Metadata,
					TriggeredAt:  time.Now(),
				}

				// Persist to DB
				if err := s.postgres.SaveAlert(&event); err != nil {
					log.Printf("[Engine] Save alert error: %v", err)
				}

				// Publish via PubSub → WebSocket
				s.pubsub.Publish(event)
			}
		}
	}
}

func withCORS(handler http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		handler.ServeHTTP(w, r)
	})
}

func getEnv(key, defaultVal string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return defaultVal
}

func getDuration(key, defaultVal string) time.Duration {
	d, err := time.ParseDuration(getEnv(key, defaultVal))
	if err != nil {
		log.Printf("[Config] Invalid duration for %s: %v, using %s", key, err, defaultVal)
		d, _ = time.ParseDuration(defaultVal)
	}
	return d
}
