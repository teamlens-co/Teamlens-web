# Recording Feature — Specification for Codex

## Goal
Auto-start screen recording when any team member logs in. No manual action needed. Recordings stored temporarily (1–2 days), then auto-deleted.

---

## Architecture

```
[Windows Agent (Tauri)] --uploads screenshots/video--> [Go Backend] --> [PostgreSQL + Disk]
                                                              |
                                                              +--> [Cron: delete old recordings]
```

---

## 1. Windows Agent Changes (source: `agent/`)

### 1.1 Auto Start Recording on Login

**File: `agent/src/App.tsx`**

Current: Agent requires user to click "Clock In" before screenshots start.

Change:
- On successful login (token restored or user logs in), **auto-clock-in** immediately — no button click.
- Agent should detect Windows user login/logout (via Rust backend) and start/stop recording accordingly.

**Key change areas:**

- Around line 550 (`recoverSession`): When session is recovered, also auto-start screenshots without user clicking "Clock In".
- Around line 80 (`SCREENSHOT_INTERVAL_MIN_MS` / `SCREENSHOT_INTERVAL_MAX_MS`): Reduce interval from 30,000ms to **5,000ms** for smoother recording.
- When user logs out / closes agent → auto-clock-out + stop recording.

### 1.2 Recording State

Add a new state variable:
```ts
const [isRecording, setIsRecording] = useState(false);
```

When recording is active:
- Screenshots captured every 5 seconds
- Activity data sent every 10 seconds (already happening)
- UI shows "Recording 🔴" indicator
- When user is idle for >5 minutes, reduce capture rate to 60s (power save)

### 1.3 Rust Backend (`agent/src-tauri/src/lib.rs`)

Add a Tauri command to detect Windows session lock/unlock events:
```rust
#[tauri::command]
fn get_session_lock_state() -> bool {
    // Use Windows API: GetSystemMetrics(SM_REMOTESESSION) or
    // listen for WTS_SESSION_LOCK / WTS_SESSION_UNLOCK events
}
```

---

## 2. Go Backend Changes (`backend-go/`)

### 2.1 Session Recording Detection

**File: `backend-go/internal/handlers/web/screen_recording_handler.go`** (new)

```go
type ScreenRecordingHandler struct {
    db *sql.DB
}

// GetActiveRecordingSessions — returns employees whose last screenshot was <5 min ago
func (h *ScreenRecordingHandler) GetActiveRecordingSessions(w http.ResponseWriter, r *http.Request)

// GetSessionRecordings — returns compiled recordings for a given date range
func (h *ScreenRecordingHandler) GetSessionRecordings(w http.ResponseWriter, r *http.Request)

// GetSessionScreenshots — returns all screenshots for a specific session in order
func (h *ScreenRecordingHandler) GetSessionScreenshots(w http.ResponseWriter, r *http.Request)
```

### 2.2 Session Detection Logic

Query to find active sessions:
```sql
SELECT 
    employee_id,
    MIN(captured_at) as session_start,
    MAX(captured_at) as session_end,
    COUNT(*) as screenshot_count
FROM screenshots
WHERE organization_id = $1
    AND captured_at >= $2  -- date filter
GROUP BY employee_id, date_trunc('hour', captured_at)  -- or smarter grouping
```

Better approach — detect sessions by gaps:
```sql
-- Find gaps > 30 min between screenshots to split sessions
WITH ordered AS (
    SELECT 
        employee_id,
        captured_at,
        LAG(captured_at) OVER (PARTITION BY employee_id ORDER BY captured_at) as prev_captured
    FROM screenshots
    WHERE organization_id = $1 AND captured_at >= $2
)
SELECT 
    employee_id,
    MIN(captured_at) as session_start,
    MAX(captured_at) as session_end,
    COUNT(*) as screenshot_count
FROM (
    SELECT *, 
        SUM(CASE WHEN prev_captured IS NULL OR 
            EXTRACT(EPOCH FROM (captured_at - prev_captured)) > 1800 
        THEN 1 ELSE 0 END) OVER (ORDER BY employee_id, captured_at) as session_group
    FROM ordered
) grouped
GROUP BY employee_id, session_group
ORDER BY employee_id, session_start;
```

### 2.3 Retention Cleanup (Cron Job)

**File: `backend-go/internal/cron/recording_cleanup.go`** (new)

- Run every 6 hours
- Delete screenshots older than `RECORDING_RETENTION_HOURS` (default: 48 = 2 days)
- Also delete associated files from disk
- Mark as deleted in DB (soft delete for audit trail)

```go
func (j *RecordingCleanupJob) Run() {
    cutoff := time.Now().Add(-j.retentionDuration)
    
    // 1. Find old recordings
    rows, _ := j.db.Query(`
        SELECT id, employee_id, file_path FROM screen_recordings 
        WHERE recorded_at < $1 AND deleted_at IS NULL
    `, cutoff)
    
    // 2. Delete files from disk
    for rows.Next() {
        var id, filePath string
        rows.Scan(&id, &filePath)
        os.Remove(filePath)  // delete video file
        j.db.Exec(`UPDATE screen_recordings SET deleted_at = NOW() WHERE id = $1`, id)
    }
    
    // 3. Delete old screenshots
    j.db.Exec(`DELETE FROM screenshots WHERE captured_at < $1`, cutoff)
}
```

### 2.4 Environment Variables

```
RECORDING_RETENTION_HOURS=48    # Default: 48 hours (2 days)
RECORDING_ENABLED=true          # Master switch
```

---

## 3. Frontend Changes (`frontend/`)

### 3.1 Recording Indicator

**File: `frontend/app/dashboard/layout.tsx` or Live Activity Board**

- When an employee has an active recording session (screenshot < 5 min ago), show a pulsing red dot + "Recording" badge
- Use the `GET /api/web/screen-recordings/active` endpoint

```tsx
<span className="flex items-center gap-1.5 text-[11px] font-medium text-red-500">
  <span className="relative flex h-2 w-2">
    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
  </span>
  Recording
</span>
```

### 3.2 Session Recordings in Recordings Page

**File: `frontend/app/dashboard/recordings/page.tsx`**

Add a new tab/section: "Session Recordings" that lists auto-recorded sessions (grouped screenshots from the 5s capture).

Each session shows:
- Employee name + avatar
- Session start → end time
- Screenshot count
- "Play" button that shows screenshots in sequence (carousel/slideshow)

### 3.3 Screenshot Slideshow Player

**File: `frontend/components/SessionRecordingPlayer.tsx`** (new)

When a manager clicks "Play" on a session recording:
- Show screenshots in chronological order
- Auto-advance every 1-2 seconds
- Controls: Play/Pause, Speed (1x, 2x, 5x), Skip forward/back
- Timeline bar to scrub through the session

---

## 4. Database Changes

New migrations:

```sql
-- 4.1: Add recording metadata to sessions
ALTER TABLE work_sessions ADD COLUMN is_recording BOOLEAN DEFAULT FALSE;
ALTER TABLE work_sessions ADD COLUMN recording_started_at TIMESTAMPTZ;
ALTER TABLE work_sessions ADD COLUMN recording_stopped_at TIMESTAMPTZ;

-- 4.2: Index for cleanup queries
CREATE INDEX idx_screenshots_captured_at ON screenshots(captured_at);
CREATE INDEX idx_screen_recordings_recorded_at ON screen_recordings(recorded_at);

-- 4.3: Soft delete for recordings
ALTER TABLE screen_recordings ADD COLUMN deleted_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE screen_recordings ADD COLUMN retention_hours INTEGER DEFAULT 48;
```

---

## 5. Implementation Order (Recommended)

### Phase 1 — Server-side only (running within 2-3 hours)
1. Add `ScreenRecordingHandler` with session detection queries
2. Add retention cleanup cron job  
3. Frontend: Recording indicator badge on Live Activity Board
4. Frontend: Session recordings tab in recordings page
5. Frontend: Screenshot slideshow player component

### Phase 2 — Agent changes (build on Windows)
6. Agent: Auto clock-in on startup (no manual click)
7. Agent: Reduce screenshot interval to 5s
8. Agent: Auto clock-out on close
9. Agent: UI indicator for recording state

### Phase 3 — Polish
10. Agent: Detect Windows lock/logout events (Rust)
11. Server: ffmpeg timelapse video compilation from screenshots
12. Progressive screenshot frequency (fast when active, slow when idle)

---

## 6. Key Files Reference

### Agent (Tauri + React)
- `agent/src/App.tsx` — main app logic (login, clock-in, screenshots, activity)
- `agent/src-tauri/src/lib.rs` — Rust backend (screenshot capture, input tracking, session lock)
- `agent/src-tauri/tauri.conf.json` — app config
- `agent/src/liveScreen.ts` — WebRTC live screen sharing

### Backend (Go)
- `backend-go/internal/handlers/web/recording_handler.go` — existing recording upload/list
- `backend-go/internal/services/recording_service.go` — recording DB service

### Frontend
- `frontend/app/dashboard/recordings/page.tsx` — recordings page
- `frontend/app/dashboard/layout.tsx` — sidebar + top bar (recording indicator)
