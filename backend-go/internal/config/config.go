package config

import (
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	// Server
	Port         string
	WebAppURL    string
	UploadDir    string
	CORSOrigins  []string

	// Database
	DatabaseURL string

	// JWT
	JWTSecret    string
	JWTAccessTTL time.Duration
	JWTOAgentTTL time.Duration

	// Invite
	InviteTTLHours int

	// Google Places
	GooglePlacesAPIKey string
}

func Load() (*Config, error) {
	// Try to load .env, ignore error if not found
	_ = godotenv.Load()

	cfg := &Config{
		Port:              getEnv("PORT", "8080"),
		WebAppURL:         getEnv("WEB_APP_URL", "http://localhost:3000"),
		UploadDir:         getEnv("UPLOAD_DIR", "./uploads"),
		DatabaseURL:       getEnv("DATABASE_URL", "postgres://teamlens:teamlens@localhost:5432/teamlens"),
		JWTSecret:         getEnv("JWT_SECRET", "dev-secret-change-in-production"),
		InviteTTLHours:    getEnvInt("INVITE_TTL_HOURS", 72),
		GooglePlacesAPIKey: getEnv("GOOGLE_PLACES_API_KEY", ""),
	}

	corsRaw := getEnv("CORS_ORIGINS", "http://localhost:3000,http://localhost:5173")
	if corsRaw != "" {
		for _, s := range strings.Split(corsRaw, ",") {
			s = strings.TrimSpace(s)
			if s != "" {
				cfg.CORSOrigins = append(cfg.CORSOrigins, s)
			}
		}
	}

	accessTTL := getEnv("JWT_ACCESS_TTL", "1h")
	dur, err := parseDuration(accessTTL)
	if err != nil {
		dur = time.Hour
	}
	cfg.JWTAccessTTL = dur

	agentTTL := getEnv("JWT_AGENT_TTL", "30d")
	dur, err = parseDuration(agentTTL)
	if err != nil {
		dur = 30 * 24 * time.Hour
	}
	cfg.JWTOAgentTTL = dur

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}

func parseDuration(s string) (time.Duration, error) {
	// Support simple notation: 1h, 30m, 7d, 30d, etc.
	s = strings.TrimSpace(strings.ToLower(s))
	if strings.HasSuffix(s, "d") {
		numStr := strings.TrimSuffix(s, "d")
		num, err := strconv.Atoi(numStr)
		if err != nil {
			return 0, err
		}
		return time.Duration(num) * 24 * time.Hour, nil
	}
	return time.ParseDuration(s)
}
