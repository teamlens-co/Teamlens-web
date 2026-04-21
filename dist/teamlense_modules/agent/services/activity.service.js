"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ActivityService = void 0;
const prisma_1 = require("../../../shared/db/prisma");
/**
 * Maximum tail (seconds) to count for the last active snapshot when there is no
 * newer snapshot yet. This prevents unlimited extension while still handling
 * short upload gaps.
 */
const ACTIVE_TAIL_SECONDS = 5;
/**
 * A session with no clock-out is considered "still running" only if the most
 * recent activity was within this many seconds. Beyond this we treat the session
 * as implicitly ended at the last activity timestamp.
 */
const IMPLICIT_END_SECONDS = 90;
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const asNumber = (value) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};
const formatDbDateForClient = (date) => {
    const pad = (n, w = 2) => String(n).padStart(w, "0");
    return (`${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
        `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}`);
};
const asString = (value) => {
    if (typeof value === "string")
        return value;
    if (value instanceof Date)
        return formatDbDateForClient(value);
    return "";
};
const toDate = (value) => {
    if (!value)
        return new Date();
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};
function computeActiveSeconds(snapshots, sessionStart, sessionEnd) {
    if (snapshots.length === 0 || sessionEnd <= sessionStart)
        return 0;
    const tailMs = ACTIVE_TAIL_SECONDS * 1000;
    const sorted = [...snapshots].sort((a, b) => a.ts - b.ts);
    // Sum active segments between this snapshot and the next snapshot.
    // For the last snapshot, allow only a short tail.
    let totalMs = 0;
    for (let i = 0; i < sorted.length; i++) {
        const current = sorted[i];
        if (!current.isActive)
            continue;
        const next = sorted[i + 1];
        const rawEnd = next ? next.ts : current.ts + tailMs;
        const clampedStart = Math.max(current.ts, sessionStart);
        const clampedEnd = Math.min(rawEnd, sessionEnd);
        if (clampedEnd > clampedStart) {
            totalMs += clampedEnd - clampedStart;
        }
    }
    return Math.round(totalMs / 1000);
}
// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
class ActivityService {
    static schemaReady = false;
    static mapSessionRow(row) {
        const item = {
            id: asString(row.id),
            userId: asString(row.user_id),
            clockInAt: asString(row.clock_in_at),
        };
        const clockOutAt = asString(row.clock_out_at);
        if (clockOutAt)
            item.clockOutAt = clockOutAt;
        return item;
    }
    static async ensureSchema() {
        if (this.schemaReady || !prisma_1.prisma.$executeRawUnsafe)
            return;
        await prisma_1.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "work_sessions" (
        "id"           TEXT      PRIMARY KEY,
        "user_id"      TEXT      NOT NULL,
        "clock_in_at"  TIMESTAMP NOT NULL,
        "clock_out_at" TIMESTAMP,
        "created_at"   TIMESTAMP NOT NULL DEFAULT NOW(),
        "updated_at"   TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
        await prisma_1.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "activity_logs" (
        "id"          SERIAL    PRIMARY KEY,
        "user_id"     TEXT      NOT NULL,
        "session_id"  TEXT,
        "mouse_moves" INTEGER   NOT NULL,
        "key_presses" INTEGER   NOT NULL,
        "is_active"   BOOLEAN   NOT NULL DEFAULT FALSE,
        "captured_at" TIMESTAMP,
        "created_at"  TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);
        await prisma_1.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "idx_activity_user_captured" ON "activity_logs" ("user_id", "captured_at")');
        await prisma_1.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "idx_activity_session_captured" ON "activity_logs" ("session_id", "captured_at")');
        await prisma_1.prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "idx_sessions_user_clockin" ON "work_sessions" ("user_id", "clock_in_at")');
        // Normalize legacy TIMESTAMP columns to TIMESTAMPTZ so JS date math is correct.
        // Existing values are interpreted in the DB server timezone during conversion.
        await prisma_1.prisma.$executeRawUnsafe(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'work_sessions'
            AND column_name = 'clock_in_at'
            AND data_type = 'timestamp without time zone'
        ) THEN
          ALTER TABLE "work_sessions"
            ALTER COLUMN "clock_in_at" TYPE TIMESTAMPTZ
            USING "clock_in_at" AT TIME ZONE current_setting('TIMEZONE');
        END IF;

        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'work_sessions'
            AND column_name = 'clock_out_at'
            AND data_type = 'timestamp without time zone'
        ) THEN
          ALTER TABLE "work_sessions"
            ALTER COLUMN "clock_out_at" TYPE TIMESTAMPTZ
            USING "clock_out_at" AT TIME ZONE current_setting('TIMEZONE');
        END IF;

        IF EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = 'activity_logs'
            AND column_name = 'captured_at'
            AND data_type = 'timestamp without time zone'
        ) THEN
          ALTER TABLE "activity_logs"
            ALTER COLUMN "captured_at" TYPE TIMESTAMPTZ
            USING "captured_at" AT TIME ZONE current_setting('TIMEZONE');
        END IF;
      END
      $$;
    `);
        this.schemaReady = true;
    }
    // -------------------------------------------------------------------------
    // Session management (unchanged logic, cleaned up)
    // -------------------------------------------------------------------------
    static async getActiveSession(userId) {
        await this.ensureSchema();
        if (!prisma_1.prisma.$queryRawUnsafe)
            return null;
        const rows = (await prisma_1.prisma.$queryRawUnsafe(`SELECT "id", "user_id", "clock_in_at", "clock_out_at"
       FROM "work_sessions"
       WHERE "user_id" = $1 AND "clock_out_at" IS NULL
       ORDER BY "clock_in_at" DESC
       LIMIT 1`, userId));
        return rows[0] ? this.mapSessionRow(rows[0]) : null;
    }
    static async clockIn(payload) {
        await this.ensureSchema();
        const existing = await this.getActiveSession(payload.userId);
        if (existing)
            return existing;
        const startedAt = toDate(payload.timestamp);
        const id = crypto.randomUUID();
        if (prisma_1.prisma.$executeRawUnsafe) {
            await prisma_1.prisma.$executeRawUnsafe(`INSERT INTO "work_sessions" ("id","user_id","clock_in_at","created_at","updated_at")
         VALUES ($1,$2,$3,NOW(),NOW())`, id, payload.userId, startedAt);
        }
        return { id, userId: payload.userId, clockInAt: startedAt.toISOString() };
    }
    static async clockOut(payload) {
        await this.ensureSchema();
        if (!prisma_1.prisma.$queryRawUnsafe)
            return null;
        const endedAt = toDate(payload.timestamp);
        let rows;
        if (payload.sessionId) {
            rows = (await prisma_1.prisma.$queryRawUnsafe(`UPDATE "work_sessions"
         SET "clock_out_at" = $1, "updated_at" = NOW()
         WHERE "id" = $2 AND "user_id" = $3
         RETURNING "id","user_id","clock_in_at","clock_out_at"`, endedAt, payload.sessionId, payload.userId));
        }
        else {
            rows = (await prisma_1.prisma.$queryRawUnsafe(`UPDATE "work_sessions"
         SET "clock_out_at" = $1, "updated_at" = NOW()
         WHERE "id" = (
           SELECT "id" FROM "work_sessions"
           WHERE "user_id" = $2 AND "clock_out_at" IS NULL
           ORDER BY "clock_in_at" DESC LIMIT 1
         )
         RETURNING "id","user_id","clock_in_at","clock_out_at"`, endedAt, payload.userId));
        }
        const closed = rows[0];
        if (!closed)
            return null;
        return {
            id: asString(closed.id),
            userId: asString(closed.user_id),
            clockInAt: asString(closed.clock_in_at),
            clockOutAt: asString(closed.clock_out_at),
        };
    }
    static async create(payload) {
        await this.ensureSchema();
        const createdAt = new Date();
        const capturedAt = toDate(payload.capturedAt);
        const isActive = payload.mouseMoves > 0 || payload.keyPresses > 0;
        if (prisma_1.prisma.$executeRawUnsafe) {
            await prisma_1.prisma.$executeRawUnsafe(`INSERT INTO "activity_logs"
           ("user_id","session_id","mouse_moves","key_presses","is_active","captured_at","created_at")
         VALUES ($1,$2,$3,$4,$5,$6,$7)`, payload.userId, payload.sessionId ?? null, payload.mouseMoves, payload.keyPresses, isActive, capturedAt, createdAt);
        }
        const record = {
            id: crypto.randomUUID(),
            userId: payload.userId,
            mouseMoves: payload.mouseMoves,
            keyPresses: payload.keyPresses,
            createdAt: createdAt.toISOString(),
        };
        if (payload.capturedAt)
            record.capturedAt = payload.capturedAt;
        return record;
    }
    // -------------------------------------------------------------------------
    // Analytics — fixed active-time calculation
    // -------------------------------------------------------------------------
    static async getAnalytics(userId, range) {
        await this.ensureSchema();
        const now = new Date();
        const start = new Date(now);
        if (range === "today") {
            start.setHours(0, 0, 0, 0);
        }
        else {
            const day = start.getDay();
            start.setDate(start.getDate() - (day === 0 ? 6 : day - 1));
            start.setHours(0, 0, 0, 0);
        }
        if (!prisma_1.prisma.$queryRawUnsafe) {
            return {
                userId,
                range,
                workSeconds: 0,
                activeSeconds: 0,
                productivityPercent: 0,
                totalMouseMoves: 0,
                totalKeyPresses: 0,
                sessions: [],
            };
        }
        // ------------------------------------------------------------------
        // 1. Fetch sessions in range
        // ------------------------------------------------------------------
        const sessionRows = (await prisma_1.prisma.$queryRawUnsafe(`SELECT "id","user_id","clock_in_at","clock_out_at"
       FROM "work_sessions"
       WHERE "user_id" = $1
         AND "clock_in_at" < $3
         AND COALESCE("clock_out_at", $3) > $2
       ORDER BY "clock_in_at" DESC
       LIMIT 30`, userId, start, now));
        if (sessionRows.length === 0) {
            return {
                userId,
                range,
                workSeconds: 0,
                activeSeconds: 0,
                productivityPercent: 0,
                totalMouseMoves: 0,
                totalKeyPresses: 0,
                sessions: [],
            };
        }
        // ------------------------------------------------------------------
        // 2. Fetch ALL activity snapshots for these sessions in one query
        //    We pull captured_at + is_active + counts for every log in the time window.
        // ------------------------------------------------------------------
        const sessionIds = sessionRows.map((r) => asString(r.id)).filter(Boolean);
        // Build a parameterised IN list: $3, $4, $5, …
        const idPlaceholders = sessionIds.map((_, i) => `$${i + 3}`).join(",");
        const logRows = (await prisma_1.prisma.$queryRawUnsafe(`SELECT "session_id",
              COALESCE("captured_at","created_at") AS "ts",
              "is_active",
              "mouse_moves",
              "key_presses"
       FROM "activity_logs"
       WHERE "session_id" IN (${idPlaceholders})
         AND COALESCE("captured_at","created_at") >= $1
         AND COALESCE("captured_at","created_at") <= $2
       ORDER BY "session_id", "ts"`, start, now, ...sessionIds));
        // Group snapshots by session_id
        const snapshotsBySession = new Map();
        let totalMouseMoves = 0;
        let totalKeyPresses = 0;
        for (const row of logRows) {
            const sid = asString(row.session_id);
            const tsDate = row.ts instanceof Date ? row.ts : new Date(asString(row.ts));
            const isActive = row.is_active === true || row.is_active === 1;
            const mouseMoves = asNumber(row.mouse_moves);
            const keyPresses = asNumber(row.key_presses);
            if (!snapshotsBySession.has(sid))
                snapshotsBySession.set(sid, []);
            snapshotsBySession.get(sid).push({ ts: tsDate.getTime(), isActive });
            totalMouseMoves += mouseMoves;
            totalKeyPresses += keyPresses;
        }
        // ------------------------------------------------------------------
        // 3. For each session compute workSeconds and activeSeconds
        // ------------------------------------------------------------------
        const implicitEndMs = IMPLICIT_END_SECONDS * 1000;
        const rangeStartMs = start.getTime();
        const rangeEndMs = now.getTime();
        let totalWorkMs = 0;
        let totalActiveSeconds = 0;
        const sessions = [];
        for (const row of sessionRows) {
            const sid = asString(row.id);
            const clockInMs = (row.clock_in_at instanceof Date
                ? row.clock_in_at
                : new Date(asString(row.clock_in_at))).getTime();
            let clockOutMs;
            if (row.clock_out_at) {
                // Explicitly clocked out
                clockOutMs = (row.clock_out_at instanceof Date
                    ? row.clock_out_at
                    : new Date(asString(row.clock_out_at))).getTime();
            }
            else {
                // Still open — find the last activity timestamp for this session
                const snaps = snapshotsBySession.get(sid) ?? [];
                const lastActivityMs = snaps.length > 0 ? Math.max(...snaps.map((s) => s.ts)) : clockInMs;
                if (lastActivityMs >= rangeEndMs - implicitEndMs) {
                    // Recent activity → treat as still running up to now
                    clockOutMs = rangeEndMs;
                }
                else {
                    // Stale open session → implicit end at last activity
                    clockOutMs = lastActivityMs;
                }
            }
            // Clamp to the requested range
            const sessionStart = Math.max(clockInMs, rangeStartMs);
            const sessionEnd = Math.min(clockOutMs, rangeEndMs);
            if (sessionEnd <= sessionStart)
                continue;
            const workMs = sessionEnd - sessionStart;
            totalWorkMs += workMs;
            // Active seconds via the interval-merge algorithm
            const snaps = snapshotsBySession.get(sid) ?? [];
            const activeSeconds = computeActiveSeconds(snaps, sessionStart, sessionEnd);
            totalActiveSeconds += activeSeconds;
            sessions.push(this.mapSessionRow(row));
        }
        const workSeconds = Math.floor(totalWorkMs / 1000);
        // Never let active exceed work (safety clamp)
        const activeSeconds = Math.min(totalActiveSeconds, workSeconds);
        const productivityPercent = workSeconds > 0 ? Math.min(100, Math.round((activeSeconds / workSeconds) * 100)) : 0;
        return {
            userId,
            range,
            workSeconds,
            activeSeconds,
            productivityPercent,
            totalMouseMoves,
            totalKeyPresses,
            sessions,
        };
    }
}
exports.ActivityService = ActivityService;
//# sourceMappingURL=activity.service.js.map