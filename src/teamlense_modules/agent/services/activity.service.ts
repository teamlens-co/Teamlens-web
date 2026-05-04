import { prisma } from "../../../shared/db/prisma";
import type { ActivityPayload, ActivityRecord } from "../../../shared/types/activity";
import type {
  ClockInPayload,
  ClockOutPayload,
  DashboardAnalytics,
  LocationType,
  WorkSessionRecord,
} from "../../../shared/types/dashboard";
import { LocationService } from "../../web/services/location.service";

type SqlRow = Record<string, unknown>;

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

const asNumber = (value: unknown): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatDbDateForClient = (date: Date): string => {
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return (
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${pad(date.getUTCMilliseconds(), 3)}Z`
  );
};

const asString = (value: unknown): string => {
  if (typeof value === "string") return value;
  if (value instanceof Date) return formatDbDateForClient(value);
  return "";
};

const toDate = (value?: string): Date => {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

// ---------------------------------------------------------------------------
// Core active-time algorithm (pure, testable)
//
// Given a list of (timestamp, isActive) snapshots and the session's
// [clockIn, effectiveEnd] interval, returns active seconds.
//
// Algorithm:
//  1. Sort snapshots by timestamp.
//  2. For each ACTIVE snapshot, count only until the next snapshot timestamp.
//     If there is no next snapshot, apply a short tail (ACTIVE_TAIL_SECONDS).
//  3. Clamp every segment to [sessionStart, sessionEnd].
//
// This ensures idle snapshots stop active time immediately instead of extending
// a long fixed window after activity.
// ---------------------------------------------------------------------------

interface Snapshot {
  ts: number; // unix epoch ms
  isActive: boolean;
}

function computeActiveSeconds(
  snapshots: Snapshot[],
  sessionStart: number,
  sessionEnd: number,
): number {
  if (snapshots.length === 0 || sessionEnd <= sessionStart) return 0;

  const tailMs = ACTIVE_TAIL_SECONDS * 1000;
  const sorted = [...snapshots].sort((a, b) => a.ts - b.ts);

  // Sum active segments between this snapshot and the next snapshot.
  // For the last snapshot, allow only a short tail.
  let totalMs = 0;
  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i]!;
    if (!current.isActive) continue;

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

export class ActivityService {
  private static schemaReady = false;

  private static mapSessionRow(row: SqlRow): WorkSessionRecord {
    const item: WorkSessionRecord = {
      id: asString(row.id),
      userId: asString(row.user_id),
      clockInAt: asString(row.clock_in_at),
    };
    const clockOutAt = asString(row.clock_out_at);
    if (clockOutAt) item.clockOutAt = clockOutAt;
    const locationType = asString(row.location_type);
    if (locationType) item.locationType = locationType as LocationType;
    if (row.latitude != null) item.latitude = asNumber(row.latitude);
    if (row.longitude != null) item.longitude = asNumber(row.longitude);
    return item;
  }

  private static async ensureSchema(): Promise<void> {
    if (this.schemaReady || !prisma.$executeRawUnsafe) return;

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "work_sessions" (
        "id"           TEXT      PRIMARY KEY,
        "user_id"      TEXT      NOT NULL,
        "clock_in_at"  TIMESTAMP NOT NULL,
        "clock_out_at" TIMESTAMP,
        "created_at"   TIMESTAMP NOT NULL DEFAULT NOW(),
        "updated_at"   TIMESTAMP NOT NULL DEFAULT NOW()
      )
    `);

    await prisma.$executeRawUnsafe(`
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

    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "idx_activity_user_captured" ON "activity_logs" ("user_id", "captured_at")',
    );
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "idx_activity_session_captured" ON "activity_logs" ("session_id", "captured_at")',
    );
    await prisma.$executeRawUnsafe(
      'CREATE INDEX IF NOT EXISTS "idx_sessions_user_clockin" ON "work_sessions" ("user_id", "clock_in_at")',
    );

    // Normalize legacy TIMESTAMP columns to TIMESTAMPTZ so JS date math is correct.
    // Existing values are interpreted in the DB server timezone during conversion.
    await prisma.$executeRawUnsafe(`
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

    // Ensure location-related tables/columns exist
    await LocationService.ensureSchema();

    this.schemaReady = true;
  }

  // -------------------------------------------------------------------------
  // Session management (unchanged logic, cleaned up)
  // -------------------------------------------------------------------------

  static async getActiveSession(userId: string): Promise<WorkSessionRecord | null> {
    await this.ensureSchema();
    if (!prisma.$queryRawUnsafe) return null;

    const rows = (await prisma.$queryRawUnsafe(
      `SELECT "id", "user_id", "clock_in_at", "clock_out_at", "location_type", "latitude", "longitude"
       FROM "work_sessions"
       WHERE "user_id" = $1 AND "clock_out_at" IS NULL
       ORDER BY "clock_in_at" DESC
       LIMIT 1`,
      userId,
    )) as SqlRow[];

    return rows[0] ? this.mapSessionRow(rows[0]) : null;
  }

  private static async closeStaleSession(sessionId: string, userId: string): Promise<void> {
    if (!prisma.$executeRawUnsafe) return;

    await prisma.$executeRawUnsafe(
      `UPDATE "work_sessions"
       SET "clock_out_at" = (
         SELECT COALESCE(MAX(COALESCE("captured_at","created_at")), "work_sessions"."clock_in_at")
         FROM "activity_logs"
         WHERE "session_id" = $1
       ),
       "updated_at" = NOW()
       WHERE "id" = $1
         AND "user_id" = $2
         AND "clock_out_at" IS NULL`,
      sessionId,
      userId,
    );
  }

  static async clockIn(payload: ClockInPayload, organizationId?: string): Promise<WorkSessionRecord> {
    await this.ensureSchema();

    const existing = await this.getActiveSession(payload.userId);
    if (existing) {
      const activeAfter = payload.activeAfter ? new Date(payload.activeAfter) : null;
      const existingStartedAt = new Date(existing.clockInAt);

      if (
        activeAfter &&
        !Number.isNaN(activeAfter.getTime()) &&
        !Number.isNaN(existingStartedAt.getTime()) &&
        existingStartedAt.getTime() < activeAfter.getTime()
      ) {
        await this.closeStaleSession(existing.id, payload.userId);
      } else {
        return existing;
      }
    }

    const startedAt = toDate(payload.timestamp);
    const id = crypto.randomUUID();

    // Determine location type if coordinates provided
    let locationType: LocationType | null = null;
    if (
      organizationId &&
      typeof payload.latitude === "number" &&
      typeof payload.longitude === "number"
    ) {
      locationType = await LocationService.determineLocationType(
        organizationId,
        payload.latitude,
        payload.longitude,
        payload.locationSource,
        payload.accuracyMeters,
      );

      console.log(
        `[ClockIn][Location] user=${payload.userId} org=${organizationId} ` +
          `lat=${payload.latitude} lng=${payload.longitude} source=${payload.locationSource ?? "unknown"} ` +
          `accuracy=${payload.accuracyMeters ?? "n/a"} ` +
          `classified=${locationType}`,
      );
    } else {
      console.log(
        `[ClockIn][Location] user=${payload.userId} org=${organizationId ?? "unknown"} ` +
          `lat=${payload.latitude ?? "null"} lng=${payload.longitude ?? "null"} ` +
          `source=${payload.locationSource ?? "unknown"} accuracy=${payload.accuracyMeters ?? "n/a"} classified=unavailable`,
      );
    }

    if (prisma.$executeRawUnsafe) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "work_sessions" ("id","user_id","clock_in_at","latitude","longitude","location_type","created_at","updated_at")
         VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())`,
        id,
        payload.userId,
        startedAt,
        payload.latitude ?? null,
        payload.longitude ?? null,
        locationType,
      );
    }

    const record: WorkSessionRecord = { id, userId: payload.userId, clockInAt: startedAt.toISOString() };
    if (locationType) record.locationType = locationType;
    return record;
  }

  static async clockOut(payload: ClockOutPayload): Promise<WorkSessionRecord | null> {
    await this.ensureSchema();
    if (!prisma.$queryRawUnsafe) return null;

    const endedAt = toDate(payload.timestamp);
    let rows: SqlRow[];

    if (payload.sessionId) {
      rows = (await prisma.$queryRawUnsafe(
        `UPDATE "work_sessions"
         SET "clock_out_at" = $1, "updated_at" = NOW()
         WHERE "id" = $2 AND "user_id" = $3
         RETURNING "id","user_id","clock_in_at","clock_out_at"`,
        endedAt,
        payload.sessionId,
        payload.userId,
      )) as SqlRow[];
    } else {
      rows = (await prisma.$queryRawUnsafe(
        `UPDATE "work_sessions"
         SET "clock_out_at" = $1, "updated_at" = NOW()
         WHERE "id" = (
           SELECT "id" FROM "work_sessions"
           WHERE "user_id" = $2 AND "clock_out_at" IS NULL
           ORDER BY "clock_in_at" DESC LIMIT 1
         )
         RETURNING "id","user_id","clock_in_at","clock_out_at"`,
        endedAt,
        payload.userId,
      )) as SqlRow[];
    }

    const closed = rows[0];
    if (!closed) return null;

    return {
      id: asString(closed.id),
      userId: asString(closed.user_id),
      clockInAt: asString(closed.clock_in_at),
      clockOutAt: asString(closed.clock_out_at),
    };
  }

  static async create(payload: ActivityPayload): Promise<ActivityRecord> {
    await this.ensureSchema();

    const createdAt = new Date();
    const capturedAt = toDate(payload.capturedAt);
    const isActive = payload.mouseMoves > 0 || payload.keyPresses > 0;

    if (prisma.$executeRawUnsafe) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "activity_logs"
           ("user_id","session_id","mouse_moves","key_presses","is_active","captured_at","created_at")
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        payload.userId,
        payload.sessionId ?? null,
        payload.mouseMoves,
        payload.keyPresses,
        isActive,
        capturedAt,
        createdAt,
      );
    }

    const record: ActivityRecord = {
      id: crypto.randomUUID(),
      userId: payload.userId,
      mouseMoves: payload.mouseMoves,
      keyPresses: payload.keyPresses,
      createdAt: createdAt.toISOString(),
    };
    if (payload.capturedAt) record.capturedAt = payload.capturedAt;

    return record;
  }

  static async addManualHours(userId: string, dateStr: string, hours: number): Promise<void> {
    await this.ensureSchema();
    const id = crypto.randomUUID();
    
    // Create clock_in_at starting from 00:00:00 of that date in UTC
    const clockInAt = new Date(`${dateStr}T00:00:00Z`);
    const clockOutAt = new Date(clockInAt.getTime() + hours * 3600000);
    
    if (prisma.$executeRawUnsafe) {
      await prisma.$executeRawUnsafe(
        `INSERT INTO "work_sessions" ("id","user_id","clock_in_at","clock_out_at","location_type","created_at","updated_at")
         VALUES ($1,$2,$3,$4,$5,NOW(),NOW())`,
        id,
        userId,
        clockInAt,
        clockOutAt,
        "manual"
      );
    }
  }

  // -------------------------------------------------------------------------
  // Analytics — fixed active-time calculation
  // -------------------------------------------------------------------------

  static async getAnalytics(userId: string, start: Date, end: Date): Promise<DashboardAnalytics> {
    await this.ensureSchema();

    const range = "custom"; // legacy wrapper if defined securely

    if (!prisma.$queryRawUnsafe) {
      return {
        userId,
        range,
        workSeconds: 0,
        activeSeconds: 0,
        manualSeconds: 0,
        productivityPercent: 0,
        totalMouseMoves: 0,
        totalKeyPresses: 0,
        sessions: [],
        locationStatus: null,
      };
    }

    // ------------------------------------------------------------------
    // 1. Fetch sessions in range
    // ------------------------------------------------------------------
    const sessionRows = (await prisma.$queryRawUnsafe(
      `SELECT "id","user_id","clock_in_at","clock_out_at","location_type","latitude","longitude"
       FROM "work_sessions"
       WHERE "user_id" = $1
         AND "clock_in_at" < $3
         AND COALESCE("clock_out_at", $3) > $2
       ORDER BY "clock_in_at" DESC
       LIMIT 30`,
      userId,
      start,
      end,
    )) as SqlRow[];

    if (sessionRows.length === 0) {
      return {
        userId,
        range,
        workSeconds: 0,
        activeSeconds: 0,
        manualSeconds: 0,
        productivityPercent: 0,
        totalMouseMoves: 0,
        totalKeyPresses: 0,
        sessions: [],
        locationStatus: null,
      };
    }

    // ------------------------------------------------------------------
    // 2. Fetch ALL activity snapshots for these sessions in one query
    //    We pull captured_at + is_active + counts for every log in the time window.
    // ------------------------------------------------------------------
    const sessionIds = sessionRows.map((r) => asString(r.id)).filter(Boolean);

    // Build a parameterised IN list: $3, $4, $5, …
    const idPlaceholders = sessionIds.map((_, i) => `$${i + 3}`).join(",");

    const logRows = (await prisma.$queryRawUnsafe(
      `SELECT "session_id",
              COALESCE("captured_at","created_at") AS "ts",
              "is_active",
              "mouse_moves",
              "key_presses"
       FROM "activity_logs"
       WHERE "session_id" IN (${idPlaceholders})
         AND COALESCE("captured_at","created_at") >= $1
         AND COALESCE("captured_at","created_at") <= $2
       ORDER BY "session_id", "ts"`,
      start,
      end,
      ...sessionIds,
    )) as SqlRow[];

    // Group snapshots by session_id
    const snapshotsBySession = new Map<string, Snapshot[]>();
    let totalMouseMoves = 0;
    let totalKeyPresses = 0;

    for (const row of logRows) {
      const sid = asString(row.session_id);
      const tsDate = row.ts instanceof Date ? row.ts : new Date(asString(row.ts));
      const isActive = row.is_active === true || row.is_active === 1;
      const mouseMoves = asNumber(row.mouse_moves);
      const keyPresses = asNumber(row.key_presses);

      if (!snapshotsBySession.has(sid)) snapshotsBySession.set(sid, []);
      snapshotsBySession.get(sid)!.push({ ts: tsDate.getTime(), isActive });

      totalMouseMoves += mouseMoves;
      totalKeyPresses += keyPresses;
    }

    // ------------------------------------------------------------------
    // 3. For each session compute workSeconds and activeSeconds
    // ------------------------------------------------------------------
    const implicitEndMs = IMPLICIT_END_SECONDS * 1000;
    const rangeStartMs = start.getTime();
    const rangeEndMs = end.getTime();

    let totalWorkMs = 0;
    let totalActiveSeconds = 0;
    let totalManualSeconds = 0;
    const sessions: WorkSessionRecord[] = [];

    for (const row of sessionRows) {
      const sid = asString(row.id);
      const clockInMs = (row.clock_in_at instanceof Date
        ? row.clock_in_at
        : new Date(asString(row.clock_in_at))
      ).getTime();

      let clockOutMs: number;

      if (row.clock_out_at) {
        // Explicitly clocked out
        clockOutMs = (row.clock_out_at instanceof Date
          ? row.clock_out_at
          : new Date(asString(row.clock_out_at))
        ).getTime();
      } else {
        // Session is still open (no clock_out_at).
        // For current-day ranges: use now (rangeEndMs) if there's been recent activity.
        // For historical ranges: cap at the range end or last known activity, whichever is smaller.
        const snaps = snapshotsBySession.get(sid) ?? [];
        const lastActivityMs = snaps.length > 0 ? Math.max(...snaps.map((s) => s.ts)) : clockInMs;

        const now = Date.now();
        // "current" range = the range end is either right now OR later today (e.g. 23:59:59)
        const nowDate = new Date(now);
        const rangeEndDate = new Date(rangeEndMs);
        const isCurrentRange =
          rangeEndMs >= now - 60_000 || // range end is within the last minute
          (rangeEndDate.getFullYear() === nowDate.getFullYear() &&
            rangeEndDate.getMonth() === nowDate.getMonth() &&
            rangeEndDate.getDate() === nowDate.getDate()); // range end is today

        if (isCurrentRange && lastActivityMs >= now - implicitEndMs) {
          // Session is actively running right now
          clockOutMs = now;
        } else {
          // Historical range or stale session: cap at whichever is earlier — last activity or range end
          clockOutMs = Math.min(lastActivityMs, rangeEndMs);
        }
      }

      // Clamp to the requested range
      const sessionStart = Math.max(clockInMs, rangeStartMs);
      const sessionEnd = Math.min(clockOutMs, rangeEndMs);

      if (sessionEnd <= sessionStart) continue;

      const workMs = sessionEnd - sessionStart;

      // Manual vs tracked hours
      if (row.location_type === "manual") {
        totalManualSeconds += Math.floor(workMs / 1000);
      } else {
        totalWorkMs += workMs;
        const snaps = snapshotsBySession.get(sid) ?? [];
        totalActiveSeconds += computeActiveSeconds(snaps, sessionStart, sessionEnd);
      }

      sessions.push(this.mapSessionRow(row));
    }

    const workSeconds = Math.floor(totalWorkMs / 1000);
    // Never let active exceed work (safety clamp)
    const activeSeconds = Math.min(totalActiveSeconds, workSeconds);
    const productivityPercent =
      workSeconds > 0 ? Math.min(100, Math.round((activeSeconds / workSeconds) * 100)) : 0;

    // Compute daily location rollup from all sessions
    const locationTypes = sessionRows.map((r) => asString(r.location_type) || null);
    const locationStatus = LocationService.computeDailyLocationStatus(locationTypes);

    return {
      userId,
      range,
      workSeconds,
      activeSeconds,
      manualSeconds: totalManualSeconds,
      productivityPercent,
      totalMouseMoves,
      totalKeyPresses,
      sessions,
      locationStatus,
    };
  }

  // -------------------------------------------------------------------------
  // Calendar Heatmap — per-day aggregation for a given month
  // Returns array of { date: "YYYY-MM-DD", workSeconds, activeSeconds }
  // -------------------------------------------------------------------------

  static async getCalendarHeatmap(
    userId: string,
    year: number,
    month: number, // 1-based (1 = January)
  ): Promise<{ date: string; workSeconds: number; activeSeconds: number; manualSeconds: number }[]> {
    await this.ensureSchema();
    if (!prisma.$queryRawUnsafe) return [];

    // Build UTC range for the full month
    const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)); // last day of month

    // Fetch all sessions that overlap this month
    const sessionRows = (await prisma.$queryRawUnsafe(
      `SELECT "id","user_id","clock_in_at","clock_out_at","location_type","latitude","longitude"
       FROM "work_sessions"
       WHERE "user_id" = $1
         AND "clock_in_at" < $3
         AND COALESCE("clock_out_at", $3) > $2
       ORDER BY "clock_in_at" ASC
       LIMIT 200`,
      userId,
      start,
      end,
    )) as SqlRow[];

    if (sessionRows.length === 0) return [];

    const sessionIds = sessionRows.map((r) => asString(r.id)).filter(Boolean);
    const idPlaceholders = sessionIds.map((_, i) => `$${i + 3}`).join(",");

    const logRows = (await prisma.$queryRawUnsafe(
      `SELECT "session_id",
              COALESCE("captured_at","created_at") AS "ts",
              "is_active",
              "mouse_moves",
              "key_presses"
       FROM "activity_logs"
       WHERE "session_id" IN (${idPlaceholders})
         AND COALESCE("captured_at","created_at") >= $1
         AND COALESCE("captured_at","created_at") <= $2
       ORDER BY "session_id", "ts"`,
      start,
      end,
      ...sessionIds,
    )) as SqlRow[];

    // Group snapshots by session
    const snapshotsBySession = new Map<string, Snapshot[]>();
    for (const row of logRows) {
      const sid = asString(row.session_id);
      const tsDate = row.ts instanceof Date ? row.ts : new Date(asString(row.ts));
      const isActive = row.is_active === true || row.is_active === 1;
      if (!snapshotsBySession.has(sid)) snapshotsBySession.set(sid, []);
      snapshotsBySession.get(sid)!.push({ ts: tsDate.getTime(), isActive });
    }

    // Aggregate by calendar day (UTC)
    const dayMap = new Map<string, { workMs: number; activeSeconds: number; manualSeconds: number }>();
    const implicitEndMs = IMPLICIT_END_SECONDS * 1000;
    const now = Date.now();

    for (const row of sessionRows) {
      const sid = asString(row.id);
      const clockInMs = (row.clock_in_at instanceof Date
        ? row.clock_in_at
        : new Date(asString(row.clock_in_at))
      ).getTime();

      let clockOutMs: number;
      if (row.clock_out_at) {
        clockOutMs = (row.clock_out_at instanceof Date
          ? row.clock_out_at
          : new Date(asString(row.clock_out_at))
        ).getTime();
      } else {
        const snaps = snapshotsBySession.get(sid) ?? [];
        const lastActivityMs = snaps.length > 0 ? Math.max(...snaps.map((s) => s.ts)) : clockInMs;
        const isCurrentSession = end.getTime() >= now - 60_000;
        clockOutMs = isCurrentSession && lastActivityMs >= now - implicitEndMs
          ? now
          : Math.min(lastActivityMs, end.getTime());
      }

      // Walk each calendar day this session spans
      const sessionStart = Math.max(clockInMs, start.getTime());
      const sessionEnd = Math.min(clockOutMs, end.getTime());
      if (sessionEnd <= sessionStart) continue;

      // Iterate day-by-day within the session span
      let cursor = new Date(sessionStart);
      cursor.setUTCHours(0, 0, 0, 0);

      while (cursor.getTime() <= sessionEnd) {
        const dayStart = cursor.getTime();
        const dayEnd = dayStart + 86_400_000 - 1; // 23:59:59.999 UTC

        const sliceStart = Math.max(sessionStart, dayStart);
        const sliceEnd = Math.min(sessionEnd, dayEnd);
        if (sliceEnd <= sliceStart) {
          cursor = new Date(cursor.getTime() + 86_400_000);
          continue;
        }

        const dateKey = cursor.toISOString().slice(0, 10); // "YYYY-MM-DD"
        const existing = dayMap.get(dateKey) ?? { workMs: 0, activeSeconds: 0, manualSeconds: 0 };

        if (row.location_type === "manual") {
          existing.manualSeconds += Math.floor((sliceEnd - sliceStart) / 1000);
        } else {
          existing.workMs += sliceEnd - sliceStart;
          const snaps = snapshotsBySession.get(sid) ?? [];
          existing.activeSeconds += computeActiveSeconds(snaps, sliceStart, sliceEnd);
        }

        dayMap.set(dateKey, existing);
        cursor = new Date(cursor.getTime() + 86_400_000);
      }
    }

    // Build sorted result array
    return Array.from(dayMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, { workMs, activeSeconds, manualSeconds }]) => ({
        date,
        workSeconds: Math.floor(workMs / 1000),
        activeSeconds: Math.min(activeSeconds, Math.floor(workMs / 1000)),
        manualSeconds,
      }));
  }
}
