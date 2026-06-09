package db

import (
	"database/sql"
	"fmt"
	"log"
	"sync"
	"time"

	_ "modernc.org/sqlite"
)

// SQLiteDB reads screenshot-ai analysis data
type SQLiteDB struct {
	db        *sql.DB
	mu        sync.RWMutex
	cache     map[string]sqliteCache
	cacheTTL  time.Duration
}

type sqliteCache struct {
	value     interface{}
	expiresAt time.Time
}

// NewSQLiteDB opens a connection to the screenshot-ai SQLite database
func NewSQLiteDB(dbPath string) (*SQLiteDB, error) {
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}

	// Disable WAL to avoid locking issues with screenshot-ai's writes
	if _, err := db.Exec("PRAGMA journal_mode=WAL"); err != nil {
		log.Printf("[SQLite] WAL mode not available, using default: %v", err)
	}
	if _, err := db.Exec("PRAGMA busy_timeout=5000"); err != nil {
		log.Printf("[SQLite] busy_timeout not available: %v", err)
	}

	s := &SQLiteDB{
		db:       db,
		cache:    make(map[string]sqliteCache),
		cacheTTL: 30 * time.Second,
	}

	if err := s.ping(); err != nil {
		return nil, fmt.Errorf("sqlite ping: %w", err)
	}
	log.Printf("[SQLite] Connected to %s", dbPath)
	return s, nil
}

func (s *SQLiteDB) ping() error {
	return s.db.Ping()
}

// Close closes the database connection
func (s *SQLiteDB) Close() error {
	return s.db.Close()
}

func (s *SQLiteDB) getCache(key string) (interface{}, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	c, ok := s.cache[key]
	if !ok || time.Now().After(c.expiresAt) {
		return nil, false
	}
	return c.value, true
}

func (s *SQLiteDB) setCache(key string, value interface{}) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cache[key] = sqliteCache{
		value:     value,
		expiresAt: time.Now().Add(s.cacheTTL),
	}
}

// GetContinuousActivity checks how long an employee has been continuously active
func (s *SQLiteDB) GetContinuousActivity(userID string) (activeMinutes int, lastActiveTime string, err error) {
	cacheKey := "continuous:" + userID
	if cached, ok := s.getCache(cacheKey); ok {
		if arr, ok := cached.([]interface{}); ok && len(arr) == 2 {
			if m, ok := arr[0].(int); ok {
				if t, ok := arr[1].(string); ok {
					return m, t, nil
				}
			}
		}
	}

	// Look at consecutive screenshots with non-Distraction focus
	rows, err := s.db.Query(`
		SELECT captured_at, focus_level, category
		FROM screenshot_analysis
		WHERE user_id = ? 
		  AND captured_at >= datetime('now', '-4 hours')
		ORDER BY captured_at DESC
		LIMIT 500
	`, userID)
	if err != nil {
		return 0, "", fmt.Errorf("query continuous activity: %w", err)
	}
	defer rows.Close()

	var timestamps []time.Time
	var focusLevels []string
	var categories []string

	for rows.Next() {
		var capturedStr, focus, cat string
		if err := rows.Scan(&capturedStr, &focus, &cat); err != nil {
			continue
		}
		t, parseErr := time.Parse("2006-01-02 15:04:05", capturedStr)
		if parseErr != nil {
			t, parseErr = time.Parse(time.RFC3339, capturedStr)
			if parseErr != nil {
				continue
			}
		}
		timestamps = append(timestamps, t)
		focusLevels = append(focusLevels, focus)
		categories = append(categories, cat)
	}

	if len(timestamps) == 0 {
		s.setCache(cacheKey, []interface{}{0, ""})
		return 0, "", nil
	}

	// Walk from most recent, count consecutive non-problematic entries
	// "Problematic" = Distraction focus OR Leisure category
	consecutiveMin := 0
	lastSeen := timestamps[0]
	lastSeenStr := lastSeen.Format("15:04")

	for i := 0; i < len(timestamps)-1; i++ {
		isProblematic := focusLevels[i] == "Distraction" || focusLevels[i] == "Leisure" || categories[i] == "Leisure"
		if isProblematic {
			break
		}
		diff := timestamps[i].Sub(timestamps[i+1])
		if diff > 5*time.Minute {
			// Gap > 5 min means they stopped working
			break
		}
		consecutiveMin += int(diff.Minutes())
	}

	result := []interface{}{consecutiveMin, lastSeenStr}
	s.setCache(cacheKey, result)
	if consecutiveMin < 0 {
		consecutiveMin = 0
	}
	return consecutiveMin, lastSeenStr, nil
}

// GetIdleTime checks how long an employee has been idle
func (s *SQLiteDB) GetIdleTime(userID string) (idleMinutes int, lastSeenTime string, err error) {
	cacheKey := "idle:" + userID
	if cached, ok := s.getCache(cacheKey); ok {
		if arr, ok := cached.([]interface{}); ok && len(arr) == 2 {
			if m, ok := arr[0].(int); ok {
				if t, ok := arr[1].(string); ok {
					return m, t, nil
				}
			}
		}
	}

	// Get the most recent screenshot
	row := s.db.QueryRow(`
		SELECT captured_at FROM screenshot_analysis
		WHERE user_id = ?
		ORDER BY captured_at DESC LIMIT 1
	`, userID)

	var capturedStr string
	if err := row.Scan(&capturedStr); err != nil {
		if err == sql.ErrNoRows {
			s.setCache(cacheKey, []interface{}{0, ""})
			return 0, "", nil
		}
		return 0, "", fmt.Errorf("query idle: %w", err)
	}

	lastSeen, parseErr := time.Parse("2006-01-02 15:04:05", capturedStr)
	if parseErr != nil {
		lastSeen, parseErr = time.Parse(time.RFC3339, capturedStr)
		if parseErr != nil {
			return 0, capturedStr, nil
		}
	}

	consecutiveIdleMin := int(time.Since(lastSeen).Minutes())
	if consecutiveIdleMin < 0 {
		consecutiveIdleMin = 0
	}

	lastSeenStr := lastSeen.Format("15:04")
	s.setCache(cacheKey, []interface{}{consecutiveIdleMin, lastSeenStr})
	return consecutiveIdleMin, lastSeenStr, nil
}

// GetLatestScore returns the latest productivity score
func (s *SQLiteDB) GetLatestScore(userID string) (int, error) {
	cacheKey := "score:" + userID
	if cached, ok := s.getCache(cacheKey); ok {
		if score, ok := cached.(int); ok {
			return score, nil
		}
	}

	var score int
	err := s.db.QueryRow(`
		SELECT productivity_score FROM periodic_summaries
		WHERE user_id = ?
		ORDER BY end_iso DESC LIMIT 1
	`, userID).Scan(&score)
	if err != nil {
		if err == sql.ErrNoRows {
			s.setCache(cacheKey, 0)
			return 0, nil
		}
		return -1, fmt.Errorf("query score: %w", err)
	}

	s.setCache(cacheKey, score)
	return score, nil
}

// GetSocialMediaTime returns minutes spent on leisure today
func (s *SQLiteDB) GetSocialMediaTime(userID string) (int, error) {
	cacheKey := "social:" + userID
	if cached, ok := s.getCache(cacheKey); ok {
		if m, ok := cached.(int); ok {
			return m, nil
		}
	}

	today := time.Now().Format("2006-01-02")
	var count int
	err := s.db.QueryRow(`
		SELECT COUNT(*) FROM screenshot_analysis
		WHERE user_id = ? AND category = 'Leisure'
		AND captured_at >= ?
	`, userID, today).Scan(&count)
	if err != nil {
		return -1, fmt.Errorf("query social media: %w", err)
	}

	// Each screenshot ~30s interval, but dampen estimate (~3 min per leisure screenshot)
	minutes := count * 3
	s.setCache(cacheKey, minutes)
	return minutes, nil
}

// HasDeepWorkToday checks if any deep work was logged today
func (s *SQLiteDB) HasDeepWorkToday(userID string) (bool, error) {
	cacheKey := "deepwork:" + userID
	if cached, ok := s.getCache(cacheKey); ok {
		if b, ok := cached.(bool); ok {
			return b, nil
		}
	}

	today := time.Now().Format("2006-01-02")
	var count int
	err := s.db.QueryRow(`
		SELECT COUNT(*) FROM screenshot_analysis
		WHERE user_id = ? AND focus_level = 'Deep Work'
		AND captured_at >= ?
	`, userID, today).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("query deep work: %w", err)
	}

	hasDeepWork := count >= 6 // at least ~3 min of deep work (6 × 30s)
	s.setCache(cacheKey, hasDeepWork)
	return hasDeepWork, nil
}

// GetAllEmployeeIDs returns unique user IDs with data today
func (s *SQLiteDB) GetAllEmployeeIDs() ([]string, error) {
	cacheKey := "allemployees"
	if cached, ok := s.getCache(cacheKey); ok {
		if ids, ok := cached.([]string); ok {
			return ids, nil
		}
	}

	today := time.Now().Format("2006-01-02")
	rows, err := s.db.Query(`
		SELECT DISTINCT user_id FROM screenshot_analysis
		WHERE captured_at >= ?
		ORDER BY user_id
	`, today)
	if err != nil {
		return nil, fmt.Errorf("query employees: %w", err)
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			continue
		}
		ids = append(ids, id)
	}

	s.setCache(cacheKey, ids)
	return ids, nil
}

// GetUnproductiveTime returns minutes spent on unproductive apps/websites today
func (s *SQLiteDB) GetUnproductiveTime(userID string) (int, error) {
	cacheKey := "unproductive:" + userID
	if cached, ok := s.getCache(cacheKey); ok {
		if m, ok := cached.(int); ok {
			return m, nil
		}
	}

	today := time.Now().Format("2006-01-02")
	// Count screenshots with Explicit/Unproductive category, each ~30s = 1 min estimate
	var count int
	err := s.db.QueryRow(`
		SELECT COUNT(*) FROM screenshot_analysis
		WHERE user_id = ? AND category IN ('Explicit', 'Leisure')
		AND captured_at >= ?
	`, userID, today).Scan(&count)
	if err != nil {
		return -1, fmt.Errorf("query unproductive: %w", err)
	}

	// Each categorized screenshot ~2 min (dampened)
	minutes := count * 2
	s.setCache(cacheKey, minutes)
	return minutes, nil
}
